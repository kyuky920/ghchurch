import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import BetaMissionsShell, { canManageMissions } from '../../../components/beta/BetaMissionsShell'
import { readBetaSession } from '../../../components/beta/mockAuth'
import { missionDateKey, readMissionsStore, writeMissionsStore } from '../../../components/beta/missionsStore'

export default function BetaMissionSchedulesPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [store, setStore] = useState(null)
  const [form, setForm] = useState({ date: missionDateKey(), title: '', detail: '', type: 'event' })

  useEffect(() => {
    const saved = readBetaSession()
    if (!saved) {
      router.replace('/beta')
      return
    }
    setSession(saved)
    setStore(readMissionsStore())
  }, [router])

  if (!session || !store) return null

  function persist(next) {
    setStore(next)
    writeMissionsStore(next)
  }

  function submitItem(event) {
    event.preventDefault()
    if (!form.title.trim()) return
    persist({
      ...store,
      schedules: [
        { id: `ms-${Date.now()}`, ...form, title: form.title.trim(), detail: form.detail.trim() },
        ...store.schedules,
      ],
    })
    setForm({ date: missionDateKey(), title: '', detail: '', type: 'event' })
  }

  return (
    <BetaMissionsShell title="일정/공지" subtitle="월 기준 행사와 토요 일정, 공지를 전체 회원에게 보여주는 테스트 화면입니다." session={session} activeKey="schedules">
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: canManageMissions(session) ? '0.9fr 1.1fr' : '1fr' }}>
        {canManageMissions(session) && (
          <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>일정/공지 추가</p>
            <form onSubmit={submitItem} style={{ display: 'grid', gap: 12 }}>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }}>
                <option value="event">행사/일정</option>
                <option value="notice">공지</option>
              </select>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="제목" style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
              <textarea value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="세부 내용" style={{ minHeight: 120, padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af', resize: 'vertical' }} />
              <button type="submit" style={{ border: 'none', borderRadius: 14, padding: '13px 16px', background: 'linear-gradient(135deg,#8f693f,#b98657)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>저장</button>
            </form>
          </div>
        )}

        <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>공지 및 일정 목록</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {store.schedules.map((item) => (
              <div key={item.id} style={{ background: item.type === 'notice' ? '#fff7e7' : '#f4f8ff', borderRadius: 14, padding: '14px 15px', border: `1px solid ${item.type === 'notice' ? '#f1d8a0' : '#d7e5ff'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{item.title}</p>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.type === 'notice' ? '#b27b25' : '#4e6fae' }}>
                    {item.type === 'notice' ? '공지' : '일정'}
                  </span>
                </div>
                <p style={{ margin: '0 0 3px', color: '#6e5b48', fontSize: 13 }}>{item.date}</p>
                <p style={{ margin: 0, color: '#6e5b48', lineHeight: 1.7 }}>{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BetaMissionsShell>
  )
}
