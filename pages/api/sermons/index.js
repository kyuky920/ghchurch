import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET — 청년 서비스용 (status=done 만)
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('sermons')
        .select('id,week,service,reference,sermon_title,passage,questions,meditations,card_verse,sermon_summary,status,created_at')
        .eq('status', 'done')
        .order('week', { ascending: false })
        .order('service', { ascending: true })
      if (error) throw error
      // questions/meditations가 문자열로 저장된 경우 파싱
      const parsed = (data || []).map(s => ({
        ...s,
        questions:     typeof s.questions     === 'string' ? JSON.parse(s.questions)     : s.questions,
        meditations:   typeof s.meditations   === 'string' ? JSON.parse(s.meditations)   : s.meditations,
        sermon_summary: typeof s.sermon_summary === 'string' ? JSON.parse(s.sermon_summary) : s.sermon_summary,
      }))
      return res.status(200).json({ ok: true, data: parsed })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  // POST — 리더 도구용 (raw 데이터 저장, status=pending)
  if (req.method === 'POST') {
    const secret = req.headers['authorization']?.replace('Bearer ', '')
    if (secret !== process.env.LEADER_API_SECRET) {
      return res.status(401).json({ ok: false, error: '인증 실패' })
    }
    try {
      const { week, service, reference, sermon_title, passage, sermon_points } = req.body
      if (!week || !service || !reference || !passage) {
        return res.status(400).json({ ok: false, error: 'week, service, reference, passage는 필수입니다.' })
      }
      const { data, error } = await supabase
        .from('sermons')
        .upsert({
          week, service, reference,
          sermon_title: sermon_title || '',
          passage,
          sermon_points: sermon_points || '',
          status: 'pending',
          questions: null,
          meditations: null,
          card_verse: null,
          error_msg: null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'week,service' })
        .select()
        .single()
      if (error) throw error
      return res.status(200).json({ ok: true, data })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
