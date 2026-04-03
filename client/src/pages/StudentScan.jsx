import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRScanner from '../components/QRScanner';
import api from '../lib/api';
import { clearAuth, getStoredUser } from '../lib/auth';

function StudentScan() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [status, setStatus] = useState('Scan your class QR to mark attendance.');
  const [scannerState, setScannerState] = useState('idle');
  const [scanLocked, setScanLocked] = useState(false);
  const [manualPayload, setManualPayload] = useState('');
  const [selfieHash, setSelfieHash] = useState('');
  const [location, setLocation] = useState({ latitude: null, longitude: null });

  const deviceId = useMemo(() => {
    const key = 'attendanceDeviceId';
    const existing = localStorage.getItem(key);
    if (existing) {
      return existing;
    }
    const next = `dev-${crypto.randomUUID()}`;
    localStorage.setItem(key, next);
    return next;
  }, []);

  const refreshLocation = () => {
    if (!navigator.geolocation) {
      setStatus('Geolocation is not available in this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      () => {
        setStatus('Unable to fetch your location.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const onSelfieFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(digest));
      const hashHex = hashArray.map((item) => item.toString(16).padStart(2, '0')).join('');
      setSelfieHash(hashHex);
      setStatus('Selfie proof attached successfully.');
    } catch (_error) {
      setStatus('Unable to process selfie proof file.');
      setScannerState('error');
    }
  };

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
      setScannerState('submitting');
      setStatus('Submitting attendance...');

      try {
        const { data } = await api.post('/api/attendance/mark', {
          qrData: decodedText,
          latitude: location.latitude,
          longitude: location.longitude,
          deviceId,
          selfieHash: selfieHash || null
        });
        setStatus(data.message || 'Attendance marked successfully.');
        setScannerState('success');
      } catch (error) {
        const message = error.response?.data?.message || 'Attendance marking failed.';
        setStatus(message);
        setScannerState('error');
      } finally {
        setTimeout(() => {
          setScanLocked(false);
          setScannerState('idle');
        }, 3000);
      }
    },
    [scanLocked]
  );

  const onScanError = useCallback((message) => {
    if (message && (message.toLowerCase().includes('permission') || message.toLowerCase().includes('not detected'))) {
      setStatus(message);
      setScannerState('error');
    }

    return null;
  }, []);

  const submitManualPayload = async (event) => {
    event.preventDefault();

    if (!manualPayload.trim()) {
      setStatus('Please paste a valid payload first.');
      setScannerState('error');
      return;
    }

    setScannerState('submitting');
    setStatus('Submitting attendance...');

    try {
      const { data } = await api.post('/api/attendance/mark-manual', {
        payload: manualPayload.trim(),
        latitude: location.latitude,
        longitude: location.longitude,
        deviceId,
        selfieHash: selfieHash || null
      });
      setStatus(data.message || 'Attendance marked successfully.');
      setScannerState('success');
      setManualPayload('');
    } catch (error) {
      setStatus(error.response?.data?.message || 'Manual attendance submission failed.');
      setScannerState('error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Student Scanner</h1>
            <p className="text-sm text-slate-600">Logged in as {user?.email}</p>
          </div>
          <div className="flex gap-2">
            <Link to="/student/history" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">
              My History
            </Link>
            <button onClick={logout} className="rounded-lg bg-slate-800 px-4 py-2 text-white text-sm hover:bg-slate-900">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm backdrop-blur">
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Scan Attendance QR</h2>
          <p className="mb-4 text-sm text-slate-500">Position the QR code in good lighting for faster detection.</p>
          <QRScanner onScanSuccess={onScanSuccess} onScanError={onScanError} />
          <p className={`mt-4 text-sm font-medium ${statusColor}`}>{status}</p>
          
          {/* Fallback instructions - prominent when scanner is not working */}
          {scannerState === 'error' && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900 mb-2">❌ Scanner Issue Detected</p>
              <p className="text-xs text-amber-800 mb-3">
                {status.includes('permission') 
                  ? 'Camera access is required. Please allow camera permissions and refresh the page.'
                  : status.includes('not detected')
                  ? 'No QR code detected. Make sure the QR code is visible, well-lit, and not too far from the camera.'
                  : 'Try the manual payload option below if scanning continues to fail.'
                }
              </p>
            </div>
          )}

          <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-700">🔐 Device Verification</p>
            <button type="button" onClick={refreshLocation} className="rounded bg-indigo-600 px-3 py-2 text-xs text-white hover:bg-indigo-700">
              Refresh Location
            </button>
            <p className="text-xs text-slate-600">
              Location: {location.latitude ? `✓ ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : '⚠ Not captured'}
            </p>
            <input type="file" accept="image/*" onChange={onSelfieFile} className="block text-xs text-slate-700" />
            <p className="text-xs text-slate-600">Selfie proof: {selfieHash ? `✓ ${selfieHash.slice(0, 12)}...` : '⚠ Not attached (optional)'}</p>
          </div>

          <form onSubmit={submitManualPayload} className={`mt-4 space-y-2 rounded-lg border p-3 ${scannerState === 'error' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
            <p className="text-xs font-semibold text-slate-700">📋 Fallback: Manual Payload Entry</p>
            <p className="text-xs text-slate-600">If QR scanning isn't working, ask your teacher to share the payload below:</p>
            <textarea
              value={manualPayload}
              onChange={(event) => setManualPayload(event.target.value)}
              placeholder='{"sessionId":"...","expiresAt":"...","signature":"..."}'
              className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button type="submit" disabled={!manualPayload.trim()} className="w-full rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50">
              Submit Payload
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default StudentScan;
