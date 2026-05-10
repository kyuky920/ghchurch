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

function weekDiffFrom(baseWeek, targetWeek) {
  const a = new Date(`${baseWeek}T00:00:00`).getTime()
  const b = new Date(`${targetWeek}T00:00:00`).getTime()
  return Math.round((a - b) / (7 * 24 * 60 * 60 * 1000))
}

function parseTrackState(noteValue, status) {
  const blank = { sunday_morning: false, sunday_afternoon: false, young_adult_meeting: false }
  if (!noteValue) return status === 'present' ? { ...blank, sunday_morning: true } : blank
  try {
    const parsed = typeof noteValue === 'string' ? JSON.parse(noteValue) : noteValue
    if (!parsed || typeof parsed !== 'object') return blank
    return {
      sunday_morning: !!parsed.sunday_morning,
      sunday_afternoon: !!parsed.sunday_afternoon,
      young_adult_meeting: !!parsed.young_adult_meeting,
    }
  } catch (e) {
    return status === 'present' ? { ...blank, sunday_morning: true } : blank
  }
}

function aggregateTracks(rows, totalMembers) {
  const counts = { sunday_morning: 0, sunday_afternoon: 0, young_adult_meeting: 0 }
  rows.forEach((r) => {
    const t = parseTrackState(r.note, r.status)
    if (t.sunday_morning) counts.sunday_morning += 1
    if (t.sunday_afternoon) counts.sunday_afternoon += 1
    if (t.young_adult_meeting) counts.young_adult_meeting += 1
  })
  const rate = (v) => (totalMembers > 0 ? Math.round((v / totalMembers) * 1000) / 10 : 0)
  return {
    sunday_morning: { count: counts.sunday_morning, rate: rate(counts.sunday_morning) },
    sunday_afternoon: { count: counts.sunday_afternoon, rate: rate(counts.sunday_afternoon) },
    young_adult_meeting: { count: counts.young_adult_meeting, rate: rate(counts.young_adult_meeting) },
  }
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
      supabase.from('attendance').select('week,member_id,status,note,checked_at'),
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
    const weekTracks = aggregateTracks(weekRows, totalMembers)
    const monthTracks = aggregateTracks(monthRows, totalMembers)
    const yearTracks = aggregateTracks(yearRows, totalMembers)

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

    // 개인 출석률(최근 8주) + 연속 결석(최근 8주)
    const recentWindow = 8
    const recentRows = attendance.filter((r) => {
      const diff = weekDiffFrom(targetWeek, r.week)
      return diff >= 0 && diff < recentWindow
    })
    const memberById = {}
    members.forEach((m) => { memberById[m.id] = m })

    const groupedByMember = {}
    recentRows.forEach((r) => {
      if (!groupedByMember[r.member_id]) groupedByMember[r.member_id] = []
      groupedByMember[r.member_id].push(r)
    })

    const memberRates = members.map((m) => {
      const rows = groupedByMember[m.id] || []
      const presentCnt = rows.filter((r) => r.status === 'present').length
      const checkedCnt = rows.length
      const rate = checkedCnt > 0 ? Math.round((presentCnt / checkedCnt) * 1000) / 10 : 0
      return {
        member_id: m.id,
        name: m.name,
        checked: checkedCnt,
        present: presentCnt,
        rate,
      }
    }).filter((r) => r.checked > 0)

    const topAttendance = memberRates
      .slice()
      .sort((a, b) => (b.rate - a.rate) || (b.checked - a.checked) || String(a.name).localeCompare(String(b.name), 'ko'))
      .slice(0, 5)

    const bottomAttendance = memberRates
      .slice()
      .sort((a, b) => (a.rate - b.rate) || (b.checked - a.checked) || String(a.name).localeCompare(String(b.name), 'ko'))
      .slice(0, 5)

    // 최근 주차 순서 생성
    const recentWeeks = Array.from({ length: recentWindow }, (_, i) => {
      const d = new Date(`${targetWeek}T00:00:00`)
      d.setDate(d.getDate() - i * 7)
      return ymd(d)
    })

    const streakAbsentees = members.map((m) => {
      const rows = groupedByMember[m.id] || []
      const byWeek = {}
      rows.forEach((r) => { byWeek[r.week] = r.status })
      let streak = 0
      for (const w of recentWeeks) {
        const s = byWeek[w]
        if (s === 'absent' || s === 'excused') streak += 1
        else break
      }
      return { member_id: m.id, name: m.name, streak_weeks: streak }
    }).filter((r) => r.streak_weeks >= 2)
      .sort((a, b) => b.streak_weeks - a.streak_weeks)
      .slice(0, 10)

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
          week_tracks: weekTracks,
          month_tracks: monthTracks,
          year_tracks: yearTracks,
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
          member_attendance: {
            recent_window_weeks: recentWindow,
            top: topAttendance,
            bottom: bottomAttendance,
            streak_absentees: streakAbsentees,
          }
        },
      }
    })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message })
  }
}
