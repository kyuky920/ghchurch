import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  // CORS 헤더 — Artifact(claude.ai)에서 호출 허용
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET — 전체 목록 조회 (청년 서비스용, 인증 불필요)
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('sermons')
        .select('*')
        .order('week', { ascending: false })
        .order('service', { ascending: true })

      if (error) throw error
      return res.status(200).json({ ok: true, data })
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  }

  // POST — 새 자료 저장 (리더 도구용, 인증 필요)
  if (req.method === 'POST') {
    const secret = req.headers['authorization']?.replace('Bearer ', '')
    if (secret !== process.env.LEADER_API_SECRET) {
      return res.status(401).json({ ok: false, error: '인증 실패' })
    }

    try {
      const body = req.body
      // 필수 필드 검증
      if (!body.week || !body.service || !body.reference) {
        return res.status(400).json({ ok: false, error: 'week, service, reference는 필수입니다.' })
      }

      // week + service 중복이면 upsert
      const { data, error } = await supabase
        .from('sermons')
        .upsert({
          week:         body.week,
          service:      body.service,
          reference:    body.reference,
          sermon_title: body.sermon_title || '',
          passage:      body.passage || '',
          questions:    body.questions || [],
          meditations:  body.meditations || [],
          card_verse:   body.card_verse || '',
        }, { onConflict: 'week,service' })
        .select()
        .single()

      if (error) throw error
      return res.status(200).json({ ok: true, data })
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
