import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import BetaMissionsShell, { canManageMissions } from '../../../components/beta/BetaMissionsShell'
import { readBetaSession } from '../../../components/beta/mockAuth'
import { missionDateKey, readMissionsStore, writeMissionsStore } from '../../../components/beta/missionsStore'

export default function BetaMissionVotesPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [store, setStore] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', visibility: 'public' })

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

  function createVote(event) {
    event.preventDefault()
    if (!form.title.trim()) return
    persist({
      ...store,
      votes: [
        {
          id: `mv-${Date.now()}`,
          title: form.title.trim(),
          description: form.description.trim(),
          visibility: form.visibility,
          status: 'open',
          createdAt: missionDateKey(),
          responses: {},
        },
        ...store.votes,
      ],
    })
    setForm({ title: '', description: '', visibility: 'public' })
  }

  function saveResponse(voteId, choice, note) {
    persist({
      ...store,
      votes: store.votes.map((vote) => (
        vote.id !== voteId
          ? vote
          : {
              ...vote,
              responses: {
                ...vote.responses,
                [session.id]: { choice, note },
              },
            }
      )),
    })
  }

  return (
    <BetaMissionsShell title="투표" subtitle="참석 여부, 신청 의사 등 응답을 받고 공개/비공개 결과를 확인하는 테스트 화면입니다." session={session} activeKey="votes">
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
              <button type="submit" style={{ border: 'none', borderRadius: 14, padding: '13px 16px', background: 'linear-gradient(135deg,#8f693f,#b98657)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>투표 저장</button>
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
