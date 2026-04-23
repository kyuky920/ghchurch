import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET — 멤버 조회
  // ?all=true : 전체 등록 멤버 (한 번이라도 접속한 전체)
  // 기본     : 현재 접속 중 (last_seen 30분 이내)
  if (req.method === 'GET') {
    const { all } = req.query
    try {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      const q = supabase.from('members').select('id,device_id,name,last_seen,created_at')
      const query = all === 'true' ? q : q.gte('last_seen', since)
      const { data, error } = await query.order('name', { ascending: true })
      if (error) throw error
      return res.status(200).json({ ok: true, data })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  // POST — 멤버 등록 (이름 + device_id)
  if (req.method === 'POST') {
    const { device_id, name, week, service } = req.body
    if (!device_id || !name) return res.status(400).json({ ok: false, error: 'device_id, name 필수' })
    try {
      const { data, error } = await supabase
        .from('members')
        .upsert({ device_id, name, week: week||null, service: service||null, last_seen: new Date().toISOString() },
          { onConflict: 'device_id' })
        .select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, data })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  // PATCH — last_seen 업데이트 (heartbeat)
  if (req.method === 'PATCH') {
    const { device_id, week, service } = req.body
    if (!device_id) return res.status(400).json({ ok: false, error: 'device_id 필수' })
    try {
      const { error } = await supabase
        .from('members')
        .update({ last_seen: new Date().toISOString(), week: week||null, service: service||null })
        .eq('device_id', device_id)
      if (error) throw error
      return res.status(200).json({ ok: true })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
