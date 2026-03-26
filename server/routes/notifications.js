const express = require('express');
const supabase = require('../lib/supabase');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

const buildAbsenteeNotification = async (sessionId) => {
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, subject_id, subject')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return { error: 'Session not found.' };
  }

  const { data: enrollments, error: enrollmentsError } = await supabase
    .from('enrollments')
    .select('student_id, profiles(full_name)')
    .eq('subject_id', session.subject_id);

  if (enrollmentsError) {
    return { error: enrollmentsError.message };
  }

  const { data: marks, error: marksError } = await supabase
    .from('attendance')
    .select('student_id')
    .eq('session_id', sessionId)
    .not('student_id', 'is', null);

  if (marksError) {
    return { error: marksError.message };
  }

  const presentSet = new Set((marks || []).map((mark) => mark.student_id));
  const absentees = (enrollments || []).filter((enrollment) => !presentSet.has(enrollment.student_id));

  const logs = absentees.map((absentee) => ({
    session_id: sessionId,
    recipient_user_id: absentee.student_id,
    recipient_channel: 'email',
    message: `You were marked absent for ${session.subject || 'your class'}. Please contact your teacher if this is incorrect.`,
    status: 'queued'
  }));

  return { session, logs };
};

router.post('/session/:sessionId/absentees', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only teacher or admin can trigger absentee alerts.' });
    }

    const { sessionId } = req.params;

    if (req.user.role === 'teacher') {
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, teacher_id')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        return res.status(404).json({ message: 'Session not found.' });
      }

      if (session.teacher_id !== req.user.id) {
        return res.status(403).json({ message: 'You can only trigger notifications for your own sessions.' });
      }
    }

    const result = await buildAbsenteeNotification(sessionId);
    if (result.error) {
      return res.status(500).json({ message: 'Failed to prepare notifications.', error: result.error });
    }

    if (result.logs.length === 0) {
      return res.status(200).json({ message: 'No absentees found for this session.', created: 0 });
    }

    const { error: insertError } = await supabase.from('notification_logs').insert(result.logs);
    if (insertError) {
      return res.status(500).json({ message: 'Failed to queue absentee notifications.', error: insertError.message });
    }

    await supabase.from('sessions').update({ is_notifications_sent: true }).eq('id', sessionId);

    return res.status(201).json({ message: 'Absentee notifications queued successfully.', created: result.logs.length });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while creating notifications.', error: error.message });
  }
});

router.get('/session/:sessionId', verifyToken, async (req, res) => {
  try {
    if (!['teacher', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only teacher or admin can view notification logs.' });
    }

    const { sessionId } = req.params;
    const { data: logs, error } = await supabase
      .from('notification_logs')
      .select('id, recipient_user_id, recipient_channel, recipient, message, status, created_at, sent_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ message: 'Failed to load notification logs.', error: error.message });
    }

    return res.status(200).json({ logs: logs || [] });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while loading notifications.', error: error.message });
  }
});

module.exports = router;
