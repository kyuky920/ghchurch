import { supabase } from '../../../../lib/supabase'

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '')
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

async function loadMissionGroups(memberId) {
  const membershipRes = await supabase
    .from('mission_group_members')
    .select('mission_group_id,member_status,mission_role,mission_groups(id,name,description)')
    .eq('member_id', memberId)
    .order('created_at', { ascending: true })

  if (membershipRes.error) throw membershipRes.error

  return (membershipRes.data || [])
    .filter((row) => row.mission_groups?.id)
    .map((row) => ({
      id: row.mission_groups.id,
      name: row.mission_groups.name,
      description: row.mission_groups.description || '',
      missionRole: row.mission_role || 'member',
      memberStatus: row.member_status || 'member',
    }))
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

    const [organizations, missionGroups] = await Promise.all([
      loadOrganizations(member.id),
      loadMissionGroups(member.id),
    ])
    const currentMissionGroup = missionGroups[0] || null

    return res.status(200).json({
      member: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        role: member.role,
        missionRole: currentMissionGroup?.missionRole || null,
        memberStatus: currentMissionGroup?.memberStatus || null,
        organizations,
        missionGroups,
        currentMissionGroupId: currentMissionGroup?.id || null,
        missionGroupId: currentMissionGroup?.id || null,
        missionGroupName: currentMissionGroup?.name || '',
      },
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || '로그인 처리 중 오류가 발생했습니다.' })
  }
}
