const express = require('express');
const supabase = require('../lib/supabase');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

const ensureAdmin = (req, res) => {
  if (req.user.role !== 'admin') {
    res.status(403).json({ message: 'Only admins can perform this action.' });
    return false;
  }
  return true;
};

router.get('/users', verifyToken, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) {
      return res.status(500).json({ message: 'Failed to list users.', error: error.message });
    }

    const users = (data?.users || []).map((user) => ({
      id: user.id,
      email: user.email,
      role: user.app_metadata?.role || user.user_metadata?.role || 'unassigned',
      isActive: !Boolean(user.banned_until),
      fullName: user.user_metadata?.full_name || user.user_metadata?.name || '',
      rollNumber: user.user_metadata?.roll_number || ''
    }));

    return res.status(200).json({ users });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while listing users.', error: error.message });
  }
});

router.patch('/users/:userId/status', verifyToken, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive boolean is required.' });
    }

    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: isActive ? 'none' : '876000h'
    });

    if (error) {
      return res.status(500).json({ message: 'Failed to update user status.', error: error.message });
    }

    return res.status(200).json({
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully.`,
      user: {
        id: data?.user?.id,
        email: data?.user?.email,
        isActive
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while updating user status.', error: error.message });
  }
});

router.patch('/users/:userId/role', verifyToken, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const { userId } = req.params;
    const { role } = req.body;

    if (!['admin', 'teacher', 'student'].includes(role)) {
      return res.status(400).json({ message: 'Role must be admin, teacher, or student.' });
    }

    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      app_metadata: { role }
    });

    if (error) {
      return res.status(500).json({ message: 'Failed to update role.', error: error.message });
    }

    return res.status(200).json({
      message: 'Role updated successfully.',
      user: { id: data?.user?.id, email: data?.user?.email, role }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while updating role.', error: error.message });
  }
});

router.post('/subjects', verifyToken, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const { code, name, semester, section, teacherId } = req.body;
    if (!code || !name || !teacherId) {
      return res.status(400).json({ message: 'code, name, and teacherId are required.' });
    }

    const { data: subject, error: subjectError } = await supabase
      .from('subjects')
      .insert({
        code: code.trim(),
        name: name.trim(),
        semester: semester || null,
        section: section || null,
        created_by: req.user.id
      })
      .select('*')
      .single();

    if (subjectError || !subject) {
      return res.status(500).json({ message: 'Failed to create subject.', error: subjectError?.message });
    }

    const { error: teacherError } = await supabase.from('subject_teachers').insert({
      subject_id: subject.id,
      teacher_id: teacherId
    });

    if (teacherError) {
      return res.status(500).json({ message: 'Subject created but teacher assignment failed.', error: teacherError.message });
    }

    return res.status(201).json({ message: 'Subject created successfully.', subject });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while creating subject.', error: error.message });
  }
});

router.post('/enrollments', verifyToken, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const { subjectId, studentId, rollNumber } = req.body;
    if (!subjectId || !studentId) {
      return res.status(400).json({ message: 'subjectId and studentId are required.' });
    }

    const { data, error } = await supabase
      .from('enrollments')
      .insert({
        subject_id: subjectId,
        student_id: studentId,
        roll_number: rollNumber || null
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'Student already enrolled in this subject.' });
      }
      return res.status(500).json({ message: 'Failed to enroll student.', error: error.message });
    }

    return res.status(201).json({ message: 'Enrollment created successfully.', enrollment: data });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while enrolling student.', error: error.message });
  }
});

router.post('/timetable-slots', verifyToken, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const {
      subjectId,
      teacherId,
      dayOfWeek,
      startTime,
      endTime,
      roomName,
      latitude,
      longitude,
      radiusMeters = 100
    } = req.body;

    if (!subjectId || !teacherId || dayOfWeek === undefined || !startTime || !endTime) {
      return res.status(400).json({ message: 'subjectId, teacherId, dayOfWeek, startTime and endTime are required.' });
    }

    const { data, error } = await supabase
      .from('timetable_slots')
      .insert({
        subject_id: subjectId,
        teacher_id: teacherId,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        room_name: roomName || null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        radius_meters: radiusMeters
      })
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({ message: 'Failed to create timetable slot.', error: error.message });
    }

    return res.status(201).json({ message: 'Timetable slot created.', slot: data });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while creating timetable slot.', error: error.message });
  }
});

module.exports = router;
