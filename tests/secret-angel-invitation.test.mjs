import test from 'node:test'
import assert from 'node:assert/strict'
import { newSeason, invitationInfo, redeemInvitation, isRegistered, digest, INVITE_TTL, DEVICE_TTL } from '../lib/secret-angel/game.mjs'
import { makeInviteUrl, parseInviteHash } from '../lib/secret-angel/invite-link.mjs'

test('개인 링크에는 이름·코드가 요청 URL로 전송되지 않고 fragment에서만 해석', () => {
  const { invites } = newSeason({ slug: 'youth-2026', title: '청년부', names: ['하늘','바다'] })
  const link = new URL(makeInviteUrl('https://example.com', 'youth-2026', invites[0]))
  assert.equal(link.pathname, '/secret_angel'); assert.equal(link.search, '')
  assert.ok(!link.href.includes('하늘'))
  assert.deepEqual(parseInviteHash(link.hash), { slug: 'youth-2026', participantId: invites[0].participantId, code: invites[0].code })
  for (const bad of ['', '#invite=bad', '#group=../etc&person=abc&invite=abc']) assert.equal(parseInviteHash(bad), null)
})
test('초대 링크 7일, 등록 기기 90일, 일회용 링크와 이름 일치 검사', () => {
  const { state: s, invites } = newSeason({ slug: 'youth-2026', title: '청년부', names: ['하늘','바다'] })
  const now = invites[0].expiresAt - INVITE_TTL
  const input = { ...invites[0] }
  assert.equal(invitationInfo(s, input, now).name, '하늘')
  assert.throws(() => invitationInfo(s, input, now+INVITE_TTL))
  assert.throws(() => redeemInvitation(s, { ...input, name: '바다' }, digest('secret'), now))
  const p = redeemInvitation(s, input, digest('device-secret'), now)
  assert.equal(p.deviceExpiresAt, now+DEVICE_TTL); assert.equal(p.inviteHash, null); assert.equal(p.pinHash, null)
  assert.ok(isRegistered(p)); assert.throws(() => invitationInfo(s, input, now))
})
