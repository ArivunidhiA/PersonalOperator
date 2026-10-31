-- client_errors: browser-side errors reported via /api/client-error.
create table if not exists client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  message text not null,
  stack text,
  context text,
  path text,
  user_agent text
);
create index if not exists client_errors_created_at_idx on client_errors (created_at desc);
alter table client_errors enable row level security; -- service role only
