import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { saveAuth } from '../lib/auth';

function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/api/auth/login', form);
      saveAuth(data);
      if (data.user.role === 'admin') {
        navigate('/admin');
      } else if (data.user.role === 'teacher') {
        navigate('/teacher');
      } else {
        navigate('/scan');
      }
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Unable to login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-50 p-4">
      <div className="mx-auto grid min-h-screen max-w-5xl items-center gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-sm backdrop-blur">
          <p className="mb-3 inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
            2026 Smart Campus Suite
          </p>
          <h1 className="mb-2 text-3xl font-bold text-slate-900">QR-Based Smart Attendance</h1>
          <p className="text-sm text-slate-600">Secure, fast attendance with live reports, audit logs, and analytics.</p>
          <ul className="mt-5 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>Signed QR validation for secure marking</li>
            <li>Manual correction with mandatory reason</li>
            <li>Teacher and student analytics dashboards</li>
          </ul>
        </div>

        <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-xl font-bold text-slate-800">Sign in</h2>
          <p className="mb-6 text-sm text-slate-600">Login with your Supabase credentials.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={onChange}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={onChange}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
          <div className="text-right">
            <a href="/forgot-password" className="text-xs text-indigo-700 hover:text-indigo-800">
              Forgot password?
            </a>
          </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;
