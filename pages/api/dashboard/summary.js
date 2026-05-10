import { supabase } from '../../../lib/supabase'

const LEADER_SECRET = process.env.LEADER_API_SECRET || process.env.NEXT_PUBLIC_LEADER_SECRET || 'wordlife-leader-2025'

function getWeekStr(date) {
  const d = new Date(date || new Date())
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function ymd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function monthKey(dateStr) {
  return (dateStr || '').slice(0, 7)
}

function yearKey(dateStr) {
  return (dateStr || '').slice(0, 4)
}

function getYearMonthRange(targetWeek) {
  const base = new Date(`${targetWeek}T00:00:00`)
  const y = base.getFullYear()
  const m = base.getMonth()
  const monthStart = new Date(y, m, 1)
  const monthEnd = new Date(y, m + 1, 0)
  const yearStart = new Date(y, 0, 1)
  const yearEnd = new Date(y, 11, 31)
  return {
    monthStart: ymd(monthStart),
    monthEnd: ymd(monthEnd),
    yearStart: ymd(yearStart),
    yearEnd: ymd(yearEnd),
    targetYear: String(y),
    targetMonth: `${y}-${String(m + 1).padStart(2, '0')}`,
  }
}

function aggregateRows(rows, totalMembers) {
  const present = rows.filter((r) => r.status === 'present').length
  const absent = rows.filter((r) => r.status === 'absent' || r.status === 'excused').length
  const checked = rows.length
  const rate = totalMembers > 0 ? Math.round((present / totalMembers) * 1000) / 10 : 0
  return { present, absent, checked, rate }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const auth = req.headers.authorization || ''
  if (auth !== `Bearer ${LEADER_SECRET}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }

  const targetWeek = String(req.query.week || getWeekStr())
  const { monthStart, monthEnd, yearStart, yearEnd, targetYear, targetMonth } = getYearMonthRange(targetWeek)

  try {
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const [membersRes, onlineRes, attendanceRes, sermonsRes, sessionsRes] = await Promise.all([
      supabase.from('members').select('id,device_id,name,last_seen,created_at'),
      supabase.from('members').select('id,device_id').gte('last_seen', since),
      supabase.from('attendance').select('week,member_id,status,checked_at'),
      supabase.from('sermons').select('id,status,created_at'),
      supabase.from('cell_sessions').select('id,week,is_active,started_at,ended_at'),
    ])

    if (membersRes.error) throw membersRes.error
    if (onlineRes.error) throw onlineRes.error
    if (attendanceRes.error) throw attendanceRes.error
    if (sermonsRes.error) throw sermonsRes.error
    if (sessionsRes.error) throw sessionsRes.error

    const members = membersRes.data || []
    const online = onlineRes.data || []
    const attendance = attendanceRes.data || []
    const sermons = sermonsRes.data || []
    const sessions = sessionsRes.data || []
    const totalMembers = members.length

    const weekRows = attendance.filter((r) => r.week === targetWeek)
    const monthRows = attendance.filter((r) => r.week >= monthStart && r.week <= monthEnd)
    const yearRows = attendance.filter((r) => r.week >= yearStart && r.week <= yearEnd)

    const weekStats = aggregateRows(weekRows, totalMembers)
    const monthStats = aggregateRows(monthRows, totalMembers)
    const yearStats = aggregateRows(yearRows, totalMembers)

    const monthByWeekMap = {}
    monthRows.forEach((r) => {
      if (!monthByWeekMap[r.week]) monthByWeekMap[r.week] = []
      monthByWeekMap[r.week].push(r)
    })
    const monthByWeek = Object.keys(monthByWeekMap).sort().map((week) => ({
      week,
      ...aggregateRows(monthByWeekMap[week], totalMembers),
    }))

    const yearByMonthMap = {}
    yearRows.forEach((r) => {
      const key = monthKey(r.week)
      if (!yearByMonthMap[key]) yearByMonthMap[key] = []
      yearByMonthMap[key].push(r)
    })
    const yearByMonth = Object.keys(yearByMonthMap).sort().map((month) => ({
      month,
      ...aggregateRows(yearByMonthMap[month], totalMembers),
    }))

    const sermonSummary = sermons.reduce((acc, s) => {
      const k = s.status || 'pending'
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {})

    const weekSessions = sessions.filter((s) => s.week === targetWeek)
    const activeSessions = weekSessions.filter((s) => s.is_active).length
    const endedSessions = weekSessions.filter((s) => !s.is_active && s.ended_at).length

    return res.status(200).json({
      ok: true,
      data: {
        기준주차: targetWeek,
        구성원: {
          total_members: totalMembers,
          online_members: online.length,
          offline_members: Math.max(totalMembers - online.length, 0),
        },
        출석: {
          week: weekStats,
          month: monthStats,
          year: yearStats,
          month_by_week: monthByWeek,
          year_by_month: yearByMonth,
          target_month: targetMonth,
          target_year: targetYear,
        },
        운영: {
          sermon_status: {
            pending: sermonSummary.pending || 0,
            processing: sermonSummary.processing || 0,
            done: sermonSummary.done || 0,
            error: sermonSummary.error || 0,
          },
          sessions: {
            week_total: weekSessions.length,
            week_active: activeSessions,
            week_ended: endedSessions,
          },
        },
      }
    })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message })
  }
}

