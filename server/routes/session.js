const express = require('express');
const crypto = require('crypto');
const supabase = require('../lib/supabase.js');
const verifyToken = require('../middleware/verifyToken');


const router = express.Router();

const signQrPayload = (sessionId, expiresAt) => {
  return crypto.createHmac('sha256', process.env.QR_SECRET).update(`${sessionId}.${expiresAt}`).digest('hex');
};

const parseTimeToMinutes = (value) => {
  const [hours, minutes] = String(value).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const isNowInsideSlot = (slot) => {
  const now = new Date();
  const day = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const start = parseTimeToMinutes(slot.start_time);
  const end = parseTimeToMinutes(slot.end_time);

  if (start === null || end === null) {
    return false;
  }

  return slot.day_of_week === day && nowMinutes >= start && nowMinutes <= end;
};

router.post('/create', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only teachers or admins can create sessions.' });
    }

    const {
      subject,
      subjectId,
      durationMinutes = 10,
      timetableSlotId,
      latitude,
      longitude,
      radiusMeters,
      requiresSelfie = false
    } = req.body;

    if (!subject) {
      return res.status(400).json({ message: 'Subject is required.' });
    }

    const safeDuration = Math.max(1, Math.min(180, Number(durationMinutes) || 10));
    const expiresAt = new Date(Date.now() + safeDuration * 60 * 1000).toISOString();

    if (subjectId) {
      const { data: assignment, error: assignmentError } = await supabase
        .from('subject_teachers')
        .select('id, teacher_id')
        .eq('subject_id', subjectId)
        .eq('teacher_id', req.user.id)
        .maybeSingle();

      if (assignmentError) {
        return res.status(500).json({ message: 'Failed to validate subject assignment.', error: assignmentError.message });
      }

      if (!assignment && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'This subject is not assigned to your account.' });
      }
    }

    let resolvedSlotId = timetableSlotId || null;
    let slotGeo = { latitude: null, longitude: null, radiusMeters: null };

    if (resolvedSlotId) {
      const { data: slot, error: slotError } = await supabase
        .from('timetable_slots')
        .select('id, teacher_id, subject_id, day_of_week, start_time, end_time, latitude, longitude, radius_meters')
        .eq('id', resolvedSlotId)
        .single();

      if (slotError || !slot) {
        return res.status(404).json({ message: 'Timetable slot not found.' });
      }

      if (req.user.role !== 'admin' && slot.teacher_id !== req.user.id) {
        return res.status(403).json({ message: 'You can only start sessions from your own timetable slot.' });
      }

      if (subjectId && slot.subject_id !== subjectId) {
        return res.status(400).json({ message: 'Timetable slot does not match provided subject.' });
      }

      if (!isNowInsideSlot(slot)) {
        return res.status(409).json({ message: 'Session cannot be created outside the scheduled timetable slot.' });
      }

      slotGeo = {
        latitude: slot.latitude,
        longitude: slot.longitude,
        radiusMeters: slot.radius_meters
      };
    }

    const { data: activeSessions, error: activeError } = await supabase
      .from('sessions')
      .select('id')
      .eq('teacher_id', req.user.id)
      .gt('expires_at', new Date().toISOString())
      .limit(1);

    if (activeError) {
      return res.status(500).json({ message: 'Failed to validate active sessions.', error: activeError.message });
    }

    if ((activeSessions || []).length > 0) {
      return res.status(409).json({ message: 'You already have an active session. End it before creating another.' });
    }

    const resolvedLatitude = latitude ?? slotGeo.latitude;
    const resolvedLongitude = longitude ?? slotGeo.longitude;
    const resolvedRadius = radiusMeters ?? slotGeo.radiusMeters;

    const { data, error } = await supabase
    .from('sessions')
    .insert([{
      teacher_id: req.user.id,
      subject,
      subject_id: subjectId || null,
      timetable_slot_id: resolvedSlotId,
      expires_at: expiresAt,
      latitude: resolvedLatitude ?? null,
      longitude: resolvedLongitude ?? null,
      radius_meters: resolvedRadius ?? null,
      requires_selfie: Boolean(requiresSelfie)
    }]).select('id, subject, subject_id, created_at, expires_at, latitude, longitude, radius_meters, requires_selfie')
      .single();

    if (error) {
    console.log("SUPABASE INSERT ERROR:", error); // 👈 ADD THIS
    console.log("USING KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 10));
    return res.status(500).json({
      message: 'Unable to create session.',
      error: error.message
     
    });
  }

    const qrPayload = {
      sessionId: data.id,
      expiresAt,
      signature: signQrPayload(data.id, expiresAt)
    };

    const sessionResponse = {
      ...data,
      expires_at: expiresAt
    };

    return res.status(201).json({
      session: sessionResponse,
      qrPayload
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error creating session.', error: error.message });
  }
});

router.get('/history', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only teachers or admins can view session history.' });
    }

    const teacherId = req.user.role === 'admin' ? req.query.teacherId || req.user.id : req.user.id;

    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, subject, subject_id, created_at, expires_at, is_notifications_sent')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });

    if (sessionsError) {
      return res.status(500).json({ message: 'Failed to fetch session history.', error: sessionsError.message });
    }

    const sessionsWithCounts = await Promise.all(
      (sessions || []).map(async (session) => {
        const { count, error: countError } = await supabase
          .from('attendance')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', session.id);

        if (countError) {
          return { ...session, attendance_count: 0 };
        }

        return { ...session, attendance_count: count || 0 };
      })
    );

    return res.status(200).json({ sessions: sessionsWithCounts });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while loading session history.', error: error.message });
  }
});

router.get('/active', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only teachers or admins can view active sessions.' });
    }

    const nowIso = new Date().toISOString();

    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id, subject, subject_id, created_at, expires_at, latitude, longitude, radius_meters, requires_selfie')
      .eq('teacher_id', req.user.id)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ message: 'Failed to fetch active sessions.', error: error.message });
    }

    return res.status(200).json({ sessions: sessions || [] });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while loading active sessions.', error: error.message });
  }
});

router.patch('/:sessionId/extend', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only teachers or admins can extend sessions.' });
    }

    const { sessionId } = req.params;
    const extraMinutes = Number(req.body?.extraMinutes);

    if (!Number.isFinite(extraMinutes) || extraMinutes < 1 || extraMinutes > 120) {
      return res.status(400).json({ message: 'extraMinutes must be between 1 and 120.' });
    }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, teacher_id, expires_at')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    if (req.user.role !== 'admin' && session.teacher_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only extend your own sessions.' });
    }

    const currentExpiry = new Date(session.expires_at).getTime();
    const baseTime = Math.max(Date.now(), currentExpiry);
    const nextExpiryIso = new Date(baseTime + extraMinutes * 60 * 1000).toISOString();

    const { data: updated, error: updateError } = await supabase
      .from('sessions')
      .update({ expires_at: nextExpiryIso })
      .eq('id', sessionId)
      .select('id, subject, created_at, expires_at')
      .single();

    if (updateError || !updated) {
      return res.status(500).json({ message: 'Failed to extend session.', error: updateError?.message });
    }

    return res.status(200).json({
      message: `Session extended by ${extraMinutes} minute(s).`,
      session: updated,
      qrPayload: {
        sessionId: updated.id,
        expiresAt: updated.expires_at,
        signature: signQrPayload(updated.id, updated.expires_at)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while extending session.', error: error.message });
  }
});

router.patch('/:sessionId/end', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only teachers or admins can end sessions.' });
    }

    const { sessionId } = req.params;

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, teacher_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    if (req.user.role !== 'admin' && session.teacher_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only end your own sessions.' });
    }

    const endTime = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from('sessions')
      .update({ expires_at: endTime })
      .eq('id', sessionId)
      .select('id, subject, created_at, expires_at')
      .single();

    if (updateError || !updated) {
      return res.status(500).json({ message: 'Failed to end session.', error: updateError?.message });
    }

    return res.status(200).json({ message: 'Session ended successfully.', session: updated });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while ending session.', error: error.message });
  }
});

module.exports = router;
