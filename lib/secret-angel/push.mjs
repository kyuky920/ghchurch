import webpush from 'web-push'
import { check } from './game.mjs'
import { NOTICE_TEXT } from './social.mjs'
export function pushSubscription(value) {
  check(value && typeof value === 'object', '알림 등록 정보를 확인해 주세요.')
  let endpoint
  try { endpoint = new URL(value.endpoint) } catch { check(false, '알림 주소를 확인해 주세요.') }
  const host = endpoint.hostname
  check(endpoint.protocol === 'https:' && (!endpoint.port || endpoint.port === '443') && !endpoint.username && !endpoint.password && !endpoint.hash && value.endpoint.length <= 2048 && (host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com')), '지원되는 브라우저의 알림 주소만 등록할 수 있습니다.')
  const keys = value.keys || {}
  check(typeof keys.p256dh === 'string' && /^[\w-]{87}$/.test(keys.p256dh) && Buffer.from(keys.p256dh, 'base64url').length === 65 && typeof keys.auth === 'string' && /^[\w-]{22}$/.test(keys.auth), '알림 암호화 정보를 확인해 주세요.')
  return { endpoint: endpoint.href, keys: { p256dh: keys.p256dh, auth: keys.auth } }
}
export function payloadFor(n) {
  const [title, body] = NOTICE_TEXT[n.type]
  const tab = n.type === 'message' ? 'message' : ['suspect','reply'].includes(n.type) ? 'suspect' : n.type === 'footprint' ? 'footprints' : n.type === 'pray' ? 'prayer' : 'mission'
  return { title, body, tag: n.id, url: `/secret_angel?open=${tab}${n.channel ? `&channel=${n.channel}` : ''}` }
}
export async function sendPush(subscription, notice, env) {
  return webpush.sendNotification(subscription, JSON.stringify(payloadFor(notice)), { vapidDetails: { subject: 'https://ghchurch.vercel.app/secret_angel', publicKey: env.SECRET_ANGEL_VAPID_PUBLIC_KEY, privateKey: env.SECRET_ANGEL_VAPID_PRIVATE_KEY }, timeout: 2500, TTL: 86400, urgency: 'normal' })
}
