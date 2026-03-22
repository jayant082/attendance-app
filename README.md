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
PORT=5000
```

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
- `POST /api/attendance/mark`
- `GET /api/attendance/:sessionId`

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

## Notes
- Login uses Supabase Auth email/password.
- Teacher/student role is supplied at login (or can be read from Supabase metadata).
- Attendance duplicate prevention is enforced in two layers:
  - Pre-insert check in backend
  - DB unique constraint `(session_id, student_id)`
