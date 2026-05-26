function monthKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function dateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function missionMonthKey(date) {
  return monthKey(date)
}

export function missionDateKey(date) {
  return dateKey(date)
}

export function calcAge(birthYear) {
  const year = Number(birthYear)
  if (!year) return '-'
  return new Date().getFullYear() - year + 1
}

export function missionMemberRoleLabel(role) {
  if (role === 'admin' || role === 'leader') return '운영진'
  if (role === 'sub_admin') return '부관리자'
  if (role === 'member') return '전회원'
  return '전회원'
}

export async function fetchBetaLogin(name, phone) {
  const response = await fetch('/api/beta/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone }),
  })
  const json = await response.json()
  if (!response.ok) {
    throw new Error(json?.error || '로그인에 실패했습니다.')
  }
  return json
}

export async function verifyBetaAdmin(memberId, password) {
  const response = await fetch('/api/beta/auth/admin-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId, password }),
  })
  const json = await response.json()
  if (!response.ok) {
    throw new Error(json?.error || '관리자 인증에 실패했습니다.')
  }
  return json
}

export async function fetchMissionsStore(memberId) {
  const search = new URLSearchParams({ memberId })
  const response = await fetch(`/api/beta/missions/store?${search.toString()}`)
  const json = await response.json()
  if (!response.ok) {
    throw new Error(json?.error || '선교회 데이터를 불러오지 못했습니다.')
  }
  return json
}

export async function mutateMissionsStore(action, payload) {
  const response = await fetch('/api/beta/missions/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  })
  const json = await response.json()
  if (!response.ok) {
    throw new Error(json?.error || '선교회 데이터를 저장하지 못했습니다.')
  }
  return json
}
