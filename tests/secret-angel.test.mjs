import test from 'node:test'
import assert from 'node:assert/strict'
import { newSeason, register, mutate, view, hash, verify, WEEK, currentWeek, REPLIES, dayKey } from '../lib/secret-angel/game.mjs'
const now = Date.parse('2026-10-25T03:00:00Z')
const names = Array.from({ length: 10 }, (_, i) => `청년${i}`)
function draft() { return newSeason({ slug: 'youth-2026', title: '청년부', names }) }
function setup() {
  const { state: s, invites } = draft()
  invites.forEach((x, i) => register(s, { name: x.name, code: x.code, pin: `${123450 + i}` }))
  mutate(s, { admin: true }, { action: 'start', startsAt: new Date(now).toISOString() }, now)
  return s
}
const actor = (s, i = 0) => ({ id: s.participants[i].id })
function friend(s, id) { return s.assignments[id] }

test('명단은 중복 없는 10~20명, 모임 코드/이름 제한', () => {
  for (const list of [names.slice(0, 9), [...names, ...names], Array(21).fill('동일')]) assert.throws(() => newSeason({ slug: 'youth-2026', title: '모임', names: list }))
  assert.throws(() => newSeason({ slug: '../etc', title: '모임', names }))
})
test('참여코드와 PIN은 평문으로 저장하지 않으며 이름만으로 등록 불가', () => {
  const { state: s, invites } = draft()
  assert.throws(() => register(s, { name: names[0], pin: '123456', code: invites[1].code }))
  assert.throws(() => register(s, { name: names[0], pin: '123', code: invites[0].code }))
  register(s, { name: names[0], pin: '123456', code: invites[0].code })
  assert.ok(!JSON.stringify(s).includes(invites[0].code))
  assert.ok(verify('123456', s.participants[0].pinHash))
  assert.ok(!verify('999999', s.participants[0].pinHash))
  assert.throws(() => register(s, { name: names[0], pin: '999999', code: invites[0].code }))
})
test('관리자 외 배정 불가 / 전원 등록 전 시작 불가 / 중복 배정 불가', () => {
  const { state: s } = draft()
  assert.throws(() => mutate(s, { admin: true }, { action: 'start', startsAt: new Date(now).toISOString() }, now))
  const active = setup()
  assert.throws(() => mutate(active, actor(active), { action: 'start' }, now))
  assert.throws(() => mutate(active, { admin: true }, { action: 'start', startsAt: new Date(now).toISOString() }, now))
})
test('반복 무작위 배정: 각자 하나, 중복·자기·맞교환 없음', () => {
  // Reuse registered state so the test focuses on assignment invariants.
  const s = setup()
  for (let n = 0; n < 100; n++) {
    s.status = 'draft'; mutate(s, { admin: true }, { action: 'start', startsAt: new Date(now).toISOString() }, now)
    assert.equal(new Set(Object.values(s.assignments)).size, 10)
    for (const [by, to] of Object.entries(s.assignments)) { assert.notEqual(by, to); assert.notEqual(s.assignments[to], by) }
  }
})
test('예약 시작과 정확한 주차 경계, 미공개 미션, 미래 행동 차단', () => {
  const s = setup(); const a = actor(s)
  assert.equal(currentWeek(s, now - 1), 0)
  assert.equal(currentWeek(s, now + WEEK - 1), 1)
  assert.equal(currentWeek(s, now + WEEK), 2)
  assert.equal(view(s, a, now - 1).friend, null)
  assert.equal(view(s, a, now).missions[1].title, null)
  assert.throws(() => mutate(s, a, { action: 'mission', week: 1 }, now - 1))
  assert.throws(() => mutate(s, a, { action: 'mission', week: 2 }, now))
  assert.throws(() => mutate(s, a, { action: 'message', channel: 'angel', body: '안녕' }, now))
  assert.throws(() => mutate(s, a, { action: 'suspect', participantId: s.participants[1].id }, now + WEEK))
})
test('미션 포인트는 한 번만, 타인의 포인트와 자격증명 비공개', () => {
  const s = setup(); const a = actor(s)
  mutate(s, a, { action: 'mission', week: 1 }, now)
  assert.throws(() => mutate(s, a, { action: 'mission', week: 1 }, now))
  assert.equal(view(s, a, now).me.points, 10)
  assert.equal(view(s, actor(s, 1), now).me.points, 0)
  const v = JSON.stringify(view(s, a, now))
  for (const secret of ['pinHash', 'inviteHash', 'assignments', 'epoch', 'registered']) assert.ok(!v.includes(`"${secret}"`))
})
test('기도 제목은 본인과 배정된 천사만, 응답은 소유자만 작성', () => {
  const s = setup(), owner = actor(s), angel = { id: Object.keys(s.assignments).find(id => friend(s, id) === owner.id) }
  mutate(s, owner, { action: 'prayer', body: '비공개 기도 제목' }, now)
  const prayer = s.prayers[0]
  assert.equal(view(s, owner, now).prayers.length, 1)
  assert.equal(view(s, angel, now).prayers.length, 1)
  const outsider = s.participants.find(p => ![owner.id, angel.id].includes(p.id))
  assert.equal(view(s, { id: outsider.id }, now).prayers.length, 0)
  assert.throws(() => mutate(s, { id: outsider.id }, { action: 'pray', id: prayer.id }, now))
  assert.throws(() => mutate(s, angel, { action: 'prayer_update', id: prayer.id, body: '가짜 응답' }, now))
  mutate(s, angel, { action: 'pray', id: prayer.id }, now)
  mutate(s, owner, { action: 'prayer_update', id: prayer.id, body: '감사합니다' }, now)
  assert.equal(view(s, angel, now).prayers[0].response, '감사합니다')
  assert.throws(() => mutate(s, owner, { action: 'prayer', body: '중복' }, now))
  assert.ok(!JSON.stringify(view(s, { admin: true }, now)).includes('비공개 기도 제목'))
})
test('하트는 KST 하루 한 번, 발신자 식별 정보 노출 없음', () => {
  const s = setup(), a = actor(s), to = friend(s, a.id)
  mutate(s, a, { action: 'heart' }, now)
  assert.throws(() => mutate(s, a, { action: 'heart' }, now))
  const v = view(s, { id: to }, now)
  assert.equal(v.hearts, 1)
  assert.equal(dayKey(Date.parse('2026-10-25T15:00:00Z')), '2026-10-26')
  mutate(s, a, { action: 'heart' }, now + 86400000)
  assert.equal(s.hearts.length, 2)
})
test('양방향 메시지 채널 분리와 타인 ID 위조 방어, 익명 응답', () => {
  const s = setup(), a = actor(s), to = friend(s, a.id), angel = Object.keys(s.assignments).find(id => friend(s, id) === a.id)
  mutate(s, a, { action: 'message', channel: 'friend', to: angel, body: '비밀 편지' }, now + WEEK)
  assert.equal(s.messages[0].to, to)
  mutate(s, { id: to }, { action: 'message', channel: 'angel', body: '답장' }, now + WEEK)
  const mine = view(s, a, now + WEEK)
  assert.equal(mine.messages.friend.length, 2)
  assert.equal(mine.messages.angel.length, 0)
  assert.equal(view(s, { id: to }, now + WEEK).messages.angel.length, 2)
  const outsider = s.participants.find(p => ![a.id, to, angel].includes(p.id))
  assert.equal(view(s, { id: outsider.id }, now + WEEK).messages.friend.length, 0)
  assert.equal(view(s, { id: outsider.id }, now + WEEK).messages.angel.length, 0)
  assert.deepEqual(Object.keys(mine.messages.friend[0]).sort(), ['at', 'body', 'id', 'mine'])
})
test('메시지 분량 / 채널 / 하루 전송 제한', () => {
  const s = setup(), a = actor(s)
  assert.throws(() => mutate(s, a, { action: 'message', channel: 'everyone', body: 'x' }, now + WEEK))
  assert.throws(() => mutate(s, a, { action: 'message', channel: 'friend', body: 'x'.repeat(501) }, now + WEEK))
  for (let i = 0; i < 5; i++) mutate(s, a, { action: 'message', channel: 'friend', body: '축복해요' }, now + WEEK)
  assert.throws(() => mutate(s, a, { action: 'message', channel: 'friend', body: '초과' }, now + WEEK))
})
test('의심: 상대에게 의심한 사람 공개, 제3자 차단, 주 1회, 정답 비공개, 답변 1회', () => {
  const s = setup(), a = actor(s), angel = Object.keys(s.assignments).find(id => friend(s, id) === a.id), time = now + WEEK * 2
  assert.throws(() => mutate(s, a, { action: 'suspect', participantId: a.id }, time))
  mutate(s, a, { action: 'suspect', participantId: angel }, time)
  const suspicion = s.suspicions[0]
  assert.equal(view(s, { id: angel }, time).suspicions[0].name, s.participants[0].name)
  assert.equal(view(s, a, time).suspicions[0].name, s.participants.find(p => p.id === angel).name)
  const outsider = s.participants.find(p => ![a.id, angel].includes(p.id))
  assert.equal(view(s, { id: outsider.id }, time).suspicions.length, 0)
  assert.throws(() => mutate(s, a, { action: 'suspect', participantId: angel }, time))
  assert.throws(() => mutate(s, a, { action: 'reply', id: suspicion.id, body: REPLIES[0] }, time))
  assert.throws(() => mutate(s, { id: angel }, { action: 'reply', id: suspicion.id, body: '맞아요' }, time))
  mutate(s, { id: angel }, { action: 'reply', id: suspicion.id, body: REPLIES[0] }, time)
  assert.throws(() => mutate(s, { id: angel }, { action: 'reply', id: suspicion.id, body: REPLIES[1] }, time))
  assert.deepEqual(Object.keys(view(s, a, time).suspicions[0]).sort(), ['id', 'incoming', 'name', 'reply', 'week'])
})
test('8주 종료 전 공개 금지, 종료 후 활동 차단, 공개 전 천사 이름 미노출', () => {
  const s = setup(), a = actor(s)
  assert.ok(!('angel' in view(s, a, now + 8 * WEEK)))
  assert.throws(() => mutate(s, { admin: true }, { action: 'reveal' }, now + 8 * WEEK - 1))
  assert.throws(() => mutate(s, a, { action: 'heart' }, now + 8 * WEEK))
  assert.throws(() => mutate(s, a, { action: 'reveal' }, now + 8 * WEEK))
  mutate(s, { admin: true }, { action: 'reveal' }, now + 8 * WEEK)
  assert.equal(view(s, a, now + 8 * WEEK).reveal.length, 10)
  assert.ok(view(s, a, now + 8 * WEEK).angel)
  assert.throws(() => mutate(s, a, { action: 'mission', week: 1 }, now + 8 * WEEK))
})
test('시작 후 PIN 복구용 일회용 코드 재발급, epoch로 세션 취소', () => {
  const s = setup(), a = actor(s), p = s.participants[0]
  const result = mutate(s, { admin: true }, { action: 'reset_pin', participantId: a.id }, now)
  assert.equal(p.epoch, 1); assert.equal(p.pinHash, null)
  register(s, { name: p.name, pin: '777777', code: result.invites[0].code })
  assert.equal(p.inviteHash, null); assert.ok(verify('777777', p.pinHash))
  assert.ok(!verify('123450', p.pinHash)); assert.equal(p.epoch, 1)
})
