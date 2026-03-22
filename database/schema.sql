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
