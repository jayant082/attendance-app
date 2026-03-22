import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AttendanceTable from '../components/AttendanceTable';
import api from '../lib/api';
import { clearAuth } from '../lib/auth';

function AttendanceReport() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const { data } = await api.get(`/api/attendance/${sessionId}`);
        setSession(data.session);
        setRows(data.attendance);
      } catch (apiError) {
        setError(apiError.response?.data?.message || 'Unable to load attendance report.');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [sessionId]);

  const logout = () => {
    clearAuth();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Attendance Report</h1>
            <p className="text-sm text-slate-600">Session ID: {sessionId}</p>
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

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        {loading && <p className="text-slate-600">Loading report...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {session && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-700">
              Subject: <span className="font-semibold text-slate-900">{session.subject}</span>
            </p>
            <p className="text-sm text-slate-700">
              Created: <span className="font-semibold text-slate-900">{new Date(session.created_at).toLocaleString()}</span>
            </p>
            <p className="text-sm text-slate-700">
              Expires: <span className="font-semibold text-slate-900">{new Date(session.expires_at).toLocaleString()}</span>
            </p>
          </div>
        )}

        {!loading && !error && <AttendanceTable rows={rows} />}
      </main>
    </div>
  );
}

export default AttendanceReport;
