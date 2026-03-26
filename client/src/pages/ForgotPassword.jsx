import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const requestReset = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setStatus('');

    try {
      const { data } = await api.post('/api/auth/request-password-reset', { email: email.trim() });
      setStatus(data.message || 'Reset password request sent.');
      setEmail('');
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to send reset request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-50 p-4">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Forgot Password</h1>
        <p className="mt-2 text-sm text-slate-600">We will send a password reset email to your registered account.</p>

        <form onSubmit={requestReset} className="mt-4 space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
          />
          <button disabled={loading} className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
            {loading ? 'Sending...' : 'Send Reset Email'}
          </button>
        </form>

        {status && <p className="mt-3 text-sm text-emerald-700">{status}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <Link to="/" className="mt-4 inline-block text-sm text-indigo-700">Back to Login</Link>
      </div>
    </div>
  );
}

export default ForgotPassword;
