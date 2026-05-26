import { supabase } from '../../../../lib/supabase'

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function mapMissionRole(role) {
  if (role === 'admin') return 'admin'
  if (role === 'leader') return 'sub_admin'
  return 'member'
}

async function getDefaultMissionGroup() {
  const { data, error } = await supabase
    .from('mission_groups')
    .select('id,name')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (data) return data

  const created = await supabase
    .from('mission_groups')
    .insert({ name: '광흥교회 선교회', description: '자동 생성된 기본 선교회 그룹' })
    .select('id,name')
    .single()

  if (created.error) throw created.error
  return created.data
}

async function loadOrganizations(memberId) {
  const rel = await supabase
    .from('member_organizations')
    .select('organization_id,role_in_org')
    .eq('member_id', memberId)
    .eq('status', 'active')

  if (rel.error) throw rel.error
  if (!rel.data?.length) return []

  const orgIds = rel.data.map((item) => item.organization_id)
  const orgs = await supabase
    .from('organizations')
    .select('id,name,category_id')
    .in('id', orgIds)

  if (orgs.error) throw orgs.error

  const categoryIds = [...new Set((orgs.data || []).map((item) => item.category_id).filter(Boolean))]
  const categories = categoryIds.length
    ? await supabase.from('organization_categories').select('id,name').in('id', categoryIds)
    : { data: [], error: null }

  if (categories.error) throw categories.error

  const orgMap = new Map((orgs.data || []).map((item) => [item.id, item]))
  const categoryMap = new Map((categories.data || []).map((item) => [item.id, item.name]))

  return rel.data
    .map((item) => {
      const org = orgMap.get(item.organization_id)
      if (!org) return null
      return {
        category: categoryMap.get(org.category_id) || '기타',
        name: org.name,
        roleInOrg: item.role_in_org || '구성원',
      }
    })
    .filter(Boolean)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const name = String(req.body?.name || '').trim()
    const phone = String(req.body?.phone || '').trim()
    const phoneNormalized = normalizePhone(phone)

    if (!name || !phoneNormalized) {
      return res.status(400).json({ error: '이름과 전화번호를 입력해 주세요.' })
    }

    let member = null
    const existing = await supabase
      .from('app_members')
      .select('id,name,phone,phone_normalized,birth_year,note,role')
      .eq('phone_normalized', phoneNormalized)
      .maybeSingle()

    if (existing.error) throw existing.error

    if (existing.data) {
      if (existing.data.name !== name || existing.data.phone !== phone) {
        const updated = await supabase
          .from('app_members')
          .update({ name, phone })
          .eq('id', existing.data.id)
          .select('id,name,phone,phone_normalized,birth_year,note,role')
          .single()
        if (updated.error) throw updated.error
        member = updated.data
      } else {
        member = existing.data
      }
    } else {
      const created = await supabase
        .from('app_members')
        .insert({
          name,
          phone,
          phone_normalized: phoneNormalized,
          role: 'member',
        })
        .select('id,name,phone,phone_normalized,birth_year,note,role')
        .single()
      if (created.error) throw created.error
      member = created.data
    }

    const missionGroup = await getDefaultMissionGroup()
    const membership = await supabase
      .from('mission_group_members')
      .select('id,member_status,mission_role')
      .eq('mission_group_id', missionGroup.id)
      .eq('member_id', member.id)
      .maybeSingle()

    if (membership.error) throw membership.error

    let missionMembership = membership.data
    if (!missionMembership) {
      const createdMembership = await supabase
        .from('mission_group_members')
        .insert({
          mission_group_id: missionGroup.id,
          member_id: member.id,
          member_status: 'member',
          mission_role: mapMissionRole(member.role),
        })
        .select('id,member_status,mission_role')
        .single()

      if (createdMembership.error) throw createdMembership.error
      missionMembership = createdMembership.data
    }

    const organizations = await loadOrganizations(member.id)

    return res.status(200).json({
      member: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        role: member.role,
        missionRole: missionMembership?.mission_role || 'member',
        memberStatus: missionMembership?.member_status || 'member',
        organizations,
        missionGroupId: missionGroup.id,
        missionGroupName: missionGroup.name,
      },
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || '로그인 처리 중 오류가 발생했습니다.' })
  }
}
