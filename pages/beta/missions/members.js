import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import BetaMissionsShell from '../../../components/beta/BetaMissionsShell'
import { readBetaSession } from '../../../components/beta/mockAuth'
import { calcAge, readMissionsStore, writeMissionsStore } from '../../../components/beta/missionsStore'

export default function BetaMissionMembersPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [store, setStore] = useState(null)
  const [form, setForm] = useState({ status: '회원', name: '', birthYear: '', note: '' })

  useEffect(() => {
    const saved = readBetaSession()
    if (!saved || (saved.role !== 'leader' && saved.role !== 'admin')) {
      router.replace('/beta/missions')
      return
    }
    setSession(saved)
    setStore(readMissionsStore())
  }, [router])

  if (!session || !store) return null

  function updateMembers(nextMembers) {
    const next = { ...store, members: nextMembers }
    setStore(next)
    writeMissionsStore(next)
  }

  function addMember(event) {
    event.preventDefault()
    if (!form.name.trim()) return
    updateMembers([
      {
        id: `mm-${Date.now()}`,
        status: form.status,
        name: form.name.trim(),
        birthYear: Number(form.birthYear) || null,
        note: form.note.trim(),
      },
      ...store.members,
    ])
    setForm({ status: '회원', name: '', birthYear: '', note: '' })
  }

  return (
    <BetaMissionsShell title="회원관리" subtitle="회원/비회원, 출생년도, 나이, 메모를 관리하는 테스트 화면입니다." session={session} activeKey="members">
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: '0.9fr 1.1fr' }}>
        <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>회원 추가</p>
          <form onSubmit={addMember} style={{ display: 'grid', gap: 12 }}>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }}>
              <option value="회원">회원</option>
              <option value="비회원">비회원</option>
            </select>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="이름" style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
            <input value={form.birthYear} onChange={(e) => setForm({ ...form, birthYear: e.target.value })} placeholder="출생년도" style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="기타 메모" style={{ minHeight: 120, padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af', resize: 'vertical' }} />
            <button type="submit" style={{ border: 'none', borderRadius: 14, padding: '13px 16px', background: 'linear-gradient(135deg,#8f693f,#b98657)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>회원 저장</button>
          </form>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>회원 목록</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {store.members.map((member) => (
              <div key={member.id} style={{ background: '#faf5ec', borderRadius: 14, padding: '14px 15px', display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{member.name}</p>
                  <span style={{ fontSize: 12, fontWeight: 700, color: member.status === '회원' ? '#2f7d4c' : '#9a6c4d' }}>{member.status}</span>
                </div>
                <p style={{ margin: 0, color: '#6e5b48', fontSize: 13 }}>
                  출생년도: {member.birthYear || '-'} · 나이: {calcAge(member.birthYear)}
                </p>
                <p style={{ margin: 0, color: '#6e5b48', lineHeight: 1.7 }}>{member.note || '메모 없음'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BetaMissionsShell>
  )
}
