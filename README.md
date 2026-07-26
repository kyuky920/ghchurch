# KYESIN

`Next.js + Vercel + Supabase` 기반으로 시작하는 프로젝트 기본 환경 문서입니다.

## 연결 대상

- GitHub: [kyuky920/kyesin](https://github.com/kyuky920/kyesin)
- Vercel: [kyesin project](https://vercel.com/kyuky920s-projects/kyesin)
- Supabase: [khzweuawuyrqohgjdzsn](https://supabase.com/dashboard/project/khzweuawuyrqohgjdzsn)

## 현재 스택

- Next.js 14
- React 18
- `@supabase/supabase-js`
- Vercel 배포 기준 설정

## 로컬 시작

```bash
npm install
cp .env.example .env.local
npm run dev
```

앱은 기본적으로 `http://localhost:3000` 에서 실행됩니다.

## 환경변수

`.env.local` 에 아래 값을 채워서 사용합니다.

| 변수명 | 설명 |
|--------|------|
| `NEXT_PUBLIC_APP_NAME` | 앱 표시 이름 |
| `NEXT_PUBLIC_APP_URL` | 로컬/배포 앱 URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_URL` | 서버용 Supabase URL |
| `SUPABASE_SERVICE_KEY` | 서버용 service role key |
| `LEADER_API_SECRET` | 관리자/내부 API 보호용 시크릿 |

`SUPABASE_URL` 과 `NEXT_PUBLIC_SUPABASE_URL` 은 현재 `https://khzweuawuyrqohgjdzsn.supabase.co` 를 사용하도록 템플릿이 맞춰져 있습니다.

## GitHub 연결

현재 워크스페이스의 `origin` 은 다른 저장소를 가리키고 있을 수 있으니, 새 프로젝트 기준으로 맞출 때는 아래처럼 정리하면 됩니다.

```bash
git remote set-url origin git@github.com:kyuky920/kyesin.git
git push -u origin main
```

HTTPS를 선호하면 아래 주소를 사용해도 됩니다.

```bash
https://github.com/kyuky920/kyesin.git
```

## Vercel 설정

1. Vercel에서 GitHub 저장소 `kyuky920/kyesin` 을 Import 합니다.
2. Framework Preset 은 `Next.js` 를 사용합니다.
3. Environment Variables 에 `.env.example` 의 값을 동일하게 등록합니다.
4. Production Domain 이 연결되면 `NEXT_PUBLIC_APP_URL` 을 실제 배포 URL로 갱신합니다.

이 저장소에는 기본 `vercel.json` 이 포함되어 있어 `install`, `build`, `dev` 명령이 명시적으로 맞춰져 있습니다.

## Supabase 설정

1. Supabase Dashboard 에서 `Project Settings > API` 로 이동합니다.
2. 아래 값을 복사해 `.env.local` 과 Vercel 환경변수에 넣습니다.
   - Project URL
   - anon public key
   - service role key
3. 앞으로 스키마 작업을 시작하면 `supabase/` 디렉터리 아래에 migration 을 추가하는 방식으로 관리하는 것을 권장합니다.

## 다음 추천 순서

1. GitHub 원격 저장소를 `kyesin` 으로 연결
2. `.env.local` 을 새 Supabase 프로젝트 기준으로 교체
3. Vercel 환경변수 등록 후 첫 배포
4. Supabase 스키마와 인증 정책 설계
5. 실제 화면/기능 개발 시작
