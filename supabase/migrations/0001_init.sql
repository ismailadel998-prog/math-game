-- Multiplication Race — schema.
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- Security model: every table has Row Level Security ENABLED and NO policies, so the
-- public anon key can neither read nor write anything. Only the server (Next.js API
-- routes using the secret service_role key, which bypasses RLS) touches these tables.
-- The correct answers are NOT stored in the database at all; they live in server code.


create table if not exists public.rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  teacher_token_hash text not null,
  status           text not null default 'lobby'
                     check (status in ('lobby','running','paused','finished')),
  current_q        int  not null default 0 check (current_q between 0 and 7),
  q_opened_at      timestamptz,
  paused_at        timestamptz,
  paused_total_ms  bigint not null default 0,
  show_leaderboard boolean not null default true,
  created_at       timestamptz not null default now()
);

create table if not exists public.players (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.rooms(id) on delete cascade,
  nickname        text not null check (char_length(nickname) between 1 and 16),
  car             int  not null check (car between 0 and 5),
  token_hash      text not null,
  progress        int  not null default 0 check (progress between 0 and 8),
  solved_mask     int  not null default 0,          -- bit i set = question i solved
  last_correct_at timestamptz,                      -- server time of latest accepted answer
  finished_at     timestamptz,                      -- server time the 8th answer was accepted
  joined_at       timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  last_submit_at  timestamptz
);
create unique index if not exists players_room_nickname_uq
  on public.players (room_id, lower(nickname));
create index if not exists players_room_idx on public.players (room_id);

create table if not exists public.submissions (
  id           bigint generated always as identity primary key,
  room_id      uuid not null references public.rooms(id) on delete cascade,
  player_id    uuid not null references public.players(id) on delete cascade,
  question_idx int  not null check (question_idx between 0 and 7),
  answer_text  text not null,
  is_correct   boolean not null,
  created_at   timestamptz not null default now()
);
create index if not exists submissions_room_q_idx on public.submissions (room_id, question_idx);

alter table public.rooms       enable row level security;
alter table public.players     enable row level security;
alter table public.submissions enable row level security;
-- (intentionally no policies)

-- Atomically advance a player by ONE checkpoint.
-- Succeeds only if: the room is running, the question is the room's active question,
-- and the player has not already solved it. Concurrent duplicates cannot both pass.
create or replace function public.advance_player(
  p_room uuid, p_player uuid, p_q int, p_now timestamptz
) returns setof public.players
language sql
as $$
  update public.players p
     set progress        = p.progress + 1,
         solved_mask     = p.solved_mask | (1 << p_q),
         last_correct_at = p_now,
         finished_at     = case when p.progress + 1 >= 8 then p_now else p.finished_at end
    from public.rooms r
   where p.id = p_player
     and p.room_id = p_room
     and r.id = p.room_id
     and r.status = 'running'
     and r.current_q = p_q
     and (p.solved_mask & (1 << p_q)) = 0
  returning p.*;
$$;

-- Atomically reset a race: everyone back to the start, back to the lobby.
create or replace function public.reset_room(p_room uuid)
returns void
language plpgsql
as $$
begin
  delete from public.submissions where room_id = p_room;
  update public.players
     set progress = 0, solved_mask = 0, last_correct_at = null,
         finished_at = null, last_submit_at = null
   where room_id = p_room;
  update public.rooms
     set status = 'lobby', current_q = 0, q_opened_at = null,
         paused_at = null, paused_total_ms = 0
   where id = p_room;
end;
$$;

revoke all on function public.advance_player(uuid, uuid, int, timestamptz) from public, anon, authenticated;
revoke all on function public.reset_room(uuid) from public, anon, authenticated;
grant execute on function public.advance_player(uuid, uuid, int, timestamptz) to service_role;
grant execute on function public.reset_room(uuid) to service_role;

-- Optional housekeeping: delete rooms older than 2 days (run manually or via pg_cron).
-- delete from public.rooms where created_at < now() - interval '2 days';
