import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // 리더 인증
  const secret = req.headers['authorization']?.replace('Bearer ', '')
  if (secret !== process.env.LEADER_API_SECRET) {
    return res.status(401).json({ ok: false, error: '인증 실패' })
  }

  const { id } = req.query

  // PATCH — 수정
  if (req.method === 'PATCH') {
    try {
      const body = req.body
      const { data, error } = await supabase
        .from('sermons')
        .update({
          reference:    body.reference,
          sermon_title: body.sermon_title || '',
          passage:      body.passage || '',
          questions:    body.questions || [],
          meditations:  body.meditations || [],
          card_verse:   body.card_verse || '',
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return res.status(200).json({ ok: true, data })
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  }

  // DELETE — 삭제
  if (req.method === 'DELETE') {
    try {
      const { error } = await supabase
        .from('sermons')
        .delete()
        .eq('id', id)

      if (error) throw error
      return res.status(200).json({ ok: true })
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
