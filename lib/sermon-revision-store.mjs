import { randomUUID } from 'node:crypto';
import { revisionSnapshot, sameRevisionSnapshot, validateRevisionRequest, revisionValue, mergeRevision } from './sermon-revision.mjs';

export const REVISION_TABLE = 'sermon_revision_requests';
export const isMissingRevisionTable = error => ['42P01', 'PGRST205', 'PGRST202'].includes(error?.code);
export class RevisionError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function check(error) {
  if (!error) return;
  if (isMissingRevisionTable(error)) throw new RevisionError('부분 수정 기능의 DB 설정이 필요합니다. 설치 안내를 확인해 주세요.', 503);
  throw error;
}
export async function readRevisionSermon(db, id) {
  const { data, error } = await db.from('sermons').select('*').eq('id', id).maybeSingle();
  check(error);
  if (!data) throw new RevisionError('말씀 자료를 찾을 수 없습니다.', 404);
  return data;
}
export async function listRevisions(db, sermonId) {
  const { data, error } = await db.from(REVISION_TABLE).select('*').eq('sermon_id', String(sermonId)).order('created_at', { ascending: false }).limit(10);
  check(error);
  return (data || []).map(({ base_snapshot, ...request }) => ({ ...request, before: revisionValue(base_snapshot, request.target) }));
}
export async function createRevision(db, sermonId, body) {
  const row = await readRevisionSermon(db, sermonId);
  let request;
  try { request = validateRevisionRequest(row, body); } catch (error) { throw new RevisionError(error.message); }
  // UI passes the content it displayed; refuse stale screens instead of revising unseen content.
  if (!sameRevisionSnapshot(body.base_snapshot, revisionSnapshot(row))) throw new RevisionError('자료가 변경되었습니다. 화면을 새로 연 뒤 요청해 주세요.', 409);
  const { data, error } = await db.from(REVISION_TABLE).insert({ id: randomUUID(), sermon_id: String(sermonId), ...request, base_snapshot: revisionSnapshot(row), status: 'pending' }).select().single();
  if (error?.code === '23505') throw new RevisionError('이 말씀의 수정 요청이 이미 진행 중입니다. 완료하거나 취소한 뒤 다시 요청해 주세요.', 409);
  check(error);
  return data;
}
export async function changeRevision(db, sermonId, requestId, action) {
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw new RevisionError('올바른 수정 요청을 선택해 주세요.');
  const { data: request, error } = await db.from(REVISION_TABLE).select('*').eq('id', requestId).eq('sermon_id', String(sermonId)).maybeSingle();
  check(error);
  if (!request) throw new RevisionError('수정 요청을 찾을 수 없습니다.', 404);
  if (action === 'discard') {
    const result = await db.from(REVISION_TABLE).update({ status: 'discarded', lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq('id', requestId).in('status', ['pending', 'processing', 'ready', 'failed']).select().maybeSingle();
    check(result.error);
    if (!result.data) throw new RevisionError('이미 처리된 요청입니다. 새로 확인해 주세요.', 409);
    return result.data;
  }
  if (action !== 'apply') throw new RevisionError('지원하지 않는 요청입니다.');
  if (request.status !== 'ready' || !request.proposal) throw new RevisionError('검토할 수정안이 아직 준비되지 않았습니다.', 409);
  if (request.proposal.review?.status !== 'passed') throw new RevisionError('내용 검토를 통과하지 못했습니다. 요청을 보완해 다시 작성해 주세요.', 409);
  const candidate = mergeRevision(request.base_snapshot, request.target, request.proposal.replacement, request.proposal.review);
  // A DB transaction locks both rows, rechecks the complete snapshot, updates only the
  // selected content through the server-built candidate, and marks the request applied.
  const applied = await db.rpc('apply_sermon_revision', { p_request_id: requestId, p_update: {
    questions: JSON.stringify(candidate.questions), sermon_summary: JSON.stringify(candidate.sermon_summary), updated_at: new Date().toISOString(),
  } });
  if (applied.error?.code === '40001') throw new RevisionError('원문이나 나눔자료가 변경되어 적용하지 못했습니다. 새 자료를 확인한 뒤 다시 요청해 주세요.', 409);
  check(applied.error);
  return applied.data;
}
