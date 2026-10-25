import { timingSafeEqual } from 'node:crypto'
import { check, GameError, digest, token, verify, text, newSeason, register, mutate, view } from './game.mjs'

const COOKIE = 'sa_session'
const DURATION = 12 * 3600000
export function makeHandler(db, env = process.env) {
  async function run(query) { const result = await query; if (result.error) throw new Error('database'); return result.data }
  async function limit(key, max, seconds) {
    const allowed = await run(db.rpc('secret_angel_rate_limit', { p_key: digest(key), p_max: max, p_seconds: seconds }))
    check(allowed === true, '요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429)
  }
  async function load(slug) { const row = await run(db.from('secret_angel_seasons').select('state,version').eq('slug', slug).maybeSingle()); check(row, '모임 정보 또는 로그인 정보를 확인해 주세요.', 404); return row }
  async function save(slug, fn) {
    for (let i = 0; i < 5; i++) {
      const row = await load(slug)
      const result = fn(row.state)
      const changed = await run(db.from('secret_angel_seasons').update({ state: row.state, version: row.version + 1, updated_at: new Date().toISOString() }).eq('slug', slug).eq('version', row.version).select('slug'))
      if (changed.length) return { state: row.state, result }
    }
    throw new GameError('다른 요청이 처리 중입니다. 다시 시도해 주세요.', 409)
  }
  function cookie(res, value, age) { res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/api/secret-angel; HttpOnly; SameSite=Strict; Max-Age=${age}${env.NODE_ENV === 'production' ? '; Secure' : ''}`) }
  async function session(req) {
    const value = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
    check(value && /^[a-f0-9]{64}$/.test(value), '로그인해 주세요.', 401)
    const session = await run(db.from('secret_angel_sessions').select('season_slug,participant_id,is_admin,epoch,expires_at').eq('token_hash', digest(value)).maybeSingle())
    check(session && Date.parse(session.expires_at) > Date.now(), '세션이 만료되었습니다. 다시 로그인해 주세요.', 401)
    return { ...session, tokenHash: digest(value), admin: session.is_admin, id: session.participant_id }
  }
  function validateActor(actor, slug, state) {
    if (actor.admin) return
    check(actor.season_slug === slug, '다른 모임에 접근할 수 없습니다.', 403)
    const p = state.participants.find(p => p.id === actor.id)
    check(p?.pinHash && p.epoch === actor.epoch, 'PIN이 변경되었습니다. 다시 로그인해 주세요.', 401)
  }
  async function issue(res, actor) {
    const value = token()
    await run(db.from('secret_angel_sessions').insert({ token_hash: digest(value), season_slug: actor.slug || null, participant_id: actor.id || null, epoch: actor.epoch || 0, is_admin: !!actor.admin, expires_at: new Date(Date.now() + DURATION).toISOString() }))
    cookie(res, value, DURATION / 1000)
  }
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0')
    res.setHeader('Vary', 'Cookie')
    res.setHeader('X-Content-Type-Options', 'nosniff')
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
      if (['admin_login', 'login', 'join'].includes(action)) {
        // Account limits prevent bypass by rotating IPs or serverless instances.
        await limit('auth:global', 300, 900)
        const identity = action === 'admin_login' ? 'admin' : `${String(input.slug).toLowerCase()}:${String(input.name).trim().normalize('NFC')}`
        await limit(`auth:${identity}`, 8, 900)
        if (action === 'admin_login') {
          check(env.SECRET_ANGEL_ADMIN_SECRET?.length >= 32, '관리자 비밀번호 설정이 필요합니다.', 503)
          check(typeof input.password === 'string' && input.password.length <= 256 && timingSafeEqual(Buffer.from(digest(input.password), 'hex'), Buffer.from(digest(env.SECRET_ANGEL_ADMIN_SECRET), 'hex')), '로그인 정보를 확인해 주세요.', 401)
          await issue(res, { admin: true }); return res.status(200).json({ ok: true })
        }
        const slug = text(input.slug, 40).toLowerCase()
        check(typeof input.pin === 'string' && /^\d{6,12}$/.test(input.pin), '로그인 정보를 확인해 주세요.', 401)
        let row
        try { row = await load(slug) } catch (e) { if (e.status === 404) throw new GameError('로그인 정보를 확인해 주세요.', 401); throw e }
        let p
        if (action === 'join') {
          const changed = await save(slug, state => register(state, input)); p = changed.result
        } else {
          p = row.state.participants.find(p => p.name === text(input.name, 30))
          check(p && verify(input.pin, p.pinHash || ''), '로그인 정보를 확인해 주세요.', 401)
        }
        await issue(res, { slug, id: p.id, epoch: p.epoch }); return res.status(200).json({ ok: true })
      }
      const actor = await session(req)
      await limit(`session:${actor.tokenHash}`, 120, 60)
      if (action === 'logout') {
        await run(db.from('secret_angel_sessions').delete().eq('token_hash', actor.tokenHash)); cookie(res, '', 0); return res.status(200).json({ ok: true })
      }
      if (action === 'create') {
        check(actor.admin, '관리자 권한이 필요합니다.', 403)
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
      const slug = text(input.slug || actor.season_slug, 40).toLowerCase()
      const row = await load(slug)
      validateActor(actor, slug, row.state)
      if (action === 'delete') {
        check(actor.admin && input.confirm === slug, '관리자와 정확한 모임 코드 확인이 필요합니다.', 403)
        await run(db.from('secret_angel_seasons').delete().eq('slug', slug))
        return res.status(200).json({ ok: true })
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
