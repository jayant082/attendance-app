const express = require('express');
const jwt = require('jsonwebtoken');
const supabase = require('../lib/supabase');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password, role, studentName, rollNumber } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data?.user) {
      return res.status(401).json({ message: error?.message || 'Invalid login credentials.' });
    }

    const user = data.user;
    const resolvedRole = role || user.user_metadata?.role || 'student';

    const payload = {
      id: user.id,
      email: user.email,
      role: resolvedRole,
      studentName: studentName || user.user_metadata?.full_name || user.user_metadata?.name || '',
      rollNumber: rollNumber || user.user_metadata?.roll_number || ''
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });

    return res.status(200).json({
      token,
      user: {
        id: payload.id,
        email: payload.email,
        role: payload.role,
        studentName: payload.studentName,
        rollNumber: payload.rollNumber
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error during login.', error: error.message });
  }
});

module.exports = router;
