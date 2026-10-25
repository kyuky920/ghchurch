import { randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto'

export const WEEK = 7 * 86400000
export const MISSIONS = ['이름을 부르며 매일 기도하기', '익명 응원의 메시지 보내기', '작은 친절을 실천하기', '말씀 한 구절로 축복하기', '기도 제목을 기억하며 중보하기', '감사의 마음 전하기', '한 주의 믿음 여정 응원하기', '마지막 축복과 감사 준비하기']
export const REPLIES = ['쉿, 비밀이에요 🤫', '그렇게 생각하셨군요 😊', '계속 지켜봐 주세요 👀']
export class GameError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
export function check(ok, message, status) { if (!ok) throw new GameError(message, status) }
export const digest = value => createHash('sha256').update(value).digest('hex')
export const token = () => randomBytes(32).toString('hex')
export function hash(value) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(value, salt, 64).toString('hex')}` }
export function verify(value, stored = '') { const [salt, expected] = stored.split(':'); if (!salt || !expected) return false; const actual = scryptSync(value, salt, 64); const bytes = Buffer.from(expected, 'hex'); return bytes.length === actual.length && timingSafeEqual(bytes, actual) }
export function text(value, max = 500) { check(typeof value === 'string', '입력값을 확인해 주세요.'); const result = value.trim().normalize('NFC'); check(result.length > 0 && result.length <= max, `1~${max}자로 입력해 주세요.`); return result }
export function currentWeek(s, now = Date.now()) { return s.status === 'draft' || now < s.startsAt ? 0 : Math.min(8, Math.floor((now - s.startsAt) / WEEK) + 1) }
export const dayKey = now => new Date(now + 9 * 3600000).toISOString().slice(0, 10)
export function newSeason(input) {
  const slug = text(input.slug, 40).toLowerCase()
  check(/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug), '모임 코드는 영문 소문자·숫자·하이픈 3~40자입니다.')
  check(Array.isArray(input.names), '참가자 명단을 입력해 주세요.')
  const names = input.names.map(n => text(n, 30))
  check(names.length >= 10 && names.length <= 20 && new Set(names).size === names.length, '서로 다른 이름 10~20명을 입력해 주세요. 동명이인은 구분 이름을 사용하세요.')
  const invites = []
  const participants = names.map(name => { const code = randomBytes(12).toString('hex'); const id = randomUUID(); invites.push({ name, code }); return { id, name, inviteHash: digest(code), pinHash: null, epoch: 0 } })
  return { state: { slug, title: text(input.title, 60), status: 'draft', startsAt: null, participants, assignments: {}, missions: [], prayers: [], hearts: [], messages: [], suspicions: [] }, invites }
}
export function register(s, input) {
  check(s.status !== 'revealed', '종료된 모임입니다.')
  const p = s.participants.find(p => p.name === text(input.name, 30))
  check(/^\d{6,12}$/.test(input.pin || ''), 'PIN은 숫자 6~12자리로 입력해 주세요.')
  check(p && !p.pinHash && p.inviteHash === digest(String(input.code || '')), '이름 또는 개인 참여코드를 확인해 주세요.', 401)
  p.pinHash = hash(input.pin); p.inviteHash = null
  return p
}
function participant(s, id) { const p = s.participants.find(p => p.id === id); check(p, '참가자 인증이 필요합니다.', 401); return p }
function active(s, now, minWeek = 1) { check(s.status === 'active' && now < s.startsAt + 8 * WEEK && currentWeek(s, now) >= minWeek, '아직 열리지 않았거나 활동 기간이 종료되었습니다.', 403) }
function target(s, id) { return participant(s, s.assignments[id]) }
export function mutate(s, actor, input, now = Date.now()) {
  const { action } = input
  if (actor.admin) {
    if (action === 'start') {
      check(s.status === 'draft' && s.participants.every(p => p.pinHash), '모든 참가자가 등록한 뒤 시작할 수 있습니다.')
      const date = Date.parse(input.startsAt)
      check(Number.isFinite(date) && date >= now - 60000 && date <= now + 30 * 86400000, '시작 시각은 현재부터 30일 이내로 지정해 주세요.')
      const ids = s.participants.map(p => p.id)
      for (let i = ids.length - 1; i > 0; i--) { const j = randomInt(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]] }
      s.assignments = Object.fromEntries(ids.map((id, i) => [id, ids[(i + 1) % ids.length]]))
      s.startsAt = date; s.status = 'active'; return
    }
    if (action === 'reveal') { check(s.status === 'active' && now >= s.startsAt + 8 * WEEK, '8주 활동이 끝난 뒤 정체를 공개할 수 있습니다.'); s.status = 'revealed'; return }
    if (action === 'reset_pin') {
      check(s.status !== 'revealed', '종료된 모임입니다.')
      const p = participant(s, input.participantId); const code = randomBytes(12).toString('hex')
      p.pinHash = null; p.inviteHash = digest(code); p.epoch++
      return { invites: [{ name: p.name, code }] }
    }
    throw new GameError('지원하지 않는 관리자 작업입니다.')
  }
  const p = participant(s, actor.id)
  active(s, now, action === 'message' ? 2 : action === 'suspect' || action === 'reply' ? 3 : 1)
  const week = currentWeek(s, now)
  if (action === 'mission') {
    check(Number.isInteger(input.week) && input.week >= 1 && input.week <= week, '열린 주차만 완료할 수 있습니다.')
    check(!s.missions.some(x => x.by === p.id && x.week === input.week), '이미 완료한 미션입니다.')
    s.missions.push({ by: p.id, week: input.week }); return
  }
  if (action === 'prayer') {
    check(!s.prayers.some(x => x.by === p.id && x.week === week), '기도 제목은 매주 한 번 작성할 수 있습니다.')
    s.prayers.push({ id: randomUUID(), by: p.id, week, body: text(input.body), answered: false, response: '', prayed: false }); return
  }
  if (action === 'prayer_update') {
    const prayer = s.prayers.find(x => x.id === input.id)
    check(prayer && prayer.by === p.id, '본인의 기도 제목만 응답을 기록할 수 있습니다.', 403)
    prayer.answered = true; prayer.response = text(input.body); return
  }
  if (action === 'pray') {
    const prayer = s.prayers.find(x => x.id === input.id)
    check(prayer && prayer.by === target(s, p.id).id, '배정된 친구의 기도 제목에만 기도할 수 있습니다.', 403)
    prayer.prayed = true; return
  }
  if (action === 'heart') {
    const day = dayKey(now)
    check(!s.hearts.some(x => x.by === p.id && x.day === day), '하트는 하루 한 번 보낼 수 있습니다.')
    s.hearts.push({ by: p.id, to: target(s, p.id).id, day }); return
  }
  if (action === 'message') {
    check(['friend', 'angel'].includes(input.channel), '대화 방향을 선택해 주세요.')
    const to = input.channel === 'friend' ? target(s, p.id).id : Object.keys(s.assignments).find(id => s.assignments[id] === p.id)
    check(s.messages.filter(x => x.by === p.id && x.day === dayKey(now) && x.channel === input.channel).length < 5, '대화방마다 하루 다섯 번 보낼 수 있습니다.')
    s.messages.push({ id: randomUUID(), by: p.id, to, channel: input.channel, body: text(input.body), day: dayKey(now), at: now }); return
  }
  if (action === 'suspect') {
    const suspect = participant(s, input.participantId)
    check(suspect.id !== p.id, '자신을 의심할 수 없습니다.')
    check(!s.suspicions.some(x => x.by === p.id && x.week === week), '의심은 매주 한 번만 보낼 수 있습니다.')
    s.suspicions.push({ id: randomUUID(), by: p.id, to: suspect.id, week, reply: null }); return
  }
  if (action === 'reply') {
    const suspicion = s.suspicions.find(x => x.id === input.id)
    check(suspicion && suspicion.to === p.id && !suspicion.reply, '본인이 받은 의심에 한 번만 답할 수 있습니다.', 403)
    check(REPLIES.includes(input.body), '준비된 답변을 선택해 주세요.')
    suspicion.reply = input.body; return
  }
  throw new GameError('지원하지 않는 작업입니다.')
}
export function view(s, actor, now = Date.now()) {
  const week = currentWeek(s, now)
  const base = { slug: s.slug, title: s.title, status: s.status, startsAt: s.startsAt, week, endsAt: s.startsAt ? s.startsAt + 8 * WEEK : null, participants: s.participants.map(p => ({ id: p.id, name: p.name, ...(actor.admin ? { registered: !!p.pinHash } : {}) })) }
  if (actor.admin) return { ...base, admin: true, counts: { missions: s.missions.length, prayers: s.prayers.length, messages: s.messages.length }, assignments: Object.entries(s.assignments).map(([by, to]) => ({ from: participant(s, by).name, to: participant(s, to).name })) }
  const p = participant(s, actor.id)
  const open = s.status !== 'draft' && week > 0
  const friend = open ? target(s, p.id) : null
  const angelId = Object.keys(s.assignments).find(id => s.assignments[id] === p.id)
  const channelMessages = channel => s.messages.filter(x => channel === 'friend' ? (x.by === p.id && x.to === friend?.id) || (x.by === friend?.id && x.to === p.id) : (x.by === p.id && x.to === angelId) || (x.by === angelId && x.to === p.id)).map(x => ({ id: x.id, body: x.body, mine: x.by === p.id, at: x.at }))
  return { ...base, me: { id: p.id, name: p.name, points: s.missions.filter(x => x.by === p.id).length * 10 }, friend: friend ? { name: friend.name } : null, missions: MISSIONS.map((title, i) => ({ week: i + 1, title: i < week ? title : null, unlocked: i < week, done: s.missions.some(x => x.by === p.id && x.week === i + 1), points: 10 })), prayers: s.prayers.filter(x => x.by === p.id || x.by === friend?.id).map(x => ({ id: x.id, week: x.week, body: x.body, mine: x.by === p.id, answered: x.answered, response: x.response, prayed: x.prayed })), hearts: s.hearts.filter(x => x.to === p.id).length, heartSent: s.hearts.some(x => x.by === p.id && x.day === dayKey(now)), messages: { friend: channelMessages('friend'), angel: channelMessages('angel') }, suspicions: s.suspicions.filter(x => x.by === p.id || x.to === p.id).map(x => ({ id: x.id, week: x.week, incoming: x.to === p.id, name: participant(s, x.to === p.id ? x.by : x.to).name, reply: x.reply })), ...(s.status === 'revealed' ? { angel: participant(s, angelId).name, reveal: Object.entries(s.assignments).map(([by, to]) => ({ from: participant(s, by).name, to: participant(s, to).name })) } : {}) }
}
