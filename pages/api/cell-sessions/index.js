import { supabase } from '../../../lib/supabase'

const TREE_GROUP_NAMES = [
  '감람나무',
  '백향목',
  '무화과나무',
  '포도나무',
  '종려나무',
  '살구나무',
  '떡갈나무',
  '향나무',
  '버드나무',
  '대추나무',
]

function getTreeGroupName(groupNo) {
  const index = Math.max(Number(groupNo || 1) - 1, 0)
  const base = TREE_GROUP_NAMES[index % TREE_GROUP_NAMES.length]
  const round = Math.floor(index / TREE_GROUP_NAMES.length)
  return round === 0 ? base : `${base} ${round + 1}`
}

function getTreeGroupLabel(groupNo) {
  return `${groupNo}조 - ${getTreeGroupName(groupNo)}`
}

async function isLeaderForGroup({ week, group_no, device_id }) {
  if (!week || !group_no || !device_id) return false

  const { data, error } = await supabase
    .from('cell_groups')
    .select('groups')
    .eq('week', week)
    .single()
  if (error || !data) return false

  const groups = typeof data.groups === 'string' ? JSON.parse(data.groups) : (data.groups || [])
  const group = groups.find(g => String(g.group_no) === String(group_no))
  return !!group && group.leader?.device_id === device_id
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET — 활성 세션 조회
  // ?group_no=1 → 특정 조 세션
  // ?all=true   → 전체 활성 세션 목록 (리더 대시보드용)
  // 기본        → 가장 최근 활성 세션 1개
  if (req.method === 'GET') {
    const { group_no, all, week } = req.query
    try {
      if (all === 'true') {
        let query = supabase
          .from('cell_sessions')
          .select('*')
          .order('started_at', { ascending: true })
        if (week) {
          query = query.eq('week', week)
        } else {
          const todayStart = new Date()
          todayStart.setHours(0,0,0,0)
          query = query.gte('started_at', todayStart.toISOString())
        }
        const { data, error } = await query
        if (error) throw error
        // group_no별 가장 최신 세션만 (중복 제거)
        const latest = {}
        ;(data || []).forEach(s => {
          const key = String(s.group_no)
          if (!latest[key] || s.started_at > latest[key].started_at) latest[key] = s
        })
        return res.status(200).json({ ok: true, data: Object.values(latest) })
      }

      if (group_no) {
        // 특정 조의 가장 최근 세션 조회 (종료된 세션 포함)
        const { data, error } = await supabase
          .from('cell_sessions')
          .select('*')
          .eq('group_no', String(group_no))
          .order('started_at', { ascending: false })
          .limit(1)
          .single()
        if (error && error.code === 'PGRST116') return res.status(200).json({ ok: true, data: null })
        if (error) throw error
        return res.status(200).json({ ok: true, data })
      }

      // 기본: 가장 최근 활성 세션
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

  // POST — 조별 세션 시작
  // body: { week, service, group_no, group_name, sermon_week, sermon_service }
  if (req.method === 'POST') {
    const secret = req.headers['authorization']?.replace('Bearer ', '')
    const { week, service, group_no, group_name, sermon_week, sermon_service, device_id } = req.body
    if (!week || !group_no) return res.status(400).json({ ok: false, error: 'week, group_no 필수' })
    try {
      const authorized = secret === process.env.LEADER_API_SECRET
        || await isLeaderForGroup({ week, group_no, device_id })
      if (!authorized) return res.status(401).json({ ok: false, error: '시작 권한이 없어요.' })

      // 같은 조의 기존 활성 세션 종료
      await supabase
        .from('cell_sessions')
        .update({ is_active: false })
        .eq('is_active', true)
        .eq('group_no', String(group_no))

      // 새 세션 생성
      const { data, error } = await supabase
        .from('cell_sessions')
        .insert({
          week,
          service: service || 'all',
          group_no: String(group_no),
          group_name: group_name || getTreeGroupLabel(group_no),
          sermon_week: sermon_week || week,
          sermon_service: sermon_service || 'morning',
          is_active: true,
          notice: '',
          started_at: new Date().toISOString()
        })
        .select()
        .single()
      if (error) throw error
      return res.status(200).json({ ok: true, data })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  // PATCH — 세션 업데이트
  // action=notice  : 공지 전송 (리더 도구, group_no 지정 or 전체)
  // action=end     : 조 세션 종료 (셀 리더)
  if (req.method === 'PATCH') {
    const secret = req.headers['authorization']?.replace('Bearer ', '')
    const { action, week, group_no, notice, broadcast, device_id } = req.body
    try {
      if (action === 'notice') {
        if (secret !== process.env.LEADER_API_SECRET) {
          return res.status(401).json({ ok: false, error: '인증 실패' })
        }
        // 공지: 특정 조 or 전체 활성 세션에 notice 업데이트
        let q = supabase.from('cell_sessions').update({ notice: notice || '' }).eq('is_active', true)
        if (!broadcast && group_no) q = q.eq('group_no', String(group_no))
        const { error } = await q
        if (error) throw error
        return res.status(200).json({ ok: true })
      }

      if (action === 'end') {
        // 조 세션 종료
        if (!group_no) return res.status(400).json({ ok: false, error: 'group_no 필수' })
        const authorized = secret === process.env.LEADER_API_SECRET
          || await isLeaderForGroup({ week, group_no, device_id })
        if (!authorized) return res.status(401).json({ ok: false, error: '종료 권한이 없어요.' })

        const { error } = await supabase
          .from('cell_sessions')
          .update({ is_active: false, ended_at: new Date().toISOString() })
          .eq('is_active', true)
          .eq('group_no', String(group_no))
        if (error) throw error
        return res.status(200).json({ ok: true })
      }

      return res.status(400).json({ ok: false, error: '알 수 없는 action' })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  // DELETE — 전체 세션 종료 (리더 도구)
  if (req.method === 'DELETE') {
    const secret = req.headers['authorization']?.replace('Bearer ', '')
    const { group_no } = req.query
    try {
      if (secret !== process.env.LEADER_API_SECRET) {
        return res.status(401).json({ ok: false, error: '인증 실패' })
      }
      let q = supabase.from('cell_sessions').update({ is_active: false, ended_at: new Date().toISOString() }).eq('is_active', true)
      if (group_no) q = q.eq('group_no', String(group_no))
      const { error } = await q
      if (error) throw error
      return res.status(200).json({ ok: true })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
