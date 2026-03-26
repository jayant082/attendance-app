-- ============================================================
-- Smart Attendance System — Full Fresh Schema
-- Run this entire script in the Supabase SQL Editor to wipe
-- the old schema and create everything from scratch.
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1: Drop all existing objects (safe cascade order)
-- ------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;

drop view  if exists attendance_subject_summary;

drop table if exists incident_logs              cascade;
drop table if exists notification_logs          cascade;
drop table if exists attendance_audit_logs      cascade;
drop table if exists attendance_device_registry cascade;
drop table if exists attendance                 cascade;
drop table if exists sessions                   cascade;
drop table if exists timetable_slots            cascade;
drop table if exists enrollments               cascade;
drop table if exists subject_teachers           cascade;
drop table if exists subjects                  cascade;
drop table if exists profiles                  cascade;

-- ------------------------------------------------------------
-- STEP 2: Enable required extensions
-- ------------------------------------------------------------

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- STEP 3: Create tables
-- ------------------------------------------------------------

-- 3.1  User profiles (mirrors auth.users, role stored in app_metadata)
create table profiles (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  full_name  text,
  roll_number text,
  phone      text,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now()
);

-- 3.2  Subjects
create table subjects (
  id         uuid        primary key default gen_random_uuid(),
  code       text        not null unique,
  name       text        not null,
  semester   integer,
  section    text,
  created_by uuid        references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 3.3  Subject ↔ Teacher assignments
create table subject_teachers (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  unique(subject_id, teacher_id)
);

-- 3.4  Student enrolments in subjects
create table enrollments (
  id          uuid        primary key default gen_random_uuid(),
  subject_id  uuid        not null references subjects(id) on delete cascade,
  student_id  uuid        not null references auth.users(id) on delete cascade,
  roll_number text,
  enrolled_at timestamptz not null default now(),
  unique(subject_id, student_id)
);

-- 3.5  Weekly timetable slots (with optional geo-fence)
create table timetable_slots (
  id             uuid             primary key default gen_random_uuid(),
  subject_id     uuid             not null references subjects(id) on delete cascade,
  teacher_id     uuid             not null references auth.users(id) on delete cascade,
  day_of_week    integer          not null check (day_of_week between 0 and 6),
  start_time     time             not null,
  end_time       time             not null,
  room_name      text,
  latitude       double precision,
  longitude      double precision,
  radius_meters  integer          default 100,
  created_at     timestamptz      not null default now()
);

-- 3.6  Live attendance sessions (QR + optional geo-fence + selfie)
create table sessions (
  id                    uuid        primary key default gen_random_uuid(),
  teacher_id            uuid        references auth.users(id) on delete set null,
  subject               text        not null,
  subject_id            uuid        references subjects(id) on delete set null,
  timetable_slot_id     uuid        references timetable_slots(id) on delete set null,
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null,
  latitude              double precision,
  longitude             double precision,
  radius_meters         integer,
  requires_selfie       boolean     not null default false,
  is_notifications_sent boolean     not null default false
);

-- 3.7  Attendance records
create table attendance (
  id           uuid        primary key default gen_random_uuid(),
  session_id   uuid        references sessions(id) on delete cascade,
  student_id   uuid        references auth.users(id) on delete set null,
  student_name text,
  roll_number  text,
  marked_at    timestamptz not null default now(),
  device_id    text,
  latitude     double precision,
  longitude    double precision,
  selfie_hash  text,
  unique(session_id, student_id)
);

-- 3.8  Device fingerprint registry (anti-proxy / duplicate device detection)
create table attendance_device_registry (
  id           uuid        primary key default gen_random_uuid(),
  student_id   uuid        not null references auth.users(id) on delete cascade,
  device_id    text        not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique(student_id, device_id)
);

-- 3.9  Teacher audit log for manual add / remove attendance
create table attendance_audit_logs (
  id           uuid        primary key default gen_random_uuid(),
  attendance_id uuid,
  session_id   uuid        references sessions(id) on delete set null,
  teacher_id   uuid        references auth.users(id) on delete set null,
  action       text        not null,
  reason       text        not null,
  student_name text,
  roll_number  text,
  meta         jsonb,
  created_at   timestamptz not null default now()
);

-- 3.10 Absentee / notification queue
create table notification_logs (
  id                uuid        primary key default gen_random_uuid(),
  session_id        uuid        references sessions(id) on delete cascade,
  recipient_user_id uuid        references auth.users(id) on delete set null,
  recipient_channel text        not null default 'email',
  recipient         text,
  message           text        not null,
  status            text        not null default 'queued',
  created_at        timestamptz not null default now(),
  sent_at           timestamptz
);

-- 3.11 Anomaly / incident log (duplicate scan, geo mismatch, etc.)
create table incident_logs (
  id         uuid        primary key default gen_random_uuid(),
  session_id uuid        references sessions(id) on delete cascade,
  student_id uuid        references auth.users(id) on delete set null,
  event_type text        not null,
  details    jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- STEP 4: Indexes
-- ------------------------------------------------------------

create index idx_sessions_teacher_created_at        on sessions(teacher_id, created_at desc);
create index idx_sessions_subject                   on sessions(subject_id);
create index idx_attendance_session_marked_at       on attendance(session_id, marked_at asc);
create unique index idx_attendance_session_roll_unique
  on attendance(session_id, roll_number) where roll_number is not null;
create index idx_enrollments_subject                on enrollments(subject_id);
create index idx_enrollments_student                on enrollments(student_id);
create index idx_notification_logs_session          on notification_logs(session_id);
create index idx_incident_logs_session              on incident_logs(session_id);
create index idx_device_registry_student            on attendance_device_registry(student_id);
create index idx_subject_teachers_teacher           on subject_teachers(teacher_id);
create index idx_timetable_slots_subject            on timetable_slots(subject_id);
create index idx_timetable_slots_teacher            on timetable_slots(teacher_id);

-- ------------------------------------------------------------
-- STEP 5: Views
-- ------------------------------------------------------------

create view attendance_subject_summary as
select
  s.subject_id,
  s.teacher_id,
  count(distinct s.id)  as total_sessions,
  count(a.id)           as total_marks
from sessions s
left join attendance a on a.session_id = s.id
group by s.subject_id, s.teacher_id;

-- ------------------------------------------------------------
-- STEP 6: Auto-create profile row on new user signup
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, roll_number, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'roll_number',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- STEP 7: Enable Row-Level Security on all tables
-- ------------------------------------------------------------

alter table profiles                  enable row level security;
alter table subjects                  enable row level security;
alter table subject_teachers          enable row level security;
alter table enrollments               enable row level security;
alter table timetable_slots           enable row level security;
alter table sessions                  enable row level security;
alter table attendance                enable row level security;
alter table attendance_device_registry enable row level security;
alter table attendance_audit_logs     enable row level security;
alter table notification_logs         enable row level security;
alter table incident_logs             enable row level security;

-- ------------------------------------------------------------
-- STEP 8: RLS helper — inline admin check
-- (avoids a separate is_admin() function that needs SECURITY DEFINER)
-- ------------------------------------------------------------

-- 8.1  profiles
drop policy if exists profiles_self_read   on profiles;
drop policy if exists profiles_self_write  on profiles;
drop policy if exists profiles_admin       on profiles;

create policy profiles_self_read on profiles
  for select to authenticated
  using (user_id = auth.uid()
    or exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  );

create policy profiles_self_write on profiles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy profiles_admin on profiles
  for all to authenticated
  using (
    exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  )
  with check (
    exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  );

-- 8.2  subjects
drop policy if exists subjects_read   on subjects;
drop policy if exists subjects_write  on subjects;

create policy subjects_read on subjects
  for select to authenticated
  using (true);

create policy subjects_write on subjects
  for all to authenticated
  using (
    exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') in ('admin', 'teacher')
    )
  )
  with check (
    exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') in ('admin', 'teacher')
    )
  );

-- 8.3  subject_teachers
drop policy if exists subject_teachers_read  on subject_teachers;
drop policy if exists subject_teachers_write on subject_teachers;

create policy subject_teachers_read on subject_teachers
  for select to authenticated
  using (
    teacher_id = auth.uid()
    or exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') in ('admin', 'student')
    )
  );

create policy subject_teachers_write on subject_teachers
  for all to authenticated
  using (
    exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  )
  with check (
    exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  );

-- 8.4  enrollments
drop policy if exists enrollments_student_read on enrollments;
drop policy if exists enrollments_teacher_read on enrollments;
drop policy if exists enrollments_write        on enrollments;

create policy enrollments_student_read on enrollments
  for select to authenticated
  using (student_id = auth.uid());

create policy enrollments_teacher_read on enrollments
  for select to authenticated
  using (
    exists (
      select 1 from subject_teachers st
      where st.subject_id = enrollments.subject_id
        and st.teacher_id = auth.uid()
    )
    or exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  );

create policy enrollments_write on enrollments
  for all to authenticated
  using (
    exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  )
  with check (
    exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  );

-- 8.5  timetable_slots
drop policy if exists timetable_slots_read  on timetable_slots;
drop policy if exists timetable_slots_write on timetable_slots;

create policy timetable_slots_read on timetable_slots
  for select to authenticated
  using (true);

create policy timetable_slots_write on timetable_slots
  for all to authenticated
  using (
    teacher_id = auth.uid()
    or exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  )
  with check (
    teacher_id = auth.uid()
    or exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  );

-- 8.6  sessions
drop policy if exists sessions_teacher_policy on sessions;
drop policy if exists sessions_student_read   on sessions;

create policy sessions_teacher_policy on sessions
  for all to authenticated
  using (
    teacher_id = auth.uid()
    or exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  )
  with check (
    teacher_id = auth.uid()
    or exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  );

create policy sessions_student_read on sessions
  for select to authenticated
  using (
    exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'student'
    )
  );

-- 8.7  attendance
drop policy if exists attendance_owner_policy on attendance;

create policy attendance_owner_policy on attendance
  for all to authenticated
  using (
    student_id = auth.uid()
    or exists (
      select 1 from sessions s
      where s.id = attendance.session_id
        and s.teacher_id = auth.uid()
    )
    or exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  )
  with check (
    student_id = auth.uid()
    or exists (
      select 1 from sessions s
      where s.id = attendance.session_id
        and s.teacher_id = auth.uid()
    )
    or exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  );

-- 8.8  attendance_device_registry
drop policy if exists device_registry_owner on attendance_device_registry;
drop policy if exists device_registry_admin on attendance_device_registry;

create policy device_registry_owner on attendance_device_registry
  for all to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy device_registry_admin on attendance_device_registry
  for all to authenticated
  using (
    exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  )
  with check (
    exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  );

-- 8.9  attendance_audit_logs
drop policy if exists attendance_audit_teacher_policy on attendance_audit_logs;

create policy attendance_audit_teacher_policy on attendance_audit_logs
  for select to authenticated
  using (
    teacher_id = auth.uid()
    or exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  );

create policy attendance_audit_write on attendance_audit_logs
  for insert to authenticated
  with check (
    teacher_id = auth.uid()
    or exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  );

-- 8.10 notification_logs
drop policy if exists notification_logs_teacher_read on notification_logs;
drop policy if exists notification_logs_write        on notification_logs;

create policy notification_logs_teacher_read on notification_logs
  for select to authenticated
  using (
    recipient_user_id = auth.uid()
    or exists (
      select 1 from sessions s
      where s.id = notification_logs.session_id
        and s.teacher_id = auth.uid()
    )
    or exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  );

create policy notification_logs_write on notification_logs
  for insert to authenticated
  with check (
    exists (
      select 1 from sessions s
      where s.id = notification_logs.session_id
        and s.teacher_id = auth.uid()
    )
    or exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  );

-- 8.11 incident_logs
drop policy if exists incident_logs_teacher_read on incident_logs;
drop policy if exists incident_logs_write        on incident_logs;

create policy incident_logs_teacher_read on incident_logs
  for select to authenticated
  using (
    student_id = auth.uid()
    or exists (
      select 1 from sessions s
      where s.id = incident_logs.session_id
        and s.teacher_id = auth.uid()
    )
    or exists (
      select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role') = 'admin'
    )
  );

create policy incident_logs_write on incident_logs
  for insert to authenticated
  with check (true);
