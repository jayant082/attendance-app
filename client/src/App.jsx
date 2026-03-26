import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import TeacherDashboard from './pages/TeacherDashboard';
import TeacherSessions from './pages/TeacherSessions';
import StudentScan from './pages/StudentScan';
import StudentHistory from './pages/StudentHistory';
import AttendanceReport from './pages/AttendanceReport';
import TeacherAnalytics from './pages/TeacherAnalytics';
import AuditLogs from './pages/AuditLogs';
import AdminPanel from './pages/AdminPanel';
import ForgotPassword from './pages/ForgotPassword';
import { getStoredUser } from './lib/auth';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const user = getStoredUser();
  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    if (user.role === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to={user.role === 'teacher' ? '/teacher' : '/scan'} replace />;
  }

  return children;
};

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route
        path="/teacher"
        element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <TeacherDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/sessions"
        element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <TeacherSessions />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/analytics"
        element={
          <ProtectedRoute allowedRoles={['teacher', 'admin']}>
            <TeacherAnalytics />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scan"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <StudentScan />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/history"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <StudentHistory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/report/:sessionId"
        element={
          <ProtectedRoute allowedRoles={['teacher', 'admin']}>
            <AttendanceReport />
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit/:sessionId"
        element={
          <ProtectedRoute allowedRoles={['teacher', 'admin']}>
            <AuditLogs />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminPanel />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
