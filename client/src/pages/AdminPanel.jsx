import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { clearAuth, getStoredUser } from '../lib/auth';

function AdminPanel() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [users, setUsers] = useState([]);
  const [subjectForm, setSubjectForm] = useState({ code: '', name: '', semester: '', section: '', teacherId: '' });
  const [enrollmentForm, setEnrollmentForm] = useState({ subjectId: '', studentId: '', rollNumber: '' });

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/api/admin/users');
      setUsers(data.users || []);
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to load admin users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const logout = () => {
    clearAuth();
    navigate('/');
  };

  const toggleUser = async (target) => {
    try {
      const { data } = await api.patch(`/api/admin/users/${target.id}/status`, {
        isActive: !target.isActive
      });
      setInfo(data.message || 'User status updated.');
      await loadUsers();
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to update user status.');
    }
  };

  const updateRole = async (targetId, role) => {
    try {
      const { data } = await api.patch(`/api/admin/users/${targetId}/role`, { role });
      setInfo(data.message || 'Role updated.');
      await loadUsers();
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to update role.');
    }
  };

  const createSubject = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');

    try {
      const { data } = await api.post('/api/admin/subjects', {
        code: subjectForm.code,
        name: subjectForm.name,
        semester: subjectForm.semester ? Number(subjectForm.semester) : null,
        section: subjectForm.section || null,
        teacherId: subjectForm.teacherId
      });
      setInfo(data.message || 'Subject created.');
      setSubjectForm({ code: '', name: '', semester: '', section: '', teacherId: '' });
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to create subject.');
    }
  };

  const enrollStudent = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');

    try {
      const { data } = await api.post('/api/admin/enrollments', enrollmentForm);
      setInfo(data.message || 'Enrollment created.');
      setEnrollmentForm({ subjectId: '', studentId: '', rollNumber: '' });
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to create enrollment.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Admin Panel</h1>
            <p className="text-sm text-slate-600">{user?.email}</p>
          </div>
          <div className="flex gap-2">
            <Link to="/teacher" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">
              Teacher View
            </Link>
            <button onClick={logout} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-900">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">User Lifecycle</h2>
          {loading && <p className="mt-2 text-sm text-slate-600">Loading users...</p>}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {info && <p className="mt-2 text-sm text-emerald-700">{info}</p>}

          {!loading && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700">Email</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700">Role</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {users.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-sm text-slate-800">{item.email}</td>
                      <td className="px-3 py-2 text-sm text-slate-700">
                        <select
                          value={item.role}
                          onChange={(event) => updateRole(item.id, event.target.value)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs"
                        >
                          <option value="admin">admin</option>
                          <option value="teacher">teacher</option>
                          <option value="student">student</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700">{item.isActive ? 'ACTIVE' : 'DISABLED'}</td>
                      <td className="px-3 py-2 text-sm">
                        <button onClick={() => toggleUser(item)} className="rounded bg-slate-800 px-2 py-1 text-xs text-white">
                          {item.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create Subject</h2>
          <form onSubmit={createSubject} className="mt-3 space-y-2">
            <input value={subjectForm.code} onChange={(e) => setSubjectForm((p) => ({ ...p, code: e.target.value }))} placeholder="Code" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" required />
            <input value={subjectForm.name} onChange={(e) => setSubjectForm((p) => ({ ...p, name: e.target.value }))} placeholder="Name" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" required />
            <input value={subjectForm.semester} onChange={(e) => setSubjectForm((p) => ({ ...p, semester: e.target.value }))} placeholder="Semester" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            <input value={subjectForm.section} onChange={(e) => setSubjectForm((p) => ({ ...p, section: e.target.value }))} placeholder="Section" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            <input value={subjectForm.teacherId} onChange={(e) => setSubjectForm((p) => ({ ...p, teacherId: e.target.value }))} placeholder="Teacher User ID" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" required />
            <button className="rounded bg-indigo-600 px-4 py-2 text-sm text-white">Create Subject</button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Enroll Student</h2>
          <form onSubmit={enrollStudent} className="mt-3 space-y-2">
            <input value={enrollmentForm.subjectId} onChange={(e) => setEnrollmentForm((p) => ({ ...p, subjectId: e.target.value }))} placeholder="Subject ID" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" required />
            <input value={enrollmentForm.studentId} onChange={(e) => setEnrollmentForm((p) => ({ ...p, studentId: e.target.value }))} placeholder="Student User ID" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" required />
            <input value={enrollmentForm.rollNumber} onChange={(e) => setEnrollmentForm((p) => ({ ...p, rollNumber: e.target.value }))} placeholder="Roll Number" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            <button className="rounded bg-emerald-600 px-4 py-2 text-sm text-white">Create Enrollment</button>
          </form>
        </section>
      </main>
    </div>
  );
}

export default AdminPanel;
