import test from 'node:test'
import assert from 'node:assert/strict'
import { makeHandler } from '../lib/secret-angel/server.mjs'
import { memoryDb, request } from './secret-angel-db.mjs'
import { hash, digest, DEVICE_TTL } from '../lib/secret-angel/game.mjs'
const env = { NODE_ENV: 'test' }
const spec = { slug: 'first-season', title: '청년부', names: Array.from({ length: 10 }, (_, i) => `청년${i}`) }
function cookieOf(res) { return res.headers['set-cookie'].find(x => x.startsWith('sa_device=')).split(';')[0] }
async function fixture() {
  const db = memoryDb(), handler = makeHandler(db, env), adminHandler = makeHandler(db, env, { adminSurface: true })
  const created = await request(adminHandler, { action: 'create', ...spec })
  const invite = created.body.invites[0]
  const input = { slug: spec.slug, ...invite, action: 'redeem_invite', deviceName: '내 휴대폰' }
  const joined = await request(handler, input)
  assert.equal(joined.statusCode, 200)
  return { db, handler, adminHandler, created, invite, joined, userCookie: cookieOf(joined) }
}

test('초대 링크로 이름 확인 후 PIN 없이 기기 등록, 90일 HttpOnly 쿠키, 토큰은 응답·DB 평문에 없음', async () => {
  const { db, handler, userCookie, joined, created } = await fixture()
  const header = joined.headers['set-cookie'][0]
  assert.match(header, /Path=\/api\/secret-angel; HttpOnly; SameSite=Strict/)
  assert.match(header, new RegExp(`Max-Age=${DEVICE_TTL / 1000}`))
  const credential = JSON.parse(Buffer.from(userCookie.slice('sa_device='.length), 'base64url').toString())
  assert.ok(!JSON.stringify(joined.body).includes(credential.token))
  assert.ok(!JSON.stringify(db.tables).includes(credential.token))
  const p = db.tables.secret_angel_seasons[0].state.participants[0]
  assert.equal(p.deviceTokenHash, digest(credential.token)); assert.equal(p.inviteHash, null); assert.equal(p.pinHash, null)
  assert.equal(db.tables.secret_angel_sessions.length, 0)
  assert.equal((await request(handler, {}, { method: 'GET', cookie: userCookie })).body.data.me.name, spec.names[0])
  const next = created.body.invites[1]
  const preview = await request(handler, { action: 'invite_info', slug: spec.slug, ...next })
  assert.equal(preview.statusCode, 200)
  assert.deepEqual(Object.keys(preview.body.invitation).sort(), ['name', 'participantId', 'slug', 'title'])
})
test('초대는 한번만 사용 가능하며 동시 기기 등록에서도 한 요청만 성공', async () => {
  const { db, handler, created, invite } = await fixture()
  assert.equal((await request(handler, { action: 'invite_info', slug: spec.slug, ...invite })).statusCode, 401)
  const input = { action: 'redeem_invite', slug: spec.slug, ...created.body.invites[1] }
  const results = await Promise.all([request(handler, input), request(handler, input)])
  assert.deepEqual(results.map(x => x.statusCode).sort(), [200, 401])
  assert.equal(db.tables.secret_angel_seasons[0].state.participants[1].epoch, 1)
})
test('만료·틀린 참가자·이름·위조 토큰 거절, 타 모임 접근 차단', async () => {
  const { db, handler, adminHandler, userCookie, created } = await fixture()
  const next = created.body.invites[1]
  let res = await request(handler, { action: 'redeem_invite', slug: spec.slug, ...next, name: '다른 이름' })
  assert.equal(res.statusCode, 400)
  res = await request(handler, { action: 'invite_info', slug: spec.slug, ...next, participantId: created.body.invites[2].participantId })
  assert.equal(res.statusCode, 401)
  db.tables.secret_angel_seasons[0].state.participants[1].inviteExpiresAt = Date.now() - 1
  assert.equal((await request(handler, { action: 'invite_info', slug: spec.slug, ...next })).statusCode, 401)
  const credential = JSON.parse(Buffer.from(userCookie.slice('sa_device='.length), 'base64url').toString())
  credential.token = '0'.repeat(64)
  const fake = 'sa_device='+Buffer.from(JSON.stringify(credential)).toString('base64url')
  assert.equal((await request(handler, {}, { method: 'GET', cookie: fake })).statusCode, 401)
  await request(adminHandler, { action: 'create', ...spec, slug: 'other-season' })
  assert.equal((await request(handler, { slug: 'other-season' }, { method: 'GET', cookie: userCookie })).statusCode, 403)
  db.tables.secret_angel_seasons[0].state.participants[0].deviceExpiresAt = Date.now() - 1
  assert.equal((await request(handler, {}, { method: 'GET', cookie: userCookie })).statusCode, 401)
})
test('링크 재발급은 해당 기기만 즉시 해제하고 새 링크로 재등록 가능', async () => {
  const { handler, adminHandler, userCookie, created } = await fixture()
  const second = await request(handler, { action: 'redeem_invite', slug: spec.slug, ...created.body.invites[1] })
  const reset = await request(adminHandler, { action: 'reset_link', slug: spec.slug, participantId: created.body.invites[0].participantId })
  assert.equal(reset.statusCode, 200)
  assert.equal((await request(handler, {}, { method: 'GET', cookie: userCookie })).statusCode, 401)
  assert.equal((await request(handler, {}, { method: 'GET', cookie: cookieOf(second) })).statusCode, 200)
  const replacement = await request(handler, { action: 'redeem_invite', slug: spec.slug, ...reset.body.invites[0] })
  assert.equal(replacement.statusCode, 200)
  assert.equal((await request(handler, {}, { method: 'GET', cookie: cookieOf(replacement) })).statusCode, 200)
  assert.equal((await request(handler, {}, { method: 'GET', cookie: userCookie })).statusCode, 401)
})
test('전체 링크 발급은 기존 링크/기기를 해제하며 명단과 배정은 보존', async () => {
  const { db, handler, adminHandler, userCookie, created } = await fixture()
  const s = db.tables.secret_angel_seasons[0].state
  const ids = s.participants.map(p => p.id)
  const result = await request(adminHandler, { action: 'reset_links', slug: spec.slug })
  assert.equal(result.statusCode, 200); assert.equal(result.body.invites.length, 10)
  assert.deepEqual(db.tables.secret_angel_seasons[0].state.participants.map(p => p.id), ids)
  assert.equal((await request(handler, {}, { method: 'GET', cookie: userCookie })).statusCode, 401)
  assert.equal((await request(handler, { action: 'invite_info', slug: spec.slug, ...created.body.invites[1] })).statusCode, 401)
  const preview = await request(handler, { action: 'invite_info', slug: spec.slug, ...result.body.invites[1] })
  assert.equal(preview.statusCode, 200)
})
test('기기 해제는 자동 접속을 취소하고 90일 쿠키 삭제, 이전 PIN 로그인 종료', async () => {
  const { handler, userCookie } = await fixture()
  const logout = await request(handler, { action: 'logout' }, { cookie: userCookie })
  assert.equal(logout.statusCode, 200)
  assert.ok(logout.headers['set-cookie'].every(x => x.includes('Max-Age=0')))
  assert.equal((await request(handler, {}, { method: 'GET', cookie: userCookie })).statusCode, 401)
  for (const action of ['login', 'join']) assert.equal((await request(handler, { action, slug: spec.slug, name: spec.names[0], pin: '123456' })).statusCode, 410)
})
test('기존 미만료 세션은 유지하되 링크 재발급 후에는 차단', async () => {
  const { db, handler, adminHandler } = await fixture()
  const p = db.tables.secret_angel_seasons[0].state.participants[0]
  p.pinHash = hash('123456'); p.registeredAt = null; p.deviceTokenHash = null; p.epoch = 0
  const raw = 'b'.repeat(64)
  db.tables.secret_angel_sessions.push({ token_hash: digest(raw), season_slug: spec.slug, participant_id: p.id, epoch: 0, is_admin: false, expires_at: new Date(Date.now()+60000).toISOString() })
  const cookie = 'sa_session='+raw
  assert.equal((await request(handler, {}, { method: 'GET', cookie })).statusCode, 200)
  await request(adminHandler, { action: 'reset_link', slug: spec.slug, participantId: p.id })
  assert.equal((await request(handler, {}, { method: 'GET', cookie })).statusCode, 401)
})
test('API 출처·JSON·메서드·캐시 보호와 운영 Secure 쿠키 유지', async () => {
  const { db, handler, created, userCookie } = await fixture()
  let res = await request(handler, {}, { method: 'GET' }); assert.equal(res.statusCode, 401); assert.match(res.headers['cache-control'], /no-store/)
  res = await request(handler, {}, { method: 'DELETE' }); assert.equal(res.statusCode, 405)
  res = await request(handler, { action: 'logout' }, { cookie: userCookie, headers: { origin: 'https://other.example' } }); assert.equal(res.statusCode, 403)
  res = await request(handler, { action: 'logout' }, { cookie: userCookie, headers: { 'content-type': 'text/plain' } }); assert.equal(res.statusCode, 415)
  const prod = makeHandler(db, { NODE_ENV: 'production' })
  res = await request(prod, { action: 'redeem_invite', slug: spec.slug, ...created.body.invites[1] }, { headers: { origin: 'https://localhost:3018' } })
  assert.equal(res.statusCode, 200); assert.match(res.headers['set-cookie'][0], /; Secure/)
})
test('초대 요청 제한은 서버 인스턴스 간 공유', async () => {
  const { db, handler, created } = await fixture()
  const body = { action: 'invite_info', slug: spec.slug, ...created.body.invites[1] }
  for (let i = 0; i < 20; i++) assert.equal((await request(handler, body)).statusCode, 200)
  const res = await request(makeHandler(db, env), body)
  assert.equal(res.statusCode, 429); assert.equal(res.headers['retry-after'], '900')
})
test('기기 등록 충돌 재시도, 미션 중복 방지, 개인정보 응답 범위', async () => {
  const { db, handler, adminHandler, userCookie, created } = await fixture()
  db.conflicts = 1
  const reset = await request(adminHandler, { action: 'reset_link', slug: spec.slug, participantId: created.body.invites[1].participantId })
  assert.equal(reset.statusCode, 200)
  const s = db.tables.secret_angel_seasons[0].state
  s.participants.forEach(p => { p.pinHash ||= hash('123456') })
  assert.equal((await request(adminHandler, { action: 'start', slug: spec.slug, startsAt: new Date().toISOString() })).statusCode, 200)
  const results = await Promise.all([1,2,3].map(() => request(handler, { action: 'mission', week: 1 }, { cookie: userCookie })))
  assert.equal(results.filter(x => x.statusCode===200).length, 1)
  const v = await request(handler, {}, { method: 'GET', cookie: userCookie })
  for (const key of ['pinHash','inviteHash','deviceTokenHash','deviceExpiresAt','assignments']) assert.ok(!JSON.stringify(v.body).includes(`"${key}"`))
})
test('관리 API는 공개이며 참가자 기기 없이 조회 가능, 참가자 경로에서 관리 변경 금지', async () => {
  const { handler, adminHandler, userCookie } = await fixture()
  assert.equal((await request(adminHandler, {}, { method: 'GET' })).statusCode, 200)
  for (const action of ['admin_login','create','start','reset_link','reset_links','reveal','delete','test_advance','test_reset']) assert.equal((await request(handler, { action }, { cookie: userCookie })).statusCode, 403)
  for (const action of ['invite_info','redeem_invite']) assert.equal((await request(adminHandler, { action })).statusCode, 403)
})
test('공개 관리 삭제 코드·요청 제한·일반 모임 테스트 기능 차단', async () => {
  const { adminHandler } = await fixture()
  assert.equal((await request(adminHandler, { action: 'delete', slug: spec.slug, confirm: 'wrong' })).statusCode, 403)
  for (const action of ['test_advance','test_reset']) assert.equal((await request(adminHandler, { action, slug: spec.slug, week: 3 })).statusCode, 403)
  const db = memoryDb(), h = makeHandler(db, {}, { adminSurface: true })
  for (let i = 0; i < 120; i++) assert.equal((await request(h, {}, { method: 'GET' })).statusCode, 200)
  assert.equal((await request(h, {}, { method: 'GET' })).statusCode, 429)
})
test('모임 삭제 시 기존 기기 접속 차단 및 가변 인원 생성·DB 오류 처리', async () => {
  const { db, handler, adminHandler, userCookie } = await fixture()
  assert.equal((await request(adminHandler, { action: 'delete', slug: spec.slug, confirm: spec.slug })).statusCode, 200)
  assert.equal((await request(handler, {}, { method: 'GET', cookie: userCookie })).statusCode, 401)
  for (const count of [2,9,21,40]) {
    const res = await request(adminHandler, { action: 'create', slug: `count-${count}`, title: '가변 모임', names: Array.from({length:count},(_,i)=>`참가자${i}`) })
    assert.equal(res.statusCode, 200); assert.equal(res.body.invites.length, count)
  }
  db.fail = true
  const res = await request(adminHandler, {}, { method: 'GET' }); assert.equal(res.statusCode, 500); assert.ok(!JSON.stringify(res.body).includes('private database detail'))
})
