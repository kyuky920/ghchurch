import { supabase } from '../../../../lib/supabase'

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function isAdminRole(role) {
  return role === 'leader' || role === 'admin'
}

async function getActorContext(actorId) {
  const memberRes = await supabase
    .from('app_members')
    .select('id,role')
    .eq('id', actorId)
    .maybeSingle()

  if (memberRes.error) throw memberRes.error
  if (!memberRes.data || !isAdminRole(memberRes.data.role)) {
    const error = new Error('관리 권한이 없습니다.')
    error.statusCode = 403
    throw error
  }

  const missionRes = await supabase
    .from('mission_group_members')
    .select('mission_group_id')
    .eq('member_id', actorId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (missionRes.error) throw missionRes.error

  let missionGroupId = missionRes.data?.mission_group_id || null
  if (!missionGroupId) {
    const groupRes = await supabase
      .from('mission_groups')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (groupRes.error) throw groupRes.error
    missionGroupId = groupRes.data?.id || null
  }

  if (!missionGroupId) {
    const error = new Error('선교회 그룹이 없습니다.')
    error.statusCode = 404
    throw error
  }

  return { actor: memberRes.data, missionGroupId }
}

async function loadOrganizationsCatalog() {
  const [categoriesRes, organizationsRes] = await Promise.all([
    supabase.from('organization_categories').select('id,name,sort_order').order('sort_order', { ascending: true }),
    supabase.from('organizations').select('id,name,category_id,sort_order,is_active').eq('is_active', true).order('sort_order', { ascending: true }),
  ])

  if (categoriesRes.error) throw categoriesRes.error
  if (organizationsRes.error) throw organizationsRes.error

  return (categoriesRes.data || []).map((category) => ({
    id: category.id,
    name: category.name,
    organizations: (organizationsRes.data || [])
      .filter((org) => org.category_id === category.id)
      .map((org) => ({ id: org.id, name: org.name })),
  }))
}

async function loadMissionMembers(missionGroupId) {
  const missionMembersRes = await supabase
    .from('mission_group_members')
    .select('member_id,member_status,mission_role,note,app_members(id,name,phone,birth_year,note,role)')
    .eq('mission_group_id', missionGroupId)
    .order('created_at', { ascending: false })

  if (missionMembersRes.error) throw missionMembersRes.error

  const memberIds = (missionMembersRes.data || []).map((row) => row.member_id)
  const memberOrgsRes = memberIds.length
    ? await supabase
        .from('member_organizations')
        .select('member_id,organization_id,role_in_org')
        .in('member_id', memberIds)
        .eq('status', 'active')
    : { data: [], error: null }

  if (memberOrgsRes.error) throw memberOrgsRes.error

  const organizationIds = [...new Set((memberOrgsRes.data || []).map((row) => row.organization_id).filter(Boolean))]
  const organizationsRes = organizationIds.length
    ? await supabase
        .from('organizations')
        .select('id,name,category_id')
        .in('id', organizationIds)
    : { data: [], error: null }

  if (organizationsRes.error) throw organizationsRes.error

  const categoryIds = [...new Set((organizationsRes.data || []).map((row) => row.category_id).filter(Boolean))]
  const categoriesRes = categoryIds.length
    ? await supabase
        .from('organization_categories')
        .select('id,name')
        .in('id', categoryIds)
    : { data: [], error: null }

  if (categoriesRes.error) throw categoriesRes.error

  const organizationMap = new Map((organizationsRes.data || []).map((row) => [row.id, row]))
  const categoryMap = new Map((categoriesRes.data || []).map((row) => [row.id, row.name]))

  const orgMap = new Map()
  for (const row of memberOrgsRes.data || []) {
    if (!orgMap.has(row.member_id)) orgMap.set(row.member_id, [])
    const org = organizationMap.get(row.organization_id)
    orgMap.get(row.member_id).push({
      organizationId: row.organization_id,
      name: org?.name || '',
      category: categoryMap.get(org?.category_id) || '',
      roleInOrg: row.role_in_org || '',
    })
  }

  return (missionMembersRes.data || []).map((row) => ({
    id: row.member_id,
    name: row.app_members?.name || '',
    phone: row.app_members?.phone || '',
    birthYear: row.app_members?.birth_year || '',
    note: row.note || row.app_members?.note || '',
    role: row.app_members?.role || 'member',
    memberStatus: row.member_status || 'member',
    missionRole: row.mission_role || 'member',
    organizations: orgMap.get(row.member_id) || [],
  }))
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const actorId = String(req.query?.actorId || '')
      if (!actorId) return res.status(400).json({ error: 'actorId가 필요합니다.' })

      const { missionGroupId } = await getActorContext(actorId)
      const [members, organizationCatalog] = await Promise.all([
        loadMissionMembers(missionGroupId),
        loadOrganizationsCatalog(),
      ])

      return res.status(200).json({ members, organizationCatalog, missionGroupId })
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET,POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const {
      actorId,
      memberId,
      name,
      phone,
      birthYear,
      note,
      role,
      memberStatus,
      missionRole,
      adminPassword,
      clearAdminPassword,
      organizations,
    } = req.body || {}

    if (!actorId || !memberId) {
      return res.status(400).json({ error: 'actorId와 memberId가 필요합니다.' })
    }

    const { missionGroupId } = await getActorContext(actorId)

    const existingRes = await supabase
      .from('app_members')
      .select('id,phone,admin_password_hash')
      .eq('id', memberId)
      .maybeSingle()

    if (existingRes.error) throw existingRes.error
    if (!existingRes.data) return res.status(404).json({ error: '수정할 회원을 찾을 수 없습니다.' })

    const normalized = normalizePhone(phone)
    const nextPhone = normalized ? String(phone || '').trim() : (existingRes.data.phone || `pending-${memberId}`)
    const nextPhoneNormalized = normalized || normalizePhone(existingRes.data.phone) || `pending-${memberId}`

    const memberUpdate = {
      name: String(name || '').trim(),
      phone: nextPhone,
      phone_normalized: nextPhoneNormalized,
      birth_year: birthYear ? Number(birthYear) : null,
      note: String(note || '').trim(),
      role: role || 'member',
    }

    if (clearAdminPassword) {
      memberUpdate.admin_password_hash = null
    } else if (typeof adminPassword === 'string' && adminPassword.trim()) {
      memberUpdate.admin_password_hash = adminPassword.trim()
    }

    const memberUpdateRes = await supabase
      .from('app_members')
      .update(memberUpdate)
      .eq('id', memberId)

    if (memberUpdateRes.error) throw memberUpdateRes.error

    const missionMembershipRes = await supabase
      .from('mission_group_members')
      .upsert({
        mission_group_id: missionGroupId,
        member_id: memberId,
        member_status: memberStatus || 'member',
        mission_role: missionRole || 'member',
        note: String(note || '').trim(),
      }, { onConflict: 'mission_group_id,member_id' })

    if (missionMembershipRes.error) throw missionMembershipRes.error

    const deleteOrgRes = await supabase
      .from('member_organizations')
      .delete()
      .eq('member_id', memberId)

    if (deleteOrgRes.error) throw deleteOrgRes.error

    const rows = Array.isArray(organizations)
      ? organizations
          .filter((item) => item?.organizationId)
          .map((item) => ({
            member_id: memberId,
            organization_id: item.organizationId,
            role_in_org: String(item.roleInOrg || '').trim() || null,
            status: 'active',
          }))
      : []

    if (rows.length) {
      const insertOrgRes = await supabase.from('member_organizations').insert(rows)
      if (insertOrgRes.error) throw insertOrgRes.error
    }

    const [members, organizationCatalog] = await Promise.all([
      loadMissionMembers(missionGroupId),
      loadOrganizationsCatalog(),
    ])

    return res.status(200).json({ ok: true, members, organizationCatalog })
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || '회원 관리 중 오류가 발생했습니다.' })
  }
}
