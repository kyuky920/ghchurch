export const BETA_SESSION_KEY = 'gh_beta_member_session_v1'
export const BETA_ADMIN_VERIFIED_KEY = 'gh_beta_admin_verified_v1'

export const TEST_MEMBERS = [
  {
    id: 'm-001',
    name: '김청년',
    phone: '01012345678',
    role: 'member',
    adminPassword: null,
    organizations: [
      { category: '교육부', name: '2청년부', roleInOrg: '학생' },
      { category: '선교회', name: '8선교회', roleInOrg: '회원' },
    ],
  },
  {
    id: 'm-002',
    name: '이리더',
    phone: '01023456789',
    role: 'leader',
    adminPassword: 'leader1234',
    organizations: [
      { category: '교육부', name: '2청년부', roleInOrg: '교사' },
      { category: '제직부서', name: '찬양위원회', roleInOrg: '위원' },
    ],
  },
  {
    id: 'm-003',
    name: '박관리자',
    phone: '01034567890',
    role: 'admin',
    adminPassword: 'admin1234',
    organizations: [
      { category: '교육부', name: '2청년부', roleInOrg: '부장' },
      { category: '제직부서', name: '행정위원회', roleInOrg: '총무' },
    ],
  },
]

export function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '')
}

export function findTestMember(name, phone) {
  const normalizedName = String(name || '').trim()
  const normalizedPhone = normalizePhone(phone)
  return TEST_MEMBERS.find(
    (member) => member.name === normalizedName && member.phone === normalizedPhone
  ) || null
}

export function canAccessAdmin(member) {
  return member?.role === 'leader' || member?.role === 'admin'
}

export function getRoleLabel(role) {
  if (role === 'admin') return '관리자'
  if (role === 'leader') return '리더'
  return '일반 회원'
}

export function readBetaSession() {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(BETA_SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

export function writeBetaSession(member) {
  if (typeof window === 'undefined') return
  localStorage.setItem(BETA_SESSION_KEY, JSON.stringify({
    id: member.id,
    name: member.name,
    phone: member.phone,
    role: member.role,
    organizations: member.organizations,
    signedInAt: new Date().toISOString(),
  }))
}

export function clearBetaSession() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(BETA_SESSION_KEY)
  localStorage.removeItem(BETA_ADMIN_VERIFIED_KEY)
}

export function readAdminVerifiedMemberId() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(BETA_ADMIN_VERIFIED_KEY) || ''
}

export function writeAdminVerifiedMemberId(memberId) {
  if (typeof window === 'undefined') return
  localStorage.setItem(BETA_ADMIN_VERIFIED_KEY, memberId)
}

