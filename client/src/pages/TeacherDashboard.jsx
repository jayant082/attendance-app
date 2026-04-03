import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRGenerator from '../components/QRGenerator';
import StatCard from '../components/StatCard';
import api from '../lib/api';
import { clearAuth, getStoredUser } from '../lib/auth';

function TeacherDashboard() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [subject, setSubject] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [subjectId, setSubjectId] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [timetableSlotId, setTimetableSlotId] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radiusMeters, setRadiusMeters] = useState('');
  const [requiresSelfie, setRequiresSelfie] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const expiresAt = useMemo(() => sessionData?.session?.expires_at || null, [sessionData]);

  useEffect(() => {
    if (!expiresAt) {
      setTimeLeft(0);
      return;
    }

    const intervalId = setInterval(() => {
      const diffMs = new Date(expiresAt).getTime() - Date.now();
      setTimeLeft(Math.max(0, Math.floor(diffMs / 1000)));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [expiresAt]);

  const logout = () => {
    clearAuth();
    navigate('/');
  };

  const fetchHistory = async () => {
    try {
      const { data } = await api.get('/api/session/history');
      setHistory(data.sessions || []);
    } catch (_error) {
      setHistory([]);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const { data } = await api.get('/api/roster/subjects');
        setSubjects(data.subjects || []);
      } catch (_error) {
        setSubjects([]);
      }
    };

    fetchSubjects();
  }, []);

  const createSession = async (event) => {
    event.preventDefault();
    setInfo('');
    setError('');
    setLoading(true);

    try {
      const safeDuration = Math.max(1, Math.min(180, Number(durationMinutes) || 10));
      const { data } = await api.post('/api/session/create', {
        subject: subject.trim(),
        subjectId: subjectId || null,
        durationMinutes: safeDuration,
        timetableSlotId: timetableSlotId || null,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
        radiusMeters: radiusMeters ? Number(radiusMeters) : null,
        requiresSelfie
      });
      setSessionData(data);
      localStorage.setItem('lastSessionId', data.session.id);
      setInfo('Session created successfully. QR is ready to scan.');
      fetchHistory();
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to create session.');
    } finally {
      setLoading(false);
    }
  };

  const extendCurrentSession = async (extraMinutes) => {
    if (!sessionData?.session?.id) {
      return;
    }

    setActionLoading(true);
    setError('');
    setInfo('');

    try {
      const { data } = await api.patch(`/api/session/${sessionData.session.id}/extend`, { extraMinutes });
      setSessionData((prev) => ({
        ...prev,
        session: data.session,
        qrPayload: data.qrPayload
      }));
      setInfo(data.message || 'Session extended successfully.');
      fetchHistory();
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to extend session.');
    } finally {
      setActionLoading(false);
    }
  };

  const endCurrentSession = async () => {
    if (!sessionData?.session?.id) {
      return;
    }

    if (!window.confirm('End this session now? Students will no longer be able to mark attendance.')) {
      return;
    }

    setActionLoading(true);
    setError('');
    setInfo('');

    try {
      const { data } = await api.patch(`/api/session/${sessionData.session.id}/end`);
      setSessionData((prev) => ({
        ...prev,
        session: data.session
      }));
      setInfo(data.message || 'Session ended successfully.');
      fetchHistory();
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to end session.');
    } finally {
      setActionLoading(false);
    }
  };

  const copyPayload = async () => {
    if (!sessionData?.qrPayload) {
      return;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(sessionData.qrPayload));
      setInfo('QR payload copied. You can share this with students if camera scan fails.');
    } catch (_error) {
      setError('Unable to copy payload. Please copy manually from browser inspect/view.');
    }
  };

  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const seconds = String(timeLeft % 60).padStart(2, '0');
  const activeSessions = history.filter((item) => new Date(item.expires_at).getTime() > Date.now()).length;
  const totalAttendance = history.reduce((sum, item) => sum + (item.attendance_count || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Teacher Dashboard</h1>
            <p className="text-sm text-slate-600">Welcome, {user?.email}</p>
          </div>
          <div className="flex gap-2">
            <Link to="/teacher/analytics" className="rounded-lg bg-emerald-600 px-4 py-2 text-white text-sm hover:bg-emerald-700">
              Analytics
            </Link>
            <Link to="/teacher/sessions" className="rounded-lg bg-indigo-600 px-4 py-2 text-white text-sm hover:bg-indigo-700">
              Session History
            </Link>
            <button onClick={logout} className="rounded-lg bg-slate-800 px-4 py-2 text-white text-sm hover:bg-slate-900">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Sessions" value={statsLoading ? '...' : history.length} hint="All created classes" />
          <StatCard label="Active Sessions" value={statsLoading ? '...' : activeSessions} hint="Not expired yet" />
          <StatCard label="Total Marked" value={statsLoading ? '...' : totalAttendance} hint="Combined attendance" />
          <StatCard label="Current Timer" value={`${minutes}:${seconds}`} hint="For latest session" />
        </div>

        {info && <p className="text-sm font-medium text-emerald-700">{info}</p>}
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm backdrop-blur">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Create Attendance Session</h2>
          <form onSubmit={createSession} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Subject</label>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="e.g. Data Structures"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Subject Mapping (optional)</label>
              <select
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select subject</option>
                {subjects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} - {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Timetable Slot ID (optional)</label>
              <input
                value={timetableSlotId}
                onChange={(event) => setTimetableSlotId(event.target.value)}
                placeholder="UUID from admin timetable setup"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Expiry (Minutes)</label>
              <input
                type="number"
                min="1"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <input
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                placeholder="Latitude"
                className="rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                placeholder="Longitude"
                className="rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                value={radiusMeters}
                onChange={(event) => setRadiusMeters(event.target.value)}
                placeholder="Radius meters"
                className="rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={requiresSelfie} onChange={(event) => setRequiresSelfie(event.target.checked)} />
              Require selfie hash for anti-proxy check
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? 'Creating...' : 'Generate Session QR'}
            </button>
          </form>

          {sessionData?.session && (
            <div className="mt-6 space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-sm text-indigo-800">
                Session ID: <span className="font-semibold">{sessionData.session.id}</span>
              </p>
              <p className="text-sm text-indigo-800">
                Expires At: <span className="font-semibold">{new Date(sessionData.session.expires_at).toLocaleString()}</span>
              </p>
              <p className="text-sm text-indigo-800">
                Countdown: <span className="font-semibold text-lg text-indigo-700">{minutes}:{seconds}</span>
              </p>
              <div className="rounded-lg bg-white p-3 border border-indigo-100">
                <p className="text-xs font-semibold text-slate-700 mb-2">📋 If QR camera scan fails, share this payload:</p>
                <p className="text-xs font-mono text-slate-600 break-all bg-slate-50 p-2 rounded border border-slate-200">
                  {JSON.stringify(sessionData.qrPayload)}
                </p>
                <button
                  type="button"
                  onClick={copyPayload}
                  className="mt-2 w-full rounded-lg bg-slate-700 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
                >
                  Copy Payload to Share
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  to={`/report/${sessionData.session.id}`}
                  className="inline-block rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  View Attendance Report
                </Link>
                <button
                  type="button"
                  onClick={() => extendCurrentSession(5)}
                  disabled={actionLoading}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  +5 min
                </button>
                <button
                  type="button"
                  onClick={endCurrentSession}
                  disabled={actionLoading}
                  className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  End Session
                </button>
              </div>
            </div>
          )}
        </div>

          <div className="space-y-4">
            <div className="flex items-start justify-center">
              <QRGenerator payload={sessionData?.qrPayload} />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Production Readiness Checklist</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
                <li>Share QR only in class and monitor expiry countdown.</li>
                <li>Use manual correction only with valid reason.</li>
                <li>Review session history and export report after class.</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default TeacherDashboard;
