import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRScanner from '../components/QRScanner';
import api from '../lib/api';
import { clearAuth, getStoredUser } from '../lib/auth';

function StudentScan() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [status, setStatus] = useState('Scan your class QR to mark attendance.');
  const [scanLocked, setScanLocked] = useState(false);

  const statusColor = useMemo(() => {
    if (status.toLowerCase().includes('success')) return 'text-green-600';
    if (status.toLowerCase().includes('failed') || status.toLowerCase().includes('expired') || status.toLowerCase().includes('already')) {
      return 'text-red-600';
    }
    return 'text-slate-700';
  }, [status]);

  const logout = () => {
    clearAuth();
    navigate('/');
  };

  const onScanSuccess = useCallback(
    async (decodedText) => {
      if (scanLocked) {
        return;
      }

      setScanLocked(true);
      setStatus('Submitting attendance...');

      try {
        const { data } = await api.post('/api/attendance/mark', { qrData: decodedText });
        setStatus(data.message || 'Attendance marked successfully.');
      } catch (error) {
        const message = error.response?.data?.message || 'Attendance marking failed.';
        setStatus(message);
      } finally {
        setTimeout(() => setScanLocked(false), 3000);
      }
    },
    [scanLocked]
  );

  const onScanError = useCallback(() => {
    return null;
  }, []);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Student Scanner</h1>
            <p className="text-sm text-slate-600">Logged in as {user?.email}</p>
          </div>
          <button onClick={logout} className="rounded-lg bg-slate-800 px-4 py-2 text-white text-sm hover:bg-slate-900">
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Scan Attendance QR</h2>
          <QRScanner onScanSuccess={onScanSuccess} onScanError={onScanError} />
          <p className={`mt-4 text-sm font-medium ${statusColor}`}>{status}</p>
        </div>
      </main>
    </div>
  );
}

export default StudentScan;
