create table if not exists public.device_status (
  id text primary key check (id = 'current'),
  light boolean,
  light2 boolean,
  fan boolean,
  socket boolean,
  up bigint not null,
  boot bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.device_events (
  boot bigint not null,
  id bigint not null,
  timestamp bigint not null,
  device text not null check (device in ('light', 'light2', 'fan', 'socket')),
  state smallint not null check (state in (0, 1)),
  primary key (boot, id)
);

create index if not exists device_events_timestamp_idx
  on public.device_events (timestamp, boot, id);

alter table public.device_status enable row level security;
alter table public.device_events enable row level security;

revoke all on public.device_status from anon, authenticated;
revoke all on public.device_events from anon, authenticated;
grant all on public.device_status to service_role;
grant all on public.device_events to service_role;
