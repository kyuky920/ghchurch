import { runPendingRevision } from './sermon-revision-worker.mjs';
import { buildOutputSchema, buildPrompt, normalizeOutput, buildReviewSchema, buildReviewPrompt, validateReview, needsHumanReview } from './sermon-content.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import os from 'os';
import Anthropic from '@anthropic-ai/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

loadEnvFile(path.join(repoRoot, '.env.local'));
loadEnvFile(path.join(repoRoot, '.env'));

const DEFAULT_STALE_MINUTES = 10;
const DEFAULT_POLL_SECONDS = 60;
const DEFAULT_MODEL = process.env.LOCAL_AGENT_MODEL || '';
const CODEX_DEFAULT_MODEL = 'gpt-6.1-sol';
const KIRO_DEFAULT_MODEL = 'claude-opus-5.5';
const DEFAULT_TIMEOUT_SECONDS = Number(process.env.LOCAL_AGENT_TIMEOUT_SECONDS || 3600);
const DEFAULT_RETRIES = Number(process.env.LOCAL_AGENT_RETRIES || 1);
const DEFAULT_ENGINE = process.env.LOCAL_AGENT_ENGINE || 'codex';
const CLAUDE_DEFAULT_MODEL = 'claude-opus-5';
const KIRO_CLI_BIN = process.env.LOCAL_AGENT_KIRO_BIN || 'kiro-cli';

async function main() {
  const options = parseArgs(process.argv.slice(2));
  validateEnv(options);

  const supabase = options.inputFile ? null : createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  ensureDir(path.join(repoRoot, 'local-agent', 'logs'));

  if (options.watch) {
    await runLoop({ supabase, options });
    return;
  }

  await runOnce({ supabase, options });
}

async function runLoop({ supabase, options }) {
  for (;;) {
    try {
      await runOnce({ supabase, options });
    } catch (error) {
      console.error(`[agent] loop error: ${error.message}`);
    }
    await sleep(options.pollSeconds * 1000);
  }
}

async function runOnce({ supabase, options }) {
  if (!options.inputFile) {
    const handled = await runPendingRevision({ db: supabase, options, callAi: (prompt, schema) => callAiWithRetry(prompt, options, schema), parseJson: parseModelJson });
    if (handled || options.revisionId) return;
  }
  const row = options.inputFile ? JSON.parse(fs.readFileSync(options.inputFile, 'utf8')) : await pickTarget({
    supabase,
    id: options.id,
    staleMinutes: options.staleMinutes,
  });

  if (!row) {
    console.log('[agent] 처리할 대상이 없습니다.');
    return;
  }

  console.log(
    `[agent] target=${row.id} week=${row.week ?? '-'} service=${row.service ?? '-'} status=${row.status ?? '-'}`,
  );

  const prompt = buildPrompt(row);

  if (options.printPrompt) {
    console.log(prompt);
    if (options.dryRun) return;
  }

  if (!options.dryRun) {
    await markProcessing(supabase, row.id);
  }

  try {
    const raw = options.mockFile
      ? fs.readFileSync(path.resolve(options.mockFile), 'utf8')
      : await callAiWithRetry(prompt, options);

    const parsed = parseModelJson(raw);
    const normalized = normalizeOutput(parsed, row);
    // A separate call reads the source again; schema checks alone do not verify meaning.
    if (options.mockFile) {
      normalized.questions.meta.quality_review = { status: 'not_run', summary: '오프라인 구조 검증용 결과입니다.', issues: [] };
    } else {
      try {
        const reviewRaw = await callAiWithRetry(buildReviewPrompt(row, normalized), options, buildReviewSchema());
        normalized.questions.meta.quality_review = validateReview(parseModelJson(reviewRaw), row);
      } catch (error) {
        normalized.questions.meta.quality_review = { status: 'needs_review', summary: '독립 검토를 완료하지 못했습니다. 관리자가 확인해 주세요.', issues: [], error: String(error.message).slice(0, 1000) };
      }
    }
    normalized.questions.meta.requires_review = Boolean(needsHumanReview(normalized));

    if (options.dryRun || options.printResult || options.outputFile) {
      const rendered = JSON.stringify(normalized, null, 2);
      if (options.dryRun || options.printResult) {
        console.log(rendered);
      }
      if (options.outputFile) {
        fs.writeFileSync(path.resolve(options.outputFile), rendered, 'utf8');
        console.log(`[agent] 결과 저장: ${path.resolve(options.outputFile)}`);
      }
    }

    if (!options.dryRun) {
      await saveSuccess(supabase, row.id, normalized);
    }

    console.log(
      `[agent] 완료: ${row.id} sections=${normalized.questions.sections.length} flat=${normalized.questions.flat.length}`,
    );
  } catch (error) {
    if (!options.dryRun) {
      await saveFailure(supabase, row.id, error);
    }
    throw error;
  }
}

async function pickTarget({ supabase, id, staleMinutes }) {
  let query = supabase
    .from('sermons')
    .select(
      'id,week,service,reference,sermon_title,passage,sermon_points,status,error_msg,created_at,updated_at',
    )
    .order('created_at', { ascending: true })
    .limit(100);

  if (id) {
    const { data, error } = await query.eq('id', id).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  const { data, error } = await query;
  if (error) throw error;

  const now = Date.now();
  const staleMs = staleMinutes * 60 * 1000;
  const rows = Array.isArray(data) ? data : [];

  const pending = rows
    .filter((row) => row?.status === 'pending')
    .sort(byCreatedAtAsc);

  const staleProcessing = rows
    .filter((row) => isStaleProcessing(row, now, staleMs))
    .sort(byUpdatedAtAsc);

  const retryableErrors = rows
    .filter((row) => row?.status === 'error')
    .sort(byUpdatedAtDesc);

  return pending[0] || staleProcessing[0] || retryableErrors[0] || null;
}

function byCreatedAtAsc(a, b) {
  return new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime();
}

function byUpdatedAtAsc(a, b) {
  return (
    new Date(a?.updated_at || a?.created_at || 0).getTime() -
    new Date(b?.updated_at || b?.created_at || 0).getTime()
  );
}

function byUpdatedAtDesc(a, b) {
  return (
    new Date(b?.updated_at || b?.created_at || 0).getTime() -
    new Date(a?.updated_at || a?.created_at || 0).getTime()
  );
}

function isStaleProcessing(row, now, staleMs) {
  if (row?.status !== 'processing') return false;
  const timeValue = row?.updated_at || row?.created_at;
  if (!timeValue) return true;
  const timestamp = new Date(timeValue).getTime();
  if (Number.isNaN(timestamp)) return true;
  return now - timestamp >= staleMs;
}

async function markProcessing(supabase, id) {
  const { error } = await supabase
    .from('sermons')
    .update({
      status: 'processing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

async function saveSuccess(supabase, id, payload) {
  const { error } = await supabase
    .from('sermons')
    .update({
      status: 'done',
      questions: JSON.stringify(payload.questions),
      sermon_summary: JSON.stringify(payload.sermon_summary),
      error_msg: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}

async function saveFailure(supabase, id, error) {
  const message = String(error?.message || error || 'unknown error').slice(0, 2000);
  const { error: updateError } = await supabase
    .from('sermons')
    .update({
      status: 'error',
      error_msg: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    console.error(`[agent] 실패 저장 오류: ${updateError.message}`);
  }
}

async function callAiWithRetry(prompt, options, schema = buildOutputSchema()) {
  const engine = options.engine;
  const maxAttempts = Math.max(1, options.retries);
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.log(`[agent] ${engine} call attempt=${attempt}/${maxAttempts}`);
      if (engine === 'claude') {
        return await callClaude(prompt, options.model, schema, options, attempt);
      }
      if (engine === 'kiro') {
        return await callKiro(prompt, options.model, schema, options, attempt);
      }
      return await callCodex(prompt, options.model, schema, options, attempt);
    } catch (error) {
      lastError = error;
      console.error(`[agent] ${engine} call failed attempt=${attempt}: ${error.message}`);
      if (attempt < maxAttempts) {
        await sleep(Math.min(10000, attempt * 2000));
      }
    }
  }

  throw lastError;
}

async function callCodex(prompt, model, schema, options, attempt) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghchurch-codex-'));
  const schemaPath = path.join(tempDir, 'schema.json');
  const outputPath = path.join(tempDir, 'output.txt');
  fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf8');

  const codexPrompt = [
    prompt,
    '',
    '[추가 실행 규칙]',
    '- 최종 응답은 JSON 객체 하나만 반환해 주세요.',
    '- 마크다운 코드블록을 사용하지 마세요.',
    '- 출력 예시의 ... 를 그대로 남기지 마세요.',
    '- 제공된 JSON 스키마의 키를 빠짐없이 반환하고, 스키마에 없는 키는 추가하지 마세요.',
  ].join('\n');

  const args = [
    'exec',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--output-schema',
    schemaPath,
    '-o',
    outputPath,
  ];

  if (model) {
    args.push('-m', model);
  }

  args.push(codexPrompt);

  const result = await runCommandClosedStdin('codex', args, {
    cwd: repoRoot,
    timeoutMs: options.timeoutSeconds * 1000,
  });

  const outputText = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  writeAttemptLogs(options, attempt, 'codex', codexPrompt, outputText || result.stdout, result.stderr);

  if (result.stdout && result.stdout.trim()) {
    console.error(result.stdout.trim());
  }
  if (result.stderr && result.stderr.trim()) {
    console.error(result.stderr.trim());
  }

  return outputText;
}

async function callKiro(prompt, model, schema, options, attempt) {
  const kiroPrompt = [
    prompt,
    '',
    '[추가 실행 규칙]',
    '- 최종 응답은 JSON 객체 하나만 반환해 주세요.',
    '- 마크다운 코드블록(```), 설명 문장, 머리말/꼬리말을 절대 붙이지 마세요.',
    '- 응답의 첫 글자는 반드시 "{" 여야 하고 마지막 글자는 반드시 "}" 여야 합니다.',
    '- 출력 예시의 ... 를 그대로 남기지 마세요.',
    '- 제공된 JSON 스키마의 키를 빠짐없이 반환하고, 스키마에 없는 키는 추가하지 마세요.',
    '- 아래 JSON 스키마를 반드시 만족해야 합니다:',
    JSON.stringify(schema),
  ].join('\n');

  const args = [
    'chat',
    '--no-interactive',
    '--trust-tools=',
  ];

  if (model) {
    args.push('--model', model);
  }

  args.push(kiroPrompt);

  const result = await runCommandClosedStdin(KIRO_CLI_BIN, args, {
    cwd: repoRoot,
    timeoutMs: options.timeoutSeconds * 1000,
  });

  const outputText = result.stdout || '';
  writeAttemptLogs(options, attempt, 'kiro', kiroPrompt, outputText, result.stderr);

  if (result.stderr && result.stderr.trim()) {
    console.error(result.stderr.trim());
  }

  return outputText;
}

async function callClaude(prompt, model, schema, options, attempt) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resolvedModel = model || CLAUDE_DEFAULT_MODEL;

  const claudePrompt = [
    prompt,
    '',
    '[추가 실행 규칙]',
    '- 최종 응답은 JSON 객체 하나만 반환해 주세요.',
    '- 마크다운 코드블록을 사용하지 마세요.',
    '- 출력 예시의 ... 를 그대로 남기지 마세요.',
    '- 제공된 JSON 스키마의 키를 빠짐없이 반환하고, 스키마에 없는 키는 추가하지 마세요.',
  ].join('\n');

  const stream = client.messages.stream({
    model: resolvedModel,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: claudePrompt }],
  });

  const message = await stream.finalMessage();
  const textBlock = message.content.find((b) => b.type === 'text');
  const outputText = textBlock?.text ?? '';

  writeAttemptLogs(options, attempt, 'claude', claudePrompt, outputText, '');
  return outputText;
}

function parseModelJson(raw) {
  const candidate = extractJsonText(raw);
  try {
    return JSON.parse(candidate);
  } catch (firstError) {
    try {
      return JSON.parse(repairJson(candidate));
    } catch (secondError) {
      throw new Error(
        `JSON 파싱 실패: ${secondError.message}\n---원본 일부---\n${String(raw).slice(0, 1000)}`,
      );
    }
  }
}

function extractJsonText(raw) {
  let text = String(raw || '').trim();
  text = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    text = text.slice(first, last + 1);
  }
  return text;
}

function repairJson(text) {
  return String(text || '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function parseArgs(argv) {
  const options = {
    id: null,
    inputFile: null,
    revisionId: null,
    engine: DEFAULT_ENGINE,
    model: DEFAULT_MODEL,
    timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
    retries: DEFAULT_RETRIES,
    logDir: path.join(repoRoot, 'local-agent', 'logs'),
    dryRun: false,
    printPrompt: false,
    printResult: false,
    watch: false,
    staleMinutes: DEFAULT_STALE_MINUTES,
    pollSeconds: DEFAULT_POLL_SECONDS,
    mockFile: null,
    outputFile: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--input-file') { options.inputFile = path.resolve(argv[++index] || ''); continue; }

    if (arg === '--revision-id') { options.revisionId = argv[++index] || ''; if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.revisionId)) throw new Error('올바른 수정 요청 ID가 필요합니다.'); continue; }

    if (arg === '--id') {
      options.id = argv[++index] || null;
      continue;
    }
    if (arg === '--engine') {
      const val = argv[++index] || DEFAULT_ENGINE;
      if (val !== 'codex' && val !== 'claude' && val !== 'kiro') {
        throw new Error(`--engine 값은 "codex", "claude" 또는 "kiro"여야 합니다: ${val}`);
      }
      options.engine = val;
      continue;
    }
    if (arg === '--model') {
      options.model = argv[++index] || DEFAULT_MODEL;
      continue;
    }
    if (arg === '--timeout-seconds') {
      options.timeoutSeconds = Number(argv[++index] || DEFAULT_TIMEOUT_SECONDS);
      continue;
    }
    if (arg === '--retries') {
      options.retries = Number(argv[++index] || DEFAULT_RETRIES);
      continue;
    }
    if (arg === '--log-dir') {
      options.logDir = path.resolve(argv[++index] || path.join(repoRoot, 'local-agent', 'logs'));
      continue;
    }
    if (arg === '--stale-minutes') {
      options.staleMinutes = Number(argv[++index] || DEFAULT_STALE_MINUTES);
      continue;
    }
    if (arg === '--poll-seconds') {
      options.pollSeconds = Number(argv[++index] || DEFAULT_POLL_SECONDS);
      continue;
    }
    if (arg === '--mock-file') {
      options.mockFile = argv[++index] || null;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--print-prompt') {
      options.printPrompt = true;
      continue;
    }
    if (arg === '--print-result') {
      options.printResult = true;
      continue;
    }
    if (arg === '--watch') {
      options.watch = true;
      continue;
    }
    if (arg === '--output-file') {
      options.outputFile = argv[++index] || null;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    throw new Error(`알 수 없는 옵션: ${arg}`);
  }

  if (!options.model) {
    if (options.engine === 'codex') options.model = CODEX_DEFAULT_MODEL;
    if (options.engine === 'kiro') options.model = KIRO_DEFAULT_MODEL;
    if (options.engine === 'claude') options.model = CLAUDE_DEFAULT_MODEL;
  }

  if (options.revisionId && (options.inputFile || options.id || options.mockFile)) throw new Error('--revision-id는 --input-file/--id/--mock-file과 함께 사용할 수 없습니다.');
  if (options.inputFile && (!options.dryRun || options.watch || options.id)) throw new Error('--input-file은 --dry-run과 함께 사용하고 --watch/--id는 지정하지 마세요.');
  if (options.mockFile && !options.dryRun) throw new Error('--mock-file은 --dry-run에서만 사용합니다.');
  return options;
}

function printHelp() {
  console.log(`Usage:
  node local-agent/sermon-materials-agent.mjs [options]

Options:
  --input-file <path>    DB 연결 없는 로컬 입력 (--dry-run 필수)
  --revision-id <uuid>   특정 부분 수정 요청 1건 처리
  --id <uuid>            특정 설교 1건만 처리
  --engine <name>        AI 엔진 선택: kiro | codex | claude (기본값: ${DEFAULT_ENGINE}, 환경변수: LOCAL_AGENT_ENGINE)
  --model <name>         모델 이름 (Codex 기본값: ${CODEX_DEFAULT_MODEL}, Kiro 기본값: ${KIRO_DEFAULT_MODEL}, Claude 기본값: ${CLAUDE_DEFAULT_MODEL}, 환경변수: LOCAL_AGENT_MODEL)
  --timeout-seconds <n>  모델 실행 최대 대기 시간 (기본값: ${DEFAULT_TIMEOUT_SECONDS})
  --retries <n>          실패 시 재시도 횟수 (기본값: ${DEFAULT_RETRIES})
  --log-dir <path>       실행 로그 저장 디렉터리
  --dry-run              DB update 없이 프롬프트 생성/AI 호출만 수행
  --print-prompt         생성된 프롬프트를 stdout으로 출력
  --print-result         생성 결과 JSON을 stdout으로 출력
  --output-file <path>   생성 결과 JSON을 파일로 저장
  --watch                반복 실행 모드
  --poll-seconds <sec>   watch 모드 polling 간격 (기본값: ${DEFAULT_POLL_SECONDS})
  --stale-minutes <min>  processing 재시도 대상 기준 (기본값: ${DEFAULT_STALE_MINUTES})
  --mock-file <path>     AI 대신 파일 내용을 응답으로 사용
  --help                 도움말 출력

환경변수:
  LOCAL_AGENT_ENGINE     기본 엔진 (kiro | codex | claude)
  LOCAL_AGENT_MODEL      모델 재정의 (Codex 기본값: ${CODEX_DEFAULT_MODEL})
  LOCAL_AGENT_KIRO_BIN   kiro 엔진 사용 시 실행 바이너리 (기본값: kiro-cli)
  ANTHROPIC_API_KEY      Claude 엔진 사용 시 필수
  SUPABASE_URL           Supabase 프로젝트 URL
  SUPABASE_SERVICE_KEY   Supabase 서비스 키
`);
}

async function runCommandClosedStdin(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;

    if (options.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000).unref();
        settled = true;
        reject(new Error(`command timeout after ${options.timeoutMs}ms: ${command}`));
      }, options.timeoutMs);
    }

    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (settled) return;
      if (code == 0) {
        settled = true;
        resolve({ stdout, stderr, code });
        return;
      }
      settled = true;
      reject(new Error((stderr || stdout || `exit code ${code}`).trim()));
    });
  });
}

function writeAttemptLogs(options, attempt, engine, promptText, outputText, errorText) {
  ensureDir(options.logDir);
  const stamp = new Date().toISOString().replace(/[.:]/g, '-');
  const base = path.join(options.logDir, `${stamp}-${engine}-attempt${attempt}`);
  fs.writeFileSync(`${base}.prompt.txt`, promptText || '', 'utf8');
  fs.writeFileSync(`${base}.output.txt`, outputText || '', 'utf8');
  fs.writeFileSync(`${base}.stderr.txt`, errorText || '', 'utf8');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function validateEnv(options) {
  const required = options?.inputFile ? [] : ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
  if (options?.engine === 'claude') {
    required.push('ANTHROPIC_API_KEY');
  }
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`필수 환경변수가 없습니다: ${missing.join(', ')}`);
  }
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex < 0) continue;
    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(`[agent] ${error.message}`);
  process.exit(1);
});
