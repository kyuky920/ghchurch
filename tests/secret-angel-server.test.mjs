import test from 'node:test'
import assert from 'node:assert/strict'
import { makeHandler } from '../lib/secret-angel/server.mjs'
import { memoryDb, request } from './secret-angel-db.mjs'
import { hash, digest } from '../lib/secret-angel/game.mjs'
const password = 'test-only-secret-32-or-more-characters'
const env = { SECRET_ANGEL_ADMIN_SECRET: password, NODE_ENV: 'test' }
const spec = { slug: 'first-season', title: '청년부', names: Array.from({ length: 10 }, (_, i) => `청년${i}`) }
async function fixture() {
  const db = memoryDb(), handler = makeHandler(db, env)
  const login = await request(handler, { action: 'admin_login', password })
  const adminCookie = login.headers['set-cookie'].split(';')[0]
  const created = await request(handler, { action: 'create', ...spec }, { cookie: adminCookie })
  assert.equal(created.statusCode, 200)
  const invite = created.body.invites[0]
  const joined = await request(handler, { action: 'join', slug: spec.slug, name: invite.name, code: invite.code, pin: '123456' })
  assert.equal(joined.statusCode, 200)
  return { db, handler, adminCookie, userCookie: joined.headers['set-cookie'].split(';')[0], created }
}

test('미인증·미지원 메서드 차단, no-store와 HttpOnly 세션', async () => {
  const { handler, userCookie } = await fixture()
  let res = await request(handler, { slug: spec.slug }, { method: 'GET' })
  assert.equal(res.statusCode, 401); assert.match(res.headers['cache-control'], /no-store/)
  res = await request(handler, {}, { method: 'DELETE', cookie: userCookie })
  assert.equal(res.statusCode, 405); assert.equal(res.headers.allow, 'GET, POST')
  res = await request(handler, { action: 'login', slug: spec.slug, name: spec.names[0], pin: '123456' })
  assert.match(res.headers['set-cookie'], /HttpOnly; SameSite=Strict/)
  assert.ok(!('token' in res.body)); assert.equal(res.body.ok, true)
})
test('브라우저 교차 출처 및 JSON 이외의 요청 차단', async () => {
  const { handler, userCookie } = await fixture()
  const res = await request(handler, { action: 'heart', slug: spec.slug }, { cookie: userCookie, headers: { origin: 'https://evil.example' } })
  assert.equal(res.statusCode, 403)
  const form = await request(handler, { action: 'logout' }, { cookie: userCookie, headers: { 'content-type': 'text/plain' } })
  assert.equal(form.statusCode, 415)
})
test('참가자 관리자 위조·교차 모임 접근·명단/배정 누출 차단', async () => {
  const { handler, userCookie, adminCookie } = await fixture()
  let res = await request(handler, { action: 'create', ...spec, slug: 'another-season', admin: true }, { cookie: userCookie })
  assert.equal(res.statusCode, 403)
  await request(handler, { action: 'create', ...spec, slug: 'another-season' }, { cookie: adminCookie })
  res = await request(handler, { slug: 'another-season' }, { method: 'GET', cookie: userCookie })
  assert.equal(res.statusCode, 403)
  res = await request(handler, { slug: spec.slug, admin: true }, { method: 'GET', cookie: userCookie })
  assert.equal(res.statusCode, 200); assert.ok(!res.body.data.admin)
  for (const field of ['pinHash', 'inviteHash', 'assignments', 'epoch']) assert.ok(!JSON.stringify(res.body).includes(`"${field}"`))
})
test('PIN 재발급은 기존 세션 무효화, 새 PIN만 유효', async () => {
  const { db, handler, userCookie, adminCookie } = await fixture()
  const participantId = db.tables.secret_angel_seasons[0].state.participants[0].id
  const reset = await request(handler, { action: 'reset_pin', slug: spec.slug, participantId }, { cookie: adminCookie })
  assert.equal(reset.statusCode, 200)
  let res = await request(handler, { slug: spec.slug }, { method: 'GET', cookie: userCookie })
  assert.equal(res.statusCode, 401)
  const joined = await request(handler, { action: 'join', slug: spec.slug, name: spec.names[0], code: reset.body.invites[0].code, pin: '777777' })
  assert.equal(joined.statusCode, 200)
  res = await request(handler, { slug: spec.slug }, { method: 'GET', cookie: userCookie }); assert.equal(res.statusCode, 401)
  res = await request(handler, { action: 'login', slug: spec.slug, name: spec.names[0], pin: '123456' }); assert.equal(res.statusCode, 401)
})
test('로그아웃/만료/위조 쿠키 차단 및 DB에는 토큰 해시만 저장', async () => {
  const { db, handler, userCookie } = await fixture()
  const raw = userCookie.split('=')[1]
  assert.equal(db.tables.secret_angel_sessions.find(x => x.token_hash === digest(raw)).is_admin, false)
  assert.ok(!JSON.stringify(db.tables.secret_angel_sessions).includes(raw))
  let res = await request(handler, { action: 'logout' }, { cookie: userCookie }); assert.equal(res.statusCode, 200); assert.match(res.headers['set-cookie'], /Max-Age=0/)
  res = await request(handler, {}, { method: 'GET', cookie: userCookie }); assert.equal(res.statusCode, 401)
  res = await request(handler, {}, { method: 'GET', cookie: 'sa_session=fake' }); assert.equal(res.statusCode, 401)
  const login = await request(handler, { action: 'login', slug: spec.slug, name: spec.names[0], pin: '123456' })
  db.tables.secret_angel_sessions.find(x => !x.is_admin).expires_at = new Date(Date.now() - 1).toISOString()
  res = await request(handler, {}, { method: 'GET', cookie: login.headers['set-cookie'].split(';')[0] }); assert.equal(res.statusCode, 401)
})
test('계정별 지속 제한은 서버 인스턴스가 달라도 적용', async () => {
  const { db, handler } = await fixture()
  for (let i = 0; i < 6; i++) assert.equal((await request(handler, { action: 'login', slug: spec.slug, name: spec.names[0], pin: '999999' })).statusCode, 401)
  const secondHandler = makeHandler(db, env)
  assert.equal((await request(secondHandler, { action: 'login', slug: spec.slug, name: spec.names[0], pin: '999999' })).statusCode, 401)
  const limited = await request(secondHandler, { action: 'login', slug: spec.slug, name: spec.names[0], pin: '123456' })
  assert.equal(limited.statusCode, 429); assert.equal(limited.headers['retry-after'], '900')
})
test('원자적 버전 충돌 재시도와 동시 미션 중복 방지', async () => {
  const { db, handler, userCookie, adminCookie } = await fixture()
  const s = db.tables.secret_angel_seasons[0].state
  s.participants.forEach(p => { p.pinHash ||= hash('123456') })
  db.conflicts = 1
  const start = await request(handler, { action: 'start', slug: spec.slug, startsAt: new Date().toISOString() }, { cookie: adminCookie })
  assert.equal(start.statusCode, 200)
  const results = await Promise.all(Array.from({ length: 3 }, () => request(handler, { action: 'mission', slug: spec.slug, week: 1 }, { cookie: userCookie })))
  assert.equal(results.filter(x => x.statusCode === 200).length, 1)
  assert.equal(db.tables.secret_angel_seasons[0].state.missions.length, 1)
})
test('DB 오류 상세 노출 안 함, 관리자 비밀번호 미설정 시 닫힘', async () => {
  const db = memoryDb(), handler = makeHandler(db, {})
  let res = await request(handler, { action: 'admin_login', password }); assert.equal(res.statusCode, 503)
  db.fail = true
  res = await request(handler, { action: 'admin_login', password }); assert.equal(res.statusCode, 500)
  assert.ok(!JSON.stringify(res.body).includes('private database detail'))
})
test('모임 삭제는 관리자·코드 확인 필요, 관련 세션 삭제', async () => {
  const { db, handler, userCookie, adminCookie } = await fixture()
  let res = await request(handler, { action: 'delete', slug: spec.slug, confirm: spec.slug }, { cookie: userCookie }); assert.equal(res.statusCode, 403)
  res = await request(handler, { action: 'delete', slug: spec.slug, confirm: 'wrong' }, { cookie: adminCookie }); assert.equal(res.statusCode, 403)
  res = await request(handler, { action: 'delete', slug: spec.slug, confirm: spec.slug }, { cookie: adminCookie }); assert.equal(res.statusCode, 200)
  assert.equal(db.tables.secret_angel_seasons.length, 0)
  assert.equal(db.tables.secret_angel_sessions.filter(x => !x.is_admin).length, 0)
})
