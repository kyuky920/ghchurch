import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

function getWeekStr(date) {
  const d = new Date(date || new Date())
  d.setHours(0,0,0,0); d.setDate(d.getDate()-d.getDay())
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function weekLabel(week) {
  if (!week) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    const [,m,d] = week.split('-').map(Number)
    return `${m}월 ${d}일 주`
  }
  return week
}
function getDeviceId() {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('wl_device_id')
  if (!id) { id='dev_'+Date.now().toString(36)+Math.random().toString(36).slice(2); localStorage.setItem('wl_device_id',id) }
  return id
}
function getSavedName() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('wl_member_name')||''
}

const GROUP_COLORS = ['#a0784e','#7a9e7e','#7a6e9e','#c4956a','#c0392b','#1565c0','#2e7d32','#6d4c41','#00838f','#558b2f']
const GROUP_BGS    = ['#fdf5ec','#f0f7f1','#f5f3fa','#fef8f0','#ffebee','#e3f2fd','#e8f5e9','#efebe9','#e0f7fa','#f1f8e9']

export default function CellPage() {
  const router = useRouter()

  // 기본 상태
  const [name, setName]             = useState('')
  const [inputName, setInputName]   = useState('')
  const [registered, setRegistered] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [errMsg, setErrMsg]         = useState('')

  // 조 편성
  const [groups, setGroups]         = useState(null)  // { groups: [...] }
  const [members, setMembers]       = useState([])
  const [loading, setLoading]       = useState(false)

  // 내 조
  const [myGroup, setMyGroup]       = useState(null)
  const [amLeader, setAmLeader]     = useState(false)

  // 조별 세션 상태
  const [groupSessions, setGroupSessions] = useState({}) // { group_no: sessionData }
  const [sermonLookup, setSermonLookup] = useState({})

  // 셀 리더 모임 시작 모달
  const [showStartModal, setShowStartModal] = useState(false)
  const [sermons, setSermons]               = useState([])
  const [selWeek, setSelWeek]               = useState('')
  const [selService, setSelService]         = useState('morning')
  const [sessionStarting, setSessionStarting] = useState(false)

  // 그룹 종료
  const [groupEnding, setGroupEnding] = useState(false)
  const [groupEnded, setGroupEnded]   = useState(false)
  const [noticeAcknowledged, setNoticeAcknowledged] = useState(false)

  const heartbeatRef = useRef(null)
  const pollRef      = useRef(null)
  const deviceId     = useRef('')

  // ── 초기화 ──
  useEffect(() => {
    deviceId.current = getDeviceId()
    const saved = getSavedName()
    if (saved) { setName(saved); setRegistered(true); startHeartbeat(saved) }
    loadData()
    startPoll()
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  useEffect(() => {
    if (registered) {
      loadData()
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      startHeartbeat(name)
    }
  }, [registered])

  // ── 폴링: 전체 활성 세션 조회 ──
  const pollFn = useRef(null)
  pollFn.current = async function() {
    try {
      const res = await fetch('/api/cell-sessions?all=true')
      const d = await res.json()
      if (d.ok && Array.isArray(d.data)) {
        const map = {}
        d.data.forEach(s => { map[String(s.group_no)] = s })
        setGroupSessions(map)
      }
    } catch(e) {}
  }

  function startPoll() {
    pollFn.current()
    pollRef.current = setInterval(() => pollFn.current(), 5000)
  }

  // ── Heartbeat ──
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

  // ── 데이터 로드 (접속자 + 조 편성) ──
  async function loadData() {
    setLoading(true)
    try {
      const [mRes, gRes] = await Promise.all([
        fetch('/api/members'),
        fetch(`/api/cell-groups?week=${getWeekStr()}`)
      ])
      const mData = await mRes.json()
      const gData = await gRes.json()
      if (mData.ok) setMembers(mData.data || [])
      if (gData.ok && gData.data) {
        setGroups(gData.data)
        // 내 조 찾기
        const did = deviceId.current
        const found = gData.data.groups?.find(g =>
          g.members?.some(m => m.device_id === did)
        )
        setMyGroup(found || null)
        setAmLeader(!!found && found.leader?.device_id === did)
      } else {
        setGroups(null)
        setMyGroup(null)
        setAmLeader(false)
      }
    } catch(e) {}
    finally { setLoading(false) }
  }

  // ── 이름 등록 ──
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
    } catch(e) { setErrMsg('오류: '+e.message) }
    finally { setSaving(false) }
  }

  // ── 신규 청년: 조 참여하기 ──
  async function joinGroup(group) {
    const did = deviceId.current
    const newMember = { name, device_id: did }
    // 클라이언트에서 즉시 반영
    setMyGroup({ ...group, members: [...(group.members||[]), newMember] })
    setAmLeader(false)
    // 서버에 조 편성 업데이트
    try {
      const res = await fetch('/api/cell-groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week: getWeekStr(), group_no: group.group_no, device_id: did, name })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      await loadData()
    } catch(e) {
      setErrMsg('조 참여 오류: ' + e.message)
      await loadData()
    }
  }

  // ── 셀 리더: 말씀 목록 로드 ──
  async function loadSermons() {
    try {
      const res = await fetch('/api/sermons')
      const d = await res.json()
      if (d.ok && d.data?.length) {
        const sorted = d.data.sort((a,b) => b.week.localeCompare(a.week))
        const weeks = [...new Set(sorted.map(s=>s.week))].slice(0,2)
        const recent = sorted.filter(s => weeks.includes(s.week))
        setSermons(recent)
        if (recent.length) { setSelWeek(recent[0].week); setSelService(recent[0].service) }
      }
    } catch(e) {}
  }

  async function loadSermonLookup() {
    try {
      const res = await fetch('/api/sermons')
      const d = await res.json()
      if (!d.ok || !Array.isArray(d.data)) return
      const lookup = {}
      d.data.forEach(s => {
        lookup[`${s.week}:${s.service}`] = s
      })
      setSermonLookup(lookup)
    } catch(e) {}
  }

  useEffect(() => {
    loadSermonLookup()
  }, [])

  // ── 셀 리더: 모임 시작 ──
  async function handleStartSession() {
    if (!selWeek) { alert('말씀을 선택해주세요.'); return }
    if (!myGroup) { alert('내 조를 찾을 수 없어요.'); return }
    setSessionStarting(true)
    try {
      const res = await fetch('/api/cell-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week: getWeekStr(),
          service: 'all',
          group_no: String(myGroup.group_no),
          group_name: myGroup.name,
          sermon_week: selWeek,
          sermon_service: selService,
          device_id: deviceId.current,
        })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setGroupEnded(false)
      setShowStartModal(false)
      // 폴링 즉시 갱신
      await pollFn.current()
      // 리더는 바로 이동
      router.push(`/cell-word?week=${selWeek}&service=${selService}&group_no=${myGroup.group_no}&tab=1`)
    } catch(e) { alert('오류: '+e.message) }
    finally { setSessionStarting(false) }
  }

  // ── 셀 리더: 모임 종료 ──
  async function handleGroupEnd() {
    if (!myGroup) return
    setGroupEnding(true)
    try {
      const res = await fetch('/api/cell-sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'end',
          week: getWeekStr(),
          group_no: String(myGroup.group_no),
          device_id: deviceId.current
        })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setGroupEnded(true)
      await pollFn.current()
    } catch(e) { alert('오류: '+e.message) }
    finally { setGroupEnding(false) }
  }

  // ── 내 조 세션 ──
  const latestMySession = myGroup ? groupSessions[String(myGroup.group_no)] : null
  const mySession = latestMySession?.is_active ? latestMySession : null
  const activeNoticeKey = latestMySession?.notice
    ? `${latestMySession.group_no || ''}:${latestMySession.notice}`
    : ''
  const isLeaderNoticeVisible = !!(
    amLeader &&
    myGroup &&
    latestMySession &&
    String(myGroup.group_no) === String(latestMySession.group_no) &&
    latestMySession.notice &&
    !noticeAcknowledged
  )

  useEffect(() => {
    if (!latestMySession) {
      setGroupEnded(false)
      return
    }
    setGroupEnded(!latestMySession.is_active && !!latestMySession.ended_at)
  }, [latestMySession?.is_active, latestMySession?.ended_at])

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

  return (
    <>
      <Head>
        <title>셀 나눔 · WORD &amp; LIFE</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <style>{`
          *{box-sizing:border-box;}
          body{margin:0;font-family:'Noto Sans KR',sans-serif;background:#faf6f0;}
          input:focus{border-color:#a0784e!important;outline:none;}
          @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
          @keyframes glow{0%,100%{box-shadow:0 0 12px rgba(46,125,50,0.4)}50%{box-shadow:0 0 28px rgba(46,125,50,0.8)}}
          @keyframes spin{to{transform:rotate(360deg)}}
        `}</style>
      </Head>
      <div style={{minHeight:'100vh',background:'#faf6f0'}}>

        {/* ── 헤더 ── */}
        <div style={{
          background: amLeader ? 'linear-gradient(160deg,#1a4a1a,#2a6a2a)' : 'linear-gradient(160deg,#e8dcc8,#d4c4a8)',
          padding:'24px 20px', borderBottom: amLeader?'1px solid #3a7a3a':'1px solid #c8b898', transition:'all 0.4s'
        }}>
          <p style={{fontSize:10,color:amLeader?'rgba(150,230,150,0.7)':'#8b6e4e',letterSpacing:'0.2em',fontWeight:600,margin:'0 0 6px'}}>WORD &amp; LIFE</p>
          <h1 style={{fontFamily:"'Gowun Batang',serif",fontSize:22,color:amLeader?'#7adf7a':'#4a3520',fontWeight:700,margin:'0 0 10px'}}>셀 나눔 조 편성</h1>
          {registered && amLeader ? (
            <div style={{background:'linear-gradient(135deg,#ffd700,#ffab00)',borderRadius:16,padding:'10px 18px',display:'flex',alignItems:'center',gap:10,boxShadow:'0 4px 20px rgba(255,180,0,0.5)',animation:'glow 2s ease-in-out infinite',width:'fit-content'}}>
              <span style={{fontSize:26}}>👑</span>
              <div>
                <p style={{fontSize:14,fontFamily:"'Gowun Batang',serif",fontWeight:700,color:'#1a1000',margin:'0 0 1px'}}>셀 리더</p>
                <p style={{fontSize:12,color:'rgba(26,16,0,0.7)',margin:0,fontWeight:600}}>{name} · {myGroup?.name}</p>
              </div>
            </div>
          ) : registered ? (
            <p style={{fontSize:12,color:'#8b6e4e',margin:0}}>안녕하세요, <strong>{name}</strong>님! 🙏</p>
          ) : (
            <p style={{fontSize:12,color:'#8b6e4e',margin:0}}>이름을 입력하고 조 편성을 확인하세요</p>
          )}
        </div>

        {/* ── 내 조 세션 알림 배너 ── */}
        {mySession && !amLeader && (
          <div style={{background:'linear-gradient(135deg,#2e7d32,#43a047)',padding:'14px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
            <div>
              <p style={{fontSize:13,color:'#fff',fontWeight:700,margin:'0 0 2px'}}>🟢 {myGroup?.name} 셀 모임이 시작됐어요!</p>
              <p style={{fontSize:11,color:'rgba(255,255,255,0.8)',margin:0}}>버튼을 눌러 말씀 나눔에 참여하세요</p>
            </div>
            <button onClick={()=>router.push(`/cell-word?week=${mySession.sermon_week}&service=${mySession.sermon_service}&group_no=${mySession.group_no}&tab=1`)}
              style={{background:'#fff',color:'#2e7d32',border:'none',borderRadius:10,padding:'10px 16px',cursor:'pointer',fontSize:13,fontWeight:700,flexShrink:0}}>
              참여하기 →
            </button>
          </div>
        )}

        {/* ── 셀 리더: 진행중 바 ── */}
        {amLeader && latestMySession && (
          <div style={{background:groupEnded?'#e8f5e9':'#fff3e0',padding:'12px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${groupEnded?'#a5d6a7':'#ffcc80'}`}}>
            <div>
              <p style={{fontSize:12,color:groupEnded?'#2e7d32':'#e65100',fontWeight:700,margin:'0 0 1px'}}>
                {groupEnded?'✅ 모임 종료 완료':`👑 ${myGroup?.name} 모임 진행 중`}
              </p>
              <p style={{fontSize:10,color:groupEnded?'#558b2f':'#bf360c',margin:0}}>
                {groupEnded?'부장집사님께 알림이 전송됐어요':'말씀 나눔 중이에요'}
              </p>
            </div>
            <div style={{display:'flex',gap:8}}>
              {!groupEnded && mySession && (
                <button onClick={()=>router.push(`/cell-word?week=${mySession.sermon_week}&service=${mySession.sermon_service}&group_no=${mySession.group_no}&tab=1`)}
                  style={{background:'rgba(255,200,0,0.2)',border:'1px solid rgba(255,200,0,0.5)',borderRadius:8,padding:'7px 12px',cursor:'pointer',fontSize:12,color:'#e65100',fontWeight:600}}>
                  나눔 보기
                </button>
              )}
              {!groupEnded && mySession && (
                <button onClick={handleGroupEnd} disabled={groupEnding}
                  style={{background:'rgba(200,60,60,0.15)',border:'1px solid rgba(200,80,80,0.4)',borderRadius:8,padding:'7px 12px',cursor:'pointer',fontSize:12,color:'#c62828',fontWeight:700}}>
                  {groupEnding?'전송중...':'🙏 종료'}
                </button>
              )}
            </div>
          </div>
        )}

        {isLeaderNoticeVisible && (
          <div style={{padding:'12px 16px 0'}}>
            <div style={{
              maxWidth:640,
              margin:'0 auto',
              background:'linear-gradient(135deg,#1b5e20,#2e7d32)',
              borderRadius:16,
              padding:'16px 18px',
              boxShadow:'0 8px 24px rgba(27,94,32,0.22)',
              animation:'fadeUp 0.25s ease'
            }}>
              <p style={{ fontSize:10, color:'rgba(255,255,255,0.72)', margin:'0 0 6px', fontWeight:700, letterSpacing:'0.12em' }}>📢 리더 공지</p>
              <p style={{ fontSize:15, color:'#fff', fontFamily:"'Gowun Batang',serif", fontWeight:700, margin:'0 0 12px', lineHeight:1.65 }}>{latestMySession.notice}</p>
              <button
                onClick={handleNoticeConfirm}
                style={{background:'rgba(255,255,255,0.16)',border:'1px solid rgba(255,255,255,0.25)',borderRadius:10,color:'#fff',padding:'8px 14px',fontSize:12,fontWeight:700,cursor:'pointer'}}
              >
                확인
              </button>
            </div>
          </div>
        )}

        <div style={{maxWidth:640,margin:'0 auto',padding:'20px 16px 80px',display:'flex',flexDirection:'column',gap:16}}>

          {/* ── 이름 등록 ── */}
          {!registered ? (
            <div style={{background:'#fff',borderRadius:16,padding:'24px 20px',border:'1px solid #e8d8c0',boxShadow:'0 4px 20px rgba(160,120,78,0.1)'}}>
              <p style={{fontFamily:"'Gowun Batang',serif",fontSize:16,color:'#4a3520',fontWeight:700,margin:'0 0 6px'}}>처음이시군요!</p>
              <p style={{fontSize:12,color:'#8b6e4e',margin:'0 0 18px',lineHeight:1.6}}>이름을 한 번만 입력하면 다음부터 자동으로 인식돼요.</p>
              <input value={inputName} onChange={e=>setInputName(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter') handleRegister() }}
                placeholder="이름을 입력하세요" maxLength={10}
                style={{width:'100%',padding:'13px 16px',border:'1.5px solid #ddd0ba',borderRadius:10,fontSize:16,background:'#faf7f4',color:'#4a3520',outline:'none',marginBottom:12}}
                autoFocus/>
              {errMsg&&<p style={{color:'#c0392b',fontSize:12,margin:'0 0 10px'}}>⚠ {errMsg}</p>}
              <button onClick={handleRegister} disabled={saving}
                style={{width:'100%',background:'linear-gradient(135deg,#a0784e,#c4956a)',color:'#fff',border:'none',borderRadius:12,padding:'14px',fontSize:15,fontFamily:"'Gowun Batang',serif",fontWeight:700,cursor:saving?'not-allowed':'pointer'}}>
                {saving?'등록 중...':'✦ 참석하기'}
              </button>
            </div>
          ) : (
            <>
              {/* ── 접속 현황 ── */}
              <div style={{background:'#fff',borderRadius:14,padding:'14px 18px',border:'1px solid #e8d8c0',display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:'#7a9e7e',animation:'pulse 2s infinite',flexShrink:0}}/>
                <p style={{fontSize:12,color:'#7a9e7e',margin:0,fontWeight:600}}>접속 중 · {members.length}명 함께 있어요</p>
                <button onClick={loadData} style={{marginLeft:'auto',background:'#f5f0ea',border:'1px solid #ddd0ba',borderRadius:8,padding:'4px 10px',cursor:'pointer',fontSize:11,color:'#8b6e4e',fontWeight:600}}>🔄</button>
              </div>

              {/* ── 셀 리더: 모임 시작 버튼 ── */}
              {amLeader && !mySession && (
                <div style={{background:'linear-gradient(135deg,#1a3a1a,#2a5a2a)',borderRadius:16,padding:'20px',border:'1px solid #4a8a4a'}}>
                  <p style={{fontFamily:"'Gowun Batang',serif",fontSize:15,color:'#7adf7a',fontWeight:700,margin:'0 0 6px'}}>👑 셀 리더로 선정됐어요!</p>
                  <p style={{fontSize:11,color:'rgba(150,220,150,0.7)',margin:'0 0 16px'}}>말씀을 선택하고 모임을 시작해주세요</p>
                  <button onClick={()=>{ setShowStartModal(true); loadSermons() }}
                    style={{width:'100%',background:'linear-gradient(135deg,#2e7d32,#43a047)',color:'#fff',border:'none',borderRadius:12,padding:'15px',fontSize:15,fontFamily:"'Gowun Batang',serif",fontWeight:700,cursor:'pointer',animation:'glow 2s ease-in-out infinite'}}>
                    🙏 셀 모임 시작하기
                  </button>
                </div>
              )}

              {/* ── 전체 조 편성 ── */}
              <div style={{background:'#fff',borderRadius:14,padding:'16px 18px',border:'1px solid #e8d8c0'}}>
                <p style={{fontSize:13,color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,margin:'0 0 14px'}}>
                  전체 조 편성 {groups?.week ? `— ${weekLabel(groups.week)}` : ''}
                </p>

                {loading ? (
                  <p style={{color:'#a0784e',fontSize:13,textAlign:'center',padding:'20px 0'}}>불러오는 중...</p>
                ) : !groups?.groups?.length ? (
                  <div style={{textAlign:'center',padding:'24px 0',color:'#b8a090'}}>
                    <p style={{fontSize:32,marginBottom:8}}>⏳</p>
                    <p style={{fontSize:13,fontFamily:"'Gowun Batang',serif"}}>아직 조 편성이 없어요</p>
                    <p style={{fontSize:11,margin:'4px 0 0'}}>리더 도구에서 조 편성을 완료하면 표시돼요</p>
                  </div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:12}}>
                    {groups.groups.map((g, gi) => {
                      const isMyGroup = g.members?.some(m => m.device_id === deviceId.current)
                      const color     = GROUP_COLORS[gi % GROUP_COLORS.length]
                      const bg        = GROUP_BGS[gi % GROUP_BGS.length]
                      const session   = groupSessions[String(g.group_no)]
                      const sessionSermon = session ? sermonLookup[`${session.sermon_week}:${session.sermon_service}`] : null
                      const alreadyInGroup = groups.groups.some(gg => gg.members?.some(m => m.device_id === deviceId.current))

                      return (
                        <div key={g.group_no} style={{borderRadius:14,padding:'16px 18px',background:isMyGroup?`${color}18`:bg,border:`1.5px solid ${isMyGroup?color:color+'30'}`,animation:`fadeUp 0.3s ease ${gi*0.07}s both`}}>
                          {/* 조 헤더 */}
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                            <div style={{width:10,height:10,borderRadius:'50%',background:color,flexShrink:0}}/>
                            <p style={{fontFamily:"'Gowun Batang',serif",fontSize:15,color,fontWeight:700,margin:0,flex:1}}>{g.name}</p>
                            {isMyGroup && <span style={{background:color,color:'#fff',borderRadius:10,padding:'1px 8px',fontSize:10,fontWeight:700}}>내 조</span>}
                            {g.leader && <span style={{fontSize:11,color,fontWeight:600}}>👑 {g.leader.name}</span>}
                            <span style={{fontSize:11,color:'#a08060'}}>({g.members?.length||0}명)</span>
                          </div>

                          {/* 세션 상태 */}
                          {session?.is_active && (
                            <div style={{background:'rgba(46,125,50,0.08)',borderRadius:8,padding:'8px 10px',marginBottom:10,display:'flex',alignItems:'flex-start',gap:6}}>
                              <div style={{width:6,height:6,borderRadius:'50%',background:'#4caf50',flexShrink:0,marginTop:5}}/>
                              <div>
                                <p style={{fontSize:11,color:'#2e7d32',fontWeight:700,margin:'0 0 2px'}}>
                                  모임 진행 중
                                </p>
                                <p style={{fontSize:11,color:'#2e7d32',fontWeight:600,margin:0}}>
                                  {sessionSermon?.reference || (session.sermon_week && weekLabel(session.sermon_week))}
                                  {session.sermon_service==='morning'?' · ☀️ 오전':session.sermon_service==='afternoon'?' · 🌙 오후':''}
                                </p>
                                {sessionSermon?.sermon_title && <p style={{fontSize:10,color:'#5d8a60',margin:'2px 0 0'}}>{sessionSermon.sermon_title}</p>}
                              </div>
                            </div>
                          )}

                          {/* 멤버 */}
                          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
                            {(g.members||[]).map(m => (
                              <span key={m.device_id} style={{background:m.device_id===deviceId.current?color:'rgba(255,255,255,0.7)',color:m.device_id===deviceId.current?'#fff':'#4a3520',borderRadius:20,padding:'4px 12px',fontSize:12,fontWeight:m.device_id===deviceId.current?700:500,border:`1px solid ${color}40`,display:'flex',alignItems:'center',gap:4}}>
                                {g.leader?.device_id===m.device_id && '👑'}
                                {m.name}{m.device_id===deviceId.current?' (나)':''}
                              </span>
                            ))}
                            {(!g.members||g.members.length===0) && <p style={{fontSize:12,color:'#b8a090',margin:0,fontStyle:'italic'}}>아직 아무도 없어요</p>}
                          </div>

                          {/* 하단 버튼 */}
                          <div style={{display:'flex',gap:8}}>
                            {/* 이 조에 미배정인 경우: 참여하기 버튼 */}
                            {!alreadyInGroup && registered && (
                              <button onClick={()=>joinGroup(g)}
                                style={{flex:1,background:color,color:'#fff',border:'none',borderRadius:10,padding:'10px',cursor:'pointer',fontSize:13,fontFamily:"'Gowun Batang',serif",fontWeight:700}}>
                                이 조에 참여하기
                              </button>
                            )}
                            {/* 이 조 세션이 있고 내 조인 경우: 나눔 참여 버튼 */}
                            {isMyGroup && session?.is_active && (
                              <button onClick={()=>router.push(`/cell-word?week=${session.sermon_week}&service=${session.sermon_service}&group_no=${session.group_no}&tab=1`)}
                                style={{flex:1,background:'linear-gradient(135deg,#2e7d32,#43a047)',color:'#fff',border:'none',borderRadius:10,padding:'10px',cursor:'pointer',fontSize:13,fontFamily:"'Gowun Batang',serif",fontWeight:700}}>
                                📖 말씀 나눔 참여하기 →
                              </button>
                            )}
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

        {/* ── 모임 시작 모달 ── */}
        {showStartModal && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}}
            onClick={()=>setShowStartModal(false)}>
            <div style={{background:'#fff',borderRadius:'24px 24px 0 0',padding:'28px 24px 40px',width:'100%',maxWidth:640,boxShadow:'0 -10px 60px rgba(0,0,0,0.3)'}}
              onClick={e=>e.stopPropagation()}>
              <div style={{width:40,height:4,background:'#e8dcc8',borderRadius:2,margin:'0 auto 24px'}}/>
              <p style={{fontFamily:"'Gowun Batang',serif",fontSize:18,color:'#4a3520',fontWeight:700,margin:'0 0 4px'}}>🙏 셀 모임 시작</p>
              <p style={{fontSize:12,color:'#8b6e4e',margin:'0 0 20px',lineHeight:1.7}}>함께 나눌 말씀을 선택해주세요.</p>

              {sermons.length === 0 ? (
                <div style={{textAlign:'center',padding:'32px 0',color:'#b8a090'}}>
                  <p style={{fontSize:13}}>등록된 말씀이 없어요</p>
                </div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:24}}>
                  {Object.entries(sermons.reduce((acc,s)=>{ if(!acc[s.week]) acc[s.week]=[]; acc[s.week].push(s); return acc },{})).map(([wk, items]) => (
                    <div key={wk} style={{marginBottom:8}}>
                      <p style={{fontSize:11,color:'#a08060',fontWeight:700,margin:'0 0 8px'}}>{weekLabel(wk)}</p>
                      {items.map(s => {
                        const isSel = selWeek===s.week && selService===s.service
                        const isMorn = s.service==='morning'
                        return (
                          <button key={s.id} onClick={()=>{ setSelWeek(s.week); setSelService(s.service) }}
                            style={{width:'100%',padding:'14px 18px',borderRadius:14,border:`2px solid ${isSel?'#2e7d32':'#e8dcc8'}`,background:isSel?'#e8f5e9':'#fff',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:14,marginBottom:8}}>
                            <span style={{width:36,height:36,borderRadius:10,background:isMorn?'#fff8ec':'#f5f3fa',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>
                              {isMorn?'☀️':'🌙'}
                            </span>
                            <div>
                              <p style={{margin:'0 0 2px',fontSize:13,fontFamily:"'Gowun Batang',serif",fontWeight:700,color:isSel?'#2e7d32':'#4a3520'}}>{s.reference}</p>
                              <p style={{margin:0,fontSize:11,color:isSel?'#43a047':'#8b6e4e'}}>{isMorn?'주일 오전':'주일 오후'}{s.sermon_title?` · ${s.sermon_title}`:''}</p>
                            </div>
                            {isSel && <span style={{marginLeft:'auto',fontSize:20,color:'#2e7d32'}}>✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}

              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setShowStartModal(false)}
                  style={{flex:1,padding:'14px',borderRadius:14,border:'1px solid #e8dcc8',background:'#fff',cursor:'pointer',fontSize:13,color:'#8b6e4e',fontWeight:600}}>
                  취소
                </button>
                <button onClick={handleStartSession} disabled={sessionStarting||!selWeek}
                  style={{flex:2,padding:'14px',borderRadius:14,background:(!selWeek||sessionStarting)?'#c4a882':'linear-gradient(135deg,#2e7d32,#43a047)',color:'#fff',border:'none',cursor:(!selWeek||sessionStarting)?'not-allowed':'pointer',fontSize:15,fontFamily:"'Gowun Batang',serif",fontWeight:700}}>
                  {sessionStarting?'시작 중...':'🙏 모임 시작하기'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
