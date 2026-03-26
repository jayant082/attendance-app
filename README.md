# QR-Based Smart Attendance System for Quality Education

A complete minor-project implementation using:
- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- Auth + DB: Supabase
- QR Generation: qrcode.react
- QR Scanning: html5-qrcode
- Token Security: JWT

## Project Structure

```text
root/
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── TeacherDashboard.jsx
│   │   │   ├── StudentScan.jsx
│   │   │   └── AttendanceReport.jsx
│   │   ├── components/
│   │   │   ├── QRGenerator.jsx
│   │   │   ├── QRScanner.jsx
│   │   │   └── AttendanceTable.jsx
│   │   └── App.jsx
└── server/
    ├── routes/
    │   ├── auth.js
    │   ├── session.js
    │   └── attendance.js
    ├── middleware/
    │   └── verifyToken.js
    └── index.js
```

## Supabase SQL Schema

Run this in your Supabase SQL editor:

```sql
create table sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references auth.users(id),
  subject text not null,
  created_at timestamp default now(),
  expires_at timestamp not null
);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  student_id uuid references auth.users(id),
  student_name text,
  roll_number text,
  marked_at timestamp default now(),
  unique(session_id, student_id)
);

create table attendance_audit_logs (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid,
  session_id uuid references sessions(id),
  teacher_id uuid references auth.users(id),
  action text not null,
  reason text not null,
  student_name text,
  roll_number text,
  created_at timestamp default now()
);

create index idx_sessions_teacher_created_at on sessions(teacher_id, created_at desc);
create index idx_attendance_session_marked_at on attendance(session_id, marked_at asc);
create unique index idx_attendance_session_roll_unique on attendance(session_id, roll_number) where roll_number is not null;
```

## Environment Variables

### `client/.env`
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=http://localhost:5000
```

### `server/.env`
```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET=your_jwt_secret
QR_SECRET=your_qr_secret
CLIENT_URL=http://localhost:5173
PORT=5000
```

## Production-Level Enhancements (2026 Update)

### Newly Added End-to-End Minor Project Features
- Class roster and enrollment management (`subjects`, `enrollments`, `subject_teachers`)
- Subject-wise attendance percentage and defaulter analytics
- Admin panel APIs for user role/status lifecycle and academic setup
- Timetable-aware session creation validation (`timetable_slots`)
- Anti-proxy controls:
  - Geofence validation (latitude/longitude + radius)
  - Device registry tracking
  - Optional selfie hash proof
- Password recovery endpoint + frontend flow
- Absentee notification queue and logs
- Audit log viewer APIs and UI route
- Analytics dashboard route with trend + defaulters
- Supabase RLS policy setup included in schema
- API smoke test setup (`node --test` + `supertest`)
- Monitoring endpoints and backup/restore plan response

### Security & Reliability
- Helmet security headers enabled
- Global API rate limit + stricter auth route rate limit
- Structured request logging with Morgan
- Signed QR payload (HMAC) verification
- Role enforcement and role mismatch protection

### Teacher Features
- Session creation with secure QR and countdown
- Session history with attendance counts and active/expired state
- Active session lifecycle controls:
  - Extend session duration
  - End session immediately
- Attendance report analytics:
  - Total present
  - On-time count
  - Late count (5-minute grace window)
- Manual attendance correction with mandatory reason:
  - Add manual attendance
  - Remove attendance record
- CSV export for report submission
- Live report auto-refresh (10-second sync)

### Student Features
- QR attendance scanner with improved camera error handling
- Manual payload fallback submit (for camera failure scenarios)
- Personal attendance history with pagination
- Student attendance summary cards (total + current month)

### Auditability
- `attendance_audit_logs` table for manual correction traceability
- Indexed session and attendance lookups for faster report loading

## Local Setup

### 1) Backend
```bash
cd server
npm install
npm run dev
```

### 2) Frontend
```bash
cd client
npm install
npm run dev
```

## API Endpoints

- `POST /api/auth/login`
- `POST /api/session/create`
- `GET /api/session/history`
- `GET /api/session/active`
- `PATCH /api/session/:sessionId/extend`
- `PATCH /api/session/:sessionId/end`
- `POST /api/attendance/mark`
- `POST /api/attendance/mark-manual`
- `POST /api/attendance/manual-mark`
- `DELETE /api/attendance/:attendanceId`
- `GET /api/attendance/:sessionId`
- `GET /api/attendance/session/:sessionId/summary`
- `GET /api/attendance/student/me?page=1&limit=10`
- `POST /api/auth/request-password-reset`
- `GET /api/roster/subjects`
- `GET /api/roster/subject/:subjectId/students`
- `GET /api/analytics/teacher-overview`
- `GET /api/analytics/subject/:subjectId/defaulters?threshold=75`
- `GET /api/analytics/session/:sessionId/absentees`
- `GET /api/audit/session/:sessionId`
- `POST /api/notifications/session/:sessionId/absentees`
- `GET /api/notifications/session/:sessionId`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:userId/status`
- `PATCH /api/admin/users/:userId/role`
- `POST /api/admin/subjects`
- `POST /api/admin/enrollments`
- `POST /api/admin/timetable-slots`
- `GET /api/monitoring/metrics`
- `GET /api/monitoring/health/detail`

## Security Notes

- User role is resolved from Supabase `user_metadata.role` only.
- Allowed roles: `teacher` and `student`.
- Role is never accepted from client input.
- QR payload uses HMAC signature verification; no shared secret is exposed inside QR data.

## Important Supabase User Setup

- Required: set `app_metadata.role` (preferred) or `user_metadata.role` for each account (`admin`/`teacher`/`student`) in Supabase.
- For student attendance percentages/defaulters, ensure enrollments are created per subject.

## New UX Features Added

- Teacher session history page with per-session attendance count.
- Attendance report search (name/roll), time sorting, and CSV export.
- Teacher manual corrections with mandatory reason:
  - Add attendance manually
  - Remove attendance entry
- Manual corrections are logged in `attendance_audit_logs`.

## Day-by-Day Execution Plan

### Day 1
- Configure Supabase project + SQL schema
- Complete frontend/backend scaffolding
- Implement login for teacher and student
- Implement teacher session generation + QR display

### Day 2
- Implement student scanner + attendance marking
- Implement all backend APIs and validation sequence
- Add duplicate prevention logic
- Integrate frontend with backend

### Day 3
- Build attendance report page
- Add session expiry countdown UI
- Polish Tailwind UI
- Deploy frontend to Vercel and backend to Render
- Test complete E2E flow

## Deployment

### Frontend (Vercel)
1. Import `client` folder as project in Vercel.
2. Add frontend env vars from `client/.env`.
3. Build command: `npm run build`
4. Output directory: `dist`

### Backend (Render)
1. Create a new Web Service from `server` folder.
2. Build command: `npm install`
3. Start command: `npm start`
4. Add env vars from `server/.env`.
5. Set `VITE_API_URL` in frontend to deployed Render URL.

## Testing

Backend API smoke test:

```bash
cd server
npm install
npm test
```

## Notes on Alerts and Monitoring

- Notification APIs currently queue absentee alerts in `notification_logs` for auditable delivery workflow.
- `/api/monitoring/health/detail` includes an explicit backup/restore plan block for project evaluation.

## Notes
- Login uses Supabase Auth email/password.
- Teacher/student role is enforced from Supabase metadata; selected role can bootstrap missing metadata for local/demo flow.
- Attendance duplicate prevention is enforced in two layers:
  - Pre-insert check in backend
  - DB unique constraint `(session_id, student_id)`
