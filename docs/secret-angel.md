# 비밀 천사 운영 및 배포 안내

> 후속 운영 반영: 사용자가 실제 서비스 배포를 승인했습니다. Vercel `kyuky920s-projects/ghchurch` 운영 DB는 `nanylleoxdtynibznfft`입니다. 기존 로컬/README 예제의 `khzweuawuyrqohgjdzsn`과 다릅니다. 운영 DB에 아래 migration을 SQL Editor로 적용했고 관리자 환경변수를 설정했습니다. 아래 “검증 결과”의 미배포 기록은 최초 개발 검증 당시의 기록이며, 실제 앱 공개 상태는 최신 Vercel 배포로 확인합니다.

## 현재 구현

- 기존 Next.js 14 Pages Router, React 18, Supabase service role API 구조를 유지했습니다. `/cell`에 `/secret_angel` 진입 링크를 추가했습니다.
- 기존 셀의 이름·기기 ID 로그인은 마니또 인증으로 사용하지 않습니다. 기존 `members`, `app_members`, 셀모임 테이블은 수정하지 않습니다.
- 관리자: 서버 전용 별도 비밀번호 → 12시간 HttpOnly 세션. 모임을 여러 개 만들 수 있습니다.
- 모임: 관리자 명단 10~20명. 동명이인은 `김소망A`, `김소망B`처럼 구분합니다. 모임 코드와 참가자별 무작위 일회용 코드를 개별 전달합니다. 공유 참여코드만으로 이름을 선점할 수 없습니다.
- 참가자: 첫 등록 시 이름 + 개인 참여코드 + 숫자 6~12자리 PIN. 다음부터 모임 코드 + 이름 + PIN. PIN은 salt + scrypt, 참여코드와 세션 토큰은 SHA-256 해시만 저장합니다. 코드의 무작위성은 각각 96비트, 세션 토큰은 256비트입니다.
- 관리자 PIN 재발급은 기존 PIN과 해당 참가자의 모든 기존 세션을 즉시 무효화합니다. 재발급 코드는 화면에 한 번만 표시됩니다. 시작 후에도 PIN 복구가 가능합니다.
- 전원 등록 후 관리자 확정으로 한 번만 비밀 배정합니다. 암호학적 난수로 섞은 순환 배정이므로 자기 배정·중복·상호 맞교환이 없습니다. 배정 재추첨과 시작 후 명단 변경은 지원하지 않습니다. 관리자는 접힌 전용 배정표를 볼 수 있습니다.
- 시작일은 현재부터 30일 이내로 예약할 수 있습니다. 시작 시각부터 7일마다 다음 주가 열립니다. 활동은 정확히 56일 동안이며 일일 제한은 한국 시각(UTC+9) 자정에 초기화됩니다. 시작 시각 입력은 기기 현지 시각을 UTC로 변환해 전송합니다. 표시 시각은 한국 시각입니다.

| 기능 | 열림 | 제한 및 공개 범위 |
| --- | --- | --- |
| 주차별 미션 | 1~8주차 순서대로 | 주차당 한 번 10P, 지난 열린 주차 완료 가능, 포인트는 본인만 확인 |
| 기도 제목 | 1주차 | 매주 1개, 본인과 본인을 돌보는 천사만 열람 |
| 기도 응답/감사 | 1주차 | 본인이 기록, 천사가 함께 열람. 천사는 배정된 친구에게 기도 표시 가능 |
| 하트 | 1주차 | 배정된 친구에게 하루 1개. 받는 사람에게 발신자 미공개 |
| 익명 양방향 편지 | 2주차 | 내 마니또 / 나의 비밀 천사 대화방 분리, 방마다 하루 5개, 500자 |
| 의심하기 | 3주차 | 매주 1회, 자신 제외 누구나 선택. 받는 사람에게 의심한 사람의 이름 공개 |
| 의심 답변 | 3주차 | 받은 의심당 준비된 문구 1회. 정답 여부는 계산·전달하지 않음 |
| 정체 공개 | 56일 경과 후 | 관리자가 공개 확정하면 전체 배정표 공개, 이후 활동 종료 |

주차 2 미션에는 익명 편지가 포함됩니다. 미션은 본인 완료 확인 방식이며 편지를 작성했다고 자동 점수가 부여되지는 않습니다. 참가자 기도·편지는 관리자 화면에서도 조회하지 않습니다. 다만 DB service role 접근 권한을 가진 운영자는 DB 원본을 볼 수 있으므로 종단간 암호화 서비스는 아닙니다. 참가자가 직접 편지 본문에 정체를 쓰는 것은 차단하지 않습니다.

## 데이터와 보안

새 테이블은 `secret_angel_seasons`, `secret_angel_sessions`, `secret_angel_limits` 세 개입니다. 10~20명 규모에 맞게 모임 상태를 단일 private JSONB 행에 저장합니다. 변경마다 버전 조건으로 원자적 갱신하고 충돌 시 최신 상태로 재검증합니다. 중복 포인트·하트·의심과 동시 등록을 같은 방식으로 방지합니다. 규모가 커질 경우 활동별 테이블로 분리가 필요합니다.

- 세 테이블 모두 RLS 활성화, `PUBLIC`/`anon`/`authenticated` 권한 회수, service role만 접근.
- rate limit RPC도 일반 사용자 실행 권한 회수. DB 기반 원자적 제한이므로 여러 Vercel 인스턴스에서 공유됩니다. 로그인 계정당 15분 8회, 전체 인증 15분 300회, 인증 세션당 분당 120회입니다. 성공한 로그인도 횟수에 포함되며 429일 때 제한 창 이후 재시도합니다.
- 브라우저는 service key를 받지 않습니다. API가 세션의 모임·참가자·PIN 변경 버전을 확인하고 필요한 데이터만 반환합니다. 클라이언트가 보낸 관리자 플래그/발신자/수신자를 권한으로 사용하지 않습니다.
- 쿠키: HttpOnly, SameSite=Strict, 프로덕션 Secure, `/api/secret-angel` 경로, 12시간 만료, 로그아웃 시 서버 토큰 삭제.
- 변경 API는 JSON과 동일 출처를 확인하고, 모든 응답에 `private, no-store`를 지정합니다. 기도·편지·PIN·참여코드를 브라우저 저장소에 저장하지 않습니다. 탭 복원을 위해 모임 코드만 sessionStorage에 보관합니다.
- 공개 시점까지 천사 이름, 전체 배정표, 다른 사람의 콘텐츠와 PIN 해시는 참가자 응답에 포함하지 않습니다. 인증된 같은 모임 참가자는 의심할 대상을 고르기 위해 참가자 이름 명단을 봅니다.
- 기본 API 본문 한도는 16KB. 기도·편지·응답은 500자, 이름 30자, 모임명 60자 제한입니다.

Supabase 권한 설계 참고: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Database functions](https://supabase.com/docs/guides/database/functions).

## 반영 파일

| 파일 | 역할 |
| --- | --- |
| `pages/secret_angel/index.js` | 참가자/관리자 화면 |
| `styles/SecretAngel.module.css` | 기존 베이지·브라운·그린 계열 반응형 디자인 |
| `pages/api/secret-angel/index.js` | API 진입점과 본문 제한 |
| `lib/secret-angel/game.mjs` | 배정·8주 활동·공개 범위·PIN 규칙 |
| `lib/secret-angel/server.mjs` | 인증·쿠키·접근 권한·DB 호출·동시성 처리 |
| `supabase/migrations/202610250001_secret_angel.sql` | 세 테이블, 권한, 제한 RPC |
| `supabase/tests/secret_angel.sql` | PostgreSQL 권한·RLS·CAS·RPC·연쇄 삭제 검증 |
| `tests/secret-angel.test.mjs` | 게임 규칙과 개인정보 공개 범위 테스트 |
| `tests/secret-angel-server.test.mjs` | API 인증·세션·동시 요청 테스트 |
| `tests/secret-angel-db.mjs` | 운영 DB와 격리된 API 테스트용 어댑터 |
| `pages/cell/index.js` | 비밀 천사 진입 링크 |
| `.env.example`, `package.json`, `README.md` | 환경변수 예제, 테스트 명령, 안내 링크 |

추가 런타임 의존성은 없습니다. 기존 사용자가 수정한 `.gitignore`, `local-agent/*`, 의존성 변경 및 기타 파일은 보존했습니다.

## 검증 결과 (2026-10-25)

- `npm run test:secret-angel`: 22개 통과. 등록·복구, 배정 불변식 100회, 잠금 경계, 개인정보 범위, 양방향 편지 분리, 의심 제한, 로그인·세션·계정 제한·동시 요청을 검증했습니다.
- `npm run build`: 전체 라우트 프로덕션 빌드 통과. 테스트용 Supabase URL/key로 빌드했고 운영 DB에는 연결하지 않았습니다. 기존 Browserslist 데이터 갱신 안내와 외부 Google Fonts 다운로드 실패 경고가 있으며 빌드 실패는 아닙니다.
- 임시 PGlite PostgreSQL에서 마이그레이션과 `supabase/tests/secret_angel.sql` 실행 통과. 일반 사용자 테이블/RPC 차단, service role 접근, 버전 충돌, 제한 RPC, 세션 연쇄 삭제와 롤백 확인. 실제 Supabase PostgREST와 배포 환경 연결 검증은 별도 staging 확인이 필요합니다.
- 실제 Chrome 390px 모바일 뷰에서 운영 DB와 격리한 API 테스트 어댑터 사용: 관리자 모임 생성 → 코드 등록 → 배정 → 미션/포인트 → 하트 → 기도/응답 → 편지 채널 분리 → 의심 → 새로고침 → 로그아웃 통과. 가로 넘침과 페이지 JavaScript 오류 없음.
- 이 기기의 기본 Homebrew Node는 `libsimdjson.29.dylib` 누락으로 실행되지 않습니다. 검증은 Codex 번들 Node v24.22.1로 수행했습니다. 일반 로컬 실행 전 Node 설치를 복구하거나 정상적인 Node 런타임을 PATH에 지정하세요.
- 운영 DB 마이그레이션, 원격 push, 프로덕션 배포는 실행하지 않았습니다.

## 배포 절차 (미실행)

1. 기존 사용자의 변경과 이번 파일을 함께 검토합니다. DB 백업/복구 수단이 있는 staging Supabase를 준비합니다. 운영 DB를 로컬 검증 DB로 쓰지 마세요.
2. 정상적인 Node 환경에서 기존 lockfile 기준 `npm ci` 후 `npm run test:secret-angel`을 실행합니다.
3. staging DB에 `supabase/migrations/202610250001_secret_angel.sql`을 적용합니다. 프로젝트의 migration 이력을 먼저 확인한 뒤 Supabase CLI 또는 SQL Editor를 사용합니다. 다른 migration을 확인 없이 함께 밀어 넣지 마세요.
4. staging DB에서 `supabase/tests/secret_angel.sql`을 실행합니다. 테스트 데이터는 transaction rollback으로 제거됩니다. SQL Editor의 DB 관리자 권한으로 실행해야 역할 전환을 검사할 수 있습니다.
5. 서버 환경변수를 설정합니다:
   - `SUPABASE_URL`: staging/대상 DB URL
   - `SUPABASE_SERVICE_KEY`: 해당 DB의 서버 전용 service role key
   - `SECRET_ANGEL_ADMIN_SECRET`: 새롭고 독립적인 32자 이상의 무작위 비밀번호. 예: `openssl rand -hex 32`로 생성. `.env.example`의 예제 문구를 실제 값으로 쓰지 마세요.
   - `NEXT_PUBLIC_APP_URL`: 실제 접속할 URL의 origin과 일치해야 합니다. 로컬은 `http://localhost:3000`, preview는 해당 preview origin, 운영은 `https://ghchurch.vercel.app`. 경로는 제외합니다. 이 값이 다른 origin이면 변경 요청이 거절됩니다.
6. `npm run build` 후 preview에 반영합니다. `/cell` 링크, 10명 테스트 모임 생성·개별 등록·로그인·PIN 복구·시작을 확인합니다. 두 명 이상의 세션으로 배정된 친구와 천사 간 편지/기도를 확인하고, 제3자 접근이 차단되는지 점검합니다. 주차를 빠르게 확인하려면 격리된 테스트 DB의 테스트 모임 시작 시각만 조정합니다.
7. 사용자가 프로덕션 반영을 요청한 뒤에만 운영 DB에 migration 적용 → 운영 환경변수 설정 → 앱 배포 순서로 진행합니다. 현재 작업에는 이 단계 실행이 포함되지 않았습니다.
8. 담당 리더가 `/secret_angel`의 관리자 탭에 로그인해 모임 생성 → 개인 코드 개별 전달 → 전원 등록 확인 → 시작 확정을 합니다. 계정이 아닌 환경변수 관리자 비밀번호 방식이므로 공유 범위를 담당 운영자로 제한합니다.

운영에는 별도 cron 없이 조회 시 서버 시각으로 주차가 자동 계산됩니다. 시작 시각 이후에는 재추첨·시간 변경을 제공하지 않습니다. 56일이 지나면 관리자가 최종 공개를 확정합니다. 코드 재발급과 공개 버튼은 추가 확인을 거치고, 영구 삭제는 정확한 모임 코드를 입력해야 합니다.

## 보관과 삭제

기본 자동 보관 만료 정책은 없습니다. 행사 종료 30일 후 모임을 삭제하는 운영 정책을 권장합니다. 모임 관리자 화면의 삭제 기능을 실행하면 이름·PIN 해시·배정·기도·편지·하트·의심이 있는 모임 행과 관련 참가자 세션을 삭제합니다. DB 백업 보관 정책에는 별도 적용이 필요합니다. 이 기간을 참가자에게 사전 안내하세요.

만료된 인증/제한 행은 정기 점검 시 아래와 같이 삭제할 수 있습니다. SQL은 운영자가 필요한 환경에 직접 적용합니다.

```sql
delete from public.secret_angel_sessions where expires_at < now();
delete from public.secret_angel_limits where resets_at < now();
```

## 롤백

우선 기존 앱 버전으로 되돌려 새 경로와 API를 내립니다. 기존 셀 테이블은 수정하지 않았으므로 기존 `/cell`은 유지됩니다. 모임 데이터 보존이 필요하면 새 테이블을 그대로 둡니다. 완전 제거가 승인된 경우에만 백업 후 RPC와 새 테이블 세 개를 삭제합니다. 운영 데이터가 들어간 테이블을 배포 롤백과 동시에 자동 삭제하지 마세요.
