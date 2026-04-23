import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

function getWeekStr(date) {
  const d = new Date(date || new Date())
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
function weekLabel(week) {
  if (!week) return ''
  // YYYY-MM-DD 형식
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    const [y, m, d] = week.split('-').map(Number)
    if (!y || !m || !d) return week
    return `${m}월 ${d}일 주`
  }
  // 구형식 YYYY-Www
  if (/^\d{4}-W\d{2}$/.test(week)) {
    const d = new Date(week + '-1') // ISO week Monday
    if (isNaN(d.getTime())) return week
    return `${d.getMonth()+1}월 ${d.getDate()}일 주`
  }
  return week
}
function getDeviceId() {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('wl_device_id')
  if (!id) { id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2); localStorage.setItem('wl_device_id', id) }
  return id
}
function getSavedName() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('wl_member_name') || ''
}

const TAB_LABELS = ['말씀 요약', '나눔 질문', '주간 묵상', '말씀카드']
const GROUP_COLORS = ['#a0784e','#7a9e7e','#7a6e9e','#c4956a','#c0392b','#1565c0','#2e7d32','#6d4c41','#00838f','#558b2f']
const GROUP_BGS    = ['#fdf5ec','#f0f7f1','#f5f3fa','#fef8f0','#ffebee','#e3f2fd','#e8f5e9','#efebe9','#e0f7fa','#f1f8e9']

export default function CellPage() {
  const router = useRouter()
  const [name, setName]               = useState('')
  const [inputName, setInputName]     = useState('')
  const [registered, setRegistered]   = useState(false)
  const [saving, setSaving]           = useState(false)
  const [errMsg, setErrMsg]           = useState('')
  const [groups, setGroups]           = useState(null)
  const [members, setMembers]         = useState([])
  const [loadingGroups, setLoadingGroups] = useState(false)

  // 셀 모임 시작 관련
  const [showStartModal, setShowStartModal] = useState(false)
  const [sermons, setSermons]           = useState([])  // 사용 가능한 말씀 목록
  const [selectedSermonWeek, setSelectedSermonWeek] = useState('')
  const [selectedSermonService, setSelectedSermonService] = useState('morning')
  const [sessionStarting, setSessionStarting] = useState(false)
  const [activeSession, setActiveSession] = useState(null)
  const [redirecting, setRedirecting]   = useState(false)

  const heartbeatRef = useRef(null)
  const pollRef      = useRef(null)
  const deviceId     = useRef('')

  useEffect(() => {
    deviceId.current = getDeviceId()
    const savedName = getSavedName()
    if (savedName) { setName(savedName); setRegistered(true); startHeartbeat(savedName) }
    loadGroups()
    startSessionPoll()
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  useEffect(() => {
    if (registered) {
      loadGroups()
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      startHeartbeat(name)
    }
  }, [registered])

  // 세션 폴링 — 30초마다 활성 세션 확인
  function startSessionPoll() {
    checkSession()
    pollRef.current = setInterval(checkSession, 8000)
  }

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/cell-sessions')
      const d = await res.json()
      if (d.ok && d.data) {
        setActiveSession(d.data)
        // 내가 시작한 세션이 아니고, 아직 이동 안 했으면 → 자동 이동
        if (!redirecting) {
          setRedirecting(true)
          setTimeout(() => {
            router.push(`/?week=${d.data.week}&service=${d.data.service}&tab=${d.data.active_tab}`)
          }, 1500)
        }
      } else {
        setActiveSession(null)
        setRedirecting(false)
      }
    } catch(e) {}
  }, [redirecting, router])

  function startHeartbeat(memberName) {
    sendHeartbeat(memberName)
    heartbeatRef.current = setInterval(() => sendHeartbeat(memberName), 30000)
  }

  async function sendHeartbeat(memberName) {
    try {
      await fetch('/api/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId.current, name: memberName })
      })
    } catch(e) {}
  }

  async function handleRegister() {
    if (!inputName.trim()) { setErrMsg('이름을 입력해주세요.'); return }
    setSaving(true); setErrMsg('')
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId.current, name: inputName.trim() })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      localStorage.setItem('wl_member_name', inputName.trim())
      setName(inputName.trim())
      setRegistered(true)
      startHeartbeat(inputName.trim())
      await loadGroups()
    } catch(e) { setErrMsg('오류: ' + e.message) }
    finally { setSaving(false) }
  }

  async function loadGroups() {
    setLoadingGroups(true)
    try {
      const [mRes, gRes] = await Promise.all([
        fetch('/api/members'),
        fetch(`/api/cell-groups?week=${getWeekStr()}`)
      ])
      const mData = await mRes.json()
      const gData = await gRes.json()
      if (mData.ok) setMembers(mData.data || [])
      if (gData.ok) setGroups(gData.data)
      else setGroups(null)
    } catch(e) {}
    finally { setLoadingGroups(false) }
  }

  async function loadSermons() {
    try {
      const res = await fetch('/api/sermons')
      const d = await res.json()
      if (d.ok && d.data?.length) {
        // 최근 2주 데이터만 필터
        const sorted = d.data.sort((a, b) => b.week.localeCompare(a.week))
        const weeks = [...new Set(sorted.map(s => s.week))].slice(0, 2)
        const recent = sorted.filter(s => weeks.includes(s.week))
        setSermons(recent)
        // 기본값: 가장 최신
        if (recent.length) {
          setSelectedSermonWeek(recent[0].week)
          setSelectedSermonService(recent[0].service)
        }
      }
    } catch(e) {}
  }

  async function handleStartSession() {
    if (!selectedSermonWeek) { alert('말씀을 선택해주세요.'); return }
    setSessionStarting(true)
    try {
      const res = await fetch('/api/cell-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer wordlife-leader-2025' },
        body: JSON.stringify({ week: selectedSermonWeek, service: selectedSermonService, active_tab: 0 })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setShowStartModal(false)
      // 셀 리더는 직접 이동
      router.push(`/?week=${selectedSermonWeek}&service=${selectedSermonService}&tab=0`)
    } catch(e) { alert('오류: ' + e.message) }
    finally { setSessionStarting(false) }
  }

  // 내가 속한 조 & 셀 리더 여부
  const myGroup  = groups?.groups?.find(g => g.members.some(m => m.device_id === deviceId.current))
  const amLeader = myGroup?.leader?.device_id === deviceId.current

  return (
    <>
      <Head>
        <title>셀 조 편성 · WORD &amp; LIFE</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <style>{`
          *{box-sizing:border-box;}
          body{margin:0;font-family:'Noto Sans KR',sans-serif;background:#faf6f0;}
          input:focus{border-color:#a0784e!important;outline:none;}
          @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes glow{0%,100%{box-shadow:0 0 12px rgba(46,125,50,0.4)}50%{box-shadow:0 0 28px rgba(46,125,50,0.8)}}
        `}</style>
      </Head>
      <div style={{minHeight:'100vh',background:'#faf6f0'}}>

        {/* 헤더 */}
        <div style={{background: amLeader
            ? 'linear-gradient(160deg,#1a4a1a,#2a6a2a)'
            : 'linear-gradient(160deg,#e8dcc8,#d4c4a8)',
          padding:'24px 20px', borderBottom: amLeader ? '1px solid #3a7a3a' : '1px solid #c8b898',
          transition:'all 0.4s ease'}}>
          <p style={{fontSize:10, color: amLeader ? 'rgba(150,230,150,0.7)' : '#8b6e4e', letterSpacing:'0.2em', fontWeight:600, margin:'0 0 6px'}}>WORD &amp; LIFE</p>
          <h1 style={{fontFamily:"'Gowun Batang',serif", fontSize:22, color: amLeader ? '#7adf7a' : '#4a3520', fontWeight:700, margin:'0 0 10px'}}>셀 나눔 조 편성</h1>
          {registered
            ? amLeader
              ? (
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <div style={{background:'linear-gradient(135deg,#ffd700,#ffab00)',borderRadius:16,padding:'10px 18px',display:'flex',alignItems:'center',gap:10,boxShadow:'0 4px 20px rgba(255,180,0,0.5)',animation:'glow 2s ease-in-out infinite'}}>
                    <span style={{fontSize:26}}>👑</span>
                    <div>
                      <p style={{fontSize:14,fontFamily:"'Gowun Batang',serif",fontWeight:700,color:'#1a1000',margin:'0 0 1px'}}>셀 리더</p>
                      <p style={{fontSize:12,color:'rgba(26,16,0,0.7)',margin:0,fontWeight:600}}>{name}</p>
                    </div>
                  </div>
                </div>
              )
              : <p style={{fontSize:12,color:'#8b6e4e',margin:0}}>안녕하세요, <strong>{name}</strong>님! 🙏</p>
            : <p style={{fontSize:12,color:'#8b6e4e',margin:0}}>이름을 입력하고 조 편성을 확인하세요</p>
          }
        </div>

        {/* 세션 시작됨 — 자동 이동 안내 */}
        {redirecting && (
          <div style={{background:'linear-gradient(135deg,#2e7d32,#43a047)',padding:'16px 20px',display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:20,height:20,borderRadius:'50%',border:'2.5px solid rgba(255,255,255,0.4)',borderTop:'2.5px solid #fff',animation:'spin 0.8s linear infinite',flexShrink:0}}/>
            <div>
              <p style={{fontSize:13,color:'#fff',fontWeight:700,margin:'0 0 2px'}}>셀 모임이 시작됐어요!</p>
              <p style={{fontSize:11,color:'rgba(255,255,255,0.8)',margin:0}}>말씀 나눔 페이지로 이동 중...</p>
            </div>
          </div>
        )}

        <div style={{maxWidth:640,margin:'0 auto',padding:'20px 16px 48px',display:'flex',flexDirection:'column',gap:16}}>

          {/* 이름 등록 */}
          {!registered ? (
            <div style={{background:'#fff',borderRadius:16,padding:'24px 20px',border:'1px solid #e8d8c0',boxShadow:'0 4px 20px rgba(160,120,78,0.1)'}}>
              <p style={{fontFamily:"'Gowun Batang',serif",fontSize:16,color:'#4a3520',fontWeight:700,margin:'0 0 6px'}}>처음이시군요!</p>
              <p style={{fontSize:12,color:'#8b6e4e',margin:'0 0 18px',lineHeight:1.6}}>이름을 한 번만 입력하면 다음부터 자동으로 인식돼요.</p>
              <input value={inputName} onChange={e=>setInputName(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter') handleRegister() }}
                placeholder="이름을 입력하세요" maxLength={10}
                style={{width:'100%',padding:'13px 16px',border:'1.5px solid #ddd0ba',borderRadius:10,fontSize:16,background:'#faf7f4',color:'#4a3520',outline:'none',marginBottom:12,fontFamily:"'Noto Sans KR',sans-serif"}}
                autoFocus/>
              {errMsg&&<p style={{color:'#c0392b',fontSize:12,margin:'0 0 10px'}}>⚠ {errMsg}</p>}
              <button onClick={handleRegister} disabled={saving}
                style={{width:'100%',background:'linear-gradient(135deg,#a0784e,#c4956a)',color:'#fff',border:'none',borderRadius:12,padding:'14px',fontSize:15,fontFamily:"'Gowun Batang',serif",fontWeight:700,cursor:saving?'not-allowed':'pointer',boxShadow:'0 4px 16px rgba(160,120,78,0.3)'}}>
                {saving?'등록 중...':'✦ 참석하기'}
              </button>
            </div>
          ) : (
            <>
              {/* 접속 현황 */}
              <div style={{background:'#fff',borderRadius:14,padding:'14px 18px',border:'1px solid #e8d8c0',display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:'#7a9e7e',animation:'pulse 2s infinite',flexShrink:0}}/>
                <p style={{fontSize:12,color:'#7a9e7e',margin:0,fontWeight:600}}>접속 중 · {members.length}명 함께 있어요</p>
                <button onClick={loadGroups} style={{marginLeft:'auto',background:'#f5f0ea',border:'1px solid #ddd0ba',borderRadius:8,padding:'4px 10px',cursor:'pointer',fontSize:11,color:'#8b6e4e',fontWeight:600}}>🔄</button>
              </div>

              {/* ── 셀 리더 전용: 모임 시작 버튼 ── */}
              {amLeader && !activeSession && (
                <div style={{background:'linear-gradient(135deg,#1a3a1a,#2a5a2a)',borderRadius:16,padding:'20px 20px',border:'1px solid #4a8a4a',animation:'fadeUp 0.4s ease'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                    <span style={{fontSize:22}}>👑</span>
                    <div>
                      <p style={{fontFamily:"'Gowun Batang',serif",fontSize:15,color:'#7adf7a',fontWeight:700,margin:0}}>셀 리더로 선정됐어요!</p>
                      <p style={{fontSize:11,color:'rgba(150,220,150,0.7)',margin:0}}>모임을 시작해서 멤버들을 말씀 나눔으로 이끌어주세요</p>
                    </div>
                  </div>
                  <button onClick={()=>{ setShowStartModal(true); loadSermons() }}
                    style={{width:'100%',background:'linear-gradient(135deg,#2e7d32,#43a047)',color:'#fff',border:'none',borderRadius:12,padding:'15px',fontSize:15,fontFamily:"'Gowun Batang',serif",fontWeight:700,cursor:'pointer',boxShadow:'0 4px 20px rgba(46,125,50,0.5)',animation:'glow 2s ease-in-out infinite',marginTop:4}}>
                    🙏 셀 모임 시작하기
                  </button>
                </div>
              )}

              {/* 셀 리더이고 모임 진행 중 */}
              {amLeader && activeSession && (
                <div style={{background:'linear-gradient(135deg,#1a3a1a,#2a5a2a)',borderRadius:16,padding:'16px 20px',border:'1px solid #4a8a4a',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <p style={{fontSize:13,color:'#7adf7a',fontWeight:700,margin:'0 0 2px'}}>🟢 셀 모임 진행 중</p>
                    <p style={{fontSize:11,color:'rgba(150,220,150,0.6)',margin:0}}>{activeSession.week && (() => { const d=new Date(activeSession.week+'T00:00:00'); return `${d.getMonth()+1}월 ${d.getDate()}일 주` })()} · {activeSession.service==='morning'?'오전':'오후'}</p>
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>router.push(`/?week=${activeSession.week}&service=${activeSession.service}&tab=${activeSession.active_tab}`)}
                      style={{background:'rgba(150,220,150,0.2)',border:'1px solid rgba(150,220,150,0.4)',borderRadius:8,padding:'7px 12px',cursor:'pointer',fontSize:12,color:'#7adf7a',fontWeight:600}}>
                      참여하기
                    </button>
                    <button onClick={async()=>{
                      await fetch('/api/cell-sessions',{method:'DELETE',headers:{'Authorization':'Bearer wordlife-leader-2025'}})
                      setActiveSession(null)
                    }} style={{background:'rgba(200,60,60,0.2)',border:'1px solid rgba(200,80,80,0.4)',borderRadius:8,padding:'7px 12px',cursor:'pointer',fontSize:12,color:'#ff8a8a',fontWeight:600}}>
                      종료
                    </button>
                  </div>
                </div>
              )}

              {/* 일반 멤버 — 모임 대기 안내 */}
              {!amLeader && !activeSession && myGroup && (
                <div style={{background:'#fdf5ec',borderRadius:14,padding:'14px 18px',border:'1px solid #e8c9a0',display:'flex',alignItems:'center',gap:12}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:'#a0784e',animation:'pulse 2s infinite',flexShrink:0}}/>
                  <div>
                    <p style={{fontSize:13,color:'#4a3520',fontWeight:700,margin:'0 0 2px'}}>셀 리더가 모임을 시작하면 자동으로 이동해요</p>
                    <p style={{fontSize:11,color:'#8b6e4e',margin:0}}>
                      {myGroup.leader ? `👑 ${myGroup.leader.name} 리더가 시작할 때까지 기다려주세요` : '셀 리더를 기다리는 중...'}
                    </p>
                  </div>
                </div>
              )}

              {/* 내 조 카드 */}
              {myGroup && (
                <div style={{background:`linear-gradient(135deg,${GROUP_COLORS[groups.groups.indexOf(myGroup)%GROUP_COLORS.length]},${GROUP_COLORS[(groups.groups.indexOf(myGroup)+2)%GROUP_COLORS.length]})`,borderRadius:16,padding:'20px 22px',color:'#fff',animation:'fadeUp 0.4s ease'}}>
                  <p style={{fontSize:11,letterSpacing:'0.15em',margin:'0 0 6px',opacity:0.85}}>✦ 내 조</p>
                  <p style={{fontFamily:"'Gowun Batang',serif",fontSize:22,fontWeight:700,margin:'0 0 8px'}}>{myGroup.name}</p>
                  {myGroup.leader && (
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:12}}>
                      <span style={{fontSize:12,opacity:0.85}}>👑 셀 리더</span>
                      <span style={{background:'rgba(255,255,255,0.25)',borderRadius:20,padding:'3px 12px',fontSize:13,fontWeight:700}}>{myGroup.leader.name}</span>
                    </div>
                  )}
                  <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                    {myGroup.members.map(m=>{
                      const isLeader = myGroup.leader?.device_id===m.device_id
                      return (
                        <span key={m.device_id} style={{background:'rgba(255,255,255,0.2)',borderRadius:20,padding:'5px 14px',fontSize:13,fontWeight:m.device_id===deviceId.current?700:400,border:m.device_id===deviceId.current?'2px solid rgba(255,255,255,0.8)':'2px solid transparent',display:'flex',alignItems:'center',gap:4}}>
                          {isLeader && <span>👑</span>}
                          {m.name}{m.device_id===deviceId.current?' (나)':''}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 전체 조 편성 */}
              <div style={{background:'#fff',borderRadius:14,padding:'16px 18px',border:'1px solid #e8d8c0'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                  <p style={{fontSize:13,color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,margin:0}}>전체 조 편성</p>
                </div>
                {loadingGroups ? (
                  <p style={{color:'#a0784e',fontSize:13,textAlign:'center',padding:'20px 0'}}>불러오는 중...</p>
                ) : !groups?.groups ? (
                  <div style={{textAlign:'center',padding:'24px 0',color:'#b8a090'}}>
                    <p style={{fontSize:32,marginBottom:8}}>⏳</p>
                    <p style={{fontSize:13,fontFamily:"'Gowun Batang',serif"}}>아직 조 편성이 없어요</p>
                    <p style={{fontSize:11,margin:'4px 0 0'}}>리더 도구에서 조 편성을 완료하면 표시돼요</p>
                  </div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {groups.groups.map((g,gi)=>{
                      const isMyGroup = g.members.some(m=>m.device_id===deviceId.current)
                      return (
                        <div key={g.group_no} style={{borderRadius:12,padding:'14px 16px',background:isMyGroup?`${GROUP_COLORS[gi%GROUP_COLORS.length]}18`:GROUP_BGS[gi%GROUP_BGS.length],border:`1.5px solid ${isMyGroup?GROUP_COLORS[gi%GROUP_COLORS.length]:GROUP_COLORS[gi%GROUP_COLORS.length]+'30'}`,animation:`fadeUp 0.3s ease ${gi*0.07}s both`}}>
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                            <div style={{width:10,height:10,borderRadius:'50%',background:GROUP_COLORS[gi%GROUP_COLORS.length],flexShrink:0}}/>
                            <p style={{fontFamily:"'Gowun Batang',serif",fontSize:14,color:GROUP_COLORS[gi%GROUP_COLORS.length],fontWeight:700,margin:0}}>{g.name}</p>
                            {isMyGroup && <span style={{background:GROUP_COLORS[gi%GROUP_COLORS.length],color:'#fff',borderRadius:10,padding:'1px 8px',fontSize:10,fontWeight:700}}>내 조</span>}
                            {g.leader && <span style={{fontSize:11,color:GROUP_COLORS[gi%GROUP_COLORS.length],fontWeight:600}}>👑 {g.leader.name}</span>}
                            <span style={{fontSize:11,color:'#a08060',marginLeft:'auto'}}>({g.members.length}명)</span>
                          </div>
                          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                            {g.members.map(m=>(
                              <span key={m.device_id} style={{background:m.device_id===deviceId.current?GROUP_COLORS[gi%GROUP_COLORS.length]:'rgba(255,255,255,0.7)',color:m.device_id===deviceId.current?'#fff':'#4a3520',borderRadius:20,padding:'4px 12px',fontSize:13,fontWeight:m.device_id===deviceId.current?700:500,border:`1px solid ${GROUP_COLORS[gi%GROUP_COLORS.length]}40`}}>
                                {m.name}{m.device_id===deviceId.current?' ✓':''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 이름 변경 */}
              <div style={{textAlign:'center'}}>
                <button onClick={()=>{ localStorage.removeItem('wl_member_name'); setRegistered(false); setName(''); setInputName(''); if(heartbeatRef.current) clearInterval(heartbeatRef.current) }}
                  style={{background:'none',border:'none',fontSize:11,color:'#c4a882',cursor:'pointer',textDecoration:'underline'}}>
                  이름 변경하기
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── 셀 모임 시작 모달 ── */}
        {showStartModal && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}}
            onClick={()=>setShowStartModal(false)}>
            <div style={{background:'#fff',borderRadius:'24px 24px 0 0',padding:'28px 24px 40px',width:'100%',maxWidth:640,boxShadow:'0 -10px 60px rgba(0,0,0,0.3)',animation:'fadeUp 0.3s ease'}}
              onClick={e=>e.stopPropagation()}>
              <div style={{width:40,height:4,background:'#e8dcc8',borderRadius:2,margin:'0 auto 24px'}}/>
              <p style={{fontFamily:"'Gowun Batang',serif",fontSize:18,color:'#4a3520',fontWeight:700,margin:'0 0 4px'}}>🙏 셀 모임 시작</p>
              <p style={{fontSize:12,color:'#8b6e4e',margin:'0 0 20px',lineHeight:1.7}}>함께 나눌 말씀을 선택해주세요. 멤버들이 자동으로 이동해요.</p>

              {sermons.length === 0 ? (
                <div style={{textAlign:'center',padding:'32px 0',color:'#b8a090'}}>
                  <p style={{fontSize:32,margin:'0 0 8px'}}>📖</p>
                  <p style={{fontSize:13,fontFamily:"'Gowun Batang',serif"}}>등록된 말씀이 없어요</p>
                  <p style={{fontSize:11,margin:'4px 0 0'}}>리더 도구에서 말씀을 먼저 등록해주세요</p>
                </div>
              ) : (
                <>
                  {/* 말씀 목록 — 주차별 그룹 */}
                  {(() => {
                    const grouped = sermons.reduce((acc,s)=>{ if(!acc[s.week]) acc[s.week]=[]; acc[s.week].push(s); return acc },{})
                    return Object.entries(grouped).map(([wk, items]) => (
                      <div key={wk} style={{marginBottom:16}}>
                        <p style={{fontSize:11,color:'#a08060',fontWeight:700,margin:'0 0 8px',letterSpacing:'0.05em'}}>
                          {weekLabel(wk)}
                        </p>
                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                          {items.map(s => {
                            const isSel = selectedSermonWeek===s.week && selectedSermonService===s.service
                            const isMorn = s.service==='morning'
                            return (
                              <button key={s.id}
                                onClick={()=>{ setSelectedSermonWeek(s.week); setSelectedSermonService(s.service) }}
                                style={{padding:'14px 18px',borderRadius:14,border:`2px solid ${isSel?'#2e7d32':'#e8dcc8'}`,background:isSel?'#e8f5e9':'#fff',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:14,transition:'all 0.15s'}}>
                                <span style={{width:36,height:36,borderRadius:10,background:isSel?(isMorn?'linear-gradient(135deg,#f6a623,#e8901a)':'linear-gradient(135deg,#7a6e9e,#5a5080)'):(isMorn?'#fff8ec':'#f5f3fa'),display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>
                                  {isMorn?'☀️':'🌙'}
                                </span>
                                <div style={{flex:1,minWidth:0}}>
                                  <p style={{margin:'0 0 2px',fontSize:13,fontFamily:"'Gowun Batang',serif",fontWeight:700,color:isSel?'#2e7d32':'#4a3520'}}>{s.reference}</p>
                                  <p style={{margin:0,fontSize:11,color:isSel?'#43a047':'#8b6e4e',fontWeight:500}}>{isMorn?'주일 오전':'주일 오후'}{s.sermon_title ? ' · '+s.sermon_title : ''}</p>
                                </div>
                                {isSel && <span style={{fontSize:20,color:'#2e7d32',flexShrink:0}}>✓</span>}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))
                  })()}
                </>
              )}

              <div style={{display:'flex',gap:8,marginTop:8}}>
                <button onClick={()=>setShowStartModal(false)}
                  style={{flex:1,padding:'14px',borderRadius:14,border:'1px solid #e8dcc8',background:'#fff',cursor:'pointer',fontSize:13,color:'#8b6e4e',fontWeight:600}}>
                  취소
                </button>
                <button onClick={handleStartSession} disabled={sessionStarting||!selectedSermonWeek}
                  style={{flex:2,padding:'14px',borderRadius:14,background:(!selectedSermonWeek||sessionStarting)?'#c4a882':'linear-gradient(135deg,#2e7d32,#43a047)',color:'#fff',border:'none',cursor:(!selectedSermonWeek||sessionStarting)?'not-allowed':'pointer',fontSize:15,fontFamily:"'Gowun Batang',serif",fontWeight:700,boxShadow:selectedSermonWeek&&!sessionStarting?'0 6px 24px rgba(46,125,50,0.4)':'none'}}>
                  {sessionStarting ? '시작 중...' : '🙏 모임 시작하기'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
