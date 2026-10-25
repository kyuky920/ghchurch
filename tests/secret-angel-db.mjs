// Deterministic Supabase test adapter. No live DB or credentials are used.
export function memoryDb() {
  const tables = { secret_angel_seasons: [], secret_angel_sessions: [], secret_angel_limits: [] }
  const db = { tables, conflicts: 0, fail: false, calls: [],
    async rpc(name, { p_key, p_max, p_seconds }) {
      if (db.fail) return { error: { message: 'private database detail' } }
      let row = tables.secret_angel_limits.find(x => x.key === p_key)
      if (!row) { row = { key: p_key, attempts: 0, resets: 0 }; tables.secret_angel_limits.push(row) }
      if (row.resets < Date.now()) { row.attempts = 0; row.resets = Date.now() + p_seconds * 1000 }
      return { data: ++row.attempts <= p_max }
    },
    from(table) {
      let op = 'select', fields = '*', payload, single = false
      const filters = [], q = {
        select(value = '*') { fields = value; return q },
        insert(value) { op = 'insert'; payload = value; return q },
        update(value) { op = 'update'; payload = value; return q },
        delete() { op = 'delete'; return q },
        eq(key, value) { filters.push(row => row[key] === value); return q },
        order() { return q }, maybeSingle() { single = true; return q },
        then(resolve, reject) {
          try {
            if (db.fail) return resolve({ error: { message: 'private database detail' } })
            const rows = tables[table]
            let matched = rows.filter(row => filters.every(fn => fn(row)))
            if (op === 'insert') {
              const key = table === 'secret_angel_seasons' ? 'slug' : 'token_hash'
              if (rows.some(row => row[key] === payload[key])) return resolve({ error: { code: '23505' } })
              const created = structuredClone({ version: 0, ...payload }); rows.push(created); matched = [created]
            }
            if (op === 'update') {
              if (db.conflicts > 0) { db.conflicts--; matched.forEach(row => row.version++); matched = [] }
              else matched.forEach(row => Object.assign(row, structuredClone(payload)))
            }
            if (op === 'delete') {
              tables[table] = rows.filter(row => !matched.includes(row))
              if (table === 'secret_angel_seasons') tables.secret_angel_sessions = tables.secret_angel_sessions.filter(x => !matched.some(s => s.slug === x.season_slug))
            }
            const data = matched.map(row => fields === '*' ? row : Object.fromEntries(fields.split(',').map(key => [key, row[key]])))
            db.calls.push({ table, op })
            return resolve({ data: structuredClone(single ? data[0] || null : data) })
          } catch (e) { return reject(e) }
        }
      }; return q
    }
  }; return db
}
export async function request(handler, body = {}, { method = 'POST', cookie = '', headers = {} } = {}) {
  const response = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value }, status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this } }
  await handler({ method, body, query: body, headers: { 'content-type': 'application/json', host: 'localhost:3018', origin: 'http://localhost:3018', cookie, ...headers } }, response)
  return response
}
