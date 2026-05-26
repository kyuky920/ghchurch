import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import BetaMissionsShell from '../../../components/beta/BetaMissionsShell'
import { readBetaSession } from '../../../components/beta/mockAuth'
import { fetchMissionsStore, mutateMissionsStore } from '../../../components/beta/missionsStore'
import useIsWide from '../../../components/beta/useIsWide'

export default function BetaMissionDocumentsPage() {
  const router = useRouter()
  const isWide = useIsWide(920)
  const [session, setSession] = useState(null)
  const [store, setStore] = useState(null)
  const [form, setForm] = useState({ title: '', content: '' })
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
    return <BetaMissionsShell title="회의록관리" subtitle="회의록 데이터를 불러오는 중입니다." session={session} activeKey="documents"><div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20, color: '#6e5b48' }}>{error || '불러오는 중...'}</div></BetaMissionsShell>
  }

  async function submitDocument(event) {
    event.preventDefault()
    if (!form.title.trim()) return
    try {
      setSaving(true)
      const result = await mutateMissionsStore('addDocument', {
        actorId: session.id,
        title: form.title.trim(),
        content: form.content.trim(),
        documentType: 'meeting_note',
      })
      setStore(result.store)
      setForm({ title: '', content: '' })
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <BetaMissionsShell title="회의록관리" subtitle="회의 내용을 업로드하고 열람합니다." session={session} activeKey="documents">
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: isWide ? '0.9fr 1.1fr' : '1fr' }}>
        <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>회의록 업로드</p>
          <form onSubmit={submitDocument} style={{ display: 'grid', gap: 12 }}>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="회의 제목" style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="회의 내용" style={{ minHeight: 180, padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af', resize: 'vertical' }} />
            {error && <p style={{ margin: 0, color: '#b33f3f', fontSize: 13 }}>{error}</p>}
            <button type="submit" disabled={saving} style={{ border: 'none', borderRadius: 14, padding: '13px 16px', background: 'linear-gradient(135deg,#8f693f,#b98657)', color: '#fff', fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.65 : 1 }}>{saving ? '업로드 중...' : '업로드'}</button>
          </form>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>회의록 목록</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {store.documents.map((doc) => (
              <div key={doc.id} style={{ background: '#faf5ec', borderRadius: 14, padding: '14px 15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{doc.title}</p>
                  <span style={{ fontSize: 12, color: '#8b6e4e', fontWeight: 700 }}>{doc.createdAt}</span>
                </div>
                <p style={{ margin: 0, color: '#6e5b48', lineHeight: 1.7 }}>{doc.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BetaMissionsShell>
  )
}
