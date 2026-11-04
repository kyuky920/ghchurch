import { randomUUID } from 'node:crypto'
import { check, currentWeek, MISSION_OPTIONS, WEEK } from './game.mjs'

export const NOTICE_TEXT = {
  message: ['💌 비밀 편지', '비밀 편지가 도착했어요.'],
  suspect: ['👀 의심 노트', '누군가 나를 천사로 의심했어요.'],
  reply: ['🤫 의심의 답변', '나의 의심에 답변이 왔어요.'],
  pray: ['🙏 함께하는 기도', '누군가 함께 기도했어요.'],
  footprint: ['🕊️ 천사의 발자국', '천사가 나를 위해 작은 실천을 했어요.'],
  week: ['🌱 새로운 한 주', '이번 주의 새로운 미션이 열렸어요.']
}
export function notify(s, to, type, key, extra = {}) {
  s.notifications ||= []
  if (s.notifications.some(n => n.key === key && n.to === to)) return
  s.notifications.push({ id: randomUUID(), to, type, key, read: false, ...extra })
  // Bound the inbox separately for each recipient; never disclose exact event times.
  const own = s.notifications.filter(n => n.to === to)
  if (own.length > 100) { const remove = new Set(own.slice(0, own.length - 100).map(n => n.id)); s.notifications = s.notifications.filter(n => !remove.has(n.id)) }
}
export function weeklyNotices(s, now = Date.now()) {
  const week = currentWeek(s, now)
  if (s.status !== 'active' || week < 1 || now >= s.startsAt + 8 * WEEK) return
  for (const p of s.participants) notify(s, p.id, 'week', `week:${s.startsAt}:${week}`)
}
export function ownedPhoto(s, by, id) {
  if (!id) return null
  check(typeof id === 'string' && s.photos?.some(p => p.id === id && p.by === by), '본인이 올린 사진을 선택해 주세요.', 403)
  return id
}
export function canReadPhoto(s, actor, photoId) {
  if (actor.admin) return false
  const photo = s.photos?.find(p => p.id === photoId)
  if (!photo) return false
  if (photo.by === actor.id) return true
  return s.missions.some(m => m.shared && m.photoId === photoId && s.assignments[m.by] === actor.id) || s.messages.some(m => m.photoId === photoId && m.to === actor.id)
}
export function socialView(s, id, now) {
  const score = p => s.missions.filter(m => m.by === p.id).length
  const ordered = s.participants.map(p => ({ id: p.id, name: p.name, completed: score(p), points: score(p) * 10 })).sort((a,b) => b.points - a.points || a.name.localeCompare(b.name, 'ko'))
  const leaderboard = ordered.map((p, i) => ({ ...p, rank: ordered.findIndex(other => other.points === p.points) + 1, mine: p.id === id }))
  const week = currentWeek(s, now), total = s.missions.length, goal = s.participants.length * 8
  const weeks = s.missions.filter(m => m.by === id).map(m => m.week).sort((a,b) => a-b)
  let streak = 0, best = 0, previous = 0
  for (const w of weeks) { streak = w === previous + 1 ? streak + 1 : 1; best = Math.max(best, streak); previous = w }
  const badges = [{ title: '첫 작은 실천', icon: '🌱', earned: weeks.length >= 1 }, { title: '3주 이어진 마음', icon: '🌿', earned: best >= 3 }, { title: '8주 완주 천사', icon: '🕊️', earned: weeks.length === 8 }]
  const angel = Object.keys(s.assignments).find(by => s.assignments[by] === id)
  const footprints = s.missions.filter(m => m.by === angel && m.shared).map(m => ({ week: m.week, title: MISSION_OPTIONS[m.week - 1].find(o => o.id === (m.missionId || `w${m.week}-1`))?.title, note: m.note || '', photoId: m.photoId || null, ...(s.status === 'revealed' ? { name: s.participants.find(p => p.id === angel)?.name } : {}) })).sort((a,b) => b.week-a.week)
  return { leaderboard, badges, garden: { total, goal, percent: goal ? Math.round(total / goal * 100) : 0, weekCompleted: s.missions.filter(m => m.week === week).length, participants: s.participants.length, stage: total === 0 ? '씨앗' : total < goal * .25 ? '새싹' : total < goal * .6 ? '어린 나무' : total < goal ? '푸른 나무' : '축복의 숲' }, footprints, notifications: (s.notifications || []).filter(n => n.to === id).slice().reverse().map(n => ({ id: n.id, type: n.type, read: n.read, title: NOTICE_TEXT[n.type]?.[0], body: NOTICE_TEXT[n.type]?.[1], channel: n.channel || null })), pushEnabled: !!s.participants.find(p => p.id === id)?.pushSubscription }
}
