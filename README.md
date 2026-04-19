# WORD & LIFE — 청년부 말씀 나눔 서비스

## 구조

```
[리더 - Claude Artifact]
  말씀 입력 → AI 생성 → POST /api/sermons
                              ↓
              [Vercel Next.js API + Supabase DB]
                              ↓
              [청년 웹서비스 - vercel URL]
```

## 배포 순서

### 1. GitHub 업로드
```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/YOUR_ID/wordlife.git
git push -u origin main
```

### 2. Vercel 배포
1. vercel.com → Import Project → GitHub 연결
2. 환경변수 설정 (Settings → Environment Variables):

| 변수명 | 값 |
|--------|-----|
| `SUPABASE_URL` | https://nanylleoxdtynibznfft.supabase.co |
| `SUPABASE_SERVICE_KEY` | (Supabase Legacy service_role key) |
| `LEADER_API_SECRET` | wordlife-leader-2025 (자유롭게 변경) |
| `NEXT_PUBLIC_API_URL` | https://your-project.vercel.app |

3. Deploy 클릭

### 3. Claude Artifact 리더 도구 설정
Artifact 상단의 `API_URL`과 `API_SECRET`을 Vercel URL로 업데이트

## API

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | /api/sermons | 없음 | 전체 목록 |
| POST | /api/sermons | Bearer secret | 저장/수정 |
| PATCH | /api/sermons/:id | Bearer secret | 수정 |
| DELETE | /api/sermons/:id | Bearer secret | 삭제 |

## Supabase 테이블 (SQL Editor에서 실행)
```sql
drop table if exists sermons cascade;

create table sermons (
  id uuid default gen_random_uuid() primary key,
  week text not null,
  service text not null,
  reference text not null,
  sermon_title text,
  passage text,
  questions jsonb,
  meditations jsonb,
  card_verse text,
  created_at timestamptz default now(),
  unique(week, service)
);

alter table sermons enable row level security;
create policy "r" on sermons for select using (true);
create policy "i" on sermons for insert with check (true);
create policy "u" on sermons for update using (true);
create policy "d" on sermons for delete using (true);
```
