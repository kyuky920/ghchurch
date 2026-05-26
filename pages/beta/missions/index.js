import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import BetaMissionsShell, { canManageMissions } from '../../../components/beta/BetaMissionsShell'
import { readBetaSession } from '../../../components/beta/mockAuth'
import { fetchMissionsStore, missionDateKey, missionMonthKey } from '../../../components/beta/missionsStore'

function statCard(title, value, tone, desc) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${tone}33`, borderLeft: `4px solid ${tone}`, borderRadius: 18, padding: '18px 18px 16px' }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: tone, fontWeight: 700 }}>{title}</p>
      <p style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 700 }}>{value}</p>
      <p style={{ margin: 0, color: '#6e5b48', lineHeight: 1.7 }}>{desc}</p>
    </div>
  )
}

export default function BetaMissionsHomePage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [store, setStore] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const saved = readBetaSession()
    if (!saved) {
      router.replace('/beta')
      return
    }
    setSession(saved)
    fetchMissionsStore(saved.id)
      .then((result) => {
        setStore(result.store)
        setError('')
      })
      .catch((err) => setError(err.message))
  }, [router])

  if (!session) return null
  if (!store) {
    return (
      <BetaMissionsShell title="선교회 운영" subtitle="선교회 데이터를 불러오는 중입니다." session={session} activeKey="home">
        <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20, color: '#6e5b48' }}>{error || '불러오는 중...'}</div>
      </BetaMissionsShell>
    )
  }

  const today = missionDateKey()
  const thisMonth = missionMonthKey()
  const todayPlan = store.biblePlans[today]
  const thisMonthDues = Object.entries(store.duesPayments).filter(([key]) => key.startsWith(`${thisMonth}:`))
  const paidCount = thisMonthDues.filter(([, value]) => value.paid).length
  const balance = store.financeEntries.reduce((sum, entry) => sum + (entry.kind === 'income' ? entry.amount : -entry.amount), 0)
  const openVotes = store.votes.filter((vote) => vote.status === 'open').length

  return (
    <BetaMissionsShell
      title="선교회 운영"
      subtitle="회원, 회비, 재정, 성경읽기, 일정, 투표, 회의록 기능을 한곳에서 관리합니다."
      session={session}
      activeKey="home"
    >
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        {statCard('오늘 성경읽기', todayPlan?.range || '미등록', '#8f693f', '오늘 읽을 범위와 메모를 확인합니다.')}
        {statCard('이번 달 회비', `${paidCount}/${thisMonthDues.length}`, '#2f7d4c', '회원별 회비 납부 현황을 한눈에 봅니다.')}
        {statCard('현재 잔액', `${balance.toLocaleString()}원`, '#5d74b3', '수입과 지출을 합산한 현재 잔액입니다.')}
        {statCard('진행 중 투표', `${openVotes}건`, '#a34d4d', '현재 응답 가능한 투표 수입니다.')}
      </div>

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: '1.1fr 0.9fr' }}>
        <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>빠른 이동</p>
          <div style={{ display: 'grid', gap: 12 }}>
            {[
              { href: '/beta/missions/bible', title: '성경읽기 입력', desc: '오늘 읽음 여부와 메모를 바로 남깁니다.' },
              { href: '/beta/missions/schedules', title: '일정/공지 확인', desc: '가까운 일정과 공지사항을 확인합니다.' },
              { href: '/beta/missions/votes', title: '투표 참여', desc: '수련회 참석 여부 등 응답을 제출합니다.' },
              ...(canManageMissions(session)
                ? [
                    { href: '/beta/missions/dues', title: '회비관리', desc: '월별 회비 금액과 납부 상태를 관리합니다.' },
                    { href: '/beta/missions/finance', title: '수입지출', desc: '입출금과 기간 리포트를 관리합니다.' },
                  ]
                : []),
            ].map((item) => (
              <Link key={item.href} href={item.href} style={{ textDecoration: 'none', background: '#faf5ec', borderRadius: 14, padding: '15px 16px', border: '1px solid #eadbc5' }}>
                <p style={{ margin: '0 0 5px', fontSize: 17, fontWeight: 700, color: '#4a3520' }}>{item.title}</p>
                <p style={{ margin: 0, color: '#6e5b48', lineHeight: 1.7 }}>{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>최근 공지/일정</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {store.schedules.slice(0, 4).map((item) => (
                <div key={item.id} style={{ background: item.type === 'notice' ? '#fff7e7' : '#f4f8ff', borderRadius: 12, padding: '12px 13px' }}>
                  <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{item.title}</p>
                  <p style={{ margin: '0 0 3px', fontSize: 13, color: '#6e5b48' }}>{item.date}</p>
                  <p style={{ margin: 0, color: '#6e5b48', lineHeight: 1.7 }}>{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>운영 메모</p>
            <p style={{ margin: 0, color: '#6e5b48', lineHeight: 1.8 }}>
              이 영역은 운영 중인 말씀나눔 서비스와 분리되어 있으며, 선교회 데이터도 실제 Supabase를 기준으로 읽고 씁니다. 메뉴 배치와 권한 정책을 확인하면서 운영 구조를 정리하는 용도입니다.
            </p>
          </div>
        </div>
      </div>
    </BetaMissionsShell>
  )
}
