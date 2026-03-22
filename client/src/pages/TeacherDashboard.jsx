import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRGenerator from '../components/QRGenerator';
import api from '../lib/api';
import { clearAuth, getStoredUser } from '../lib/auth';

function TeacherDashboard() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [subject, setSubject] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [sessionData, setSessionData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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

  const createSession = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/api/session/create', { subject, durationMinutes });
      setSessionData(data);
      localStorage.setItem('lastSessionId', data.session.id);
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to create session.');
    } finally {
      setLoading(false);
    }
  };

  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const seconds = String(timeLeft % 60).padStart(2, '0');

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Teacher Dashboard</h1>
            <p className="text-sm text-slate-600">Welcome, {user?.email}</p>
          </div>
          <button onClick={logout} className="rounded-lg bg-slate-800 px-4 py-2 text-white text-sm hover:bg-slate-900">
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Create Attendance Session</h2>
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

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? 'Creating...' : 'Generate Session QR'}
            </button>
          </form>

          {sessionData?.session && (
            <div className="mt-6 space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-sm text-indigo-800">
                Session ID: <span className="font-semibold">{sessionData.session.id}</span>
              </p>
              <p className="text-sm text-indigo-800">
                Expires At: <span className="font-semibold">{new Date(sessionData.session.expires_at).toLocaleString()}</span>
              </p>
              <p className="text-sm text-indigo-800">
                Countdown: <span className="font-semibold">{minutes}:{seconds}</span>
              </p>
              <Link
                to={`/report/${sessionData.session.id}`}
                className="inline-block rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                View Attendance Report
              </Link>
            </div>
          )}
        </div>

        <div className="flex items-start justify-center">
          <QRGenerator payload={sessionData?.qrPayload} />
        </div>
      </main>
    </div>
  );
}

export default TeacherDashboard;
