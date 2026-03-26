create extension if not exists pgcrypto;

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  roll_number text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  semester integer,
  section text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists subject_teachers (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  unique(subject_id, teacher_id)
);

create table if not exists enrollments (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  roll_number text,
  enrolled_at timestamptz not null default now(),
  unique(subject_id, student_id)
);

create table if not exists timetable_slots (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  room_name text,
  latitude double precision,
  longitude double precision,
  radius_meters integer default 100,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references auth.users(id),
  subject text not null,
  subject_id uuid references subjects(id),
  timetable_slot_id uuid references timetable_slots(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  latitude double precision,
  longitude double precision,
  radius_meters integer,
  requires_selfie boolean not null default false,
  is_notifications_sent boolean not null default false
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  student_id uuid references auth.users(id),
  student_name text,
  roll_number text,
  marked_at timestamptz not null default now(),
  device_id text,
  latitude double precision,
  longitude double precision,
  selfie_hash text,
  unique(session_id, student_id)
);

create table if not exists attendance_device_registry (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(student_id, device_id)
);

create table if not exists attendance_audit_logs (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid,
  session_id uuid references sessions(id),
  teacher_id uuid references auth.users(id),
  action text not null,
  reason text not null,
  student_name text,
  roll_number text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table if not exists notification_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_channel text not null default 'email',
  recipient text,
  message text not null,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists incident_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  student_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_teacher_created_at on sessions(teacher_id, created_at desc);
create index if not exists idx_sessions_subject on sessions(subject_id);
create index if not exists idx_attendance_session_marked_at on attendance(session_id, marked_at asc);
create unique index if not exists idx_attendance_session_roll_unique on attendance(session_id, roll_number) where roll_number is not null;
create index if not exists idx_enrollments_subject on enrollments(subject_id);
create index if not exists idx_enrollments_student on enrollments(student_id);
create index if not exists idx_notification_logs_session on notification_logs(session_id);

create or replace view attendance_subject_summary as
select
  s.subject_id,
  s.teacher_id,
  count(distinct s.id) as total_sessions,
  count(a.id) as total_marks
from sessions s
left join attendance a on a.session_id = s.id
group by s.subject_id, s.teacher_id;

alter table profiles enable row level security;
alter table subjects enable row level security;
alter table subject_teachers enable row level security;
alter table enrollments enable row level security;
alter table timetable_slots enable row level security;
alter table sessions enable row level security;
alter table attendance enable row level security;
alter table attendance_audit_logs enable row level security;
alter table notification_logs enable row level security;
alter table incident_logs enable row level security;

drop policy if exists sessions_teacher_policy on sessions;
create policy sessions_teacher_policy on sessions
for all
to authenticated
using (
  teacher_id = auth.uid()
  or exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
    and coalesce(u.raw_user_meta_data ->> 'role', u.raw_app_meta_data ->> 'role') = 'admin'
  )
)
with check (
  teacher_id = auth.uid()
  or exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
    and coalesce(u.raw_user_meta_data ->> 'role', u.raw_app_meta_data ->> 'role') = 'admin'
  )
);

drop policy if exists attendance_owner_policy on attendance;
create policy attendance_owner_policy on attendance
for all
to authenticated
using (
  student_id = auth.uid()
  or exists (
    select 1
    from sessions s
    where s.id = attendance.session_id
      and s.teacher_id = auth.uid()
  )
  or exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
    and coalesce(u.raw_user_meta_data ->> 'role', u.raw_app_meta_data ->> 'role') = 'admin'
  )
)
with check (
  student_id = auth.uid()
  or exists (
    select 1
    from sessions s
    where s.id = attendance.session_id
      and s.teacher_id = auth.uid()
  )
  or exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
    and coalesce(u.raw_user_meta_data ->> 'role', u.raw_app_meta_data ->> 'role') = 'admin'
  )
);

drop policy if exists attendance_audit_teacher_policy on attendance_audit_logs;
create policy attendance_audit_teacher_policy on attendance_audit_logs
for select
to authenticated
using (
  teacher_id = auth.uid()
  or exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
    and coalesce(u.raw_user_meta_data ->> 'role', u.raw_app_meta_data ->> 'role') = 'admin'
  )
);
