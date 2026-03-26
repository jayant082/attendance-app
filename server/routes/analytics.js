const express = require('express');
const supabase = require('../lib/supabase');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

router.get('/teacher-overview', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only teacher or admin can view analytics.' });
    }

    const teacherId = req.user.role === 'admin' ? req.query.teacherId : req.user.id;
    if (!teacherId) {
      return res.status(400).json({ message: 'teacherId is required for admin access.' });
    }

    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, subject, subject_id, created_at, expires_at')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });

    if (sessionsError) {
      return res.status(500).json({ message: 'Failed to load sessions.', error: sessionsError.message });
    }

    const sessionIds = (sessions || []).map((session) => session.id);
    let attendance = [];

    if (sessionIds.length > 0) {
      const { data: attendanceRows, error: attendanceError } = await supabase
        .from('attendance')
        .select('id, session_id, marked_at')
        .in('session_id', sessionIds);

      if (attendanceError) {
        return res.status(500).json({ message: 'Failed to load attendance rows.', error: attendanceError.message });
      }
      attendance = attendanceRows || [];
    }

    const attendanceBySession = attendance.reduce((acc, row) => {
      acc[row.session_id] = (acc[row.session_id] || 0) + 1;
      return acc;
    }, {});

    const byDay = attendance.reduce((acc, row) => {
      const day = new Date(row.marked_at).toISOString().slice(0, 10);
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {});

    const trend = Object.entries(byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    return res.status(200).json({
      overview: {
        totalSessions: sessions.length,
        totalAttendanceMarks: attendance.length,
        averagePerSession: sessions.length ? Number((attendance.length / sessions.length).toFixed(2)) : 0
      },
      sessions: sessions.map((session) => ({
        ...session,
        attendanceCount: attendanceBySession[session.id] || 0
      })),
      trend
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while loading analytics.', error: error.message });
  }
});

router.get('/subject/:subjectId/defaulters', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only teacher or admin can view defaulters.' });
    }

    const { subjectId } = req.params;
    const threshold = Math.min(100, Math.max(1, Number(req.query.threshold) || 75));

    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, teacher_id')
      .eq('subject_id', subjectId);

    if (sessionsError) {
      return res.status(500).json({ message: 'Failed to load subject sessions.', error: sessionsError.message });
    }

    if (!sessions || sessions.length === 0) {
      return res.status(200).json({ subjectId, threshold, totalSessions: 0, defaulters: [] });
    }

    if (req.user.role === 'teacher' && sessions.some((session) => session.teacher_id !== req.user.id)) {
      return res.status(403).json({ message: 'You can only view your own subject analytics.' });
    }

    const totalSessions = sessions.length;

    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('enrollments')
      .select('student_id, roll_number, profiles(full_name)')
      .eq('subject_id', subjectId);

    if (enrollmentsError) {
      return res.status(500).json({ message: 'Failed to load enrollments.', error: enrollmentsError.message });
    }

    const sessionIds = sessions.map((session) => session.id);
    const { data: marks, error: marksError } = await supabase
      .from('attendance')
      .select('student_id, session_id')
      .in('session_id', sessionIds);

    if (marksError) {
      return res.status(500).json({ message: 'Failed to load attendance marks.', error: marksError.message });
    }

    const byStudent = (marks || []).reduce((acc, row) => {
      if (!row.student_id) return acc;
      acc[row.student_id] = (acc[row.student_id] || 0) + 1;
      return acc;
    }, {});

    const reportRows = (enrollments || []).map((enrollment) => {
      const presentCount = byStudent[enrollment.student_id] || 0;
      const percentage = totalSessions === 0 ? 0 : Number(((presentCount / totalSessions) * 100).toFixed(2));
      return {
        studentId: enrollment.student_id,
        studentName: enrollment.profiles?.full_name || 'Student',
        rollNumber: enrollment.roll_number || 'N/A',
        presentCount,
        totalSessions,
        percentage,
        isDefaulter: percentage < threshold
      };
    });

    return res.status(200).json({
      subjectId,
      threshold,
      totalSessions,
      defaulters: reportRows.filter((row) => row.isDefaulter),
      allStudents: reportRows
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while loading defaulter analytics.', error: error.message });
  }
});

router.get('/session/:sessionId/absentees', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only teacher or admin can view absentees.' });
    }

    const { sessionId } = req.params;

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, teacher_id, subject_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    if (req.user.role === 'teacher' && session.teacher_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only view your own session absentees.' });
    }

    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('enrollments')
      .select('student_id, roll_number, profiles(full_name, phone)')
      .eq('subject_id', session.subject_id);

    if (enrollmentsError) {
      return res.status(500).json({ message: 'Failed to load enrolled students.', error: enrollmentsError.message });
    }

    const { data: marks, error: marksError } = await supabase
      .from('attendance')
      .select('student_id')
      .eq('session_id', sessionId)
      .not('student_id', 'is', null);

    if (marksError) {
      return res.status(500).json({ message: 'Failed to load attendance marks.', error: marksError.message });
    }

    const presentSet = new Set((marks || []).map((mark) => mark.student_id));
    const absentees = (enrollments || [])
      .filter((enrollment) => !presentSet.has(enrollment.student_id))
      .map((enrollment) => ({
        studentId: enrollment.student_id,
        studentName: enrollment.profiles?.full_name || 'Student',
        rollNumber: enrollment.roll_number || 'N/A',
        phone: enrollment.profiles?.phone || ''
      }));

    return res.status(200).json({ sessionId, absentees, count: absentees.length });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while loading absentees.', error: error.message });
  }
});

module.exports = router;
