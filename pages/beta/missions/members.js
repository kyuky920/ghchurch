import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import BetaMissionsShell from '../../../components/beta/BetaMissionsShell'
import { readBetaSession } from '../../../components/beta/mockAuth'
import { calcAge, fetchMissionsStore, mutateMissionsStore } from '../../../components/beta/missionsStore'
import useIsWide from '../../../components/beta/useIsWide'

export default function BetaMissionMembersPage() {
  const router = useRouter()
  const isWide = useIsWide(920)
  const [session, setSession] = useState(null)
  const [store, setStore] = useState(null)
  const [form, setForm] = useState({ status: '회원', name: '', phone: '', birthYear: '', note: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

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
    return <BetaMissionsShell title="회원관리" subtitle="회원 데이터를 불러오는 중입니다." session={session} activeKey="members"><div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20, color: '#6e5b48' }}>{error || '불러오는 중...'}</div></BetaMissionsShell>
  }

  async function addMember(event) {
    event.preventDefault()
    if (!form.name.trim()) return
    try {
      setSaving(true)
      const result = await mutateMissionsStore('addMember', {
        actorId: session.id,
        status: form.status,
        name: form.name.trim(),
        phone: form.phone.trim(),
        birthYear: form.birthYear,
        note: form.note.trim(),
      })
      setStore(result.store)
      setForm({ status: '회원', name: '', phone: '', birthYear: '', note: '' })
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <BetaMissionsShell title="회원관리" subtitle="회원/비회원, 출생년도, 나이, 메모를 관리합니다." session={session} activeKey="members">
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: isWide ? '0.9fr 1.1fr' : '1fr' }}>
        <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>회원 추가</p>
          <form onSubmit={addMember} style={{ display: 'grid', gap: 12 }}>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }}>
              <option value="회원">회원</option>
              <option value="비회원">비회원</option>
            </select>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="이름" style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="전화번호" style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
            <input value={form.birthYear} onChange={(e) => setForm({ ...form, birthYear: e.target.value })} placeholder="출생년도" style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="기타 메모" style={{ minHeight: 120, padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af', resize: 'vertical' }} />
            {error && <p style={{ margin: 0, color: '#b33f3f', fontSize: 13 }}>{error}</p>}
            <button type="submit" disabled={saving} style={{ border: 'none', borderRadius: 14, padding: '13px 16px', background: 'linear-gradient(135deg,#8f693f,#b98657)', color: '#fff', fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.65 : 1 }}>{saving ? '저장 중...' : '회원 저장'}</button>
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
                <p style={{ margin: 0, color: '#6e5b48', fontSize: 13 }}>
                  전화번호: {member.phone || '미입력'}
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
