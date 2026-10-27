import { check, GameError, digest, token, text, newSeason, invitationInfo, redeemInvitation, unregisterDevice, isRegistered, DEVICE_TTL, mutate, view } from './game.mjs'

export function makeHandler(db, env = process.env, { adminSurface = false } = {}) {
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
  function cookie(name, value, age) { return `${name}=${value}; Path=${cookiePath}; HttpOnly; SameSite=Strict; Max-Age=${age}${env.NODE_ENV === 'production' ? '; Secure' : ''}` }
  function setDeviceCookie(res, value = '') { res.setHeader('Set-Cookie', [cookie(COOKIE, value, value ? DEVICE_TTL / 1000 : 0), cookie(LEGACY_COOKIE, '', 0)]) }
  function readCookie(req, name) { return (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1) }
  function validateActor(actor, slug, state) {
    if (actor.admin) return
    check(actor.season_slug === slug, '다른 모임에 접근할 수 없습니다.', 403)
    const p = state.participants.find(p => p.id === actor.id)
    check(p && isRegistered(p) && p.epoch === actor.epoch, '기기 등록이 해제되었습니다. 새 초대 링크로 참여해 주세요.', 401)
    if (actor.deviceHash) check(p.deviceTokenHash === actor.deviceHash && p.deviceExpiresAt > Date.now(), '기기 등록이 만료되었습니다. 새 초대 링크를 요청해 주세요.', 401)
  }
  async function session(req) {
    const value = readCookie(req, COOKIE)
    if (value) {
      let device
      try { check(value.length <= 512, 'Invalid device'); device = JSON.parse(Buffer.from(value, 'base64url').toString()) } catch { throw new GameError('개인 초대 링크로 기기를 등록해 주세요.', 401) }
      check(typeof device.slug === 'string' && /^[a-z0-9][a-z0-9-]{2,39}$/.test(device.slug) && typeof device.id === 'string' && /^[a-f0-9-]{36}$/.test(device.id) && typeof device.token === 'string' && /^[a-f0-9]{64}$/.test(device.token), '기기 등록 정보를 확인해 주세요.', 401)
      let row
      try { row = await load(device.slug) } catch (e) { if (e.status === 404) throw new GameError('모임이 종료되었거나 삭제되었습니다.', 401); throw e }
      const p = row.state.participants.find(p => p.id === device.id)
      const actor = { admin: false, id: device.id, season_slug: device.slug, deviceHash: digest(device.token), tokenHash: digest(device.token), epoch: p?.epoch }
      validateActor(actor, device.slug, row.state); return actor
    }
    // Existing sessions remain usable until their original expiry; PIN login is retired.
    const legacy = readCookie(req, LEGACY_COOKIE)
    check(legacy && /^[a-f0-9]{64}$/.test(legacy), '개인 초대 링크로 기기를 등록해 주세요.', 401)
    const record = await run(db.from('secret_angel_sessions').select('season_slug,participant_id,is_admin,epoch,expires_at').eq('token_hash', digest(legacy)).maybeSingle())
    check(record && !record.is_admin && Date.parse(record.expires_at) > Date.now(), '새 초대 링크로 기기를 등록해 주세요.', 401)
    return { ...record, tokenHash: digest(legacy), admin: false, id: record.participant_id, legacy: true }
  }
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0'); res.setHeader('Vary', 'Cookie'); res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      check(['GET', 'POST'].includes(req.method), '허용되지 않은 요청입니다.', 405)
      const input = req.method === 'POST' ? req.body : req.query
      check(input && typeof input === 'object' && !Array.isArray(input), '입력을 확인해 주세요.')
      if (req.method === 'POST') {
        check((req.headers['content-type'] || '').split(';')[0] === 'application/json', 'JSON 요청만 허용됩니다.', 415)
        const expected = env.NEXT_PUBLIC_APP_URL ? new URL(env.NEXT_PUBLIC_APP_URL).origin : `${env.NODE_ENV === 'production' ? 'https' : 'http'}://${req.headers.host}`
        check(!req.headers.origin || req.headers.origin === expected, '요청 출처를 확인해 주세요.', 403)
      }
      const action = req.method === 'GET' ? 'view' : input.action
      if (adminSurface) check(!['login', 'join', 'invite_info', 'redeem_invite'].includes(action), '참가자 페이지에서 초대 링크를 열어 주세요.', 403)
      else check(!['admin_login', 'create', 'start', 'reset_pin', 'reset_link', 'reset_links', 'reveal', 'delete', 'test_advance', 'test_reset'].includes(action), '관리자 기능은 리더 도구에서 이용해 주세요.', 403)
      check(!['admin_login', 'login', 'join', 'reset_pin'].includes(action), '이전 로그인 방식은 종료되었습니다. 개인 초대 링크로 기기를 등록해 주세요.', 410)
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
        return res.status(200).json({ ok: true, data: view(changed.state, { id: p.id }) })
      }
      const actor = adminSurface ? { admin: true } : await session(req)
      if (adminSurface) await limit('management:public', 120, 60)
      else await limit(`session:${actor.tokenHash}`, 120, 60)
      if (action === 'logout') {
        check(!adminSurface, '관리자 로그인은 사용하지 않습니다.', 410)
        const slug = actor.season_slug
        await save(slug, state => { validateActor(actor, slug, state); unregisterDevice(state, actor.id) })
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
        await run(db.from('secret_angel_seasons').delete().eq('slug', slug)); return res.status(200).json({ ok: true })
      }
      if (action === 'view') return res.status(200).json({ ok: true, data: view(row.state, actor) })
      const changed = await save(slug, state => { validateActor(actor, slug, state); return mutate(state, actor, input) })
      return res.status(200).json({ ok: true, data: view(changed.state, actor), ...changed.result })
    } catch (e) {
      if (e.status === 405) res.setHeader('Allow', 'GET, POST')
      if (e.status === 429) res.setHeader('Retry-After', '900')
      return res.status(e instanceof GameError ? e.status : 500).json({ ok: false, error: e instanceof GameError ? e.message : '처리할 수 없습니다. DB 마이그레이션과 서버 설정을 확인해 주세요.' })
    }
  }
}
