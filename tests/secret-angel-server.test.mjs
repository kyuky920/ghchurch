import test from 'node:test'
import assert from 'node:assert/strict'
import { makeHandler } from '../lib/secret-angel/server.mjs'
import { memoryDb, request } from './secret-angel-db.mjs'
import { hash, digest } from '../lib/secret-angel/game.mjs'
const password = 'test-only-secret-32-or-more-characters'
const env = { SECRET_ANGEL_ADMIN_SECRET: password, NODE_ENV: 'test' }
const spec = { slug: 'first-season', title: '청년부', names: Array.from({ length: 10 }, (_, i) => `청년${i}`) }
async function fixture() {
  const db = memoryDb(), handler = makeHandler(db, env), adminHandler = makeHandler(db, env, { adminSurface: true })
  const adminCookie = ''
  const created = await request(adminHandler, { action: 'create', ...spec }, { cookie: adminCookie })
  assert.equal(created.statusCode, 200)
  const invite = created.body.invites[0]
  const joined = await request(handler, { action: 'join', slug: spec.slug, name: invite.name, code: invite.code, pin: '123456' })
  assert.equal(joined.statusCode, 200)
  return { db, handler, adminHandler, adminCookie, userCookie: joined.headers['set-cookie'].split(';')[0], created }
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
  const { handler, adminHandler, userCookie, adminCookie } = await fixture()
  let res = await request(handler, { action: 'create', ...spec, slug: 'another-season', admin: true }, { cookie: userCookie })
  assert.equal(res.statusCode, 403)
  await request(adminHandler, { action: 'create', ...spec, slug: 'another-season' }, { cookie: adminCookie })
  res = await request(handler, { slug: 'another-season' }, { method: 'GET', cookie: userCookie })
  assert.equal(res.statusCode, 403)
  res = await request(handler, { slug: spec.slug, admin: true }, { method: 'GET', cookie: userCookie })
  assert.equal(res.statusCode, 200); assert.ok(!res.body.data.admin)
  for (const field of ['pinHash', 'inviteHash', 'assignments', 'epoch']) assert.ok(!JSON.stringify(res.body).includes(`"${field}"`))
})
test('PIN 재발급은 기존 세션 무효화, 새 PIN만 유효', async () => {
  const { db, handler, adminHandler, userCookie, adminCookie } = await fixture()
  const participantId = db.tables.secret_angel_seasons[0].state.participants[0].id
  const reset = await request(adminHandler, { action: 'reset_pin', slug: spec.slug, participantId }, { cookie: adminCookie })
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
  const { db, handler, adminHandler, userCookie, adminCookie } = await fixture()
  const s = db.tables.secret_angel_seasons[0].state
  s.participants.forEach(p => { p.pinHash ||= hash('123456') })
  db.conflicts = 1
  const start = await request(adminHandler, { action: 'start', slug: spec.slug, startsAt: new Date().toISOString() }, { cookie: adminCookie })
  assert.equal(start.statusCode, 200)
  const results = await Promise.all(Array.from({ length: 3 }, () => request(handler, { action: 'mission', slug: spec.slug, week: 1 }, { cookie: userCookie })))
  assert.equal(results.filter(x => x.statusCode === 200).length, 1)
  assert.equal(db.tables.secret_angel_seasons[0].state.missions.length, 1)
})
test('모임 삭제는 관리자·코드 확인 필요, 관련 세션 삭제', async () => {
  const { db, handler, adminHandler, userCookie, adminCookie } = await fixture()
  let res = await request(handler, { action: 'delete', slug: spec.slug, confirm: spec.slug }, { cookie: userCookie }); assert.equal(res.statusCode, 403)
  res = await request(adminHandler, { action: 'delete', slug: spec.slug, confirm: 'wrong' }, { cookie: adminCookie }); assert.equal(res.statusCode, 403)
  res = await request(adminHandler, { action: 'delete', slug: spec.slug, confirm: spec.slug }, { cookie: adminCookie }); assert.equal(res.statusCode, 200)
  assert.equal(db.tables.secret_angel_seasons.length, 0)
  assert.equal(db.tables.secret_angel_sessions.filter(x => !x.is_admin).length, 0)
})

test('관리 API는 비밀번호·환경변수·쿠키 없이 조회와 생성 가능', async () => {
  const db = memoryDb(), handler = makeHandler(db, {}, { adminSurface: true })
  let res = await request(handler, {}, { method: 'GET' })
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body.seasons, [])
  res = await request(handler, { action: 'create', ...spec })
  assert.equal(res.statusCode, 200); assert.equal(res.body.invites.length, 10)
  res = await request(handler, { slug: spec.slug }, { method: 'GET', cookie: 'unrelated=ignored' })
  assert.equal(res.statusCode, 200); assert.equal(res.body.data.admin, true)
  assert.equal(res.headers['set-cookie'], undefined)
  assert.equal(db.tables.secret_angel_sessions.length, 0)
  assert.match(res.headers['cache-control'], /no-store/)
})
test('관리자 로그인·로그아웃 제거, 참가자 인증과 관리 경로 구분 유지', async () => {
  const { db, handler, adminHandler, userCookie } = await fixture()
  for (const action of ['admin_login', 'logout']) assert.equal((await request(adminHandler, { action, password: 'anything' })).statusCode, 410)
  for (const action of ['login', 'join']) assert.equal((await request(adminHandler, { action })).statusCode, 403)
  for (const action of ['admin_login', 'create', 'start', 'reset_pin', 'reveal', 'delete', 'test_advance', 'test_reset']) {
    assert.equal((await request(handler, { action, slug: spec.slug }, { cookie: userCookie })).statusCode, 403)
  }
  assert.equal((await request(adminHandler, {}, { method: 'GET', cookie: userCookie })).statusCode, 200)
  assert.equal((await request(handler, {}, { method: 'GET' })).statusCode, 401)
  const raw = 'a'.repeat(64)
  db.tables.secret_angel_sessions.push({ token_hash: digest(raw), is_admin: true, expires_at: new Date(Date.now()+60000).toISOString() })
  assert.equal((await request(handler, {}, { method: 'GET', cookie: 'sa_session='+raw })).statusCode, 403)
})
test('공개 관리 변경도 출처·JSON·메서드와 삭제 코드 확인 유지', async () => {
  const { adminHandler } = await fixture()
  let res = await request(adminHandler, { action: 'delete', slug: spec.slug, confirm: spec.slug }, { headers: { origin: 'https://other.example' } })
  assert.equal(res.statusCode, 403)
  res = await request(adminHandler, { action: 'delete', slug: spec.slug, confirm: spec.slug }, { headers: { 'content-type': 'text/plain' } })
  assert.equal(res.statusCode, 415)
  res = await request(adminHandler, {}, { method: 'DELETE' }); assert.equal(res.statusCode, 405)
  res = await request(adminHandler, { action: 'delete', slug: spec.slug, confirm: 'wrong' }); assert.equal(res.statusCode, 403)
})
test('공개 관리 요청 제한은 쿠키가 바뀌어도 같은 DB 제한을 사용', async () => {
  const db = memoryDb(), handler = makeHandler(db, env, { adminSurface: true })
  for (let i = 0; i < 120; i++) assert.equal((await request(handler, {}, { method: 'GET', cookie: `arbitrary=${i}` })).statusCode, 200)
  const second = makeHandler(db, env, { adminSurface: true })
  const res = await request(second, {}, { method: 'GET' })
  assert.equal(res.statusCode, 429); assert.equal(res.headers['retry-after'], '900')
})
test('공개 관리에서도 일반 모임의 테스트 주차 이동·초기화는 금지', async () => {
  const { adminHandler } = await fixture()
  for (const action of ['test_advance', 'test_reset']) {
    const res = await request(adminHandler, { action, slug: spec.slug, week: 3 })
    assert.equal(res.statusCode, 403)
  }
})
test('공개 관리에서 DB 장애 상세 내용은 전달하지 않음', async () => {
  const db = memoryDb(); db.fail = true
  const handler = makeHandler(db, {}, { adminSurface: true })
  const res = await request(handler, {}, { method: 'GET' })
  assert.equal(res.statusCode, 500)
  assert.ok(!JSON.stringify(res.body).includes('private database detail'))
})

test('공개 관리 API가 서로 다른 인원수로 모임 생성하고 1명·중복은 거절', async () => {
  const db = memoryDb(), handler = makeHandler(db, {}, { adminSurface: true })
  for (const count of [2, 9, 21, 40]) {
    const res = await request(handler, { action: 'create', slug: `count-${count}`, title: '인원 가변 모임', names: Array.from({ length: count }, (_, i) => `참가자${i + 1}`) })
    assert.equal(res.statusCode, 200); assert.equal(res.body.invites.length, count)
  }
  for (const names of [['혼자'], ['중복', '중복']]) {
    const res = await request(handler, { action: 'create', slug: 'invalid-count', title: '검증', names })
    assert.equal(res.statusCode, 400)
  }
})
