// Fragments never enter HTTP request URLs or the Referer header.
export function makeInviteUrl(origin, slug, invite) {
  const url = new URL('/secret_angel', origin)
  url.hash = new URLSearchParams({ group: slug, person: invite.participantId, invite: invite.code }).toString()
  return url.toString()
}
export function parseInviteHash(fragment) {
  const values = new URLSearchParams(String(fragment || '').replace(/^#/, ''))
  const slug = values.get('group'), participantId = values.get('person'), code = values.get('invite')
  if (!slug || !/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug) || !participantId || !/^[a-f0-9-]{36}$/.test(participantId) || !code || !/^(?:[a-f0-9]{24}|[a-f0-9]{64})$/.test(code)) return null
  return { slug, participantId, code }
}
