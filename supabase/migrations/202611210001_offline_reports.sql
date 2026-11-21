-- REVIEW REQUIRED. Apply to a test project first. Existing tables and policies are retained.
begin;
create table public.completions (
 id uuid primary key, user_id uuid not null references auth.users(id),
 estimate_id uuid not null, item_id uuid not null,
 date date not null, delta numeric(14,3) not null, unit_price numeric(14,2) not null check (unit_price >= 0),
 created_at timestamptz not null
);
-- Historical records deliberately survive deletion of source estimates/items.
create table public.reports (
 id uuid primary key, user_id uuid not null references auth.users(id), estimate_id uuid not null,
 title text not null, customer text not null, date date not null,
 "from" text not null, "to" text not null,
 kind text not null check (kind in ('period','progress')),
 status text not null check (status in ('draft','final')),
 note text not null, lines jsonb not null check (jsonb_typeof(lines)='array'),
 event_ids jsonb not null check (jsonb_typeof(event_ids)='array'),
 photos jsonb not null check (jsonb_typeof(photos)='array'), created_at timestamptz not null,
 unique (id,user_id)
);
create table public.report_photos (
 id uuid primary key, user_id uuid not null references auth.users(id), report_id uuid not null,
 data text not null check (length(data) <= 3000000 and data ~ '^data:image/(jpeg|png);base64,'),
 created_at timestamptz not null,
 foreign key (report_id,user_id) references public.reports(id,user_id)
);
create table public.moismety_operations (
 id uuid not null, user_id uuid not null references auth.users(id), result jsonb not null,
 primary key (user_id,id)
);
do $$ declare t text; begin
 foreach t in array array['completions','reports','report_photos','moismety_operations'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('create policy account_access on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',t);
  execute format('grant select, insert, update, delete on public.%I to authenticated',t);
  execute format('create index on public.%I (user_id)',t);
 end loop;
end $$;
create function public.moismety_protect_history() returns trigger language plpgsql set search_path='' as $$
declare eid text;
begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if tg_table_name='completions' and tg_op <> 'INSERT' then raise exception 'Журнал выполнения неизменяем. Добавьте корректирующую операцию.'; end if;
 if tg_table_name='reports' then
  if tg_op <> 'INSERT' and old.status='final' then raise exception 'Сформированный отчёт неизменяем'; end if;
  if tg_op <> 'DELETE' and new.status='final' and new.kind='period' then
   for eid in select jsonb_array_elements_text(new.event_ids) loop
    if not exists (select 1 from public.completions where id=eid::uuid and user_id=new.user_id and estimate_id=new.estimate_id and date::text between new."from" and new."to") then raise exception 'Операция отчёта отсутствует в журнале'; end if;
    if exists (select 1 from public.reports r where r.id<>new.id and r.user_id=new.user_id and r.status='final' and r.kind='period' and r.event_ids ? eid) then raise exception 'Работа уже включена в сформированный отчёт' using errcode='40001'; end if;
   end loop;
  end if;
 end if;
 if tg_table_name='report_photos' then
  if tg_op='DELETE' then
   if exists(select 1 from public.reports where id=old.report_id and status='final') then raise exception 'Фотографии сформированного отчёта неизменяемы'; end if;
  else
   if exists(select 1 from public.reports where id=new.report_id and status='final') then raise exception 'Фотографии сформированного отчёта неизменяемы'; end if;
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger protect_completions before update or delete on public.completions for each row execute function public.moismety_protect_history();
create trigger protect_reports before insert or update or delete on public.reports for each row execute function public.moismety_protect_history();
create trigger protect_photos before insert or update or delete on public.report_photos for each row execute function public.moismety_protect_history();
create function public.moismety_snapshot() returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object(
  'account_id',auth.uid(),
  'work_items',coalesce((select jsonb_agg(t) from public.work_items t where user_id=auth.uid()),'[]'),
  'estimates',coalesce((select jsonb_agg(t) from public.estimates t where user_id=auth.uid()),'[]'),
  'estimate_items',coalesce((select jsonb_agg(t) from public.estimate_items t where user_id=auth.uid()),'[]'),
  'completions',coalesce((select jsonb_agg(t) from public.completions t where user_id=auth.uid()),'[]'),
  'reports',coalesce((select jsonb_agg(t) from public.reports t where user_id=auth.uid()),'[]'),
  'report_photos',coalesce((select jsonb_agg(t) from public.report_photos t where user_id=auth.uid()),'[]'));
$$;
create function public.moismety_sync(operation_id uuid, changes jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare receipt jsonb; change jsonb; current_row jsonb; t text; row_id uuid; columns text; assignments text; result jsonb;
begin
 if auth.uid() is null then raise exception 'Требуется вход'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select o.result into receipt from public.moismety_operations o where o.user_id=auth.uid() and o.id=operation_id;
 if found then return receipt; end if;
 -- Lock existing rows against legacy clients as well as other sync transactions.
 perform 1 from public.estimates where user_id=auth.uid() for update;
 perform 1 from public.estimate_items where user_id=auth.uid() for update;
 perform 1 from public.work_items where user_id=auth.uid() for update;
 -- Compare every row before any writes. A conflict rolls back the complete batch.
 for change in select value from jsonb_array_elements(changes) loop
  t=change->>'table'; row_id=(change->>'id')::uuid;
  if t not in ('work_items','estimates','estimate_items','completions','reports','report_photos') then raise exception 'Недопустимая таблица'; end if;
  execute format('select to_jsonb(t) from public.%I t where id=$1 and user_id=auth.uid() for update',t) into current_row using row_id;
  if current_row is distinct from nullif(change->'before','null'::jsonb) then raise exception 'Конфликт изменений' using errcode='40001'; end if;
  if change->'after'<>'null'::jsonb and ((change->'after'->>'id')::uuid is distinct from row_id or (change->'after'->>'user_id')::uuid is distinct from auth.uid()) then raise exception 'Недопустимый владелец'; end if;
 end loop;
 perform set_config('moismety.syncing','true',true);
 -- Parents first, then children. Photos precede finalization of their parent reports.
 for change in select value from jsonb_array_elements(changes)
  where value->'after'<>'null'::jsonb
  order by case value->>'table' when 'work_items' then 1 when 'estimates' then 2 when 'estimate_items' then 3 when 'completions' then 4 when 'reports' then 5 else 6 end loop
  t=change->>'table';
  -- Insert reports as drafts until attachments have been stored.
  if t='reports' and change->'after'->>'status'='final' then change=jsonb_set(change,'{after,status}','"draft"'); end if;
  select string_agg(format('%I',column_name),','),string_agg(format('%I = source.%I',column_name,column_name),',') into columns,assignments
   from information_schema.columns where table_schema='public' and table_name=t;
  if change->'before'='null'::jsonb then
   execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1)',t,columns,columns,t) using change->'after';
  else
   execute format('update public.%I target set %s from jsonb_populate_record(null::public.%I,$1) source where target.id=source.id and target.user_id=auth.uid()',t,assignments,t) using change->'after';
  end if;
 end loop;
 for change in select value from jsonb_array_elements(changes) where value->>'table'='reports' and value->'after'->>'status'='final' loop
  update public.reports set status='final' where id=(change->>'id')::uuid and user_id=auth.uid();
 end loop;
 -- Explicit child deletes precede parent deletes. Existing cascade semantics are preserved.
 for change in select value from jsonb_array_elements(changes) where value->'after'='null'::jsonb
  order by case value->>'table' when 'report_photos' then 1 when 'reports' then 2 when 'estimate_items' then 3 when 'estimates' then 4 else 5 end loop
  if change->>'table'='estimates' and exists(select 1 from public.estimate_items i where i.estimate_id=(change->>'id')::uuid and not exists(select 1 from jsonb_array_elements(changes) c where c->>'table'='estimate_items' and (c->>'id')::uuid=i.id and c->'after'='null'::jsonb)) then raise exception 'Смета содержит новые позиции с другого устройства' using errcode='40001'; end if;
  execute format('delete from public.%I where id=$1 and user_id=auth.uid()',change->>'table') using (change->>'id')::uuid;
 end loop;
 result=public.moismety_snapshot();
 insert into public.moismety_operations values(operation_id,auth.uid(),result);
 return result;
end $$;
revoke all on function public.moismety_snapshot() from public,anon;
revoke all on function public.moismety_sync(uuid,jsonb) from public,anon;
grant execute on function public.moismety_snapshot() to authenticated;
grant execute on function public.moismety_sync(uuid,jsonb) to authenticated;
-- Capture future writes from existing web clients without fabricating past history.
create function public.moismety_capture_legacy_completion() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_setting('moismety.syncing',true) is distinct from 'true' and new.completed_qty<>old.completed_qty then
  insert into public.completions values(gen_random_uuid(),new.user_id,new.estimate_id,new.id,current_date,new.completed_qty-old.completed_qty,new.unit_price,now());
 end if;
 return new;
end $$;
create trigger moismety_capture_completion after update of completed_qty on public.estimate_items for each row execute function public.moismety_capture_legacy_completion();
commit;
