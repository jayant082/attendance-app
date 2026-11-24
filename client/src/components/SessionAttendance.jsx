import { useEffect, useState } from 'react';
import AttendanceTable from './AttendanceTable';
import api from '../lib/api';
import { downloadAttendanceCsv } from '../lib/attendanceCsv';

function SessionAttendance({ sessionId, onEndSession, onExtendSession, onCopyPayload, actionLoading = false }) {
  const [rows, setRows] = useState([]);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer;

    const fetchAttendance = async () => {
      try {
        const { data } = await api.get(`/api/attendance/${sessionId}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setRows(data.attendance);
        setSession(data.session);
        setError('');
      } catch (apiError) {
        if (controller.signal.aborted) return;
        setError(apiError.response?.data?.message || 'Unable to load current session attendance.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(fetchAttendance, 5000);
        }
      }
    };

    fetchAttendance();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [sessionId, refreshKey]);

  const exportCsv = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      const { data } = await api.get(`/api/attendance/${sessionId}`);
      setRows(data.attendance);
      setSession(data.session);
      setError('');
      downloadAttendanceCsv(sessionId, data.attendance);
    } catch (apiError) {
      setDownloadError(apiError.response?.data?.message || 'Unable to download attendance CSV.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Current Session Attendance</h2>
          <p className="text-sm text-slate-600">{session?.subject} | Session ID: {sessionId}</p>
          <p className="text-sm text-slate-600">Total present: {rows.length} | Refreshes every 5 seconds</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex max-w-full gap-2">
            <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-800">
              Refresh Attendance
            </button>
            {onEndSession && <button type="button" onClick={onEndSession} disabled={actionLoading} className="rounded-lg bg-rose-600 px-3 py-2 text-sm text-white hover:bg-rose-700 disabled:opacity-60">
              {actionLoading ? 'Updating...' : 'End Session'}
            </button>}
          </div>
          <button type="button" onClick={exportCsv} disabled={loading || downloading} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60">
            {downloading ? 'Downloading...' : 'Download CSV'}
          </button>
          {onExtendSession && <button type="button" onClick={onExtendSession} disabled={actionLoading} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-60">+5 min</button>}
          {onCopyPayload && <button type="button" onClick={onCopyPayload} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-800">Copy Payload</button>}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error} Displayed records may be out of date.</p>}
      {downloadError && <p role="alert" className="text-sm text-red-600">{downloadError}</p>}
      {loading ? <p className="text-sm text-slate-600">Loading attendance...</p> : <AttendanceTable rows={rows} />}
    </section>
  );
}

export default SessionAttendance;
