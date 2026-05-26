export const BETA_MISSIONS_STORE_KEY = 'gh_beta_missions_store_v1'

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

export function defaultMissionsStore() {
  const currentMonth = monthKey()
  const today = dateKey()
  return {
    members: [
      { id: 'mm-001', status: '회원', name: '김청년', birthYear: 1998, note: '8선교회 총무 지원 가능' },
      { id: 'mm-002', status: '회원', name: '이리더', birthYear: 1992, note: '2청년부 교사' },
      { id: 'mm-003', status: '비회원', name: '최방문', birthYear: 1996, note: '최근 새가족 수료' },
    ],
    duesSettings: {
      [currentMonth]: { amount: 10000 },
    },
    duesPayments: {
      [`${currentMonth}:mm-001`]: { paid: true, amount: 10000, memo: '자동이체' },
      [`${currentMonth}:mm-002`]: { paid: false, amount: 10000, memo: '' },
      [`${currentMonth}:mm-003`]: { paid: false, amount: 0, memo: '비회원' },
    },
    financeEntries: [
      { id: 'mf-001', date: today, kind: 'income', category: '회비', amount: 10000, note: '김청년 5월 회비' },
      { id: 'mf-002', date: today, kind: 'expense', category: '교제비', amount: 6000, note: '소모임 간식' },
    ],
    biblePlans: {
      [today]: { range: '시편 23편, 요한복음 15장', memo: '목자 되신 하나님과 참포도나무 되신 주님을 묵상합니다.' },
    },
    bibleLogs: {
      [`mm-001:${today}`]: { done: true, memo: '요 15장에서 열매 맺는 삶이 기억에 남았습니다.' },
      [`mm-002:${today}`]: { done: false, memo: '' },
    },
    schedules: [
      { id: 'ms-001', date: today, title: '토요 전도 모임', detail: '오후 2시 교육관 앞 집합', type: 'event' },
      { id: 'ms-002', date: today, title: '공지: 6월 수련회 신청', detail: '이번 주 안에 신청서를 제출해 주세요.', type: 'notice' },
    ],
    votes: [
      {
        id: 'mv-001',
        title: '5월 수련회 참석 여부',
        description: '참석 여부와 동반 자녀 이름을 적어 주세요.',
        visibility: 'public',
        status: 'open',
        createdAt: today,
        responses: {
          'mm-001': { choice: '참석', note: '자녀 없음' },
        },
      },
    ],
    documents: [
      { id: 'md-001', title: '5월 월례회 회의록', createdAt: today, content: '수련회 일정, 회비 현황, 다음 달 봉사 계획을 논의했습니다.' },
    ],
  }
}

export function readMissionsStore() {
  if (typeof window === 'undefined') return defaultMissionsStore()
  const raw = localStorage.getItem(BETA_MISSIONS_STORE_KEY)
  if (!raw) return defaultMissionsStore()
  try {
    const parsed = JSON.parse(raw)
    return { ...defaultMissionsStore(), ...parsed }
  } catch (e) {
    return defaultMissionsStore()
  }
}

export function writeMissionsStore(next) {
  if (typeof window === 'undefined') return
  localStorage.setItem(BETA_MISSIONS_STORE_KEY, JSON.stringify(next))
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
  if (role === 'admin') return '관리자'
  if (role === 'leader') return '부관리자'
  return '전회원'
}
