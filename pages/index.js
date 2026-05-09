import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import html2canvas from 'html2canvas'

const QMETA = [
  { type:'말씀 속으로',  color:'#a0784e', bg:'#fdf5ec' },
  { type:'내 이야기',    color:'#c4956a', bg:'#fef8f0' },
  { type:'함께 나눔',    color:'#7a9e7e', bg:'#f0f7f1' },
  { type:'이번 주 실천', color:'#6b8f71', bg:'#edf4ee' },
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

function weekLabel(week) {
  if (!week) return ''
  // YYYY-MM-DD 형식
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    const d = new Date(week + 'T00:00:00')
    if (isNaN(d.getTime())) return week
    return `${d.getMonth() + 1}월 ${d.getDate()}일 주`
  }
  // 구형식 YYYY-Www 처리 (하위 호환)
  if (/^\d{4}-W\d{2}$/.test(week)) {
    const [y, w] = week.split('-W').map(Number)
    const jan1 = new Date(y, 0, 1)
    const sun = new Date(jan1)
    sun.setDate(jan1.getDate() + (w - 1) * 7 - (jan1.getDay() || 7) + 7)
    return `${sun.getMonth() + 1}월 ${sun.getDate()}일 주`
  }
  return week
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
const S = {
  wrap:   { minHeight:'100vh', background:'#faf6f0', fontFamily:"'Noto Sans KR',sans-serif" },
  header: { background:'linear-gradient(160deg,#e8dcc8,#d4c4a8)', padding:'28px 20px 22px', borderBottom:'1px solid #c8b898', position:'relative', overflow:'hidden' },
  cont:   { maxWidth:640, margin:'0 auto', padding:'16px 16px 48px' },
  card:   { background:'#fff', borderRadius:14, padding:'16px 18px', border:'1px solid #e8d8c0' },
}

export default function Home() {
  const [sermons, setSermons]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [selected, setSelected] = useState(null)
  const [tab, setTab]           = useState(0)
  const [savingImage, setSavingImage] = useState(false)

  const [selectedWeek, setSelectedWeek] = useState(null)

  const router = useRouter()
  const captureRef = useRef(null)

  useEffect(() => {
    fetch('/api/sermons').then(r=>r.json()).then(d=>{
      if (d.ok) {
        const list = [...(d.data || [])].sort((a, b) => {
          const aWeek = weekToComparableDate(a?.week)
          const bWeek = weekToComparableDate(b?.week)
          if (aWeek && bWeek && aWeek !== bWeek) return bWeek.localeCompare(aWeek)
          if (a?.service !== b?.service) return a?.service === 'morning' ? -1 : 1
          return (b?.id || 0) - (a?.id || 0)
        })
        setSermons(list)
        if (list.length) {
          // URL 파라미터로 주차/예배/탭 설정 (셀 모임 시작 시)
          const qWeek    = router.query.week
          const qService = router.query.service
          const qTab     = router.query.tab

          const targetWeek = qWeek || list[0].week
          setSelectedWeek(targetWeek)

          const target = (qWeek && qService)
            ? list.find(s => s.week === qWeek && s.service === qService)
            : list.find(s => s.week === targetWeek && s.service === 'morning')
          setSelected(target || list[0])

          if (qTab !== undefined) {
            const parsedTab = Number(qTab)
            // 구버전 호환: 0(요약), 1(질문) -> 신버전 1(요약), 2(질문)
            if (parsedTab === 0) setTab(1)
            else if (parsedTab === 1) setTab(2)
            else if (parsedTab >= 0 && parsedTab <= 2) setTab(parsedTab)
          }
        }
      } else setError(d.error)
    }).catch(e=>setError(e.message)).finally(()=>setLoading(false))
  },[router.query])

  const TABS = ['성경말씀','말씀 요약','나눔질문']

  // Supabase에서 JSON string으로 올 수 있어서 파싱 처리
  const parseField = (val) => {
    if (!val) return []
    if (Array.isArray(val)) return val
    if (typeof val === 'object') return val
    if (typeof val === 'string') {
      try { return JSON.parse(val) } catch(e) { return [] }
    }
    return []
  }
  const qs      = normalizeQuestions(parseField(selected?.questions))
  const summary = (() => {
    const s = selected?.sermon_summary
    if (!s) return null
    if (typeof s === 'object') return s
    try { return JSON.parse(s) } catch(e) { return null }
  })()

  const grouped = sermons.reduce((acc,s)=>{
    if(!acc[s.week]) acc[s.week]=[]
    acc[s.week].push(s); return acc
  },{})
  // 각 주차 내에서 오전→오후 순으로 정렬
  Object.keys(grouped).forEach(wk => {
    grouped[wk].sort((a,b) => a.service === 'morning' ? -1 : 1)
  })
  const sortedWeeks = Object.keys(grouped).sort((a,b) => {
    const aa = weekToComparableDate(a)
    const bb = weekToComparableDate(b)
    return bb.localeCompare(aa)
  })

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
      const safeRef = (selected.reference || 'wordlife').replace(/[^\w\-가-힣]+/g, '_')
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
        <title>광흥교회 청년부 · 시냇가에 심은 나무 WORD &amp; LIFE</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <style>{`
          *{box-sizing:border-box;}
          @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
          @keyframes spin{to{transform:rotate(360deg)}}
          .tab-bar::-webkit-scrollbar{display:none}
          .tab-bar{-ms-overflow-style:none;scrollbar-width:none}
        `}</style>
      </Head>
      <div style={S.wrap}>
        {/* 헤더 */}
        <div style={S.header}>
          <div style={{position:'absolute',top:-40,right:-40,width:200,height:200,borderRadius:'50%',background:'rgba(255,255,255,0.08)'}}/>
          <p style={{fontSize:10,color:'#8b6e4e',letterSpacing:'0.2em',fontWeight:600,margin:'0 0 6px'}}>시냇가에 심은 나무 WORD &amp; LIFE</p>
          <h1 style={{fontFamily:"'Gowun Batang',serif",fontSize:24,color:'#4a3520',fontWeight:700,margin:'0 0 2px'}}>말씀 나눔</h1>
          <p style={{fontSize:12,color:'#8b6e4e',margin:0}}>청년부 주간 말씀 &amp; 묵상 가이드</p>
        </div>

        <div style={S.cont}>
          {loading && (
            <div style={{textAlign:'center',padding:48,display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
              <div style={{width:32,height:32,borderRadius:'50%',border:'3px solid #e8dcc8',borderTop:'3px solid #a0784e',animation:'spin 0.9s linear infinite'}}/>
              <p style={{color:'#a0784e',fontSize:13}}>불러오는 중...</p>
            </div>
          )}
          {!loading && error && <p style={{color:'#c0392b',fontSize:13,padding:20}}>⚠ {error}</p>}

          {!loading && !error && (
            <>
              {/* 주차 선택 드롭다운 */}
              {sortedWeeks.length > 0 && (
                <div style={{marginBottom:14}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                    <label style={{fontSize:12,color:'#8b6e4e',fontWeight:700,whiteSpace:'nowrap'}}>주차 선택</label>
                    <select
                      value={selectedWeek || ''}
                      onChange={e => {
                        const wk = e.target.value
                        setSelectedWeek(wk)
                        setTab(0)
                        const items = grouped[wk] || []
                        const first = items.find(s=>s.service==='morning') || items[0]
                        if (first) setSelected(first)
                      }}
                      style={{flex:1,padding:'10px 14px',border:'1.5px solid #ddd0ba',borderRadius:10,fontSize:14,background:'#fff',color:'#4a3520',outline:'none',fontFamily:"'Noto Sans KR',sans-serif",cursor:'pointer'}}
                    >
                      {sortedWeeks.map(wk=>(
                        <option key={wk} value={wk}>{weekLabel(wk)}</option>
                      ))}
                    </select>
                  </div>

                  {/* 선택된 주차의 오전/오후 버튼 */}
                  {selectedWeek && grouped[selectedWeek] && (
                    <div style={{display:'flex',gap:8}}>
                      {grouped[selectedWeek].map(s=>{
                        const isMorn = s.service==='morning'
                        const isSel  = selected?.id===s.id
                        return (
                          <button key={s.id} onClick={()=>{setSelected(s);setTab(0)}}
                            style={{flex:1,padding:'11px 12px',borderRadius:12,border:`2px solid ${isSel?(isMorn?'#f6a623':'#7a6e9e'):'#e8dcc8'}`,background:isSel?(isMorn?'#fff8ec':'#f5f3fa'):'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6,fontFamily:"'Noto Sans KR',sans-serif",transition:'all 0.2s'}}>
                            <span style={{fontSize:16}}>{isMorn?'☀️':'🌙'}</span>
                            <div style={{textAlign:'left'}}>
                              <p style={{fontSize:12,fontWeight:700,color:isSel?(isMorn?'#e8901a':'#7a6e9e'):'#b8a090',margin:0}}>{isMorn?'주일 오전':'주일 오후'}</p>
                              <p style={{fontSize:10,color:'#c4a882',margin:0}}>{s.reference}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {selected && (
                <div ref={captureRef} style={{display:'flex',flexDirection:'column'}}>
                  {/* 말씀 정보 */}
                  <div style={{...S.card,marginBottom:14}}>
                    <span style={{background:selected.service==='morning'?'linear-gradient(135deg,#f6a623,#e8901a)':'linear-gradient(135deg,#7a6e9e,#5a5080)',borderRadius:6,padding:'3px 10px',color:'#fff',fontSize:11,fontWeight:700,display:'inline-block',marginBottom:8}}>
                      {selected.service==='morning'?'주일 오전':'주일 오후'}
                    </span>
                    <h2 style={{fontFamily:"'Gowun Batang',serif",fontSize:18,color:'#4a3520',fontWeight:700,margin:'0 0 2px'}}>{selected.sermon_title || selected.reference}</h2>
                    {selected.sermon_title && selected.reference && <p style={{fontSize:13,color:'#8b6e4e',margin:0}}>{selected.reference}</p>}
                  </div>

                  {/* 탭 */}
                  <div className="tab-bar" style={{background:'#fff',display:'flex',borderTop:'1px solid #e8dcc8',borderBottom:'1px solid #e8dcc8',marginBottom:16,position:'sticky',top:0,zIndex:10}}>
                    {TABS.map((t,i)=>(
                      <button key={i} onClick={()=>setTab(i)}
                        style={{flex:1,padding:'13px 8px',border:'none',background:'none',fontSize:13,fontFamily:"'Gowun Batang',serif",color:tab===i?'#8b6e4e':'#bba888',fontWeight:tab===i?700:400,borderBottom:tab===i?'2.5px solid #a0784e':'2.5px solid transparent',cursor:'pointer',whiteSpace:'nowrap'}}>
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* 탭 0: 성경말씀 */}
                  {tab===0 && (
                    <div style={{display:'flex',flexDirection:'column',gap:12}}>
                      {selected.passage ? (
                        <div style={S.card}>
                          <p style={{fontSize:11,color:'#a0784e',fontWeight:700,letterSpacing:'0.08em',margin:'0 0 8px'}}>📖 {selected.reference} · 개역개정</p>
                          <p style={{color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontSize:13,lineHeight:2.1,margin:0,whiteSpace:'pre-line'}}>{selected.passage}</p>
                        </div>
                      ) : (
                        <div style={{textAlign:'center',padding:'40px 20px',color:'#b8a090'}}>
                          <p style={{fontSize:13}}>본문 말씀을 불러오는 중...</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 탭 1: 말씀 요약 */}
                  {tab===1 && (
                    <div style={{display:'flex',flexDirection:'column',gap:14}}>
                      {!summary ? (
                        <div style={{textAlign:'center',padding:'40px 20px',color:'#b8a090'}}>
                          <p style={{fontSize:13}}>말씀 요약을 불러오는 중...</p>
                        </div>
                      ) : (
                        <>
                          {/* 핵심 메시지 */}
                          <div style={{background:'linear-gradient(135deg,#a0784e,#c4956a)',borderRadius:16,padding:'20px 22px',position:'relative',overflow:'hidden'}}>
                            <div style={{position:'absolute',top:-20,right:-20,width:100,height:100,borderRadius:'50%',background:'rgba(255,255,255,0.08)'}}/>
                            <p style={{color:'rgba(245,230,208,0.85)',fontSize:10,letterSpacing:'0.15em',margin:'0 0 10px',fontWeight:600}}>✦ 핵심 메시지</p>
                            <p style={{color:'#fff',fontFamily:"'Gowun Batang',serif",fontSize:16,lineHeight:1.85,margin:0,fontWeight:700}}>{summary.key_point}</p>
                          </div>
                          {/* 전체 흐름 */}
                          <div style={{background:'#fff',borderRadius:14,padding:'18px 20px',border:'1px solid #e8d8c0'}}>
                            <p style={{fontSize:11,color:'#a0784e',fontWeight:700,letterSpacing:'0.08em',margin:'0 0 10px'}}>📖 전체 흐름</p>
                            <p style={{color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontSize:14,lineHeight:1.95,margin:0}}>{summary.overview}</p>
                          </div>
                          {/* 단락별 요약 */}
                          {summary.sections && summary.sections.map((sec,i) => (
                            <div key={i} style={{background:'#fdf5ec',borderRadius:14,padding:'16px 18px',border:'1px solid #e8d8c0',borderLeft:'4px solid #c4956a',animation:`fadeUp 0.3s ease ${i*0.1}s both`}}>
                              <p style={{fontSize:12,color:'#a0784e',fontWeight:700,margin:'0 0 8px'}}>{sec.title}</p>
                              <p style={{color:'#4a3728',fontFamily:"'Gowun Batang',serif",fontSize:14,lineHeight:1.9,margin:0}}>{sec.content}</p>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}

                  {/* 탭 2: 나눔 질문 */}
                  {tab===2 && (
                    <div style={{display:'flex',flexDirection:'column',gap:12}}>
                      <p style={{fontFamily:"'Gowun Batang',serif",fontSize:13,color:'#8b6e4e',margin:'4px 0'}}>✦ {selected.reference} 나눔 질문</p>
                      {qs.map((item,i)=>{
                        const q=item.question
                        const ex=item.explanation
                        const m=QMETA[i]||QMETA[0]
                        return (
                          <div key={i} style={{background:m.bg,borderRadius:14,padding:'16px 18px',borderLeft:`4px solid ${m.color}`,animation:`fadeUp 0.4s ease ${i*0.1}s both`}}>
                            <p style={{fontSize:10,color:m.color,fontWeight:700,margin:'0 0 7px',letterSpacing:'0.06em'}}>{item.section_title || item.category || m.type}</p>
                            {ex&&<div style={{background:'rgba(255,255,255,0.65)',borderRadius:8,padding:'9px 12px',marginBottom:8,borderLeft:`2px solid ${m.color}60`}}><p style={{margin:0,color:'#6b5040',fontSize:12,lineHeight:1.8}}>{ex}</p></div>}
                            <p style={{margin:0,color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontSize:15,lineHeight:1.85,fontWeight:700}}>{q}</p>
                          </div>
                        )
                      })}
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

              {sermons.length===0 && (
                <div style={{textAlign:'center',padding:'60px 20px',color:'#b8a090'}}>
                  <p style={{fontSize:48,marginBottom:12}}>📖</p>
                  <p style={{fontFamily:"'Gowun Batang',serif",fontSize:15}}>아직 등록된 말씀이 없어요</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
