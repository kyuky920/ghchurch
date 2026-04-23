import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET — 주차/예배 조 편성 조회 (service 없으면 week만으로 조회)
  if (req.method === 'GET') {
    const { week, service } = req.query
    if (!week) return res.status(400).json({ ok: false, error: 'week 필수' })
    try {
      let query = supabase.from('cell_groups').select('*').eq('week', week)
      if (service) query = query.eq('service', service)
      // service 없으면 해당 주차 첫 번째 결과 반환
      const { data, error } = service
        ? await query.single()
        : await query.order('created_at', { ascending: false }).limit(1).single()
      if (error && error.code === 'PGRST116') return res.status(200).json({ ok: true, data: null })
      if (error) throw error
      const groups = typeof data.groups === 'string' ? JSON.parse(data.groups) : data.groups
      return res.status(200).json({ ok: true, data: { ...data, groups } })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  // POST — 조 편성 저장 (upsert)
  if (req.method === 'POST') {
    const secret = req.headers['authorization']?.replace('Bearer ', '')
    if (secret !== process.env.LEADER_API_SECRET) return res.status(401).json({ ok: false, error: '인증 실패' })
    const { week, service, groups } = req.body
    if (!week || !groups) return res.status(400).json({ ok: false, error: 'week, groups 필수' })
    try {
      const { data, error } = await supabase
        .from('cell_groups')
        .upsert({ week, service, groups }, { onConflict: 'week,service' })
        .select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, data })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
