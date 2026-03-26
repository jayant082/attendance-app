import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

function TeacherAnalytics() {
  const [overview, setOverview] = useState(null);
  const [trend, setTrend] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [subjectId, setSubjectId] = useState('');
  const [defaulterData, setDefaulterData] = useState([]);
  const [threshold, setThreshold] = useState(75);
  const [error, setError] = useState('');

  const loadAnalytics = async () => {
    setError('');
    try {
      const [{ data: analyticsData }, { data: subjectsData }] = await Promise.all([
        api.get('/api/analytics/teacher-overview'),
        api.get('/api/roster/subjects')
      ]);
      setOverview(analyticsData.overview || null);
      setTrend(analyticsData.trend || []);
      setSessions(analyticsData.sessions || []);
      setSubjects(subjectsData.subjects || []);
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to load analytics.');
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const fetchDefaulters = async () => {
    if (!subjectId) return;
    setError('');
    try {
      const { data } = await api.get(`/api/analytics/subject/${subjectId}/defaulters`, {
        params: { threshold }
      });
      setDefaulterData(data.defaulters || []);
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to load defaulters.');
    }
  };

  const weeklyTrend = useMemo(() => trend.slice(-7), [trend]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Teacher Analytics</h1>
          <Link to="/teacher" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">Back</Link>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {overview && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Total Sessions</p>
              <p className="text-2xl font-bold text-slate-900">{overview.totalSessions}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Total Marks</p>
              <p className="text-2xl font-bold text-slate-900">{overview.totalAttendanceMarks}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Avg / Session</p>
              <p className="text-2xl font-bold text-slate-900">{overview.averagePerSession}</p>
            </div>
          </div>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">Weekly Trend</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-7">
            {weeklyTrend.map((item) => (
              <div key={item.date} className="rounded border border-slate-200 bg-slate-50 p-2 text-center">
                <p className="text-xs text-slate-600">{item.date.slice(5)}</p>
                <p className="text-sm font-semibold text-slate-900">{item.count}</p>
              </div>
            ))}
            {weeklyTrend.length === 0 && <p className="text-sm text-slate-600">No trend data yet.</p>}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">Defaulter Module</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm">
              <option value="">Select Subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.code} - {subject.name}</option>
              ))}
            </select>
            <input type="number" min="1" max="100" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="rounded border border-slate-300 px-3 py-2 text-sm" />
            <button onClick={fetchDefaulters} className="rounded bg-rose-600 px-4 py-2 text-sm text-white">Load Defaulters</button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Student</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Roll</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Attendance %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {defaulterData.map((item) => (
                  <tr key={item.studentId}>
                    <td className="px-3 py-2 text-sm">{item.studentName}</td>
                    <td className="px-3 py-2 text-sm">{item.rollNumber}</td>
                    <td className="px-3 py-2 text-sm text-rose-600">{item.percentage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {defaulterData.length === 0 && <p className="mt-3 text-sm text-slate-600">No defaulters for selected threshold.</p>}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">Session Snapshot</h2>
          <p className="text-xs text-slate-500">Use session ID in report page to trigger absentee notifications.</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {sessions.slice(0, 10).map((session) => (
              <li key={session.id} className="rounded border border-slate-200 px-3 py-2">
                {session.subject} - {session.attendanceCount} marked
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export default TeacherAnalytics;
