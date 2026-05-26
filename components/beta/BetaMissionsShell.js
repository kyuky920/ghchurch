import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { clearBetaSession, getRoleLabel } from './mockAuth'
import { missionMemberRoleLabel } from './missionsStore'
import useIsWide from './useIsWide'

const NAV_ITEMS = [
  { href: '/beta/missions', key: 'home', label: '홈', roles: ['member', 'leader', 'admin'] },
  { href: '/beta/missions/bible', key: 'bible', label: '성경읽기', roles: ['member', 'leader', 'admin'] },
  { href: '/beta/missions/schedules', key: 'schedules', label: '일정/공지', roles: ['member', 'leader', 'admin'] },
  { href: '/beta/missions/votes', key: 'votes', label: '투표', roles: ['member', 'leader', 'admin'] },
  { href: '/beta/missions/members', key: 'members', label: '회원관리', roles: ['leader', 'admin'] },
  { href: '/beta/missions/dues', key: 'dues', label: '회비관리', roles: ['leader', 'admin'] },
  { href: '/beta/missions/finance', key: 'finance', label: '수입지출', roles: ['leader', 'admin'] },
  { href: '/beta/missions/documents', key: 'documents', label: '회의록', roles: ['leader', 'admin'] },
]

export function canManageMissions(session) {
  return (
    session?.role === 'leader' ||
    session?.role === 'admin' ||
    session?.missionRole === 'sub_admin' ||
    session?.missionRole === 'admin'
  )
}

export default function BetaMissionsShell({
  title,
  subtitle,
  session,
  activeKey,
  children,
  actions = null,
}) {
  const router = useRouter()
  const isWide = useIsWide(920)
  const canManage = canManageMissions(session)

  return (
    <>
      <Head>
        <title>{title} · 선교회 운영</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#f6f1e8 0,#f3ede3 100%)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 16px 60px' }}>
          <div style={{ background: 'linear-gradient(135deg,#fffaf2,#f1e4cf)', border: '1px solid #e5d5bd', borderRadius: 22, padding: 22, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
              <div>
                <Link href="/beta" style={{ display: 'inline-block', marginBottom: 10, fontSize: 12, color: '#8b6e4e', textDecoration: 'none', fontWeight: 700 }}>
                  메인으로
                </Link>
                <p style={{ margin: '0 0 8px', fontSize: 11, letterSpacing: '0.22em', color: '#8b6e4e', fontWeight: 700 }}>MISSIONS</p>
                <h1 style={{ margin: '0 0 8px', fontSize: 30, fontFamily: "'Gowun Batang', serif" }}>{title}</h1>
                <p style={{ margin: 0, color: '#6e5b48', lineHeight: 1.7 }}>{subtitle}</p>
              </div>
              <div style={{ display: 'grid', gap: 10, minWidth: 220 }}>
                <div style={{ background: '#fff', border: '1px solid #eadbc5', borderRadius: 16, padding: '14px 16px' }}>
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: '#8b6e4e', fontWeight: 700 }}>접속 회원</p>
                  <p style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>{session.name}</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#6e5b48' }}>
                    {session.phone} · {getRoleLabel(session.role)} / {missionMemberRoleLabel(session.missionRole || session.role)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    clearBetaSession()
                    router.push('/beta')
                  }}
                  style={{ border: '1px solid #d8c8af', background: '#fff', borderRadius: 999, padding: '10px 14px', cursor: 'pointer', fontWeight: 700, color: '#6e5b48' }}
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isWide ? '220px minmax(0,1fr)' : '1fr', gap: 18 }}>
            <aside style={{ background: '#fffdf8', border: '1px solid #e4d4bd', borderRadius: 18, padding: 14, alignSelf: 'start', position: isWide ? 'sticky' : 'static', top: 16 }}>
              <p style={{ margin: '2px 0 12px', fontSize: 12, color: '#8b6e4e', fontWeight: 700 }}>메뉴</p>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: isWide ? '1fr' : 'repeat(2, minmax(0,1fr))' }}>
                {NAV_ITEMS.filter((item) => (
                  ['members', 'dues', 'finance', 'documents'].includes(item.key)
                    ? canManage
                    : item.roles.includes(session.role)
                )).map((item) => {
                  const active = item.key === activeKey
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      style={{
                        textDecoration: 'none',
                        borderRadius: 12,
                        padding: '11px 12px',
                        background: active ? '#f4e8d5' : '#fff',
                        color: active ? '#6e4b2d' : '#6e5b48',
                        border: active ? '1px solid #cfb28d' : '1px solid #ece2d4',
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </aside>

            <main style={{ display: 'grid', gap: 18 }}>
              {actions}
              {children}
            </main>
          </div>
        </div>
      </div>
    </>
  )
}
