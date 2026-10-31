-- 微信账号映射：openid / unionid -> auth.users
-- 虚拟邮箱只是 Supabase Auth 的登录标识，账号唯一性改由本表保证

create table if not exists public.wechat_accounts (
  openid     text primary key,
  unionid    text,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.wechat_accounts is '微信小程序账号与 Supabase Auth 用户的映射';
comment on column public.wechat_accounts.openid is '微信 openid，同一小程序内唯一';
comment on column public.wechat_accounts.unionid is '微信 unionid，同一开放平台下用于跨应用合并账号';

create index if not exists wechat_accounts_user_id_idx on public.wechat_accounts (user_id);
create index if not exists wechat_accounts_unionid_idx on public.wechat_accounts (unionid);

alter table public.wechat_accounts enable row level security;

-- 不开放给 anon / authenticated，仅 service_role（Edge Function）可读写
revoke all on table public.wechat_accounts from anon, authenticated;

-- 回填历史微信账号：从 auth.users.user_metadata 中提取 openid
insert into public.wechat_accounts (openid, unionid, user_id)
select
  u.raw_user_meta_data ->> 'wx_openid' as openid,
  nullif(u.raw_user_meta_data ->> 'wx_unionid', '') as unionid,
  u.id
from auth.users u
where u.raw_user_meta_data ->> 'wx_openid' is not null
on conflict (openid) do update
set user_id = excluded.user_id,
    unionid = coalesce(excluded.unionid, public.wechat_accounts.unionid),
    updated_at = now();
