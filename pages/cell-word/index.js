import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

// ── 유틸 ──────────────────────────────────────────────
function getDeviceId() {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('wl_device_id')
  if (!id) { id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2); localStorage.setItem('wl_device_id', id) }
  return id
}

const QMETA = [
  { type:'말씀 속으로',  color:'#a0784e', bg:'#fdf5ec' },
  { type:'내 이야기',    color:'#c4956a', bg:'#fef8f0' },
  { type:'함께 나눔',    color:'#7a9e7e', bg:'#f0f7f1' },
  { type:'이번 주 실천', color:'#6b8f71', bg:'#edf4ee' },
]

function doCopy(text) {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(()=>fbCopy(text))
  else fbCopy(text)
}
function fbCopy(text) {
  const t=document.createElement('textarea'); t.value=text; t.style.cssText='position:fixed;opacity:0;'
  document.body.appendChild(t); t.focus(); t.select()
  try{document.execCommand('copy')}catch(e){}
  document.body.removeChild(t)
}

const S = {
  wrap:   { minHeight:'100vh', background:'#faf6f0', fontFamily:"'Noto Sans KR',sans-serif" },
  header: { background:'linear-gradient(160deg,#e8dcc8,#d4c4a8)', padding:'20px 20px 16px', borderBottom:'1px solid #c8b898', position:'relative', overflow:'hidden' },
  cont:   { maxWidth:640, margin:'0 auto', padding:'16px 16px 80px' },
  card:   { background:'#fff', borderRadius:14, padding:'16px 18px', border:'1px solid #e8d8c0' },
}

export default function CellWord() {
  const router = useRouter()

  // 말씀 데이터
  const [selected, setSelected] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState(0)
  const [ck, setCk]             = useState('')

  // 셀 세션
  const [activeSession, setActiveSession] = useState(null)
  const [myGroup, setMyGroup]             = useState(null)
  const [amLeader, setAmLeader]           = useState(false)
  const [groupEnded, setGroupEnded]       = useState(false)
  const [groupEnding, setGroupEnding]     = useState(false)

  const pollRef       = useRef(null)
  const deviceRef     = useRef('')
  const [noticeVisible, setNoticeVisible] = useState(false)
  const [prevNotice, setPrevNotice]       = useState('')

  // 디바이스 ID 초기화 (최초 1회)
  useEffect(() => {
    deviceRef.current = getDeviceId()
  }, [])

  // 세션 폴링 함수
  const pollSession = useCallback(async () => {
    const did = deviceRef.current || getDeviceId()
    try {
      const res = await fetch('/api/cell-sessions')
      const d = await res.json()
      if (d.ok && d.data) {
        setActiveSession(d.data)
        // 공지가 새로 바뀌면 팝업 표시
        if (d.data.notice && d.data.notice !== prevNotice) {
          setPrevNotice(d.data.notice)
          setNoticeVisible(true)
          setTimeout(() => setNoticeVisible(false), 6000)
        }
        const gRes = await fetch(`/api/cell-groups?week=${d.data.week}`)
        const gData = await gRes.json()
        if (gData.ok && gData.data?.groups) {
          const found = gData.data.groups.find(g => g.members?.some(m => m.device_id === did))
          setMyGroup(found || null)
          setAmLeader(!!(found && found.leader?.device_id === did))
        }
      } else {
        setActiveSession(null); setMyGroup(null); setAmLeader(false)
      }
    } catch(e) {}
  }, [])

  // 말씀 로드 + 폴링 시작
  useEffect(() => {
    const { week, service, tab: qTab } = router.query
    if (!week) return

    fetch('/api/sermons')
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.data?.length) {
          const target = d.data.find(s => s.week === week && s.service === service) || d.data[0]
          setSelected(target)
          if (qTab !== undefined) setTab(Number(qTab))
        }
      })
      .finally(() => setLoading(false))

    // 폴링 시작 (약간 딜레이 줘서 deviceRef 확보 후 실행)
    setTimeout(() => pollSession(), 300)
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(pollSession, 8000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [router.query, pollSession])

  // 모임 종료
  async function handleGroupEnd() {
    if (!myGroup) return
    setGroupEnding(true)
    try {
      const res = await fetch('/api/cell-sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'group_end',
          group_no: myGroup.group_no,
          group_name: myGroup.name,
          ended: true
        })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setGroupEnded(true)
      await pollSession()
    } catch(e) { alert('오류: ' + e.message) }
    finally { setGroupEnding(false) }
  }

  function copy(text, key) { doCopy(text); setCk(key); setTimeout(() => setCk(''), 2000) }

  const TABS = ['말씀 요약', '나눔 질문', '주간 묵상', '말씀카드']

  const parseField = (val) => {
    if (!val) return []
    if (Array.isArray(val)) return val
    try { return JSON.parse(val) } catch(e) { return [] }
  }
  const qs   = parseField(selected?.questions)
  const meds = parseField(selected?.meditations)
  const summary = (() => {
    const s = selected?.sermon_summary
    if (!s) return null
    if (typeof s === 'object') return s
    try { return JSON.parse(s) } catch(e) { return null }
  })()

  const CopyBtn = ({ text, id, label }) => (
    <button onClick={() => copy(text, id)}
      style={{ width:'100%', background:'#fff', border:'1.5px solid #ddd0ba', borderRadius:12, padding:'13px', fontSize:13, color:'#8b6e4e', fontWeight:700, fontFamily:"'Gowun Batang',serif", cursor:'pointer' }}>
      {ck === id ? '✓ 복사됨!' : label}
    </button>
  )

  return (
    <>
      <Head>
        <title>셀 나눔 · WORD &amp; LIFE</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <style>{`
          *{box-sizing:border-box;}
          @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
          @keyframes slideDown{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}
          .tab-bar::-webkit-scrollbar{display:none}
          .tab-bar{-ms-overflow-style:none;scrollbar-width:none}
        `}</style>
      </Head>
      <div style={S.wrap}>

        {/* 공지 팝업 — 상단 슬라이드 다운 */}
        {noticeVisible && activeSession?.notice && (
          <div style={{
            position:'fixed', top:0, left:0, right:0, zIndex:999,
            background:'linear-gradient(135deg,#1b5e20,#2e7d32)',
            padding:'16px 20px',
            display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12,
            boxShadow:'0 4px 24px rgba(0,0,0,0.3)',
            animation:'slideDown 0.4s ease',
            maxWidth:640, margin:'0 auto',
          }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
              <span style={{ fontSize:22, flexShrink:0 }}>📢</span>
              <div>
                <p style={{ fontSize:10, color:'rgba(255,255,255,0.7)', margin:'0 0 4px', fontWeight:700, letterSpacing:'0.12em' }}>리더 공지</p>
                <p style={{ fontSize:15, color:'#fff', fontFamily:"'Gowun Batang',serif", fontWeight:700, margin:0, lineHeight:1.65 }}>{activeSession.notice}</p>
              </div>
            </div>
            <button onClick={() => setNoticeVisible(false)}
              style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:28, height:28, cursor:'pointer', color:'#fff', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              ✕
            </button>
          </div>
        )}

        {/* 헤더 */}
        <div style={S.header}>
          <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.08)' }}/>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <p style={{ fontSize:10, color:'#8b6e4e', letterSpacing:'0.2em', fontWeight:600, margin:'0 0 4px' }}>WORD &amp; LIFE · 셀 나눔</p>
              {selected
                ? <h1 style={{ fontFamily:"'Gowun Batang',serif", fontSize:18, color:'#4a3520', fontWeight:700, margin:'0 0 2px' }}>{selected.reference}</h1>
                : <h1 style={{ fontFamily:"'Gowun Batang',serif", fontSize:18, color:'#4a3520', fontWeight:700, margin:0 }}>말씀 나눔</h1>
              }
              {selected?.sermon_title && <p style={{ fontSize:11, color:'#8b6e4e', margin:0 }}>{selected.sermon_title}</p>}
            </div>
            {/* 내 조 표시 */}
            {myGroup && (
              <div style={{ background:'rgba(160,120,78,0.15)', borderRadius:10, padding:'6px 12px', textAlign:'center', flexShrink:0 }}>
                <p style={{ fontSize:10, color:'#8b6e4e', margin:'0 0 1px', fontWeight:600 }}>{amLeader ? '👑 리더' : '내 조'}</p>
                <p style={{ fontSize:13, color:'#4a3520', fontWeight:700, margin:0, fontFamily:"'Gowun Batang',serif" }}>{myGroup.name}</p>
              </div>
            )}
          </div>
        </div>

        {/* 셀 리더 종료 바 */}
        {amLeader && activeSession && myGroup && (
          <div style={{ background: groupEnded ? '#e8f5e9' : '#fff3e0', padding:'11px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid', borderColor: groupEnded ? '#a5d6a7' : '#ffcc80' }}>
            <div>
              <p style={{ fontSize:12, color: groupEnded ? '#2e7d32' : '#e65100', fontWeight:700, margin:'0 0 1px' }}>
                {groupEnded ? '✅ 모임 종료 완료' : `👑 ${myGroup.name} 셀 리더`}
              </p>
              <p style={{ fontSize:10, color: groupEnded ? '#558b2f' : '#bf360c', margin:0 }}>
                {groupEnded ? '부장집사님께 종료가 알려졌어요' : '나눔이 끝나면 모임 종료를 눌러주세요'}
              </p>
            </div>
            {!groupEnded && (
              <button onClick={handleGroupEnd} disabled={groupEnding}
                style={{ background: groupEnding ? '#c4a882' : 'linear-gradient(135deg,#c0392b,#e74c3c)', color:'#fff', border:'none', borderRadius:10, padding:'8px 14px', cursor: groupEnding ? 'not-allowed' : 'pointer', fontSize:12, fontFamily:"'Gowun Batang',serif", fontWeight:700, flexShrink:0 }}>
                {groupEnding ? '전송 중...' : '🙏 모임 종료'}
              </button>
            )}
          </div>
        )}

        {/* 탭 */}
        {selected && (
          <div className="tab-bar" style={{ background:'#fff', display:'flex', borderBottom:'1px solid #e8dcc8', position:'sticky', top:0, zIndex:10 }}>
            {TABS.map((t, i) => (
              <button key={i} onClick={() => setTab(i)}
                style={{ flex:1, padding:'13px 8px', border:'none', background:'none', fontSize:13, fontFamily:"'Gowun Batang',serif", color: tab===i ? '#8b6e4e' : '#bba888', fontWeight: tab===i ? 700 : 400, borderBottom: tab===i ? '2.5px solid #a0784e' : '2.5px solid transparent', cursor:'pointer', whiteSpace:'nowrap' }}>
                {t}
              </button>
            ))}
          </div>
        )}

        <div style={S.cont}>
          {loading ? (
            <div style={{ textAlign:'center', padding:48, display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', border:'3px solid #e8dcc8', borderTop:'3px solid #a0784e', animation:'spin 0.9s linear infinite' }}/>
              <p style={{ color:'#a0784e', fontSize:13 }}>불러오는 중...</p>
            </div>
          ) : !selected ? (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'#b8a090' }}>
              <p style={{ fontSize:48, marginBottom:12 }}>📖</p>
              <p style={{ fontFamily:"'Gowun Batang',serif", fontSize:15 }}>말씀을 찾을 수 없어요</p>
            </div>
          ) : (
            <>
              {/* 탭 0: 말씀 요약 */}
              {tab===0 && (
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  {!summary ? (
                    <div style={{ textAlign:'center', padding:'40px 20px', color:'#b8a090' }}>
                      <p style={{ fontSize:13 }}>말씀 요약을 준비 중이에요</p>
                    </div>
                  ) : (
                    <>
                      <div style={{ background:'linear-gradient(135deg,#a0784e,#c4956a)', borderRadius:16, padding:'20px 22px', position:'relative', overflow:'hidden' }}>
                        <div style={{ position:'absolute', top:-20, right:-20, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,0.08)' }}/>
                        <p style={{ color:'rgba(245,230,208,0.85)', fontSize:10, letterSpacing:'0.15em', margin:'0 0 10px', fontWeight:600 }}>✦ 핵심 메시지</p>
                        <p style={{ color:'#fff', fontFamily:"'Gowun Batang',serif", fontSize:16, lineHeight:1.85, margin:0, fontWeight:700 }}>{summary.key_point}</p>
                      </div>
                      <div style={{ background:'#fff', borderRadius:14, padding:'18px 20px', border:'1px solid #e8d8c0' }}>
                        <p style={{ fontSize:11, color:'#a0784e', fontWeight:700, letterSpacing:'0.08em', margin:'0 0 10px' }}>📖 전체 흐름</p>
                        <p style={{ color:'#4a3520', fontFamily:"'Gowun Batang',serif", fontSize:14, lineHeight:1.95, margin:0 }}>{summary.overview}</p>
                      </div>
                      {summary.sections?.map((sec, i) => (
                        <div key={i} style={{ background:'#fdf5ec', borderRadius:14, padding:'16px 18px', border:'1px solid #e8d8c0', borderLeft:'4px solid #c4956a', animation:`fadeUp 0.3s ease ${i*0.1}s both` }}>
                          <p style={{ fontSize:12, color:'#a0784e', fontWeight:700, margin:'0 0 8px' }}>{sec.title}</p>
                          <p style={{ color:'#4a3728', fontFamily:"'Gowun Batang',serif", fontSize:14, lineHeight:1.9, margin:0 }}>{sec.content}</p>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* 탭 1: 나눔 질문 */}
              {tab===1 && (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {selected.passage && (
                    <div style={S.card}>
                      <p style={{ fontSize:11, color:'#a0784e', fontWeight:700, letterSpacing:'0.08em', margin:'0 0 8px' }}>📖 {selected.reference} · 개역개정</p>
                      <p style={{ color:'#4a3520', fontFamily:"'Gowun Batang',serif", fontSize:13, lineHeight:2.1, margin:0, whiteSpace:'pre-line' }}>{selected.passage}</p>
                    </div>
                  )}
                  {qs.map((item, i) => {
                    const q  = typeof item==='string' ? item : item.question
                    const ex = typeof item==='object' ? item.explanation : ''
                    const m  = QMETA[i] || QMETA[0]
                    return (
                      <div key={i} style={{ background:m.bg, borderRadius:14, padding:'16px 18px', borderLeft:`4px solid ${m.color}`, animation:`fadeUp 0.4s ease ${i*0.1}s both` }}>
                        <p style={{ fontSize:10, color:m.color, fontWeight:700, margin:'0 0 7px', letterSpacing:'0.06em' }}>{m.type}</p>
                        {ex && <div style={{ background:'rgba(255,255,255,0.65)', borderRadius:8, padding:'9px 12px', marginBottom:8, borderLeft:`2px solid ${m.color}60` }}><p style={{ margin:0, color:'#6b5040', fontSize:12, lineHeight:1.8 }}>{ex}</p></div>}
                        <p style={{ margin:0, color:'#4a3520', fontFamily:"'Gowun Batang',serif", fontSize:15, lineHeight:1.85, fontWeight:700 }}>{q}</p>
                      </div>
                    )
                  })}
                  <CopyBtn
                    text={`✦ ${selected.reference} 나눔 질문\n\n${qs.map((item,i)=>{const q=typeof item==='string'?item:item.question;const ex=typeof item==='object'&&item.explanation?item.explanation+'\n':'';return `[${(QMETA[i]||QMETA[0]).type}]\n${ex}Q${i+1}. ${q}`}).join('\n\n')}`}
                    id="q" label="📋 전체 복사 (카톡 공유용)"
                  />
                </div>
              )}

              {/* 탭 2: 주간 묵상 */}
              {tab===2 && (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {meds.map((m, i) => (
                    <div key={i} style={{ ...S.card, animation:`fadeUp 0.3s ease ${i*0.07}s both` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                        <span style={{ background:'linear-gradient(135deg,#a0784e,#c4956a)', color:'#fff', borderRadius:8, padding:'3px 12px', fontSize:12, fontWeight:700 }}>{m.day}요일</span>
                        <span style={{ color:'#a0784e', fontSize:13, fontFamily:"'Gowun Batang',serif", fontStyle:'italic' }}>"{m.focus}"</span>
                      </div>
                      <p style={{ margin:0, color:'#4a3728', fontFamily:"'Gowun Batang',serif", fontSize:14, lineHeight:1.9 }}>{m.message}</p>
                    </div>
                  ))}
                  <CopyBtn
                    text={`✦ ${selected.reference} 주간 묵상\n\n${meds.map(m=>`[${m.day}요일]\n"${m.focus}"\n\n${m.message}`).join('\n\n─────\n\n')}`}
                    id="med" label="📋 전체 복사 (카톡 공유용)"
                  />
                </div>
              )}

              {/* 탭 3: 말씀카드 */}
              {tab===3 && (
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div style={{ background:'linear-gradient(135deg,#a0784e,#7a5c38,#c4956a)', borderRadius:20, padding:'36px 28px', position:'relative', overflow:'hidden', boxShadow:'0 12px 40px rgba(160,120,78,0.35)' }}>
                    <div style={{ position:'absolute', top:-30, right:-30, width:140, height:140, borderRadius:'50%', background:'rgba(255,255,255,0.07)' }}/>
                    <p style={{ color:'rgba(245,230,208,0.8)', fontSize:10, letterSpacing:'0.2em', margin:'0 0 14px' }}>✦ 이번 주 말씀 · 개역개정</p>
                    <p style={{ color:'#fff', fontFamily:"'Gowun Batang',serif", fontSize:19, lineHeight:1.95, margin:'0 0 18px', fontStyle:'italic' }}>"{selected.card_verse}"</p>
                    <p style={{ color:'rgba(245,230,208,0.8)', fontSize:12, margin:0, fontFamily:"'Gowun Batang',serif" }}>{selected.reference} · 개역개정</p>
                  </div>
                  <CopyBtn
                    text={`✦ 이번 주 말씀 (개역개정)\n\n"${selected.card_verse}"\n\n— ${selected.reference}`}
                    id="card" label="📋 말씀카드 복사"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
