import { notify, ownedPhoto, socialView } from './social.mjs'
import { randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto'

export const INVITE_TTL = 7 * 86400000
export const DEVICE_TTL = 90 * 86400000
export const isRegistered = p => !!(p.pinHash || (p.registeredAt && p.deviceTokenHash))

export const WEEK = 7 * 86400000
export const MISSIONS = ['이름을 부르며 매일 기도하기', '익명 응원의 메시지 보내기', '작은 친절을 실천하기', '말씀 한 구절로 축복하기', '기도 제목을 기억하며 중보하기', '감사의 마음 전하기', '한 주의 믿음 여정 응원하기', '마지막 축복과 감사 준비하기']
// Keep the original mission first so historical completions remain meaningful.
export const MISSION_OPTIONS = [
  ['친구의 한 주를 위해 3분 기도하기', '친구의 좋은 점 세 가지를 찾아 마음에 담기', '모임 공간을 조용히 정리하기'],
  ['힘이 되는 말씀 한 구절을 익명 편지로 보내기', '한 주의 수고를 알아주는 익명 편지 쓰기', '친구가 편안하게 모임에 참여하도록 작은 도움 주기'],
  ['모임 준비나 뒷정리를 한 가지 맡기', '친구가 말할 때 끝까지 듣고 공감하기', '친구에게 전할 축복을 익명 편지로 쓰기'],
  ['찬양 한 곡과 응원의 말을 익명 편지로 전하기', '말씀을 읽고 친구를 위한 한 문장 기도 쓰기', '친구의 장점을 담은 익명 응원 보내기'],
  ['기도 노트를 읽고 함께 기도했다고 표시하기', '친구의 쉼과 건강을 위해 기도하기', '부담 없이 할 수 있는 작은 도움 실천하기'],
  ['모임에서 고마웠던 순간을 익명 편지로 전하기', '눈에 띄지 않는 봉사 한 가지 실천하기', '친구 덕분에 좋았던 점을 찾아 축복하기'],
  ['친구의 도전을 응원하는 익명 편지 쓰기', '이번 주 받은 은혜를 떠올리며 친구를 위해 기도하기', '함께하는 자리에서 따뜻하게 경청하기'],
  ['8주 동안 친구에게 고마웠던 점 돌아보기', '앞으로의 여정을 위한 축복 기도하기', '마지막 익명 감사 편지 보내기']
].map((alternatives, i) => {
  const types = [
    ['care','care','care','care'], ['letter','letter','letter','care'],
    ['care','together','together','letter'], ['letter','letter','care','letter'],
    ['care','care','care','together'], ['letter','letter','care','care'],
    ['letter','letter','care','together'], ['letter','care','care','letter']
  ][i]
  const extras = [
    ['모임에서 자연스럽게 옆자리에 앉아 안부 묻기', '모임 단체 사진에 마니또와 함께 남기기', '짧은 환영과 응원의 한마디를 익명 편지로 전하기'],
    ['모임 후 함께 걸으며 이번 주 이야기를 들어주기', '같이 찍은 사진에 응원 한마디를 적어 익명으로 전하기', '친구의 장점 하나를 찾아 익명 칭찬 편지 보내기'],
    ['옆자리에 앉아 함께 예배나 셀모임에 참여하기', '친구와 함께 웃는 순간을 사진으로 남기기', '이번 주 수고한 일 하나를 기억해 응원 전하기'],
    ['친구와 같이 모임 준비나 뒷정리 한 가지 하기', '셀모임 친구들과 함께 사진 찍고 추억 남기기', '친구에게 어울리는 찬양과 짧은 편지 전하기'],
    ['모임 전후에 잠깐 함께 앉아 안부 나누기', '함께한 장소나 풍경 사진에 축복 한마디 남기기', '친구의 기도 제목을 위한 응원 편지 전하기'],
    ['친구와 함께 자리를 정리하며 고마웠던 일 나누기', '함께 찍은 사진 속 좋았던 순간을 기록하기', '구체적으로 고마웠던 일을 익명 편지로 전하기'],
    ['옆자리에 앉아 이번 주 도전을 들어주고 응원하기', '친구들과 함께 응원 포즈로 사진 찍기', '친구의 다음 한 걸음을 축복하는 편지 전하기'],
    ['친구와 함께 앉아 8주 동안 좋았던 순간 나누기', '마지막 모임에서 함께 추억 사진 남기기', '정체 공개를 기다리며 마지막 감사 편지 전하기']
  ][i]
  return [...[MISSIONS[i], ...alternatives].map((title,j) => ({ id: `w${i+1}-${j+1}`, title, kind: types[j] })), ...extras.map((title,j) => ({ id: `w${i+1}-${j+5}`, title, kind: ['together','photo','letter'][j] }))]
})
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
  check(names.length >= 2, '참가자를 2명 이상 입력해 주세요.')
  check(new Set(names).size === names.length, '이름이 중복되었습니다. 동명이인은 구분 이름을 사용하세요.')
  const invites = []
  const participants = names.map(name => { const code = token(); const id = randomUUID(); const expiresAt = Date.now() + INVITE_TTL; invites.push({ name, participantId: id, code, expiresAt }); return { id, name, inviteHash: digest(code), inviteExpiresAt: expiresAt, pinHash: null, epoch: 0 } })
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
export function invitationInfo(s, input, now = Date.now()) {
  const p = s.participants.find(p => p.id === input.participantId)
  check(p && typeof input.code === 'string' && /^(?:[a-f0-9]{24}|[a-f0-9]{64})$/.test(input.code) && p.inviteHash === digest(input.code) && (!p.inviteExpiresAt || p.inviteExpiresAt > now), '초대 링크가 만료되었거나 이미 사용되었습니다. 새 링크를 요청해 주세요.', 401)
  return { slug: s.slug, title: s.title, participantId: p.id, name: p.name }
}
export function redeemInvitation(s, input, deviceHash, now = Date.now()) {
  const info = invitationInfo(s, input, now)
  check(text(input.name, 30) === info.name, '초대받은 이름과 일치하는지 확인해 주세요.')
  check(/^[a-f0-9]{64}$/.test(deviceHash), '기기 등록 정보를 확인해 주세요.')
  const p = s.participants.find(p => p.id === info.participantId)
  p.pinHash = null; p.inviteHash = null; p.inviteExpiresAt = null
  p.registeredAt = new Date(now).toISOString(); p.deviceName = input.deviceName ? text(input.deviceName, 40) : '내 기기'
  p.pushSubscription = null; p.deviceTokenHash = deviceHash; p.deviceExpiresAt = now + DEVICE_TTL; p.epoch++
  return p
}
export function unregisterDevice(s, id) {
  const p = participant(s, id)
  p.pushSubscription = null; p.pinHash = null; p.registeredAt = null; p.deviceName = null; p.deviceTokenHash = null; p.deviceExpiresAt = null; p.epoch++
}
function participant(s, id) { const p = s.participants.find(p => p.id === id); check(p, '참가자 인증이 필요합니다.', 401); return p }
function active(s, now, minWeek = 1) { check(s.status === 'active' && now < s.startsAt + 8 * WEEK && currentWeek(s, now) >= minWeek, '아직 열리지 않았거나 활동 기간이 종료되었습니다.', 403) }
function target(s, id) { return participant(s, s.assignments[id]) }
export function mutate(s, actor, input, now = Date.now()) {
  const { action } = input
  if (actor.admin) {
    if (action === 'test_advance' || action === 'test_reset') {
      check(s.testMode === true, '테스트 전용 모임에서만 사용할 수 있습니다.', 403)
      if (action === 'test_reset') {
        check(Object.keys(s.assignments).length === s.participants.length, '배정이 완료된 테스트 모임에서만 초기화할 수 있습니다.')
        s.notifications = []; s.missions = []; s.prayers = []; s.hearts = []; s.messages = []; s.suspicions = []
        s.startsAt = now; s.status = 'active'; return
      }
      check(s.status === 'active' && now < s.startsAt + 8 * WEEK, '진행 중인 테스트 모임에서만 주차를 이동할 수 있습니다.')
      check(Number.isInteger(input.week) && input.week > currentWeek(s, now) && input.week <= 9, '다음 주차부터 8주 종료까지 이동할 수 있습니다.')
      s.startsAt = now - (input.week - 1) * WEEK; return
    }
    if (action === 'start') {
      check(s.status === 'draft' && s.participants.length >= 2 && s.participants.every(isRegistered), '모든 참가자가 등록한 뒤 시작할 수 있습니다.')
      const date = Date.parse(input.startsAt)
      check(Number.isFinite(date) && date >= now - 60000 && date <= now + 30 * 86400000, '시작 시각은 현재부터 30일 이내로 지정해 주세요.')
      const ids = s.participants.map(p => p.id)
      for (let i = ids.length - 1; i > 0; i--) { const j = randomInt(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]] }
      s.assignments = Object.fromEntries(ids.map((id, i) => [id, ids[(i + 1) % ids.length]]))
      s.startsAt = date; s.status = 'active'; return
    }
    if (action === 'reveal') { check(s.status === 'active' && now >= s.startsAt + 8 * WEEK, '8주 활동이 끝난 뒤 정체를 공개할 수 있습니다.'); s.status = 'revealed'; return }
    if (action === 'reset_link' || action === 'reset_links' || action === 'reset_pin') {
      const people = action === 'reset_links' ? s.participants : [participant(s, input.participantId)]
      return { invites: people.map(p => {
        const code = token()
        p.pushSubscription = null; p.pinHash = null; p.registeredAt = null; p.deviceTokenHash = null; p.deviceExpiresAt = null; p.deviceName = null
        p.inviteHash = digest(code); p.inviteExpiresAt = now + INVITE_TTL; p.epoch++
        return { name: p.name, participantId: p.id, code, expiresAt: p.inviteExpiresAt }
      }) }
    }
    throw new GameError('지원하지 않는 관리자 작업입니다.')
  }
  const p = participant(s, actor.id)
  if (action === 'read_notifications') {
    for (const n of s.notifications || []) if (n.to === p.id && (!input.id || n.id === input.id)) n.read = true
    return
  }
  if (action === 'mission_share') {
    const mission = s.missions.find(m => m.by === p.id && m.week === input.week)
    check(mission, '본인이 완료한 미션만 기록할 수 있습니다.', 403)
    check(typeof input.shared === 'boolean', '전달 여부를 선택해 주세요.')
    const privateMemo = input.privateMemo ? text(input.privateMemo, 1000) : ''
    const note = input.note ? text(input.note, 300) : ''
    const photoId = ownedPhoto(s, p.id, input.photoId)
    Object.assign(mission, { privateMemo, note, photoId, shared: input.shared })
    if (mission.shared) notify(s, target(s, p.id).id, 'footprint', `footprint:${p.id}:${mission.week}`)
    return
  }
  active(s, now, action === 'message' ? 2 : action === 'suspect' || action === 'reply' ? 3 : 1)
  const week = currentWeek(s, now)
  if (action === 'mission') {
    check(Number.isInteger(input.week) && input.week >= 1 && input.week <= week, '열린 주차만 완료할 수 있습니다.')
    check(!s.missions.some(x => x.by === p.id && x.week === input.week), '이미 완료한 미션입니다.')
    const choices = MISSION_OPTIONS[input.week - 1]
    const choice = input.missionId === undefined ? choices[0] : choices.find(x => x.id === input.missionId)
    check(choice, '이번 주 미션 중 하나를 골라 주세요.')
    const note = input.note ? text(input.note, 300) : ''
    const privateMemo = input.privateMemo ? text(input.privateMemo, 1000) : ''
    const photoId = ownedPhoto(s, p.id, input.photoId)
    check(input.shared === undefined || typeof input.shared === 'boolean', '전달 여부를 선택해 주세요.')
    s.missions.push({ by: p.id, week: input.week, missionId: choice.id, privateMemo, note, photoId, shared: input.shared === true })
    if (input.shared) notify(s, target(s, p.id).id, 'footprint', `footprint:${p.id}:${input.week}`)
    return
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
    if (!prayer.prayed) notify(s, prayer.by, 'pray', `pray:${prayer.id}`)
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
    const photoId = ownedPhoto(s, p.id, input.photoId)
    check(input.body === undefined || typeof input.body === 'string', '편지 내용을 확인해 주세요.')
    const message = { id: randomUUID(), by: p.id, to, channel: input.channel, body: input.body?.trim() ? text(input.body) : (check(photoId, '편지 내용이나 사진을 넣어 주세요.'), ''), photoId, day: dayKey(now), at: now }
    s.messages.push(message)
    notify(s, to, 'message', `message:${message.id}`, { channel: input.channel === 'friend' ? 'angel' : 'friend' }); return
  }
  if (action === 'suspect') {
    const suspect = participant(s, input.participantId)
    check(suspect.id !== p.id, '자신을 의심할 수 없습니다.')
    check(!s.suspicions.some(x => x.by === p.id && x.week === week), '의심은 매주 한 번만 보낼 수 있습니다.')
    const suspicion = { id: randomUUID(), by: p.id, to: suspect.id, week, reply: null }; s.suspicions.push(suspicion)
    notify(s, suspect.id, 'suspect', `suspect:${suspicion.id}`); return
  }
  if (action === 'reply') {
    const suspicion = s.suspicions.find(x => x.id === input.id)
    check(suspicion && suspicion.to === p.id && !suspicion.reply, '본인이 받은 의심에 한 번만 답할 수 있습니다.', 403)
    check(REPLIES.includes(input.body), '준비된 답변을 선택해 주세요.')
    suspicion.reply = input.body; notify(s, suspicion.by, 'reply', `reply:${suspicion.id}`); return
  }
  throw new GameError('지원하지 않는 작업입니다.')
}
export function view(s, actor, now = Date.now()) {
  const week = currentWeek(s, now)
  const base = { slug: s.slug, title: s.title, status: s.status, isTest: s.testMode === true, startsAt: s.startsAt, week, endsAt: s.startsAt ? s.startsAt + 8 * WEEK : null, participants: s.participants.map(p => ({ id: p.id, name: p.name, ...(actor.admin ? { registered: isRegistered(p), deviceRegistered: !!p.deviceTokenHash && p.deviceExpiresAt > now, deviceName: p.deviceName || '', registeredAt: p.registeredAt || null } : {}) })) }
  if (actor.admin) return { ...base, admin: true, counts: { missions: s.missions.length, prayers: s.prayers.length, messages: s.messages.length }, assignments: Object.entries(s.assignments).map(([by, to]) => ({ from: participant(s, by).name, to: participant(s, to).name })) }
  const p = participant(s, actor.id)
  const open = s.status !== 'draft' && week > 0
  const friend = open ? target(s, p.id) : null
  const angelId = Object.keys(s.assignments).find(id => s.assignments[id] === p.id)
  const channelMessages = channel => s.messages.filter(x => channel === 'friend' ? (x.by === p.id && x.to === friend?.id && x.channel === 'friend') || (x.by === friend?.id && x.to === p.id && x.channel === 'angel') : (x.by === p.id && x.to === angelId && x.channel === 'angel') || (x.by === angelId && x.to === p.id && x.channel === 'friend')).map(x => ({ id: x.id, body: x.body, photoId: x.photoId || null, mine: x.by === p.id, at: x.at }))
  return { ...base, ...socialView(s, p.id, now), me: { id: p.id, name: p.name, points: s.missions.filter(x => x.by === p.id).length * 10 }, friend: friend ? { name: friend.name } : null, missions: MISSIONS.map((title, i) => { const done = s.missions.find(x => x.by === p.id && x.week === i + 1); return { week: i + 1, title: i < week ? title : null, options: i < week ? MISSION_OPTIONS[i] : [], selectedId: done ? (done.missionId || MISSION_OPTIONS[i][0].id) : null, unlocked: i < week, done: !!done, privateMemo: done?.privateMemo || '', note: done?.note || '', photoId: done?.photoId || null, shared: done?.shared === true, points: 10 } }), prayers: s.prayers.filter(x => x.by === p.id || x.by === friend?.id).map(x => ({ id: x.id, week: x.week, body: x.body, mine: x.by === p.id, answered: x.answered, response: x.response, prayed: x.prayed })), hearts: s.hearts.filter(x => x.to === p.id).length, heartSent: s.hearts.some(x => x.by === p.id && x.day === dayKey(now)), messages: { friend: channelMessages('friend'), angel: channelMessages('angel') }, suspicions: s.suspicions.filter(x => x.by === p.id || x.to === p.id).map(x => ({ id: x.id, week: x.week, incoming: x.to === p.id, name: participant(s, x.to === p.id ? x.by : x.to).name, reply: x.reply })), ...(s.status === 'revealed' ? { angel: participant(s, angelId).name, reveal: Object.entries(s.assignments).map(([by, to]) => ({ from: participant(s, by).name, to: participant(s, to).name })) } : {}) }
}
