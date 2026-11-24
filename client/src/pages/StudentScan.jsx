import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRScanner from '../components/QRScanner';
import api from '../lib/api';
import { clearAuth, getStoredUser } from '../lib/auth';

const locationErrorMessage = (error) => ({
  1: 'Location permission denied. Allow location access to verify attendance.',
  2: 'Location is unavailable. Try again when GPS is available.',
  3: 'Location request timed out. Please try again.'
}[error.code] || 'Unable to get your current location.');

const readCurrentLocation = () => new Promise((resolve, reject) => {
  if (!window.isSecureContext || !navigator.geolocation) {
    reject(new Error('Location verification requires HTTPS or localhost and a browser with location support.'));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
    (error) => reject(new Error(locationErrorMessage(error))),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
});

function StudentScan() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [status, setStatus] = useState('Select your class session before marking attendance.');
  const [scannerState, setScannerState] = useState('idle');
  const scanLocked = useRef(false);
  const sessionsRequest = useRef(null);
  const [manualPayload, setManualPayload] = useState('');
  const [selfieHash, setSelfieHash] = useState('');
  const [location, setLocation] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState('');
  const [verifiedSessionId, setVerifiedSessionId] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [locationAttempt, setLocationAttempt] = useState(0);
  const [sessionExpired, setSessionExpired] = useState(false);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId);
  const usesGeofence = selectedSession?.radius_meters != null;
  const expiresAt = selectedSession?.expires_at;
  const locationVerified = verifiedSessionId === selectedSessionId;
  const canUseAttendance = Boolean(selectedSession) && !sessionExpired &&
    (!usesGeofence || locationVerified) && !['submitting', 'success', 'error'].includes(scannerState);

  const deviceId = useMemo(() => {
    const key = 'attendanceDeviceId';
    const existing = localStorage.getItem(key);
    if (existing) {
      return existing;
    }
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const next = `dev-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    localStorage.setItem(key, next);
    return next;
  }, []);

  const refreshSessions = useCallback(async () => {
    sessionsRequest.current?.abort();
    const controller = new AbortController();
    sessionsRequest.current = controller;
    setSessionsLoading(true);
    setSessionsError('');
    try {
      const { data } = await api.get('/api/session/available', { signal: controller.signal });
      if (controller.signal.aborted) return;
      setSessions(data.sessions);
      setSelectedSessionId((current) => data.sessions.some((session) => session.id === current) ? current : data.sessions[0]?.id || '');
    } catch (error) {
      if (controller.signal.aborted) return;
      setSessions([]);
      setSelectedSessionId('');
      setSessionsError(error.response?.data?.message || 'Unable to load available sessions.');
    } finally {
      if (!controller.signal.aborted) setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSessions();
    return () => sessionsRequest.current?.abort();
  }, [refreshSessions]);

  useEffect(() => {
    scanLocked.current = false;
    setScannerState('idle');
    setManualPayload('');
    setStatus('Scan the QR for the selected session once location verification is complete.');
  }, [selectedSessionId]);

  useEffect(() => {
    const remaining = new Date(expiresAt).getTime() - Date.now();
    setSessionExpired(!expiresAt || remaining <= 0);
    if (!expiresAt || remaining <= 0) return;
    const timer = setTimeout(() => setSessionExpired(true), remaining);
    return () => clearTimeout(timer);
  }, [expiresAt]);

  useEffect(() => {
    setVerifiedSessionId(null);
    setLocationError('');
    setLocation(null);
    if (!selectedSessionId || !usesGeofence || sessionExpired) return;
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationError('Location verification requires HTTPS or localhost and a browser with location support.');
      return;
    }
    let active = true;
    let verificationRequest;
    const watchId = navigator.geolocation.watchPosition(async (position) => {
      if (!active) return;
      verificationRequest?.abort();
      const controller = new AbortController();
      verificationRequest = controller;
      const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setLocation(coordinates);
      try {
        const { data } = await api.post('/api/attendance/verify-location', { sessionId: selectedSessionId, ...coordinates }, { signal: controller.signal });
        if (!active || controller.signal.aborted) return;
        if (data.verified !== true || data.sessionId !== selectedSessionId) {
          throw new Error('The server did not verify your location for this session.');
        }
        setVerifiedSessionId(selectedSessionId);
        setLocationError('');
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setVerifiedSessionId(null);
        setLocationError(error.response?.data?.message || error.message || 'Location verification failed.');
      }
    }, (error) => {
      verificationRequest?.abort();
      if (!active) return;
      setVerifiedSessionId(null);
      setLocationError(locationErrorMessage(error));
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    return () => {
      active = false;
      verificationRequest?.abort();
      navigator.geolocation.clearWatch(watchId);
    };
  }, [selectedSessionId, usesGeofence, expiresAt, sessionExpired, locationAttempt]);

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

  const submitAttendance = useCallback(
    async (decodedText, manual = false) => {
      if (scanLocked.current) {
        return;
      }
      if (!canUseAttendance) {
        setStatus('Select an active session and complete its location verification first.');
        return;
      }

      scanLocked.current = true;
      setScannerState('submitting');
      setStatus('Submitting attendance...');

      try {
        const payload = JSON.parse(decodedText);
        if (!payload || payload.sessionId !== selectedSessionId) {
          throw new Error('This QR or payload does not match your selected session.');
        }
        const coordinates = usesGeofence ? await readCurrentLocation() : { latitude: null, longitude: null };
        if (usesGeofence) setLocation(coordinates);
        const { data } = await api.post(manual ? '/api/attendance/mark-manual' : '/api/attendance/mark', {
          [manual ? 'payload' : 'qrData']: decodedText,
          ...coordinates,
          deviceId,
          selfieHash: selfieHash || null
        });
        setStatus(data.message || 'Attendance marked successfully.');
        setScannerState('success');
        setManualPayload('');
      } catch (error) {
        const message = error.response?.data?.message || error.message || 'Attendance marking failed.';
        setStatus(message);
        setScannerState('error');
        if (usesGeofence) setVerifiedSessionId(null);
      }
    },
    [canUseAttendance, deviceId, selectedSessionId, usesGeofence, selfieHash]
  );
  const onScanSuccess = useCallback((decodedText) => submitAttendance(decodedText), [submitAttendance]);

  const submitManualPayload = async (event) => {
    event.preventDefault();

    if (!manualPayload.trim()) {
      setStatus('Please paste a valid payload first.');
      setScannerState('error');
      return;
    }

    await submitAttendance(manualPayload.trim(), true);
  };

  const resetScanner = () => {
    scanLocked.current = false;
    setScannerState('idle');
    setStatus('Ready to verify location and scan the selected session.');
    setLocationAttempt((value) => value + 1);
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
          <div className="mb-4 space-y-2">
            <label htmlFor="attendance-session" className="block text-sm font-medium text-slate-700">Class session</label>
            <select id="attendance-session" value={selectedSessionId} disabled={sessionsLoading || scannerState === 'submitting'} onChange={(event) => setSelectedSessionId(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">{sessionsLoading ? 'Loading sessions...' : 'Select an active session'}</option>
              {sessions.map((session) => <option key={session.id} value={session.id}>{session.subject}</option>)}
            </select>
            <button type="button" disabled={sessionsLoading || scannerState === 'submitting'} onClick={refreshSessions} className="rounded bg-slate-700 px-3 py-2 text-sm text-white disabled:opacity-50">Refresh Sessions</button>
            {sessionsError && <p role="alert" className="text-sm text-red-600">{sessionsError}</p>}
            {!sessionsLoading && !sessionsError && sessions.length === 0 && <p className="text-sm text-slate-600">No active sessions are available for your enrolled subjects.</p>}
            {sessionExpired && selectedSession && <p role="alert" className="text-sm text-red-600">This session has expired. Refresh sessions to select another class.</p>}
          </div>
          <p className="mb-4 text-sm text-slate-500">Position the QR code in good lighting for faster detection.</p>
          {!window.isSecureContext && (
            <p className="mb-4 text-sm text-amber-800">Camera access requires HTTPS or localhost. Open this app over HTTPS on your phone, or use the manual payload below.</p>
          )}
          {canUseAttendance ? <QRScanner onScanSuccess={onScanSuccess} /> : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Scanner is locked until the selected session is ready and any required location check has passed.</p>}
          <p className={`mt-4 text-sm font-medium ${statusColor}`}>{status}</p>
          {['success', 'error'].includes(scannerState) && (
            <button type="button" onClick={resetScanner} className="mt-3 rounded bg-indigo-600 px-3 py-2 text-sm text-white">
              {scannerState === 'success' ? 'Scan another QR' : 'Try Again'}
            </button>
          )}

          <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-700">🔐 Device Verification</p>
            {usesGeofence && <button type="button" onClick={() => setLocationAttempt((value) => value + 1)} disabled={scannerState === 'submitting'} className="rounded bg-indigo-600 px-3 py-2 text-xs text-white hover:bg-indigo-700">
              Verify Location Again
            </button>}
            <p className="text-xs text-slate-600">
              {!selectedSession ? 'Select an active class session first.' : usesGeofence ? `Allowed radius: ${selectedSession.radius_meters}m. ${locationVerified ? 'Location verified.' : 'Waiting for location verification.'}` : 'This session has no radius configured; location verification is not required.'}
            </p>
            {locationError && <p role="alert" className="text-sm text-red-600">{locationError}</p>}
            <p className="text-xs text-slate-600">
              Location: {location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'Not captured'}
            </p>
            <input type="file" accept="image/*" onChange={onSelfieFile} className="block text-xs text-slate-700" />
            <p className="text-xs text-slate-600">Selfie proof: {selfieHash ? `✓ ${selfieHash.slice(0, 12)}...` : '⚠ Not attached (optional)'}</p>
          </div>

          <form onSubmit={submitManualPayload} className={`mt-4 space-y-2 rounded-lg border p-3 ${scannerState === 'error' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
            <p className="text-xs font-semibold text-slate-700">📋 Fallback: Manual Payload Entry</p>
            <p className="text-xs text-slate-600">If QR scanning isn't working, ask your teacher to share the payload below:</p>
            <textarea
              value={manualPayload}
              disabled={!canUseAttendance}
              onChange={(event) => setManualPayload(event.target.value)}
              placeholder='{"sessionId":"...","expiresAt":"...","signature":"..."}'
              className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button type="submit" disabled={!canUseAttendance || !manualPayload.trim()} className="w-full rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50">
              Submit Payload
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default StudentScan;
