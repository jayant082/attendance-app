const express = require('express');
const jwt = require('jsonwebtoken');
const supabase = require('../lib/supabase');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data?.user) {
      return res.status(401).json({ message: error?.message || 'Invalid login credentials.' });
    }

    const user = data.user;
    const appRole = user.app_metadata?.role;
    const userRole = user.user_metadata?.role;
    const metadataRole = appRole || userRole;

    if (!['admin', 'teacher', 'student'].includes(metadataRole)) {
      return res.status(403).json({
        message:
          'User role is not configured correctly. Please set app_metadata.role (preferred) or user_metadata.role to admin, teacher, or student.'
      });
    }

    const resolvedRole = metadataRole;

    const payload = {
      id: user.id,
      email: user.email,
      role: resolvedRole,
      studentName: user.user_metadata?.full_name || user.user_metadata?.name || '',
      rollNumber: user.user_metadata?.roll_number || ''
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

router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const redirectTo = process.env.CLIENT_URL || 'http://localhost:5173';

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    });

    if (error) {
      return res.status(500).json({ message: 'Failed to send reset password email.', error: error.message });
    }

    return res.status(200).json({ message: 'Password reset email has been sent if the account exists.' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error during password reset request.', error: error.message });
  }
});

module.exports = router;
