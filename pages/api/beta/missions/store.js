import { supabase } from '../../../../lib/supabase'

function mapMemberStatus(status) {
  return status === 'non_member' ? '비회원' : '회원'
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function mapAnswer(answer) {
  if (answer === 'yes') return '참석'
  if (answer === 'no') return '불참'
  if (answer === 'maybe') return '미정'
  return answer || ''
}

function mapAnswerToDb(choice) {
  if (choice === '참석') return 'yes'
  if (choice === '불참') return 'no'
  if (choice === '미정') return 'maybe'
  return String(choice || '')
}

function isManager(role, missionRole) {
  return role === 'leader' || role === 'admin' || missionRole === 'sub_admin' || missionRole === 'admin'
}

async function getMissionContext(memberId) {
  const memberQuery = await supabase
    .from('app_members')
    .select('id,name,phone,role')
    .eq('id', memberId)
    .maybeSingle()

  if (memberQuery.error) throw memberQuery.error
  if (!memberQuery.data) {
    const error = new Error('회원을 찾을 수 없습니다.')
    error.statusCode = 404
    throw error
  }

  let membershipQuery = await supabase
    .from('mission_group_members')
    .select('mission_group_id,member_status,mission_role')
    .eq('member_id', memberId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (membershipQuery.error) throw membershipQuery.error

  let missionGroupId = membershipQuery.data?.mission_group_id || null
  if (!missionGroupId) {
    const groupQuery = await supabase
      .from('mission_groups')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (groupQuery.error) throw groupQuery.error
    missionGroupId = groupQuery.data?.id || null
  }

  if (!missionGroupId) {
    const error = new Error('선교회 그룹이 없습니다.')
    error.statusCode = 404
    throw error
  }

  return {
    member: memberQuery.data,
    missionGroupId,
    missionRole: membershipQuery.data?.mission_role || 'member',
    memberStatus: membershipQuery.data?.member_status || 'member',
  }
}

async function buildStore(missionGroupId) {
  const [
    membersRes,
    duesSettingsRes,
    duesPaymentsRes,
    financeRes,
    biblePlansRes,
    bibleLogsRes,
    schedulesRes,
    votesRes,
    voteOptionsRes,
    voteResponsesRes,
    documentsRes,
  ] = await Promise.all([
    supabase
      .from('mission_group_members')
      .select('member_id,member_status,mission_role,note,app_members(id,name,birth_year,note,phone,role)')
      .eq('mission_group_id', missionGroupId)
      .order('created_at', { ascending: false }),
    supabase
      .from('mission_dues_settings')
      .select('month_key,amount,note')
      .eq('mission_group_id', missionGroupId),
    supabase
      .from('mission_dues_payments')
      .select('member_id,month_key,amount,paid,note')
      .eq('mission_group_id', missionGroupId),
    supabase
      .from('mission_finance_entries')
      .select('id,entry_date,entry_type,category,amount,title,description')
      .eq('mission_group_id', missionGroupId)
      .order('entry_date', { ascending: false }),
    supabase
      .from('mission_bible_plans')
      .select('target_date,scripture_range,note')
      .eq('mission_group_id', missionGroupId),
    supabase
      .from('mission_bible_logs')
      .select('member_id,target_date,is_read,note')
      .eq('mission_group_id', missionGroupId),
    supabase
      .from('mission_schedules')
      .select('id,schedule_date,title,description,schedule_type')
      .eq('mission_group_id', missionGroupId)
      .order('schedule_date', { ascending: false }),
    supabase
      .from('mission_votes')
      .select('id,title,description,visibility,status,created_at')
      .eq('mission_group_id', missionGroupId)
      .order('created_at', { ascending: false }),
    supabase
      .from('mission_vote_options')
      .select('id,vote_id,label,sort_order')
      .order('sort_order', { ascending: true }),
    supabase
      .from('mission_vote_responses')
      .select('vote_id,member_id,answer,note'),
    supabase
      .from('mission_documents')
      .select('id,title,content,document_type,created_at')
      .eq('mission_group_id', missionGroupId)
      .order('created_at', { ascending: false }),
  ])

  for (const result of [
    membersRes,
    duesSettingsRes,
    duesPaymentsRes,
    financeRes,
    biblePlansRes,
    bibleLogsRes,
    schedulesRes,
    votesRes,
    voteOptionsRes,
    voteResponsesRes,
    documentsRes,
  ]) {
    if (result.error) throw result.error
  }

  const members = (membersRes.data || []).map((row) => ({
    id: row.member_id,
    status: mapMemberStatus(row.member_status),
    missionRole: row.mission_role,
    name: row.app_members?.name || '이름 없음',
    birthYear: row.app_members?.birth_year || null,
    note: row.note || row.app_members?.note || '',
    phone: row.app_members?.phone || '',
    role: row.app_members?.role || 'member',
  }))

  const duesSettings = Object.fromEntries(
    (duesSettingsRes.data || []).map((row) => [row.month_key, { amount: row.amount, memo: row.note || '' }])
  )

  const duesPayments = Object.fromEntries(
    (duesPaymentsRes.data || []).map((row) => [
      `${row.month_key}:${row.member_id}`,
      { paid: row.paid, amount: row.amount, memo: row.note || '' },
    ])
  )

  const financeEntries = (financeRes.data || []).map((row) => ({
    id: row.id,
    date: row.entry_date,
    kind: row.entry_type,
    category: row.category,
    amount: row.amount,
    title: row.title || row.category,
    note: row.description || '',
  }))

  const biblePlans = Object.fromEntries(
    (biblePlansRes.data || []).map((row) => [row.target_date, { range: row.scripture_range, memo: row.note || '' }])
  )

  const bibleLogs = Object.fromEntries(
    (bibleLogsRes.data || []).map((row) => [
      `${row.member_id}:${row.target_date}`,
      { done: row.is_read, memo: row.note || '' },
    ])
  )

  const schedules = (schedulesRes.data || []).map((row) => ({
    id: row.id,
    date: row.schedule_date,
    title: row.title,
    detail: row.description || '',
    type: row.schedule_type,
  }))

  const responsesByVote = new Map()
  for (const row of voteResponsesRes.data || []) {
    if (!responsesByVote.has(row.vote_id)) responsesByVote.set(row.vote_id, {})
    responsesByVote.get(row.vote_id)[row.member_id] = {
      choice: mapAnswer(row.answer),
      note: row.note || '',
    }
  }

  const optionsByVote = new Map()
  for (const row of voteOptionsRes.data || []) {
    if (!optionsByVote.has(row.vote_id)) optionsByVote.set(row.vote_id, [])
    optionsByVote.get(row.vote_id).push({
      id: row.id,
      label: row.label,
      sortOrder: row.sort_order || 0,
    })
  }

  const votes = (votesRes.data || []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description || '',
    visibility: row.visibility,
    status: row.status,
    createdAt: row.created_at?.slice(0, 10) || '',
    options: optionsByVote.get(row.id)?.sort((a, b) => a.sortOrder - b.sortOrder) || [
      { id: `${row.id}-yes`, label: '참석', sortOrder: 0 },
      { id: `${row.id}-no`, label: '불참', sortOrder: 1 },
    ],
    responses: responsesByVote.get(row.id) || {},
  }))

  const documents = (documentsRes.data || []).map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content || '',
    createdAt: row.created_at?.slice(0, 10) || '',
    type: row.document_type,
  }))

  return {
    members,
    duesSettings,
    duesPayments,
    financeEntries,
    biblePlans,
    bibleLogs,
    schedules,
    votes,
    documents,
  }
}

async function requireManage(memberId) {
  const context = await getMissionContext(memberId)
  if (!isManager(context.member.role, context.missionRole)) {
    const error = new Error('관리 권한이 없습니다.')
    error.statusCode = 403
    throw error
  }
  return context
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const memberId = String(req.query?.memberId || '')
      if (!memberId) {
        return res.status(400).json({ error: 'memberId가 필요합니다.' })
      }
      const context = await getMissionContext(memberId)
      const store = await buildStore(context.missionGroupId)
      return res.status(200).json({ store, missionGroupId: context.missionGroupId })
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET,POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const action = String(req.body?.action || '')
    const payload = req.body?.payload || {}

    if (!payload.actorId) {
      return res.status(400).json({ error: 'actorId가 필요합니다.' })
    }

    if (action === 'addMember') {
      const context = await requireManage(payload.actorId)
      const name = String(payload.name || '').trim()
      if (!name) return res.status(400).json({ error: '이름을 입력해 주세요.' })

      const normalizedPhone = normalizePhone(payload.phone)
      const tempToken = `pending-${Date.now()}`
      const phoneValue = normalizedPhone || tempToken
      const memberInsert = await supabase
        .from('app_members')
        .insert({
          name,
          phone: phoneValue,
          phone_normalized: phoneValue,
          birth_year: payload.birthYear ? Number(payload.birthYear) : null,
          note: String(payload.note || '').trim(),
          role: 'member',
        })
        .select('id')
        .single()

      if (memberInsert.error) throw memberInsert.error

      const membershipInsert = await supabase
        .from('mission_group_members')
        .insert({
          mission_group_id: context.missionGroupId,
          member_id: memberInsert.data.id,
          member_status: payload.status === '비회원' ? 'non_member' : 'member',
          mission_role: 'member',
          note: String(payload.note || '').trim(),
        })

      if (membershipInsert.error) throw membershipInsert.error
    } else if (action === 'setDuesSetting') {
      const context = await requireManage(payload.actorId)
      const upsert = await supabase
        .from('mission_dues_settings')
        .upsert({
          mission_group_id: context.missionGroupId,
          month_key: payload.month,
          amount: Number(payload.amount) || 0,
          note: String(payload.memo || ''),
          created_by: payload.actorId,
        }, { onConflict: 'mission_group_id,month_key' })
      if (upsert.error) throw upsert.error
    } else if (action === 'toggleDuesPayment') {
      const context = await requireManage(payload.actorId)
      const upsert = await supabase
        .from('mission_dues_payments')
        .upsert({
          mission_group_id: context.missionGroupId,
          member_id: payload.memberId,
          month_key: payload.month,
          amount: Number(payload.amount) || 0,
          paid: Boolean(payload.paid),
          paid_at: payload.paid ? new Date().toISOString() : null,
          note: String(payload.memo || ''),
          created_by: payload.actorId,
        }, { onConflict: 'mission_group_id,member_id,month_key' })
      if (upsert.error) throw upsert.error
    } else if (action === 'addFinanceEntry') {
      const context = await requireManage(payload.actorId)
      const insert = await supabase
        .from('mission_finance_entries')
        .insert({
          mission_group_id: context.missionGroupId,
          entry_date: payload.date,
          entry_type: payload.kind,
          category: payload.category,
          amount: Number(payload.amount) || 0,
          title: payload.title || payload.category,
          description: String(payload.note || ''),
          created_by: payload.actorId,
        })
      if (insert.error) throw insert.error
    } else if (action === 'upsertBiblePlan') {
      const context = await requireManage(payload.actorId)
      const upsert = await supabase
        .from('mission_bible_plans')
        .upsert({
          mission_group_id: context.missionGroupId,
          target_date: payload.day,
          scripture_range: String(payload.range || ''),
          note: String(payload.memo || ''),
          created_by: payload.actorId,
        }, { onConflict: 'mission_group_id,target_date' })
      if (upsert.error) throw upsert.error
    } else if (action === 'upsertBibleLog') {
      const context = await getMissionContext(payload.actorId)
      const upsert = await supabase
        .from('mission_bible_logs')
        .upsert({
          mission_group_id: context.missionGroupId,
          member_id: payload.actorId,
          target_date: payload.day,
          is_read: Boolean(payload.done),
          note: String(payload.memo || ''),
        }, { onConflict: 'mission_group_id,member_id,target_date' })
      if (upsert.error) throw upsert.error
    } else if (action === 'addSchedule') {
      const context = await requireManage(payload.actorId)
      const insert = await supabase
        .from('mission_schedules')
        .insert({
          mission_group_id: context.missionGroupId,
          schedule_date: payload.date,
          title: String(payload.title || '').trim(),
          description: String(payload.detail || '').trim(),
          schedule_type: payload.type,
          created_by: payload.actorId,
        })
      if (insert.error) throw insert.error
    } else if (action === 'addVote') {
      const context = await requireManage(payload.actorId)
      const insert = await supabase
        .from('mission_votes')
        .insert({
          mission_group_id: context.missionGroupId,
          title: String(payload.title || '').trim(),
          description: String(payload.description || '').trim(),
          visibility: payload.visibility || 'public',
          status: 'open',
          created_by: payload.actorId,
        })
        .select('id')
        .single()
      if (insert.error) throw insert.error

      const rawOptions = Array.isArray(payload.options) ? payload.options : []
      const normalizedOptions = rawOptions
        .map((item) => String(item || '').trim())
        .filter(Boolean)

      const finalOptions = normalizedOptions.length ? normalizedOptions : ['참석', '불참']
      const optionInsert = await supabase
        .from('mission_vote_options')
        .insert(
          finalOptions.map((label, index) => ({
            vote_id: insert.data.id,
            label,
            sort_order: index,
          }))
        )
      if (optionInsert.error) throw optionInsert.error
    } else if (action === 'respondVote') {
      const context = await getMissionContext(payload.actorId)
      const upsert = await supabase
        .from('mission_vote_responses')
        .upsert({
          vote_id: payload.voteId,
          member_id: payload.actorId,
          answer: mapAnswerToDb(payload.choice),
          note: String(payload.note || ''),
        }, { onConflict: 'vote_id,member_id' })
      if (upsert.error) throw upsert.error
    } else if (action === 'addDocument') {
      const context = await requireManage(payload.actorId)
      const insert = await supabase
        .from('mission_documents')
        .insert({
          mission_group_id: context.missionGroupId,
          title: String(payload.title || '').trim(),
          content: String(payload.content || '').trim(),
          document_type: payload.documentType || 'meeting_note',
          created_by: payload.actorId,
        })
      if (insert.error) throw insert.error
    } else {
      return res.status(400).json({ error: '지원하지 않는 action입니다.' })
    }

    const context = await getMissionContext(payload.actorId)
    const store = await buildStore(context.missionGroupId)
    return res.status(200).json({ ok: true, store })
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || '선교회 처리 중 오류가 발생했습니다.' })
  }
}
