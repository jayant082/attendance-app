const express = require('express');
const crypto = require('crypto');
const supabase = require('../lib/supabase');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

const signQrPayload = (sessionId, expiresAt) => {
  return crypto.createHmac('sha256', process.env.QR_SECRET).update(`${sessionId}.${expiresAt}`).digest('hex');
};

const safeCompare = (a, b) => {
  if (!a || !b) {
    return false;
  }

  const first = Buffer.from(a, 'hex');
  const second = Buffer.from(b, 'hex');

  if (first.length !== second.length) {
    return false;
  }

  return crypto.timingSafeEqual(first, second);
};

const parseIsoTimestamp = (value) => {
  if (!value || typeof value !== 'string') {
    return Number.NaN;
  }

  const trimmed = value.trim();
  const hasTimezone = /(?:Z|[+\-]\d{2}:\d{2})$/i.test(trimmed);
  return Date.parse(hasTimezone ? trimmed : `${trimmed}Z`);
};

const toRadians = (value) => (value * Math.PI) / 180;

const distanceInMeters = (lat1, lon1, lat2, lon2) => {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
};

const logIncident = async (payload) => {
  await supabase.from('incident_logs').insert(payload);
};

const validateLocation = (session, studentLatitude, studentLongitude) => {
  if (
    session.latitude === null ||
    session.longitude === null ||
    session.radius_meters === null ||
    studentLatitude === undefined ||
    studentLongitude === undefined
  ) {
    return { ok: true, distance: null };
  }

  const distance = distanceInMeters(Number(session.latitude), Number(session.longitude), Number(studentLatitude), Number(studentLongitude));
  return { ok: distance <= Number(session.radius_meters), distance };
};

const registerDevice = async (studentId, deviceId) => {
  if (!deviceId) return;

  const { data: existing } = await supabase
    .from('attendance_device_registry')
    .select('id')
    .eq('student_id', studentId)
    .eq('device_id', deviceId)
    .maybeSingle();

  if (!existing) {
    await supabase.from('attendance_device_registry').insert({
      student_id: studentId,
      device_id: deviceId
    });
    return;
  }

  await supabase.from('attendance_device_registry').update({ last_seen_at: new Date().toISOString() }).eq('id', existing.id);
};

const ensureEnrolled = async (user, session) => {
  if (!session.subject_id) {
    return true;
  }

  const { data, error } = await supabase
    .from('enrollments')
    .select('id')
    .eq('subject_id', session.subject_id)
    .eq('student_id', user.id)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data);
};

const markAttendanceFromPayload = async (user, parsedPayload, extraData = {}) => {
  const { sessionId, expiresAt, signature } = parsedPayload;

  if (!sessionId || !expiresAt || !signature) {
    return { status: 400, body: { message: 'QR payload is missing required fields.' } };
  }

  const qrExpiryMs = parseIsoTimestamp(expiresAt);
  if (Number.isNaN(qrExpiryMs)) {
    return { status: 400, body: { message: 'Invalid expiry timestamp in QR payload.' } };
  }

  if (qrExpiryMs < Date.now()) {
    return { status: 410, body: { message: 'Session has expired. Attendance cannot be marked.' } };
  }

  const expectedSignature = signQrPayload(sessionId, expiresAt);
  if (!safeCompare(signature, expectedSignature)) {
    return { status: 401, body: { message: 'QR secret verification failed.' } };
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, subject_id, teacher_id, expires_at, latitude, longitude, radius_meters, requires_selfie')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return { status: 404, body: { message: 'Session not found.' } };
  }

  const sessionExpiryMs = parseIsoTimestamp(session.expires_at);
  if (Number.isNaN(sessionExpiryMs)) {
    return { status: 500, body: { message: 'Invalid expiry timestamp in session record.' } };
  }

  if (sessionExpiryMs < Date.now()) {
    return { status: 410, body: { message: 'Session expired based on server record.' } };
  }

  const isEnrolled = await ensureEnrolled(user, session);
  if (!isEnrolled) {
    return { status: 403, body: { message: 'You are not enrolled for this subject.' } };
  }

  const { latitude, longitude, deviceId, selfieHash } = extraData;

  const locationStatus = validateLocation(session, latitude, longitude);
  if (!locationStatus.ok) {
    await logIncident({
      session_id: session.id,
      student_id: user.id,
      event_type: 'geofence_violation',
      details: { latitude, longitude, distanceMeters: Math.round(locationStatus.distance || 0) }
    });
    return {
      status: 403,
      body: { message: `You are outside the allowed attendance radius (${Math.round(locationStatus.distance || 0)}m).` }
    };
  }

  if (session.requires_selfie && !selfieHash) {
    return { status: 400, body: { message: 'Selfie proof is required for this session.' } };
  }

  const { data: existing, error: existingError } = await supabase
    .from('attendance')
    .select('id')
    .eq('session_id', sessionId)
    .eq('student_id', user.id)
    .maybeSingle();

  if (existingError) {
    return { status: 500, body: { message: 'Error checking existing attendance.', error: existingError.message } };
  }

  if (existing) {
    return { status: 409, body: { message: 'Attendance already marked for this session.' } };
  }

  await registerDevice(user.id, deviceId);

  const { data: inserted, error: insertError } = await supabase
    .from('attendance')
    .insert({
      session_id: sessionId,
      student_id: user.id,
      student_name: user.studentName || 'Student',
      roll_number: user.rollNumber || 'N/A',
      device_id: deviceId || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      selfie_hash: selfieHash || null
    })
    .select('id, session_id, student_id, student_name, roll_number, marked_at')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return { status: 409, body: { message: 'Attendance already marked for this session.' } };
    }
    return { status: 500, body: { message: 'Failed to mark attendance.', error: insertError.message } };
  }

  return { status: 201, body: { message: 'Attendance marked successfully.', attendance: inserted } };
};

router.post('/mark', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Only students can mark attendance.' });
    }

    const { qrData, latitude, longitude, deviceId, selfieHash } = req.body;
    if (!qrData) {
      return res.status(400).json({ message: 'QR payload is required.' });
    }

    let parsedPayload;

    try {
      parsedPayload = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
    } catch (_error) {
      return res.status(400).json({ message: 'Invalid QR payload format.' });
    }

    const result = await markAttendanceFromPayload(req.user, parsedPayload, {
      latitude,
      longitude,
      deviceId,
      selfieHash
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({ message: 'Server error while marking attendance.', error: error.message });
  }
});

router.post('/mark-manual', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Only students can mark attendance.' });
    }

    const { payload, latitude, longitude, deviceId, selfieHash } = req.body;
    if (!payload) {
      return res.status(400).json({ message: 'Payload is required.' });
    }

    let parsedPayload;
    try {
      parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;
    } catch (_error) {
      return res.status(400).json({ message: 'Invalid payload format.' });
    }

    const result = await markAttendanceFromPayload(req.user, parsedPayload, {
      latitude,
      longitude,
      deviceId,
      selfieHash
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({ message: 'Server error while marking attendance.', error: error.message });
  }
});

router.get('/:sessionId', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only teachers can view attendance reports.' });
    }

    const { sessionId } = req.params;

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, teacher_id, subject, created_at, expires_at')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    if (req.user.role !== 'admin' && session.teacher_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only view your own session reports.' });
    }

    const { data: rows, error: attendanceError } = await supabase
      .from('attendance')
      .select('id, student_id, student_name, roll_number, marked_at')
      .eq('session_id', sessionId)
      .order('marked_at', { ascending: true });

    if (attendanceError) {
      return res.status(500).json({ message: 'Failed to fetch attendance report.', error: attendanceError.message });
    }

    return res.status(200).json({
      session,
      attendance: rows || []
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while loading report.', error: error.message });
  }
});

router.post('/manual-mark', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only teachers can add manual attendance.' });
    }

    const { sessionId, studentName, rollNumber, reason } = req.body;

    if (!sessionId || !studentName || !rollNumber || !reason) {
      return res.status(400).json({ message: 'sessionId, studentName, rollNumber, and reason are required.' });
    }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, teacher_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    if (req.user.role !== 'admin' && session.teacher_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only update your own sessions.' });
    }

    const { data: existingByRoll, error: existingError } = await supabase
      .from('attendance')
      .select('id')
      .eq('session_id', sessionId)
      .eq('roll_number', rollNumber)
      .maybeSingle();

    if (existingError) {
      return res.status(500).json({ message: 'Failed to check existing attendance.', error: existingError.message });
    }

    if (existingByRoll) {
      return res.status(409).json({ message: 'Attendance already exists for this roll number in this session.' });
    }

    const { data: inserted, error: insertError } = await supabase
      .from('attendance')
      .insert({
        session_id: sessionId,
        student_id: null,
        student_name: studentName,
        roll_number: rollNumber
      })
      .select('id, session_id, student_id, student_name, roll_number, marked_at')
      .single();

    if (insertError) {
      return res.status(500).json({ message: 'Failed to add manual attendance.', error: insertError.message });
    }

    await supabase.from('attendance_audit_logs').insert({
      attendance_id: inserted.id,
      session_id: sessionId,
      teacher_id: req.user.id,
      action: 'manual_mark',
      reason,
      student_name: studentName,
      roll_number: rollNumber,
      meta: { source: 'teacher_correction' }
    });

    return res.status(201).json({ message: 'Manual attendance added successfully.', attendance: inserted });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while adding manual attendance.', error: error.message });
  }
});

router.delete('/:attendanceId', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only teachers can remove attendance.' });
    }

    const { attendanceId } = req.params;
    const { sessionId, reason } = req.body;

    if (!sessionId || !reason) {
      return res.status(400).json({ message: 'sessionId and reason are required.' });
    }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, teacher_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    if (req.user.role !== 'admin' && session.teacher_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only update your own sessions.' });
    }

    const { data: row, error: rowError } = await supabase
      .from('attendance')
      .select('id, student_name, roll_number, session_id')
      .eq('id', attendanceId)
      .eq('session_id', sessionId)
      .single();

    if (rowError || !row) {
      return res.status(404).json({ message: 'Attendance record not found.' });
    }

    const { error: deleteError } = await supabase.from('attendance').delete().eq('id', attendanceId);

    if (deleteError) {
      return res.status(500).json({ message: 'Failed to remove attendance record.', error: deleteError.message });
    }

    await supabase.from('attendance_audit_logs').insert({
      attendance_id: row.id,
      session_id: sessionId,
      teacher_id: req.user.id,
      action: 'manual_remove',
      reason,
      student_name: row.student_name,
      roll_number: row.roll_number,
      meta: { source: 'teacher_correction' }
    });

    return res.status(200).json({ message: 'Attendance record removed successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while removing attendance.', error: error.message });
  }
});

router.get('/session/:sessionId/summary', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only teachers can view session summary.' });
    }

    const { sessionId } = req.params;

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, teacher_id, subject, created_at, expires_at')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    if (req.user.role !== 'admin' && session.teacher_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only view your own session summary.' });
    }

    const { data: rows, error: attendanceError } = await supabase
      .from('attendance')
      .select('id, student_name, roll_number, marked_at')
      .eq('session_id', sessionId)
      .order('marked_at', { ascending: true });

    if (attendanceError) {
      return res.status(500).json({ message: 'Failed to fetch session summary.', error: attendanceError.message });
    }

    const now = Date.now();
    const createdMs = new Date(session.created_at).getTime();
    const graceMs = 5 * 60 * 1000;

    const totalPresent = (rows || []).length;
    const lateCount = (rows || []).filter((row) => new Date(row.marked_at).getTime() - createdMs > graceMs).length;
    const onTimeCount = totalPresent - lateCount;
    const status = new Date(session.expires_at).getTime() > now ? 'active' : 'expired';

    return res.status(200).json({
      session,
      summary: {
        totalPresent,
        onTimeCount,
        lateCount,
        status
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while loading session summary.', error: error.message });
  }
});

router.get('/student/me', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Only students can view personal attendance history.' });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: rows, error: rowsError, count } = await supabase
      .from('attendance')
      .select('id, session_id, student_name, roll_number, marked_at, sessions(subject, created_at, expires_at)', {
        count: 'exact'
      })
      .eq('student_id', req.user.id)
      .order('marked_at', { ascending: false })
      .range(from, to);

    if (rowsError) {
      return res.status(500).json({ message: 'Failed to fetch student attendance history.', error: rowsError.message });
    }

    return res.status(200).json({
      rows: rows || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / limit))
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while loading student history.', error: error.message });
  }
});

module.exports = router;
