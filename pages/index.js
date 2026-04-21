import { useState, useEffect } from 'react'
import Head from 'next/head'

const QMETA = [
  { type:'말씀 속으로',  color:'#a0784e', bg:'#fdf5ec' },
  { type:'내 이야기',    color:'#c4956a', bg:'#fef8f0' },
  { type:'함께 나눔',    color:'#7a9e7e', bg:'#f0f7f1' },
  { type:'이번 주 실천', color:'#6b8f71', bg:'#edf4ee' },
]

function weekLabel(week) {
  const [y,w] = week.split('-W').map(Number)
  const jan1 = new Date(y,0,1)
  const sun = new Date(jan1)
  sun.setDate(jan1.getDate()+(w-1)*7-(jan1.getDay()||7)+7)
  return `${sun.getMonth()+1}월 ${sun.getDate()}일 주`
}
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
  const [ck, setCk]             = useState('')

  useEffect(() => {
    fetch('/api/sermons').then(r=>r.json()).then(d=>{
      if (d.ok) { setSermons(d.data||[]); if(d.data?.length) setSelected(d.data[0]) }
      else setError(d.error)
    }).catch(e=>setError(e.message)).finally(()=>setLoading(false))
  },[])

  function copy(text,key) { doCopy(text); setCk(key); setTimeout(()=>setCk(''),2000) }

  const TABS = ['나눔 질문','주간 묵상','말씀카드']

  // Supabase에서 JSON string으로 올 수 있어서 파싱 처리
  const parseField = (val) => {
    if (!val) return []
    if (Array.isArray(val)) return val
    if (typeof val === 'string') {
      try { return JSON.parse(val) } catch(e) { return [] }
    }
    return []
  }
  const qs   = parseField(selected?.questions)
  const meds = parseField(selected?.meditations)

  const grouped = sermons.reduce((acc,s)=>{
    if(!acc[s.week]) acc[s.week]=[]
    acc[s.week].push(s); return acc
  },{})

  const CopyBtn = ({text,id,label}) => (
    <button onClick={()=>copy(text,id)} style={{width:'100%',background:'#fff',border:'1.5px solid #ddd0ba',borderRadius:12,padding:'13px',fontSize:13,color:'#8b6e4e',fontWeight:700,fontFamily:"'Gowun Batang',serif",cursor:'pointer'}}>
      {ck===id ? '✓ 복사됨!' : label}
    </button>
  )

  return (
    <>
      <Head>
        <title>말씀 나눔 · WORD &amp; LIFE</title>
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
          <p style={{fontSize:10,color:'#8b6e4e',letterSpacing:'0.2em',fontWeight:600,margin:'0 0 6px'}}>WORD &amp; LIFE</p>
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
              {/* 주차/예배 선택 */}
              <div style={{marginBottom:14}}>
                {Object.entries(grouped).map(([wk,items])=>(
                  <div key={wk} style={{marginBottom:12}}>
                    <p style={{fontSize:11,color:'#a08060',fontWeight:700,margin:'0 0 8px'}}>{weekLabel(wk)}</p>
                    <div style={{display:'flex',gap:8}}>
                      {items.map(s=>{
                        const isMorn=s.service==='morning'
                        const isSel=selected?.id===s.id
                        return (
                          <button key={s.id} onClick={()=>{setSelected(s);setTab(0)}}
                            style={{flex:1,padding:'10px 12px',borderRadius:12,border:`2px solid ${isSel?(isMorn?'#f6a623':'#7a6e9e'):'#e8dcc8'}`,background:isSel?(isMorn?'#fff8ec':'#f5f3fa'):'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6,fontFamily:"'Noto Sans KR',sans-serif"}}>
                            <span>{isMorn?'☀️':'🌙'}</span>
                            <span style={{fontSize:12,fontWeight:700,color:isSel?(isMorn?'#e8901a':'#7a6e9e'):'#b8a090'}}>{isMorn?'오전':'오후'}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {selected && (
                <>
                  {/* 말씀 정보 */}
                  <div style={{...S.card,marginBottom:14}}>
                    <span style={{background:selected.service==='morning'?'linear-gradient(135deg,#f6a623,#e8901a)':'linear-gradient(135deg,#7a6e9e,#5a5080)',borderRadius:6,padding:'3px 10px',color:'#fff',fontSize:11,fontWeight:700,display:'inline-block',marginBottom:8}}>
                      {selected.service==='morning'?'주일 오전':'주일 오후'}
                    </span>
                    <h2 style={{fontFamily:"'Gowun Batang',serif",fontSize:18,color:'#4a3520',fontWeight:700,margin:'0 0 2px'}}>{selected.reference}</h2>
                    {selected.sermon_title&&<p style={{fontSize:13,color:'#8b6e4e',margin:0}}>{selected.sermon_title}</p>}
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

                  {/* 탭 0: 나눔 질문 */}
                  {tab===0 && (
                    <div style={{display:'flex',flexDirection:'column',gap:12}}>
                      {selected.passage && (
                        <div style={S.card}>
                          <p style={{fontSize:11,color:'#a0784e',fontWeight:700,letterSpacing:'0.08em',margin:'0 0 8px'}}>📖 {selected.reference} · 개역개정</p>
                          <p style={{color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontSize:13,lineHeight:2.1,margin:0,whiteSpace:'pre-line'}}>{selected.passage}</p>
                        </div>
                      )}
                      <p style={{fontFamily:"'Gowun Batang',serif",fontSize:13,color:'#8b6e4e',margin:'4px 0'}}>✦ {selected.reference} 나눔 질문</p>
                      {qs.map((item,i)=>{
                        const q=typeof item==='string'?item:item.question
                        const ex=typeof item==='object'?item.explanation:''
                        const m=QMETA[i]||QMETA[0]
                        return (
                          <div key={i} style={{background:m.bg,borderRadius:14,padding:'16px 18px',borderLeft:`4px solid ${m.color}`,animation:`fadeUp 0.4s ease ${i*0.1}s both`}}>
                            <p style={{fontSize:10,color:m.color,fontWeight:700,margin:'0 0 7px',letterSpacing:'0.06em'}}>{m.type}</p>
                            {ex&&<div style={{background:'rgba(255,255,255,0.65)',borderRadius:8,padding:'9px 12px',marginBottom:8,borderLeft:`2px solid ${m.color}60`}}><p style={{margin:0,color:'#6b5040',fontSize:12,lineHeight:1.8}}>{ex}</p></div>}
                            <p style={{margin:0,color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontSize:15,lineHeight:1.85,fontWeight:700}}>{q}</p>
                          </div>
                        )
                      })}
                      <CopyBtn
                        text={`✦ ${selected.reference} 나눔 질문\n\n${qs.map((item,i)=>{const q=typeof item==='string'?item:item.question;const ex=typeof item==='object'&&item.explanation?item.explanation+'\n':'';return `[${(QMETA[i]||QMETA[0]).type}]\n${ex}Q${i+1}. ${q}`}).join('\n\n')}`}
                        id="q" label="📋 전체 복사 (카톡 공유용)"
                      />
                    </div>
                  )}

                  {/* 탭 1: 주간 묵상 */}
                  {tab===1 && (
                    <div style={{display:'flex',flexDirection:'column',gap:12}}>
                      <p style={{fontFamily:"'Gowun Batang',serif",fontSize:13,color:'#8b6e4e',margin:'4px 0 8px'}}>✦ {selected.reference} 주간 묵상</p>
                      {meds.map((m,i)=>(
                        <div key={i} style={{...S.card,animation:`fadeUp 0.3s ease ${i*0.07}s both`}}>
                          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                            <span style={{background:'linear-gradient(135deg,#a0784e,#c4956a)',color:'#fff',borderRadius:8,padding:'3px 12px',fontSize:12,fontWeight:700}}>{m.day}요일</span>
                            <span style={{color:'#a0784e',fontSize:13,fontFamily:"'Gowun Batang',serif",fontStyle:'italic'}}>"{m.focus}"</span>
                          </div>
                          <p style={{margin:0,color:'#4a3728',fontFamily:"'Gowun Batang',serif",fontSize:14,lineHeight:1.9}}>{m.message}</p>
                        </div>
                      ))}
                      <CopyBtn
                        text={`✦ ${selected.reference} 주간 묵상\n\n${meds.map(m=>`[${m.day}요일]\n"${m.focus}"\n\n${m.message}`).join('\n\n─────\n\n')}`}
                        id="med" label="📋 전체 복사 (카톡 공유용)"
                      />
                    </div>
                  )}

                  {/* 탭 2: 말씀카드 */}
                  {tab===2 && (
                    <div style={{display:'flex',flexDirection:'column',gap:16}}>
                      <p style={{fontFamily:"'Gowun Batang',serif",fontSize:13,color:'#8b6e4e',margin:'4px 0'}}>✦ 이번 주 말씀카드</p>
                      <div style={{background:'linear-gradient(135deg,#a0784e,#7a5c38,#c4956a)',borderRadius:20,padding:'36px 28px',position:'relative',overflow:'hidden',boxShadow:'0 12px 40px rgba(160,120,78,0.35)'}}>
                        <div style={{position:'absolute',top:-30,right:-30,width:140,height:140,borderRadius:'50%',background:'rgba(255,255,255,0.07)'}}/>
                        <div style={{position:'absolute',bottom:-20,left:-20,width:90,height:90,borderRadius:'50%',background:'rgba(255,255,255,0.05)'}}/>
                        <p style={{color:'rgba(245,230,208,0.8)',fontSize:10,letterSpacing:'0.2em',margin:'0 0 14px'}}>✦ 이번 주 말씀 · 개역개정</p>
                        <p style={{color:'#fff',fontFamily:"'Gowun Batang',serif",fontSize:19,lineHeight:1.95,margin:'0 0 18px',fontStyle:'italic'}}>"{selected.card_verse}"</p>
                        <p style={{color:'rgba(245,230,208,0.8)',fontSize:12,margin:0,fontFamily:"'Gowun Batang',serif"}}>{selected.reference} · 개역개정</p>
                      </div>
                      <CopyBtn
                        text={`✦ 이번 주 말씀 (개역개정)\n\n"${selected.card_verse}"\n\n— ${selected.reference}`}
                        id="card" label="📋 말씀카드 복사"
                      />
                    </div>
                  )}
                </>
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
