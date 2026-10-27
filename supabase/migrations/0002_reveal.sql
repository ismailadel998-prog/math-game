-- Multiplication Race — migration 2: teacher "Reveal answer".
-- Run once in Supabase SQL Editor AFTER 0001_init.sql. Safe to run twice.

alter table public.rooms add column if not exists revealed boolean not null default false;

-- Once the teacher reveals the answer, that question is closed: no more answers are accepted.
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
  returning p.*;
$$;

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
         paused_at = null, paused_total_ms = 0, revealed = false
   where id = p_room;
end;
$$;

revoke all on function public.advance_player(uuid, uuid, int, timestamptz) from public, anon, authenticated;
revoke all on function public.reset_room(uuid) from public, anon, authenticated;
grant execute on function public.advance_player(uuid, uuid, int, timestamptz) to service_role;
grant execute on function public.reset_room(uuid) to service_role;
