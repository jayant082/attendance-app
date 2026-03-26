const express = require('express');
const supabase = require('../lib/supabase');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

router.get('/session/:sessionId', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only teacher or admin can view audit logs.' });
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
        return res.status(403).json({ message: 'You can only view audit logs for your own sessions.' });
      }
    }

    const { data: logs, error } = await supabase
      .from('attendance_audit_logs')
      .select('id, attendance_id, session_id, teacher_id, action, reason, student_name, roll_number, meta, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ message: 'Failed to load audit logs.', error: error.message });
    }

    return res.status(200).json({ logs: logs || [] });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while loading audit logs.', error: error.message });
  }
});

module.exports = router;
