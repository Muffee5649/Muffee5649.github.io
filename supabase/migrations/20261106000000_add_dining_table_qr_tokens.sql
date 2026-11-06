-- 桌号二维码：餐桌一对一令牌，扫码时凭 table_id + token 校验后绑定桌号
-- 令牌属于敏感凭证，单独建表并关闭 anon / authenticated 直接访问，仅函数内可读写

create table if not exists public.dining_table_qr_tokens (
  table_id   bigint primary key references public.dining_tables (id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.dining_table_qr_tokens is '桌号二维码校验令牌，与餐桌一对一';
comment on column public.dining_table_qr_tokens.token is '随机 32 位十六进制令牌，重新生成后旧二维码立即失效';

create trigger dining_table_qr_tokens_set_updated_at
  before update on public.dining_table_qr_tokens
  for each row execute function public.set_updated_at();

alter table public.dining_table_qr_tokens enable row level security;

revoke all on table public.dining_table_qr_tokens from anon, authenticated;

-- 管理端：查询餐桌二维码令牌（缺失时自动补齐，已打印的二维码保持有效）
create or replace function public.get_dining_table_qr_list(
  p_current integer default 1,
  p_size integer default 100,
  p_table_no text default null
)
returns table (
  id bigint,
  table_no text,
  table_type text,
  capacity integer,
  status text,
  qr_token text,
  total bigint
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.dining_table_qr_tokens (table_id, token)
  select t.id, replace(gen_random_uuid()::text, '-', '')
  from public.dining_tables t
  where not exists (
    select 1
    from public.dining_table_qr_tokens q
    where q.table_id = t.id
  )
  on conflict (table_id) do nothing;

  return query
  select
    t.id,
    t.table_no,
    t.table_type,
    t.capacity,
    t.status,
    q.token,
    count(*) over ()
  from public.dining_tables t
  join public.dining_table_qr_tokens q on q.table_id = t.id
  where p_table_no is null or p_table_no = '' or t.table_no ilike '%' || p_table_no || '%'
  order by t.table_no
  limit greatest(coalesce(p_size, 100), 1)
  offset (greatest(coalesce(p_current, 1), 1) - 1) * greatest(coalesce(p_size, 100), 1);
end;
$$;

revoke all on function public.get_dining_table_qr_list(integer, integer, text) from public, anon;
grant execute on function public.get_dining_table_qr_list(integer, integer, text) to authenticated, service_role;

-- 管理端：重新生成令牌，旧二维码立即失效
create or replace function public.rotate_table_qr_token(p_table_id bigint)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_token text;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.dining_table_qr_tokens as q (table_id, token)
  select t.id, replace(gen_random_uuid()::text, '-', '')
  from public.dining_tables t
  where t.id = p_table_id
  on conflict (table_id) do update
    set token = replace(gen_random_uuid()::text, '-', '')
  returning q.token into v_token;

  if v_token is null then
    raise exception 'TABLE_NOT_FOUND';
  end if;

  return v_token;
end;
$$;

revoke all on function public.rotate_table_qr_token(bigint) from public, anon;
grant execute on function public.rotate_table_qr_token(bigint) to authenticated, service_role;

-- 顾客端：校验二维码载荷中的桌号与令牌是否匹配，返回可绑定的餐桌信息
-- 不返回令牌本身；未登录顾客（anon）也可调用，令牌即凭证
create or replace function public.verify_table_qr(p_table_id bigint, p_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_table public.dining_tables%rowtype;
  v_session_id bigint;
begin
  select t.*
  into v_table
  from public.dining_tables t
  join public.dining_table_qr_tokens q on q.table_id = t.id
  where t.id = p_table_id
    and q.token = btrim(coalesce(p_token, ''));

  if not found then
    raise exception 'TABLE_QR_INVALID';
  end if;

  if v_table.status = 'disabled' then
    raise exception 'TABLE_QR_DISABLED';
  end if;

  select s.id
  into v_session_id
  from public.table_sessions s
  where s.table_id = v_table.id
    and s.status = 'active'
  order by s.opened_at desc
  limit 1;

  return jsonb_build_object(
    'id', v_table.id,
    'table_no', v_table.table_no,
    'table_type', v_table.table_type,
    'capacity', v_table.capacity,
    'status', v_table.status,
    'session_id', v_session_id
  );
end;
$$;

revoke all on function public.verify_table_qr(bigint, text) from public;
grant execute on function public.verify_table_qr(bigint, text) to anon, authenticated, service_role;
