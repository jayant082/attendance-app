import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { clearAuth, getStoredUser } from '../lib/auth';

function TeacherSessions() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessions, setSessions] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data } = await api.get('/api/session/history');
        setSessions(data.sessions || []);
      } catch (apiError) {
        setError(apiError.response?.data?.message || 'Unable to load session history.');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const logout = () => {
    clearAuth();
    navigate('/');
  };

  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return sessions;
    }

    return sessions.filter((session) => session.subject.toLowerCase().includes(normalized) || session.id.toLowerCase().includes(normalized));
  }, [query, sessions]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Session History</h1>
            <p className="text-sm text-slate-600">{user?.email}</p>
          </div>
          <div className="flex gap-2">
            <Link to="/teacher" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">
              Back to Dashboard
            </Link>
            <button onClick={logout} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-900">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by subject or session ID"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {loading && <p className="text-slate-600">Loading sessions...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && !error && filteredSessions.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-600">
            No sessions found yet.
          </div>
        )}

        {!loading && !error && filteredSessions.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Subject</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Created</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Expires</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Present Count</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredSessions.map((session) => (
                  <tr key={session.id}>
                    <td className="px-4 py-3 text-sm text-slate-800">{session.subject}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{new Date(session.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      <div className="flex items-center gap-2">
                        <span>{new Date(session.expires_at).toLocaleString()}</span>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                            new Date(session.expires_at).getTime() > Date.now()
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {new Date(session.expires_at).getTime() > Date.now() ? 'ACTIVE' : 'EXPIRED'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{session.attendance_count}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link
                        to={`/report/${session.id}`}
                        className="inline-block rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
                      >
                        View Report
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

export default TeacherSessions;
