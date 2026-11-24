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
- Session creation with secure QR and countdown. An active session switches the
  dashboard to a large, viewport-sized QR presentation, hiding the creation form,
  statistics, and setup checklist. The form returns after the session ends.
- Teacher latitude and longitude are captured automatically on opening the
  dashboard after browser permission is granted. **Use Current Location**
  retries the request; manual entry remains available if permission is denied,
  location is unavailable, or the request times out. HTTPS or localhost is required.
- Current session attendance on the dashboard with student names, roll numbers,
  scan times, and a present count; refreshes automatically every 5 seconds.
- Dashboard CSV download fetches the latest records for that session before
  exporting. Active session attendance is restored after reloading the dashboard.
- Session history with attendance counts and active/expired state
- Active session lifecycle controls:
  - Extend session duration
  - **End Session** directly beside **Refresh Attendance** in the dashboard's
    attendance report below the QR, including after reloading or reopening it.
    Ending a session invalidates further student submissions and hides the old
    QR/payload. Active QR payloads are restored from authenticated session history.
- A positive whole-number radius enables geofencing and requires valid teacher
  coordinates. Leaving the radius blank keeps the session unrestricted.
- Attendance report analytics:
  - Total present
  - On-time count
  - Late count (5-minute grace window)
- Manual attendance correction with mandatory reason:
  - Add manual attendance
  - Remove attendance record
- CSV export for report submission
- The report page has a top-level **Download Report (CSV)** button. Optional
  summary, absentee, or notification failures show warnings without hiding
  attendance or its CSV export. Sessions without a subject mapping cannot track
  absentees or send absentee notifications.
- Live report auto-refresh (10-second sync)

### Student Features
- QR attendance scanner with improved camera error handling
- Manual payload fallback submit (for camera failure scenarios)
- Select an active class session from enrolled subjects (or an unmapped open
  session) before scanning. Use **Refresh Sessions** to update the list.
- For sessions with a configured radius, GPS is verified by the server before
  the scanner or manual payload entry is enabled. Movement, denied permission,
  unavailable GPS, or failed verification locks both entry paths.
- Submission captures fresh GPS coordinates and the server rechecks enrollment,
  expiry, and distance for both QR and manual payload attendance. Sessions
  without a radius do not require GPS.
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

For camera scanning on a phone, open the client over HTTPS. Browsers generally
block camera access on plain HTTP network addresses; `localhost` is allowed only
on the device running the browser. The configured API must also be reachable
from the phone and use HTTPS when the client uses HTTPS. Allow camera permission,
select the rear camera, and start scanning. Use the manual payload option if
camera access is unavailable. For geofenced or selfie-required sessions, capture
your location or attach the selfie proof before scanning.

## API Endpoints

- `POST /api/auth/login`
- `POST /api/session/create`
- `GET /api/session/history`
- `GET /api/session/active`
- `GET /api/session/available` (student sessions)
- `PATCH /api/session/:sessionId/extend`
- `PATCH /api/session/:sessionId/end`
- `POST /api/attendance/mark`
- `POST /api/attendance/mark-manual`
- `POST /api/attendance/verify-location`
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
- Browser-reported coordinates can be spoofed; the radius checks enforce the
  submitted location but are not proof of physical presence against GPS spoofing.

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

To permanently add 20 clearly labeled fictional Indian student accounts and sample
attendance to a specific test session (using the server's configured Supabase):

```bash
cd server
node scripts/seed-demo-students.js --session-id <session-uuid>
```

Students have roll numbers `DEMO-001` through `DEMO-020`; the original Aarav Sharma,
Ananya Verma, and Rohan Patel accounts are reused. The command creates these
common Indian engineering curriculum subjects and assigns them to the session's teacher:

- `DEMO-DSA`: Data Structures and Algorithms (semester 3)
- `DEMO-DBMS`: Database Management Systems (semester 4)
- `DEMO-OS`: Operating Systems (semester 4)
- `DEMO-CN`: Computer Networks (semester 5)
- `DEMO-MATH3`: Engineering Mathematics III (semester 3)

All 20 students are enrolled in all five subjects (section A). An unmapped target
session is mapped to DSA; existing session mappings are preserved and students
are also enrolled in that subject. Other sessions are not modified.
The command is rerunnable and only reuses accounts marked by this seed. It adds
profiles, teacher assignments, enrollments, and attendance. Sample marks use the session's
creation time, so this also works for expired sessions. Existing attendance times
are preserved; only these demo accounts' names and roll numbers are synchronized.
New seed accounts use reserved `example.test` addresses and random passwords that
are not printed or saved. Existing accounts are identified by their demo marker
and roll number, so email/password changes made for testing are preserved on rerun.
Never commit test passwords. Do not run the destructive fresh-schema script to seed
an existing database.

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
