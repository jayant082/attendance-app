const express = require('express');
const supabase = require('../lib/supabase');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

router.post('/create', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ message: 'Only teachers can create sessions.' });
    }

    const { subject, durationMinutes = 10 } = req.body;

    if (!subject) {
      return res.status(400).json({ message: 'Subject is required.' });
    }

    const expiresAt = new Date(Date.now() + Number(durationMinutes) * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        teacher_id: req.user.id,
        subject,
        expires_at: expiresAt
      })
      .select('id, subject, created_at, expires_at')
      .single();

    if (error) {
      return res.status(500).json({ message: 'Unable to create session.', error: error.message });
    }

    const qrPayload = {
      sessionId: data.id,
      expiresAt,
      secret: process.env.QR_SECRET
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

module.exports = router;
