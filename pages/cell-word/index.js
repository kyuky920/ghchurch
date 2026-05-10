import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import html2canvas from 'html2canvas'

// 구형식(YYYY-Www) → YYYY-MM-DD 변환
function normalizeWeek(week) {
  if (!week) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) return week
  if (/^\d{4}-W\d{2}$/.test(week)) {
    const [y, w] = week.split('-W').map(Number)
    const jan4 = new Date(y, 0, 4)
    const sun = new Date(jan4)
    sun.setDate(jan4.getDate() - jan4.getDay() + (w - 1) * 7)
    return `${sun.getFullYear()}-${String(sun.getMonth()+1).padStart(2,'0')}-${String(sun.getDate()).padStart(2,'0')}`
  }
  return week
}

function pickQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
}

function sameWeek(candidate, requested) {
  if (!candidate || !requested) return false
  return candidate === requested || normalizeWeek(candidate) === normalizeWeek(requested)
}
function findMatchingSermon(sermons, requestedWeek, requestedService, sessionWeek, sessionService) {
  if (!Array.isArray(sermons) || sermons.length === 0) return null

  if (requestedWeek && requestedService) {
    const exactRequested = sermons.find(s => sameWeek(s.week, requestedWeek) && s.service === requestedService)
    if (exactRequested) return exactRequested
  }
  if (sessionWeek && sessionService) {
    const exactSession = sermons.find(s => sameWeek(s.week, sessionWeek) && s.service === sessionService)
    if (exactSession) return exactSession
  }
  if (requestedWeek) {
    const requestedWeekFallback = sermons.find(s => sameWeek(s.week, requestedWeek))
    if (requestedWeekFallback) return requestedWeekFallback
  }
  if (sessionWeek) {
    const sessionWeekFallback = sermons.find(s => sameWeek(s.week, sessionWeek))
    if (sessionWeekFallback) return sessionWeekFallback
  }
  return sermons[0] || null
}
function formatSessionTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })
}
function formatSessionPeriod(session) {
  if (!session?.started_at) return ''
  const start = formatSessionTime(session.started_at)
  const end = formatSessionTime(session.ended_at)
  return end ? `${start} ~ ${end}` : `${start} 시작`
}
function formatGroupName(group) {
  if (!group) return ''
  const groupNo = typeof group === 'object' ? group.group_no : null
  const name = typeof group === 'object' ? group.name : group
  if (!name) return groupNo ? `${groupNo}조` : ''
  if (name.includes('조 - ')) return name
  return groupNo ? `${groupNo}조 - ${name}` : name
}

function getDeviceId() {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('wl_device_id')
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2)
    localStorage.setItem('wl_device_id', id)
  }
  return id
}

const QMETA = [
  { type:'말씀 속으로',  color:'#7a5a33', bg:'#fff8ef' },
  { type:'내 이야기',    color:'#8b6440', bg:'#fff9f2' },
  { type:'함께 나눔',    color:'#3f6f54', bg:'#f4fbf6' },
  { type:'이번 주 실천', color:'#3f6f54', bg:'#eff8f1' },
]

function normalizeQuestions(raw) {
  const toItem = (q, sectionTitle = '') => {
    if (typeof q === 'string') return { section_title: sectionTitle, category: '', explanation: '', question: q }
    return {
      section_title: q?.section_title || sectionTitle || '',
      category: q?.category || q?.type || '',
      explanation: q?.explanation || q?.context || '',
      question: q?.question || q?.text || q?.content || '',
    }
  }

  if (Array.isArray(raw)) return raw.map((q) => toItem(q)).filter((q) => q.question)

  if (raw && typeof raw === 'object') {
    const sections = Array.isArray(raw.sections) ? raw.sections : []
    const list = sections.flatMap((s) => {
      const title = s?.section_title || s?.title || s?.topic || ''
      const questions = Array.isArray(s?.questions) ? s.questions : []
      return questions.map((q) => toItem(q, title))
    })
    if (list.length) return list.filter((q) => q.question)
  }
  return []
}

const OPENING_QUESTION = {
  section_title: '말씀 나눔 시작',
  category: '오프닝',
  explanation: '오늘 말씀을 먼저 자유롭게 돌아보며 마음을 여는 질문입니다.',
  question: '오늘 말씀을 들으시면서 어떠셨나요? 특별히 마음에 남았던 부분이나 느끼신 점이 있으셨다면 함께 나눠주세요.',
}

const S = {
  wrap:   { minHeight:'100vh', background:'#f6f3ee', fontFamily:"'IBM Plex Sans KR','Noto Sans KR',sans-serif", color:'#2f281f' },
  header: { background:'linear-gradient(160deg,#ede2d2,#d8c8ad)', padding:'20px 20px 16px', borderBottom:'1px solid #ccbda3', position:'relative', overflow:'hidden' },
  cont:   { maxWidth:700, margin:'0 auto', padding:'18px 16px 88px' },
  card:   { background:'#fff', borderRadius:14, padding:'18px 20px', border:'1px solid #dfd3c0', boxShadow:'0 4px 16px rgba(55,38,15,0.04)' },
}

export default function CellWord() {
  const router = useRouter()

  const [selected, setSelected]         = useState(null)
  const [loading, setLoading]           = useState(true)
  const [tab, setTab]                   = useState(2)
  const [savingImage, setSavingImage]   = useState(false)

  const [activeSession, setActiveSession] = useState(null)
  const [myGroup, setMyGroup]             = useState(null)
  const [amLeader, setAmLeader]           = useState(false)
  const [groupEnded, setGroupEnded]       = useState(false)
  const [groupEnding, setGroupEnding]     = useState(false)
  const [noticeAcknowledged, setNoticeAcknowledged] = useState(false)
  const [personalNotes, setPersonalNotes] = useState({ questionNotes: {}, prayer: '' })

  const pollRef      = useRef(null)
  const captureRef   = useRef(null)

  const activeNoticeKey = activeSession?.notice
    ? `${activeSession.group_no || ''}:${activeSession.notice}`
    : ''

  // ── 폴링 함수 (ref로 감싸서 stale closure 방지) ──
  const pollFn = useRef(null)
  pollFn.current = async function poll() {
    const did = getDeviceId()
    try {
      const { group_no, week } = router.query
      const gno = Array.isArray(group_no) ? group_no[0] : group_no
      if (!gno) {
        setActiveSession(null)
        setMyGroup(null)
        setAmLeader(false)
        return
      }

      const sRes = await fetch(`/api/cell-sessions?group_no=${gno}`)
      const sData = await sRes.json()

      if (!sData.ok || !sData.data) {
        setActiveSession(null); setMyGroup(null); setAmLeader(false)
        return
      }

      const session = sData.data
      setActiveSession(session)

      // 내 조 찾기 — device_id로 매칭
      const gRes = await fetch(`/api/cell-groups?week=${session.week || week}`)
      const gData = await gRes.json()
      if (gData.ok && gData.data?.groups) {
        const groups = gData.data.groups
        // 멤버로 내 조 찾기
        let found = groups.find(g =>
          g.members?.some(m => m.device_id === did)
        )
        // 멤버에 없으면 리더로 찾기 (혹시 멤버 등록 안 된 경우)
        if (!found) {
          found = groups.find(g => g.leader?.device_id === did)
        }
        const isLeader = !!(found?.leader?.device_id === did)
        setMyGroup(found || null)
        setAmLeader(isLeader)
      }
    } catch(e) {}
  }

  // ── 세션 폴링 시작 ──
  useEffect(() => {
    if (!router.isReady) return
    const { week, group_no } = router.query
    const gno = Array.isArray(group_no) ? group_no[0] : group_no
    if (!week) return
    if (!gno) return

    // 즉시 + 5초마다 폴링
    pollFn.current()
    pollRef.current = setInterval(() => pollFn.current(), 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [router.isReady, router.query.week, router.query.group_no])

  // ── 말씀 로드 ──
  useEffect(() => {
    if (!router.isReady) return
    const week = pickQueryValue(router.query.week)
    const service = pickQueryValue(router.query.service)
    const qTab = pickQueryValue(router.query.tab)
    if (!week && !activeSession?.sermon_week) return
    let alive = true
    setLoading(true)

    fetch('/api/sermons')
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        if (d.ok && d.data?.length) {
          const requestedWeek = week || null
          const requestedService = service || null
          const sessionWeek = activeSession?.sermon_week || null
          const sessionService = activeSession?.sermon_service || null
          const target = findMatchingSermon(
            d.data,
            requestedWeek,
            requestedService,
            sessionWeek,
            sessionService
          )

          setSelected(target || null)
          if (qTab !== undefined) {
            const parsedTab = Number(qTab)
            // 구버전 호환: 0(요약), 1(질문) -> 신버전 1(요약), 2(질문)
            if (parsedTab === 0) setTab(1)
            else if (parsedTab === 1) setTab(2)
            else if (parsedTab >= 0 && parsedTab <= 2) setTab(parsedTab)
          }
        } else {
          setSelected(null)
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [router.isReady, router.query.week, router.query.service, router.query.tab, activeSession?.sermon_week, activeSession?.sermon_service])

  useEffect(() => {
    if (!activeSession) {
      setGroupEnded(false)
      return
    }
    setGroupEnded(!activeSession.is_active && !!activeSession.ended_at)
  }, [activeSession?.is_active, activeSession?.ended_at])

  const isLeaderNoticeVisible = !!(
    amLeader &&
    myGroup &&
    activeSession &&
    String(myGroup.group_no) === String(activeSession.group_no) &&
    activeSession.notice &&
    !noticeAcknowledged
  )

  useEffect(() => {
    if (!activeNoticeKey) {
      setNoticeAcknowledged(false)
      return
    }
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem(`wl_notice_ack:${activeNoticeKey}`)
    setNoticeAcknowledged(saved === 'true')
  }, [activeNoticeKey])

  useEffect(() => {
    if (!isLeaderNoticeVisible || typeof window === 'undefined') return
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [isLeaderNoticeVisible, activeNoticeKey])

  function handleNoticeConfirm() {
    if (!activeNoticeKey || typeof window === 'undefined') return
    localStorage.setItem(`wl_notice_ack:${activeNoticeKey}`, 'true')
    setNoticeAcknowledged(true)
  }

  useEffect(() => {
    if (!selected?.id || typeof window === 'undefined') return
    const saved = localStorage.getItem(`wl_cell_notes:${selected.id}`)
    if (!saved) {
      setPersonalNotes({ questionNotes: {}, prayer: '' })
      return
    }
    try {
      const parsed = JSON.parse(saved)
      setPersonalNotes({
        questionNotes: parsed.questionNotes || {},
        prayer: parsed.prayer || '',
      })
    } catch(e) {
      setPersonalNotes({ questionNotes: {}, prayer: '' })
    }
  }, [selected?.id])

  useEffect(() => {
    if (!selected?.id || typeof window === 'undefined') return
    localStorage.setItem(`wl_cell_notes:${selected.id}`, JSON.stringify(personalNotes))
  }, [selected?.id, personalNotes])

  // ── 모임 종료 ──
  async function handleGroupEnd() {
    if (!myGroup) return
    setGroupEnding(true)
    try {
      const res = await fetch('/api/cell-sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'end',
          week: activeSession?.week || router.query.week,
          group_no: String(myGroup.group_no),
          device_id: getDeviceId()
        })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setGroupEnded(true)
      await pollFn.current()
      router.push('/cell')
    } catch(e) { alert('오류: ' + e.message) }
    finally { setGroupEnding(false) }
  }

  const TABS = ['성경말씀', '말씀 요약', '나눔질문']

  const parseField = (val) => {
    if (!val) return []
    if (Array.isArray(val)) return val
    if (typeof val === 'object') return val
    try { return JSON.parse(val) } catch(e) { return [] }
  }
  const qs   = [OPENING_QUESTION, ...normalizeQuestions(parseField(selected?.questions))]
  const summary = (() => {
    const s = selected?.sermon_summary
    if (!s) return null
    if (typeof s === 'object') return s
    try { return JSON.parse(s) } catch(e) { return null }
  })()

  async function saveCurrentViewAsImage() {
    if (!captureRef.current || !selected) return
    setSavingImage(true)
    try {
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: '#faf6f0',
        scale: 2,
        useCORS: true,
      })
      const link = document.createElement('a')
      const safeRef = (selected.reference || 'cell-word').replace(/[^\w\-가-힣]+/g, '_')
      const tabName = tab === 0 ? 'passage' : tab === 1 ? 'summary' : 'questions'
      link.download = `${safeRef}_${tabName}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e) {
      alert('이미지 저장 중 오류가 발생했어요.')
    } finally {
      setSavingImage(false)
    }
  }

  return (
    <>
      <Head>
        <title>광흥교회 청년부 · 시냇가에 심은 나무 WORD &amp; LIFE · 셀 모임</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <style>{`
          *{box-sizing:border-box;}
          html,body{margin:0;padding:0;background:#f6f3ee;color:#2f281f}
          body{font-family:'IBM Plex Sans KR','Noto Sans KR',sans-serif;line-height:1.72;-webkit-font-smoothing:antialiased}
          textarea{font:inherit}
          button{font:inherit}
          @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes slideDown{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}
          .tab-bar::-webkit-scrollbar{display:none}
          .tab-bar{-ms-overflow-style:none;scrollbar-width:none}
        `}</style>
      </Head>
      <div style={S.wrap}>

        {/* ── 셀 리더 종료 바 ── */}
        {amLeader && myGroup && (
          <div style={{
            background: groupEnded ? '#e8f5e9' : '#fff3e0',
            padding:'12px 20px',
            display:'flex', alignItems:'center', justifyContent:'space-between',
            borderBottom:`1px solid ${groupEnded ? '#a5d6a7' : '#ffcc80'}`,
          }}>
            <div>
              <p style={{ fontSize:12, color: groupEnded ? '#2e7d32' : '#e65100', fontWeight:700, margin:'0 0 1px' }}>
                {groupEnded ? `✅ ${formatGroupName(myGroup)} 모임 종료됨` : `👑 ${formatGroupName(myGroup)} 셀 리더`}
              </p>
              <p style={{ fontSize:11, color: groupEnded ? '#447a31' : '#9f3c1a', margin:0 }}>
                {groupEnded ? '함께 나눈 말씀은 계속 볼 수 있어요' : '나눔이 끝나면 종료 버튼을 눌러주세요'}
              </p>
              {activeSession?.started_at && (
                <p style={{ fontSize:11, color: groupEnded ? '#447a31' : '#9f3c1a', margin:'3px 0 0' }}>
                  ⏰ {formatSessionPeriod(activeSession)}
                </p>
              )}
            </div>
            {!groupEnded && activeSession && (
              <button onClick={handleGroupEnd} disabled={groupEnding}
                style={{ background: groupEnding ? '#c4a882' : 'linear-gradient(135deg,#c0392b,#e74c3c)', color:'#fff', border:'none', borderRadius:10, padding:'8px 14px', cursor: groupEnding ? 'not-allowed' : 'pointer', fontSize:12, fontFamily:"'Gowun Batang',serif", fontWeight:700, flexShrink:0 }}>
                {groupEnding ? '전송 중...' : '🙏 모임 종료'}
              </button>
            )}
          </div>
        )}

        {/* ── 헤더 ── */}
        <div style={S.header}>
          <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.08)' }}/>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <p style={{ fontSize:10, color:'#8b6e4e', letterSpacing:'0.2em', fontWeight:600, margin:'0 0 4px' }}>시냇가에 심은 나무 WORD &amp; LIFE</p>
              {selected
                ? <h1 style={{ fontFamily:"'Gowun Batang',serif", fontSize:21, color:'#3a2a19', fontWeight:700, margin:'0 0 3px' }}>{selected.sermon_title || selected.reference}</h1>
                : <h1 style={{ fontFamily:"'Gowun Batang',serif", fontSize:21, color:'#3a2a19', fontWeight:700, margin:0 }}>말씀 나눔</h1>
              }
              {selected?.sermon_title && selected?.reference && <p style={{ fontSize:12, color:'#6b5740', margin:0, fontWeight:500 }}>{selected.reference}</p>}
              {activeSession?.started_at && (
                <p style={{ fontSize:11, color:'#6b5740', margin:'4px 0 0' }}>
                  ⏰ {formatSessionPeriod(activeSession)}
                </p>
              )}
            </div>
            {myGroup && (
              <div style={{ background:'rgba(160,120,78,0.15)', borderRadius:10, padding:'6px 12px', textAlign:'center', flexShrink:0 }}>
                <p style={{ fontSize:10, color:'#8b6e4e', margin:'0 0 2px', fontWeight:600 }}>내 조</p>
                <p style={{ fontSize:13, color:'#4a3520', fontWeight:700, margin:0, fontFamily:"'Gowun Batang',serif" }}>{formatGroupName(myGroup)}</p>
                {myGroup?.leader?.name && (
                  <p style={{ fontSize:10, color:'#6b5740', margin:'2px 0 0' }}>리더: {myGroup.leader.name}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 컨텐츠 ── */}
        <div style={S.cont}>
          {loading ? (
            <div style={{ textAlign:'center', padding:48, display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', border:'3px solid #e8dcc8', borderTop:'3px solid #a0784e', animation:'spin 0.9s linear infinite' }}/>
              <p style={{ color:'#7a5a33', fontSize:14, fontWeight:500 }}>불러오는 중...</p>
            </div>
          ) : !selected ? (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'#b8a090' }}>
              <p style={{ fontSize:48, marginBottom:12 }}>📖</p>
              <p style={{ fontFamily:"'Gowun Batang',serif", fontSize:15 }}>말씀을 찾을 수 없어요</p>
            </div>
          ) : (
            <div ref={captureRef} style={{display:'flex',flexDirection:'column'}}>
              {isLeaderNoticeVisible && (
                <div style={{
                  background:'linear-gradient(135deg,#1f6b26,#2f8b3a)',
                  borderRadius:16,
                  padding:'16px 18px',
                  marginBottom:16,
                  boxShadow:'0 8px 24px rgba(27,94,32,0.22)',
                  animation:'slideDown 0.4s ease',
                }}>
                  <p style={{ fontSize:10, color:'rgba(255,255,255,0.72)', margin:'0 0 6px', fontWeight:700, letterSpacing:'0.12em' }}>📢 리더 공지</p>
                  <p style={{ fontSize:16, color:'#fff', fontFamily:"'Gowun Batang',serif", fontWeight:700, margin:'0 0 12px', lineHeight:1.72 }}>{activeSession.notice}</p>
                  <button
                    onClick={handleNoticeConfirm}
                    style={{background:'rgba(255,255,255,0.16)',border:'1px solid rgba(255,255,255,0.25)',borderRadius:10,color:'#fff',padding:'8px 14px',fontSize:12,fontWeight:700,cursor:'pointer'}}
                  >
                    확인
                  </button>
                </div>
              )}

              <div className="tab-bar" style={{ background:'rgba(255,255,255,0.92)', display:'flex', borderBottom:'1px solid #ddd0bc', marginBottom:16, position:'sticky', top:0, zIndex:10, backdropFilter:'blur(6px)', borderTopLeftRadius:12, borderTopRightRadius:12 }}>
                {TABS.map((t, i) => (
                  <button key={i} onClick={() => setTab(i)}
                    style={{ flex:1, padding:'14px 8px', border:'none', background:'none', fontSize:14, fontFamily:"'Gowun Batang',serif", color: tab===i ? '#6a4d2d' : '#998465', fontWeight: tab===i ? 700 : 500, borderBottom: tab===i ? '2.5px solid #8b6a45' : '2.5px solid transparent', cursor:'pointer', whiteSpace:'nowrap' }}>
                    {t}
                  </button>
                ))}
              </div>

            {/* 탭 0: 성경말씀 */}
              {tab===0 && (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {selected.passage ? (
                    <div style={S.card}>
                      <p style={{ fontSize:11, color:'#a0784e', fontWeight:700, letterSpacing:'0.08em', margin:'0 0 8px' }}>📖 {selected.reference} · 개역개정</p>
                      <p style={{ color:'#30261d', fontFamily:"'Gowun Batang',serif", fontSize:15, lineHeight:2.05, margin:0, whiteSpace:'pre-line' }}>{selected.passage}</p>
                    </div>
                  ) : (
                    <div style={{ textAlign:'center', padding:'40px 20px', color:'#b8a090' }}>
                      <p style={{ fontSize:13 }}>본문 말씀을 준비 중이에요</p>
                    </div>
                  )}
                </div>
              )}

            {/* 탭 1: 말씀 요약 */}
              {tab===1 && (
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  {!summary ? (
                    <div style={{ textAlign:'center', padding:'40px 20px', color:'#b8a090' }}>
                      <p style={{ fontSize:13 }}>말씀 요약을 준비 중이에요</p>
                    </div>
                  ) : (
                    <>
                      <div style={{ background:'linear-gradient(135deg,#8f693f,#b98657)', borderRadius:16, padding:'20px 22px', position:'relative', overflow:'hidden' }}>
                        <div style={{ position:'absolute', top:-20, right:-20, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,0.08)' }}/>
                        <p style={{ color:'rgba(245,230,208,0.85)', fontSize:10, letterSpacing:'0.15em', margin:'0 0 10px', fontWeight:600 }}>✦ 핵심 메시지</p>
                        <p style={{ color:'#fff', fontFamily:"'Gowun Batang',serif", fontSize:17, lineHeight:1.9, margin:0, fontWeight:700 }}>{summary.key_point}</p>
                      </div>
                      <div style={{ background:'#fff', borderRadius:14, padding:'18px 20px', border:'1px solid #e8d8c0' }}>
                        <p style={{ fontSize:11, color:'#a0784e', fontWeight:700, letterSpacing:'0.08em', margin:'0 0 10px' }}>📖 전체 흐름</p>
                        <p style={{ color:'#382819', fontFamily:"'Gowun Batang',serif", fontSize:15, lineHeight:2, margin:0 }}>{summary.overview}</p>
                      </div>
                      {summary.sections?.map((sec, i) => (
                        <div key={i} style={{ background:'#fdf5ec', borderRadius:14, padding:'16px 18px', border:'1px solid #e8d8c0', borderLeft:'4px solid #c4956a', animation:`fadeUp 0.3s ease ${i*0.1}s both` }}>
                          <p style={{ fontSize:12, color:'#a0784e', fontWeight:700, margin:'0 0 8px' }}>{sec.title}</p>
                          <p style={{ color:'#3a2a1b', fontFamily:"'Gowun Batang',serif", fontSize:15, lineHeight:1.95, margin:0 }}>{sec.content}</p>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* 탭 2: 나눔 질문 */}
              {tab===2 && (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {qs.map((item, i) => {
                    const q  = item.question
                    const m  = QMETA[i] || QMETA[0]
                    return (
                      <div key={i} style={{ background:m.bg, borderRadius:14, padding:'16px 18px', borderLeft:`4px solid ${m.color}`, animation:`fadeUp 0.4s ease ${i*0.1}s both` }}>
                        <p style={{ fontSize:10, color:m.color, fontWeight:700, margin:'0 0 7px', letterSpacing:'0.06em' }}>{item.section_title || item.category || m.type}</p>
                        <p style={{ margin:0, color:'#2f261d', fontFamily:"'Gowun Batang',serif", fontSize:16, lineHeight:1.9, fontWeight:700 }}>{q}</p>
                        <div style={{marginTop:10}}>
                          <p style={{fontSize:11,color:m.color,fontWeight:700,margin:'0 0 6px'}}>개인 메모</p>
                          <textarea
                            value={personalNotes.questionNotes?.[i] || ''}
                            onChange={e => setPersonalNotes(prev => ({
                              ...prev,
                              questionNotes: { ...(prev.questionNotes || {}), [i]: e.target.value }
                            }))}
                            placeholder="이 질문에 대한 내 생각과 나눔 포인트를 적어보세요."
                            style={{width:'100%',minHeight:96,padding:'11px 12px',border:'1px solid #d6cbb9',borderRadius:10,background:'rgba(255,255,255,0.92)',resize:'vertical',fontSize:14,color:'#2f281f',fontFamily:"'IBM Plex Sans KR','Noto Sans KR',sans-serif",lineHeight:1.75}}
                          />
                        </div>
                      </div>
                    )
                  })}
                  <div style={{...S.card, marginTop:4}}>
                    <p style={{fontSize:11,color:'#a0784e',fontWeight:700,letterSpacing:'0.08em',margin:'0 0 8px'}}>🙏 오늘의 기도제목</p>
                    <textarea
                      value={personalNotes.prayer || ''}
                      onChange={e => setPersonalNotes(prev => ({ ...prev, prayer: e.target.value }))}
                      placeholder="오늘 셀모임을 통해 붙잡은 기도제목을 기록해 보세요. 이 내용은 내 기기에서만 저장됩니다."
                      style={{width:'100%',minHeight:120,padding:'12px 14px',border:'1px solid #d9ccba',borderRadius:10,background:'#fdfbf8',resize:'vertical',fontSize:14,color:'#2f281f',fontFamily:"'IBM Plex Sans KR','Noto Sans KR',sans-serif",lineHeight:1.8}}
                    />
                    <p style={{fontSize:11,color:'#a08060',margin:'8px 0 0'}}>이 메모와 기도제목은 서버로 전송되지 않고, 이 기기 브라우저에만 저장됩니다.</p>
                  </div>
                </div>
              )}
              <button
                onClick={saveCurrentViewAsImage}
                disabled={savingImage}
                style={{width:'100%',marginTop:16,background:savingImage?'#c4a882':'linear-gradient(135deg,#4a3520,#7a5c38)',color:'#fff',border:'none',borderRadius:12,padding:'14px',fontSize:14,fontFamily:"'Gowun Batang',serif",fontWeight:700,cursor:savingImage?'not-allowed':'pointer'}}
              >
                {savingImage ? '이미지 저장 중...' : '🖼 현재 화면 이미지로 저장'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
