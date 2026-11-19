-- СМЕТА: полный SQL для Supabase SQL Editor.
-- Выполнить один раз. Повторный запуск не удаляет существующие данные.
-- Доступ к каждой таблице ограничен текущим авторизованным пользователем.

create extension if not exists pgcrypto;

create table if not exists public.work_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 250),
  unit text not null default 'шт.' check (length(btrim(unit)) between 1 and 40),
  price numeric(14, 2) not null default 0 check (price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Новая смета' check (length(title) <= 250),
  customer text not null default '' check (length(customer) <= 250),
  estimate_date date not null default current_date,
  columns_config jsonb not null default '{"unit":true,"done":true,"done_sum":true,"remaining":true,"note":true}'::jsonb
    check (jsonb_typeof(columns_config) = 'object'),
  custom_columns jsonb not null default '[]'::jsonb
    check (jsonb_typeof(custom_columns) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimates_id_user_unique unique (id, user_id)
);

create table if not exists public.estimate_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  name text not null check (length(btrim(name)) between 1 and 250),
  unit text not null default 'шт.' check (length(btrim(unit)) between 1 and 40),
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0),
  planned_qty numeric(14, 3) not null default 0 check (planned_qty >= 0),
  completed_qty numeric(14, 3) not null default 0 check (completed_qty >= 0),
  note text not null default '' check (length(note) <= 2000),
  custom_values jsonb not null default '{}'::jsonb check (jsonb_typeof(custom_values) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- ВАЖНО: нельзя привязать свою позицию к чужой смете даже через API.
  constraint items_estimate_owner_fk
    foreign key (estimate_id, user_id)
    references public.estimates(id, user_id) on delete cascade
);

create index if not exists work_items_user_name_idx on public.work_items(user_id, name);
create index if not exists estimates_user_date_idx on public.estimates(user_id, estimate_date desc);
create index if not exists estimate_items_estimate_order_idx on public.estimate_items(estimate_id, position);
create index if not exists estimate_items_user_idx on public.estimate_items(user_id);

-- Автоматическая дата изменения при UPDATE.
create or replace function public.smeta_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists work_items_updated_at on public.work_items;
create trigger work_items_updated_at before update on public.work_items
for each row execute function public.smeta_set_updated_at();

drop trigger if exists estimates_updated_at on public.estimates;
create trigger estimates_updated_at before update on public.estimates
for each row execute function public.smeta_set_updated_at();

drop trigger if exists estimate_items_updated_at on public.estimate_items;
create trigger estimate_items_updated_at before update on public.estimate_items
for each row execute function public.smeta_set_updated_at();

-- Включаем RLS даже для таблиц, созданных ранее.
alter table public.work_items enable row level security;
alter table public.estimates enable row level security;
alter table public.estimate_items enable row level security;

-- Удаляем только политики с именами нашего проекта (безопасный повторный запуск).
drop policy if exists "smeta_work_select" on public.work_items;
drop policy if exists "smeta_work_insert" on public.work_items;
drop policy if exists "smeta_work_update" on public.work_items;
drop policy if exists "smeta_work_delete" on public.work_items;

create policy "smeta_work_select" on public.work_items for select to authenticated
  using (user_id = (select auth.uid()));
create policy "smeta_work_insert" on public.work_items for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "smeta_work_update" on public.work_items for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "smeta_work_delete" on public.work_items for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "smeta_estimate_select" on public.estimates;
drop policy if exists "smeta_estimate_insert" on public.estimates;
drop policy if exists "smeta_estimate_update" on public.estimates;
drop policy if exists "smeta_estimate_delete" on public.estimates;

create policy "smeta_estimate_select" on public.estimates for select to authenticated
  using (user_id = (select auth.uid()));
create policy "smeta_estimate_insert" on public.estimates for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "smeta_estimate_update" on public.estimates for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "smeta_estimate_delete" on public.estimates for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "smeta_item_select" on public.estimate_items;
drop policy if exists "smeta_item_insert" on public.estimate_items;
drop policy if exists "smeta_item_update" on public.estimate_items;
drop policy if exists "smeta_item_delete" on public.estimate_items;

create policy "smeta_item_select" on public.estimate_items for select to authenticated
  using (user_id = (select auth.uid()));
create policy "smeta_item_insert" on public.estimate_items for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "smeta_item_update" on public.estimate_items for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "smeta_item_delete" on public.estimate_items for delete to authenticated
  using (user_id = (select auth.uid()));

-- Для браузерного anon / publishable key доступны только операции через RLS.
revoke all on public.work_items from anon;
revoke all on public.estimates from anon;
revoke all on public.estimate_items from anon;
grant select, insert, update, delete on public.work_items to authenticated;
grant select, insert, update, delete on public.estimates to authenticated;
grant select, insert, update, delete on public.estimate_items to authenticated;

-- Проверка: в разделе Database -> Tables должны появиться 3 таблицы,
-- у каждой будет включён Row Level Security (RLS).
