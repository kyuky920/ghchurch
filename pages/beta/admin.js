import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import {
  canAccessAdmin,
  getRoleLabel,
  readAdminVerifiedMemberId,
  readBetaSession,
  writeAdminVerifiedMemberId,
} from '../../components/beta/mockAuth'
import { verifyBetaAdmin } from '../../components/beta/missionsStore'

export default function BetaAdminPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const saved = readBetaSession()
    if (!saved) {
      router.replace('/beta')
      return
    }
    if (!canAccessAdmin(saved)) {
      router.replace('/beta')
      return
    }
    setSession(saved)
    setVerified(readAdminVerifiedMemberId() === saved.id)
  }, [router])

  if (!session) return null

  async function handleVerify(event) {
    event.preventDefault()
    try {
      setLoading(true)
      await verifyBetaAdmin(session.id, password)
      writeAdminVerifiedMemberId(session.id)
      setVerified(true)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>광흥교회 통합 앱 관리자 테스트</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <div style={{ minHeight: '100vh', background: '#f4efe6' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 18px 64px' }}>
          <button onClick={() => router.push('/beta')} style={{ border: '1px solid #dccdb6', background: '#fff', borderRadius: 999, padding: '10px 14px', cursor: 'pointer', fontWeight: 700, color: '#6e5b48', marginBottom: 16 }}>
            메인으로 돌아가기
          </button>

          <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 20, padding: 22, marginBottom: 18 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#8b6e4e', fontWeight: 700 }}>관리자 진입 테스트</p>
            <h1 style={{ margin: '0 0 8px', fontSize: 28, fontFamily: "'Gowun Batang', serif" }}>{session.name} · {getRoleLabel(session.role)}</h1>
            <p style={{ margin: 0, color: '#6e5b48' }}>일반 로그인 이후, 관리자 화면 접근 시에만 개인 비밀번호를 한 번 더 요구하는 구조입니다.</p>
          </div>

          {!verified ? (
            <div style={{ background: '#fffdf8', border: '1px solid #e5d5bd', borderRadius: 18, padding: 22, maxWidth: 420 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>개인 비밀번호 확인</p>
              <form onSubmit={handleVerify} style={{ display: 'grid', gap: 12 }}>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="관리자 비밀번호" style={{ width: '100%', padding: '14px 15px', borderRadius: 12, border: '1px solid #d8c8af', fontSize: 15 }} />
                {error && <p style={{ margin: 0, color: '#b33f3f', fontSize: 13 }}>{error}</p>}
                <button type="submit" disabled={loading} style={{ border: 'none', borderRadius: 14, padding: '14px 16px', background: 'linear-gradient(135deg,#684737,#8f5a49)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.65 : 1 }}>
                  {loading ? '확인 중...' : '관리 권한 확인'}
                </button>
              </form>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 18, gridTemplateColumns: '1fr 1fr' }}>
              <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>관리 메뉴 샘플</p>
                <div style={{ display: 'grid', gap: 10 }}>
                  {[
                    '회원 목록 및 권한 설정',
                    '조직/소속 관리',
                    '출석/셀모임 운영 관리',
                    '공지/콘텐츠 게시 관리',
                  ].map((item) => (
                    <div key={item} style={{ background: '#faf5ec', borderRadius: 12, padding: '13px 14px', fontWeight: 700 }}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>관리자 인증 정책 메모</p>
                <p style={{ margin: 0, color: '#6e5b48', lineHeight: 1.8 }}>
                  이 테스트안은 일반 사용자는 이름과 전화번호로 쉽게 들어오고, 민감한 관리 기능에 들어갈 때만 비밀번호를 한 번 더 묻는 흐름입니다. 실제 운영 전에는 비밀번호를 해시로 저장하고, 인증 유지 시간을 제한하는 것이 좋습니다.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
