import { prepareContentReviewForSave, requiresContentReview } from '../../../lib/sermon-materials.mjs'
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { id } = req.query

  // GET — 단건 조회 (status 폴링용)
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('sermons').select('*').eq('id', id).single()
      if (error) throw error
      const isAdmin = Boolean(process.env.LEADER_API_SECRET) && req.headers.authorization?.replace('Bearer ', '') === process.env.LEADER_API_SECRET
      if (requiresContentReview(data.questions) && !isAdmin) return res.status(404).json({ ok: false, error: '자료를 검토 중입니다.' })
      return res.status(200).json({ ok: true, data })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  if (req.method === 'PATCH') {
    const secret = req.headers['authorization']?.replace('Bearer ', '')
    if (!process.env.LEADER_API_SECRET || secret !== process.env.LEADER_API_SECRET) {
      return res.status(401).json({ ok: false, error: '인증 실패' })
    }
    try {
      const body = req.body || {}
      const updateFields = {
        updated_at: new Date().toISOString(),
      }

      const allowed = [
        'week',
        'service',
        'reference',
        'sermon_title',
        'passage',
        'sermon_points',
        'sermon_summary',
        'questions',
        'meditations',
        'card_verse',
        'status',
        'error_msg',
      ]

      allowed.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          updateFields[key] = body[key]
        }
      })

      if (['sermon_summary', 'questions', 'sermon_title', 'passage', 'sermon_points', 'reference'].some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
        const { data: previous, error: readError } = await supabase.from('sermons').select('questions').eq('id', id).single()
        if (readError) throw readError
        const questions = prepareContentReviewForSave(previous.questions, updateFields.questions ?? previous.questions, body.confirm_content_review === true)
        if (questions?.meta?.content_version === 'youth-sharing-v2' || questions?.meta?.revision_review) updateFields.questions = JSON.stringify(questions)
      }

      const { data, error } = await supabase
        .from('sermons')
        .update(updateFields)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return res.status(200).json({ ok: true, data })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  // DELETE — 리더 도구용
  if (req.method === 'DELETE') {
    const secret = req.headers['authorization']?.replace('Bearer ', '')
    if (!process.env.LEADER_API_SECRET || secret !== process.env.LEADER_API_SECRET) {
      return res.status(401).json({ ok: false, error: '인증 실패' })
    }
    try {
      const { error } = await supabase.from('sermons').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ ok: true })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
