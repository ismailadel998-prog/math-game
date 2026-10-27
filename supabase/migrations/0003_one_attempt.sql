-- Multiplication Race — migration 3: ONE attempt per question.
-- A wrong answer locks that question for that student. Safe to run twice.
-- (Applied automatically by the /setup page, or paste into the Supabase SQL Editor after 0001 and 0002.)

alter table public.players add column if not exists failed_mask int not null default 0;  -- bit i set = question i answered wrong

-- Atomically lock a question after a wrong answer. Returns a row only for the FIRST attempt.
create or replace function public.fail_player(
  p_room uuid, p_player uuid, p_q int
) returns setof public.players
language sql
as $$
  update public.players p
     set failed_mask = p.failed_mask | (1 << p_q)
    from public.rooms r
   where p.id = p_player
     and p.room_id = p_room
     and r.id = p.room_id
     and r.status = 'running'
     and r.current_q = p_q
     and r.revealed = false
     and (p.solved_mask & (1 << p_q)) = 0
     and (p.failed_mask & (1 << p_q)) = 0
  returning p.*;
$$;

-- A correct answer only counts if the student has not already answered this question (right OR wrong).
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
     and r.revealed = false
     and (p.solved_mask & (1 << p_q)) = 0
     and (p.failed_mask & (1 << p_q)) = 0
  returning p.*;
$$;

create or replace function public.reset_room(p_room uuid)
returns void
language plpgsql
as $$
begin
  delete from public.submissions where room_id = p_room;
  update public.players
     set progress = 0, solved_mask = 0, failed_mask = 0, last_correct_at = null,
         finished_at = null, last_submit_at = null
   where room_id = p_room;
  update public.rooms
     set status = 'lobby', current_q = 0, q_opened_at = null,
         paused_at = null, paused_total_ms = 0, revealed = false
   where id = p_room;
end;
$$;

revoke all on function public.fail_player(uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.advance_player(uuid, uuid, int, timestamptz) from public, anon, authenticated;
revoke all on function public.reset_room(uuid) from public, anon, authenticated;
grant execute on function public.fail_player(uuid, uuid, int) to service_role;
grant execute on function public.advance_player(uuid, uuid, int, timestamptz) to service_role;
grant execute on function public.reset_room(uuid) to service_role;
