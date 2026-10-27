import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { revisionTargets, revisionValue, revisionSnapshot, sameRevisionSnapshot, mergeRevision, validateRevisionRequest, revisionDisplay } from '../lib/sermon-revision.mjs';
import { requiresContentReview, prepareContentReviewForSave } from '../lib/sermon-materials.mjs';
import { revisionSchema, validateRevision, generateRevision } from '../local-agent/sermon-revision.mjs';
import { runPendingRevision } from '../local-agent/sermon-revision-worker.mjs';
import { listRevisions, createRevision, changeRevision, REVISION_TABLE } from '../lib/sermon-revision-store.mjs';

const clone = value => structuredClone(value);
function sermon() {
  const questions = ['본문은 우리를 무엇이라고 부르나요?', '빛의 열매는 무엇인가요?', '어떤 마음이 드시나요?'].map((question, index) => ({ question, explanation: '8절을 읽어 보세요.', answer: index < 2 ? '주 안에서 빛입니다.' : '', scripture_anchor: '에베소서 5:8', flow_stage: index < 2 ? '말씀을 점검합시다.' : '말씀을 통해 은혜를 나눕시다.', category: '관찰', is_core: true, source_paragraph_ids: ['P001'], section_title: '빛' }));
  return { id: 'sermon-one', week: '2026-10-25', service: 'morning', reference: '에베소서 5:8–14', passage: '8 너희가 전에는 어둠이더니 이제는 주 안에서 빛이라 빛의 자녀들처럼 행하라', sermon_title: '빛', sermon_points: JSON.stringify({ transcript: '주 안에서 빛입니다.\n\n주님을 의지하여 살아갑니다.' }), sermon_summary: { key_point: '주 안에서 빛입니다.', overview: '주님을 의지합니다.', sections: [{ title: '빛', content: '빛의 자녀답게 살아갑니다.', source_paragraph_ids: ['P001'] }] }, questions: { sections: [{ section_title: '빛', summary_anchor: '빛', questions: clone(questions) }], flat: clone(questions), meta: { content_version: 'youth-sharing-v2', human_review: { confirmed_at: 'previous' }, quality_review: { status: 'passed' }, opening_question: { question: '이번 주는 어떠셨나요?', explanation: '', source_paragraph_ids: ['P001'] }, practice_options: [{ text: '기도해 보세요.', origin: 'sermon', source_paragraph_ids: ['P002'] }], closing_prayer: '주님 도와주세요.', transcript_review: { corrections: [{ status: 'needs_confirmation', original: '빛을 바라는' }] } } }, status: 'done', updated_at: '2026-10-27T00:00:00Z' };
}
const proposal = () => ({ replacement: { question: '8절은 우리가 주 안에서 어떤 존재라고 말하나요?', explanation: '8절에서 이제는 뒤의 말을 찾아보세요.', answer: '주 안에서 빛이라고 말합니다.', scripture_anchor: '에베소서 5:8', source_paragraph_ids: ['P001'] }, reason: '함께 읽는 본문에서 답할 수 있게 바꿨습니다.' });
const review = () => ({ summary: '선택 문항이 본문에 근거하며 요청을 반영했습니다.', issues: [] });

// PostgREST contract double; no network, credentials or real sermon content.
function database(row = sermon()) {
  const state = { sermons: [clone(row)], [REVISION_TABLE]: [], missing: false, rpcCalls: 0 };
  const db = { state, from(table) {
    let operation = 'select', values, predicates = [], limit = Infinity, order, cached;
    const query = {
      select() { return this; },
      eq(key, value) { predicates.push(item => item[key] === value); return this; },
      in(key, values) { predicates.push(item => values.includes(item[key])); return this; },
      lt(key, value) { predicates.push(item => item[key] < value); return this; },
      or() { predicates.push(item => item.status === 'pending' || item.status === 'processing' && item.lease_expires_at < new Date().toISOString()); return this; },
      order(key, opts) { order = { key, asc: opts.ascending }; return this; },
      limit(n) { limit = n; return this; },
      insert(next) { operation = 'insert'; values = next; return this; },
      update(next) { operation = 'update'; values = next; return this; },
      async single() { const result = await execute(); return { ...result, data: result.data?.[0] || null }; },
      async maybeSingle() { return this.single(); },
      then(resolve, reject) { return execute().then(resolve, reject); },
    };
    function execute() {
      if (cached) return cached;
      cached = (async () => {
        if (state.missing && table === REVISION_TABLE) return { data: null, error: { code: '42P01' } };
        if (operation === 'insert') {
          if (state[table].some(item => item.sermon_id === values.sermon_id && ['pending', 'processing', 'ready'].includes(item.status))) return { data: null, error: { code: '23505' } };
          const item = { created_at: new Date().toISOString(), ...clone(values) }; state[table].push(item); return { data: [clone(item)], error: null };
        }
        let found = state[table].filter(item => predicates.every(fn => fn(item)));
        if (order) found.sort((a, b) => String(a[order.key]).localeCompare(String(b[order.key])) * (order.asc ? 1 : -1));
        found = found.slice(0, limit);
        if (operation === 'update') found.forEach(item => Object.assign(item, clone(values)));
        return { data: clone(found), error: null };
      })();
      return cached;
    }
    return query;
  }, async rpc(name, args) {
    assert.equal(name, 'apply_sermon_revision'); state.rpcCalls++;
    const request = state[REVISION_TABLE].find(item => item.id === args.p_request_id);
    const row = state.sermons.find(item => item.id === request?.sermon_id);
    if (!request || request.status !== 'ready' || request.proposal.review.status !== 'passed' || !row || !sameRevisionSnapshot(revisionSnapshot(row), request.base_snapshot)) return { error: { code: '40001' } };
    Object.assign(row, args.p_update); request.status = 'applied';
    return { data: { id: request.id, status: 'applied' }, error: null };
  } };
  return db;
}
async function enqueue(db, target = 'question:0') { return createRevision(db, db.state.sermons[0].id, { target, instruction: '성경 본문만 읽고 답할 수 있도록 고쳐 주세요.', base_snapshot: revisionSnapshot(db.state.sermons[0]) }); }
function fakeAi(onCall) {
  let calls = 0;
  return { get calls() { return calls; }, async callAi(prompt, schema) { calls++; await onCall?.(calls, prompt, schema); return JSON.stringify(calls % 2 ? proposal() : review()); }, parseJson: JSON.parse };
}

test('부분 수정 대상은 실제 존재하는 항목만 제공하고 안내 문안은 읽기 좋게 표시한다', () => {
  const row = sermon();
  assert.ok(revisionTargets(row).some(item => item.key === 'question:2'));
  assert.match(revisionDisplay(revisionValue(row, 'summary_section:0')), /빛의 자녀답게/);
  assert.throws(() => revisionValue(row, 'question:999'), /다시 선택/);
  assert.throws(() => validateRevisionRequest(row, { target: 'opening', instruction: ' ' }), /2,000/);
  assert.throws(() => validateRevisionRequest({ ...row, status: 'processing' }, { target: 'opening', instruction: '수정' }), /완료/);
});
test('선택한 질문과 설명·답안만 바꾸고 문항 순서·다른 질문·원고·표시·미확인 녹취를 보존한다', () => {
  const row = sermon(), before = clone(row), p = proposal();
  validateRevision(row, { target: 'question:0' }, p);
  const changed = mergeRevision(row, 'question:0', p.replacement, { ...review(), status: 'passed' });
  assert.deepEqual(row, before);
  assert.deepEqual(changed.sermon_summary, row.sermon_summary);
  assert.deepEqual(changed.questions.flat.slice(1), row.questions.flat.slice(1));
  assert.equal(changed.questions.flat[0].is_core, true);
  assert.equal(changed.questions.flat[0].flow_stage, row.questions.flat[0].flow_stage);
  assert.deepEqual(changed.questions.sections[0].questions[0], changed.questions.flat[0]);
  assert.deepEqual(changed.questions.meta.transcript_review, row.questions.meta.transcript_review);
  assert.equal(changed.questions.meta.human_review, undefined);
  assert.equal(requiresContentReview(changed.questions), true);
});
test('요약 단락·마음 열기·실천·기도도 선택한 내용만 교체한다', () => {
  const row = sermon();
  const cases = [
    ['opening', { question: '이번 주 함께 나누고 싶은 일은 무엇인가요?', explanation: '', source_paragraph_ids: ['P001'] }],
    ['summary_key_point', { text: '새 핵심 문안', source_paragraph_ids: ['P001'] }],
    ['summary_overview', { text: '새 전체 흐름', source_paragraph_ids: ['P001'] }],
    ['summary_section:0', { title: '새 제목', content: '새 내용', source_paragraph_ids: ['P001'] }],
    ['practice:0', { text: '새 실천', origin: 'sermon', source_paragraph_ids: ['P002'] }],
    ['closing_prayer', { text: '새 기도', source_paragraph_ids: ['P002'] }],
  ];
  for (const [target, replacement] of cases) {
    validateRevision(row, { target }, { replacement, reason: '요청 반영' });
    const result = mergeRevision(row, target, replacement);
    assert.deepEqual(result.questions.flat, row.questions.flat);
    assert.deepEqual(revisionValue(result, target), { ...revisionValue(row, target), ...replacement });
    assert.equal(result.questions.meta.practice_options[0].origin, 'sermon');
  }
});
test('새로 제안한 실천은 수정 전의 설교 출처를 그대로 물려받지 않는다', () => {
  const row = sermon();
  const replacement = { text: '결정 전에 잠깐 말씀을 떠올려 보세요.', origin: 'suggestion', source_paragraph_ids: ['P002'] };
  validateRevision(row, { target: 'practice:0' }, { replacement, reason: '원문에서 구체화한 선택 가능한 예시입니다.' });
  const changed = mergeRevision(row, 'practice:0', replacement);
  assert.equal(changed.questions.meta.practice_options[0].origin, 'suggestion');
  assert.match(revisionDisplay(revisionValue(changed, 'practice:0')), /제안한 예시/);
});
test('수정 스키마는 단계·표시·다른 필드 수정을 허용하지 않고 잘못된 원문 근거와 빈 답안을 거부한다', () => {
  const row = sermon();
  assert.equal(revisionSchema('question:0').properties.replacement.additionalProperties, false);
  for (const changes of [{ flow_stage: '새 단계' }, { source_paragraph_ids: ['P999'] }, { answer: '' }, { question: '목사님은 무엇이라고 하셨나요?' }]) {
    const p = proposal(); Object.assign(p.replacement, changes);
    assert.throws(() => validateRevision(row, { target: 'question:0' }, p));
  }
  assert.throws(() => mergeRevision(row, 'opening', { question: '질문', sermon_points: '원고 덮어쓰기' }), /범위를 벗어난/);
  assert.throws(() => validateRevision(row, { target: 'question:2' }, proposal()), /정답/);
});
test('구형 배열 자료의 부분 수정도 검토 전 공개를 보류하고 명시적 확인 후 공개한다', () => {
  const row = sermon(); row.questions = row.questions.flat;
  const changed = mergeRevision(row, 'question:0', proposal().replacement);
  assert.equal(requiresContentReview(changed.questions), true);
  assert.equal(requiresContentReview(prepareContentReviewForSave(changed.questions, changed.questions, true)), false);
  assert.equal(changed.questions.flat[1].question, row.questions[1].question);
});
test('생성과 독립 검토는 선택 항목과 변경 의도를 전달하고 blocking 검토를 보존한다', async () => {
  const ai = fakeAi((call, prompt) => {
    assert.match(prompt, call === 1 ? /선택한 항목만 수정/ : /선택 항목의 변경/);
    assert.match(prompt, /성경 본문/);
  });
  const generated = await generateRevision(sermon(), { target: 'question:0', instruction: '본문에서 답하도록 수정' }, ai);
  assert.equal(ai.calls, 2); assert.equal(generated.review.status, 'passed');
});
test('요청 → 로컬 Agent 생성·독립 검토 → 비교 → 반영까지 원고를 유지하며 진행한다', async () => {
  const db = database(), row = clone(db.state.sermons[0]);
  const request = await enqueue(db), ai = fakeAi();
  await runPendingRevision({ db, options: {}, ...ai, callAi: ai.callAi });
  assert.equal(db.state[REVISION_TABLE][0].status, 'ready');
  assert.deepEqual(db.state.sermons[0], row);
  const history = await listRevisions(db, row.id);
  assert.equal(history[0].base_snapshot, undefined);
  assert.equal(history[0].before.question, row.questions.flat[0].question);
  await changeRevision(db, row.id, request.id, 'apply');
  assert.equal(db.state[REVISION_TABLE][0].status, 'applied');
  assert.equal(db.state.sermons[0].sermon_points, row.sermon_points);
  assert.equal(JSON.parse(db.state.sermons[0].questions).flat[0].question, proposal().replacement.question);
  assert.equal(requiresContentReview(db.state.sermons[0].questions), true);
});
test('중복 요청과 오래된 화면의 요청을 막고 다른 설교 요청에는 접근할 수 없다', async () => {
  const db = database(), request = await enqueue(db);
  await assert.rejects(() => enqueue(db), error => error.status === 409);
  await assert.rejects(() => changeRevision(db, 'another-sermon', request.id, 'discard'), error => error.status === 404);
  const old = revisionSnapshot(db.state.sermons[0]); db.state.sermons[0].passage = '변경한 본문';
  await assert.rejects(() => createRevision(db, 'sermon-one', { target: 'question:0', instruction: '수정', base_snapshot: old }), error => error.status === 409);
});
test('두 작업자가 동시에 가져가도 한 작업자만 생성하고 만료된 작업은 회수한다', async () => {
  const db = database(); await enqueue(db); const ai = fakeAi();
  await Promise.all([runPendingRevision({ db, options: {}, callAi: ai.callAi, parseJson: JSON.parse }), runPendingRevision({ db, options: {}, callAi: ai.callAi, parseJson: JSON.parse })]);
  assert.equal(ai.calls, 2);
  const request = db.state[REVISION_TABLE][0]; request.status = 'processing'; request.lease_token = 'expired'; request.lease_expires_at = '2020-01-01T00:00:00Z';
  const recovered = fakeAi(); await runPendingRevision({ db, options: {}, callAi: recovered.callAi, parseJson: JSON.parse });
  assert.equal(recovered.calls, 2); assert.equal(request.status, 'ready');
});
test('처리 중 취소한 요청의 늦은 응답은 저장하거나 반영하지 않는다', async () => {
  const db = database(), request = await enqueue(db), before = clone(db.state.sermons);
  const ai = fakeAi(async call => { if (call === 1) await changeRevision(db, 'sermon-one', request.id, 'discard'); });
  await runPendingRevision({ db, options: {}, callAi: ai.callAi, parseJson: JSON.parse });
  assert.equal(db.state[REVISION_TABLE][0].status, 'discarded'); assert.deepEqual(db.state.sermons, before);
});
test('원문 변경·생성 실패·검토 호출 실패는 원자료를 덮어쓰지 않는다', async () => {
  for (const mode of ['source-changed', 'generation-failed', 'review-failed']) {
    const db = database(); await enqueue(db);
    if (mode === 'source-changed') db.state.sermons[0].sermon_points += '추가 원문';
    const before = clone(db.state.sermons), ai = fakeAi(call => { if (mode === 'generation-failed' || mode === 'review-failed' && call === 2) throw new Error('test failure'); });
    await runPendingRevision({ db, options: {}, callAi: ai.callAi, parseJson: JSON.parse });
    assert.equal(db.state[REVISION_TABLE][0].status, 'failed'); assert.deepEqual(db.state.sermons, before);
    if (mode === 'source-changed') assert.equal(ai.calls, 0);
  }
});
test('준비 후 다른 내용이 바뀌면 반영을 거부하고 blocking 검토도 반영하지 않는다', async () => {
  const db = database(), request = await enqueue(db), ai = fakeAi();
  await runPendingRevision({ db, options: {}, callAi: ai.callAi, parseJson: JSON.parse });
  db.state.sermons[0].sermon_title = '변경된 제목';
  await assert.rejects(() => changeRevision(db, 'sermon-one', request.id, 'apply'), error => error.status === 409);
  const rpcCalls = db.state.rpcCalls;
  db.state[REVISION_TABLE][0].proposal.review.status = 'needs_review';
  await assert.rejects(() => changeRevision(db, 'sermon-one', request.id, 'apply'), error => error.status === 409);
  assert.equal(db.state.rpcCalls, rpcCalls);
});
test('DB 설정 전에는 기존 생성 흐름을 계속하고 수정 API에는 설치 필요를 알린다', async () => {
  const db = database(); db.state.missing = true;
  assert.equal(await runPendingRevision({ db, options: {}, ...fakeAi() }), false);
  await assert.rejects(() => listRevisions(db, 'sermon-one'), error => error.status === 503);
});
test('dry-run에서는 대기 요청을 점유하거나 AI에 전달하지 않는다', async () => {
  const db = database(); await enqueue(db); const before = clone(db.state), ai = fakeAi();
  await runPendingRevision({ db, options: { dryRun: true }, callAi: ai.callAi, parseJson: JSON.parse });
  assert.equal(ai.calls, 0); assert.deepEqual(db.state, before);
});

function response() { return { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
function handler(db) {
  const source = fs.readFileSync(new URL('../pages/api/sermons/[id]/revisions.js', import.meta.url), 'utf8').replace(/^import .*\n/gm, '').replace('export default async function handler', 'return async function handler');
  return new Function('supabase', 'listRevisions', 'createRevision', 'changeRevision', source)(db, listRevisions, createRevision, changeRevision);
}
test('수정 API는 목록·요청·반영·취소 모두 관리자 인증과 no-store를 적용한다', async () => {
  const old = process.env.LEADER_API_SECRET; process.env.LEADER_API_SECRET = 'test-only-secret';
  try {
    for (const method of ['GET', 'POST', 'PATCH']) {
      const res = response(); await handler(null)({ method, query: { id: 'sermon-one' }, headers: {} }, res);
      assert.equal(res.code, 401); assert.equal(res.headers['Cache-Control'], 'no-store');
    }
    const db = database(), headers = { authorization: 'Bearer test-only-secret', 'content-type': 'application/json' };
    const res = response(); await handler(db)({ method: 'POST', query: { id: 'sermon-one' }, headers, body: { target: 'question:0', instruction: '본문에서 답하도록 수정', base_snapshot: revisionSnapshot(db.state.sermons[0]) } }, res);
    assert.equal(res.code, 200);
    const get = response(); await handler(db)({ method: 'GET', query: { id: 'sermon-one' }, headers }, get);
    assert.equal(get.body.data.length, 1); assert.equal(get.body.data[0].base_snapshot, undefined);
    const bad = response(); await handler(db)({ method: 'POST', query: { id: 'sermon-one' }, headers, body: { target: '__proto__', instruction: '수정' } }, bad);
    assert.equal(bad.code, 400);
    const noJson = response(); await handler(db)({ method: 'POST', query: { id: 'sermon-one' }, headers: { authorization: headers.authorization }, body: {} }, noJson);
    assert.equal(noJson.code, 415);
    delete process.env.LEADER_API_SECRET;
    const noSecret = response(); await handler(null)({ method: 'GET', query: { id: 'sermon-one' }, headers }, noSecret); assert.equal(noSecret.code, 401);
  } finally { if (old === undefined) delete process.env.LEADER_API_SECRET; else process.env.LEADER_API_SECRET = old; }
});


test('근황을 나누는 마음 열기 수정에는 관련 없는 원문 ID를 요구하지 않는다',()=>{
 const row=sermon(), replacement={question:'이번 주에 함께 나누고 싶은 일은 무엇인가요?',explanation:'편한 범위에서 나눕니다.',source_paragraph_ids:[]};
 assert.doesNotThrow(()=>validateRevision(row,{target:'opening'},{replacement,reason:'서로의 근황을 듣습니다.'}));
 replacement.source_paragraph_ids=['P999'];assert.throws(()=>validateRevision(row,{target:'opening'},{replacement,reason:'근황 나눔'}),/문단 근거/);
});
