import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { makeHandler } from '../lib/secret-angel/server.mjs'
import { newSeason, mutate, view, WEEK, digest } from '../lib/secret-angel/game.mjs'
import { canReadPhoto, weeklyNotices } from '../lib/secret-angel/social.mjs'
import { cleanPhoto } from '../lib/secret-angel/media.mjs'
import { pushSubscription, payloadFor } from '../lib/secret-angel/push.mjs'
import { memoryDb, request } from './secret-angel-db.mjs'
const now = Date.now()
function state() {
  const { state: s } = newSeason({ slug: 'social-test', title: '테스트', names: ['하늘','바다','나무','햇살'] })
  s.status = 'active'; s.startsAt = now - 2 * WEEK
  const ids = s.participants.map(p => p.id)
  s.assignments = Object.fromEntries(ids.map((id,i) => [id, ids[(i+1)%ids.length]]))
  return s
}
const actor = (s,i=0) => ({ id: s.participants[i].id })
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test-device', keys: { p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 5).toString('base64url') } }
const png = async () => (await sharp({ create: { width: 20, height: 10, channels: 3, background: '#426443' } }).png().toBuffer()).toString('base64')
async function fixture(sender = async () => {}) {
  const db = memoryDb(), s = state(), token = 'a'.repeat(64), cookie = 'sa_device='+Buffer.from(JSON.stringify({ slug: s.slug, id: s.participants[0].id, token })).toString('base64url')
  for (const p of s.participants) { p.registeredAt = new Date().toISOString(); p.deviceTokenHash = digest(token); p.deviceExpiresAt = now + WEEK; p.epoch = 1 }
  db.tables.secret_angel_seasons.push({ slug: s.slug, version: 0, state: s })
  const files = new Map()
  db.storage = { from: () => ({ upload: async (path, bytes) => { files.set(path, bytes); return { data: { path } } }, remove: async paths => { paths.forEach(path => files.delete(path)); return { data: [] } }, createSignedUrl: async path => ({ data: { signedUrl: 'https://storage.example/signed/'+path } }) }) }
  const env = { NODE_ENV: 'test', SECRET_ANGEL_VAPID_PUBLIC_KEY: 'public', SECRET_ANGEL_VAPID_PRIVATE_KEY: 'private', CRON_SECRET: 'cron-test-secret' }
  const handler = makeHandler(db, env, { pushSender: sender })
  return { db, files, handler, cookie, s, env, call: body => request(handler, body, { cookie }) }
}
test('공동 순위·배지·나무는 미션만 반영하며 동점과 기존 완료 기록 지원', () => {
  const s = state(), a = actor(s), b = actor(s,1)
  for (let week=1;week<=3;week++) mutate(s,a,{ action:'mission',week },now)
  mutate(s,b,{ action:'mission',week:1 },now)
  mutate(s,actor(s,2),{ action:'mission',week:1 },now)
  const v = view(s,a,now)
  assert.deepEqual(v.leaderboard.map(p=>p.rank),[1,2,2,4])
  assert.equal(v.garden.total,5); assert.equal(v.garden.weekCompleted,1)
  assert.deepEqual(v.badges.map(b=>b.earned),[true,true,false])
  assert.equal(v.leaderboard[0].points,30)
  assert.ok(!JSON.stringify(v.leaderboard).includes('missionId'))
})
test('실천 전달은 선택 사항, 받은 사람만 열람·공개 전 이름/시각 비공개·공개 후 작성자 표시', () => {
  const s=state(), a=actor(s)
  mutate(s,a,{action:'mission',week:1,note:'개인 기록'},now)
  assert.deepEqual(view(s,actor(s,1),now).footprints,[])
  mutate(s,a,{action:'mission_share',week:1,note:'함께 기도했어요',shared:true},now)
  const footprint=view(s,actor(s,1),now).footprints[0]
  assert.equal(footprint.note,'함께 기도했어요')
  assert.deepEqual(Object.keys(footprint).sort(),['note','photoId','title','week'])
  assert.deepEqual(view(s,actor(s,2),now).footprints,[])
  assert.throws(()=>mutate(s,actor(s,1),{action:'mission_share',week:1,shared:true},now))
  mutate(s,a,{action:'mission_share',week:1,shared:true,note:'수정'},now)
  assert.equal(s.notifications.length,1)
  s.status='revealed'; assert.equal(view(s,actor(s,1),now).footprints[0].name,'하늘')
  mutate(s,a,{action:'mission_share',week:1,shared:false},now)
  assert.deepEqual(view(s,actor(s,1),now).footprints,[])
})
test('편지·실천 사진은 소유자와 해당 수신자만 접근, 전달 취소는 접근도 취소', () => {
  const s=state(), a=actor(s); s.photos=[{id:'photo-a',by:a.id,path:'private/a.jpg'}]
  mutate(s,a,{action:'mission',week:1,photoId:'photo-a',shared:false},now)
  assert.equal(canReadPhoto(s,actor(s,1),'photo-a'),false)
  mutate(s,a,{action:'mission_share',week:1,photoId:'photo-a',shared:true},now)
  assert.equal(canReadPhoto(s,actor(s,1),'photo-a'),true)
  assert.equal(canReadPhoto(s,actor(s,2),'photo-a'),false)
  assert.equal(canReadPhoto(s,{admin:true},'photo-a'),false)
  assert.throws(()=>mutate(s,actor(s,2),{action:'mission',week:1,photoId:'photo-a'},now))
  mutate(s,a,{action:'mission_share',week:1,shared:false},now)
  assert.equal(canReadPhoto(s,actor(s,1),'photo-a'),false)
  mutate(s,a,{action:'message',channel:'friend',photoId:'photo-a'},now)
  assert.equal(canReadPhoto(s,actor(s,1),'photo-a'),true)
  assert.equal(view(s,actor(s,1),now).messages.angel[0].photoId,'photo-a')
})
test('의심·답변·편지·기도 알림은 수신자 한정, 읽음 처리와 주차 알림 중복 방지', () => {
  const s=state(), a=actor(s), b=actor(s,1)
  mutate(s,a,{action:'suspect',participantId:b.id},now)
  const suspicion=s.suspicions[0]
  mutate(s,b,{action:'reply',id:suspicion.id,body:'쉿, 비밀이에요 🤫'},now)
  mutate(s,a,{action:'message',channel:'friend',body:'비밀 내용'},now)
  weeklyNotices(s,now); const n=s.notifications.length; weeklyNotices(s,now); assert.equal(s.notifications.length,n)
  assert.equal(view(s,b,now).notifications.filter(n=>n.type==='message')[0].channel,'angel')
  assert.equal(view(s,actor(s,2),now).notifications.filter(n=>n.type==='suspect').length,0)
  const payload=JSON.stringify(payloadFor(s.notifications.find(n=>n.type==='message')))
  assert.ok(!payload.includes('비밀 내용')); assert.ok(!payload.includes('하늘'))
  mutate(s,b,{action:'read_notifications'},now); assert.ok(view(s,b,now).notifications.every(n=>n.read))
  assert.ok(view(s,a,now).notifications.some(n=>!n.read))
})
test('사진은 서버에서 재인코딩하여 메타데이터 제거, 크기 제한·위장 형식 차단', async () => {
  const original=await sharp({create:{width:1800,height:900,channels:3,background:'#426443'}}).withMetadata({exif:{IFD0:{Artist:'private-name',Copyright:'private'}}}).jpeg().toBuffer()
  const cleaned=await cleanPhoto('data:image/jpeg;base64,'+original.toString('base64'))
  const metadata=await sharp(cleaned).metadata()
  assert.equal(metadata.width,1200); assert.equal(metadata.format,'jpeg'); assert.equal(metadata.exif,undefined)
  await assert.rejects(()=>cleanPhoto('data:image/jpeg;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>').toString('base64')))
  await assert.rejects(()=>cleanPhoto('data:image/png;base64,'+'a'.repeat(2800000)))
})
test('업로드·서명 URL 인증, 타인 사진 위조·다른 모임 접근 차단 및 미참조 사진 정리', async () => {
  const f=await fixture()
  assert.equal((await request(f.handler,{action:'upload_photo',dataUrl:'fake'})).statusCode,401)
  const upload=await f.call({action:'upload_photo',dataUrl:'data:image/png;base64,'+await png()})
  assert.equal(upload.statusCode,200); assert.equal(f.files.size,1)
  const id=upload.body.photoId
  assert.equal((await f.call({action:'photo_url',photoId:id})).statusCode,200)
  const stored=f.db.tables.secret_angel_seasons[0].state
  const secondCookie='sa_device='+Buffer.from(JSON.stringify({slug:stored.slug,id:stored.participants[1].id,token:'a'.repeat(64)})).toString('base64url')
  assert.equal((await request(f.handler,{action:'photo_url',photoId:id},{cookie:secondCookie})).statusCode,403)
  await f.call({action:'message',channel:'friend',photoId:id,body:''})
  assert.equal((await request(f.handler,{action:'photo_url',photoId:id},{cookie:secondCookie})).statusCode,200)
  f.db.conflicts=5
  const failed=await f.call({action:'upload_photo',dataUrl:'data:image/png;base64,'+await png()})
  assert.equal(failed.statusCode,409); assert.equal(f.files.size,1)
})
test('푸시 구독 SSRF 방지·실제 공급자만 허용, 등록 해제·재발급 시 구독 폐기', async () => {
  assert.deepEqual(pushSubscription(subscription),subscription)
  for(const endpoint of ['https://127.0.0.1/push','http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.test/a','https://fcm.googleapis.com:444/a','https://user@fcm.googleapis.com/a']) assert.throws(()=>pushSubscription({...subscription,endpoint}))
  const f=await fixture()
  assert.equal((await f.call({action:'push_subscribe',subscription})).statusCode,200)
  const viewResponse=await f.call({action:'read_notifications'})
  assert.equal(viewResponse.body.data.pushEnabled,true)
  assert.ok(!JSON.stringify(viewResponse.body).includes(subscription.endpoint))
  const admin=makeHandler(f.db,f.env,{adminSurface:true})
  await request(admin,{action:'reset_link',slug:f.s.slug,participantId:f.s.participants[0].id})
  assert.equal(f.db.tables.secret_angel_seasons[0].state.participants[0].pushSubscription,null)
  assert.equal((await f.call({action:'push_test'})).statusCode,401)
})
test('푸시 실패가 실천 저장을 취소하지 않고 410은 구독 해제, 동시 발송 claim과 보안 cron', async () => {
  const sent=[]; const f=await fixture(async(sub,n)=>{ sent.push(n); throw Object.assign(new Error('gone'),{statusCode:410}) })
  f.db.tables.secret_angel_seasons[0].state.participants[1].pushSubscription=subscription
  const result=await f.call({action:'message',channel:'friend',body:'비밀'})
  assert.equal(result.statusCode,200); assert.equal(sent.length,1)
  assert.equal(f.db.tables.secret_angel_seasons[0].state.participants[1].pushSubscription,null)
  assert.equal(f.db.tables.secret_angel_seasons[0].state.messages.length,1)
  const cron=makeHandler(f.db,f.env,{maintenance:true,pushSender:async()=>{}})
  assert.equal((await request(cron,{}, {method:'GET'})).statusCode,401)
  assert.equal((await request(cron,{}, {method:'GET',headers:{authorization:'Bearer cron-test-secret'}})).statusCode,200)
})

test('개인 메모는 작성자만 조회하고 전달·알림·공개 카드에서도 제외', () => {
  const s=state(), a=actor(s), b=actor(s,1)
  mutate(s,a,{action:'mission',week:1,missionId:'w1-5',privateMemo:'나만 보는 사적인 메모',note:'함께해서 좋았어요',shared:true},now)
  assert.equal(view(s,a,now).missions[0].privateMemo,'나만 보는 사적인 메모')
  assert.ok(!JSON.stringify(view(s,b,now)).includes('나만 보는 사적인 메모'))
  mutate(s,a,{action:'mission_share',week:1,privateMemo:'나만의 수정 메모',note:'친구에게 전할 말',shared:true},now)
  assert.equal(view(s,a,now).missions[0].privateMemo,'나만의 수정 메모')
  s.status='revealed'
  assert.ok(!JSON.stringify(view(s,b,now)).includes('나만의 수정 메모'))
  assert.equal(view(s,b,now).footprints[0].note,'친구에게 전할 말')
})
test('매 주차에 함께하는 활동·사진·전달 미션 포함, 기존 ID/제목 유지', () => {
  const s=state();s.startsAt=now-7*WEEK
  const missions=view(s,actor(s),now).missions
  for(const m of missions) {
    for(const kind of ['together','photo','letter']) assert.ok(m.options.some(o=>o.kind===kind))
    assert.ok(m.options.some(o=>o.id===`w${m.week}-1`))
    assert.equal(new Set(m.options.map(o=>o.id)).size,m.options.length)
  }
  assert.match(missions[0].options.find(o=>o.kind==='together').title,/옆자리/)
})
test('동시에 저장한 활동이 같은 대기 알림을 중복 발송하지 않음', async () => {
  const sent=[]
  const f=await fixture(async(sub,n)=>{sent.push(n.id);await new Promise(resolve=>setTimeout(resolve,10))})
  const state=f.db.tables.secret_angel_seasons[0].state
  state.participants[1].pushSubscription=subscription
  state.notifications=[{id:'pending-notice',to:state.participants[1].id,type:'message',key:'pending',read:false}]
  const results=await Promise.all([f.call({action:'heart'}), f.call({action:'prayer',body:'이번 주의 기도'})])
  assert.ok(results.every(r=>r.statusCode===200))
  assert.deepEqual(sent,['pending-notice'])
})
