import { randomUUID, timingSafeEqual } from 'node:crypto'
import { cleanPhoto, PHOTO_BUCKET } from './media.mjs'
import { canReadPhoto, weeklyNotices } from './social.mjs'
import { pushSubscription, sendPush } from './push.mjs'
import { check, GameError, digest, token, text, newSeason, invitationInfo, redeemInvitation, unregisterDevice, isRegistered, hash, verify, password, DEVICE_TTL, mutate, view } from './game.mjs'

export function makeHandler(db, env = process.env, { adminSurface = false, maintenance = false, pushSender = sendPush } = {}) {
  const COOKIE = 'sa_device', LEGACY_COOKIE = 'sa_session', cookiePath = '/api/secret-angel'
  async function run(query) { const result = await query; if (result.error) throw new Error('database'); return result.data }
  async function limit(key, max, seconds) {
    const allowed = await run(db.rpc('secret_angel_rate_limit', { p_key: digest(key), p_max: max, p_seconds: seconds }))
    check(allowed === true, '요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429)
  }
  async function load(slug) { const row = await run(db.from('secret_angel_seasons').select('state,version').eq('slug', slug).maybeSingle()); check(row, '모임을 찾을 수 없습니다. 초대 링크를 확인해 주세요.', 404); return row }
  async function save(slug, fn) {
    for (let i = 0; i < 5; i++) {
      const row = await load(slug), result = fn(row.state)
      const changed = await run(db.from('secret_angel_seasons').update({ state: row.state, version: row.version + 1, updated_at: new Date().toISOString() }).eq('slug', slug).eq('version', row.version).select('slug'))
      if (changed.length) return { state: row.state, result }
    }
    throw new GameError('다른 요청이 처리 중입니다. 다시 시도해 주세요.', 409)
  }
  async function deliver(slug) {
    if (!env.SECRET_ANGEL_VAPID_PUBLIC_KEY || !env.SECRET_ANGEL_VAPID_PRIVATE_KEY) return
    const row = await load(slug)
    const pending = (row.state.notifications || []).filter(n => !n.read && !n.delivered && (n.attempts || 0) < 3 && (!n.retryAt || n.retryAt < Date.now()) && row.state.participants.some(p => p.id === n.to && p.pushSubscription && p.deviceExpiresAt > Date.now())).slice(0, 20)
    for (let offset = 0; offset < pending.length; offset += 3) {
    await Promise.all(pending.slice(offset, offset + 3).map(async notice => {
      const claim = randomUUID()
      const claimed = await save(slug, state => {
        const n = state.notifications?.find(n => n.id === notice.id), p = state.participants.find(p => p.id === notice.to)
        if (!n || n.read || n.delivered || (n.retryAt && n.retryAt > Date.now()) || !p?.pushSubscription) return null
        n.claim = claim; n.retryAt = Date.now() + 60000; n.attempts = (n.attempts || 0) + 1
        return { subscription: p.pushSubscription, epoch: p.epoch }
      })
      if (!claimed.result) return
      let delivered = false, expired = false
      try { await pushSender(claimed.result.subscription, notice, env); delivered = true } catch (e) { expired = [404,410].includes(e.statusCode) }
      await save(slug, state => {
        const n = state.notifications?.find(n => n.id === notice.id), p = state.participants.find(p => p.id === notice.to)
        if (n?.claim === claim) { n.delivered = delivered; n.retryAt = Date.now() + 3600000 }
        if (expired && p?.epoch === claimed.result.epoch && p.pushSubscription?.endpoint === claimed.result.subscription.endpoint) p.pushSubscription = null
      })
    }))
    }
  }
  function cookie(name, value, age) { return `${name}=${value}; Path=${cookiePath}; HttpOnly; SameSite=Strict; Max-Age=${age}${env.NODE_ENV === 'production' ? '; Secure' : ''}` }
  function setDeviceCookie(res, value = '') { res.setHeader('Set-Cookie', [cookie(COOKIE, value, value ? DEVICE_TTL / 1000 : 0), cookie(LEGACY_COOKIE, '', 0)]) }
  async function passwordSession(res, state, participant) {
    const raw = token()
    await run(db.from('secret_angel_sessions').insert({ token_hash: digest(raw), season_slug: state.slug, participant_id: participant.id, epoch: participant.epoch, is_admin: false, expires_at: new Date(Date.now() + DEVICE_TTL).toISOString() }))
    res.setHeader('Set-Cookie', [cookie(LEGACY_COOKIE, raw, DEVICE_TTL / 1000), cookie(COOKIE, '', 0)])
    return { ok: true, data: { ...view(state, { id: participant.id }), pushPublicKey: env.SECRET_ANGEL_VAPID_PUBLIC_KEY || null } }
  }
  function readCookie(req, name) { return (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1) }
  function validateActor(actor, slug, state) {
    if (actor.admin) return
    check(actor.season_slug === slug, '다른 모임에 접근할 수 없습니다.', 403)
    const p = state.participants.find(p => p.id === actor.id)
    check(p && isRegistered(p) && p.epoch === actor.epoch, '로그인이 만료되었습니다. 이름과 비밀번호로 다시 로그인해 주세요.', 401)
    if (actor.deviceHash) check(p.deviceTokenHash === actor.deviceHash && p.deviceExpiresAt > Date.now(), '기기 등록이 만료되었습니다. 새 초대 링크를 요청해 주세요.', 401)
  }
  async function session(req) {
    const value = readCookie(req, COOKIE)
    if (value) {
      let device
      try { check(value.length <= 512, 'Invalid device'); device = JSON.parse(Buffer.from(value, 'base64url').toString()) } catch { throw new GameError('모임 링크에서 이름과 비밀번호로 로그인해 주세요.', 401) }
      check(typeof device.slug === 'string' && /^[a-z0-9][a-z0-9-]{2,39}$/.test(device.slug) && typeof device.id === 'string' && /^[a-f0-9-]{36}$/.test(device.id) && typeof device.token === 'string' && /^[a-f0-9]{64}$/.test(device.token), '기기 등록 정보를 확인해 주세요.', 401)
      let row
      try { row = await load(device.slug) } catch (e) { if (e.status === 404) throw new GameError('모임이 종료되었거나 삭제되었습니다.', 401); throw e }
      const p = row.state.participants.find(p => p.id === device.id)
      const actor = { admin: false, id: device.id, season_slug: device.slug, deviceHash: digest(device.token), tokenHash: digest(device.token), epoch: p?.epoch }
      validateActor(actor, device.slug, row.state); return actor
    }
    // Existing sessions remain usable until their original expiry; PIN login is retired.
    const legacy = readCookie(req, LEGACY_COOKIE)
    check(legacy && /^[a-f0-9]{64}$/.test(legacy), '모임 링크에서 이름과 비밀번호로 로그인해 주세요.', 401)
    const record = await run(db.from('secret_angel_sessions').select('season_slug,participant_id,is_admin,epoch,expires_at').eq('token_hash', digest(legacy)).maybeSingle())
    check(record && !record.is_admin && Date.parse(record.expires_at) > Date.now(), '이름과 비밀번호로 다시 로그인해 주세요.', 401)
    return { ...record, tokenHash: digest(legacy), admin: false, id: record.participant_id, legacy: true }
  }
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0'); res.setHeader('Vary', 'Cookie'); res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      if (maintenance) {
        const expected = env.CRON_SECRET && Buffer.from(`Bearer ${env.CRON_SECRET}`), actual = Buffer.from(req.headers.authorization || '')
        check(expected && expected.length === actual.length && timingSafeEqual(expected, actual), '인증이 필요합니다.', 401)
        check(req.method === 'GET', '허용되지 않은 요청입니다.', 405)
        const rows = await run(db.from('secret_angel_seasons').select('slug'))
        for (const { slug } of rows) {
          await save(slug, state => weeklyNotices(state))
          await deliver(slug)
        }
        return res.status(200).json({ ok: true })
      }
      check(['GET', 'POST'].includes(req.method), '허용되지 않은 요청입니다.', 405)
      const input = req.method === 'POST' ? req.body : req.query
      check(input && typeof input === 'object' && !Array.isArray(input), '입력을 확인해 주세요.')
      if (req.method === 'POST') {
        check((req.headers['content-type'] || '').split(';')[0] === 'application/json', 'JSON 요청만 허용됩니다.', 415)
        const expected = env.NEXT_PUBLIC_APP_URL ? new URL(env.NEXT_PUBLIC_APP_URL).origin : `${env.NODE_ENV === 'production' ? 'https' : 'http'}://${req.headers.host}`
        check(!req.headers.origin || req.headers.origin === expected, '요청 출처를 확인해 주세요.', 403)
      }
      check(JSON.stringify(input).length <= (input.action === 'upload_photo' ? 2900000 : 16384), '입력 용량을 초과했습니다.', 413)
      const action = req.method === 'GET' ? 'view' : input.action
      if (adminSurface) check(!['login', 'join', 'invite_info', 'redeem_invite', 'upload_photo', 'photo_url', 'push_subscribe', 'push_unsubscribe', 'push_test', 'read_notifications', 'mission_share', 'group_info', 'account_signup', 'password_login', 'set_password'].includes(action), '참가자 페이지에서 초대 링크를 열어 주세요.', 403)
      else check(!['admin_login', 'create', 'start', 'reset_pin', 'reset_link', 'reset_links', 'reveal', 'delete', 'test_advance', 'test_reset', 'reset_account'].includes(action), '관리자 기능은 리더 도구에서 이용해 주세요.', 403)
      check(!['admin_login', 'login', 'join', 'reset_pin'].includes(action), '이전 로그인 방식은 종료되었습니다. 모임 링크에서 이름과 비밀번호로 로그인해 주세요.', 410)
      if (['group_info', 'account_signup', 'password_login'].includes(action)) {
        const slug = text(input.slug, 40).toLowerCase()
        check(/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug), '모임 코드를 확인해 주세요.')
        await limit('account:global', 300, 900)
        const row = await load(slug)
        if (action === 'group_info') return res.status(200).json({ ok: true, group: { slug, title: row.state.title, status: row.state.status } })
        const name = text(input.name, 30)
        await limit(`account:${slug}:${name}`, 8, 900)
        const credential = password(input.password)
        const p = row.state.participants.find(p => p.name === name)
        if (action === 'password_login') {
          check(p?.passwordHash && verify(credential, p.passwordHash), '이름 또는 비밀번호를 확인해 주세요.', 401)
          const expectedHash = p.passwordHash, expectedEpoch = p.epoch
          const changed = await save(slug, state => {
            const current = state.participants.find(person => person.id === p.id)
            check(current?.passwordHash === expectedHash && current.epoch === expectedEpoch, '로그인 정보를 다시 확인해 주세요.', 401)
            current.deviceExpiresAt = Date.now() + DEVICE_TTL
            return current
          })
          return res.status(200).json(await passwordSession(res, changed.state, changed.result))
        }
        check(p && !isRegistered(p), '가입 가능한 명단의 이름인지 확인해 주세요. 이미 가입했다면 로그인하고, 기존 기기를 쓰고 있다면 그 기기에서 비밀번호를 설정해 주세요.', 409)
        check(row.state.status !== 'revealed', '종료된 모임에는 새로 가입할 수 없습니다.')
        const passwordHash = hash(credential)
        const changed = await save(slug, state => {
          const current = state.participants.find(person => person.id === p.id)
          check(current && !isRegistered(current) && state.status !== 'revealed', '이미 등록된 이름이거나 가입이 종료되었습니다.', 409)
          current.passwordHash = passwordHash; current.pinHash = null; current.inviteHash = null; current.inviteExpiresAt = null
          current.registeredAt = new Date().toISOString(); current.deviceExpiresAt = Date.now() + DEVICE_TTL; current.epoch++
          return current
        })
        return res.status(200).json(await passwordSession(res, changed.state, changed.result))
      }
      if (['invite_info', 'redeem_invite'].includes(action)) {
        await limit('invite:global', 300, 900)
        await limit(`invite:${String(input.code || '')}`, 20, 900)
        const slug = text(input.slug, 40).toLowerCase()
        if (action === 'invite_info') {
          const row = await load(slug)
          return res.status(200).json({ ok: true, invitation: invitationInfo(row.state, input) })
        }
        const deviceToken = token(), deviceHash = digest(deviceToken)
        const changed = await save(slug, state => redeemInvitation(state, input, deviceHash))
        const p = changed.result
        const value = Buffer.from(JSON.stringify({ slug, id: p.id, token: deviceToken })).toString('base64url')
        // Both one-time invitation consumption and the device hash were committed atomically.
        setDeviceCookie(res, value)
        return res.status(200).json({ ok: true, data: { ...view(changed.state, { id: p.id }), pushPublicKey: env.SECRET_ANGEL_VAPID_PUBLIC_KEY || null } })
      }
      const actor = adminSurface ? { admin: true } : await session(req)
      if (adminSurface) await limit('management:public', 120, 60)
      else await limit(`session:${actor.tokenHash}`, 120, 60)
      if (action === 'logout') {
        check(!adminSurface, '관리자 로그인은 사용하지 않습니다.', 410)
        const slug = actor.season_slug
        await save(slug, state => {
          validateActor(actor, slug, state)
          const p = state.participants.find(p => p.id === actor.id)
          if (!actor.legacy && !p.passwordHash) unregisterDevice(state, actor.id)
          else if (!actor.legacy) { p.deviceTokenHash = null; p.deviceName = null; p.pushSubscription = null }
          if (p.pushSessionHash === actor.tokenHash) { p.pushSubscription = null; p.pushSessionHash = null }
        })
        if (actor.legacy) await run(db.from('secret_angel_sessions').delete().eq('token_hash', actor.tokenHash))
        setDeviceCookie(res); return res.status(200).json({ ok: true })
      }
      if (action === 'create') {
        const { state, invites } = newSeason(input)
        const result = await db.from('secret_angel_seasons').insert({ slug: state.slug, state })
        if (result.error?.code === '23505') throw new GameError('이미 사용 중인 모임 코드입니다.', 409)
        if (result.error) throw new Error('database')
        return res.status(200).json({ ok: true, slug: state.slug, invites })
      }
      if (action === 'view' && !input.slug && actor.admin) {
        const rows = await run(db.from('secret_angel_seasons').select('slug').order('updated_at', { ascending: false }))
        return res.status(200).json({ ok: true, admin: true, seasons: rows })
      }
      const slug = text(input.slug || actor.season_slug, 40).toLowerCase(), row = await load(slug)
      validateActor(actor, slug, row.state)
      if (action === 'delete') {
        check(actor.admin && input.confirm === slug, '정확한 모임 코드 확인이 필요합니다.', 403)
        if (row.state.photos?.length) { const removed = await db.storage.from(PHOTO_BUCKET).remove(row.state.photos.map(p => p.path)); check(!removed.error, '사진 정리 후 다시 삭제해 주세요.', 503) }
        await run(db.from('secret_angel_seasons').delete().eq('slug', slug)); return res.status(200).json({ ok: true })
      }
      if (action === 'set_password') {
        check(!actor.admin, '참가자 페이지에서 설정해 주세요.', 403)
        await limit(`password:${slug}:${actor.id}`, 8, 900)
        const current = row.state.participants.find(p => p.id === actor.id), expectedHash = current.passwordHash
        check(!expectedHash || (typeof input.currentPassword === 'string' && verify(input.currentPassword, expectedHash)), '현재 비밀번호를 확인해 주세요.', 401)
        const passwordHash = hash(password(input.password))
        const changed = await save(slug, state => {
          validateActor(actor, slug, state)
          const p = state.participants.find(p => p.id === actor.id)
          check(p.passwordHash === expectedHash, '다른 기기에서 변경되었습니다. 다시 로그인해 주세요.', 409)
          p.passwordHash = passwordHash; p.pinHash = null; p.inviteHash = null; p.inviteExpiresAt = null
          p.deviceTokenHash = null; p.deviceName = null; p.pushSubscription = null; p.pushSessionHash = null
          p.deviceExpiresAt = Date.now() + DEVICE_TTL; p.registeredAt ||= new Date().toISOString(); p.epoch++
          return p
        })
        return res.status(200).json(await passwordSession(res, changed.state, changed.result))
      }
      if (action === 'photo_url') {
        check(canReadPhoto(row.state, actor, input.photoId), '이 사진을 볼 수 없습니다.', 403)
        const photo = row.state.photos.find(p => p.id === input.photoId)
        const { data, error } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(photo.path, 300)
        check(!error && data?.signedUrl, '사진을 불러올 수 없습니다.', 503)
        return res.status(200).json({ ok: true, url: data.signedUrl })
      }
      if (action === 'upload_photo') {
        check(!actor.admin && row.state.status !== 'draft', '활동 시작 후 사진을 보낼 수 있습니다.', 403)
        await limit(`photo:${slug}:${actor.id}`, 20, 3600)
        const photo = { id: randomUUID(), by: actor.id }
        photo.path = `${slug}/${photo.id}.jpg`
        const bytes = await cleanPhoto(input.dataUrl)
        check((row.state.photos || []).filter(p => p.by === actor.id).length < 80, '한 사람당 사진은 80장까지 올릴 수 있습니다.')
        const bucket = db.storage.from(PHOTO_BUCKET)
        const uploaded = await bucket.upload(photo.path, bytes, { contentType: 'image/jpeg', upsert: false })
        check(!uploaded.error, '사진을 올리지 못했습니다. 다시 시도해 주세요.', 503)
        try {
          await save(slug, state => {
            validateActor(actor, slug, state)
            state.photos ||= []
            check(state.photos.filter(p => p.by === actor.id).length < 80, '한 사람당 사진은 80장까지 올릴 수 있습니다.')
            state.photos.push(photo)
          })
        } catch (e) { await bucket.remove([photo.path]); throw e }
        return res.status(200).json({ ok: true, photoId: photo.id })
      }
      if (['push_subscribe', 'push_unsubscribe', 'push_test'].includes(action)) {
        check(!actor.admin, '참가자 기기에서 설정해 주세요.', 403)
        await limit(`push:${slug}:${actor.id}`, 12, 3600)
        check(action === 'push_unsubscribe' || (env.SECRET_ANGEL_VAPID_PUBLIC_KEY && env.SECRET_ANGEL_VAPID_PRIVATE_KEY), '알림 기능을 준비 중입니다.', 503)
        const subscription = action === 'push_subscribe' ? pushSubscription(input.subscription) : null
        const updated = await save(slug, state => {
          validateActor(actor, slug, state)
          const p = state.participants.find(p => p.id === actor.id)
          if (action === 'push_test') { check(p.pushSubscription, '먼저 알림 받기를 켜 주세요.'); return p.pushSubscription }
          p.pushSubscription = subscription; p.pushSessionHash = subscription ? actor.tokenHash : null
        })
        if (action === 'push_test') {
          try { await pushSender(updated.result, { id: randomUUID(), type: 'message' }, env) } catch { throw new GameError('이 기기로 알림을 보내지 못했습니다. 알림 설정을 다시 확인해 주세요.', 503) }
        }
        return res.status(200).json({ ok: true, data: { ...view(updated.state, actor), pushPublicKey: env.SECRET_ANGEL_VAPID_PUBLIC_KEY || null } })
      }
      if (action === 'view') {
        let state = row.state
        if (!actor.admin) {
          const changed = await save(slug, current => { validateActor(actor, slug, current); weeklyNotices(current) })
          state = changed.state
        }
        return res.status(200).json({ ok: true, data: { ...view(state, actor), ...(!actor.admin ? { pushPublicKey: env.SECRET_ANGEL_VAPID_PUBLIC_KEY || null } : {}) } })
      }
      const changed = await save(slug, state => { validateActor(actor, slug, state); return mutate(state, actor, input) })
      try { await deliver(slug) } catch {} // Activity is committed even when a push provider is unavailable.
      return res.status(200).json({ ok: true, data: { ...view(changed.state, actor), ...(!actor.admin ? { pushPublicKey: env.SECRET_ANGEL_VAPID_PUBLIC_KEY || null } : {}) }, ...changed.result })
    } catch (e) {
      if (e.status === 405) res.setHeader('Allow', 'GET, POST')
      if (e.status === 429) res.setHeader('Retry-After', '900')
      return res.status(e instanceof GameError ? e.status : 500).json({ ok: false, error: e instanceof GameError ? e.message : '처리할 수 없습니다. DB 마이그레이션과 서버 설정을 확인해 주세요.' })
    }
  }
}
