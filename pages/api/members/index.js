import { supabase } from '../../../lib/supabase'

const LEADER_SECRET = process.env.LEADER_API_SECRET || process.env.NEXT_PUBLIC_LEADER_SECRET || 'wordlife-leader-2025'
const NOT_FOUND_CODE = 'PGRST116'

function normalizeName(name) {
  return String(name || '').trim()
}

function makeManualDeviceId(name) {
  const base = normalizeName(name).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_가-힣]/g, '')
  const suffix = Math.random().toString(36).slice(2, 8)
  return `manual_${base || 'member'}_${Date.now().toString(36)}_${suffix}`
}

async function syncDeviceIdInGroups({ oldDeviceId, newDeviceId, memberName }) {
  if (!oldDeviceId || !newDeviceId || oldDeviceId === newDeviceId) return

  const { data: groupRows, error: groupsError } = await supabase
    .from('cell_groups')
    .select('week,groups')
  if (groupsError) throw groupsError

  for (const row of groupRows || []) {
    const parsed = typeof row.groups === 'string' ? JSON.parse(row.groups) : (row.groups || [])
    let changed = false

    const nextGroups = (Array.isArray(parsed) ? parsed : []).map(group => {
      const next = { ...group }

      if (next?.leader?.device_id === oldDeviceId) {
        next.leader = { ...next.leader, device_id: newDeviceId, name: memberName || next.leader.name }
        changed = true
      }

      const members = Array.isArray(next.members) ? next.members : []
      next.members = members.map(m => {
        if (m?.device_id !== oldDeviceId) return m
        changed = true
        return { ...m, device_id: newDeviceId, name: memberName || m.name }
      })
      return next
    })

    if (changed) {
      const { error: updateError } = await supabase
        .from('cell_groups')
        .update({ groups: nextGroups })
        .eq('week', row.week)
      if (updateError) throw updateError
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET — 멤버 조회
  // ?all=true : 전체 등록 멤버 (한 번이라도 접속한 전체)
  // 기본     : 현재 접속 중 (last_seen 30분 이내)
  if (req.method === 'GET') {
    const { all } = req.query
    try {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      const q = supabase.from('members').select('id,device_id,name,week,service,last_seen,created_at')
      const query = all === 'true' ? q : q.gte('last_seen', since)
      const { data, error } = await query.order('name', { ascending: true })
      if (error) throw error
      return res.status(200).json({ ok: true, data })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  // POST — 멤버 등록 (이름 + device_id)
  if (req.method === 'POST') {
    const { device_id, name, week, service } = req.body
    const normalized = normalizeName(name)
    if (!device_id || !normalized) return res.status(400).json({ ok: false, error: 'device_id, name 필수' })
    try {
      const now = new Date().toISOString()
      let data

      // 동일 이름이 이미 있으면 기존 회원으로 간주하고 device_id를 새 기기로 재연결
      const { data: existingByName, error: findByNameError } = await supabase
        .from('members')
        .select('id,device_id,name,week,service,last_seen,created_at')
        .eq('name', normalized)
        .single()
      if (findByNameError && findByNameError.code !== NOT_FOUND_CODE) throw findByNameError

      if (existingByName?.id) {
        const oldDeviceId = existingByName.device_id
        const { data: updated, error: updateError } = await supabase
          .from('members')
          .update({ device_id, name: normalized, week: week || null, service: service || null, last_seen: now })
          .eq('id', existingByName.id)
          .select('id,device_id,name,week,service,last_seen,created_at')
          .single()
        if (updateError) throw updateError
        data = updated
        await syncDeviceIdInGroups({ oldDeviceId, newDeviceId: device_id, memberName: normalized })
      } else {
        const { data: created, error } = await supabase
          .from('members')
          .upsert({ device_id, name: normalized, week: week || null, service: service || null, last_seen: now },
            { onConflict: 'device_id' })
          .select('id,device_id,name,week,service,last_seen,created_at')
          .single()
        if (error) throw error
        data = created
      }

      return res.status(200).json({ ok: true, data })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  // PATCH — last_seen 업데이트 (heartbeat)
  if (req.method === 'PATCH') {
    const { action, device_id, week, service, name } = req.body

    // 리더 전용 회원 수동 추가 (이름 기준)
    if (action === 'admin_add') {
      const auth = req.headers.authorization || ''
      if (auth !== `Bearer ${LEADER_SECRET}`) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' })
      }
      const normalized = normalizeName(name)
      if (!normalized) return res.status(400).json({ ok: false, error: 'name 필수' })

      try {
        const { data: existingByName, error: findByNameError } = await supabase
          .from('members')
          .select('id,device_id,name,week,service,last_seen,created_at')
          .eq('name', normalized)
          .single()
        if (findByNameError && findByNameError.code !== NOT_FOUND_CODE) throw findByNameError

        if (existingByName?.id) {
          return res.status(200).json({ ok: true, data: existingByName, created: false })
        }

        const manualDeviceId = makeManualDeviceId(normalized)
        const { data: created, error: createError } = await supabase
          .from('members')
          .insert({ device_id: manualDeviceId, name: normalized, week: week || null, service: service || null, last_seen: null })
          .select('id,device_id,name,week,service,last_seen,created_at')
          .single()
        if (createError) throw createError

        return res.status(200).json({ ok: true, data: created, created: true })
      } catch (e) {
        return res.status(500).json({ ok: false, error: e.message })
      }
    }

    // 리더 전용 회원 정보 수정
    if (action === 'admin_update') {
      const auth = req.headers.authorization || ''
      if (auth !== `Bearer ${LEADER_SECRET}`) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' })
      }
      if (!device_id) return res.status(400).json({ ok: false, error: 'device_id 필수' })

      const updates = {}
      if (typeof name === 'string') updates.name = name.trim()
      if (!Object.keys(updates).length) {
        return res.status(400).json({ ok: false, error: '수정할 필드가 없어요.' })
      }
      if ('name' in updates && !updates.name) {
        return res.status(400).json({ ok: false, error: '이름은 비워둘 수 없어요.' })
      }

      try {
        const { data, error } = await supabase
          .from('members')
          .update(updates)
          .eq('device_id', device_id)
          .select('id,device_id,name,week,service,last_seen,created_at')
          .single()
        if (error) throw error
        return res.status(200).json({ ok: true, data })
      } catch(e) {
        return res.status(500).json({ ok: false, error: e.message })
      }
    }

    if (!device_id) return res.status(400).json({ ok: false, error: 'device_id 필수' })
    try {
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('members')
        .update({ last_seen: now, week: week||null, service: service||null })
        .eq('device_id', device_id)
        .select('id,device_id,name')
        .maybeSingle()
      if (error) throw error
      if (data?.device_id) return res.status(200).json({ ok: true, data })

      // 다른 브라우저/기기에서 동일 이름으로 heartbeat 온 경우 기존 회원을 현재 기기로 재연결
      const normalized = normalizeName(name)
      if (normalized) {
        const { data: existingByName, error: findByNameError } = await supabase
          .from('members')
          .select('id,device_id,name')
          .eq('name', normalized)
          .single()
        if (findByNameError && findByNameError.code !== NOT_FOUND_CODE) throw findByNameError

        if (existingByName?.id) {
          const oldDeviceId = existingByName.device_id
          const { data: relinked, error: relinkError } = await supabase
            .from('members')
            .update({ device_id, name: normalized, last_seen: now, week: week || null, service: service || null })
            .eq('id', existingByName.id)
            .select('id,device_id,name')
            .single()
          if (relinkError) throw relinkError
          await syncDeviceIdInGroups({ oldDeviceId, newDeviceId: device_id, memberName: normalized })
          return res.status(200).json({ ok: true, data: relinked, relinked_by_name: true })
        }
      }

      return res.status(404).json({ ok: false, error: 'member_not_found', needs_register: true })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }

  // DELETE — 리더 전용 회원 삭제
  if (req.method === 'DELETE') {
    const auth = req.headers.authorization || ''
    if (auth !== `Bearer ${LEADER_SECRET}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' })
    }
    const { device_id } = req.body || {}
    if (!device_id) return res.status(400).json({ ok: false, error: 'device_id 필수' })
    try {
      const { error } = await supabase
        .from('members')
        .delete()
        .eq('device_id', device_id)
      if (error) throw error

      // 삭제된 디바이스가 기존 조편성/리더 정보에 남지 않도록 전체 주차에서 정리
      const { data: groupRows, error: groupsError } = await supabase
        .from('cell_groups')
        .select('week,groups')
      if (groupsError) throw groupsError

      for (const row of groupRows || []) {
        const parsed = typeof row.groups === 'string' ? JSON.parse(row.groups) : (row.groups || [])
        let changed = false
        const nextGroups = (Array.isArray(parsed) ? parsed : []).map(group => {
          const members = Array.isArray(group.members) ? group.members : []
          const filteredMembers = members.filter(m => m?.device_id !== device_id)
          const leaderDeleted = group?.leader?.device_id === device_id
          if (filteredMembers.length !== members.length || leaderDeleted) changed = true
          return {
            ...group,
            members: filteredMembers,
            leader: leaderDeleted ? null : group.leader,
          }
        })
        if (changed) {
          const { error: updateError } = await supabase
            .from('cell_groups')
            .update({ groups: nextGroups })
            .eq('week', row.week)
          if (updateError) throw updateError
        }
      }

      return res.status(200).json({ ok: true })
    } catch(e) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
