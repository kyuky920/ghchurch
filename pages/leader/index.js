import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'

const LEADER_SECRET = process.env.NEXT_PUBLIC_LEADER_SECRET || 'wordlife-leader-2025'

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

const S = {
  wrap:    { minHeight:'100vh', background:'#faf6f0', fontFamily:"'Noto Sans KR',sans-serif" },
  header:  { background:'linear-gradient(160deg,#e8dcc8,#d4c4a8)', padding:'20px 20px 0', borderBottom:'1px solid #c8b898' },
  sub:     { fontSize:10, color:'#8b6e4e', letterSpacing:'0.2em', fontWeight:600, margin:'0 0 4px' },
  h1:      { fontFamily:"'Gowun Batang',serif", fontSize:20, color:'#4a3520', fontWeight:700, margin:'0 0 12px' },
  cont:    { maxWidth:640, margin:'0 auto', padding:'20px 16px 48px', display:'flex', flexDirection:'column', gap:16 },
  card:    { background:'#fff', borderRadius:14, padding:'18px', border:'1px solid #e8d8c0' },
  label:   { fontSize:12, color:'#8b6e4e', fontWeight:700, display:'block', marginBottom:6 },
  input:   { width:'100%', padding:'11px 14px', border:'1.5px solid #ddd0ba', borderRadius:10, fontSize:14, background:'#faf7f4', color:'#4a3520', outline:'none', lineHeight:1.75, fontFamily:"'Noto Sans KR',sans-serif" },
  opt:     { color:'#bbb', fontWeight:400 },
  btn:     { width:'100%', background:'linear-gradient(135deg,#a0784e,#c4956a)', color:'#fff', border:'none', borderRadius:12, padding:'14px', fontSize:15, fontFamily:"'Gowun Batang',serif", fontWeight:700, cursor:'pointer', boxShadow:'0 4px 16px rgba(160,120,78,0.3)' },
  btnDark: { width:'100%', background:'linear-gradient(135deg,#4a3520,#7a5c38)', color:'#fff', border:'none', borderRadius:12, padding:'14px', fontSize:15, fontFamily:"'Gowun Batang',serif", fontWeight:700, cursor:'pointer' },
  btnGray: { width:'100%', background:'#c4a882', color:'#fff', border:'none', borderRadius:12, padding:'14px', fontSize:14, cursor:'not-allowed' },
  btnSm:   { background:'#f5f0ea', border:'1px solid #ddd0ba', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:12, color:'#8b6e4e', fontWeight:600 },
  err:     { color:'#c0392b', fontSize:12 },
  ok:      { color:'#2e7d32', fontSize:12, fontWeight:600 },
}

function StatusBadge({ status }) {
  const map = {
    pending:    { label:'⏳ 생성 대기중', bg:'#fff8e1', color:'#f57f17' },
    processing: { label:'⚙️ AI 생성중...', bg:'#e3f2fd', color:'#1565c0' },
    done:       { label:'✅ 완료',         bg:'#e8f5e9', color:'#2e7d32' },
    error:      { label:'❌ 오류',          bg:'#ffebee', color:'#c62828' },
  }
  const m = map[status] || map.pending
  return <span style={{ background:m.bg, color:m.color, borderRadius:20, padding:'3px 12px', fontSize:12, fontWeight:700 }}>{m.label}</span>
}

// ── 탭1: 말씀 자료 ────────────────────────────────────
function SermonTab() {
  const [screen, setScreen]     = useState('list')
  const [sermons, setSermons]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [editData, setEditData] = useState(null)
  const [week, setWeek]         = useState(getWeekStr())
  const [service, setService]   = useState('morning')
  const [reference, setRef]     = useState('')
  const [passage, setPassage]   = useState('')
  const [sTitle, setSTitle]     = useState('')
  const [sPoints, setSPoints]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState('')
  const [errMsg, setErrMsg]     = useState('')
  const pollRef = useRef(null)

  useEffect(() => { loadAll() }, [])
  useEffect(() => {
    const hasPending = sermons.some(s => s.status === 'pending' || s.status === 'processing')
    if (hasPending && !pollRef.current) pollRef.current = setInterval(() => loadAll(), 4000)
    if (!hasPending && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [sermons])

  async function loadAll() {
    try {
      const res = await fetch('/api/sermons/all')
      const d = await res.json()
      if (d.ok) setSermons(d.data || [])
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  function openNew() {
    setEditData(null); setWeek(getWeekStr()); setService('morning')
    setRef(''); setPassage(''); setSTitle(''); setSPoints('')
    setSaveMsg(''); setErrMsg(''); setScreen('editor')
  }
  function openEdit(s) {
    setEditData(s); setWeek(s.week); setService(s.service)
    setRef(s.reference); setPassage(s.passage||'')
    setSTitle(s.sermon_title||''); setSPoints(s.sermon_points||'')
    setSaveMsg(''); setErrMsg(''); setScreen('editor')
  }

  async function handleSave() {
    if (!reference.trim()||!passage.trim()) { setErrMsg('성경 구절과 본문을 입력해주세요.'); return }
    setSaving(true); setErrMsg(''); setSaveMsg('')
    try {
      const res = await fetch('/api/sermons', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${LEADER_SECRET}` },
        body: JSON.stringify({ week, service, reference, sermon_title:sTitle, passage, sermon_points:sPoints })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setSaveMsg('저장 완료! n8n이 곧 나눔 자료를 생성해요.')
      await loadAll()
      setTimeout(() => { setSaveMsg(''); setScreen('list') }, 2000)
    } catch(e) { setErrMsg('저장 오류: ' + e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!window.confirm('삭제하시겠어요?')) return
    try {
      await fetch(`/api/sermons/${id}`, { method:'DELETE', headers:{ 'Authorization':`Bearer ${LEADER_SECRET}` } })
      await loadAll()
    } catch(e) { alert('삭제 실패: '+e.message) }
  }

  const weeks = Array.from({length:10},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()+(1-i)*7); return getWeekStr(d) })
  const grouped = sermons.reduce((acc,s)=>{ if(!acc[s.week]) acc[s.week]=[]; acc[s.week].push(s); return acc },{})

  if (screen === 'editor') return (
    <div style={S.cont}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:4}}>
        <button onClick={()=>setScreen('list')} style={{background:'rgba(139,110,78,0.15)',border:'none',borderRadius:8,width:32,height:32,cursor:'pointer',color:'#8b6e4e',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}}>←</button>
        <h2 style={{fontFamily:"'Gowun Batang',serif",fontSize:17,color:'#4a3520',fontWeight:700,margin:0}}>{editData?'말씀 자료 수정':'새 말씀 자료 등록'}</h2>
      </div>
      <div style={{background:'#fdf5ec',borderRadius:12,padding:'12px 16px',border:'1px solid #e8c9a0'}}>
        <p style={{fontSize:12,color:'#8b6e4e',margin:0,lineHeight:1.7}}>📌 저장하면 <strong>n8n이 자동으로 나눔 자료를 생성</strong>해요.</p>
      </div>
      <div style={S.card}>
        <p style={{fontSize:13,color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,marginBottom:14}}>예배 정보</p>
        <div style={{display:'flex',gap:8,marginBottom:14}}>
          {['morning','afternoon'].map(sv=>(
            <button key={sv} onClick={()=>setService(sv)} style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${service===sv?(sv==='morning'?'#f6a623':'#7a6e9e'):'#e8dcc8'}`,background:service===sv?(sv==='morning'?'#fff8ec':'#f5f3fa'):'#fff',cursor:'pointer',fontSize:13,fontWeight:700,color:service===sv?(sv==='morning'?'#e8901a':'#5a5080'):'#b8a090',fontFamily:"'Noto Sans KR',sans-serif"}}>
              {sv==='morning'?'☀️ 주일 오전':'🌙 주일 오후'}
            </button>
          ))}
        </div>
        <label style={S.label}>주차</label>
        <select value={week} onChange={e=>setWeek(e.target.value)} style={{...S.input,cursor:'pointer'}}>
          {weeks.map(w=><option key={w} value={w}>{weekLabel(w)} ({w})</option>)}
        </select>
      </div>
      <div style={S.card}>
        <p style={{fontSize:13,color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,marginBottom:14}}>말씀 입력</p>
        <div style={{marginBottom:12}}>
          <label style={S.label}>성경 구절 *</label>
          <input value={reference} onChange={e=>setRef(e.target.value)} placeholder="예) 사사기 17:1-6" style={S.input}/>
        </div>
        <div style={{marginBottom:12}}>
          <label style={S.label}>설교 제목 <span style={S.opt}>(선택)</span></label>
          <input value={sTitle} onChange={e=>setSTitle(e.target.value)} placeholder="예) 자기 소견에 옳은 대로" style={S.input}/>
        </div>
        <div style={{marginBottom:12}}>
          <label style={S.label}>말씀 본문 (개역개정) *</label>
          <textarea value={passage} onChange={e=>setPassage(e.target.value)} placeholder="성경 앱에서 개역개정 본문을 복사해서 붙여넣어 주세요." style={{...S.input,minHeight:140,resize:'vertical'}}/>
        </div>
        <div>
          <label style={S.label}>설교 요지 <span style={S.opt}>(선택)</span></label>
          <textarea value={sPoints} onChange={e=>setSPoints(e.target.value)} placeholder={"예)\n1. 왕이 없는 시대의 혼란\n  1) 각자 소견대로 행함"} style={{...S.input,minHeight:80,resize:'vertical'}}/>
        </div>
      </div>
      {errMsg&&<p style={S.err}>⚠ {errMsg}</p>}
      {saveMsg&&<p style={S.ok}>✓ {saveMsg}</p>}
      <button onClick={handleSave} disabled={saving} style={saving?S.btnGray:S.btnDark}>
        {saving?'저장 중...':'💾 저장하기 (n8n이 자동 생성)'}
      </button>
    </div>
  )

  return (
    <div style={S.cont}>
      <button onClick={openNew} style={S.btn}>✦ 새 말씀 자료 등록하기</button>
      {loading ? (
        <div style={{textAlign:'center',padding:40}}>
          <div style={{width:28,height:28,borderRadius:'50%',border:'2.5px solid #e8dcc8',borderTop:'2.5px solid #a0784e',animation:'spin 0.8s linear infinite',margin:'0 auto 12px'}}/>
          <p style={{color:'#a0784e',fontSize:13}}>불러오는 중...</p>
        </div>
      ) : Object.keys(grouped).length===0 ? (
        <div style={{textAlign:'center',padding:'48px 20px',color:'#b8a090'}}>
          <p style={{fontSize:40,marginBottom:12}}>📖</p>
          <p style={{fontFamily:"'Gowun Batang',serif",fontSize:15}}>아직 등록된 말씀이 없어요</p>
        </div>
      ) : Object.entries(grouped).map(([wk,items])=>(
        <div key={wk}>
          <div style={{display:'flex',alignItems:'center',gap:10,margin:'8px 0 10px'}}>
            <div style={{height:1,flex:1,background:'#e8dcc8'}}/>
            <span style={{fontSize:11,color:'#a08060',fontWeight:700}}>{weekLabel(wk)}</span>
            <div style={{height:1,flex:1,background:'#e8dcc8'}}/>
          </div>
          {items.map(s=>(
            <div key={s.id} style={{...S.card,marginBottom:10,animation:'fadeUp 0.3s ease'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{background:s.service==='morning'?'linear-gradient(135deg,#f6a623,#e8901a)':'linear-gradient(135deg,#7a6e9e,#5a5080)',borderRadius:6,padding:'3px 10px',color:'#fff',fontSize:11,fontWeight:700}}>
                    {s.service==='morning'?'☀️ 오전':'🌙 오후'}
                  </span>
                  <StatusBadge status={s.status}/>
                </div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>openEdit(s)} style={S.btnSm}>수정</button>
                  <button onClick={()=>handleDelete(s.id)} style={{...S.btnSm,background:'#fff5f5',border:'1px solid #f5c6bb',color:'#c0392b'}}>삭제</button>
                </div>
              </div>
              <p style={{fontFamily:"'Gowun Batang',serif",fontSize:15,color:'#4a3520',fontWeight:700,margin:'0 0 2px'}}>{s.reference}</p>
              {s.sermon_title&&<p style={{fontSize:12,color:'#8b6e4e',margin:0}}>{s.sermon_title}</p>}
              {s.status==='error'&&s.error_msg&&<p style={{fontSize:11,color:'#c62828',margin:'4px 0 0'}}>{s.error_msg}</p>}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── 탭2: 셀 조 편성 ──────────────────────────────────
function CellTab() {
  const [members, setMembers]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [groupCount, setGroupCount]   = useState(3)
  const [week, setWeek]               = useState(getWeekStr())
  const [service, setService]         = useState('morning')
  const [groups, setGroups]           = useState([])
  const [saving, setSaving]           = useState(false)
  const [saveMsg, setSaveMsg]         = useState('')
  const [errMsg, setErrMsg]           = useState('')

  const weeks = Array.from({length:5},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()+(1-i)*7); return getWeekStr(d) })

  useEffect(() => { loadData() }, [week, service])

  async function loadData() {
    setLoading(true)
    try {
      const [mRes, gRes] = await Promise.all([
        fetch(`/api/members?week=${week}&service=${service}`),
        fetch(`/api/cell-groups?week=${week}&service=${service}`)
      ])
      const mData = await mRes.json()
      const gData = await gRes.json()
      if (mData.ok) setMembers(mData.data || [])
      if (gData.ok && gData.data) setGroups(gData.data.groups || [])
      else setGroups([])
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  function handleRandom() {
    if (members.length === 0) { setErrMsg('접속 중인 멤버가 없어요.'); return }
    setErrMsg('')
    const shuffled = [...members].sort(() => Math.random() - 0.5)
    const result = Array.from({length:groupCount},(_,i)=>({ group_no:i+1, name:`${i+1}조`, members:[] }))
    shuffled.forEach((m,i) => { result[i%groupCount].members.push({name:m.name, device_id:m.device_id}) })
    setGroups(result)
  }

  function handleManualInit() {
    setErrMsg('')
    setGroups(Array.from({length:groupCount},(_,i)=>({ group_no:i+1, name:`${i+1}조`, members:[] })))
  }

  function moveMember(member, fromGroupNo, toGroupNo) {
    setGroups(prev => prev.map(g => {
      if (g.group_no === fromGroupNo) return {...g, members:g.members.filter(m=>m.device_id!==member.device_id)}
      if (g.group_no === toGroupNo)   return {...g, members:[...g.members, member]}
      return g
    }))
  }

  function addToGroup(member, toGroupNo) {
    setGroups(prev => prev.map(g => {
      if (g.group_no === toGroupNo) return {...g, members:[...g.members, {name:member.name, device_id:member.device_id}]}
      return g
    }))
  }

  const assignedIds = groups.flatMap(g=>g.members.map(m=>m.device_id))
  const unassigned  = members.filter(m=>!assignedIds.includes(m.device_id))

  async function handleSave() {
    setSaving(true); setErrMsg(''); setSaveMsg('')
    try {
      const res = await fetch('/api/cell-groups', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${LEADER_SECRET}` },
        body: JSON.stringify({ week, service, groups })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setSaveMsg('조 편성이 저장됐어요!')
      setTimeout(()=>setSaveMsg(''), 2500)
    } catch(e) { setErrMsg('저장 오류: '+e.message) }
    finally { setSaving(false) }
  }

  const GROUP_COLORS = ['#a0784e','#7a9e7e','#7a6e9e','#c4956a','#c0392b','#1565c0','#2e7d32','#6d4c41','#00838f','#558b2f']

  return (
    <div style={S.cont}>
      {/* 설정 */}
      <div style={S.card}>
        <p style={{fontSize:13,color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,marginBottom:12}}>조 편성 설정</p>
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          {['morning','afternoon'].map(sv=>(
            <button key={sv} onClick={()=>setService(sv)} style={{flex:1,padding:'9px',borderRadius:10,border:`2px solid ${service===sv?(sv==='morning'?'#f6a623':'#7a6e9e'):'#e8dcc8'}`,background:service===sv?(sv==='morning'?'#fff8ec':'#f5f3fa'):'#fff',cursor:'pointer',fontSize:12,fontWeight:700,color:service===sv?(sv==='morning'?'#e8901a':'#5a5080'):'#b8a090'}}>
              {sv==='morning'?'☀️ 주일 오전':'🌙 주일 오후'}
            </button>
          ))}
        </div>
        <div style={{marginBottom:12}}>
          <label style={S.label}>주차</label>
          <select value={week} onChange={e=>setWeek(e.target.value)} style={{...S.input,cursor:'pointer'}}>
            {weeks.map(w=><option key={w} value={w}>{weekLabel(w)} ({w})</option>)}
          </select>
        </div>
        <label style={S.label}>조 수</label>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <button onClick={()=>setGroupCount(c=>Math.max(1,c-1))} style={{width:36,height:36,borderRadius:8,border:'1.5px solid #ddd0ba',background:'#fff',cursor:'pointer',fontSize:20,color:'#8b6e4e',display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
          <span style={{fontSize:20,fontWeight:700,color:'#4a3520',minWidth:40,textAlign:'center'}}>{groupCount}조</span>
          <button onClick={()=>setGroupCount(c=>Math.min(10,c+1))} style={{width:36,height:36,borderRadius:8,border:'1.5px solid #ddd0ba',background:'#fff',cursor:'pointer',fontSize:20,color:'#8b6e4e',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
        </div>
      </div>

      {/* 접속 중인 멤버 */}
      <div style={S.card}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <p style={{fontSize:13,color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,margin:0}}>
            접속 중인 청년 <span style={{color:'#a0784e'}}>({members.length}명)</span>
          </p>
          <button onClick={loadData} style={S.btnSm}>🔄 새로고침</button>
        </div>
        {loading ? (
          <p style={{color:'#a0784e',fontSize:13,textAlign:'center',padding:'12px 0'}}>불러오는 중...</p>
        ) : members.length===0 ? (
          <p style={{color:'#b8a090',fontSize:13,textAlign:'center',padding:'12px 0'}}>접속한 청년이 없어요</p>
        ) : (
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {members.map(m=>(
              <span key={m.device_id} style={{background:'#fdf5ec',border:'1px solid #e8c9a0',borderRadius:20,padding:'5px 14px',fontSize:13,color:'#8b6e4e',fontWeight:600}}>
                {m.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 편성 버튼 */}
      <div style={{display:'flex',gap:10}}>
        <button onClick={handleRandom} style={{...S.btn,flex:1,padding:'12px'}}>🎲 랜덤 편성</button>
        <button onClick={handleManualInit} style={{...S.btnDark,flex:1,padding:'12px',fontSize:13}}>✏️ 수동 편성</button>
      </div>

      {/* 미배정 멤버 */}
      {groups.length>0 && unassigned.length>0 && (
        <div style={{background:'#fff8e1',borderRadius:12,padding:'14px 16px',border:'1px solid #ffe082'}}>
          <p style={{fontSize:12,color:'#f57f17',fontWeight:700,margin:'0 0 10px'}}>⚠ 미배정 멤버 ({unassigned.length}명) — 조를 선택해서 배정하세요</p>
          <div style={{display:'flex',flexWrap:'wrap',gap:10}}>
            {unassigned.map(m=>(
              <div key={m.device_id} style={{display:'flex',alignItems:'center',gap:6,background:'#fff',borderRadius:10,padding:'6px 10px',border:'1px solid #ffe082'}}>
                <span style={{fontSize:13,color:'#4a3520',fontWeight:600}}>{m.name}</span>
                <select onChange={e=>{ if(e.target.value){ addToGroup(m,Number(e.target.value)); e.target.value='' } }}
                  style={{fontSize:11,padding:'3px 6px',border:'1px solid #ddd0ba',borderRadius:6,color:'#8b6e4e',cursor:'pointer',background:'#fdf5ec'}}>
                  <option value="">→ 배정</option>
                  {groups.map(g=><option key={g.group_no} value={g.group_no}>{g.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 조 편성 결과 */}
      {groups.length>0 && (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{height:1,flex:1,background:'#e8dcc8'}}/>
            <span style={{fontSize:11,color:'#a08060',fontWeight:700}}>조 편성 결과</span>
            <div style={{height:1,flex:1,background:'#e8dcc8'}}/>
          </div>
          {groups.map((g,gi)=>(
            <div key={g.group_no} style={{...S.card,borderLeft:`4px solid ${GROUP_COLORS[gi%GROUP_COLORS.length]}`}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:GROUP_COLORS[gi%GROUP_COLORS.length]}}/>
                  <input value={g.name}
                    onChange={e=>setGroups(prev=>prev.map(pg=>pg.group_no===g.group_no?{...pg,name:e.target.value}:pg))}
                    style={{fontSize:15,fontWeight:700,color:'#4a3520',border:'none',background:'transparent',outline:'none',fontFamily:"'Gowun Batang',serif",width:80}}/>
                  <span style={{fontSize:12,color:'#a08060'}}>({g.members.length}명)</span>
                </div>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                {g.members.length===0
                  ? <p style={{fontSize:12,color:'#b8a090',margin:0,fontStyle:'italic'}}>비어있어요</p>
                  : g.members.map(m=>(
                    <div key={m.device_id} style={{display:'flex',alignItems:'center',gap:4,background:`${GROUP_COLORS[gi%GROUP_COLORS.length]}15`,borderRadius:20,padding:'5px 6px 5px 12px',border:`1px solid ${GROUP_COLORS[gi%GROUP_COLORS.length]}40`}}>
                      <span style={{fontSize:13,color:'#4a3520',fontWeight:600}}>{m.name}</span>
                      <select onChange={e=>{ if(e.target.value){ moveMember(m,g.group_no,Number(e.target.value)); e.target.value='' } }}
                        style={{fontSize:11,padding:'2px 4px',border:'none',background:'transparent',color:GROUP_COLORS[gi%GROUP_COLORS.length],cursor:'pointer'}}>
                        <option value="">↔</option>
                        {groups.filter(og=>og.group_no!==g.group_no).map(og=><option key={og.group_no} value={og.group_no}>→ {og.name}</option>)}
                      </select>
                    </div>
                  ))
                }
              </div>
            </div>
          ))}
        </div>
      )}

      {errMsg&&<p style={S.err}>⚠ {errMsg}</p>}
      {saveMsg&&<p style={S.ok}>✓ {saveMsg}</p>}

      {groups.length>0 && (
        <button onClick={handleSave} disabled={saving} style={saving?S.btnGray:S.btnDark}>
          {saving?'저장 중...':'💾 조 편성 저장 및 공개'}
        </button>
      )}
    </div>
  )
}

// ── 메인 ─────────────────────────────────────────────
export default function Leader() {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <>
      <Head>
        <title>리더 도구 · WORD &amp; LIFE</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <style>{`
          *{box-sizing:border-box;}
          input:focus,textarea:focus,select:focus{border-color:#a0784e!important;outline:none;}
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        `}</style>
      </Head>
      <div style={S.wrap}>
        <div style={S.header}>
          <p style={S.sub}>WORD &amp; LIFE · 리더 도구</p>
          <h1 style={S.h1}>리더 도구</h1>
          <div style={{display:'flex'}}>
            {['📖 말씀 자료','👥 셀 조 편성'].map((t,i)=>(
              <button key={i} onClick={()=>setActiveTab(i)} style={{flex:1,padding:'12px 8px',border:'none',background:'none',fontSize:13,fontFamily:"'Gowun Batang',serif",color:activeTab===i?'#4a3520':'#a08060',fontWeight:activeTab===i?700:400,borderBottom:activeTab===i?'2.5px solid #a0784e':'2.5px solid transparent',cursor:'pointer',transition:'all 0.2s'}}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {activeTab===0 && <SermonTab/>}
        {activeTab===1 && <CellTab/>}
      </div>
    </>
  )
}
