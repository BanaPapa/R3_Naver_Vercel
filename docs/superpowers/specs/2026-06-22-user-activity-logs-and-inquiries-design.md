# 사용자 활동 로그 & 1:1 문의 시스템 — 설계 문서

- 작성일: 2026-06-22
- 상태: 승인됨 (구현 플랜 대기)
- 스택: Vite + React + TS (Vercel) · Supabase(auth/profiles/RLS) · 로컬 에이전트(네이버 프록시)

## 1. 목표

승인된 일반 사용자의 검색 활동을 관리자가 들여다보고, 사용자–관리자 간 1:1 문의를
주고받을 수 있게 한다. 다섯 가지 기능:

1. 데이터 수집 시 하단 상세로그(`LogPanel`)를 **관리자에게만** 노출, 일반 사용자는 숨김.
2. 비관리자 사용자가 **백그라운드 검색 실패** 시 "관리자에게 문의하세요" 모달
   (+ [관리자에게 문의] 버튼).
3. 관리자가 **회원을 더블클릭**하면 그 회원의 **검색내역**(어떤 지역의 어떤 상품을
   검색했는지 — 결과 매물은 제외) 조회.
4. 사용자 ↔ 관리자 **1:1 대화 스레드**(사용자당 1개). 관리자가 답변을 남기면
   사용자가 모달 안에서 확인.
5. 관리자가 새 문의 도착 시 **인앱 배지 + 실시간(Supabase Realtime)** 알림.

## 2. 확정된 결정 사항

| 항목 | 결정 |
|------|------|
| 검색내역 저장 수준 | **검색 요약 레코드만** (결과 매물 제외) |
| 관리자 알림 | **인앱 배지 + Supabase Realtime** |
| 문의 구조 | **사용자당 1개 대화 스레드**(채팅형) |
| 실패 모달 | **[관리자에게 문의] 버튼 포함** (실패 맥락 자동 첨부) |
| 사용자 "문의하기" 위치 | **사이드바 하단** |
| 검색내역 보존 기간 | **최근 6개월** |

## 3. 데이터 모델 (supabase/schema.sql 에 추가)

기존 스타일(`is_admin()` SECURITY DEFINER 헬퍼, 본인행/관리자 RLS, `touch_updated_at`)을 그대로 따른다.

### 3.1 `public.search_logs` — 검색 1회 = 1행

```sql
create table if not exists public.search_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade default auth.uid(),
  large_name       text,
  mid_name         text,
  small_name       text,
  real_estate_type text not null,          -- 'APT:JGC:JGB' 등 UI 코드
  trade_type       text,                   -- 'A1'/'B1'/'B2'
  area_label       text,
  status           text not null default 'running'
                     check (status in ('running','done','error','stopped')),
  result_count     int,
  error_message    text,
  created_at       timestamptz not null default now(),
  ended_at         timestamptz
);
create index if not exists idx_search_logs_user_created
  on public.search_logs (user_id, created_at desc);
```

RLS:
- insert: 본인 (`with check (user_id = auth.uid())`)
- update: 본인 (종료 상태 패치) (`using/with check (user_id = auth.uid())`)
- select: **본인 또는 관리자** (`using (user_id = auth.uid() or public.is_admin())`)

보존 6개월:
- 읽기 측에서 `created_at >= now() - interval '6 months'` 필터(정확성 보장).
- 정리 함수 + pg_cron(가능 시):
  ```sql
  create or replace function public.cleanup_old_search_logs()
  returns void language sql security definer set search_path = public as $$
    delete from public.search_logs where created_at < now() - interval '6 months';
  $$;
  -- pg_cron 사용 가능 시: 매일 03:00 실행
  -- select cron.schedule('cleanup_search_logs','0 3 * * *','select public.cleanup_old_search_logs()');
  ```
  pg_cron 미사용 환경이면 읽기 필터만으로도 요구사항(최근 6개월 노출) 충족.

### 3.2 `public.inquiries` — 1행 = 스레드의 메시지 1개

사용자당 1스레드이므로 `user_id`가 곧 스레드 키. 별도 thread 테이블 없음.

```sql
create table if not exists public.inquiries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,  -- 스레드 소유자
  sender_role   text not null check (sender_role in ('user','admin')),
  body          text not null,
  context       jsonb,                 -- 실패 맥락(지역/상품/에러) 자동 첨부용, nullable
  read_by_admin boolean not null default false,
  read_by_user  boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_inquiries_user_created
  on public.inquiries (user_id, created_at);
```

규칙:
- user 메시지: `user_id = auth.uid()`, `sender_role='user'`, `read_by_user=true`, `read_by_admin=false`
- admin 답변: `user_id = (대상 사용자)`, `sender_role='admin'`, `read_by_admin=true`, `read_by_user=false`

RLS:
```sql
alter table public.inquiries enable row level security;

-- 본인 스레드 또는 관리자만 조회
create policy "inquiries_select_own_or_admin" on public.inquiries
  for select using (user_id = auth.uid() or public.is_admin());

-- 본인은 자기 user 메시지, 관리자는 admin 답변만 삽입
create policy "inquiries_insert_scoped" on public.inquiries
  for insert with check (
    (user_id = auth.uid() and sender_role = 'user')
    or (public.is_admin() and sender_role = 'admin')
  );

-- 읽음 표시 갱신(본인/관리자)
create policy "inquiries_update_visible" on public.inquiries
  for update using (user_id = auth.uid() or public.is_admin())
              with check (user_id = auth.uid() or public.is_admin());
```

Realtime 발행:
```sql
alter publication supabase_realtime add table public.inquiries;
```

미읽음 카운트:
- 관리자 배지 = `sender_role='user' and read_by_admin=false` 행 수(전역). 회원별 점(dot) = 해당 `user_id`에 위 조건 행 존재 여부.
- 사용자 배지 = `user_id=auth.uid() and sender_role='admin' and read_by_user=false` 행 수.

## 4. 검색 활동 로깅

`NaverCrawlerTab`이 크롤러 상태 전이를 감시한다.
- 새 검색 시작(`status -> 'running'`, 새 `meta`): `startSearchLog(meta)` → `search_logs` 행 insert(status='running'), 반환된 `id`를 ref에 보관.
- 종료(`status -> 'done'|'error'|'stopped'`): `finishSearchLog(id, { status, resultCount, errorMessage })`로 같은 행 update(+`ended_at=now()`).
- 로깅 실패는 조용히 무시(검색 자체를 막지 않음). 비로그인/Supabase 미설정 시 no-op.

신규 `src/services/searchLogsRepo.ts`:
- `startSearchLog(meta: SearchMeta): Promise<string | null>`
- `finishSearchLog(id: string, patch: { status; resultCount?; errorMessage? }): Promise<void>`
- `listSearchLogs(userId: string): Promise<SearchLog[]>` — 관리자용, 최근 6개월 필터, 최신순.

`SearchLog` 타입: 위 컬럼을 camelCase로 매핑.

## 5. 역할별 로그 노출 + 실패 모달

- `App.tsx`가 `isAdmin`을 `NaverCrawlerTab`에 전달(현재 `session`만 전달 중).
- **관리자:** 하단 `LogPanel` 그대로 노출.
- **일반 사용자:** `LogPanel` 렌더 안 함.
- **백그라운드 검색 실패**(크롤러 `onError` + 크롤토큰 발급 실패 등)가 비관리자에게 발생 시:
  - 모달 "문제가 발생했습니다. 관리자에게 문의해 주세요." + [관리자에게 문의] 버튼.
  - 버튼 → 실패 맥락(지역/상품/에러 메시지)을 `context`로 들고 `InquiryModal` 오픈.
  - 관리자에게는 이 모달을 띄우지 않음(관리자는 로그로 직접 확인).

## 6. 1:1 문의 (사용자 측)

- 신규 `src/components/inquiry/InquiryModal.tsx`: 메시지 목록(말풍선, user/admin 구분) + 입력창.
  실패 모달의 [관리자에게 문의] 또는 사이드바 항목에서 오픈.
- `src/services/inquiriesRepo.ts`:
  - `listMyThread(): Promise<InquiryMessage[]>`
  - `sendUserMessage(body: string, context?: object): Promise<void>`
  - `markThreadReadByUser(): Promise<void>`
  - `countUserUnread(): Promise<number>`
  - (관리자용) `listThread(userId)`, `sendAdminReply(userId, body)`, `markThreadReadByAdmin(userId)`,
    `countAdminUnread()`, `listUnreadUserIds()`
- `src/hooks/useInquiries.ts`(사용자): 내 스레드 로드 + 미읽음 수 + Realtime 구독(내 `user_id`,
  `sender_role='admin'` insert 시 갱신) + 전송.
- 사이드바 **하단**에 "관리자에게 문의하기" 항목(미읽음 배지) 추가.

## 7. 관리자 측 — 회원별 조회 + 알림

- **회원 더블클릭** → 신규 `src/components/admin/MemberDetailModal.tsx`. 탭 2개:
  - **검색내역:** `listSearchLogs(userId)` 표 — 시각 · 지역(대/중/소) · 상품유형 · 거래유형 · 면적 · 결과건수 · 상태(성공/실패+에러). 최근 6개월.
  - **문의:** 해당 사용자 스레드(`listThread`) + 답변 입력(`sendAdminReply`). 열면
    그 사용자의 user 메시지를 읽음 처리(`markThreadReadByAdmin`).
  - 더블클릭 충돌 처리: 기존 인라인 편집 셀은 `onDoubleClick`에서 `stopPropagation`,
    행(비편집 영역) 더블클릭으로 상세 오픈. 추가로 행에 작은 "상세" 아이콘 버튼도 둠.
- **알림:** 신규 `src/hooks/useAdminInbox.ts` — 총 미읽음 수 + 미읽음 사용자 id 집합 +
  Realtime 구독(`inquiries` insert where `sender_role='user'`).
  - `Sidebar`의 회원관리 탭에 총 미읽음 배지.
  - `MemberApproval` 회원 행에 미읽음 점(dot).

## 8. 신규/수정 파일

신규:
- `supabase/schema.sql` 에 `search_logs` / `inquiries` 테이블·RLS·Realtime·정리함수 추가
- `src/services/searchLogsRepo.ts`
- `src/services/inquiriesRepo.ts`
- `src/hooks/useInquiries.ts`
- `src/hooks/useAdminInbox.ts`
- `src/components/inquiry/InquiryModal.tsx`
- `src/components/admin/MemberDetailModal.tsx`

수정:
- `src/App.tsx` — `isAdmin` 전달, 사용자 문의 모달/관리자 inbox 와이어링
- `src/components/NaverCrawlerTab.tsx` — `LogPanel` 게이팅 + 검색 로깅 + 실패 모달
- `src/components/Sidebar.tsx` — 하단 "관리자에게 문의하기" 항목 + 배지(사용자) / 회원관리 배지(관리자)
- `src/components/admin/MemberApproval.tsx` — 행 더블클릭 → `MemberDetailModal`, 미읽음 점

## 9. 구현 순서 (단계화)

1. **DB/RLS** — `search_logs`/`inquiries` 테이블·RLS·Realtime·정리함수 (schema.sql) + 두 repo 서비스.
2. **검색 로깅 + 로그 게이팅** — `NaverCrawlerTab` 로깅 와이어링, `isAdmin` 전달, `LogPanel` 숨김.
3. **회원 상세(검색내역)** — `MemberDetailModal` 검색내역 탭 + 행 더블클릭.
4. **문의 스레드 + 실패 모달** — `InquiryModal`, 사용자 전송, 관리자 답변 탭, 비관리자 실패 모달 CTA.
5. **Realtime 배지/알림** — `useInquiries`/`useAdminInbox` 구독, 사이드바/회원행 배지.

## 10. 보안/엣지 케이스

- 모든 신규 테이블 RLS 강제. 비관리자는 본인 행만, 관리자는 `is_admin()` 통해 전체.
- 검색 로깅/문의 전송 실패는 사용자 작업(검색)을 막지 않음 — 조용히 처리하고 콘솔 경고.
- Supabase 미설정(로컬 no-auth) 시 모든 repo no-op로 안전 폴백(기존 패턴 동일).
- `inquiries` body는 사용자 입력 → React 기본 이스케이프로 렌더(XSS 방지). 길이 제한(예: 2000자) 클라이언트 검증.
- 실시간 미연결(네트워크 단절) 시 모달 오픈/새로고침 시점의 폴링으로 미읽음 수 보강.
