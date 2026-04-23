import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET — 현재 활성 세션 조회
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('cell_sessions')
        .select('*')
        .eq('is_active', true)
        .order('started_at', { ascending: false })
        .limit(1)
        .single()
      if (error && error.code === 'PGRST116') return res.status(200).json({ ok: true, data: null })
      if (error) throw error
      return res.status(200).json({ ok: true, data })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  // POST — 세션 시작
  if (req.method === 'POST') {
    const { week, service, active_tab } = req.body
    if (!week) return res.status(400).json({ ok: false, error: 'week 필수' })
    try {
      // 기존 활성 세션 모두 종료
      await supabase.from('cell_sessions').update({ is_active: false }).eq('is_active', true)
      // 새 세션 insert
      const { data, error } = await supabase
        .from('cell_sessions')
        .insert({
          week,
          service: service || 'morning',
          active_tab: active_tab ?? 0,
          is_active: true,
          started_at: new Date().toISOString()
        })
        .select()
        .single()
      if (error) throw error
      return res.status(200).json({ ok: true, data })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  // DELETE — 세션 종료
  if (req.method === 'DELETE') {
    try {
      await supabase.from('cell_sessions').update({ is_active: false }).eq('is_active', true)
      return res.status(200).json({ ok: true })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
