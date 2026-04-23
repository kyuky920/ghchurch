import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET — 현재 활성 세션 조회 (청년 폴링용)
  if (req.method === 'GET') {
    const { week, service } = req.query
    try {
      const q = supabase.from('cell_sessions').select('*').eq('is_active', true)
      if (week && service) q.eq('week', week).eq('service', service)
      const { data, error } = await q.order('started_at', { ascending: false }).limit(1).single()
      if (error && error.code === 'PGRST116') return res.status(200).json({ ok: true, data: null })
      if (error) throw error
      return res.status(200).json({ ok: true, data })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  // POST — 세션 시작 (리더)
  if (req.method === 'POST') {
    const secret = req.headers['authorization']?.replace('Bearer ', '')
    if (secret !== process.env.LEADER_API_SECRET) return res.status(401).json({ ok: false, error: '인증 실패' })
    const { week, service, active_tab } = req.body
    if (!week || !service) return res.status(400).json({ ok: false, error: 'week, service 필수' })
    try {
      // 기존 활성 세션 종료
      await supabase.from('cell_sessions').update({ is_active: false }).eq('is_active', true)
      // 새 세션 시작
      const { data, error } = await supabase
        .from('cell_sessions')
        .upsert({ week, service, active_tab: active_tab ?? 0, is_active: true, started_at: new Date().toISOString() },
          { onConflict: 'week,service' })
        .select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, data })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  // DELETE — 세션 종료
  if (req.method === 'DELETE') {
    const secret = req.headers['authorization']?.replace('Bearer ', '')
    if (secret !== process.env.LEADER_API_SECRET) return res.status(401).json({ ok: false, error: '인증 실패' })
    try {
      await supabase.from('cell_sessions').update({ is_active: false }).eq('is_active', true)
      return res.status(200).json({ ok: true })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
