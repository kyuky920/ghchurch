// No page/API caching: private activity always comes from the authenticated server.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data?.json() || {} } catch {}
  const url = typeof data.url === 'string' && /^\/secret_angel(?:\?|$)/.test(data.url) ? data.url : '/secret_angel'
  event.waitUntil(self.registration.showNotification(data.title || '비밀 천사', { body: data.body || '새 소식이 도착했어요.', icon: '/secret-angel-icon-192.png', badge: '/secret-angel-icon-192.png', tag: data.tag || 'secret-angel', data: { url } }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const url = new URL(event.notification.data?.url || '/secret_angel', self.location.origin)
    if (url.origin !== self.location.origin || url.pathname !== '/secret_angel') return
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find(client => new URL(client.url).pathname === '/secret_angel')
    if (existing) { await existing.navigate(url.href); return existing.focus() }
    return self.clients.openWindow(url.href)
  })())
})
