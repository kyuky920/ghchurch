import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import BetaMissionsShell, { canManageMissions } from '../../../components/beta/BetaMissionsShell'
import { readBetaSession } from '../../../components/beta/mockAuth'
import { fetchMissionsStore, missionDateKey, mutateMissionsStore } from '../../../components/beta/missionsStore'
import useIsWide from '../../../components/beta/useIsWide'

export default function BetaMissionBiblePage() {
  const router = useRouter()
  const isWide = useIsWide(920)
  const [session, setSession] = useState(null)
  const [store, setStore] = useState(null)
  const [day, setDay] = useState(missionDateKey())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

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

  useEffect(() => {
    if (!session || !store) return
    const log = store.bibleLogs[`${session.id}:${day}`]
    setNote(log?.memo || '')
  }, [session, store, day])

  const todayPlan = useMemo(() => store?.biblePlans?.[day] || { range: '', memo: '' }, [store, day])

  if (!session) return null
  if (!store) {
    return <BetaMissionsShell title="성경읽기" subtitle="성경읽기 데이터를 불러오는 중입니다." session={session} activeKey="bible"><div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20, color: '#6e5b48' }}>{error || '불러오는 중...'}</div></BetaMissionsShell>
  }

  async function savePlan() {
    try {
      const result = await mutateMissionsStore('upsertBiblePlan', {
        actorId: session.id,
        day,
        range: todayPlan.range,
        memo: todayPlan.memo,
      })
      setStore(result.store)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function saveLog(done) {
    try {
      const result = await mutateMissionsStore('upsertBibleLog', {
        actorId: session.id,
        day,
        done,
        memo: note,
      })
      setStore(result.store)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const recentLogs = store.members.map((member) => ({
    member,
    log: store.bibleLogs[`${member.id}:${day}`],
  }))

  return (
    <BetaMissionsShell title="성경읽기" subtitle="매일 읽을 범위를 정하고, 회원이 읽음 여부와 메모를 남깁니다." session={session} activeKey="bible">
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: isWide ? '1fr 1fr' : '1fr' }}>
        <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>오늘의 읽기</p>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d8c8af' }} />
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <textarea
              value={todayPlan.range}
              onChange={(e) => canManageMissions(session) && setStore({ ...store, biblePlans: { ...store.biblePlans, [day]: { ...todayPlan, range: e.target.value } } })}
              placeholder="읽기 범위"
              disabled={!canManageMissions(session)}
              style={{ minHeight: 80, padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af', resize: 'vertical', background: canManageMissions(session) ? '#fff' : '#f7f3ed' }}
            />
            <textarea
              value={todayPlan.memo}
              onChange={(e) => canManageMissions(session) && setStore({ ...store, biblePlans: { ...store.biblePlans, [day]: { ...todayPlan, memo: e.target.value } } })}
              placeholder="리더 메모"
              disabled={!canManageMissions(session)}
              style={{ minHeight: 100, padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af', resize: 'vertical', background: canManageMissions(session) ? '#fff' : '#f7f3ed' }}
            />
            {error && <p style={{ margin: 0, color: '#b33f3f', fontSize: 13 }}>{error}</p>}
            {canManageMissions(session) && (
              <button onClick={savePlan} style={{ border: 'none', borderRadius: 14, padding: '13px 16px', background: 'linear-gradient(135deg,#8f693f,#b98657)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                읽기 범위 저장
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>내 읽기 체크</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="느낀 점, 키워드, 메모를 적어 주세요." style={{ minHeight: 120, padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button onClick={() => saveLog(true)} style={{ flex: 1, border: 'none', borderRadius: 14, padding: '13px 16px', background: '#2f7d4c', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>읽음 저장</button>
              <button onClick={() => saveLog(false)} style={{ flex: 1, border: '1px solid #d8c8af', borderRadius: 14, padding: '13px 16px', background: '#fff', color: '#6e5b48', fontWeight: 700, cursor: 'pointer' }}>아직 못 읽음</button>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>회원별 상태</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {recentLogs.map(({ member, log }) => (
                <div key={member.id} style={{ background: '#faf5ec', borderRadius: 14, padding: '14px 15px', display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{member.name}</p>
                    <span style={{ color: log?.done ? '#2f7d4c' : '#9a6c4d', fontWeight: 700, fontSize: 12 }}>{log?.done ? '읽음' : '미확인'}</span>
                  </div>
                  <p style={{ margin: 0, color: '#6e5b48', lineHeight: 1.7 }}>{log?.memo || '메모 없음'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </BetaMissionsShell>
  )
}
