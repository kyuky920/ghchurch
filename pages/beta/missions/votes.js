import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import BetaMissionsShell, { canManageMissions } from '../../../components/beta/BetaMissionsShell'
import { readBetaSession } from '../../../components/beta/mockAuth'
import { fetchMissionsStore, mutateMissionsStore } from '../../../components/beta/missionsStore'
import useIsWide from '../../../components/beta/useIsWide'

const EMPTY_FORM = {
  title: '',
  description: '',
  visibility: 'public',
  optionsText: '참석\n불참',
}

export default function BetaMissionVotesPage() {
  const router = useRouter()
  const isWide = useIsWide(920)
  const [session, setSession] = useState(null)
  const [store, setStore] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('open')
  const [editingVoteId, setEditingVoteId] = useState('')

  useEffect(() => {
    const saved = readBetaSession()
    if (!saved) {
      router.replace('/beta')
      return
    }
    setSession(saved)
    fetchMissionsStore(saved.id, saved.currentMissionGroupId)
      .then((result) => setStore(result.store))
      .catch((err) => setError(err.message))
  }, [router])

  if (!session) return null
  if (!store) {
    return <BetaMissionsShell title="투표" subtitle="투표 데이터를 불러오는 중입니다." session={session} activeKey="votes"><div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20, color: '#6e5b48' }}>{error || '불러오는 중...'}</div></BetaMissionsShell>
  }

  const visibleVotes = store.votes.filter((vote) => {
    if (filter === 'all') return true
    return vote.status === filter
  })

  async function createVote(event) {
    event.preventDefault()
    if (!form.title.trim()) return
    try {
      setSaving(true)
      const action = editingVoteId ? 'updateVote' : 'addVote'
      const result = await mutateMissionsStore(action, {
        actorId: session.id,
        missionGroupId: session.currentMissionGroupId,
        voteId: editingVoteId,
        title: form.title.trim(),
        description: form.description.trim(),
        visibility: form.visibility,
        options: form.optionsText.split('\n').map((item) => item.trim()).filter(Boolean),
      })
      setStore(result.store)
      setForm(EMPTY_FORM)
      setEditingVoteId('')
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
        missionGroupId: session.currentMissionGroupId,
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

  async function setVoteStatus(voteId, status) {
    try {
      const result = await mutateMissionsStore('setVoteStatus', {
        actorId: session.id,
        missionGroupId: session.currentMissionGroupId,
        voteId,
        status,
      })
      setStore(result.store)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function deleteVote(voteId) {
    try {
      const result = await mutateMissionsStore('deleteVote', {
        actorId: session.id,
        missionGroupId: session.currentMissionGroupId,
        voteId,
      })
      setStore(result.store)
      if (editingVoteId === voteId) {
        setEditingVoteId('')
        setForm(EMPTY_FORM)
      }
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  function startEdit(vote) {
    setEditingVoteId(vote.id)
    setForm({
      title: vote.title,
      description: vote.description,
      visibility: vote.visibility,
      optionsText: (vote.options || []).map((item) => item.label).join('\n') || '참석\n불참',
    })
  }

  return (
    <BetaMissionsShell title="투표" subtitle="참석 여부, 신청 의사 등 응답을 받고 공개/비공개 결과를 확인합니다." session={session} activeKey="votes">
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: canManageMissions(session) && isWide ? '0.9fr 1.1fr' : '1fr' }}>
        {canManageMissions(session) && (
          <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>{editingVoteId ? '투표 수정' : '투표 생성'}</p>
              {editingVoteId && (
                <button onClick={() => { setEditingVoteId(''); setForm(EMPTY_FORM) }} type="button" style={{ border: '1px solid #d8c8af', background: '#fff', borderRadius: 999, padding: '8px 12px', cursor: 'pointer', fontWeight: 700, color: '#6e5b48' }}>
                  수정 취소
                </button>
              )}
            </div>
            <form onSubmit={createVote} style={{ display: 'grid', gap: 12 }}>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="투표 제목" style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="설명 (예: 자녀 이름을 함께 적어 주세요)" style={{ minHeight: 120, padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af', resize: 'vertical' }} />
              <textarea value={form.optionsText} onChange={(e) => setForm({ ...form, optionsText: e.target.value })} placeholder="선택지를 한 줄에 하나씩 입력해 주세요" style={{ minHeight: 110, padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af', resize: 'vertical' }} />
              <select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }}>
                <option value="public">공개</option>
                <option value="private">비공개</option>
              </select>
              {error && <p style={{ margin: 0, color: '#b33f3f', fontSize: 13 }}>{error}</p>}
              <button type="submit" disabled={saving} style={{ border: 'none', borderRadius: 14, padding: '13px 16px', background: 'linear-gradient(135deg,#8f693f,#b98657)', color: '#fff', fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.65 : 1 }}>{saving ? '저장 중...' : editingVoteId ? '투표 수정 저장' : '투표 저장'}</button>
            </form>
          </div>
        )}

        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isWide ? 'repeat(3, minmax(0,1fr))' : '1fr 1fr 1fr' }}>
            {[
              { key: 'open', label: '진행 중' },
              { key: 'closed', label: '종료됨' },
              { key: 'all', label: '전체' },
            ].map((item) => {
              const active = filter === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  style={{
                    border: active ? 'none' : '1px solid #d8c8af',
                    background: active ? '#8f693f' : '#fff',
                    color: active ? '#fff' : '#6e5b48',
                    borderRadius: 12,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          {visibleVotes.map((vote) => {
            const myResponse = vote.responses[session.id] || { choice: '', note: '' }
            const optionCounts = vote.options.map((option) => ({
              label: option.label,
              count: Object.values(vote.responses).filter((response) => response.choice === option.label).length,
            }))
            const total = Math.max(optionCounts.reduce((sum, item) => sum + item.count, 0), 1)
            return (
              <VoteCard
                key={vote.id}
                vote={vote}
                myResponse={myResponse}
                optionCounts={optionCounts}
                total={total}
                canManage={canManageMissions(session)}
                onSave={saveResponse}
                onEdit={startEdit}
                onDelete={deleteVote}
                onSetStatus={setVoteStatus}
              />
            )
          })}

          {visibleVotes.length === 0 && (
            <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20, color: '#6e5b48' }}>
              해당 조건의 투표가 없습니다.
            </div>
          )}
        </div>
      </div>
    </BetaMissionsShell>
  )
}

function VoteCard({ vote, myResponse, optionCounts, total, canManage, onSave, onEdit, onDelete, onSetStatus }) {
  const [choice, setChoice] = useState(myResponse.choice || '')
  const [note, setNote] = useState(myResponse.note || '')

  useEffect(() => {
    setChoice(myResponse.choice || '')
    setNote(myResponse.note || '')
  }, [myResponse.choice, myResponse.note])

  return (
    <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: '0 0 6px', fontSize: 20, fontFamily: "'Gowun Batang', serif" }}>{vote.title}</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: vote.visibility === 'public' ? '#2f7d4c' : '#9a6c4d' }}>
              {vote.visibility === 'public' ? '공개' : '비공개'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: vote.status === 'open' ? '#2f7d4c' : '#9a6c4d' }}>
              {vote.status === 'open' ? '진행 중' : '종료됨'}
            </span>
          </div>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => onEdit(vote)} style={miniButtonStyle()}>수정</button>
            <button type="button" onClick={() => onSetStatus(vote.id, vote.status === 'open' ? 'closed' : 'open')} style={miniButtonStyle()}>
              {vote.status === 'open' ? '종료' : '재오픈'}
            </button>
            <button type="button" onClick={() => onDelete(vote.id)} style={miniButtonStyle('#a34d4d')}>삭제</button>
          </div>
        )}
      </div>
      <p style={{ margin: '0 0 12px', color: '#6e5b48', lineHeight: 1.7 }}>{vote.description}</p>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: vote.options.length > 2 ? '1fr' : '1fr 1fr' }}>
          {vote.options.map((option) => {
            const active = choice === option.label
            return (
              <button
                key={option.id || option.label}
                type="button"
                onClick={() => setChoice(option.label)}
                disabled={vote.status !== 'open'}
                style={{
                  border: active ? 'none' : '1px solid #d8c8af',
                  background: active ? '#8f693f' : '#fff',
                  color: active ? '#fff' : '#6e5b48',
                  borderRadius: 12,
                  padding: '12px 14px',
                  cursor: vote.status === 'open' ? 'pointer' : 'default',
                  fontWeight: 700,
                  opacity: vote.status === 'open' ? 1 : 0.6,
                }}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={vote.status !== 'open'} placeholder="비고 또는 자녀 이름" style={{ minHeight: 90, padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af', resize: 'vertical', background: vote.status === 'open' ? '#fff' : '#f4efe8' }} />
        <button type="button" disabled={vote.status !== 'open'} onClick={() => onSave(vote.id, choice, note)} style={{ border: 'none', borderRadius: 14, padding: '13px 16px', background: vote.status === 'open' ? 'linear-gradient(135deg,#8f693f,#b98657)' : '#d8c8af', color: '#fff', fontWeight: 700, cursor: vote.status === 'open' ? 'pointer' : 'default' }}>
          응답 저장
        </button>
        {(vote.visibility === 'public' || canManage) && (
          <div style={{ marginTop: 4, display: 'grid', gap: 8 }}>
            {optionCounts.map((item, index) => (
              <VoteBar
                key={`${item.label}-${index}`}
                label={item.label}
                value={item.count}
                total={total}
                tone={BAR_COLORS[index % BAR_COLORS.length]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const BAR_COLORS = ['#2f7d4c', '#a34d4d', '#5d74b3', '#9b6bb3', '#b27b25', '#4c8b8f']

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

function miniButtonStyle(tone = '#6e5b48') {
  return {
    border: '1px solid #d8c8af',
    background: '#fff',
    borderRadius: 999,
    padding: '8px 12px',
    cursor: 'pointer',
    fontWeight: 700,
    color: tone,
  }
}
