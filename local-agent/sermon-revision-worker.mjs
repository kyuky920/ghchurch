import { randomUUID } from 'node:crypto';
import { revisionSnapshot, sameRevisionSnapshot } from '../lib/sermon-revision.mjs';
import { REVISION_TABLE, isMissingRevisionTable } from '../lib/sermon-revision-store.mjs';
import { generateRevision } from './sermon-revision.mjs';

let warnedMissingTable = false;

export async function runPendingRevision({ db, options, callAi, parseJson }) {
  let query = db.from(REVISION_TABLE).select('*').or(`status.eq.pending,and(status.eq.processing,lease_expires_at.lt.${new Date().toISOString()})`).order('created_at', { ascending: true }).limit(1);
  if (options.id) query = query.eq('sermon_id', String(options.id));
  if (options.revisionId) query = query.eq('id', options.revisionId);
  const { data, error } = await query;
  if (error) {
    if (isMissingRevisionTable(error) && !options.revisionId) {
      if (!warnedMissingTable) console.log('[agent] 부분 수정 DB 설정 전입니다. 기존 자료 생성은 계속합니다.');
      warnedMissingTable = true;
      return false;
    }
    throw error;
  }
  const request = data?.[0];
  if (!request) return false;
  if (options.dryRun) {
    console.log(`[agent] 수정 대기: ${request.id} (${request.target}); dry-run에서는 요청을 처리하지 않습니다.`);
    return true;
  }
  const token = randomUUID();
  const lease = () => new Date(Date.now() + 120000).toISOString();
  let claim = db.from(REVISION_TABLE).update({ status: 'processing', lease_token: token, lease_expires_at: lease(), error_msg: null, updated_at: new Date().toISOString() }).eq('id', request.id).eq('status', request.status);
  if (request.status === 'processing') claim = claim.eq('lease_token', request.lease_token).lt('lease_expires_at', new Date().toISOString());
  const claimed = await claim.select().maybeSingle();
  if (claimed.error) throw claimed.error;
  if (!claimed.data) return true;
  console.log(`[agent] 부분 수정 시작: ${request.id} target=${request.target}`);
  let leaseLost = false;
  const heartbeat = setInterval(async () => {
    try {
      const result = await db.from(REVISION_TABLE).update({ lease_expires_at: lease(), updated_at: new Date().toISOString() }).eq('id', request.id).eq('status', 'processing').eq('lease_token', token).select('id').maybeSingle();
      if (result.error || !result.data) leaseLost = true;
    } catch { leaseLost = true; }
  }, 30000);
  heartbeat.unref?.();
  try {
    const result = await db.from('sermons').select('*').eq('id', request.sermon_id).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data || !sameRevisionSnapshot(revisionSnapshot(result.data), request.base_snapshot)) throw new Error('원문이나 나눔자료가 변경되었습니다. 새 자료를 확인한 뒤 다시 요청해 주세요.');
    const proposal = await generateRevision(result.data, request, { callAi, parseJson });
    if (leaseLost) throw new Error('요청 처리 권한이 만료되었습니다. 다시 확인해 주세요.');
    const saved = await db.from(REVISION_TABLE).update({ status: 'ready', proposal, lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq('id', request.id).eq('status', 'processing').eq('lease_token', token).select('id').maybeSingle();
    if (saved.error) throw saved.error;
    console.log(saved.data ? `[agent] 부분 수정안 준비: ${request.id}` : `[agent] 취소되거나 다른 작업자가 회수한 요청: ${request.id}`);
  } catch (error) {
    // Failed or canceled work never updates the published sermon.
    const saved = await db.from(REVISION_TABLE).update({ status: 'failed', error_msg: '수정안을 만들지 못했습니다. 원문과 요청 내용을 확인한 뒤 다시 요청해 주세요.', lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq('id', request.id).eq('status', 'processing').eq('lease_token', token);
    if (saved.error) console.error('[agent] 수정 실패 상태를 저장하지 못했습니다.');
    console.error(`[agent] 부분 수정 실패: ${String(error.message).slice(0, 500)}`);
  } finally { clearInterval(heartbeat); }
  return true;
}
