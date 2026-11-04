import test from 'node:test'
import assert from 'node:assert/strict'
import { makeHandler } from '../lib/secret-angel/server.mjs'
import { memoryDb, request } from './secret-angel-db.mjs'
import { verify } from '../lib/secret-angel/game.mjs'
import { makeGroupUrl } from '../lib/secret-angel/invite-link.mjs'
const spec={slug:'common-link',title:'공통 참여 테스트',names:['하늘','바다']}
const env={NODE_ENV:'production'}
const headers={host:'localhost:3018',origin:'https://localhost:3018'}
const cookieOf=r=>r.headers['set-cookie'].find(c=>c.startsWith('sa_session=')).split(';')[0]
async function fixture(){
 const db=memoryDb(), user=makeHandler(db,env), admin=makeHandler(db,env,{adminSurface:true})
 const call=(body={},cookie='',method='POST')=>request(user,body,{cookie,method,headers})
 const management=body=>request(admin,body,{headers})
 const created=await management({action:'create',...spec})
 const signup=(name,password='123456')=>call({action:'account_signup',slug:spec.slug,name,password})
 const login=(name='하늘',password='123456')=>call({action:'password_login',slug:spec.slug,name,password})
 return {db,user,admin,call,management,created,signup,login}
}
test('공통 링크 가입, 모임별 명단 제한, 안전한 해시·90일 HttpOnly 쿠키',async()=>{
 const f=await fixture()
 assert.equal(makeGroupUrl('https://example.com',spec.slug),'https://example.com/secret_angel?group=common-link')
 const info=await f.call({action:'group_info',slug:spec.slug});assert.equal(info.body.group.title,spec.title);assert.equal(info.body.group.participants,undefined)
 assert.equal((await f.signup('명단에 없음')).statusCode,409)
 for(const password of ['12345',' '.repeat(6),'x'.repeat(73),null])assert.equal((await f.signup('바다',password)).statusCode,400)
 const joined=await f.signup('하늘');assert.equal(joined.statusCode,200)
 const cookie=cookieOf(joined);assert.match(joined.headers['set-cookie'][0],/HttpOnly; SameSite=Strict; Max-Age=7776000; Secure/)
 assert.equal(joined.body.data.me.passwordConfigured,true)
 assert.ok(verify('123456',f.db.tables.secret_angel_seasons[0].state.participants[0].passwordHash))
 assert.ok(!JSON.stringify(f.db.tables).includes('123456'))
 assert.ok(!JSON.stringify(joined.body).includes('passwordHash'))
 assert.equal((await f.signup('하늘','999999')).statusCode,409)
 assert.equal((await f.call({},cookie,'GET')).statusCode,200)
})
test('다른 브라우저에서 동시 로그인·현재 브라우저만 로그아웃·동일 계정 기록 공유',async()=>{
 const f=await fixture(), first=await f.signup('하늘'), second=await f.login(), a=cookieOf(first), b=cookieOf(second)
 assert.notEqual(a,b)
 for(const cookie of [a,b])assert.equal((await f.call({},cookie,'GET')).statusCode,200)
 await f.signup('바다')
 assert.equal((await f.management({action:'start',slug:spec.slug,startsAt:new Date().toISOString()})).statusCode,200)
 assert.equal((await f.call({action:'mission',week:1},a)).statusCode,200)
 assert.equal((await f.call({},b,'GET')).body.data.me.points,10)
 assert.equal((await f.call({action:'logout'},a)).statusCode,200)
 assert.equal((await f.call({},a,'GET')).statusCode,401)
 assert.equal((await f.call({},b,'GET')).statusCode,200)
 assert.equal((await f.login()).statusCode,200)
})
test('비밀번호 변경은 현재 암호 필요, 이전 로그인과 이전 암호 폐기',async()=>{
 const f=await fixture(), a=cookieOf(await f.signup('하늘')), b=cookieOf(await f.login())
 assert.equal((await f.call({action:'set_password',currentPassword:'틀린비밀번호',password:'654321'},a)).statusCode,401)
 const changed=await f.call({action:'set_password',currentPassword:'123456',password:'654321'},a)
 assert.equal(changed.statusCode,200);const fresh=cookieOf(changed)
 assert.equal((await f.call({},a,'GET')).statusCode,401)
 assert.equal((await f.call({},b,'GET')).statusCode,401)
 assert.equal((await f.call({},fresh,'GET')).statusCode,200)
 assert.equal((await f.login('하늘','123456')).statusCode,401)
 assert.equal((await f.login('하늘','654321')).statusCode,200)
})
test('기존 기기에서는 본인 인증 후 첫 암호 설정, 이름만으로 기존 계정 탈취 불가',async()=>{
 const f=await fixture(), invite=f.created.body.invites[0]
 const registered=await f.call({action:'redeem_invite',slug:spec.slug,...invite})
 const device=registered.headers['set-cookie'].find(c=>c.startsWith('sa_device=')).split(';')[0]
 assert.equal((await f.signup('하늘')).statusCode,409)
 assert.equal((await f.call({action:'set_password',password:'123456'})).statusCode,401)
 const setup=await f.call({action:'set_password',password:'123456'},device)
 assert.equal(setup.statusCode,200);assert.equal(setup.body.data.me.passwordConfigured,true)
 assert.equal((await f.call({},device,'GET')).statusCode,401)
 assert.equal((await f.login()).statusCode,200)
})
test('초기화는 배정·활동 보존, 공통 링크 재가입 허용·기존 세션 폐기',async()=>{
 const f=await fixture(), cookie=cookieOf(await f.signup('하늘'));await f.signup('바다')
 await f.management({action:'start',slug:spec.slug,startsAt:new Date().toISOString()})
 await f.call({action:'mission',week:1},cookie)
 const before=structuredClone(f.db.tables.secret_angel_seasons[0].state)
 assert.equal((await f.call({action:'reset_account',slug:spec.slug,participantId:before.participants[0].id},cookie)).statusCode,403)
 assert.equal((await f.management({action:'reset_account',slug:spec.slug,participantId:before.participants[0].id})).statusCode,200)
 const state=f.db.tables.secret_angel_seasons[0].state
 assert.deepEqual(state.assignments,before.assignments);assert.deepEqual(state.missions,before.missions)
 assert.equal((await f.call({},cookie,'GET')).statusCode,401)
 const rejoined=await f.signup('하늘','654321');assert.equal(rejoined.statusCode,200);assert.equal(rejoined.body.data.me.points,10)
})
test('동시 이름 가입은 하나만 성공·암호 오류 횟수 제한·다른 모임 차단',async()=>{
 const f=await fixture();const results=await Promise.all([f.signup('하늘'),f.signup('하늘','654321')])
 assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409])
 const cookie=cookieOf(results.find(r=>r.statusCode===200))
 await f.management({action:'create',...spec,slug:'other-season'})
 assert.equal((await f.call({slug:'other-season'},cookie,'GET')).statusCode,403)
 let limited=false
 for(let i=0;i<10;i++){const r=await f.login('하늘','999999');if(r.statusCode===429){limited=true;break}assert.equal(r.statusCode,401)}
 assert.equal(limited,true)
})
