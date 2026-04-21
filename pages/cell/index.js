import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'

function getWeekStr(date) {
  const d = new Date(date || new Date())
  d.setHours(0,0,0,0)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const y = d.getFullYear()
  const w = Math.ceil((((d - new Date(y,0,1)) / 864e5) + 1) / 7)
  return `${y}-W${String(w).padStart(2,'0')}`
}
function weekLabel(week) {
  const [y,w] = week.split('-W').map(Number)
  const jan1 = new Date(y,0,1)
  const sun = new Date(jan1)
  sun.setDate(jan1.getDate() + (w-1)*7 - (jan1.getDay()||7) + 7)
  return `${sun.getMonth()+1}월 ${sun.getDate()}일 주`
}

// 디바이스 UUID 생성/조회
function getDeviceId() {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('wl_device_id')
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2)
    localStorage.setItem('wl_device_id', id)
  }
  return id
}
function getSavedName() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('wl_member_name') || ''
}

const GROUP_COLORS = ['#a0784e','#7a9e7e','#7a6e9e','#c4956a','#c0392b','#1565c0','#2e7d32','#6d4c41','#00838f','#558b2f']
const GROUP_BGS    = ['#fdf5ec','#f0f7f1','#f5f3fa','#fef8f0','#ffebee','#e3f2fd','#e8f5e9','#efebe9','#e0f7fa','#f1f8e9']

export default function CellPage() {
  const [name, setName]           = useState('')
  const [inputName, setInputName] = useState('')
  const [registered, setRegistered] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [errMsg, setErrMsg]       = useState('')
  const [week, setWeek]           = useState(getWeekStr())
  const [service, setService]     = useState('morning')
  const [groups, setGroups]       = useState(null)
  const [members, setMembers]     = useState([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const heartbeatRef = useRef(null)
  const deviceId = useRef('')

  useEffect(() => {
    deviceId.current = getDeviceId()
    const savedName = getSavedName()
    if (savedName) {
      setName(savedName)
      setRegistered(true)
      startHeartbeat(savedName)
    }
    loadGroups()
  }, [])

  useEffect(() => {
    if (registered) {
      loadGroups()
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      startHeartbeat(name)
    }
  }, [week, service, registered])

  function startHeartbeat(memberName) {
    // 즉시 한 번 실행
    sendHeartbeat(memberName)
    // 30초마다 갱신
    heartbeatRef.current = setInterval(() => sendHeartbeat(memberName), 30000)
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current) }
  }

  async function sendHeartbeat(memberName) {
    try {
      await fetch('/api/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId.current, week, service, name: memberName })
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
        body: JSON.stringify({ device_id: deviceId.current, name: inputName.trim(), week, service })
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
      const [gRes, mRes] = await Promise.all([
        fetch(`/api/cell-groups?week=${week}&service=${service}`),
        fetch(`/api/members?week=${week}&service=${service}`)
      ])
      const gData = await gRes.json()
      const mData = await mRes.json()
      if (gData.ok) setGroups(gData.data)
      if (mData.ok) setMembers(mData.data || [])
    } catch(e) {}
    finally { setLoadingGroups(false) }
  }

  // 내가 속한 조 찾기
  const myGroup = groups?.groups?.find(g => g.members.some(m => m.device_id === deviceId.current))

  const STYLE = `
    @import url('https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
    *{box-sizing:border-box;}
    body{margin:0;font-family:'Noto Sans KR',sans-serif;background:#faf6f0;}
    input:focus{border-color:#a0784e!important;outline:none;}
    @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
  `

  return (
    <>
      <Head>
        <title>셀 조 편성 · WORD &amp; LIFE</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <style>{STYLE}</style>
      </Head>
      <div style={{minHeight:'100vh',background:'#faf6f0'}}>

        {/* 헤더 */}
        <div style={{background:'linear-gradient(160deg,#e8dcc8,#d4c4a8)',padding:'24px 20px',borderBottom:'1px solid #c8b898'}}>
          <p style={{fontSize:10,color:'#8b6e4e',letterSpacing:'0.2em',fontWeight:600,margin:'0 0 6px'}}>WORD &amp; LIFE</p>
          <h1 style={{fontFamily:"'Gowun Batang',serif",fontSize:22,color:'#4a3520',fontWeight:700,margin:'0 0 2px'}}>셀 나눔 조 편성</h1>
          {registered
            ? <p style={{fontSize:12,color:'#8b6e4e',margin:0}}>안녕하세요, <strong>{name}</strong>님! 🙏</p>
            : <p style={{fontSize:12,color:'#8b6e4e',margin:0}}>이름을 입력하고 조 편성을 확인하세요</p>
          }
        </div>

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
              <button onClick={handleRegister} disabled={saving} style={{width:'100%',background:'linear-gradient(135deg,#a0784e,#c4956a)',color:'#fff',border:'none',borderRadius:12,padding:'14px',fontSize:15,fontFamily:"'Gowun Batang',serif",fontWeight:700,cursor:saving?'not-allowed':'pointer',boxShadow:'0 4px 16px rgba(160,120,78,0.3)'}}>
                {saving?'등록 중...':'✦ 참석하기'}
              </button>
            </div>
          ) : (
            <>
              {/* 예배 선택 */}
              <div style={{background:'#fff',borderRadius:14,padding:'16px 18px',border:'1px solid #e8d8c0'}}>
                <p style={{fontSize:12,color:'#8b6e4e',fontWeight:700,margin:'0 0 10px'}}>참석 예배</p>
                <div style={{display:'flex',gap:8,marginBottom:12}}>
                  {['morning','afternoon'].map(sv=>(
                    <button key={sv} onClick={()=>setService(sv)}
                      style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${service===sv?(sv==='morning'?'#f6a623':'#7a6e9e'):'#e8dcc8'}`,background:service===sv?(sv==='morning'?'#fff8ec':'#f5f3fa'):'#fff',cursor:'pointer',fontSize:13,fontWeight:700,color:service===sv?(sv==='morning'?'#e8901a':'#5a5080'):'#b8a090'}}>
                      {sv==='morning'?'☀️ 주일 오전':'🌙 주일 오후'}
                    </button>
                  ))}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:'#7a9e7e',animation:'pulse 2s infinite'}}/>
                  <p style={{fontSize:11,color:'#7a9e7e',margin:0,fontWeight:600}}>접속 중 — 30초마다 자동 갱신 ({members.length}명 접속)</p>
                </div>
              </div>

              {/* 내 조 강조 표시 */}
              {myGroup && (
                <div style={{background:`linear-gradient(135deg,${GROUP_COLORS[groups.groups.indexOf(myGroup)%GROUP_COLORS.length]},${GROUP_COLORS[(groups.groups.indexOf(myGroup)+2)%GROUP_COLORS.length]})`,borderRadius:16,padding:'20px 22px',color:'#fff',animation:'fadeUp 0.4s ease'}}>
                  <p style={{fontSize:11,letterSpacing:'0.15em',margin:'0 0 8px',opacity:0.85}}>✦ 내 조</p>
                  <p style={{fontFamily:"'Gowun Batang',serif",fontSize:22,fontWeight:700,margin:'0 0 12px'}}>{myGroup.name}</p>
                  <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                    {myGroup.members.map(m=>(
                      <span key={m.device_id} style={{background:'rgba(255,255,255,0.2)',borderRadius:20,padding:'5px 14px',fontSize:13,fontWeight:m.device_id===deviceId.current?700:400,border:m.device_id===deviceId.current?'2px solid rgba(255,255,255,0.8)':'2px solid transparent'}}>
                        {m.name}{m.device_id===deviceId.current?' (나)':''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 전체 조 편성 */}
              <div style={{background:'#fff',borderRadius:14,padding:'16px 18px',border:'1px solid #e8d8c0'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                  <p style={{fontSize:13,color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,margin:0}}>
                    전체 조 편성 — {weekLabel(week)}
                  </p>
                  <button onClick={loadGroups} style={{background:'#f5f0ea',border:'1px solid #ddd0ba',borderRadius:8,padding:'5px 10px',cursor:'pointer',fontSize:11,color:'#8b6e4e',fontWeight:600}}>🔄 새로고침</button>
                </div>

                {loadingGroups ? (
                  <p style={{color:'#a0784e',fontSize:13,textAlign:'center',padding:'20px 0'}}>불러오는 중...</p>
                ) : !groups || !groups.groups ? (
                  <div style={{textAlign:'center',padding:'24px 0',color:'#b8a090'}}>
                    <p style={{fontSize:32,marginBottom:8}}>⏳</p>
                    <p style={{fontSize:13,fontFamily:"'Gowun Batang',serif"}}>아직 조 편성이 없어요</p>
                    <p style={{fontSize:11,margin:'4px 0 0'}}>리더가 조 편성을 완료하면 여기에 표시돼요</p>
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
                            {isMyGroup&&<span style={{background:GROUP_COLORS[gi%GROUP_COLORS.length],color:'#fff',borderRadius:10,padding:'1px 8px',fontSize:10,fontWeight:700}}>내 조</span>}
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
      </div>
    </>
  )
}
