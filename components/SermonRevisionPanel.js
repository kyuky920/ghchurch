import { useEffect, useState } from 'react';
import { revisionTargets, revisionValue, revisionSnapshot, revisionDisplay } from '../lib/sermon-revision.mjs';

const box = { background: '#fff', border: '1px solid #ddd0ba', borderRadius: 14, padding: 18, color: '#4a3520' };
const input = { width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid #ddd0ba', borderRadius: 8, background: '#faf7f4', color: '#4a3520', font: 'inherit' };
const button = { padding: '10px 14px', border: '1px solid #a0784e', borderRadius: 8, background: '#7a5c38', color: '#fff', cursor: 'pointer', font: 'inherit' };
const labels = { pending: '로컬 Agent를 기다리고 있어요', processing: '수정안을 작성하고 있어요', ready: '수정안이 도착했어요', failed: '수정안을 만들지 못했어요', applied: '수정안 반영 완료', discarded: '취소한 요청' };

export default function SermonRevisionPanel({ sermon, secret, dirty, onApplied }) {
  const targets = revisionTargets(sermon);
  const [target, setTarget] = useState(targets[0]?.key || '');
  const [instruction, setInstruction] = useState('');
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const url = `/api/sermons/${encodeURIComponent(sermon.id)}/revisions`;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` };
  const active = requests.find(r => ['pending', 'processing', 'ready'].includes(r.status));
  const waiting = requests.some(r => ['pending', 'processing'].includes(r.status));

  async function load(signal) {
    const response = await fetch(url, { headers, signal });
    const result = await response.json();
    if (!result.ok) throw new Error(result.error);
    if (!signal?.aborted) setRequests(result.data || []);
  }
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sermon.id]);
  useEffect(() => {
    if (!waiting) return;
    const controller = new AbortController();
    const timer = setInterval(() => load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); }), 4000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [waiting, sermon.id]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ target, instruction, base_snapshot: revisionSnapshot(sermon) }) });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error);
      await load();
      setInstruction('');
      setNotice('수정 요청을 보냈어요. 로컬 Agent가 실행 중이면 차례로 처리합니다.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function act(request, action) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ request_id: request.id, action }) });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error);
      if (action === 'apply') await onApplied();
      await load();
      setNotice(action === 'apply' ? '수정안을 반영했어요. 원음과 내용을 확인한 뒤 공개해 주세요.' : '수정 요청을 취소했어요.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section aria-label="로컬 Agent에게 부분 수정 요청" style={box}>
    <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>로컬 Agent에게 수정 요청</h3>
    <p style={{ fontSize: 13, lineHeight: 1.7, margin: '0 0 14px' }}>수정할 부분과 원하는 방향을 적어 주세요. 기존 내용과 수정안을 비교한 뒤 선택해 반영할 수 있어요.</p>
    <form onSubmit={submit}>
      <label htmlFor="revision-target">수정할 부분</label>
      <select id="revision-target" value={target} onChange={e => setTarget(e.target.value)} disabled={busy || !!active} style={{ ...input, margin: '6px 0 10px' }}>
        {targets.map(item => <option key={item.key} value={item.key}>{item.label.slice(0, 100)}</option>)}
      </select>
      {target && <details style={{ marginBottom: 12 }}><summary>선택한 부분 보기</summary><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.7 }}>{revisionDisplay(revisionValue(sermon, target))}</p></details>}
      <label htmlFor="revision-instruction">어떻게 바꾸면 좋을까요?</label>
      <textarea id="revision-instruction" value={instruction} maxLength={2000} onChange={e => setInstruction(e.target.value)} placeholder="예: 설교를 듣지 못한 사람도 성경 본문에서 답을 찾도록 질문과 참고 답안을 바꿔 주세요." rows={4} style={{ ...input, margin: '6px 0 10px', resize: 'vertical' }} />
      {dirty && <p style={{ fontSize: 13 }}>작성 중인 변경 내용을 먼저 저장한 뒤 수정 요청을 보내 주세요.</p>}
      <button type="submit" disabled={loading || busy || dirty || !!active || !target || !instruction.trim()} style={{ ...button, opacity: loading || busy || dirty || active || !instruction.trim() ? 0.55 : 1 }}>선택한 부분 수정 요청</button>
      <p style={{ fontSize: 12, marginBottom: 0 }}>로컬 Agent가 실행 중일 때 처리됩니다.</p>
    </form>
    {error && <p role="alert" style={{ color: '#b13b2e', whiteSpace: 'pre-wrap' }}>{error}</p>}
    {notice && <p role="status" style={{ color: '#2e7d32' }}>{notice}</p>}
    {requests.map(request => <article key={request.id} style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #e8d8c0' }}>
      <strong>{labels[request.status] || request.status}</strong>
      <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{request.instruction}</p>
      {request.error_msg && <p style={{ color: '#b13b2e', fontSize: 13 }}>{request.error_msg}</p>}
      {request.status === 'ready' && request.proposal && <>
        <div style={{ display: 'grid', gap: 10 }}>
          {[['기존 내용', request.before], ['수정안', request.proposal.replacement]].map(([title, value]) => <div key={title} style={{ background: '#faf7f4', borderRadius: 8, padding: 12 }}><strong>{title}</strong><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.8, marginBottom: 0 }}>{revisionDisplay(value)}</p></div>)}
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.7 }}>수정 이유: {request.proposal.reason}</p>
        <p style={{ fontSize: 13 }}>{request.proposal.review?.summary}</p>
        {(request.proposal.review?.issues || []).map((issue, i) => <p key={i} style={{ fontSize: 13, color: '#8a5700' }}>{issue.explanation}</p>)}
        {request.proposal.review?.status === 'passed' ? <button type="button" disabled={busy || dirty} onClick={() => act(request, 'apply')} style={button}>수정안 반영 · 공개 전 검토</button> : <p style={{ color: '#b13b2e' }}>내용 검토를 통과하지 못했어요. 요청을 취소하고 원하는 방향을 보완해 다시 요청해 주세요.</p>}
      </>}
      {['pending', 'processing', 'ready', 'failed'].includes(request.status) && <button type="button" disabled={busy} onClick={() => act(request, 'discard')} style={{ ...button, marginTop: 10, marginLeft: 8, background: '#fff', color: '#7a5c38' }}>이 요청 취소</button>}
    </article>)}
  </section>;
}
