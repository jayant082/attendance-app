import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../lib/api';

function AuditLogs() {
  const { sessionId } = useParams();
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get(`/api/audit/session/${sessionId}`);
        setLogs(data.logs || []);
      } catch (apiError) {
        setError(apiError.response?.data?.message || 'Failed to load audit logs.');
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
          <Link to={`/report/${sessionId}`} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">
            Back to Report
          </Link>
        </div>

        {loading && <p className="text-sm text-slate-600">Loading logs...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && logs.length === 0 && <p className="text-sm text-slate-600">No audit logs for this session.</p>}

        {!loading && !error && logs.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Time</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Action</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Student</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Roll</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-3 py-2 text-sm">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-sm">{log.action}</td>
                    <td className="px-3 py-2 text-sm">{log.student_name || 'N/A'}</td>
                    <td className="px-3 py-2 text-sm">{log.roll_number || 'N/A'}</td>
                    <td className="px-3 py-2 text-sm">{log.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AuditLogs;
