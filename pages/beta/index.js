import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import {
  clearBetaSession,
  canAccessAdmin,
  getRoleLabel,
  readBetaSession,
  writeBetaSession,
} from '../../components/beta/mockAuth'
import { fetchBetaLogin } from '../../components/beta/missionsStore'

const MENU_BY_ROLE = {
  member: [
    { key: 'missions', title: '선교회 운영', desc: '선교회 회원 기준 메뉴와 참여 화면을 테스트합니다.', tone: '#8f693f' },
    { key: 'profile', title: '내 소속', desc: '나의 교회 소속과 역할을 확인합니다.', tone: '#7a6e9e' },
  ],
  leader: [
    { key: 'missions', title: '선교회 운영', desc: '회원, 회비, 일정, 투표를 포함한 선교회 운영 흐름을 테스트합니다.', tone: '#8f693f' },
    { key: 'admin', title: '관리 도구', desc: '리더 비밀번호 확인 후 관리 영역으로 들어갑니다.', tone: '#a34d4d' },
  ],
  admin: [
    { key: 'missions', title: '선교회 운영', desc: '권한, 회비, 재정, 문서까지 포함한 운영 기능을 테스트합니다.', tone: '#8f693f' },
    { key: 'admin', title: '관리 도구', desc: '관리자 비밀번호 확인 후 관리 영역으로 들어갑니다.', tone: '#a34d4d' },
  ],
}

function cardStyle(tone) {
  return {
    background: '#fff',
    border: `1px solid ${tone}33`,
    borderLeft: `4px solid ${tone}`,
    borderRadius: 16,
    padding: '18px 18px 16px',
    cursor: 'pointer',
    boxShadow: '0 8px 22px rgba(62,43,24,0.05)',
  }
}

export default function BetaHome() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const saved = readBetaSession()
    if (saved) setSession(saved)
  }, [])

  async function handleLogin(event) {
    event.preventDefault()
    try {
      setLoading(true)
      const result = await fetchBetaLogin(name, phone)
      writeBetaSession(result.member)
      setSession(readBetaSession())
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    clearBetaSession()
    setSession(null)
    setName('')
    setPhone('')
  }

  function handleMenuClick(menuKey) {
    if (menuKey === 'missions') {
      router.push('/beta/missions')
      return
    }
    if (menuKey === 'admin') {
      router.push('/beta/admin')
      return
    }
    alert('테스트 단계에서는 화면 구성 검토를 위해 메뉴 구조만 먼저 확인합니다.')
  }

  return (
    <>
      <Head>
        <title>광흥교회 통합 앱 테스트</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <style>{`
          * { box-sizing: border-box; }
          body { background: #f6f1e8; color: #2f281f; }
        `}</style>
      </Head>
      <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top right, #eadcc8 0, #f6f1e8 38%, #f5f0e6 100%)' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 18px 64px' }}>
          <div style={{ marginBottom: 18 }}>
            <p style={{ fontSize: 11, letterSpacing: '0.22em', color: '#8b6e4e', fontWeight: 700, margin: '0 0 8px' }}>KWANGHEUNG CHURCH BETA</p>
            <h1 style={{ fontSize: 30, lineHeight: 1.2, margin: '0 0 8px', fontFamily: "'Gowun Batang', serif" }}>광흥교회 통합 앱 테스트</h1>
            <p style={{ margin: 0, color: '#6e5b48', lineHeight: 1.7 }}>기존 운영 화면은 유지하고, 회원 기반 접속과 권한별 메뉴 구성을 별도 테스트하는 페이지입니다.</p>
          </div>

          {!session ? (
            <div style={{ display: 'grid', gap: 18, gridTemplateColumns: '1.1fr 0.9fr' }}>
              <div style={{ background: '#fffdf8', border: '1px solid #e2d3bd', borderRadius: 18, padding: 22 }}>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>간편 로그인 테스트</p>
                <form onSubmit={handleLogin} style={{ display: 'grid', gap: 12 }}>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" style={{ width: '100%', padding: '14px 15px', borderRadius: 12, border: '1px solid #d8c8af', fontSize: 15 }} />
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="전화번호" style={{ width: '100%', padding: '14px 15px', borderRadius: 12, border: '1px solid #d8c8af', fontSize: 15 }} />
                  {error && <p style={{ margin: 0, color: '#b33f3f', fontSize: 13 }}>{error}</p>}
                  <button type="submit" disabled={loading} style={{ border: 'none', borderRadius: 14, padding: '14px 16px', background: 'linear-gradient(135deg,#8f693f,#b98657)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.65 : 1 }}>
                    {loading ? '로그인 중...' : '로그인 테스트'}
                  </button>
                </form>
              </div>
              <div style={{ background: '#fdf7ef', border: '1px solid #eadbc5', borderRadius: 18, padding: 22 }}>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>로그인 안내</p>
                <div style={{ display: 'grid', gap: 10, color: '#6e5b48', lineHeight: 1.8 }}>
                  <p style={{ margin: 0 }}>이 테스트 로그인은 `app_members` 테이블 기준으로 동작합니다.</p>
                  <p style={{ margin: 0 }}>처음 로그인하는 이름과 전화번호는 일반 회원으로 자동 생성됩니다.</p>
                  <p style={{ margin: 0 }}>리더나 관리자 권한은 DB에서 `role` 값을 `leader` 또는 `admin`으로 변경해야 합니다.</p>
                  <p style={{ margin: 0 }}>관리자 비밀번호는 현재 `admin_password_hash` 값을 그대로 비교하는 테스트 단계입니다.</p>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ background: 'linear-gradient(135deg,#fffaf2,#f4e7d3)', border: '1px solid #e5d5bd', borderRadius: 20, padding: 22 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ margin: '0 0 8px', fontSize: 12, color: '#8b6e4e', fontWeight: 700 }}>로그인 완료</p>
                    <h2 style={{ margin: '0 0 8px', fontSize: 26, fontFamily: "'Gowun Batang', serif" }}>{session.name}님 환영합니다</h2>
                    <p style={{ margin: 0, color: '#6e5b48' }}>{session.phone} · {getRoleLabel(session.role)}</p>
                  </div>
                  <button onClick={handleLogout} style={{ border: '1px solid #d8c8af', background: '#fff', borderRadius: 999, padding: '10px 14px', cursor: 'pointer', fontWeight: 700, color: '#6e5b48' }}>로그아웃</button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 18, gridTemplateColumns: '1.2fr 0.8fr' }}>
                <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>권한별 메뉴</p>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {(MENU_BY_ROLE[session.role] || []).map((menu) => (
                      <button key={menu.key} onClick={() => handleMenuClick(menu.key)} style={{ ...cardStyle(menu.tone), textAlign: 'left' }}>
                        <p style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: menu.tone }}>{menu.title}</p>
                        <p style={{ margin: 0, color: '#6e5b48', lineHeight: 1.7 }}>{menu.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 18 }}>
                  <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
                    <p style={{ margin: '0 0 10px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>내 소속</p>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {(session.organizations || []).map((org, index) => (
                        <div key={`${org.name}-${index}`} style={{ background: '#faf5ec', borderRadius: 12, padding: '12px 13px' }}>
                          <p style={{ margin: '0 0 3px', fontWeight: 700 }}>{org.name}</p>
                          <p style={{ margin: 0, fontSize: 13, color: '#6e5b48' }}>{org.category} · {org.roleInOrg}</p>
                        </div>
                      ))}
                      {(!session.organizations || session.organizations.length === 0) && (
                        <div style={{ background: '#faf5ec', borderRadius: 12, padding: '12px 13px', color: '#6e5b48' }}>
                          아직 연결된 소속이 없습니다.
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
                    <p style={{ margin: '0 0 10px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>구성 메모</p>
                    <p style={{ margin: 0, color: '#6e5b48', lineHeight: 1.8 }}>
                      현재 테스트안은 상단 회원 카드, 좌측 권한별 메뉴, 우측 소속 정보 패널 구조입니다. 실제 운영 전에는 메뉴 수와 깊이에 따라 하단 탭 또는 카드형 허브 중 하나로 더 좁히는 것이 좋습니다.
                    </p>
                    {canAccessAdmin(session) && (
                      <button onClick={() => router.push('/beta/admin')} style={{ marginTop: 14, width: '100%', border: 'none', borderRadius: 14, padding: '13px 14px', background: 'linear-gradient(135deg,#684737,#8f5a49)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                        관리자 접근 테스트
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
