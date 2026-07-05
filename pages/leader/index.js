import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import FontScaleControl from '../../components/FontScaleControl'
import { fontSizePx, useFontScale } from '../../hooks/useFontScale'

const LEADER_SECRET = process.env.NEXT_PUBLIC_LEADER_SECRET || 'wordlife-leader-2025'

function getWeekStr(date) {
  const d = new Date(date || new Date())
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay()) // 해당 주 일요일로
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
function weekLabel(week) {
  if (!week) return ''
  // YYYY-MM-DD 형식
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    const [, m, d] = week.split('-').map(Number)
    return `${m}월 ${d}일 주`
  }
  // 구형식 YYYY-Www → ISO week 계산
  if (/^\d{4}-W\d{2}$/.test(week)) {
    const [y, w] = week.split('-W').map(Number)
    const jan4 = new Date(y, 0, 4)
    const sun = new Date(jan4)
    sun.setDate(jan4.getDate() - jan4.getDay() + (w - 1) * 7)
    return `${sun.getMonth() + 1}월 ${sun.getDate()}일 주`
  }
  const d = new Date(week + 'T00:00:00')
  if (isNaN(d.getTime())) return week
  return `${d.getMonth() + 1}월 ${d.getDate()}일 주`
}
function weekToComparableDate(week) {
  if (!week) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) return week
  if (/^\d{4}-W\d{2}$/.test(week)) {
    const [y, w] = week.split('-W').map(Number)
    const jan4 = new Date(y, 0, 4)
    const sun = new Date(jan4)
    sun.setDate(jan4.getDate() - jan4.getDay() + (w - 1) * 7)
    return `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`
  }
  return week
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
function getLastSeenLabel(lastSeenValue) {
  const lastSeen = lastSeenValue ? new Date(lastSeenValue) : null
  const diffMin = lastSeen ? Math.floor((Date.now()-lastSeen.getTime())/60000) : null
  if (diffMin === null) return ''
  if (diffMin < 1) return '방금 전'
  if (diffMin < 60) return `${diffMin}분 전`
  if (diffMin < 1440) return `${Math.floor(diffMin/60)}시간 전`
  return `${Math.floor(diffMin/1440)}일 전`
}

const TREE_GROUP_NAMES = [
  '감람나무',
  '백향목',
  '무화과나무',
  '포도나무',
  '종려나무',
  '살구나무',
  '떡갈나무',
  '향나무',
  '버드나무',
  '대추나무',
  '소나무',
  '전나무',
  '주목',
  '동백나무',
  '매화나무',
  '벚나무',
  '단풍나무',
  '이팝나무',
  '은행나무',
  '느티나무',
  '회화나무',
  '배롱나무',
  '복숭아나무',
  '자두나무',
  '사과나무',
  '배나무',
  '모과나무',
  '감나무',
  '석류나무',
  '유자나무',
  '귤나무',
  '레몬나무',
  '자몽나무',
  '밤나무',
  '호두나무',
  '오동나무',
  '플라타너스',
  '메타세쿼이아',
  '자작나무',
  '박태기나무',
  '산수유나무',
  '목련나무',
  '산딸나무',
  '개나리나무',
  '철쭉나무',
  '진달래나무',
  '치자나무',
  '금목서',
  '은목서',
  '후박나무',
  '사철나무',
  '비자나무',
  '편백나무',
  '삼나무',
  '가문비나무',
  '구상나무',
  '히말라야시다',
  '아카시아나무',
  '서어나무',
  '팽나무',
  '산벚나무',
  '쪽동백나무',
  '산사나무',
  '마가목',
  '돈나무',
  '황칠나무',
  '보리수나무',
  '산초나무',
  '구기자나무',
  '찔레나무',
  '해당화나무',
]

function shuffle(array) {
  const copy = [...array]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function buildRandomGroupNames(count) {
  const shuffled = shuffle(TREE_GROUP_NAMES)
  return Array.from({ length: count }, (_, index) => {
    const base = shuffled[index % shuffled.length]
    const round = Math.floor(index / shuffled.length)
    const name = round === 0 ? base : `${base} ${round + 1}`
    return `${index + 1}조 - ${name}`
  })
}

function formatGroupName(group) {
  if (!group) return ''
  const groupNo = typeof group === 'object' ? group.group_no : null
  const name = typeof group === 'object' ? group.name : group
  if (!name) return groupNo ? `${groupNo}조` : ''
  if (name.includes('조 - ')) return name
  return groupNo ? `${groupNo}조 - ${name}` : name
}

const S = {
  wrap:    { minHeight:'100vh', background:'#faf6f0', fontFamily:"'Noto Sans KR',sans-serif" },
  header:  { background:'linear-gradient(160deg,#e8dcc8,#d4c4a8)', padding:'20px 20px 0', borderBottom:'1px solid #c8b898' },
  sub:     { fontSize:fontSizePx(10), color:'#8b6e4e', letterSpacing:'0.2em', fontWeight:600, margin:'0 0 4px' },
  h1:      { fontFamily:"'Gowun Batang',serif", fontSize:fontSizePx(20), color:'#4a3520', fontWeight:700, margin:'0 0 12px' },
  cont:    { maxWidth:640, margin:'0 auto', padding:'20px 16px 48px', display:'flex', flexDirection:'column', gap:16 },
  card:    { background:'#fff', borderRadius:14, padding:'18px', border:'1px solid #e8d8c0' },
  label:   { fontSize:fontSizePx(12), color:'#8b6e4e', fontWeight:700, display:'block', marginBottom:6 },
  input:   { width:'100%', padding:'11px 14px', border:'1.5px solid #ddd0ba', borderRadius:10, fontSize:fontSizePx(14), background:'#faf7f4', color:'#4a3520', outline:'none', lineHeight:1.75, fontFamily:"'Noto Sans KR',sans-serif" },
  opt:     { color:'#bbb', fontWeight:400 },
  btn:     { width:'100%', background:'linear-gradient(135deg,#a0784e,#c4956a)', color:'#fff', border:'none', borderRadius:12, padding:'14px', fontSize:fontSizePx(15), fontFamily:"'Gowun Batang',serif", fontWeight:700, cursor:'pointer', boxShadow:'0 4px 16px rgba(160,120,78,0.3)' },
  btnDark: { width:'100%', background:'linear-gradient(135deg,#4a3520,#7a5c38)', color:'#fff', border:'none', borderRadius:12, padding:'14px', fontSize:fontSizePx(15), fontFamily:"'Gowun Batang',serif", fontWeight:700, cursor:'pointer' },
  btnGray: { width:'100%', background:'#7a5f3a', color:'#fff', border:'none', borderRadius:12, padding:'14px', fontSize:fontSizePx(14), cursor:'not-allowed' },
  btnSm:   { background:'#f5f0ea', border:'1px solid #ddd0ba', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:fontSizePx(12), color:'#8b6e4e', fontWeight:600 },
  err:     { color:'#c0392b', fontSize:fontSizePx(12) },
  ok:      { color:'#2e7d32', fontSize:fontSizePx(12), fontWeight:600 },
}

function StatusBadge({ status }) {
  const map = {
    pending:    { label:'⏳ 생성 대기중', bg:'#fff8e1', color:'#f57f17' },
    processing: { label:'⚙️ AI 생성중...', bg:'#e3f2fd', color:'#1565c0' },
    done:       { label:'✅ 완료',         bg:'#e8f5e9', color:'#2e7d32' },
    error:      { label:'❌ 오류',          bg:'#ffebee', color:'#c62828' },
  }
  const m = map[status] || map.pending
  return <span style={{ background:m.bg, color:m.color, borderRadius:20, padding:'3px 12px', fontSize:fontSizePx(12), fontWeight:700 }}>{m.label}</span>
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
  const [sOutline, setSOutline] = useState('')
  const [sSummaryInput, setSSummaryInput] = useState('')
  const [sTranscript, setSTranscript] = useState('')
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState('')
  const [errMsg, setErrMsg]     = useState('')
  const pollRef = useRef(null)
  const [resultForm, setResultForm] = useState({
    sermon_title: '',
    sermon_summary: { key_point:'', overview:'', sections:[] },
    questions: [],
    meditations: [],
    card_verse: '',
  })
  const [resultSaving, setResultSaving] = useState(false)
  const [resultMsg, setResultMsg] = useState('')
  const [resultErr, setResultErr] = useState('')

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

  function parseSourceMaterials(rawPoints) {
    const defaults = { outline: '', summary: '', transcript: '', legacy_points: '' }
    if (!rawPoints || typeof rawPoints !== 'string') return defaults
    try {
      const parsed = JSON.parse(rawPoints)
      if (parsed && typeof parsed === 'object' && (parsed.outline !== undefined || parsed.summary !== undefined || parsed.transcript !== undefined)) {
        return {
          outline: parsed.outline || '',
          summary: parsed.summary || '',
          transcript: parsed.transcript || '',
          legacy_points: parsed.legacy_points || '',
        }
      }
      return { ...defaults, legacy_points: rawPoints }
    } catch (e) {
      return { ...defaults, legacy_points: rawPoints }
    }
  }

  function openNew() {
    setEditData(null); setWeek(getWeekStr()); setService('morning')
    setRef(''); setPassage(''); setSTitle(''); setSPoints('')
    setSOutline(''); setSSummaryInput(''); setSTranscript('')
    setSaveMsg(''); setErrMsg(''); setScreen('editor')
  }
  function openEdit(s) {
    const source = parseSourceMaterials(s.sermon_points || '')
    setEditData(s); setWeek(s.week); setService(s.service)
    setRef(s.reference); setPassage(s.passage||'')
    setSTitle(s.sermon_title||''); setSPoints(source.legacy_points || s.sermon_points || '')
    setSOutline(source.outline || '')
    setSSummaryInput(source.summary || '')
    setSTranscript(source.transcript || '')
    setSaveMsg(''); setErrMsg(''); setScreen('editor')
  }

  function parseArrayField(val) {
    if (!val) return []
    if (Array.isArray(val)) return val
    if (typeof val === 'object') return val
    try { return JSON.parse(val) } catch(e) { return [] }
  }

  function normalizeQuestionsForEdit(value) {
    const toItem = (q, options = {}) => {
      const sectionTitle = options.sectionTitle || ''
      const flowStage = options.flowStage || ''
      if (typeof q === 'string') return { section_title: sectionTitle, category: '', explanation: '', question: q, flow_stage: flowStage }
      return {
        section_title: q?.section_title || sectionTitle || '',
        category: q?.category || q?.type || '',
        explanation: q?.explanation || q?.context || '',
        question: q?.question || q?.text || q?.content || '',
        flow_stage: q?.flow_stage || q?.flowStage || q?.group_title || q?.groupTitle || flowStage || '',
      }
    }
    if (Array.isArray(value)) return value.map((q) => toItem(q)).filter((q) => q.question)
    if (value && typeof value === 'object') {
      const groups = Array.isArray(value.groups) ? value.groups : []
      const groupedList = groups.flatMap((group) => {
        const flowStage = group?.flow_stage || group?.flowStage || group?.title || group?.group_title || ''
        const questions = Array.isArray(group?.questions) ? group.questions : []
        return questions.map((q) => toItem(q, { flowStage }))
      })
      if (groupedList.length) return groupedList.filter((q) => q.question)

      const sections = Array.isArray(value.sections) ? value.sections : []
      const list = sections.flatMap((s) => {
        const title = s?.section_title || s?.title || s?.topic || ''
        const flowStage = s?.flow_stage || s?.flowStage || s?.group_title || s?.groupTitle || ''
        const questions = Array.isArray(s?.questions) ? s.questions : []
        return questions.map((q) => toItem(q, { sectionTitle: title, flowStage }))
      })
      return list.filter((q) => q.question)
    }
    return []
  }

  function parseSummaryField(val) {
    if (!val) return { key_point:'', overview:'', sections:[] }
    if (typeof val === 'object') {
      return {
        key_point: val.key_point || '',
        overview: val.overview || '',
        sections: Array.isArray(val.sections) ? val.sections : [],
      }
    }
    try {
      const parsed = JSON.parse(val)
      return {
        key_point: parsed.key_point || '',
        overview: parsed.overview || '',
        sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      }
    } catch(e) {
      return { key_point:'', overview:'', sections:[] }
    }
  }

  function openResultEdit(s) {
    setEditData(s)
    setResultForm({
      sermon_title: s.sermon_title || '',
      sermon_summary: parseSummaryField(s.sermon_summary),
      questions: normalizeQuestionsForEdit(parseArrayField(s.questions)),
      meditations: parseArrayField(s.meditations),
      card_verse: s.card_verse || '',
    })
    setResultMsg('')
    setResultErr('')
    setScreen('result')
  }

  async function handleSave() {
    if (!reference.trim()||!passage.trim()) { setErrMsg('성경 구절과 본문을 입력해주세요.'); return }
    setSaving(true); setErrMsg(''); setSaveMsg('')
    try {
      const sourcePayload = {
        outline: sOutline || '',
        summary: sSummaryInput || '',
        transcript: sTranscript || '',
        legacy_points: sPoints || '',
      }
      const res = await fetch('/api/sermons', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${LEADER_SECRET}` },
        body: JSON.stringify({ week, service, reference, sermon_title:sTitle, passage, sermon_points: JSON.stringify(sourcePayload) })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setSaveMsg('저장 완료! 곧 나눔 자료가 다시 생성될 수 있어요.')
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

  async function handleResultSave() {
    if (!editData?.id) return
    setResultSaving(true)
    setResultMsg('')
    setResultErr('')
    try {
      const res = await fetch(`/api/sermons/${editData.id}`, {
        method: 'PATCH',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${LEADER_SECRET}` },
        body: JSON.stringify(resultForm)
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setResultMsg('생성된 나눔자료를 수정했어요.')
      await loadAll()
      setTimeout(() => {
        setResultMsg('')
        setScreen('list')
      }, 1200)
    } catch(e) { setResultErr('저장 오류: ' + e.message) }
    finally { setResultSaving(false) }
  }

  const weeks = Array.from({length:10},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()+(1-i)*7); return getWeekStr(d) })
  const sortedSermons = [...sermons].sort((a, b) => {
    const aWeek = weekToComparableDate(a?.week)
    const bWeek = weekToComparableDate(b?.week)
    if (aWeek && bWeek && aWeek !== bWeek) return bWeek.localeCompare(aWeek)
    if (a?.service !== b?.service) return a?.service === 'morning' ? -1 : 1
    const aTs = new Date(a?.created_at || 0).getTime()
    const bTs = new Date(b?.created_at || 0).getTime()
    if (bTs !== aTs) return bTs - aTs
    return (b?.id || 0) - (a?.id || 0)
  })
  const grouped = sortedSermons.reduce((acc,s)=>{ if(!acc[s.week]) acc[s.week]=[]; acc[s.week].push(s); return acc },{})

  if (screen === 'result') return (
    <div style={S.cont}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:4}}>
        <button onClick={()=>setScreen('list')} style={{background:'rgba(139,110,78,0.15)',border:'none',borderRadius:8,width:32,height:32,cursor:'pointer',color:'#8b6e4e',fontSize:fontSizePx(18),display:'flex',alignItems:'center',justifyContent:'center'}}>←</button>
        <h2 style={{fontFamily:"'Gowun Batang',serif",fontSize:fontSizePx(17),color:'#4a3520',fontWeight:700,margin:0}}>생성된 나눔자료 수정</h2>
      </div>
      <div style={{background:'#e8f5e9',borderRadius:12,padding:'12px 16px',border:'1px solid #a5d6a7'}}>
        <p style={{fontSize:fontSizePx(12),color:'#2e7d32',margin:0,lineHeight:1.7}}>📌 생성된 결과를 직접 수정하는 화면입니다. 원문 말씀을 바꾸고 다시 정리하려면 이전 화면의 말씀 자료 수정으로 돌아가세요.</p>
      </div>
      <div style={S.card}>
        <label style={S.label}>설교 제목</label>
        <input value={resultForm.sermon_title} onChange={e=>setResultForm(prev=>({...prev, sermon_title:e.target.value}))} style={S.input}/>
      </div>
      <div style={S.card}>
        <label style={S.label}>핵심 메시지</label>
        <textarea value={resultForm.sermon_summary.key_point || ''} onChange={e=>setResultForm(prev=>({...prev, sermon_summary:{...prev.sermon_summary, key_point:e.target.value}}))} style={{...S.input,minHeight:70,resize:'vertical'}}/>
        <label style={{...S.label,marginTop:12}}>전체 흐름</label>
        <textarea value={resultForm.sermon_summary.overview || ''} onChange={e=>setResultForm(prev=>({...prev, sermon_summary:{...prev.sermon_summary, overview:e.target.value}}))} style={{...S.input,minHeight:90,resize:'vertical'}}/>
        <label style={{...S.label,marginTop:12}}>단락별 요약</label>
        {(resultForm.sermon_summary.sections || []).length === 0 ? (
          <p style={{fontSize:fontSizePx(12),color:'#886c4f',margin:0,fontStyle:'italic'}}>등록된 단락 요약이 없어요.</p>
        ) : (
          (resultForm.sermon_summary.sections || []).map((sec, i) => (
            <div key={i} style={{marginTop:8,padding:'10px 12px',background:'#fdf5ec',borderRadius:10,border:'1px solid #e8c9a0'}}>
              <label style={S.label}>단락 {i + 1} 제목</label>
              <input
                value={sec?.title || ''}
                onChange={e=>setResultForm(prev=>({
                  ...prev,
                  sermon_summary: {
                    ...prev.sermon_summary,
                    sections: (prev.sermon_summary.sections || []).map((item, idx) => idx === i ? { ...(item || {}), title: e.target.value } : item)
                  }
                }))}
                style={{...S.input,marginBottom:6}}
              />
              <label style={S.label}>단락 {i + 1} 내용</label>
              <textarea
                value={sec?.content || ''}
                onChange={e=>setResultForm(prev=>({
                  ...prev,
                  sermon_summary: {
                    ...prev.sermon_summary,
                    sections: (prev.sermon_summary.sections || []).map((item, idx) => idx === i ? { ...(item || {}), content: e.target.value } : item)
                  }
                }))}
                style={{...S.input,minHeight:70,resize:'vertical'}}
              />
            </div>
          ))
        )}
      </div>
      <div style={S.card}>
        <p style={{fontSize:fontSizePx(13),color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,marginBottom:10}}>나눔 질문</p>
        {(resultForm.questions || []).map((item, i) => (
          <div key={i} style={{marginBottom:10,padding:'10px 12px',background:'#fdf5ec',borderRadius:10,border:'1px solid #e8c9a0'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
              <label style={{...S.label,marginBottom:0}}>질문 {i + 1}</label>
              <button
                onClick={()=>setResultForm(prev=>({...prev, questions: (prev.questions || []).filter((_, idx) => idx !== i)}))}
                style={{...S.btnSm,background:'#fff5f5',border:'1px solid #f5c6bb',color:'#c0392b',padding:'4px 10px'}}
              >
                질문 삭제
              </button>
            </div>
            <input value={item.flow_stage || ''} onChange={e=>setResultForm(prev=>({...prev, questions: prev.questions.map((q, idx) => idx === i ? { ...q, flow_stage: e.target.value } : q)}))} placeholder="흐름 단계 (예: 말씀을 점검합시다.)" style={{...S.input,marginBottom:6}}/>
            <input value={item.section_title || ''} onChange={e=>setResultForm(prev=>({...prev, questions: prev.questions.map((q, idx) => idx === i ? { ...q, section_title: e.target.value } : q)}))} placeholder="대지/주제" style={{...S.input,marginBottom:6}}/>
            <input value={item.category || ''} onChange={e=>setResultForm(prev=>({...prev, questions: prev.questions.map((q, idx) => idx === i ? { ...q, category: e.target.value } : q)}))} placeholder="카테고리(선택)" style={{...S.input,marginBottom:6}}/>
            <textarea value={item.explanation || ''} onChange={e=>setResultForm(prev=>({...prev, questions: prev.questions.map((q, idx) => idx === i ? { ...q, explanation: e.target.value } : q)}))} placeholder="필요한 경우에만 질문 의도/진행 가이드" style={{...S.input,minHeight:62,resize:'vertical',marginBottom:6}}/>
            <textarea value={item.question || ''} onChange={e=>setResultForm(prev=>({...prev, questions: prev.questions.map((q, idx) => idx === i ? { ...q, question: e.target.value } : q)}))} style={{...S.input,minHeight:70,resize:'vertical'}}/>
          </div>
        ))}
      </div>
      <div style={S.card}>
        <label style={S.label}>말씀카드 핵심 구절</label>
        <input value={resultForm.card_verse || ''} onChange={e=>setResultForm(prev=>({...prev, card_verse:e.target.value}))} style={S.input}/>
      </div>
      <div style={S.card}>
        <p style={{fontSize:fontSizePx(13),color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,marginBottom:10}}>주간 묵상</p>
        {(resultForm.meditations || []).map((item, i) => (
          <div key={i} style={{marginBottom:10,padding:'10px 12px',background:'#f5f3fa',borderRadius:10,border:'1px solid #ddd0f0'}}>
            <label style={S.label}>{item.day || `${i + 1}일차`}</label>
            <input value={item.focus || ''} onChange={e=>setResultForm(prev=>({...prev, meditations: prev.meditations.map((m, idx) => idx === i ? { ...m, focus: e.target.value } : m)}))} placeholder="묵상 구절" style={{...S.input,marginBottom:6}}/>
            <textarea value={item.message || ''} onChange={e=>setResultForm(prev=>({...prev, meditations: prev.meditations.map((m, idx) => idx === i ? { ...m, message: e.target.value } : m)}))} placeholder="묵상 메시지" style={{...S.input,minHeight:70,resize:'vertical'}}/>
          </div>
        ))}
      </div>
      {resultErr && <p style={S.err}>⚠ {resultErr}</p>}
      {resultMsg && <p style={S.ok}>✓ {resultMsg}</p>}
      <button onClick={handleResultSave} disabled={resultSaving} style={resultSaving ? S.btnGray : S.btnDark}>
        {resultSaving ? '저장 중...' : '💾 생성된 나눔자료 저장'}
      </button>
    </div>
  )

  if (screen === 'editor') return (
    <div style={S.cont}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:4}}>
        <button onClick={()=>setScreen('list')} style={{background:'rgba(139,110,78,0.15)',border:'none',borderRadius:8,width:32,height:32,cursor:'pointer',color:'#8b6e4e',fontSize:fontSizePx(18),display:'flex',alignItems:'center',justifyContent:'center'}}>←</button>
        <h2 style={{fontFamily:"'Gowun Batang',serif",fontSize:fontSizePx(17),color:'#4a3520',fontWeight:700,margin:0}}>{editData?'말씀 자료 수정 및 나눔자료 재생성':'새 말씀 자료 등록'}</h2>
      </div>
      <div style={{background:'#fdf5ec',borderRadius:12,padding:'12px 16px',border:'1px solid #e8c9a0'}}>
        <p style={{fontSize:fontSizePx(12),color:'#8b6e4e',margin:0,lineHeight:1.7}}>📌 저장하면 말씀 자료를 기준으로 나눔 자료를 다시 생성하거나, 기존 생성 결과를 새 기준에 맞게 갱신할 수 있어요.</p>
      </div>
      <div style={S.card}>
        <p style={{fontSize:fontSizePx(13),color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,marginBottom:14}}>예배 정보</p>
        <div style={{display:'flex',gap:8,marginBottom:14}}>
          {['morning','afternoon'].map(sv=>(
            <button key={sv} onClick={()=>setService(sv)} style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${service===sv?(sv==='morning'?'#f6a623':'#7a6e9e'):'#e8dcc8'}`,background:service===sv?(sv==='morning'?'#fff8ec':'#f5f3fa'):'#fff',cursor:'pointer',fontSize:fontSizePx(13),fontWeight:700,color:service===sv?(sv==='morning'?'#e8901a':'#5a5080'):'#886c4f',fontFamily:"'Noto Sans KR',sans-serif"}}>
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
        <p style={{fontSize:fontSizePx(13),color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,marginBottom:14}}>말씀 입력</p>
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
        <div style={{marginBottom:12}}>
          <label style={S.label}>설교 대지 <span style={S.opt}>(선택)</span></label>
          <textarea value={sOutline} onChange={e=>setSOutline(e.target.value)} placeholder={"예)\n1. 그리스도의 법을 성취함 (1-5)\n  1) 온유한 심령으로 바로 잡음\n  2) 각자 자기의 일을 살핌"} style={{...S.input,minHeight:96,resize:'vertical'}}/>
        </div>
        <div style={{marginBottom:12}}>
          <label style={S.label}>설교 요약 <span style={S.opt}>(선택)</span></label>
          <textarea value={sSummaryInput} onChange={e=>setSSummaryInput(e.target.value)} placeholder={"주요 주제 / 다음 할 일 / 단락별 요약 등을 입력하세요."} style={{...S.input,minHeight:120,resize:'vertical'}}/>
        </div>
        <div style={{marginBottom:12}}>
          <label style={S.label}>설교 원문 <span style={S.opt}>(선택)</span></label>
          <textarea value={sTranscript} onChange={e=>setSTranscript(e.target.value)} placeholder={"설교 녹취 원문(긴 텍스트 가능)"} style={{...S.input,minHeight:180,resize:'vertical'}}/>
        </div>
        <div>
          <label style={S.label}>추가 메모(하위호환) <span style={S.opt}>(선택)</span></label>
          <textarea value={sPoints} onChange={e=>setSPoints(e.target.value)} placeholder={"기존 설교 요지 텍스트가 있으면 여기에 유지할 수 있어요."} style={{...S.input,minHeight:70,resize:'vertical'}}/>
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
          <p style={{color:'#a0784e',fontSize:fontSizePx(13)}}>불러오는 중...</p>
        </div>
      ) : Object.keys(grouped).length===0 ? (
        <div style={{textAlign:'center',padding:'48px 20px',color:'#886c4f'}}>
          <p style={{fontSize:fontSizePx(40),marginBottom:12}}>📖</p>
          <p style={{fontFamily:"'Gowun Batang',serif",fontSize:fontSizePx(15)}}>아직 등록된 말씀이 없어요</p>
        </div>
      ) : Object.entries(grouped).map(([wk,items])=>(
        <div key={wk}>
          <div style={{display:'flex',alignItems:'center',gap:10,margin:'8px 0 10px'}}>
            <div style={{height:1,flex:1,background:'#e8dcc8'}}/>
            <span style={{fontSize:fontSizePx(11),color:'#a08060',fontWeight:700}}>{weekLabel(wk)}</span>
            <div style={{height:1,flex:1,background:'#e8dcc8'}}/>
          </div>
          {items.map(s=>(
            <div key={s.id} style={{...S.card,marginBottom:10,animation:'fadeUp 0.3s ease'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{background:s.service==='morning'?'linear-gradient(135deg,#f6a623,#e8901a)':'linear-gradient(135deg,#7a6e9e,#5a5080)',borderRadius:6,padding:'3px 10px',color:'#fff',fontSize:fontSizePx(11),fontWeight:700}}>
                    {s.service==='morning'?'☀️ 오전':'🌙 오후'}
                  </span>
                  <StatusBadge status={s.status}/>
                </div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>openEdit(s)} style={S.btnSm}>말씀자료 수정</button>
                  {s.status === 'done' && <button onClick={()=>openResultEdit(s)} style={{...S.btnSm,background:'#eef6ff',border:'1px solid #c7dff8',color:'#1565c0'}}>나눔자료 수정</button>}
                  <button onClick={()=>handleDelete(s.id)} style={{...S.btnSm,background:'#fff5f5',border:'1px solid #f5c6bb',color:'#c0392b'}}>삭제</button>
                </div>
              </div>
              <p style={{fontFamily:"'Gowun Batang',serif",fontSize:fontSizePx(15),color:'#4a3520',fontWeight:700,margin:'0 0 2px'}}>{s.reference}</p>
              {s.sermon_title&&<p style={{fontSize:fontSizePx(12),color:'#8b6e4e',margin:0}}>{s.sermon_title}</p>}
              {s.status==='error'&&s.error_msg&&<p style={{fontSize:fontSizePx(11),color:'#c62828',margin:'4px 0 0'}}>{s.error_msg}</p>}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── 탭2: 셀 조 편성 ──────────────────────────────────
function CellTab() {
  const [members, setMembers]       = useState([])   // 현재 접속 중
  const [allMembers, setAllMembers] = useState([])   // 전체 등록 멤버
  const [loading, setLoading]       = useState(true)
  const [groupCount, setGroupCount] = useState(3)
  const [groups, setGroups]         = useState([])
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState('')
  const [errMsg, setErrMsg]         = useState('')
  const [isSaved, setIsSaved]       = useState(false)

  const [activeSession, setActiveSession] = useState(null)
  const [groupSessions, setGroupSessions] = useState({})
  const [sermonLookup, setSermonLookup] = useState({})
  const [notice, setNotice]           = useState('')
  const [noticeSending, setNoticeSending] = useState(false)
  const [noticeMsg, setNoticeMsg]     = useState('')
  const [week, setWeek] = useState(getWeekStr())
  const pollRef = useRef(null)

  // 세션 폴링 (10초마다)
  useEffect(() => {
    let alive = true
    async function poll() {
      try {
        // 세션 + 멤버 동시 갱신
        const [sRes, mRes, aRes] = await Promise.all([
          fetch(`/api/cell-sessions?all=true&week=${week}`),
          fetch('/api/members'),
          fetch('/api/members?all=true'),
        ])
        const sData = await sRes.json()
        const mData = await mRes.json()
        const aData = await aRes.json()
        if (!alive) return
        if (sData.ok) {
          const map = {}
          if (Array.isArray(sData.data)) sData.data.forEach(s => { map[String(s.group_no)] = s })
          setGroupSessions(map)
          setActiveSession(Array.isArray(sData.data) && sData.data.some(s=>s.is_active) ? sData.data.find(s=>s.is_active) : null)
        }
        if (mData.ok) setMembers(mData.data || [])
        if (aData.ok) setAllMembers(aData.data || [])
      } catch(e) {}
    }
    poll()
    pollRef.current = setInterval(poll, 8000)
    return () => {
      alive = false
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [week])

  useEffect(() => {
    let alive = true
    async function loadSermons() {
      try {
        const res = await fetch('/api/sermons')
        const d = await res.json()
        if (!alive || !d.ok || !Array.isArray(d.data)) return
        const lookup = {}
        d.data.forEach(s => {
          lookup[`${s.week}:${s.service}`] = s
        })
        setSermonLookup(lookup)
      } catch(e) {}
    }
    loadSermons()
    return () => { alive = false }
  }, [])

  async function sendNotice() {
    if (!notice.trim()) return
    setNoticeSending(true)
    try {
      const res = await fetch('/api/cell-sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LEADER_SECRET}` },
        body: JSON.stringify({ action: 'notice', notice })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setActiveSession(prev => prev ? { ...prev, notice } : prev)
      setNoticeMsg('공지가 전송됐어요!')
      setTimeout(() => setNoticeMsg(''), 2500)
    } catch(e) { setNoticeMsg('오류: ' + e.message) }
    finally { setNoticeSending(false) }
  }

  async function endAllSession() {
    if (!window.confirm('전체 셀 모임을 종료할까요?')) return
    try {
      await fetch('/api/cell-sessions', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${LEADER_SECRET}` }
      })
      setGroupSessions({})
      setActiveSession(null)
    } catch(e) {}
  }

  async function resetSessions(groupNo = null) {
    const targetLabel = groupNo ? `${groupNo}조` : '전체 조'
    if (!window.confirm(`${targetLabel}의 셀 상태를 대기로 초기화할까요?`)) return
    try {
      const res = await fetch('/api/cell-sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LEADER_SECRET}` },
        body: JSON.stringify({ action: 'reset', week, group_no: groupNo ? String(groupNo) : undefined })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setNoticeMsg(groupNo ? `${groupNo}조 상태를 대기로 초기화했어요.` : '전체 셀 상태를 대기로 초기화했어요.')
      setTimeout(() => setNoticeMsg(''), 2500)
      setGroupSessions(prev => {
        const next = { ...prev }
        if (groupNo) {
          if (next[String(groupNo)]) {
            next[String(groupNo)] = {
              ...next[String(groupNo)],
              is_active: false,
              started_at: null,
              ended_at: null,
              notice: '',
            }
          }
          return next
        }
        Object.keys(next).forEach((key) => {
          next[key] = {
            ...next[key],
            is_active: false,
            started_at: null,
            ended_at: null,
            notice: '',
          }
        })
        return next
      })
      setActiveSession(null)
      await loadData()
    } catch(e) {
      setNoticeMsg('오류: ' + e.message)
    }
  }
  // 주차/예배 — 현재 주 기본값, 변경 가능
  const weeks = Array.from({length:5},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()+(1-i)*7); return getWeekStr(d) })

  const GROUP_COLORS = ['#a0784e','#7a9e7e','#7a6e9e','#c4956a','#c0392b','#1565c0','#2e7d32','#6d4c41','#00838f','#558b2f']

  useEffect(() => { loadData() }, [week])

  async function loadData() {
    setLoading(true)
    try {
      // 접속 중 + 전체 멤버 동시 조회
      const [mRes, allRes, gRes] = await Promise.all([
        fetch('/api/members'),
        fetch('/api/members?all=true'),
        fetch(`/api/cell-groups?week=${week}`)
      ])
      const mData   = await mRes.json()
      const allData = await allRes.json()
      const gData   = await gRes.json()

      if (mData.ok)   setMembers(mData.data || [])
      if (allData.ok) setAllMembers(allData.data || [])
      if (gData.ok && gData.data) { setGroups(gData.data.groups || []); setIsSaved(true) }
      else { setGroups([]); setIsSaved(false) }
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  function handleRandom() {
    const candidates = members
    if (candidates.length === 0) { setErrMsg('편성할 회원이 없어요.'); return }
    setErrMsg('')
    const shuffled = [...candidates].sort(() => Math.random() - 0.5)
    const names = buildRandomGroupNames(groupCount)
    const result = Array.from({length:groupCount},(_,i)=>({ group_no:i+1, name:names[i], leader:null, members:[] }))
    shuffled.forEach((m,i) => { result[i%groupCount].members.push({name:m.name, device_id:m.device_id}) })
    setGroups(result)
  }

  function handleManualInit() {
    setErrMsg('')
    const names = buildRandomGroupNames(groupCount)
    setGroups(Array.from({length:groupCount},(_,i)=>({ group_no:i+1, name:names[i], leader:null, members:[] })))
  }

  function moveMember(member, fromGroupNo, toGroupNo) {
    setGroups(prev => prev.map(g => {
      if (g.group_no === fromGroupNo) {
        const isLeader = g.leader?.device_id === member.device_id
        return {
          ...g,
          members:g.members.filter(m=>m.device_id!==member.device_id),
          leader: isLeader ? null : g.leader,
        }
      }
      if (g.group_no === toGroupNo)   return {...g, members:[...g.members, member]}
      return g
    }))
  }

  function removeMemberFromGroup(member, fromGroupNo) {
    setGroups(prev => prev.map(g => {
      if (g.group_no !== fromGroupNo) return g
      const isLeader = g.leader?.device_id === member.device_id
      return {
        ...g,
        members: (g.members || []).filter(m => m.device_id !== member.device_id),
        leader: isLeader ? null : g.leader,
      }
    }))
  }

  function addToGroup(member, toGroupNo) {
    setGroups(prev => prev.map(g => {
      if (g.group_no === toGroupNo) return {...g, members:[...g.members, {name:member.name, device_id:member.device_id}]}
      return g
    }))
  }

  async function handleSave() {
    setSaving(true); setErrMsg(''); setSaveMsg('')
    try {
      const res = await fetch('/api/cell-groups', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${LEADER_SECRET}` },
        body: JSON.stringify({ week, groups })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setSaveMsg('저장 완료! 셀 리더가 /cell 에서 모임을 시작할 수 있어요.')
      setIsSaved(true)
      setTimeout(()=>setSaveMsg(''), 3000)
    } catch(e) { setErrMsg('저장 오류: '+e.message) }
    finally { setSaving(false) }
  }

  async function handleReset() {
    if (!window.confirm('조 편성을 초기화할까요? 저장된 편성도 삭제돼요.')) return
    try {
      await fetch('/api/cell-groups/reset', {
        method: 'DELETE',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${LEADER_SECRET}` },
        body: JSON.stringify({ week })
      })
      setGroups([]); setIsSaved(false); setSaveMsg(''); setErrMsg('')
    } catch(e) { setErrMsg('초기화 오류: '+e.message) }
  }

  const assignedIds    = groups.flatMap(g=>g.members.map(m=>m.device_id))
  // 접속 중인 미배정 멤버
  const unassigned     = members.filter(m=>!assignedIds.includes(m.device_id))
  // 미접속 미배정 멤버 (전체 등록 멤버 중 접속 안 한 사람)
  const onlineIds      = new Set(members.map(m=>m.device_id))
  const offlineUnassigned = allMembers.filter(m=>!onlineIds.has(m.device_id)&&!assignedIds.includes(m.device_id))

  return (
    <div style={S.cont}>

      {/* 안내 배너 */}
      <div style={{background:'#fdf5ec',borderRadius:12,padding:'14px 16px',border:'1px solid #e8c9a0'}}>
        <p style={{fontSize:fontSizePx(12),color:'#8b6e4e',margin:0,lineHeight:1.7}}>
          📌 조 편성 완료 후 저장하면, <strong>셀 리더로 지정된 청년이 /cell 페이지에서 직접 모임을 시작</strong>할 수 있어요.
        </p>
        <p style={{fontSize:fontSizePx(12),color:'#8b6e4e',margin:'6px 0 0',lineHeight:1.7}}>
          현재 조 편성 대상은 <strong>접속 중인 인원만</strong> 포함됩니다.
        </p>
      </div>

      {/* 주차/예배 선택 — 어느 예배 조 편성인지 */}
      <div style={S.card}>
        <p style={{fontSize:fontSizePx(13),color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,marginBottom:10}}>주차 선택</p>
        <select value={week} onChange={e=>setWeek(e.target.value)} style={{...S.input,cursor:'pointer'}}>
          {weeks.map(w=><option key={w} value={w}>{weekLabel(w)}</option>)}
        </select>
      </div>

      {/* 접속 현황 */}
      <div style={S.card}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <p style={{fontSize:fontSizePx(13),color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,margin:0}}>접속 현황</p>
          <button onClick={loadData} style={S.btnSm}>🔄 새로고침</button>
        </div>
        {loading ? (
          <p style={{color:'#a0784e',fontSize:fontSizePx(13),textAlign:'center',padding:'12px 0'}}>불러오는 중...</p>
        ) : (
          <>
            {/* 접속 중 */}
            <div style={{marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:'#4caf50',flexShrink:0}}/>
                <p style={{fontSize:fontSizePx(12),color:'#4caf50',fontWeight:700,margin:0}}>접속 중 ({members.length}명)</p>
              </div>
              {members.length===0 ? (
                <p style={{fontSize:fontSizePx(12),color:'#886c4f',margin:'0 0 0 14px',fontStyle:'italic'}}>/cell 페이지 접속 필요</p>
              ) : (
                <div style={{display:'flex',flexWrap:'wrap',gap:7,paddingLeft:14}}>
                  {members.map(m=>(
                    <span key={m.device_id} style={{background:'#e8f5e9',border:'1px solid #a5d6a7',borderRadius:20,padding:'4px 12px',fontSize:fontSizePx(12),color:'#2e7d32',fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
                      <span style={{width:6,height:6,borderRadius:'50%',background:'#4caf50',flexShrink:0,display:'inline-block'}}/>
                      {m.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 미접속 (전체 - 접속 중) */}
            {(() => {
              const onlineIds = new Set(members.map(m => m.device_id))
              const offline = allMembers.filter(m => !onlineIds.has(m.device_id))
              if (offline.length === 0) return null
              return (
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:'#5f5f5f',flexShrink:0}}/>
                    <p style={{fontSize:fontSizePx(12),color:'#6e6e6e',fontWeight:700,margin:0}}>미접속 ({offline.length}명)</p>
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:7,paddingLeft:14}}>
                    {offline.map(m=>{
                      const timeLabel = getLastSeenLabel(m.last_seen)
                      return (
                        <span key={m.device_id} style={{background:'#f5f5f5',border:'1px solid #e0e0e0',borderRadius:20,padding:'4px 12px',fontSize:fontSizePx(12),color:'#757575',fontWeight:500,display:'flex',alignItems:'center',gap:5}}>
                          <span style={{width:6,height:6,borderRadius:'50%',background:'#5f5f5f',flexShrink:0,display:'inline-block'}}/>
                          {m.name}
                          {timeLabel && <span style={{fontSize:fontSizePx(10),color:'#5f5f5f',fontWeight:400}}>· {timeLabel}</span>}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </>
        )}
      </div>

      {/* 조 수 + 편성 버튼 */}
      <div style={S.card}>
        <p style={{fontSize:fontSizePx(13),color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,marginBottom:12}}>조 편성</p>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:14}}>
          <label style={{...S.label,margin:0,whiteSpace:'nowrap'}}>조 수</label>
          <button onClick={()=>setGroupCount(c=>Math.max(1,c-1))} style={{width:34,height:34,borderRadius:8,border:'1.5px solid #ddd0ba',background:'#fff',cursor:'pointer',fontSize:fontSizePx(18),color:'#8b6e4e',display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
          <span style={{fontSize:fontSizePx(18),fontWeight:700,color:'#4a3520',minWidth:36,textAlign:'center'}}>{groupCount}조</span>
          <button onClick={()=>setGroupCount(c=>Math.min(10,c+1))} style={{width:34,height:34,borderRadius:8,border:'1.5px solid #ddd0ba',background:'#fff',cursor:'pointer',fontSize:fontSizePx(18),color:'#8b6e4e',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={handleRandom}     style={{...S.btn,    flex:1,padding:'11px',fontSize:fontSizePx(13)}}>🎲 랜덤 편성</button>
          <button onClick={handleManualInit} style={{...S.btnDark,flex:1,padding:'11px',fontSize:fontSizePx(13)}}>✏️ 수동 편성</button>
        </div>
      </div>

      {/* 미배정 멤버 (접속 중만 편성 가능) */}
      {groups.length>0 && (unassigned.length>0||offlineUnassigned.length>0) && (
        <div style={{background:'#fff8e1',borderRadius:12,padding:'14px 16px',border:'1px solid #ffe082'}}>
          <p style={{fontSize:fontSizePx(12),color:'#f57f17',fontWeight:700,margin:'0 0 10px'}}>
            ⚠ 접속 중 미배정 {unassigned.length}명 — 조를 선택해서 배정하세요
          </p>
          <div style={{display:'flex',flexWrap:'wrap',gap:10}}>
            {unassigned.map(m=>(
              <div key={m.device_id} style={{display:'flex',alignItems:'center',gap:6,background:'#fff',borderRadius:10,padding:'6px 10px',border:'1px solid #ffe082'}}>
                <span style={{width:6,height:6,borderRadius:'50%',background:'#4caf50',flexShrink:0}}/>
                <span style={{fontSize:fontSizePx(13),color:'#4a3520',fontWeight:600}}>{m.name}</span>
                <select onChange={e=>{ if(e.target.value){ addToGroup(m,Number(e.target.value)); e.target.value='' } }}
                  style={{fontSize:fontSizePx(11),padding:'3px 6px',border:'1px solid #ddd0ba',borderRadius:6,color:'#8b6e4e',cursor:'pointer',background:'#fdf5ec'}}>
                  <option value="">→ 배정</option>
                  {groups.map(g=><option key={g.group_no} value={g.group_no}>{formatGroupName(g)}</option>)}
                </select>
              </div>
            ))}
          </div>
          {offlineUnassigned.length > 0 && (
            <div style={{marginTop:10,paddingTop:10,borderTop:'1px dashed #f0d79c'}}>
              <p style={{fontSize:fontSizePx(11),color:'#6e6e6e',fontWeight:700,margin:'0 0 8px'}}>
                참고: 미접속 {offlineUnassigned.length}명은 조편성 대상에서 제외됩니다
              </p>
              <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                {offlineUnassigned.map(m=>(
                  <span key={m.device_id} style={{display:'inline-flex',alignItems:'center',gap:6,background:'#f5f5f5',borderRadius:20,padding:'4px 10px',border:'1px solid #e0e0e0',fontSize:fontSizePx(12),color:'#757575',fontWeight:500}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:'#5f5f5f',flexShrink:0}}/>
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 조 편성 결과 */}
      {groups.length>0 && (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{height:1,flex:1,background:'#e8dcc8'}}/><span style={{fontSize:fontSizePx(11),color:'#a08060',fontWeight:700}}>조 편성 결과</span><div style={{height:1,flex:1,background:'#e8dcc8'}}/>
          </div>
          {groups.map((g,gi)=>(
            <div key={g.group_no} style={{...S.card,borderLeft:`4px solid ${GROUP_COLORS[gi%GROUP_COLORS.length]}`}}>
              {/* 조 이름 + 리더 랜덤 버튼 */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                <div style={{width:10,height:10,borderRadius:'50%',background:GROUP_COLORS[gi%GROUP_COLORS.length],flexShrink:0}}/>
                <input value={formatGroupName(g)}
                  onChange={e=>setGroups(prev=>prev.map(pg=>pg.group_no===g.group_no?{...pg,name:e.target.value}:pg))}
                  style={{fontSize:fontSizePx(15),fontWeight:700,color:'#4a3520',border:'none',background:'transparent',outline:'none',fontFamily:"'Gowun Batang',serif",width:170}}/>
                <span style={{fontSize:fontSizePx(12),color:'#a08060'}}>({g.members.length}명)</span>
                <button onClick={()=>{
                  if(g.members.length===0) return
                  const pick=g.members[Math.floor(Math.random()*g.members.length)]
                  setGroups(prev=>prev.map(pg=>pg.group_no===g.group_no?{...pg,leader:pick}:pg))
                }} style={{marginLeft:'auto',background:'#fdf5ec',border:'1px solid #e8c9a0',borderRadius:8,padding:'4px 10px',cursor:'pointer',fontSize:fontSizePx(11),color:'#a0784e',fontWeight:600}}>
                  🎲 리더 랜덤
                </button>
              </div>
              {/* 셀 리더 선정 */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,padding:'8px 12px',background:GROUP_COLORS[gi%GROUP_COLORS.length]+'14',borderRadius:8}}>
                <span style={{fontSize:fontSizePx(11),color:GROUP_COLORS[gi%GROUP_COLORS.length],fontWeight:700,whiteSpace:'nowrap'}}>👑 셀 리더</span>
                <select value={g.leader?.device_id||''}
                  onChange={e=>{
                    const picked=e.target.value?g.members.find(m=>m.device_id===e.target.value):null
                    setGroups(prev=>prev.map(pg=>pg.group_no===g.group_no?{...pg,leader:picked||null}:pg))
                  }}
                  style={{flex:1,fontSize:fontSizePx(13),padding:'4px 8px',border:`1px solid ${GROUP_COLORS[gi%GROUP_COLORS.length]}50`,borderRadius:8,background:'#fff',color:g.leader?GROUP_COLORS[gi%GROUP_COLORS.length]:'#886c4f',cursor:'pointer',fontWeight:g.leader?700:400,outline:'none'}}>
                  <option value="">— 미선정 —</option>
                  {g.members.map(m=><option key={m.device_id} value={m.device_id}>{m.name}</option>)}
                </select>
                {g.leader&&<span style={{fontSize:fontSizePx(12),color:GROUP_COLORS[gi%GROUP_COLORS.length],fontWeight:700,whiteSpace:'nowrap'}}>{g.leader.name} ✓</span>}
              </div>
              {/* 멤버 목록 */}
              <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                {g.members.length===0
                  ? <p style={{fontSize:fontSizePx(12),color:'#886c4f',margin:0,fontStyle:'italic'}}>비어있어요</p>
                  : g.members.map(m=>(
                    <div key={m.device_id} style={{display:'flex',alignItems:'center',gap:4,background:`${GROUP_COLORS[gi%GROUP_COLORS.length]}15`,borderRadius:20,padding:'5px 6px 5px 12px',border:`1px solid ${GROUP_COLORS[gi%GROUP_COLORS.length]}40`}}>
                      <span style={{fontSize:fontSizePx(13),color:'#4a3520',fontWeight:600}}>
                        {g.leader?.device_id===m.device_id && '👑 '}{m.name}
                      </span>
                      <select onChange={e=>{
                        if (!e.target.value) return
                        if (e.target.value === '__unassign__') removeMemberFromGroup(m, g.group_no)
                        else moveMember(m, g.group_no, Number(e.target.value))
                        e.target.value = ''
                      }}
                        style={{fontSize:fontSizePx(11),padding:'2px 4px',border:'none',background:'transparent',color:GROUP_COLORS[gi%GROUP_COLORS.length],cursor:'pointer'}}>
                        <option value="">↔</option>
                        <option value="__unassign__">조 제외</option>
                        {groups.filter(og=>og.group_no!==g.group_no).map(og=><option key={og.group_no} value={og.group_no}>→ {formatGroupName(og)}</option>)}
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
      {saveMsg&&<p style={{color:'#2e7d32',fontSize:fontSizePx(12),fontWeight:600}}>✓ {saveMsg}</p>}

      {groups.length>0 && (
        <div style={{display:'flex',gap:8}}>
          <button onClick={handleSave} disabled={saving} style={{...(saving?S.btnGray:S.btnDark),flex:3}}>
            {saving?'저장 중...':'💾 조 편성 저장'}
          </button>
          <button onClick={handleReset}
            style={{flex:1,background:'#fff5f5',border:'1px solid #f5c6bb',borderRadius:12,padding:'14px 0',cursor:'pointer',fontSize:fontSizePx(13),color:'#c0392b',fontWeight:700}}>
            🗑 초기화
          </button>
        </div>
      )}

      {groups.length===0 && isSaved && (
        <button onClick={handleReset}
          style={{width:'100%',background:'#fff5f5',border:'1px solid #f5c6bb',borderRadius:12,padding:'12px',cursor:'pointer',fontSize:fontSizePx(13),color:'#c0392b',fontWeight:700}}>
          🗑 저장된 조 편성 초기화
        </button>
      )}

      {/* ── 셀 모임 대시보드 (저장 후 항상 표시) ── */}
      {(isSaved || groups.length > 0) && (
        <div style={{...S.card, border:`1px solid ${activeSession?'#4a8a4a':'#e8d8c0'}`, background: activeSession?'linear-gradient(135deg,#f1f8e9,#e8f5e9)':'#fafafa'}}>

          {/* 헤더 */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
            <div>
              <p style={{fontSize:fontSizePx(13),color:activeSession?'#2e7d32':'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,margin:'0 0 2px'}}>
                {Object.values(groupSessions).some(s=>s.is_active)
                  ? '🟢 셀 모임 진행 중'
                  : Object.values(groupSessions).length > 0
                    ? '✅ 주차 기록 확인 중'
                    : '⏸ 셀 모임 대기 중'}
              </p>
              <p style={{fontSize:fontSizePx(11),color:activeSession?'#558b2f':'#8b6e4e',margin:0}}>
                {Object.keys(groupSessions).length > 0
                  ? `${weekLabel(week)} 기록을 보고 있어요`
                  : '셀 리더가 모임을 시작하면 현황이 업데이트돼요'}
              </p>
            </div>
            <div style={{display:'flex',gap:8}}>
              {activeSession && (
                <button onClick={endAllSession}
                  style={{background:'#ffebee',border:'1px solid #ef9a9a',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:fontSizePx(12),color:'#c62828',fontWeight:700}}>
                  ⏹ 전체 종료
                </button>
              )}
              {Object.keys(groupSessions).length > 0 && (
                <button onClick={()=>resetSessions()}
                  style={{background:'#eef2ff',border:'1px solid #c7d2fe',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:fontSizePx(12),color:'#3949ab',fontWeight:700}}>
                  ↺ 전체 대기화
                </button>
              )}
            </div>
          </div>

          {/* 조별 현황 — 저장만 돼도 표시, 세션 없으면 전부 대기 */}
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <p style={{fontSize:fontSizePx(11),color:activeSession?'#558b2f':'#a08060',fontWeight:700,margin:'0 0 4px'}}>조별 모임 현황</p>
            {groups.map((g) => {
              const session  = groupSessions[String(g.group_no)]
              const sessionSermon = session ? sermonLookup[`${session.sermon_week}:${session.sermon_service}`] : null
              const ended    = !!session && !session.is_active && !!session.ended_at
              const isActive = !!session?.is_active
              const endedAt  = session?.ended_at
              const borderColor = ended ? '#a5d6a7' : isActive ? '#ffe082' : '#e8dcc8'
              const dotColor    = ended ? '#4caf50' : isActive ? '#ff9800' : '#5f5f5f'
              return (
                <div key={g.group_no} style={{display:'flex',alignItems:'center',gap:10,background:'#fff',borderRadius:10,padding:'10px 14px',border:`1px solid ${borderColor}`}}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:dotColor,flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <p style={{fontSize:fontSizePx(13),color:'#4a3520',fontWeight:700,margin:'0 0 1px'}}>{formatGroupName(g)}</p>
                    <p style={{fontSize:fontSizePx(11),color:'#8b6e4e',margin:0}}>
                      {g.leader ? `👑 ${g.leader.name}` : '리더 미지정'} · {g.members.length}명
                    </p>
                    {(isActive || ended) && (sessionSermon?.reference || session?.sermon_week) && (
                      <p style={{fontSize:fontSizePx(10),color:isActive?'#8f6a2a':ended?'#5b8a60':'#a08060',margin:'3px 0 0',fontWeight:600}}>
                        📖 {sessionSermon?.reference || weekLabel(session.sermon_week)}
                        {session.sermon_service==='morning'?' · 오전':session.sermon_service==='afternoon'?' · 오후':''}
                      </p>
                    )}
                    {(isActive || ended) && sessionSermon?.sermon_title && (
                      <p style={{fontSize:fontSizePx(10),color:'#b08d5d',margin:'2px 0 0'}}>
                        {sessionSermon.sermon_title}
                      </p>
                    )}
                    {(isActive || ended) && session?.started_at && (
                      <p style={{fontSize:fontSizePx(10),color:isActive?'#8f6a2a':ended?'#5b8a60':'#a08060',margin:'2px 0 0'}}>
                        ⏰ {formatSessionPeriod(session)}
                      </p>
                    )}
                  </div>
                  <div style={{textAlign:'right'}}>
                    {ended ? (
                      <>
                        <span style={{background:'#e8f5e9',color:'#2e7d32',borderRadius:20,padding:'3px 10px',fontSize:fontSizePx(11),fontWeight:700}}>✅ 종료</span>
                        {endedAt && <p style={{fontSize:fontSizePx(10),color:'#6e6e6e',margin:'3px 0 0'}}>종료 {formatSessionTime(endedAt)}</p>}
                      </>
                    ) : isActive ? (
                      <>
                        <span style={{background:'#fff8e1',color:'#f57f17',borderRadius:20,padding:'3px 10px',fontSize:fontSizePx(11),fontWeight:700}}>⏳ 진행 중</span>
                        {session?.started_at && <p style={{fontSize:fontSizePx(10),color:'#6e6e6e',margin:'3px 0 0'}}>시작 {formatSessionTime(session.started_at)}</p>}
                      </>
                    ) : (
                      <span style={{background:'#f5f5f5',color:'#6e6e6e',borderRadius:20,padding:'3px 10px',fontSize:fontSizePx(11),fontWeight:700}}>— 대기</span>
                    )}
                    {session && (
                      <button onClick={()=>resetSessions(g.group_no)}
                        style={{display:'block',margin:'6px 0 0 auto',background:'#f5f7ff',border:'1px solid #d6defa',borderRadius:8,padding:'4px 8px',cursor:'pointer',fontSize:fontSizePx(10),color:'#3949ab',fontWeight:700}}>
                        대기화
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 공지 입력 — 항상 표시 */}
          <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid',borderColor:activeSession?'#c8e6c9':'#e8dcc8'}}>
            <p style={{fontSize:fontSizePx(12),color:activeSession?'#2e7d32':'#8b6e4e',fontWeight:700,margin:'0 0 8px'}}>📢 셀 리더 공지</p>
            {activeSession ? (
              <>
                <div style={{display:'flex',gap:8,marginBottom:6}}>
                  <input value={notice} onChange={e=>setNotice(e.target.value)}
                    onKeyDown={e=>{ if(e.key==='Enter') sendNotice() }}
                    placeholder="공지 내용을 입력하세요..."
                    style={{...S.input,flex:1,fontSize:fontSizePx(13),padding:'9px 12px'}}/>
                  <button onClick={sendNotice} disabled={noticeSending||!notice.trim()}
                    style={{background:notice.trim()?'linear-gradient(135deg,#2e7d32,#43a047)':'#7a5f3a',color:'#fff',border:'none',borderRadius:10,padding:'9px 14px',cursor:notice.trim()?'pointer':'not-allowed',fontSize:fontSizePx(13),fontWeight:700,whiteSpace:'nowrap'}}>
                    {noticeSending?'전송중':'📤 전송'}
                  </button>
                </div>
                {noticeMsg&&<p style={{fontSize:fontSizePx(11),color:'#2e7d32',margin:'4px 0 0',fontWeight:600}}>✓ {noticeMsg}</p>}
                {activeSession.notice && (
                  <div style={{background:'#fff',borderRadius:8,padding:'7px 12px',border:'1px solid #a5d6a7',marginTop:6}}>
                    <p style={{fontSize:fontSizePx(10),color:'#558b2f',margin:'0 0 2px',fontWeight:600}}>현재 공지</p>
                    <p style={{fontSize:fontSizePx(13),color:'#2e7d32',margin:0,fontWeight:700}}>"{activeSession.notice}"</p>
                  </div>
                )}
              </>
            ) : (
              <p style={{fontSize:fontSizePx(12),color:'#6e6e6e',margin:0,fontStyle:'italic'}}>셀 모임이 시작되면 공지를 보낼 수 있어요</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 탭3: 회원 관리 ───────────────────────────────────
function MemberTab() {
  const [allMembers, setAllMembers] = useState([])
  const [onlineIds, setOnlineIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [newMemberName, setNewMemberName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => { loadMembers() }, [])

  async function loadMembers() {
    setLoading(true)
    try {
      const [allRes, onlineRes] = await Promise.all([
        fetch('/api/members?all=true'),
        fetch('/api/members'),
      ])
      const allData = await allRes.json()
      const onlineData = await onlineRes.json()
      if (allData.ok) setAllMembers(allData.data || [])
      if (onlineData.ok) setOnlineIds(new Set((onlineData.data || []).map(m => m.device_id)))
    } catch (e) {
      setErr('회원 목록을 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }

  function startEdit(member) {
    setEditingId(member.device_id)
    setEditName(member.name || '')
    setMsg('')
    setErr('')
  }

  function cancelEdit() {
    setEditingId('')
    setEditName('')
    setErr('')
  }

  async function addMember() {
    const name = (newMemberName || '').trim()
    if (!name) {
      setErr('추가할 이름을 입력해 주세요.')
      return
    }
    setAdding(true)
    setErr('')
    try {
      const res = await fetch('/api/members', {
        method: 'PATCH',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${LEADER_SECRET}` },
        body: JSON.stringify({ action:'admin_add', name })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)

      setAllMembers(prev => {
        const exists = prev.some(m => m.device_id === d.data?.device_id)
        if (exists) return prev
        return [d.data, ...prev]
      })
      setNewMemberName('')
      setMsg(d.created === false ? '이미 등록된 이름이라 기존 회원을 유지했어요.' : '회원을 추가했어요.')
      setTimeout(() => setMsg(''), 2200)
    } catch (e) {
      setErr('추가 오류: ' + e.message)
    } finally {
      setAdding(false)
    }
  }

  async function saveMemberName(deviceId) {
    const name = (editName || '').trim()
    if (!name) {
      setErr('이름은 비워둘 수 없어요.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      const res = await fetch('/api/members', {
        method: 'PATCH',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${LEADER_SECRET}` },
        body: JSON.stringify({ action:'admin_update', device_id: deviceId, name })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setAllMembers(prev => prev.map(m => m.device_id === deviceId ? { ...m, name: d.data?.name || name } : m))
      setMsg('회원 이름을 수정했어요.')
      setTimeout(() => setMsg(''), 2000)
      setEditingId('')
      setEditName('')
    } catch (e) {
      setErr('수정 오류: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteMember(deviceId) {
    if (!window.confirm('이 회원을 삭제할까요?')) return
    setDeletingId(deviceId)
    setErr('')
    try {
      const res = await fetch('/api/members', {
        method: 'DELETE',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${LEADER_SECRET}` },
        body: JSON.stringify({ device_id: deviceId })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setAllMembers(prev => prev.filter(m => m.device_id !== deviceId))
      setOnlineIds(prev => {
        const next = new Set(prev)
        next.delete(deviceId)
        return next
      })
      if (editingId === deviceId) cancelEdit()
      setMsg('회원을 삭제했어요.')
      setTimeout(() => setMsg(''), 2000)
    } catch (e) {
      setErr('삭제 오류: ' + e.message)
    } finally {
      setDeletingId('')
    }
  }

  return (
    <div style={S.cont}>
      <div style={S.card}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <p style={{fontSize:fontSizePx(13),color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,margin:0}}>회원 정보 관리</p>
          <button onClick={loadMembers} style={S.btnSm}>🔄 새로고침</button>
        </div>
        <p style={{fontSize:fontSizePx(11),color:'#8b6e4e',margin:'0 0 10px'}}>이름으로 회원을 추가하거나, 이름 수정/삭제를 할 수 있어요.</p>
        <div style={{display:'flex',gap:8,margin:'0 0 12px'}}>
          <input
            value={newMemberName}
            onChange={e=>setNewMemberName(e.target.value)}
            onKeyDown={e=>{ if (e.key === 'Enter') addMember() }}
            placeholder="추가할 회원 이름"
            style={{...S.input,flex:1,padding:'9px 12px',fontSize:fontSizePx(13)}}
          />
          <button
            onClick={addMember}
            disabled={adding}
            style={{background:adding?'#7a5f3a':'#4a3520',color:'#fff',border:'none',borderRadius:10,padding:'9px 14px',fontSize:fontSizePx(12),fontWeight:700,cursor:adding?'not-allowed':'pointer',whiteSpace:'nowrap'}}
          >
            {adding ? '추가 중...' : '회원 추가'}
          </button>
        </div>
        {err && <p style={{...S.err,margin:'0 0 8px'}}>⚠ {err}</p>}
        {msg && <p style={{...S.ok,margin:'0 0 8px'}}>✓ {msg}</p>}

        {loading ? (
          <p style={{color:'#a0784e',fontSize:fontSizePx(13),textAlign:'center',padding:'12px 0'}}>불러오는 중...</p>
        ) : allMembers.length === 0 ? (
          <p style={{fontSize:fontSizePx(12),color:'#886c4f',margin:0,fontStyle:'italic'}}>등록된 회원이 없어요.</p>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:520,overflowY:'auto',paddingRight:2}}>
            {allMembers.map(member => {
              const isOnline = onlineIds.has(member.device_id)
              const isEditing = editingId === member.device_id
              const timeLabel = getLastSeenLabel(member.last_seen)
              return (
                <div key={member.device_id} style={{display:'flex',alignItems:'center',gap:10,border:'1px solid #ebe2d4',borderRadius:10,padding:'9px 10px',background:'#fff'}}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:isOnline?'#4caf50':'#5f5f5f',flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    {isEditing ? (
                      <input
                        value={editName}
                        onChange={e=>setEditName(e.target.value)}
                        style={{...S.input,padding:'7px 9px',fontSize:fontSizePx(13)}}
                        placeholder="이름"
                      />
                    ) : (
                      <>
                        <p style={{fontSize:fontSizePx(13),color:'#4a3520',fontWeight:700,margin:'0 0 2px'}}>{member.name}</p>
                        <p style={{fontSize:fontSizePx(10),color:'#a08060',margin:0}}>
                          {isOnline ? '접속 중' : `미접속${timeLabel ? ` · ${timeLabel}` : ''}`}
                        </p>
                      </>
                    )}
                  </div>
                  {isEditing ? (
                    <div style={{display:'flex',gap:6}}>
                      <button
                        onClick={()=>saveMemberName(member.device_id)}
                        disabled={saving}
                        style={{background:saving?'#7a5f3a':'#4a3520',color:'#fff',border:'none',borderRadius:8,padding:'6px 10px',fontSize:fontSizePx(12),fontWeight:700,cursor:saving?'not-allowed':'pointer'}}
                      >
                        저장
                      </button>
                      <button
                        onClick={cancelEdit}
                        style={{...S.btnSm,padding:'6px 10px'}}
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={()=>startEdit(member)} style={{...S.btnSm,padding:'6px 10px'}}>수정</button>
                      <button
                        onClick={()=>deleteMember(member.device_id)}
                        disabled={deletingId === member.device_id}
                        style={{background:'#fff5f5',border:'1px solid #f5c6bb',borderRadius:8,padding:'6px 10px',fontSize:fontSizePx(12),color:'#c0392b',fontWeight:700,cursor:deletingId===member.device_id?'not-allowed':'pointer'}}
                      >
                        {deletingId === member.device_id ? '삭제 중...' : '삭제'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 탭4: 출석 관리 ───────────────────────────────────
function AttendanceTab() {
  const TRACKS = [
    { key: 'sunday_morning', label: '주일 오전', onBg: '#2e7d32', onBorder: '#1b5e20', offBg: '#edf5ee', offBorder: '#d6e6d8', onColor: '#fff', offColor: '#2e7d32' },
    { key: 'sunday_afternoon', label: '주일 오후', onBg: '#1565c0', onBorder: '#0d47a1', offBg: '#eef4fb', offBorder: '#d6e3f5', onColor: '#fff', offColor: '#1565c0' },
    { key: 'young_adult_meeting', label: '청년부모임', onBg: '#7b1fa2', onBorder: '#4a148c', offBg: '#f4eef8', offBorder: '#e3d3f0', onColor: '#fff', offColor: '#7b1fa2' },
  ]

  const [week, setWeek] = useState(getWeekStr())
  const [members, setMembers] = useState([])
  const [attendanceMap, setAttendanceMap] = useState({})
  const [summary, setSummary] = useState({ total_checked: 0, present: 0, absent: 0, excused: 0 })
  const [cellParticipantIds, setCellParticipantIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [savingMemberId, setSavingMemberId] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const weeks = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + (1 - i) * 7)
    return getWeekStr(d)
  })

  useEffect(() => { loadData() }, [week])

  function parseTrackState(noteValue, status) {
    const blank = { sunday_morning: false, sunday_afternoon: false, young_adult_meeting: false }
    if (!noteValue) return status === 'present' ? { ...blank, sunday_morning: true } : blank
    try {
      const parsed = typeof noteValue === 'string' ? JSON.parse(noteValue) : noteValue
      if (!parsed || typeof parsed !== 'object') return blank
      return {
        sunday_morning: !!parsed.sunday_morning,
        sunday_afternoon: !!parsed.sunday_afternoon,
        young_adult_meeting: !!parsed.young_adult_meeting,
      }
    } catch (e) {
      return status === 'present' ? { ...blank, sunday_morning: true } : blank
    }
  }

  function hasAnyTrack(track) {
    return !!(track?.sunday_morning || track?.sunday_afternoon || track?.young_adult_meeting)
  }

  function summarizeFromMap(map, memberList) {
    const vals = memberList.map((m) => map[m.id]).filter(Boolean)
    const present = vals.filter((v) => v.status === 'present').length
    const absent = vals.filter((v) => v.status === 'absent' || v.status === 'excused').length
    const checked = vals.length
    return { total_checked: checked, present, absent, excused: 0 }
  }

  async function loadData() {
    setLoading(true)
    setErr('')
    try {
      const [membersRes, attendanceRes, groupsRes, sessionsRes] = await Promise.all([
        fetch('/api/members?all=true'),
        fetch(`/api/attendance?week=${week}`),
        fetch(`/api/cell-groups?week=${week}`),
        fetch(`/api/cell-sessions?all=true&week=${week}`),
      ])
      const membersData = await membersRes.json()
      const attendanceData = await attendanceRes.json()
      const groupsData = await groupsRes.json()
      const sessionsData = await sessionsRes.json()
      if (!membersData.ok) throw new Error(membersData.error || 'members 조회 실패')
      if (!attendanceData.ok) throw new Error(attendanceData.error || 'attendance 조회 실패')

      const list = (membersData.data || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'))
      setMembers(list)
      setSummary(attendanceData.summary || { total_checked: 0, present: 0, absent: 0, excused: 0 })

      const map = {}
      ;(attendanceData.data || []).forEach((row) => {
        if (row?.member_id) {
          const track = parseTrackState(row.note, row.status)
          map[row.member_id] = { status: row.status, note: row.note || '', track }
        }
      })

      // 셀모임 참여자 자동 인식: 세션이 존재하는 조의 멤버를 참여자로 간주
      const participantDeviceIds = new Set()
      const groups = groupsData?.ok ? (groupsData.data?.groups || []) : []
      const sessions = sessionsData?.ok ? (sessionsData.data || []) : []
      const activeGroupNos = new Set(sessions.map((s) => String(s.group_no)))
      groups.forEach((g) => {
        if (!activeGroupNos.has(String(g.group_no))) return
        ;(g.members || []).forEach((m) => {
          if (m?.device_id) participantDeviceIds.add(m.device_id)
        })
      })
      setCellParticipantIds(participantDeviceIds)

      // 셀모임 참여자 자동 체크: 청년부모임 토글 on
      const autoRows = list.reduce((acc, m) => {
        if (!participantDeviceIds.has(m.device_id)) return acc
        const current = map[m.id]?.track || { sunday_morning: false, sunday_afternoon: false, young_adult_meeting: false }
        if (current.young_adult_meeting) return acc
        const nextTrack = { ...current, young_adult_meeting: true }
        acc.push({
          member_id: m.id,
          status: hasAnyTrack(nextTrack) ? 'present' : 'absent',
          note: JSON.stringify(nextTrack),
        })
        map[m.id] = { status: hasAnyTrack(nextTrack) ? 'present' : 'absent', note: JSON.stringify(nextTrack), track: nextTrack }
        return acc
      }, [])

      if (autoRows.length) {
        const checkedBy = typeof window !== 'undefined' ? (localStorage.getItem('wl_member_name') || 'leader') : 'leader'
        await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${LEADER_SECRET}` },
          body: JSON.stringify({ action:'upsert_bulk', week, rows: autoRows, checked_by: `${checkedBy} (auto)` })
        })
        autoRows.forEach((r) => {
          map[r.member_id] = { status: r.status, note: r.note, track: parseTrackState(r.note, r.status) }
        })
        setMsg(`셀모임 참여자 ${autoRows.length}명을 자동 출석 처리했어요.`)
        setTimeout(() => setMsg(''), 1800)
      }

      setAttendanceMap(map)
      setSummary(summarizeFromMap(map, list))
    } catch (e) {
      setErr('출석 정보를 불러오지 못했어요. ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function upsertOne(memberId, track) {
    setSavingMemberId(memberId)
    setErr('')
    try {
      const checkedBy = typeof window !== 'undefined' ? (localStorage.getItem('wl_member_name') || 'leader') : 'leader'
      const note = JSON.stringify(track)
      const status = hasAnyTrack(track) ? 'present' : 'absent'
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${LEADER_SECRET}` },
        body: JSON.stringify({ week, member_id: memberId, status, note, checked_by: checkedBy })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setAttendanceMap((prev) => {
        const next = { ...prev, [memberId]: { ...(prev[memberId] || {}), status, note, track } }
        setSummary(summarizeFromMap(next, members))
        return next
      })
    } catch (e) {
      setErr('저장 오류: ' + e.message)
    } finally {
      setSavingMemberId('')
    }
  }

  return (
    <div style={S.cont}>
      <div style={S.card}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <p style={{fontSize:fontSizePx(13),color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,margin:0}}>주일 출석 체크</p>
          <button onClick={loadData} style={S.btnSm}>🔄 새로고침</button>
        </div>

        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
          <label style={{...S.label,margin:0,whiteSpace:'nowrap'}}>주차</label>
          <select value={week} onChange={e=>setWeek(e.target.value)} style={{...S.input,cursor:'pointer',padding:'9px 12px'}}>
            {weeks.map(w => <option key={w} value={w}>{weekLabel(w)} ({w})</option>)}
          </select>
        </div>

        <p style={{fontSize:fontSizePx(11),color:'#8b6e4e',margin:'0 0 10px'}}>토글을 누르면 즉시 저장됩니다. 체크된 항목은 진하게 표시됩니다.</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'0 0 10px'}}>
          <span style={{background:'#e8f5e9',border:'1px solid #c8e6c9',color:'#2e7d32',borderRadius:16,padding:'4px 10px',fontSize:fontSizePx(11),fontWeight:700}}>출석 {summary.present}명</span>
          <span style={{background:'#fff5f5',border:'1px solid #f5c6bb',color:'#c0392b',borderRadius:16,padding:'4px 10px',fontSize:fontSizePx(11),fontWeight:700}}>결석 {summary.absent}명</span>
          <span style={{background:'#f5f5f5',border:'1px solid #e0e0e0',color:'#757575',borderRadius:16,padding:'4px 10px',fontSize:fontSizePx(11),fontWeight:700}}>체크완료 {summary.total_checked}명</span>
        </div>
        {err && <p style={{...S.err,margin:'0 0 8px'}}>⚠ {err}</p>}
        {msg && <p style={{...S.ok,margin:'0 0 8px'}}>✓ {msg}</p>}

        {loading ? (
          <p style={{color:'#a0784e',fontSize:fontSizePx(13),textAlign:'center',padding:'12px 0'}}>불러오는 중...</p>
        ) : members.length === 0 ? (
          <p style={{fontSize:fontSizePx(12),color:'#886c4f',margin:0,fontStyle:'italic'}}>등록된 회원이 없어요.</p>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:520,overflowY:'auto',paddingRight:2}}>
            {members.map((m) => {
              const status = attendanceMap[m.id]?.status || ''
              const isParticipant = cellParticipantIds.has(m.device_id)
              const track = attendanceMap[m.id]?.track || parseTrackState(attendanceMap[m.id]?.note, status)
              return (
                <div key={m.id} style={{display:'flex',alignItems:'flex-start',gap:10,border:'1px solid #ebe2d4',borderRadius:10,padding:'9px 10px',background:'#fff'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:fontSizePx(13),color:'#4a3520',fontWeight:700,margin:'0 0 2px'}}>{m.name}</p>
                    <p style={{fontSize:fontSizePx(10),color:'#a08060',margin:0}}>
                      {isParticipant ? '셀모임 참여자' : (m.last_seen ? `최근 접속: ${getLastSeenLabel(m.last_seen)}` : '미접속 회원')}
                    </p>
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'center',flexShrink:0,flexWrap:'wrap',justifyContent:'flex-end'}}>
                    {TRACKS.map((meta) => {
                      const checked = !!track[meta.key]
                      return (
                        <button
                          key={`${m.id}-${meta.key}`}
                          onClick={() => upsertOne(m.id, { ...track, [meta.key]: !checked })}
                          disabled={savingMemberId === m.id}
                          style={{
                            background: checked ? meta.onBg : meta.offBg,
                            color: checked ? meta.onColor : meta.offColor,
                            border: `1px solid ${checked ? meta.onBorder : meta.offBorder}`,
                            borderRadius: 8,
                            padding: '6px 10px',
                            fontSize:fontSizePx(12),
                            fontWeight: 700,
                            cursor: 'pointer',
                            opacity: checked ? 1 : 0.62,
                          }}
                        >
                          {meta.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 탭5: 운영 대시보드 ──────────────────────────────
function DashboardTab() {
  const [week, setWeek] = useState(getWeekStr())
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [attendanceTab, setAttendanceTab] = useState('total')

  const weeks = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + (1 - i) * 7)
    return getWeekStr(d)
  })

  useEffect(() => { loadSummary() }, [week])

  async function loadSummary() {
    setLoading(true)
    setErr('')
    try {
      const res = await fetch(`/api/dashboard/summary?week=${week}`, {
        headers: { 'Authorization': `Bearer ${LEADER_SECRET}` }
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setData(d.data)
    } catch (e) {
      setErr('대시보드 데이터를 불러오지 못했어요. ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function BarRow({ label, value, max = 100, color = '#a0784e' }) {
    const width = max > 0 ? Math.max(6, Math.round((value / max) * 100)) : 0
    return (
      <div style={{marginBottom:8}}>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:fontSizePx(11),color:'#8b6e4e',marginBottom:4}}>
          <span>{label}</span>
          <strong style={{color:'#4a3520'}}>{value}</strong>
        </div>
        <div style={{height:8,background:'#f0e7d9',borderRadius:8,overflow:'hidden'}}>
          <div style={{height:'100%',width:`${width}%`,background:color}}/>
        </div>
      </div>
    )
  }

  function metricFor(periodKey, tabKey) {
    if (!data) return { count: 0, rate: 0 }
    if (tabKey === 'total') {
      const base = data.출석?.[periodKey] || {}
      return { count: base.present || 0, rate: base.rate || 0 }
    }
    const tracks = data.출석?.[`${periodKey}_tracks`] || {}
    return {
      count: tracks?.[tabKey]?.count || 0,
      rate: tracks?.[tabKey]?.rate || 0,
    }
  }

  function metricPackFor(periodKey, tabKey) {
    if (!data) return { participation: { present_count: 0, denominator: 0, rate: 0 }, coverage: { present_members: 0, denominator: 0, rate: 0 } }
    if (tabKey === 'total') {
      return data.출석?.[`${periodKey}_metrics`] || { participation: { present_count: 0, denominator: 0, rate: 0 }, coverage: { present_members: 0, denominator: 0, rate: 0 } }
    }
    const group = data.출석?.[`${periodKey}_track_metrics`] || {}
    return group?.[tabKey] || { participation: { present_count: 0, denominator: 0, rate: 0 }, coverage: { present_members: 0, denominator: 0, rate: 0 } }
  }

  function weekMetricForRow(row, tabKey) {
    if (!row) return { count: 0, denominator: 0, rate: 0 }
    if (tabKey === 'total') return row.total || { count: 0, denominator: 0, rate: 0 }
    return row.tracks?.[tabKey] || { count: 0, denominator: 0, rate: 0 }
  }

  return (
    <div style={S.cont}>
      <div style={S.card}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <p style={{fontSize:fontSizePx(13),color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,margin:0}}>운영 대시보드</p>
          <button onClick={loadSummary} style={S.btnSm}>🔄 새로고침</button>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
          <label style={{...S.label,margin:0,whiteSpace:'nowrap'}}>기준 주차</label>
          <select value={week} onChange={e=>setWeek(e.target.value)} style={{...S.input,cursor:'pointer',padding:'9px 12px'}}>
            {weeks.map(w => <option key={w} value={w}>{weekLabel(w)} ({w})</option>)}
          </select>
        </div>
        {err && <p style={{...S.err,margin:'0 0 8px'}}>⚠ {err}</p>}
        {loading ? (
          <p style={{color:'#a0784e',fontSize:fontSizePx(13),textAlign:'center',padding:'12px 0'}}>불러오는 중...</p>
        ) : !data ? (
          <p style={{fontSize:fontSizePx(12),color:'#886c4f',margin:0,fontStyle:'italic'}}>표시할 데이터가 없어요.</p>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>
              <div style={{background:'#fdf5ec',border:'1px solid #e8c9a0',borderRadius:10,padding:'10px 12px'}}>
                <p style={{fontSize:fontSizePx(11),color:'#8b6e4e',margin:'0 0 3px'}}>전체 회원</p>
                <p style={{fontSize:fontSizePx(20),color:'#4a3520',margin:0,fontWeight:700}}>{data.구성원.total_members}명</p>
              </div>
              <div style={{background:'#eef6ef',border:'1px solid #c8e6c9',borderRadius:10,padding:'10px 12px'}}>
                <p style={{fontSize:fontSizePx(11),color:'#2e7d32',margin:'0 0 3px'}}>현재 접속</p>
                <p style={{fontSize:fontSizePx(20),color:'#2e7d32',margin:0,fontWeight:700}}>{data.구성원.online_members}명</p>
              </div>
            </div>

            <div style={{background:'#fff',border:'1px solid #ebe2d4',borderRadius:10,padding:'10px 12px'}}>
              <p style={{fontSize:fontSizePx(12),color:'#4a3520',fontWeight:700,margin:'0 0 8px'}}>출석 비율 관리 (전체 인원 대비)</p>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
                {[
                  { key:'total', label:'총합' },
                  { key:'sunday_morning', label:'주일 오전' },
                  { key:'sunday_afternoon', label:'주일 오후' },
                  { key:'young_adult_meeting', label:'청년부모임' },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setAttendanceTab(t.key)}
                    style={{
                      border:'none',
                      borderRadius:14,
                      padding:'5px 10px',
                      fontSize:fontSizePx(11),
                      cursor:'pointer',
                      fontWeight:700,
                      background: attendanceTab===t.key ? '#4a3520' : '#f5f0ea',
                      color: attendanceTab===t.key ? '#fff' : '#8b6e4e',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <p style={{fontSize:fontSizePx(11),color:'#8b6e4e',margin:'0 0 8px'}}>월 단위 주차별 참석 현황</p>
              {(data.출석.month_by_week || []).length === 0 ? (
                <p style={{fontSize:fontSizePx(11),color:'#886c4f',margin:0,fontStyle:'italic'}}>선택한 월의 주차 데이터가 없어요.</p>
              ) : (
                (data.출석.month_by_week || []).map((row) => {
                  const m = weekMetricForRow(row, attendanceTab)
                  return (
                    <div key={row.week} style={{marginBottom:8}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:fontSizePx(11),color:'#8b6e4e',marginBottom:4}}>
                        <span>{weekLabel(row.week)}</span>
                        <strong style={{color:'#4a3520'}}>{m.count} / {m.denominator}명 ({m.rate}%)</strong>
                      </div>
                      <div style={{height:8,background:'#f0e7d9',borderRadius:8,overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${Math.max(0, Math.min(100, m.rate))}%`,background:'#a0784e'}}/>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div style={{background:'#fff',border:'1px solid #ebe2d4',borderRadius:10,padding:'10px 12px'}}>
              <p style={{fontSize:fontSizePx(12),color:'#4a3520',fontWeight:700,margin:'0 0 8px'}}>월간 주차별 출석(체크완료)</p>
              {(data.출석.month_by_week || []).length === 0 ? (
                <p style={{fontSize:fontSizePx(11),color:'#886c4f',margin:0,fontStyle:'italic'}}>월간 데이터가 없어요.</p>
              ) : (
                (data.출석.month_by_week || []).map((row) => (
                  <BarRow key={row.week} label={weekLabel(row.week)} value={row.checked} max={data.구성원.total_members || 1} color="#a0784e" />
                ))
              )}
            </div>

            <div style={{background:'#fff',border:'1px solid #ebe2d4',borderRadius:10,padding:'10px 12px'}}>
              <p style={{fontSize:fontSizePx(12),color:'#4a3520',fontWeight:700,margin:'0 0 8px'}}>연간 월별 출석률</p>
              {(data.출석.year_by_month || []).length === 0 ? (
                <p style={{fontSize:fontSizePx(11),color:'#886c4f',margin:0,fontStyle:'italic'}}>연간 데이터가 없어요.</p>
              ) : (
                (data.출석.year_by_month || []).map((row) => (
                  <BarRow key={row.month} label={row.month} value={row.rate} max={100} color="#7a9e7e" />
                ))
              )}
            </div>

            <div style={{background:'#fff',border:'1px solid #ebe2d4',borderRadius:10,padding:'10px 12px'}}>
              <p style={{fontSize:fontSizePx(12),color:'#4a3520',fontWeight:700,margin:'0 0 8px'}}>운영 지표</p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>
                <div style={{fontSize:fontSizePx(11),color:'#6b5040'}}>말씀 생성 대기: <strong>{data.운영.sermon_status.pending}</strong></div>
                <div style={{fontSize:fontSizePx(11),color:'#6b5040'}}>말씀 생성 중: <strong>{data.운영.sermon_status.processing}</strong></div>
                <div style={{fontSize:fontSizePx(11),color:'#6b5040'}}>말씀 생성 완료: <strong>{data.운영.sermon_status.done}</strong></div>
                <div style={{fontSize:fontSizePx(11),color:'#6b5040'}}>말씀 생성 오류: <strong>{data.운영.sermon_status.error}</strong></div>
                <div style={{fontSize:fontSizePx(11),color:'#6b5040'}}>주간 세션 수: <strong>{data.운영.sessions.week_total}</strong></div>
                <div style={{fontSize:fontSizePx(11),color:'#6b5040'}}>진행 중 세션: <strong>{data.운영.sessions.week_active}</strong></div>
              </div>
            </div>

            <div style={{background:'#fff',border:'1px solid #ebe2d4',borderRadius:10,padding:'10px 12px'}}>
              <p style={{fontSize:fontSizePx(12),color:'#4a3520',fontWeight:700,margin:'0 0 8px'}}>개인 출석률 TOP 5 (최근 {data.운영.member_attendance?.recent_window_weeks || 8}주)</p>
              {(data.운영.member_attendance?.top || []).length === 0 ? (
                <p style={{fontSize:fontSizePx(11),color:'#886c4f',margin:0,fontStyle:'italic'}}>집계할 데이터가 없어요.</p>
              ) : (
                (data.운영.member_attendance.top || []).map((r, idx) => (
                  <div key={`${r.member_id}-top`} style={{display:'flex',justifyContent:'space-between',fontSize:fontSizePx(11),color:'#4a3520',padding:'4px 0',borderTop:idx===0?'none':'1px dashed #eee'}}>
                    <span>{idx + 1}. {r.name}</span>
                    <strong>{r.rate}% ({r.present}/{r.checked})</strong>
                  </div>
                ))
              )}
            </div>

            <div style={{background:'#fff',border:'1px solid #ebe2d4',borderRadius:10,padding:'10px 12px'}}>
              <p style={{fontSize:fontSizePx(12),color:'#4a3520',fontWeight:700,margin:'0 0 8px'}}>케어 필요 대상 (출석률 하위 5명)</p>
              {(data.운영.member_attendance?.bottom || []).length === 0 ? (
                <p style={{fontSize:fontSizePx(11),color:'#886c4f',margin:0,fontStyle:'italic'}}>집계할 데이터가 없어요.</p>
              ) : (
                (data.운영.member_attendance.bottom || []).map((r, idx) => (
                  <div key={`${r.member_id}-bottom`} style={{display:'flex',justifyContent:'space-between',fontSize:fontSizePx(11),color:'#4a3520',padding:'4px 0',borderTop:idx===0?'none':'1px dashed #eee'}}>
                    <span>{idx + 1}. {r.name}</span>
                    <strong>{r.rate}% ({r.present}/{r.checked})</strong>
                  </div>
                ))
              )}
            </div>

            <div style={{background:'#fff',border:'1px solid #ebe2d4',borderRadius:10,padding:'10px 12px'}}>
              <p style={{fontSize:fontSizePx(12),color:'#4a3520',fontWeight:700,margin:'0 0 8px'}}>연속 결석자 (최근 기준 연속 2주 이상)</p>
              {(data.운영.member_attendance?.streak_absentees || []).length === 0 ? (
                <p style={{fontSize:fontSizePx(11),color:'#2e7d32',margin:0}}>현재 연속 결석자가 없어요.</p>
              ) : (
                (data.운영.member_attendance.streak_absentees || []).map((r, idx) => (
                  <div key={`${r.member_id}-streak`} style={{display:'flex',justifyContent:'space-between',fontSize:fontSizePx(11),color:'#4a3520',padding:'4px 0',borderTop:idx===0?'none':'1px dashed #eee'}}>
                    <span>{r.name}</span>
                    <strong style={{color:'#c0392b'}}>{r.streak_weeks}주 연속</strong>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 탭6: 딕싯 게임 관리 ──────────────────────────────
function DixitTab() {
  const [rooms, setRooms]         = useState([])
  const [creating, setCreating]   = useState(false)
  const [maxScore, setMaxScore]   = useState(30)
  const [newRoom, setNewRoom]     = useState(null)
  const [errMsg, setErrMsg]       = useState('')
  const [copied, setCopied]       = useState(false)

  const deviceId = typeof window !== 'undefined' ? (localStorage.getItem('wl_device_id') || '') : ''
  const leaderName = typeof window !== 'undefined' ? (localStorage.getItem('wl_member_name') || '리더') : '리더'

  async function handleCreate() {
    setCreating(true); setErrMsg('')
    try {
      const res = await fetch('/api/dixit?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_device: deviceId, host_name: leaderName, max_score: maxScore })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setNewRoom(d.data)
    } catch(e) { setErrMsg('오류: ' + e.message) }
    finally { setCreating(false) }
  }

  async function handleStart() {
    if (!newRoom) return
    try {
      const res = await fetch('/api/dixit?action=start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_code: newRoom.room_code, device_id: deviceId })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      // 게임 페이지로 이동
      window.open(`/dixit?code=${newRoom.room_code}`, '_blank')
    } catch(e) { setErrMsg('오류: ' + e.message) }
  }

  function copyLink() {
    const link = `${window.location.origin}/dixit?code=${newRoom.room_code}`
    navigator.clipboard?.writeText(link).catch(()=>{})
    setCopied(true); setTimeout(()=>setCopied(false), 2000)
  }

  return (
    <div style={S.cont}>
      {/* 설명 */}
      <div style={{background:'linear-gradient(135deg,#1a1a2e,#16213e)',borderRadius:16,padding:'20px',border:'1px solid rgba(255,215,0,0.2)',marginBottom:4}}>
        <h2 style={{fontFamily:"'Gowun Batang',serif",fontSize:fontSizePx(18),color:'#8a6d00',margin:'0 0 8px'}}>🃏 딕싯 아이스브레이킹</h2>
        <p style={{fontSize:fontSizePx(13),color:'rgba(240,240,240,0.7)',margin:'0 0 12px',lineHeight:1.7}}>
          스토리텔러가 카드를 보고 힌트를 주면, 다른 플레이어들이 그 힌트에 맞는 카드를 골라요.<br/>
          너무 쉽지도 너무 어렵지도 않게 — 상상력의 게임!
        </p>
        <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
          {['2~6명 참여','라운드제','30점 선 승리','아이스브레이킹 최적'].map(t=>(
            <span key={t} style={{background:'rgba(255,215,0,0.15)',border:'1px solid rgba(255,215,0,0.3)',borderRadius:20,padding:'4px 12px',fontSize:fontSizePx(11),color:'#8a6d00',fontWeight:600}}>{t}</span>
          ))}
        </div>
      </div>

      {/* 점수 설정 */}
      {!newRoom && (
        <div style={S.card}>
          <p style={{fontSize:fontSizePx(13),color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontWeight:700,marginBottom:12}}>게임 설정</p>
          <label style={S.label}>목표 점수 (먼저 달성하면 승리)</label>
          <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:16}}>
            <button onClick={()=>setMaxScore(s=>Math.max(10,s-5))} style={{width:36,height:36,borderRadius:8,border:'1.5px solid #ddd0ba',background:'#fff',cursor:'pointer',fontSize:fontSizePx(20),color:'#8b6e4e',display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
            <span style={{fontSize:fontSizePx(20),fontWeight:700,color:'#4a3520',minWidth:50,textAlign:'center'}}>{maxScore}점</span>
            <button onClick={()=>setMaxScore(s=>Math.min(50,s+5))} style={{width:36,height:36,borderRadius:8,border:'1.5px solid #ddd0ba',background:'#fff',cursor:'pointer',fontSize:fontSizePx(20),color:'#8b6e4e',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
          </div>
          {errMsg&&<p style={S.err}>⚠ {errMsg}</p>}
          <button onClick={handleCreate} disabled={creating}
            style={{...S.btn,background:'linear-gradient(135deg,#1a1a2e,#16213e)',border:'1px solid rgba(255,215,0,0.3)',color:'#8a6d00',fontFamily:"'Gowun Batang',serif"}}>
            {creating?'생성 중...':'🃏 게임방 만들기'}
          </button>
        </div>
      )}

      {/* 방 생성 완료 */}
      {newRoom && (
        <div style={{...S.card,background:'linear-gradient(135deg,#1a1a2e,#16213e)',border:'1px solid rgba(255,215,0,0.3)'}}>
          <p style={{fontSize:fontSizePx(12),color:'rgba(255,215,0,0.7)',margin:'0 0 8px',letterSpacing:'0.1em'}}>게임방이 만들어졌어요!</p>
          <div style={{textAlign:'center',padding:'16px 0'}}>
            <p style={{fontSize:fontSizePx(12),color:'rgba(240,240,240,0.6)',margin:'0 0 8px'}}>참여 코드</p>
            <p style={{fontFamily:'monospace',fontSize:fontSizePx(42),fontWeight:700,color:'#8a6d00',margin:'0 0 16px',letterSpacing:'0.3em'}}>{newRoom.room_code}</p>
            <div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:16}}>
              <button onClick={copyLink} style={{...S.btnSm,background:'rgba(255,215,0,0.15)',border:'1px solid rgba(255,215,0,0.3)',color:'#8a6d00'}}>
                {copied?'✓ 복사됨!':'🔗 링크 복사'}
              </button>
            </div>
            <p style={{fontSize:fontSizePx(11),color:'rgba(240,240,240,0.4)',margin:'0 0 16px'}}>청년들이 /dixit 페이지에서 이 코드로 참여해요</p>
          </div>
          {errMsg&&<p style={S.err}>⚠ {errMsg}</p>}
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>window.open(`/dixit?code=${newRoom.room_code}`,'_blank')}
              style={{flex:1,background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.2)',borderRadius:12,padding:'12px',fontSize:fontSizePx(13),color:'#f0f0f0',cursor:'pointer',fontWeight:600}}>
              👁 방 모니터링
            </button>
            <button onClick={handleStart}
              style={{flex:2,background:'linear-gradient(135deg,#ffd700,#ffab00)',color:'#1a1a2e',border:'none',borderRadius:12,padding:'12px',fontSize:fontSizePx(14),fontFamily:"'Gowun Batang',serif",fontWeight:700,cursor:'pointer'}}>
              ▶ 게임 시작하기
            </button>
          </div>
          <button onClick={()=>setNewRoom(null)} style={{width:'100%',background:'none',border:'none',color:'rgba(240,240,240,0.4)',fontSize:fontSizePx(11),cursor:'pointer',marginTop:12,textDecoration:'underline'}}>
            새 방 만들기
          </button>
        </div>
      )}

      {/* 게임 규칙 안내 */}
      <div style={S.card}>
        <p style={{fontSize:fontSizePx(12),color:'#a0784e',fontWeight:700,margin:'0 0 12px'}}>📌 게임 방법</p>
        {[
          ['1️⃣','스토리텔러가 손패 중 카드 1장을 보고 힌트를 말해요'],
          ['2️⃣','다른 플레이어들이 힌트에 맞는 카드 1장을 제출해요'],
          ['3️⃣','모든 카드를 섞어 공개 — 누구 카드인지 투표!'],
          ['4️⃣','아무도/모두 맞추면 스토리텔러 0점, 나머지 +2'],
          ['5️⃣','일부만 맞추면 스토리텔러+맞춘 사람 +3, 유인 +1'],
        ].map(([n,t])=>(
          <div key={n} style={{display:'flex',gap:10,marginBottom:8,alignItems:'flex-start'}}>
            <span style={{fontSize:fontSizePx(14),flexShrink:0}}>{n}</span>
            <p style={{fontSize:fontSizePx(12),color:'#6b5040',margin:0,lineHeight:1.65}}>{t}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 메인 ─────────────────────────────────────────────
export default function Leader() {
  const [activeTab, setActiveTab] = useState(0)
  const { fontScaleStyle, fontScaleKey, setFontScaleKey } = useFontScale()

  return (
    <>
      <Head>
        <title>광흥교회 청년부 · 시냇가에 심은 나무 WORD &amp; LIFE · 리더 도구</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <style>{`
          *{box-sizing:border-box;}
          input:focus,textarea:focus,select:focus{border-color:#a0784e!important;outline:none;}
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        `}</style>
      </Head>
      <div style={{ ...S.wrap, ...fontScaleStyle }}>
        <div style={S.header}>
          <p style={S.sub}>시냇가에 심은 나무 WORD &amp; LIFE</p>
          <h1 style={S.h1}>리더 도구</h1>
          <div style={{margin:'0 0 12px'}}>
            <FontScaleControl fontScaleKey={fontScaleKey} setFontScaleKey={setFontScaleKey} />
          </div>
          <div style={{display:'flex'}}>
            {['📖 말씀 자료','👥 셀 조 편성','🧾 회원 관리','✅ 출석 관리','📊 운영 대시보드','🃏 딕싯'].map((t,i)=>(
              <button key={i} onClick={()=>setActiveTab(i)} style={{flex:1,padding:'12px 8px',border:'none',background:'none',fontSize:fontSizePx(13),fontFamily:"'Gowun Batang',serif",color:activeTab===i?'#4a3520':'#a08060',fontWeight:activeTab===i?700:400,borderBottom:activeTab===i?'2.5px solid #a0784e':'2.5px solid transparent',cursor:'pointer',transition:'all 0.2s'}}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {activeTab===0 && <SermonTab/>}
        {activeTab===1 && <CellTab/>}
        {activeTab===2 && <MemberTab/>}
        {activeTab===3 && <AttendanceTab/>}
        {activeTab===4 && <DashboardTab/>}
        {activeTab===5 && <DixitTab/>}
      </div>
    </>
  )
}
