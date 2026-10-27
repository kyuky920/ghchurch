import { readQuestionDocument, prepareContentReviewForSave } from './sermon-materials.mjs';

export const REVISION_SNAPSHOT_FIELDS = ['week', 'service', 'reference', 'sermon_title', 'passage', 'sermon_points', 'sermon_summary', 'questions', 'status'];
export function revisionSnapshot(row) {
  return Object.fromEntries(REVISION_SNAPSHOT_FIELDS.map(key => [key, row[key] ?? null]));
}
export function sameRevisionSnapshot(a, b) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
function parse(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
function questionEntries(value) {
  const doc = readQuestionDocument(value);
  if (Array.isArray(doc)) return doc.map((question, index) => ({ question, path: [index] }));
  for (const field of ['groups', 'sections']) {
    if (doc?.[field]?.length) return doc[field].flatMap((group, i) => (group.questions || []).map((question, j) => ({ question, path: [field, i, 'questions', j] })));
  }
  return (doc?.flat || []).map((question, i) => ({ question, path: ['flat', i] }));
}
const questionObject = q => typeof q === 'string' ? { question: q } : q;
export function revisionTargets(row) {
  const summary = parse(row.sermon_summary, {});
  const meta = readQuestionDocument(row.questions)?.meta || {};
  const targets = [];
  if (meta.opening_question) targets.push({ key: 'opening', label: '마음 열기' });
  if (summary.key_point) targets.push({ key: 'summary_key_point', label: '요약 · 핵심 메시지' });
  if (summary.overview) targets.push({ key: 'summary_overview', label: '요약 · 전체 흐름' });
  (summary.sections || []).forEach((s, i) => targets.push({ key: `summary_section:${i}`, label: `요약 단락 ${i + 1} · ${s.title || ''}` }));
  questionEntries(row.questions).forEach(({ question }, i) => targets.push({ key: `question:${i}`, label: `질문 ${i + 1} · ${questionObject(question)?.question || ''}` }));
  (meta.practice_options || []).forEach((p, i) => targets.push({ key: `practice:${i}`, label: `실천 선택지 ${i + 1}` }));
  if (meta.closing_prayer) targets.push({ key: 'closing_prayer', label: '마무리 기도' });
  return targets;
}
export function revisionValue(row, key) {
  if (!revisionTargets(row).some(t => t.key === key)) throw new Error('수정할 항목을 다시 선택해 주세요.');
  const summary = parse(row.sermon_summary, {});
  const meta = readQuestionDocument(row.questions)?.meta || {};
  const [kind, index] = key.split(':');
  if (kind === 'opening') return meta.opening_question;
  if (kind === 'summary_key_point') return { text: summary.key_point, source_paragraph_ids: summary.key_point_source_paragraph_ids || [] };
  if (kind === 'summary_overview') return { text: summary.overview, source_paragraph_ids: summary.overview_source_paragraph_ids || [] };
  if (kind === 'summary_section') return summary.sections[Number(index)];
  if (kind === 'question') return questionObject(questionEntries(row.questions)[Number(index)].question);
  if (kind === 'practice') return meta.practice_options[Number(index)];
  return { text: meta.closing_prayer, source_paragraph_ids: meta.closing_prayer_source_paragraph_ids || [] };
}
export function validateRevisionRequest(row, body) {
  if (row.status !== 'done') throw new Error('생성이 완료된 자료에서 수정 요청을 할 수 있습니다.');
  if (typeof body?.target !== 'string') throw new Error('수정할 항목을 선택해 주세요.');
  revisionValue(row, body.target);
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
  if (!instruction || instruction.length > 2000) throw new Error('수정 요청은 1~2,000자로 적어 주세요.');
  return { target: body.target, instruction };
}
export function revisionDisplay(value) {
  if (!value) return '';
  const parts = ['title', 'content', 'text', 'question', 'explanation', 'answer', 'scripture_anchor'].filter(key => value[key]).map(key => value[key]);
  if (value.origin) parts.push(value.origin === 'sermon' ? '설교에서 제시한 실천' : '말씀에 따라 제안한 예시');
  return parts.join('\n\n');
}
// Only these content fields can be changed. Stage, order, core marks and source text are retained.
export function revisionFields(target) {
  if (target === 'opening') return ['question', 'explanation', 'source_paragraph_ids'];
  if (target.startsWith('question:')) return ['question', 'explanation', 'answer', 'scripture_anchor', 'source_paragraph_ids'];
  if (target.startsWith('summary_section:')) return ['title', 'content', 'source_paragraph_ids'];
  if (target.startsWith('practice:')) return ['text', 'origin', 'source_paragraph_ids'];
  return ['text', 'source_paragraph_ids'];
}
export function mergeRevision(row, target, replacement, review) {
  revisionValue(row, target);
  const allowed = revisionFields(target);
  if (!replacement || Object.keys(replacement).some(key => !allowed.includes(key))) throw new Error('선택한 범위를 벗어난 수정안입니다.');
  const summary = structuredClone(parse(row.sermon_summary, {}));
  const original = readQuestionDocument(row.questions);
  let questions = structuredClone(original);
  if (Array.isArray(questions)) questions = { sections: [{ section_title: '나눔 질문', questions }], flat: questions };
  if (!questions || typeof questions !== 'object') throw new Error('기존 나눔자료를 읽을 수 없습니다.');
  questions.meta ||= {};
  const [kind, indexText] = target.split(':');
  const index = Number(indexText);
  if (kind === 'opening') questions.meta.opening_question = { ...questions.meta.opening_question, ...replacement };
  if (kind === 'summary_key_point') { summary.key_point = replacement.text; summary.key_point_source_paragraph_ids = replacement.source_paragraph_ids; }
  if (kind === 'summary_overview') { summary.overview = replacement.text; summary.overview_source_paragraph_ids = replacement.source_paragraph_ids; }
  if (kind === 'summary_section') summary.sections[index] = { ...summary.sections[index], ...replacement };
  if (kind === 'question') {
    const entries = questionEntries(questions);
    const changed = { ...questionObject(entries[index].question), ...replacement };
    let parent = questions;
    const path = entries[index].path;
    for (const key of path.slice(0, -1)) parent = parent[key];
    parent[path.at(-1)] = changed;
    if (Array.isArray(questions.flat) && path[0] !== 'flat') questions.flat = questions.flat.map((q, i) => i === index ? { ...questionObject(q), ...replacement } : q);
  }
  if (kind === 'practice') questions.meta.practice_options[index] = { ...questions.meta.practice_options[index], ...replacement };
  if (kind === 'closing_prayer') { questions.meta.closing_prayer = replacement.text; questions.meta.closing_prayer_source_paragraph_ids = replacement.source_paragraph_ids; }
  questions.meta.revision_review = { target, review: review || { status: 'not_run', summary: '수정안 검토 전입니다.', issues: [] } };
  questions = prepareContentReviewForSave(questions, questions, false);
  return { sermon_summary: summary, questions };
}
