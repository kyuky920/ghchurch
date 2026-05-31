import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

loadEnvFile(path.join(repoRoot, '.env.local'));
loadEnvFile(path.join(repoRoot, '.env'));

const DEFAULT_STALE_MINUTES = 10;
const DEFAULT_POLL_SECONDS = 60;
const DEFAULT_MODEL = process.env.CLAUDE_MODEL || 'sonnet';

async function main() {
  const options = parseArgs(process.argv.slice(2));
  validateEnv();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

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
  const row = await pickTarget({
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
      : await callClaude(prompt, options.model);

    const parsed = parseClaudeJson(raw);
    const normalized = normalizeOutput(parsed);

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

  return pending[0] || staleProcessing[0] || null;
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
      error_msg: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    console.error(`[agent] 실패 저장 오류: ${updateError.message}`);
  }
}

async function callClaude(prompt, model) {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['sermon_summary', 'questions'],
    properties: {
      sermon_summary: {
        type: 'object',
        additionalProperties: true,
        properties: {
          key_point: { type: 'string' },
          overview: { type: 'string' },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: {
                title: { type: 'string' },
                content: { type: 'string' },
              },
            },
          },
        },
      },
      questions: {
        type: 'object',
        additionalProperties: true,
        properties: {
          sections: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: {
                section_title: { type: 'string' },
                summary_anchor: { type: 'string' },
                questions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: true,
                    properties: {
                      category: { type: 'string' },
                      explanation: { type: 'string' },
                      question: { type: 'string' },
                      scripture_anchor: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          meta: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
  };

  const args = [
    '--print',
    '--output-format',
    'text',
    '--tools',
    '',
    '--model',
    model,
    '--json-schema',
    JSON.stringify(schema),
    prompt,
  ];

  const { stdout, stderr } = await execFileAsync('claude', args, {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (stderr && stderr.trim()) {
    console.error(stderr.trim());
  }

  return stdout;
}

function buildPrompt(item) {
  const reference = item.reference || '';
  const passage = item.passage || '';
  const title = item.sermon_title || '';

  let outline = '';
  let summary = '';
  let transcript = '';
  let legacyPoints = '';

  try {
    const parsedPoints = item.sermon_points ? JSON.parse(item.sermon_points) : null;
    if (parsedPoints && typeof parsedPoints === 'object') {
      outline = parsedPoints.outline || '';
      summary = parsedPoints.summary || '';
      transcript = parsedPoints.transcript || '';
      legacyPoints = parsedPoints.legacy_points || '';
    } else if (item.sermon_points) {
      legacyPoints = item.sermon_points;
    }
  } catch {
    legacyPoints = item.sermon_points || '';
  }

  const lines = [
    '너는 개혁주의 신학(성경의 충분성, 하나님의 주권, 인간의 전적 타락, 오직 은혜, 오직 그리스도)에 충실한 청년부 소그룹 교재 작성 보조자입니다.',
    '모든 출력은 반드시 존댓말로 작성해 주세요.',
    '',
    '[절대 원칙]',
    '1) 반드시 입력된 성경본문/설교대지/설교요약/설교원문에 근거해서만 작성해 주세요.',
    '2) 추측, 과장, 근거 없는 적용은 금지해 주세요.',
    '3) 설교를 듣지 못한 분도 요약만 읽고 핵심 흐름을 이해할 수 있도록 충분히 설명해 주세요.',
    '4) 질문은 짧은 한 줄 질문만 쓰지 말고, 반드시 배경설명(2~4문장) + 실제 질문(1문장)으로 작성해 주세요.',
    '5) 모든 문장은 존댓말로 작성해 주세요.',
    '6) 응답이 길어질 경우 섹션 수를 줄여서라도 반드시 완전한 단일 JSON 객체를 닫아서 반환해 주세요.',
    '',
    '[표현 규칙]',
    '1) "설교는", "설교에서", "설교가" 같은 표현은 사용하지 말아 주세요.',
    '2) 대신 "말씀은", "본문은", "오늘 본문은", "해당 구절은" 등의 표현을 사용해 주세요.',
    '3) 가능하면 출처 표시는 최소화하고, 질문 자체가 자연스럽게 이어지도록 작성해 주세요.',
    '4) explanation/question/summary 전체에 동일하게 적용해 주세요.',
    '',
    `성경 구절: ${reference}`,
    title ? `설교 제목: ${title}` : '',
    outline ? `설교 대지:\n${outline}` : '',
    summary ? `설교 요약:\n${summary}` : '',
    transcript ? `설교 원문:\n${transcript}` : '',
    legacyPoints ? `추가 메모(하위호환):\n${legacyPoints}` : '',
    '성경 본문(개역개정):',
    passage,
    '',
    '[말씀 요약 작성 기준 - sermon_summary]',
    '- key_point: 설교 전체 핵심을 2~3문장으로 작성해 주세요.',
    '- overview: 설교 흐름을 6~10문장으로 자세히 설명해 주세요.',
    '- sections: 각 대지/주제별로 구성해 주세요.',
    '- sections[].content는 해당 대지의 핵심 설명을 5~8문장으로 작성해 주세요.',
    '- 설교에서 강조된 복음적 의미(죄 인식, 은혜, 그리스도의 사역, 순종의 방향)를 포함해 주세요.',
    '',
    '[나눔 질문 작성 기준 - questions.sections[].questions[]]',
    '- 각 섹션당 2~3문항을 작성해 주세요.',
    '- 각 문항은 category, explanation, question, scripture_anchor를 반드시 포함해 주세요.',
    '- explanation에는 설교/본문의 어떤 내용을 근거로 한 질문인지 2~4문장으로 작성해 주세요.',
    '- question은 나눔용 실제 질문 1문장(존댓말)으로 작성해 주세요.',
    '- 질문은 정답형이 아니라 자기 성찰과 삶의 적용, 공동체적 책임으로 이어지게 해 주세요.',
    '',
    '[출력 형식]',
    '반드시 JSON만 반환해 주세요. 코드블록, 설명문, 주석은 금지합니다.',
    '금지어 치환 규칙: 최종 출력 문자열 어디에도 "설교는/설교에서/설교가"를 포함하지 마세요.',
    '{',
    '  "sermon_summary": {',
    '    "key_point": "...",',
    '    "overview": "...",',
    '    "sections": [',
    '      { "title": "...", "content": "..." }',
    '    ]',
    '  },',
    '  "questions": {',
    '    "sections": [',
    '      {',
    '        "section_title": "...",',
    '        "summary_anchor": "...",',
    '        "questions": [',
    '          {',
    '            "category": "관찰",',
    '            "explanation": "...",',
    '            "question": "...",',
    '            "scripture_anchor": "..."',
    '          }',
    '        ]',
    '      }',
    '    ],',
    '    "meta": {',
    '      "theological_focus": ["..."],',
    '      "application_focus": ["..."]',
    '    }',
    '  }',
    '}',
  ];

  return lines.filter(Boolean).join('\n');
}

function parseClaudeJson(raw) {
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

function normalizeOutput(parsed) {
  const summaryRaw = parsed.sermon_summary || {};
  const sermonSummary = {
    key_point: summaryRaw.key_point || summaryRaw.keyPoint || '',
    overview: summaryRaw.overview || '',
    sections: Array.isArray(summaryRaw.sections)
      ? summaryRaw.sections.map((section) => ({
          title: section?.title || '',
          content: section?.content || '',
        }))
      : [],
  };

  const rootQuestions = parsed.questions || parsed;
  let sections = [];
  if (Array.isArray(rootQuestions?.sections)) {
    sections = rootQuestions.sections;
  } else if (Array.isArray(rootQuestions)) {
    sections = [{ section_title: '통합 나눔', summary_anchor: '', questions: rootQuestions }];
  }

  const normalizedSections = sections
    .map((section, index) => {
      const title =
        section?.section_title || section?.title || section?.topic || `섹션 ${index + 1}`;
      const summaryAnchor = section?.summary_anchor || section?.summary || '';
      const questionList = Array.isArray(section?.questions) ? section.questions : [];

      const normalizedQuestions = questionList
        .map((question) => {
          if (typeof question === 'string') {
            return {
              section_title: title,
              category: '적용',
              explanation: '',
              question,
              scripture_anchor: '',
            };
          }

          return {
            section_title: title,
            category: question?.category || question?.type || '적용',
            explanation: question?.explanation || question?.context || '',
            question: question?.question || question?.text || question?.content || '',
            scripture_anchor: question?.scripture_anchor || question?.anchor || '',
          };
        })
        .filter((question) => question.question);

      return {
        section_title: title,
        summary_anchor: summaryAnchor,
        questions: normalizedQuestions,
      };
    })
    .filter((section) => section.questions.length > 0);

  if (!normalizedSections.length) {
    throw new Error(`유효한 sections/questions가 없습니다. 받은 키: ${Object.keys(parsed).join(', ')}`);
  }

  return {
    sermon_summary: sermonSummary,
    questions: {
      sections: normalizedSections,
      flat: normalizedSections.flatMap((section) => section.questions),
      meta: rootQuestions?.meta || {},
    },
  };
}

function parseArgs(argv) {
  const options = {
    id: null,
    model: DEFAULT_MODEL,
    dryRun: false,
    printPrompt: false,
    watch: false,
    staleMinutes: DEFAULT_STALE_MINUTES,
    pollSeconds: DEFAULT_POLL_SECONDS,
    mockFile: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--id') {
      options.id = argv[++index] || null;
      continue;
    }
    if (arg === '--model') {
      options.model = argv[++index] || DEFAULT_MODEL;
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
    if (arg === '--watch') {
      options.watch = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    throw new Error(`알 수 없는 옵션: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/sermon-materials-agent.mjs [options]

Options:
  --id <uuid>            특정 설교 1건만 처리
  --model <name>         Claude 모델 별칭 또는 전체 이름 (기본값: ${DEFAULT_MODEL})
  --dry-run              DB update 없이 프롬프트 생성/Claude 호출만 수행
  --print-prompt         생성된 프롬프트를 stdout으로 출력
  --watch                반복 실행 모드
  --poll-seconds <sec>   watch 모드 polling 간격 (기본값: ${DEFAULT_POLL_SECONDS})
  --stale-minutes <min>  processing 재시도 대상 기준 (기본값: ${DEFAULT_STALE_MINUTES})
  --mock-file <path>     Claude 대신 파일 내용을 응답으로 사용
  --help                 도움말 출력
`);
}

function validateEnv() {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].filter(
    (key) => !process.env[key],
  );
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
