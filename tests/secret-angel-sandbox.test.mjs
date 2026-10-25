import test from 'node:test'
import assert from 'node:assert/strict'
import { newSeason, register, mutate, view, WEEK } from '../lib/secret-angel/game.mjs'
const now = Date.parse('2026-10-25T03:00:00Z')
function fixture() {
  const { state, invites } = newSeason({ slug: 'test-12', title: '12명 테스트', names: Array.from({ length: 12 }, (_, i) => `테스트${String(i + 1).padStart(2, '0')}`), testMode: true })
  assert.ok(!state.testMode, '일반 생성 입력으로 테스트 권한을 얻을 수 없어야 함')
  for (const invite of invites) register(state, { ...invite, pin: '123456' })
  mutate(state, { admin: true }, { action: 'start', startsAt: new Date(now).toISOString() }, now)
  return state
}
test('일반 모임과 참가자는 테스트 시간·초기화 기능 사용 불가', () => {
  const s = fixture(), admin = { admin: true }
  for (const action of ['test_advance', 'test_reset']) assert.throws(() => mutate(s, admin, { action, week: 3 }, now), /테스트 전용/)
  s.testMode = true
  for (const action of ['test_advance', 'test_reset']) assert.throws(() => mutate(s, { id: s.participants[0].id }, { action, week: 3 }, now))
})
test('테스트 1→3→종료 이동 후 공개 가능, 일반 주차 계산과 잠금 유지', () => {
  const s = fixture(); s.testMode = true
  const p = { id: s.participants[0].id }, admin = { admin: true }
  assert.equal(view(s, p, now).week, 1)
  assert.throws(() => mutate(s, p, { action: 'message', channel: 'friend', body: '아직 잠김' }, now))
  mutate(s, admin, { action: 'test_advance', week: 3 }, now)
  assert.equal(view(s, p, now).week, 3)
  mutate(s, p, { action: 'message', channel: 'friend', body: '기능 테스트' }, now)
  for (const week of [0, 1, 3, 10, '8']) assert.throws(() => mutate(s, admin, { action: 'test_advance', week }, now))
  mutate(s, admin, { action: 'test_advance', week: 9 }, now)
  assert.equal(s.startsAt + 8 * WEEK, now)
  assert.throws(() => mutate(s, p, { action: 'heart' }, now))
  mutate(s, admin, { action: 'reveal' }, now)
  assert.equal(view(s, p, now).reveal.length, 12)
  assert.throws(() => mutate(s, admin, { action: 'test_advance', week: 9 }, now))
})
test('초기화는 테스트 활동만 지우고 PIN·명단·배정을 보존하며 1주차로 복귀', () => {
  const s = fixture(); s.testMode = true
  const ids = structuredClone(s.participants), assignments = structuredClone(s.assignments)
  const p = { id: s.participants[0].id }, admin = { admin: true }
  mutate(s, admin, { action: 'test_advance', week: 3 }, now)
  mutate(s, p, { action: 'mission', week: 3 }, now)
  mutate(s, p, { action: 'prayer', body: '테스트 기도' }, now)
  mutate(s, p, { action: 'heart' }, now)
  mutate(s, p, { action: 'message', channel: 'friend', body: '테스트 편지' }, now)
  mutate(s, p, { action: 'suspect', participantId: s.participants[1].id }, now)
  mutate(s, admin, { action: 'test_advance', week: 9 }, now)
  mutate(s, admin, { action: 'reveal' }, now)
  mutate(s, admin, { action: 'test_reset' }, now)
  for (const key of ['missions', 'prayers', 'hearts', 'messages', 'suspicions']) assert.deepEqual(s[key], [])
  assert.deepEqual(s.participants, ids); assert.deepEqual(s.assignments, assignments)
  assert.equal(s.status, 'active'); assert.equal(view(s, p, now).week, 1)
  assert.equal(view(s, p, now).isTest, true)
  assert.ok(!('reveal' in view(s, p, now)))
})
