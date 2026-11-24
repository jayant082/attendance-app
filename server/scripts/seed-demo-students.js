const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../lib/supabase');

const seedDemoStudents = async () => {
  const sessionId = process.argv[process.argv.indexOf('--session-id') + 1];
  if (!process.argv.includes('--session-id') || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(sessionId || '')) {
    throw new Error('Usage: node scripts/seed-demo-students.js --session-id <session UUID>');
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, teacher_id, subject_id, created_at')
    .eq('id', sessionId)
    .single();
  if (sessionError || !session) throw new Error(`Unable to load target session: ${sessionError?.message || 'Not found'}`);
  if (!session.teacher_id) throw new Error('The target session must have a teacher before subjects can be assigned.');

  const students = [
    'Aarav Sharma', 'Ananya Verma', 'Rohan Patel', 'Ishita Singh',
    'Aditya Kumar', 'Kavya Iyer', 'Arjun Nair', 'Diya Gupta',
    'Vihaan Joshi', 'Meera Reddy', 'Siddharth Rao', 'Nisha Das',
    'Kabir Mehta', 'Sanya Kapoor', 'Dhruv Shah', 'Pooja Kulkarni',
    'Ishaan Chatterjee', 'Aditi Menon', 'Rahul Deshmukh', 'Sneha Bansal'
  ].map((name, index) => ({
    email: `attendance-demo-student-${String(index + 1).padStart(2, '0')}@example.test`,
    name,
    roll: `DEMO-${String(index + 1).padStart(3, '0')}`
  }));
  const subjectDefinitions = [
    { code: 'DEMO-DSA', name: 'Data Structures and Algorithms', semester: 3 },
    { code: 'DEMO-DBMS', name: 'Database Management Systems', semester: 4 },
    { code: 'DEMO-OS', name: 'Operating Systems', semester: 4 },
    { code: 'DEMO-CN', name: 'Computer Networks', semester: 5 },
    { code: 'DEMO-MATH3', name: 'Engineering Mathematics III', semester: 3 }
  ];
  const existingUsers = new Map();
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`Unable to check existing demo users: ${error.message}`);
    for (const user of data.users) {
      const reservedStudent = students.find((student) => student.email === user.email);
      const isDemoUser = user.app_metadata?.demo_seed === 'attendance-demo-v1';
      if (reservedStudent && (!isDemoUser || user.user_metadata?.roll_number !== reservedStudent.roll)) {
        throw new Error(`Reserved demo address already belongs to another account: ${user.email}`);
      }
      const student = students.find((item) => item.roll === user.user_metadata?.roll_number);
      if (isDemoUser && student) {
        if (existingUsers.has(student.roll)) throw new Error(`Multiple demo accounts have roll number ${student.roll}.`);
        existingUsers.set(student.roll, user);
      }
    }
    if (data.users.length < 100) break;
  }

  for (const student of students) {
    const user = existingUsers.get(student.roll);
    if (user && (user.app_metadata?.demo_seed !== 'attendance-demo-v1' || user.app_metadata?.role !== 'student')) {
      throw new Error(`Reserved demo address already belongs to a non-demo account: ${student.email}`);
    }
  }

  const subjects = [];
  for (const definition of subjectDefinitions) {
    const { data: existing, error: lookupError } = await supabase.from('subjects')
      .select('id, created_by')
      .eq('code', definition.code)
      .maybeSingle();
    if (lookupError) throw new Error(`Unable to check subject ${definition.code}: ${lookupError.message}`);
    if (existing && existing.created_by !== session.teacher_id) {
      throw new Error(`Subject ${definition.code} belongs to another creator; refusing to change it.`);
    }
    let subject = existing;
    if (!subject) {
      const { data, error } = await supabase.from('subjects')
        .insert({ ...definition, section: 'A', created_by: session.teacher_id })
        .select('id')
        .single();
      if (error) throw new Error(`Unable to create subject ${definition.code}: ${error.message}`);
      subject = data;
    }
    subjects.push(subject);
  }

  const { error: assignmentError } = await supabase.from('subject_teachers').upsert(
    subjects.map((subject) => ({ subject_id: subject.id, teacher_id: session.teacher_id })),
    { onConflict: 'subject_id,teacher_id', ignoreDuplicates: true }
  );
  if (assignmentError) throw new Error(`Unable to assign demo subjects to the teacher: ${assignmentError.message}`);

  const targetSubjectId = session.subject_id || subjects[0].id;
  if (!subjects.some((subject) => subject.id === targetSubjectId)) {
    const { data: assignment, error } = await supabase.from('subject_teachers')
      .select('id')
      .eq('subject_id', targetSubjectId)
      .eq('teacher_id', session.teacher_id)
      .maybeSingle();
    if (error || !assignment) throw new Error(`Target subject must be assigned to the session teacher: ${error?.message || 'Assignment missing'}`);
  }
  const enrollmentSubjectIds = [...new Set([...subjects.map((subject) => subject.id), targetSubjectId])];

  for (const student of students) {
    let user = existingUsers.get(student.roll);
    if (!user) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: student.email,
        password: crypto.randomBytes(32).toString('base64url'),
        email_confirm: true,
        app_metadata: { role: 'student', demo_seed: 'attendance-demo-v1' },
        user_metadata: { full_name: student.name, roll_number: student.roll }
      });
      if (error) throw new Error(`Unable to create ${student.name}: ${error.message}`);
      user = data.user;
    } else {
      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, full_name: student.name, roll_number: student.roll }
      });
      if (error) throw new Error(`Unable to update ${student.name}'s metadata: ${error.message}`);
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      user_id: user.id, full_name: student.name, roll_number: student.roll
    }, { onConflict: 'user_id' });
    if (profileError) throw new Error(`Unable to save ${student.name}'s profile: ${profileError.message}`);

    const { error: enrollmentError } = await supabase.from('enrollments').upsert(
      enrollmentSubjectIds.map((subjectId) => ({
        subject_id: subjectId, student_id: user.id, roll_number: student.roll
      })),
      { onConflict: 'subject_id,student_id', ignoreDuplicates: true }
    );
    if (enrollmentError) throw new Error(`Unable to enroll ${student.name}: ${enrollmentError.message}`);

    const { error: attendanceError } = await supabase.from('attendance').upsert({
      session_id: session.id,
      student_id: user.id,
      student_name: student.name,
      roll_number: student.roll,
      marked_at: session.created_at
    }, { onConflict: 'session_id,student_id', ignoreDuplicates: true });
    if (attendanceError) throw new Error(`Unable to save ${student.name}'s sample attendance: ${attendanceError.message}`);
    const { error: nameError } = await supabase.from('attendance')
      .update({ student_name: student.name, roll_number: student.roll })
      .eq('session_id', session.id)
      .eq('student_id', user.id);
    if (nameError) throw new Error(`Unable to sync ${student.name}'s attendance name: ${nameError.message}`);
    console.log(`Saved ${student.name} (${student.roll}) and sample attendance for session ${session.id}.`);
  }

  if (!session.subject_id) {
    const { data, error } = await supabase.from('sessions')
      .update({ subject_id: targetSubjectId })
      .eq('id', session.id)
      .is('subject_id', null)
      .select('id')
      .single();
    if (error || !data) throw new Error(`Unable to map the target session to DSA; check for concurrent changes: ${error?.message || 'Session not updated'}`);
  }
  console.log(`Completed: ${students.length} permanent demo students, ${subjects.length} teacher-assigned subjects, and session mapping ${targetSubjectId}.`);
};

seedDemoStudents().catch((error) => {
  console.error(`Demo seed failed; completed steps remain saved and the command can be rerun: ${error.message}`);
  process.exitCode = 1;
});
