import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import BetaMissionsShell from '../../../components/beta/BetaMissionsShell'
import { readBetaSession } from '../../../components/beta/mockAuth'
import { fetchMissionsStore, missionDateKey, mutateMissionsStore } from '../../../components/beta/missionsStore'
import useIsWide from '../../../components/beta/useIsWide'

const INCOME_CATEGORIES = ['회비', '찬조금', '기타']
const EXPENSE_CATEGORIES = ['경조사비', '후원금', '교제비', '기타']

export default function BetaMissionFinancePage() {
  const router = useRouter()
  const isWide = useIsWide(920)
  const [session, setSession] = useState(null)
  const [store, setStore] = useState(null)
  const [period, setPeriod] = useState(missionDateKey().slice(0, 7))
  const [form, setForm] = useState({ date: missionDateKey(), kind: 'income', category: '회비', amount: '', note: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const saved = readBetaSession()
    if (!saved || (saved.role !== 'leader' && saved.role !== 'admin')) {
      router.replace('/beta/missions')
      return
    }
    setSession(saved)
    fetchMissionsStore(saved.id, saved.currentMissionGroupId)
      .then((result) => setStore(result.store))
      .catch((err) => setError(err.message))
  }, [router])

  const entries = useMemo(() => {
    if (!store) return []
    return store.financeEntries
      .filter((entry) => entry.date.startsWith(period))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [store, period])

  if (!session) return null
  if (!store) {
    return <BetaMissionsShell title="수입지출" subtitle="재정 데이터를 불러오는 중입니다." session={session} activeKey="finance"><div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20, color: '#6e5b48' }}>{error || '불러오는 중...'}</div></BetaMissionsShell>
  }

  const income = entries.filter((entry) => entry.kind === 'income').reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  const expense = entries.filter((entry) => entry.kind === 'expense').reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  const balance = income - expense

  async function submitEntry(event) {
    event.preventDefault()
    if (!form.amount) return
    try {
      setSaving(true)
      const result = await mutateMissionsStore('addFinanceEntry', {
        actorId: session.id,
        missionGroupId: session.currentMissionGroupId,
        date: form.date,
        kind: form.kind,
        category: form.category,
        amount: Number(form.amount),
        note: form.note.trim(),
      })
      setStore(result.store)
      setForm({ date: missionDateKey(), kind: 'income', category: '회비', amount: '', note: '' })
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function printReport() {
    window.print()
  }

  return (
    <BetaMissionsShell
      title="수입지출"
      subtitle="수입/지출을 분류별로 입력하고 기간별 수입, 지출, 잔액을 확인합니다."
      session={session}
      activeKey="finance"
      actions={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={printReport} style={{ border: '1px solid #d8c8af', background: '#fff', borderRadius: 999, padding: '10px 14px', cursor: 'pointer', fontWeight: 700, color: '#6e5b48' }}>
            기간 리포트 출력
          </button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: isWide ? '0.9fr 1.1fr' : '1fr' }}>
        <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>내역 추가</p>
          <form onSubmit={submitEntry} style={{ display: 'grid', gap: 12 }}>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value, category: e.target.value === 'income' ? '회비' : '경조사비' })} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }}>
              <option value="income">수입</option>
              <option value="expense">지출</option>
            </select>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }}>
              {(form.kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="금액" style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="세부 내용" style={{ minHeight: 110, padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af', resize: 'vertical' }} />
            {error && <p style={{ margin: 0, color: '#b33f3f', fontSize: 13 }}>{error}</p>}
            <button type="submit" disabled={saving} style={{ border: 'none', borderRadius: 14, padding: '13px 16px', background: 'linear-gradient(135deg,#8f693f,#b98657)', color: '#fff', fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.65 : 1 }}>{saving ? '저장 중...' : '저장'}</button>
          </form>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>기간 요약</p>
              <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d8c8af' }} />
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: isWide ? 'repeat(3, minmax(0,1fr))' : '1fr' }}>
              <div style={{ background: '#f1f8ef', borderRadius: 14, padding: '14px 15px' }}>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: '#2f7d4c', fontWeight: 700 }}>수입</p>
                <p style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{income.toLocaleString()}원</p>
              </div>
              <div style={{ background: '#fff2ef', borderRadius: 14, padding: '14px 15px' }}>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: '#a34d4d', fontWeight: 700 }}>지출</p>
                <p style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{expense.toLocaleString()}원</p>
              </div>
              <div style={{ background: '#eef4ff', borderRadius: 14, padding: '14px 15px' }}>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: '#5d74b3', fontWeight: 700 }}>잔액</p>
                <p style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{balance.toLocaleString()}원</p>
              </div>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>기간별 내역</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {entries.map((entry) => (
                <div key={entry.id} style={{ background: '#faf5ec', borderRadius: 14, padding: '14px 15px', display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{entry.title || entry.category}</p>
                    <span style={{ color: entry.kind === 'income' ? '#2f7d4c' : '#a34d4d', fontWeight: 700 }}>
                      {entry.kind === 'income' ? '+' : '-'}{Number(entry.amount || 0).toLocaleString()}원
                    </span>
                  </div>
                  <p style={{ margin: 0, color: '#6e5b48', fontSize: 13 }}>{entry.date}</p>
                  <p style={{ margin: 0, color: '#6e5b48', lineHeight: 1.7 }}>{entry.note || '세부 내용 없음'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </BetaMissionsShell>
  )
}
