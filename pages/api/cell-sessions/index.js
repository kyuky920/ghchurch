import { supabase } from '../../../lib/supabase'

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
    const { group_no, all } = req.query
    try {
      if (all === 'true') {
        // 리더 대시보드: 전체 활성 세션 목록
        const { data, error } = await supabase
          .from('cell_sessions')
          .select('*')
          .eq('is_active', true)
          .order('started_at', { ascending: true })
        if (error) throw error
        return res.status(200).json({ ok: true, data: data || [] })
      }

      if (group_no) {
        // 특정 조 세션 조회
        const { data, error } = await supabase
          .from('cell_sessions')
          .select('*')
          .eq('is_active', true)
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
    const { week, service, group_no, group_name, sermon_week, sermon_service } = req.body
    if (!week || !group_no) return res.status(400).json({ ok: false, error: 'week, group_no 필수' })
    try {
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
          group_name: group_name || `${group_no}조`,
          sermon_week: sermon_week || week,
          sermon_service: sermon_service || 'morning',
          is_active: true,
          ended: false,
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
    const { action, group_no, notice, broadcast } = req.body
    try {
      if (action === 'notice') {
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
        const { error } = await supabase
          .from('cell_sessions')
          .update({ is_active: false, ended: true, ended_at: new Date().toISOString() })
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
    const { group_no } = req.query
    try {
      let q = supabase.from('cell_sessions').update({ is_active: false, ended: true, ended_at: new Date().toISOString() }).eq('is_active', true)
      if (group_no) q = q.eq('group_no', String(group_no))
      const { error } = await q
      if (error) throw error
      return res.status(200).json({ ok: true })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
