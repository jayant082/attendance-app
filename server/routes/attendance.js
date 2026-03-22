const express = require('express');
const supabase = require('../lib/supabase');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

const parseIsoTimestamp = (value) => {
  if (!value || typeof value !== 'string') {
    return Number.NaN;
  }

  const trimmed = value.trim();
  const hasTimezone = /(?:Z|[+\-]\d{2}:\d{2})$/i.test(trimmed);
  return Date.parse(hasTimezone ? trimmed : `${trimmed}Z`);
};

router.post('/mark', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Only students can mark attendance.' });
    }

    const { qrData } = req.body;
    if (!qrData) {
      return res.status(400).json({ message: 'QR payload is required.' });
    }

    let parsedPayload;

    // QR validation step 1: Parse QR payload
    try {
      parsedPayload = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
    } catch (error) {
      return res.status(400).json({ message: 'Invalid QR payload format.' });
    }

    const { sessionId, expiresAt, secret } = parsedPayload;

    if (!sessionId || !expiresAt || !secret) {
      return res.status(400).json({ message: 'QR payload is missing required fields.' });
    }

    // QR validation step 2: Check expiry
    const qrExpiryMs = parseIsoTimestamp(expiresAt);
    if (Number.isNaN(qrExpiryMs)) {
      return res.status(400).json({ message: 'Invalid expiry timestamp in QR payload.' });
    }

    if (qrExpiryMs < Date.now()) {
      return res.status(410).json({ message: 'Session has expired. Attendance cannot be marked.' });
    }

    // QR validation step 3: Verify shared secret
    if (secret !== process.env.QR_SECRET) {
      return res.status(401).json({ message: 'QR secret verification failed.' });
    }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, expires_at')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    const sessionExpiryMs = parseIsoTimestamp(session.expires_at);
    if (Number.isNaN(sessionExpiryMs)) {
      return res.status(500).json({ message: 'Invalid expiry timestamp in session record.' });
    }

    if (sessionExpiryMs < Date.now()) {
      return res.status(410).json({ message: 'Session expired based on server record.' });
    }

    // QR validation step 4: Duplicate check before insert
    const { data: existing, error: existingError } = await supabase
      .from('attendance')
      .select('id')
      .eq('session_id', sessionId)
      .eq('student_id', req.user.id)
      .maybeSingle();

    if (existingError) {
      return res.status(500).json({ message: 'Error checking existing attendance.', error: existingError.message });
    }

    if (existing) {
      return res.status(409).json({ message: 'Attendance already marked for this session.' });
    }

    // QR validation step 5: Insert attendance record
    const { data: inserted, error: insertError } = await supabase
      .from('attendance')
      .insert({
        session_id: sessionId,
        student_id: req.user.id,
        student_name: req.user.studentName || 'Student',
        roll_number: req.user.rollNumber || 'N/A'
      })
      .select('id, session_id, student_id, student_name, roll_number, marked_at')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(409).json({ message: 'Attendance already marked for this session.' });
      }
      return res.status(500).json({ message: 'Failed to mark attendance.', error: insertError.message });
    }

    return res.status(201).json({ message: 'Attendance marked successfully.', attendance: inserted });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while marking attendance.', error: error.message });
  }
});

router.get('/:sessionId', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
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

    if (session.teacher_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only view your own session reports.' });
    }

    const { data: rows, error: attendanceError } = await supabase
      .from('attendance')
      .select('student_name, roll_number, marked_at')
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

module.exports = router;
