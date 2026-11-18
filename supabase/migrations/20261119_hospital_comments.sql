-- 2026-11-19 병원별 가벼운 댓글·대댓글 (후기와 별개)
-- Supabase 프로젝트 rlwsbcgxwcakdshynhtv 에 적용 완료 (마이그레이션 hospital_comments + hospital_comments_no_links 를 합친 최종본)

create table public.hospital_comments (
  id uuid primary key default gen_random_uuid(),
  hospital_id text not null references public.hospitals(id) on delete cascade,
  parent_id uuid references public.hospital_comments(id) on delete cascade,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  nickname text,
  is_mod boolean not null default false,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  status text not null default 'visible' check (status in ('visible','hidden','deleted')),
  report_count int not null default 0,
  created_at timestamptz not null default now()
);
create index hospital_comments_hosp_idx on public.hospital_comments(hospital_id, created_at desc) where parent_id is null;
create index hospital_comments_parent_idx on public.hospital_comments(parent_id);
create index hospital_comments_user_idx on public.hospital_comments(user_id, created_at desc);
alter table public.hospital_comments enable row level security;

-- 작성 전 검사: 닉네임 스냅숏, 링크·전화번호 금지, 대댓글 1단계, 도배 방지
create or replace function public.hospital_comments_before_insert()
returns trigger language plpgsql security definer set search_path to '' as $$
declare p record; par record; n int;
begin
  select nickname, role into p from public.profiles where id = auth.uid();
  new.user_id := auth.uid();
  new.nickname := coalesce(nullif(p.nickname,''), '익명');
  new.is_mod := coalesce(p.role = 'moderator', false);
  new.status := 'visible'; new.report_count := 0; new.created_at := now();
  new.body := btrim(new.body);
  if not new.is_mod and new.body ~* '(https?://|www\.|open\.kakao|pf\.kakao|[a-z0-9-]+\.(com|net|kr|co|me|io|ly)(/|\s|$)|0\d{1,2}[ .-]?\d{3,4}[ .-]?\d{4})' then
    raise exception 'no_links'; end if;
  if new.parent_id is not null then
    select hospital_id, parent_id, status into par from public.hospital_comments where id = new.parent_id;
    if par is null or par.status <> 'visible' then raise exception 'parent_not_found'; end if;
    if par.parent_id is not null then raise exception 'reply_depth'; end if;
    if par.hospital_id <> new.hospital_id then raise exception 'parent_mismatch'; end if;
  end if;
  select count(*) into n from public.hospital_comments where user_id = auth.uid() and created_at > now() - interval '10 minutes';
  if n >= 10 then raise exception 'rate_limit'; end if;
  if exists (select 1 from public.hospital_comments where user_id = auth.uid() and body = new.body and created_at > now() - interval '1 hour') then
    raise exception 'duplicate_comment'; end if;
  return new;
end $$;
create trigger hospital_comments_bi before insert on public.hospital_comments
  for each row execute function public.hospital_comments_before_insert();

create policy "read visible comments" on public.hospital_comments for select to anon, authenticated
  using (status in ('visible','deleted'));
create policy "moderator read all comments" on public.hospital_comments for select to authenticated
  using ((select public.is_moderator()));
create policy "consumer write comment" on public.hospital_comments for insert to authenticated
  with check (
    user_id = (select auth.uid()) and status = 'visible'
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and ((p.account_type = 'consumer' and p.terms_agreed_at is not null and p.privacy_agreed_at is not null and p.over14_confirmed)
           or p.role = 'moderator')));
revoke update, delete on public.hospital_comments from anon, authenticated;
revoke select on public.hospital_comments from anon, authenticated;
grant select (id, hospital_id, parent_id, nickname, is_mod, body, status, created_at) on public.hospital_comments to anon, authenticated;
grant insert (hospital_id, parent_id, body) on public.hospital_comments to authenticated;

create or replace function public.delete_hospital_comment(p_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare c record;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'reason','login'); end if;
  select * into c from public.hospital_comments where id = p_id;
  if c is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if c.user_id is distinct from auth.uid() and not public.is_moderator() then
    return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if exists (select 1 from public.hospital_comments r where r.parent_id = p_id and r.status = 'visible') then
    update public.hospital_comments set status = 'deleted', body = '삭제된 댓글입니다.' where id = p_id;
  else
    delete from public.hospital_comments where id = p_id;
  end if;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.my_hospital_comment_ids(p_hospital text)
returns setof uuid language sql stable security definer set search_path to '' as $$
  select id from public.hospital_comments where hospital_id = p_hospital and user_id = auth.uid();
$$;

create or replace function public.moderate_hospital_comment(p_id uuid, p_hide boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if not public.is_moderator() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  update public.hospital_comments set status = case when p_hide then 'hidden' else 'visible' end,
    report_count = case when p_hide then report_count else 0 end where id = p_id;
  update public.reports set status = 'actioned' where target_type = 'comment' and target_id = p_id::text and status = 'open';
  return jsonb_build_object('ok',true);
end $$;

alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type = any (array['review','ext','metric','comment']));
create unique index if not exists reports_comment_once on public.reports(reporter, target_id) where target_type = 'comment';
create or replace function public.reports_comment_autohide()
returns trigger language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  if new.target_type <> 'comment' then return new; end if;
  select count(distinct reporter) into n from public.reports where target_type = 'comment' and target_id = new.target_id;
  update public.hospital_comments set report_count = n,
    status = case when n >= 3 and status = 'visible' then 'hidden' else status end
  where id::text = new.target_id;
  return new;
end $$;
create trigger reports_comment_ai after insert on public.reports for each row execute function public.reports_comment_autohide();

create or replace function public.hospital_comment_count(p_hospital text)
returns int language sql stable security definer set search_path to '' as $$
  select count(*)::int from public.hospital_comments where hospital_id = p_hospital and status = 'visible';
$$;

create or replace function public.flagged_hospital_comments()
returns table(id uuid, hospital_id text, parent_id uuid, nickname text, body text, status text, report_count int, created_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select c.id, c.hospital_id, c.parent_id, c.nickname, c.body, c.status, c.report_count, c.created_at
  from public.hospital_comments c
  where public.is_moderator() and (c.status = 'hidden' or c.report_count > 0)
  order by c.created_at desc limit 100;
$$;

revoke execute on function public.hospital_comments_before_insert() from public, anon, authenticated;
revoke execute on function public.reports_comment_autohide() from public, anon, authenticated;
revoke execute on function public.delete_hospital_comment(uuid) from public, anon;
revoke execute on function public.my_hospital_comment_ids(text) from public, anon;
revoke execute on function public.moderate_hospital_comment(uuid, boolean) from public, anon;
revoke execute on function public.flagged_hospital_comments() from public, anon;
grant execute on function public.delete_hospital_comment(uuid), public.my_hospital_comment_ids(text), public.moderate_hospital_comment(uuid, boolean), public.flagged_hospital_comments() to authenticated;
grant execute on function public.hospital_comment_count(text) to anon, authenticated;
