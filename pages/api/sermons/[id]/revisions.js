import { supabase } from '../../../../lib/supabase';
import { listRevisions, createRevision, changeRevision } from '../../../../lib/sermon-revision-store.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.LEADER_API_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: '인증이 필요합니다.' });
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) return res.status(405).json({ ok: false, error: '지원하지 않는 요청입니다.' });
  if (req.method !== 'GET' && !req.headers['content-type']?.startsWith('application/json')) return res.status(415).json({ ok: false, error: 'JSON 요청이 필요합니다.' });
  if (typeof req.query.id !== 'string') return res.status(400).json({ ok: false, error: '말씀 자료를 선택해 주세요.' });
  try {
    const data = req.method === 'GET' ? await listRevisions(supabase, req.query.id)
      : req.method === 'POST' ? await createRevision(supabase, req.query.id, req.body)
      : await changeRevision(supabase, req.query.id, req.body?.request_id, req.body?.action);
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    if (!error.status) console.error('[sermon-revision] request failed', error.code || 'unknown');
    return res.status(error.status || 500).json({ ok: false, error: error.status ? error.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
}
