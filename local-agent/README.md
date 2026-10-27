# Local Sermon Agent

이 디렉터리는 로컬에서 실행하는 말씀 자료 Agent입니다. 실행 소스와 안내는 공유하고, 로그와 인증 정보는 git에 포함하지 않습니다.

## 실행 전제
- 상위 디렉터리의 `node_modules` 사용
- 프로젝트 루트 `.env.local` 또는 `.env`에 환경변수 설정
- Node 24 실행 (`run-sermon-materials-agent.sh` 는 `node@24` 를 사용)

### Codex 엔진 사용 시 (기본값)
- `codex` CLI 설치 및 로그인 완료
- 기본 모델은 `gpt-6.1-sol` 입니다.
- 다른 모델을 사용하려면 `LOCAL_AGENT_MODEL` 또는 `--model`로 재정의할 수 있습니다.

### Kiro CLI 엔진 사용 시
- `kiro-cli` 설치 및 로그인 완료
- 별도 API 키 불필요 (`kiro-cli` 로그인 세션 사용)
- 기본 모델은 `claude-opus-5.5` 입니다.
- 다른 모델을 사용하려면 `LOCAL_AGENT_MODEL` 또는 `--model`로 재정의할 수 있습니다.
- 실행 바이너리 경로를 바꾸려면 `LOCAL_AGENT_KIRO_BIN` 환경변수 사용

### Claude 엔진 사용 시
- `ANTHROPIC_API_KEY` 환경변수 설정 필요
- `.env.local`에 추가: `ANTHROPIC_API_KEY=sk-ant-...`

## 1회 실행 (Codex / gpt-6.1-sol, 기본)
```bash
node local-agent/sermon-materials-agent.mjs
# 또는 Node 24 래퍼 스크립트 사용:
./local-agent/run-sermon-materials-agent.sh
```

## 1회 실행 (다른 엔진)
```bash
node local-agent/sermon-materials-agent.mjs --engine kiro
node local-agent/sermon-materials-agent.mjs --engine claude
# 또는 환경변수로 기본 엔진 변경:
# LOCAL_AGENT_ENGINE=claude node local-agent/sermon-materials-agent.mjs
```

## 특정 설교 1건 실행
```bash
node local-agent/sermon-materials-agent.mjs --id <sermon-id>
node local-agent/sermon-materials-agent.mjs --id <sermon-id> --engine claude
```

## 결과만 확인 (DB 변경 없음)
```bash
node local-agent/sermon-materials-agent.mjs --id <sermon-id> --dry-run --print-result
```

## 반복 실행
```bash
node local-agent/sermon-materials-agent.mjs --watch --poll-seconds 60
node local-agent/sermon-materials-agent.mjs --watch --poll-seconds 60 --engine claude
```

## 청년 소그룹 교재 작성 기준
- 기본 엔진은 Codex(GPT), 기본 모델은 `gpt-6.1-sol`입니다. 환경변수나 실행 옵션으로 재정의할 수 있습니다.
- 20대 후반~30대 초반을 대상으로 쉬운 말과 구체적인 생활 장면을 사용하되, 입력된 말씀과 설교 자료의 의미에 근거합니다.
- 질문 작성 전에 설교 원문 전체의 반복된 강조와 결론에서 가장 주된 주제 하나를 파악합니다. 본문 일반론이나 제목보다 목사님이 실제로 강조하신 메시지를 우선하며, 원문이 없을 때만 대지·요약·본문 순으로 근거를 사용합니다.
- 중심 주제(`primary_theme`), 실제 원문 발췌 2~3개(`sermon_evidence`), 나눔 방향(`sharing_direction`)을 질문 메타데이터에 남깁니다. 요약과 말씀 점검·은혜 나눔·결단은 모두 그 주제로 이어져야 합니다.
- 중심 주제·나눔 방향·대지별 연결 설명의 누락과 발췌 근거의 입력 자료 일치 여부는 프로그램에서 검증합니다. 주제 해석과 각 질문의 의미상 연결은 모델의 원문 검토와 자체 점검 기준으로 지시합니다.
- 질문 하나에는 핵심 요청 하나만 담고, 민감한 경험은 참여자가 공개 범위를 선택할 수 있게 묻습니다.
- 화면의 말씀 점검·은혜 나눔·결단은 각각 2~3문항으로 제한합니다. 기본 구성은 2·3·2문항(총 7문항)이며, 관련 대지를 묶고 반복 질문을 줄여 서로의 경험과 적용을 나눌 시간을 확보합니다.
- 대지별 질문 수와 전체 흐름 단계별 질문 수를 모두 검증하며, 어느 쪽이든 2~3문항을 벗어나면 저장하지 않습니다.
- 결단은 이번 주 실천할 한 가지로 좁히고, 공동체 질문은 앞선 나눔을 받아 도움·기도·격려로 이어갑니다.
- 생성 전 자체 점검을 프롬프트로 지시합니다. 이러한 문안 품질 기준은 모델에 대한 지침이며, 프로그램의 자동 검증을 대신하지 않습니다.


## 선택한 부분만 수정 요청

관리자 → 말씀 자료 → 나눔자료 수정 → **로컬 Agent에게 수정 요청**에서 항목과 원하는 방향을 적습니다. 마음 열기, 핵심 메시지, 전체 흐름, 요약 단락, 질문 한 개(설명·참고 답안·장절 포함), 실천 선택지, 마무리 기도를 고를 수 있습니다. 수정 중인 내용은 먼저 저장해야 합니다.

최초 설치 시 `supabase/migrations/202610270001_sermon_revisions.sql`을 Supabase의 관리자 SQL 도구 또는 기존 DB migration 절차로 적용합니다. 요청과 원문 스냅샷은 서비스 역할만 읽는 별도 테이블에 저장됩니다. DB 설정 전에는 부분 수정 화면에 설치 안내를 표시하고 기존 전체 생성은 계속 동작합니다.

기존 실행 명령을 그대로 사용합니다. 한 번 실행하면 가장 오래된 수정 요청 한 건을 우선 처리하며, 반복 모드에서는 계속 확인합니다.

```bash
./local-agent/run-sermon-materials-agent.sh --watch --poll-seconds 10
# 특정 요청만 처리
./local-agent/run-sermon-materials-agent.sh --revision-id <요청-UUID>
```

수정 요청은 기존 자료를 바꾸지 않습니다. Agent가 선택 항목만 작성하고 별도 AI 검토를 수행하면 관리자 화면에 기존 내용·수정안·수정 이유·검토 결과가 표시됩니다. **수정안 반영**을 누르면 선택한 부분을 변경하고 공개 전 검토 상태로 저장합니다. 원음·내용을 확인한 뒤 기존 공개 버튼으로 게시합니다. 준비된 수정안에 추가 지시가 필요하면 취소하고 다시 요청합니다. 현재는 이전 요청을 포함한 자동 대화나 전체 공통 지침 수정 기능은 아닙니다.

원문이나 다른 내용이 요청 당시와 달라지면 오래된 수정안 반영을 거부합니다. 중복 처리는 작업 점유와 만료 시간으로 막고, 실행 중에는 점유를 갱신합니다. 취소된 작업의 늦은 결과는 버립니다. 실패 시 원자료는 그대로 유지합니다. 수정 요청과 원고는 실행 시 설정된 AI 엔진에 전달됩니다. `--dry-run`은 수정 요청을 점유하거나 AI에 전달하지 않고 대기 여부만 확인합니다.
