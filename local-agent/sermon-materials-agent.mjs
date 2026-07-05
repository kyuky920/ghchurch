import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

loadEnvFile(path.join(repoRoot, '.env.local'));
loadEnvFile(path.join(repoRoot, '.env'));

const DEFAULT_STALE_MINUTES = 10;
const DEFAULT_POLL_SECONDS = 60;
const DEFAULT_MODEL = process.env.LOCAL_AGENT_MODEL || '';
const DEFAULT_TIMEOUT_SECONDS = Number(process.env.LOCAL_AGENT_TIMEOUT_SECONDS || 3600);
const DEFAULT_RETRIES = Number(process.env.LOCAL_AGENT_RETRIES || 1);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  validateEnv();

  const supabase = createClient(
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
      : await callCodexWithRetry(prompt, options);

    const parsed = parseModelJson(raw);
    const normalized = normalizeOutput(parsed);

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

async function callCodexWithRetry(prompt, options) {
  const schema = buildOutputSchema();
  let lastError;

  for (let attempt = 1; attempt <= Math.max(1, options.retries); attempt += 1) {
    try {
      console.log(`[agent] codex call attempt=${attempt}/${Math.max(1, options.retries)}`);
      return await callCodex(prompt, options.model, schema, options, attempt);
    } catch (error) {
      lastError = error;
      console.error(`[agent] codex call failed attempt=${attempt}: ${error.message}`);
      if (attempt < Math.max(1, options.retries)) {
        await sleep(Math.min(10000, attempt * 2000));
      }
    }
  }

  throw lastError;
}

function buildOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['sermon_summary', 'questions'],
    properties: {
      sermon_summary: {
        type: 'object',
        additionalProperties: false,
        required: ['key_point', 'overview', 'sections'],
        properties: {
          key_point: { type: 'string' },
          overview: { type: 'string' },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'content'],
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
        additionalProperties: false,
        required: ['sections', 'meta'],
        properties: {
          sections: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['section_title', 'summary_anchor', 'questions'],
              properties: {
                section_title: { type: 'string' },
                summary_anchor: { type: 'string' },
                questions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['flow_stage', 'category', 'explanation', 'question', 'scripture_anchor'],
                    properties: {
                      flow_stage: { type: 'string' },
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
            additionalProperties: false,
            properties: {
              theological_focus: { type: 'array', items: { type: 'string' } },
              application_focus: { type: 'array', items: { type: 'string' } },
            },
            required: ['theological_focus', 'application_focus'],
          },
        },
      },
    },
  };
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
    '- explanation을 포함한 모든 키를 반드시 반환해 주세요. explanation이 꼭 필요 없으면 빈 문자열("")을 넣어 주세요.',
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
    '4) 질문은 핵심 메시지를 따라 흐르도록 작성하고, 보조설명은 꼭 필요한 경우에만 짧게 붙여 주세요.',
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
    '- sections[].content는 반드시 두괄식으로 작성해 주세요.',
    '- sections[].content의 첫 1~2문장은 그 단락의 핵심 메시지를 먼저 요약하는 문장으로 작성해 주세요.',
    '- 그 다음 3~6문장에서는 왜 그런 결론이 나오는지, 설교의 전개와 강조점, 적용 방향을 풀어서 설명해 주세요.',
    '- 즉 각 단락은 "짧은 핵심 요약 -> 추가 설명" 구조가 분명히 드러나야 합니다.',
    '- sections[].content는 전체적으로 5~8문장 분량으로 작성해 주세요.',
    '- 단락 첫 문장은 가능하면 "오늘 본문은", "해당 구절은", "이 대목은", "말씀은" 등으로 시작하여 요지를 바로 드러내 주세요.',
    '- 설교에서 강조된 복음적 의미(죄 인식, 은혜, 그리스도의 사역, 순종의 방향)를 포함해 주세요.',
    '',
    '[나눔 질문 작성 기준 - questions.sections[].questions[]]',
    '- 질문 전체는 반드시 하나의 중심축, 곧 sermon_summary.key_point의 핵심 메시지를 따라 흐르도록 작성해 주세요.',
    '- 나눔 질문은 서로 따로 노는 질문 모음이 아니라, "말씀을 점검합시다. -> 말씀을 통해 은혜를 나눕시다. -> 말씀을 따라 결단합시다."의 흐름으로 이어져야 합니다.',
    '- 각 문항은 flow_stage, category, explanation, question, scripture_anchor를 반드시 포함해 주세요.',
    '- flow_stage는 반드시 아래 셋 중 하나만 사용해 주세요: "말씀을 점검합시다.", "말씀을 통해 은혜를 나눕시다.", "말씀을 따라 결단합시다."',
    '- "말씀을 점검합시다."에서는 본문과 설교의 핵심 주장, 중요한 장면, 반복된 강조를 확인하게 해 주세요.',
    '- "말씀을 통해 은혜를 나눕시다."에서는 앞서 확인한 핵심이 내 삶, 마음, 관계, 현재 형편과 어떻게 연결되는지 나누게 해 주세요.',
    '- "말씀을 따라 결단합시다."에서는 같은 핵심 메시지가 이번 주의 순종, 기도, 태도 변화, 실천으로 이어지게 해 주세요.',
    '- 즉 뒤 단계 질문은 앞 단계 질문과 무관하게 새 주제를 꺼내지 말고, 앞에서 확인한 핵심을 더 깊게 가져가 주세요.',
    '- 각 섹션의 질문 수는 반드시 2~3문항으로만 작성해 주세요. 4문항 이상은 금지합니다.',
    '- 가능하면 각 섹션 안에서 "말씀 점검 1문항 + 은혜 나눔 1문항 + 결단 1문항"의 3문항 구조를 우선으로 해 주세요.',
    '- 꼭 2문항만 작성해야 한다면, 핵심을 점검하는 질문 1문항과 삶으로 연결되는 질문 1문항이 남도록 구성해 주세요.',
    '- category는 흐름에 맞게 관찰/성찰/적용/공동체/복음 등으로 사용할 수 있습니다.',
    '- 단, "말씀을 점검합시다." 단계의 explanation은 반드시 비우지 말고, 질문에 답하기 위해 바로 참고할 수 있는 보조자료처럼 작성해 주세요.',
    '- 즉 explanation에는 "이 질문이 어떤 장면/구절/핵심을 묻는지"뿐 아니라, 답할 때 다시 떠올려야 할 사건, 인물의 반응, 반복된 표현, 설교의 강조점이 실제로 들어가야 합니다.',
    '- 가능하면 scripture_anchor와 section_title에 맞춰, "어떤 대목에서 무엇이 일어났는지"를 짧게 정리한 뒤 그 사실이 왜 중요한지 덧붙여 주세요.',
    '- "말씀을 통해 은혜를 나눕시다."와 "말씀을 따라 결단합시다." 단계의 explanation은 질문만으로 의도가 충분히 분명하면 빈 문자열("")로 두어도 됩니다.',
    '- explanation이 꼭 필요하다면 설교/본문의 근거와 질문 의도를 짧게 1~2문장으로만 적어 주세요.',
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
    '            "flow_stage": "말씀을 점검합시다.",',
    '            "category": "관찰",',
    '            "explanation": "",',
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

function normalizeOutput(parsed) {
  validateGeneratedPayload(parsed);

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
              flow_stage: '',
              category: '적용',
              explanation: '',
              question,
              scripture_anchor: '',
            };
          }

          return {
            section_title: title,
            flow_stage: question?.flow_stage || question?.flowStage || '',
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

    if (arg === '--id') {
      options.id = argv[++index] || null;
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

  return options;
}

function printHelp() {
  console.log(`Usage:
  node local-agent/sermon-materials-agent.mjs [options]

Options:
  --id <uuid>            특정 설교 1건만 처리
  --model <name>         Codex 모델 이름 (비우면 계정 기본 모델 사용)
  --timeout-seconds <n>  모델 실행 최대 대기 시간 (기본값: ${DEFAULT_TIMEOUT_SECONDS})
  --retries <n>          실패 시 재시도 횟수 (기본값: ${DEFAULT_RETRIES})
  --log-dir <path>       실행 로그 저장 디렉터리
  --dry-run              DB update 없이 프롬프트 생성/Codex 호출만 수행
  --print-prompt         생성된 프롬프트를 stdout으로 출력
  --print-result         생성 결과 JSON을 stdout으로 출력
  --output-file <path>   생성 결과 JSON을 파일로 저장
  --watch                반복 실행 모드
  --poll-seconds <sec>   watch 모드 polling 간격 (기본값: ${DEFAULT_POLL_SECONDS})
  --stale-minutes <min>  processing 재시도 대상 기준 (기본값: ${DEFAULT_STALE_MINUTES})
  --mock-file <path>     Codex 대신 파일 내용을 응답으로 사용
  --help                 도움말 출력
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

function validateGeneratedPayload(parsed) {
  const serialized = JSON.stringify(parsed);
  if (serialized.includes('"..."') || serialized.includes(': "..."')) {
    throw new Error('모델이 출력 예시 템플릿(...)을 그대로 반환했습니다.');
  }

  const overview = parsed?.sermon_summary?.overview || '';
  const sections = parsed?.questions?.sections || [];
  if (!String(overview).trim()) {
    throw new Error('sermon_summary.overview가 비어 있습니다.');
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error('questions.sections가 비어 있습니다.');
  }

  for (const section of sections) {
    const count = Array.isArray(section?.questions) ? section.questions.length : 0;
    if (count < 2 || count > 3) {
      throw new Error(`각 섹션의 질문 수는 2~3개여야 합니다. section="${section?.section_title || section?.title || ''}" count=${count}`);
    }
  }

  const flatQuestions = sections.flatMap((section) => Array.isArray(section?.questions) ? section.questions : []);
  if (flatQuestions.length === 0) {
    throw new Error('질문이 생성되지 않았습니다.');
  }

  const stageSet = new Set();

  for (const question of flatQuestions) {
    if (!String(question?.question || '').trim()) {
      throw new Error('빈 question 항목이 있습니다.');
    }
    if (!String(question?.flow_stage || '').trim()) {
      throw new Error('flow_stage가 비어 있는 질문이 있습니다.');
    }
    if (
      String(question.flow_stage).trim() === '말씀을 점검합시다.' &&
      !String(question?.explanation || '').trim()
    ) {
      throw new Error('말씀 점검 질문의 explanation이 비어 있습니다.');
    }
    stageSet.add(String(question.flow_stage).trim());
  }

  const requiredStages = [
    '말씀을 점검합시다.',
    '말씀을 통해 은혜를 나눕시다.',
    '말씀을 따라 결단합시다.',
  ];
  for (const stage of requiredStages) {
    if (!stageSet.has(stage)) {
      throw new Error(`질문 흐름 단계가 누락되었습니다: ${stage}`);
    }
  }
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
