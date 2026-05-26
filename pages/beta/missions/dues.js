import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import BetaMissionsShell from '../../../components/beta/BetaMissionsShell'
import { readBetaSession } from '../../../components/beta/mockAuth'
import { fetchMissionsStore, missionMonthKey, mutateMissionsStore } from '../../../components/beta/missionsStore'
import useIsWide from '../../../components/beta/useIsWide'

export default function BetaMissionDuesPage() {
  const router = useRouter()
  const isWide = useIsWide(920)
  const [session, setSession] = useState(null)
  const [store, setStore] = useState(null)
  const [month, setMonth] = useState(missionMonthKey())
  const [error, setError] = useState('')

  useEffect(() => {
    const saved = readBetaSession()
    if (!saved || (saved.role !== 'leader' && saved.role !== 'admin')) {
      router.replace('/beta/missions')
      return
    }
    setSession(saved)
    fetchMissionsStore(saved.id)
      .then((result) => setStore(result.store))
      .catch((err) => setError(err.message))
  }, [router])

  if (!session) return null
  if (!store) {
    return <BetaMissionsShell title="회비관리" subtitle="회비 데이터를 불러오는 중입니다." session={session} activeKey="dues"><div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20, color: '#6e5b48' }}>{error || '불러오는 중...'}</div></BetaMissionsShell>
  }

  const amount = store.duesSettings[month]?.amount || 10000
  const currentMembers = store.members.filter((member) => member.status === '회원')

  async function updateAmount(value) {
    try {
      const result = await mutateMissionsStore('setDuesSetting', {
        actorId: session.id,
        month,
        amount: Number(value) || 0,
      })
      setStore(result.store)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function togglePaid(memberId, paid) {
    try {
      const key = `${month}:${memberId}`
      const current = store.duesPayments[key] || { paid: false, amount, memo: '' }
      const result = await mutateMissionsStore('toggleDuesPayment', {
        actorId: session.id,
        memberId,
        month,
        amount: current.amount || amount,
        paid: !paid,
        memo: current.memo || '',
      })
      setStore(result.store)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const paidRows = currentMembers.map((member) => {
    const key = `${month}:${member.id}`
    return { member, payment: store.duesPayments[key] || { paid: false, amount, memo: '' } }
  })
  const paidTotal = paidRows.reduce((sum, row) => sum + (row.payment.paid ? Number(row.payment.amount || 0) : 0), 0)

  return (
    <BetaMissionsShell title="회비관리" subtitle="월별 회비 금액을 설정하고 회원별 납부 상태를 관리합니다." session={session} activeKey="dues">
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: isWide ? '0.8fr 1.2fr' : '1fr' }}>
        <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>설정</p>
          <div style={{ display: 'grid', gap: 12 }}>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
            <input type="number" value={amount} onChange={(e) => updateAmount(e.target.value)} placeholder="월 회비 금액" style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
            {error && <p style={{ margin: 0, color: '#b33f3f', fontSize: 13 }}>{error}</p>}
            <div style={{ background: '#faf5ec', borderRadius: 14, padding: '14px 15px' }}>
              <p style={{ margin: '0 0 6px', fontSize: 12, color: '#8b6e4e', fontWeight: 700 }}>요약</p>
              <p style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>{paidTotal.toLocaleString()}원</p>
              <p style={{ margin: 0, color: '#6e5b48' }}>
                납부 {paidRows.filter((row) => row.payment.paid).length}명 / 대상 {paidRows.length}명
              </p>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>회원별 납부 현황</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {paidRows.map(({ member, payment }) => (
              <div key={member.id} style={{ background: '#faf5ec', borderRadius: 14, padding: '14px 15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{member.name}</p>
                  <p style={{ margin: 0, color: '#6e5b48', fontSize: 13 }}>{(payment.amount || amount).toLocaleString()}원</p>
                </div>
                <button
                  onClick={() => togglePaid(member.id, payment.paid)}
                  style={{
                    border: 'none',
                    borderRadius: 999,
                    padding: '10px 14px',
                    background: payment.paid ? '#2f7d4c' : '#e1d6c7',
                    color: payment.paid ? '#fff' : '#6e5b48',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  {payment.paid ? '납부 완료' : '미납'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BetaMissionsShell>
  )
}
