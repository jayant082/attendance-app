import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRGenerator from '../components/QRGenerator';
import StatCard from '../components/StatCard';
import SessionAttendance from '../components/SessionAttendance';
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
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [locationError, setLocationError] = useState('');
  const locationRequestId = useRef(0);
  const [radiusMeters, setRadiusMeters] = useState('');
  const [requiresSelfie, setRequiresSelfie] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [now, setNow] = useState(Date.now);

  const activeSession = [sessionData?.session, ...history].find((item) => item && new Date(item.expires_at).getTime() > Date.now());
  const activeQrPayload = activeSession?.id === sessionData?.session?.id ? sessionData?.qrPayload : activeSession?.qrPayload;
  const expiresAt = activeSession?.expires_at || sessionData?.session?.expires_at || null;
  const timeLeft = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000)) : 0;

  const refreshLocation = useCallback(() => {
    const requestId = ++locationRequestId.current;
    setLocationError('');
    setLocationMessage('');

    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationError('Automatic location requires HTTPS or localhost and a browser with location support. You can enter coordinates manually.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== locationRequestId.current) return;
        setLatitude(String(position.coords.latitude));
        setLongitude(String(position.coords.longitude));
        setLocationMessage('Current location captured. You can edit the coordinates if needed.');
        setLocating(false);
      },
      (locationFailure) => {
        if (requestId !== locationRequestId.current) return;
        const messages = {
          1: 'Location permission denied. Allow location access in your browser and retry, or enter coordinates manually.',
          2: 'Your location is unavailable. Retry or enter coordinates manually.',
          3: 'Location request timed out. Retry or enter coordinates manually.'
        };
        setLocationError(messages[locationFailure.code] || 'Unable to capture your location. Retry or enter coordinates manually.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    if (statsLoading || activeSession) return;
    refreshLocation();
    return () => { locationRequestId.current += 1; };
  }, [refreshLocation, statsLoading, activeSession?.id]);

  useEffect(() => {
    if (!expiresAt) {
      return;
    }

    setNow(Date.now());
    const intervalId = setInterval(() => setNow(Date.now()), 1000);

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
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Unable to load sessions. Refresh the dashboard to restore session controls.');
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
    if (!activeSession?.id) {
      return;
    }

    setActionLoading(true);
    setError('');
    setInfo('');

    try {
      const { data } = await api.patch(`/api/session/${activeSession.id}/extend`, { extraMinutes });
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
    if (!activeSession?.id) {
      return;
    }

    if (!window.confirm('End this session now? Students will no longer be able to mark attendance.')) {
      return;
    }

    setActionLoading(true);
    setError('');
    setInfo('');

    try {
      const { data } = await api.patch(`/api/session/${activeSession.id}/end`);
      setSessionData({ session: data.session, qrPayload: null });
      setHistory((previous) => previous.map((item) => item.id === activeSession.id ? { ...item, ...data.session } : item));
      setInfo(data.message || 'Session ended successfully.');
      fetchHistory();
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to end session.');
    } finally {
      setActionLoading(false);
    }
  };

  const copyPayload = async () => {
    if (!activeQrPayload) {
      return;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(activeQrPayload));
      setInfo('QR payload copied. You can share this with students if camera scan fails.');
    } catch (_error) {
      setError('Unable to copy payload. Allow clipboard access in your browser and retry.');
    }
  };

  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const seconds = String(timeLeft % 60).padStart(2, '0');
  const activeSessions = history.filter((item) => new Date(item.expires_at).getTime() > Date.now()).length;
  const totalAttendance = history.reduce((sum, item) => sum + (item.attendance_count || 0), 0);
  const currentSessionId = activeSession?.id || sessionData?.session?.id;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Teacher Dashboard</h1>
            <p className="text-sm text-slate-600">Welcome, {user?.email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
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
        {!activeSession && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Sessions" value={statsLoading ? '...' : history.length} hint="All created classes" />
          <StatCard label="Active Sessions" value={statsLoading ? '...' : activeSessions} hint="Not expired yet" />
          <StatCard label="Total Marked" value={statsLoading ? '...' : totalAttendance} hint="Combined attendance" />
          <StatCard label="Current Timer" value={`${minutes}:${seconds}`} hint="For latest session" />
        </div>}

        {info && <p className="text-sm font-medium text-emerald-700">{info}</p>}
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        {activeSession && (
          <section aria-label="Active session QR" className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center gap-4 rounded-2xl bg-white p-2 text-center">
            <h2 className="text-2xl font-semibold text-slate-900">{activeSession.subject}</h2>
            {activeQrPayload ? <QRGenerator payload={activeQrPayload} presentation /> : <p role="alert" className="text-red-600">Unable to load the active QR. Refresh the dashboard to try again.</p>}
            <p className="text-lg font-medium text-indigo-700">Time remaining: {minutes}:{seconds}</p>
          </section>
        )}

        {!activeSession && <div className="grid gap-6 lg:grid-cols-2">
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
                aria-label="Latitude"
                type="number"
                min="-90"
                max="90"
                step="any"
                required={Boolean(radiusMeters) && !timetableSlotId}
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                disabled={locating}
                placeholder="Latitude"
                className="rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                aria-label="Longitude"
                type="number"
                min="-180"
                max="180"
                step="any"
                required={Boolean(radiusMeters) && !timetableSlotId}
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                disabled={locating}
                placeholder="Longitude"
                className="rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="number"
                min="1"
                step="1"
                aria-label="Radius meters (optional)"
                value={radiusMeters}
                onChange={(event) => setRadiusMeters(event.target.value)}
                placeholder="Radius meters"
                className="rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <p className="text-xs text-slate-600">Set a radius in meters to require student location verification. Leave it blank for an unrestricted session.</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={refreshLocation}
                disabled={locating}
                className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {locating ? 'Fetching Location...' : 'Use Current Location'}
              </button>
              {locationMessage && <p role="status" className="text-sm text-emerald-700">{locationMessage}</p>}
              {locationError && <p role="alert" className="text-sm text-amber-800">{locationError}</p>}
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={requiresSelfie} onChange={(event) => setRequiresSelfie(event.target.checked)} />
              Require selfie hash for anti-proxy check
            </label>

            <button
              type="submit"
              disabled={loading || locating}
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
              <div className="flex flex-wrap gap-2">
                <Link
                  to={`/report/${sessionData.session.id}`}
                  className="inline-block rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  View Attendance Report
                </Link>
              </div>
            </div>
          )}
        </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Production Readiness Checklist</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
                <li>Share QR only in class and monitor expiry countdown.</li>
                <li>Use manual correction only with valid reason.</li>
                <li>Review session history and export report after class.</li>
              </ul>
            </div>
          </div>
        </div>}
        {currentSessionId && <SessionAttendance
          key={currentSessionId}
          sessionId={currentSessionId}
          onEndSession={activeSession ? endCurrentSession : undefined}
          onExtendSession={activeSession ? () => extendCurrentSession(5) : undefined}
          onCopyPayload={activeQrPayload ? copyPayload : undefined}
          actionLoading={actionLoading}
        />}
      </main>
    </div>
  );
}

export default TeacherDashboard;
