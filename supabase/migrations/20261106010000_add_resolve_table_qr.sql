-- 扫码解析：微信小程序码的 scene 仅携带 32 位令牌，按令牌反查餐桌并返回可绑定的桌号信息
-- 顾客端（anon）也可调用，令牌即凭证；令牌长期有效，仅管理端重新生成后失效

create or replace function public.resolve_table_qr(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_table public.dining_tables%rowtype;
  v_session_id bigint;
begin
  if coalesce(btrim(p_token), '') = '' then
    raise exception 'TABLE_QR_INVALID';
  end if;

  select t.*
  into v_table
  from public.dining_tables t
  join public.dining_table_qr_tokens q on q.table_id = t.id
  where q.token = btrim(p_token);

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

revoke all on function public.resolve_table_qr(text) from public;
grant execute on function public.resolve_table_qr(text) to anon, authenticated, service_role;

-- 旧方案按 table_id + token 校验，小程序码只携带 token，不再需要
drop function if exists public.verify_table_qr(bigint, text);
