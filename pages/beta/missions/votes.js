import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import BetaMissionsShell, { canManageMissions } from '../../../components/beta/BetaMissionsShell'
import { readBetaSession } from '../../../components/beta/mockAuth'
import { fetchMissionsStore, mutateMissionsStore } from '../../../components/beta/missionsStore'

export default function BetaMissionVotesPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [store, setStore] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', visibility: 'public' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const saved = readBetaSession()
    if (!saved) {
      router.replace('/beta')
      return
    }
    setSession(saved)
    fetchMissionsStore(saved.id)
      .then((result) => setStore(result.store))
      .catch((err) => setError(err.message))
  }, [router])

  if (!session) return null
  if (!store) {
    return <BetaMissionsShell title="투표" subtitle="투표 데이터를 불러오는 중입니다." session={session} activeKey="votes"><div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20, color: '#6e5b48' }}>{error || '불러오는 중...'}</div></BetaMissionsShell>
  }

  async function createVote(event) {
    event.preventDefault()
    if (!form.title.trim()) return
    try {
      setSaving(true)
      const result = await mutateMissionsStore('addVote', {
        actorId: session.id,
        title: form.title.trim(),
        description: form.description.trim(),
        visibility: form.visibility,
      })
      setStore(result.store)
      setForm({ title: '', description: '', visibility: 'public' })
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveResponse(voteId, choice, note) {
    try {
      const result = await mutateMissionsStore('respondVote', {
        actorId: session.id,
        voteId,
        choice,
        note,
      })
      setStore(result.store)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <BetaMissionsShell title="투표" subtitle="참석 여부, 신청 의사 등 응답을 받고 공개/비공개 결과를 확인합니다." session={session} activeKey="votes">
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: canManageMissions(session) ? '0.9fr 1.1fr' : '1fr' }}>
        {canManageMissions(session) && (
          <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>투표 생성</p>
            <form onSubmit={createVote} style={{ display: 'grid', gap: 12 }}>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="투표 제목" style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="설명 (예: 자녀 이름을 함께 적어 주세요)" style={{ minHeight: 120, padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af', resize: 'vertical' }} />
              <select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }}>
                <option value="public">공개</option>
                <option value="private">비공개</option>
              </select>
              {error && <p style={{ margin: 0, color: '#b33f3f', fontSize: 13 }}>{error}</p>}
              <button type="submit" disabled={saving} style={{ border: 'none', borderRadius: 14, padding: '13px 16px', background: 'linear-gradient(135deg,#8f693f,#b98657)', color: '#fff', fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.65 : 1 }}>{saving ? '저장 중...' : '투표 저장'}</button>
            </form>
          </div>
        )}

        <div style={{ display: 'grid', gap: 14 }}>
          {store.votes.map((vote) => {
            const myResponse = vote.responses[session.id] || { choice: '', note: '' }
            const yesCount = Object.values(vote.responses).filter((response) => response.choice === '참석').length
            const noCount = Object.values(vote.responses).filter((response) => response.choice === '불참').length
            const total = Math.max(yesCount + noCount, 1)
            return (
              <VoteCard
                key={vote.id}
                vote={vote}
                myResponse={myResponse}
                yesCount={yesCount}
                noCount={noCount}
                total={total}
                canManage={canManageMissions(session)}
                onSave={saveResponse}
              />
            )
          })}
        </div>
      </div>
    </BetaMissionsShell>
  )
}

function VoteCard({ vote, myResponse, yesCount, noCount, total, canManage, onSave }) {
  const [choice, setChoice] = useState(myResponse.choice || '')
  const [note, setNote] = useState(myResponse.note || '')

  useEffect(() => {
    setChoice(myResponse.choice || '')
    setNote(myResponse.note || '')
  }, [myResponse.choice, myResponse.note])

  return (
    <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 20, fontFamily: "'Gowun Batang', serif" }}>{vote.title}</h3>
        <span style={{ fontSize: 12, fontWeight: 700, color: vote.visibility === 'public' ? '#2f7d4c' : '#9a6c4d' }}>
          {vote.visibility === 'public' ? '공개' : '비공개'}
        </span>
      </div>
      <p style={{ margin: '0 0 12px', color: '#6e5b48', lineHeight: 1.7 }}>{vote.description}</p>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setChoice('참석')} style={{ flex: 1, border: choice === '참석' ? 'none' : '1px solid #d8c8af', background: choice === '참석' ? '#2f7d4c' : '#fff', color: choice === '참석' ? '#fff' : '#6e5b48', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', fontWeight: 700 }}>참석</button>
          <button onClick={() => setChoice('불참')} style={{ flex: 1, border: choice === '불참' ? 'none' : '1px solid #d8c8af', background: choice === '불참' ? '#a34d4d' : '#fff', color: choice === '불참' ? '#fff' : '#6e5b48', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', fontWeight: 700 }}>불참</button>
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="비고 또는 자녀 이름" style={{ minHeight: 90, padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af', resize: 'vertical' }} />
        <button onClick={() => onSave(vote.id, choice, note)} style={{ border: 'none', borderRadius: 14, padding: '13px 16px', background: 'linear-gradient(135deg,#8f693f,#b98657)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          응답 저장
        </button>
        {(vote.visibility === 'public' || canManage) && (
          <div style={{ marginTop: 4, display: 'grid', gap: 8 }}>
            <VoteBar label="참석" value={yesCount} total={total} tone="#2f7d4c" />
            <VoteBar label="불참" value={noCount} total={total} tone="#a34d4d" />
          </div>
        )}
      </div>
    </div>
  )
}

function VoteBar({ label, value, total, tone }) {
  const width = `${Math.round((value / total) * 100)}%`
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: tone }}>{label}</span>
        <span style={{ fontSize: 13, color: '#6e5b48' }}>{value}명</span>
      </div>
      <div style={{ height: 10, background: '#efe6da', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width, height: '100%', background: tone }} />
      </div>
    </div>
  )
}
