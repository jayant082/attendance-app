import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AttendanceTable from '../components/AttendanceTable';
import StatCard from '../components/StatCard';
import api from '../lib/api';
import { clearAuth } from '../lib/auth';

function AttendanceReport() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [session, setSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [manualForm, setManualForm] = useState({ studentName: '', rollNumber: '', reason: '' });
  const [manualLoading, setManualLoading] = useState(false);
  const [removingId, setRemovingId] = useState('');
  const [liveMode, setLiveMode] = useState(true);
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  const [sessionActionLoading, setSessionActionLoading] = useState(false);
  const [absentees, setAbsentees] = useState([]);
  const [notificationLogs, setNotificationLogs] = useState([]);
  const [notificationLoading, setNotificationLoading] = useState(false);

  const fetchReport = async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      } else {
        setLiveRefreshing(true);
      }

      const [{ data }, { data: summaryData }] = await Promise.all([
        api.get(`/api/attendance/${sessionId}`),
        api.get(`/api/attendance/session/${sessionId}/summary`)
      ]);
      setSession(data.session);
      setRows(data.attendance);
      setSummary(summaryData.summary || null);

      const [absenteeRes, notificationRes] = await Promise.all([
        api.get(`/api/analytics/session/${sessionId}/absentees`),
        api.get(`/api/notifications/session/${sessionId}`)
      ]);
      setAbsentees(absenteeRes.data.absentees || []);
      setNotificationLogs(notificationRes.data.logs || []);
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Unable to load attendance report.');
    } finally {
      if (!silent) {
        setLoading(false);
      } else {
        setLiveRefreshing(false);
      }
    }
  };

  useEffect(() => {
    fetchReport({ silent: false });
  }, [sessionId]);

  useEffect(() => {
    if (!liveMode || !session || new Date(session.expires_at).getTime() <= Date.now()) {
      return;
    }

    const intervalId = setInterval(() => {
      fetchReport({ silent: true });
    }, 10000);

    return () => clearInterval(intervalId);
  }, [liveMode, sessionId, session?.expires_at]);

  const extendSession = async (extraMinutes) => {
    setSessionActionLoading(true);
    setError('');
    setInfo('');

    try {
      const { data } = await api.patch(`/api/session/${sessionId}/extend`, { extraMinutes });
      setSession(data.session);
      setInfo(data.message || 'Session extended successfully.');
      await fetchReport({ silent: true });
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Unable to extend session.');
    } finally {
      setSessionActionLoading(false);
    }
  };

  const endSession = async () => {
    if (!window.confirm('End this session now?')) {
      return;
    }

    setSessionActionLoading(true);
    setError('');
    setInfo('');

    try {
      const { data } = await api.patch(`/api/session/${sessionId}/end`);
      setSession(data.session);
      setInfo(data.message || 'Session ended successfully.');
      await fetchReport({ silent: true });
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Unable to end session.');
    } finally {
      setSessionActionLoading(false);
    }
  };

  const logout = () => {
    clearAuth();
    navigate('/');
  };

  const filteredAndSortedRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    const filtered = !normalized
      ? rows
      : rows.filter((row) => {
          const name = (row.student_name || '').toLowerCase();
          const roll = (row.roll_number || '').toLowerCase();
          return name.includes(normalized) || roll.includes(normalized);
        });

    return [...filtered].sort((first, second) => {
      const firstTime = new Date(first.marked_at).getTime();
      const secondTime = new Date(second.marked_at).getTime();
      return sortOrder === 'asc' ? firstTime - secondTime : secondTime - firstTime;
    });
  }, [query, rows, sortOrder]);

  const escapeCsv = (value) => {
    const content = String(value ?? '');
    return `"${content.replaceAll('"', '""')}"`;
  };

  const exportCsv = () => {
    const header = ['Student Name', 'Roll Number', 'Time of Scan'];
    const csvRows = filteredAndSortedRows.map((row) => [row.student_name || 'N/A', row.roll_number || 'N/A', new Date(row.marked_at).toLocaleString()]);
    const csvContent = [header, ...csvRows].map((line) => line.map(escapeCsv).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `attendance-${sessionId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const onManualChange = (event) => {
    const { name, value } = event.target;
    setManualForm((prev) => ({ ...prev, [name]: value }));
  };

  const addManualAttendance = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');
    setManualLoading(true);

    try {
      const { data } = await api.post('/api/attendance/manual-mark', {
        sessionId,
        studentName: manualForm.studentName.trim(),
        rollNumber: manualForm.rollNumber.trim(),
        reason: manualForm.reason.trim()
      });

      setRows((prev) => [...prev, data.attendance]);
      setManualForm({ studentName: '', rollNumber: '', reason: '' });
      setInfo(data.message || 'Manual attendance added successfully.');
      await fetchReport({ silent: true });
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Unable to add manual attendance.');
    } finally {
      setManualLoading(false);
    }
  };

  const removeAttendance = async (row) => {
    const reason = window.prompt('Enter reason for removing this attendance record:');

    if (!reason || !reason.trim()) {
      return;
    }

    setError('');
    setInfo('');
    setRemovingId(row.id);

    try {
      const { data } = await api.delete(`/api/attendance/${row.id}`, {
        data: {
          sessionId,
          reason: reason.trim()
        }
      });

      setRows((prev) => prev.filter((item) => item.id !== row.id));
      setInfo(data.message || 'Attendance record removed successfully.');
      await fetchReport({ silent: true });
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Unable to remove attendance record.');
    } finally {
      setRemovingId('');
    }
  };

  const sendAbsenteeNotifications = async () => {
    setNotificationLoading(true);
    setError('');
    setInfo('');

    try {
      const { data } = await api.post(`/api/notifications/session/${sessionId}/absentees`);
      setInfo(data.message || 'Notifications queued successfully.');
      await fetchReport({ silent: true });
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Unable to send absentee notifications.');
    } finally {
      setNotificationLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Attendance Report</h1>
            <p className="text-sm text-slate-600">Session ID: {sessionId}</p>
          </div>
          <div className="flex gap-2">
            <Link to="/teacher" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">
              Back to Dashboard
            </Link>
            <Link to={`/audit/${sessionId}`} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">
              Audit Logs
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
        {info && <p className="text-green-600">{info}</p>}

        {summary && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Present" value={summary.totalPresent} hint="Students marked" />
            <StatCard label="On Time" value={summary.onTimeCount} hint="Within 5 min grace" />
            <StatCard label="Late" value={summary.lateCount} hint="After grace window" />
            <StatCard label="Session Status" value={summary.status?.toUpperCase() || 'N/A'} hint="Live session state" />
          </div>
        )}

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
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => fetchReport({ silent: true })}
                className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                {liveRefreshing ? 'Refreshing...' : 'Refresh now'}
              </button>
              <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700">
                <input type="checkbox" checked={liveMode} onChange={(event) => setLiveMode(event.target.checked)} />
                Live auto-refresh (10s)
              </label>
              <button
                onClick={() => extendSession(5)}
                disabled={sessionActionLoading}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                Extend +5 min
              </button>
              <button
                onClick={endSession}
                disabled={sessionActionLoading}
                className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
              >
                End Session
              </button>
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Absentee Notifications</h2>
                <p className="text-sm text-slate-600">Current absentees: {absentees.length}</p>
              </div>
              <button
                onClick={sendAbsenteeNotifications}
                disabled={notificationLoading}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {notificationLoading ? 'Queuing...' : 'Notify Absentees'}
              </button>
            </div>

            {notificationLogs.length > 0 && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">Recent notification logs</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {notificationLogs.slice(0, 5).map((entry) => (
                    <li key={entry.id}>
                      {new Date(entry.created_at).toLocaleString()} - {entry.status}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!loading && !error && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Manual Attendance Correction</h2>
            <form onSubmit={addManualAttendance} className="grid gap-3 md:grid-cols-4">
              <input
                name="studentName"
                value={manualForm.studentName}
                onChange={onManualChange}
                placeholder="Student Name"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <input
                name="rollNumber"
                value={manualForm.rollNumber}
                onChange={onManualChange}
                placeholder="Roll Number"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <input
                name="reason"
                value={manualForm.reason}
                onChange={onManualChange}
                placeholder="Reason"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <button
                type="submit"
                disabled={manualLoading}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {manualLoading ? 'Adding...' : 'Add Manually'}
              </button>
            </form>
          </div>
        )}

        {!loading && !error && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex w-full flex-col gap-3 md:flex-row">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by student name or roll number"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <select
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="asc">Time: Oldest first</option>
                  <option value="desc">Time: Newest first</option>
                </select>
              </div>
              <button
                onClick={exportCsv}
                disabled={filteredAndSortedRows.length === 0}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                Export CSV
              </button>
            </div>
          </div>
        )}

        {!loading && !error && <AttendanceTable rows={filteredAndSortedRows} onRemove={removeAttendance} removingId={removingId} />}
      </main>
    </div>
  );
}

export default AttendanceReport;
