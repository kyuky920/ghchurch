import { supabase } from '../../../lib/supabase'

const LEADER_SECRET = process.env.LEADER_API_SECRET || process.env.NEXT_PUBLIC_LEADER_SECRET || 'wordlife-leader-2025'
const ALLOWED = new Set(['present', 'absent', 'late', 'excused'])

function normalizeWeek(week) {
  if (!week) return ''
  return String(week).trim()
}

function normalizeStatus(status) {
  const s = String(status || '').trim().toLowerCase()
  return ALLOWED.has(s) ? s : null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    const week = normalizeWeek(req.query.week)
    if (!week) return res.status(400).json({ ok: false, error: 'week 필수' })
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('id,week,member_id,status,note,checked_by,checked_at,created_at,updated_at,members:member_id(id,device_id,name,last_seen)')
        .eq('week', week)
        .order('checked_at', { ascending: false })
      if (error) throw error
      return res.status(200).json({ ok: true, data: data || [] })
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  }

  if (req.method === 'POST') {
    const auth = req.headers.authorization || ''
    if (auth !== `Bearer ${LEADER_SECRET}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' })
    }

    const action = req.body?.action || 'upsert'
    const week = normalizeWeek(req.body?.week)
    if (!week) return res.status(400).json({ ok: false, error: 'week 필수' })

    try {
      if (action === 'upsert_bulk') {
        const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
        if (!rows.length) return res.status(400).json({ ok: false, error: 'rows 필수' })
        const checkedBy = String(req.body?.checked_by || '').trim() || 'leader'
        const now = new Date().toISOString()

        const payload = rows.map((r) => {
          const status = normalizeStatus(r.status)
          if (!r.member_id || !status) return null
          return {
            week,
            member_id: r.member_id,
            status,
            note: r.note || null,
            checked_by: checkedBy,
            checked_at: now,
            updated_at: now,
          }
        }).filter(Boolean)

        if (!payload.length) return res.status(400).json({ ok: false, error: '유효한 rows가 없어요.' })

        const { error } = await supabase
          .from('attendance')
          .upsert(payload, { onConflict: 'week,member_id' })
        if (error) throw error
        return res.status(200).json({ ok: true, count: payload.length })
      }

      const memberId = req.body?.member_id
      const status = normalizeStatus(req.body?.status)
      const checkedBy = String(req.body?.checked_by || '').trim() || 'leader'
      if (!memberId || !status) return res.status(400).json({ ok: false, error: 'member_id, status 필수' })

      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('attendance')
        .upsert({
          week,
          member_id: memberId,
          status,
          note: req.body?.note || null,
          checked_by: checkedBy,
          checked_at: now,
          updated_at: now,
        }, { onConflict: 'week,member_id' })
        .select('id,week,member_id,status,note,checked_by,checked_at,created_at,updated_at')
        .single()
      if (error) throw error
      return res.status(200).json({ ok: true, data })
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}

