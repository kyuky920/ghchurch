export const BETA_SESSION_KEY = 'gh_beta_member_session_v1'
export const BETA_ADMIN_VERIFIED_KEY = 'gh_beta_admin_verified_v1'

export function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '')
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
    ...member,
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
