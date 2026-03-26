import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { clearAuth, getStoredUser } from '../lib/auth';
import StatCard from '../components/StatCard';

function StudentHistory() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 10 });

  const fetchPage = async (page) => {
    setLoading(true);
    setError('');

    try {
      const { data } = await api.get('/api/attendance/student/me', { params: { page, limit: 10 } });
      setRows(data.rows || []);
      setPagination(data.pagination || { page: 1, totalPages: 1, total: 0, limit: 10 });
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Unable to load attendance history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(1);
  }, []);

  const logout = () => {
    clearAuth();
    navigate('/');
  };

  const attendanceStats = useMemo(() => {
    const total = pagination.total || 0;
    const thisMonth = rows.filter((row) => {
      const date = new Date(row.marked_at);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length;

    return { total, thisMonth };
  }, [pagination.total, rows]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">My Attendance</h1>
            <p className="text-sm text-slate-600">{user?.email}</p>
          </div>
          <div className="flex gap-2">
            <Link to="/scan" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">
              Back to Scanner
            </Link>
            <button onClick={logout} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-900">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Total Marked" value={attendanceStats.total} hint="All sessions" />
          <StatCard label="This Month" value={attendanceStats.thisMonth} hint="Recent consistency" />
        </div>

        {loading && <p className="text-slate-600">Loading history...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && !error && rows.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-600">No attendance records found.</div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Subject</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Roll Number</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Marked At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-sm text-slate-800">{row.sessions?.subject || 'N/A'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.roll_number || 'N/A'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{new Date(row.marked_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
            <button
              disabled={pagination.page <= 1}
              onClick={() => fetchPage(pagination.page - 1)}
              className="rounded-lg bg-slate-200 px-3 py-2 text-sm text-slate-800 disabled:opacity-60"
            >
              Previous
            </button>
            <p className="text-sm text-slate-700">
              Page {pagination.page} of {pagination.totalPages}
            </p>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchPage(pagination.page + 1)}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-60"
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default StudentHistory;
