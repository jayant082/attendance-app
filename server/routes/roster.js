const express = require('express');
const supabase = require('../lib/supabase');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

router.get('/subjects', verifyToken, async (req, res) => {
  try {
    if (!['teacher', 'admin', 'student'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Unauthorized.' });
    }

    if (req.user.role === 'teacher') {
      const { data, error } = await supabase
        .from('subject_teachers')
        .select('subject_id, subjects(id, code, name, semester, section)')
        .eq('teacher_id', req.user.id);

      if (error) {
        return res.status(500).json({ message: 'Failed to load teacher subjects.', error: error.message });
      }

      return res.status(200).json({ subjects: (data || []).map((row) => row.subjects).filter(Boolean) });
    }

    if (req.user.role === 'student') {
      const { data, error } = await supabase
        .from('enrollments')
        .select('subject_id, subjects(id, code, name, semester, section)')
        .eq('student_id', req.user.id);

      if (error) {
        return res.status(500).json({ message: 'Failed to load student subjects.', error: error.message });
      }

      return res.status(200).json({ subjects: (data || []).map((row) => row.subjects).filter(Boolean) });
    }

    const { data, error } = await supabase.from('subjects').select('id, code, name, semester, section').order('name');

    if (error) {
      return res.status(500).json({ message: 'Failed to load subjects.', error: error.message });
    }

    return res.status(200).json({ subjects: data || [] });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while loading subjects.', error: error.message });
  }
});

router.get('/subject/:subjectId/students', verifyToken, async (req, res) => {
  try {
    if (!['teacher', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only teacher or admin can view roster.' });
    }

    const { subjectId } = req.params;

    if (req.user.role === 'teacher') {
      const { data: assignment } = await supabase
        .from('subject_teachers')
        .select('id')
        .eq('subject_id', subjectId)
        .eq('teacher_id', req.user.id)
        .maybeSingle();

      if (!assignment) {
        return res.status(403).json({ message: 'You are not assigned to this subject.' });
      }
    }

    const { data: enrollments, error } = await supabase
      .from('enrollments')
      .select('id, student_id, roll_number')
      .eq('subject_id', subjectId)
      .order('roll_number', { ascending: true });

    if (error) {
      return res.status(500).json({ message: 'Failed to load roster.', error: error.message });
    }

    // Fetch student profiles
    const studentIds = (enrollments || []).map(e => e.student_id);
    let studentProfiles = {};
    if (studentIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name, phone')
        .in('user_id', studentIds);
      if (!profilesError && profiles) {
        studentProfiles = Object.fromEntries(profiles.map(p => [p.user_id, p]));
      }
    }

    return res.status(200).json({
      students: (enrollments || []).map((row) => {
        const profile = studentProfiles[row.student_id];
        return {
          enrollmentId: row.id,
          studentId: row.student_id,
          rollNumber: row.roll_number || 'N/A',
          studentName: profile?.full_name || 'Student',
          phone: profile?.phone || ''
        };
      })
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while loading roster.', error: error.message });
  }
});

module.exports = router;
