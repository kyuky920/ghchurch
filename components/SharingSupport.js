import { fontSizePx } from '../hooks/useFontScale'
import { getSharingSupport } from '../lib/sermon-materials.mjs'

const box = { background:'#fff', borderRadius:16, padding:'16px 18px', border:'1px solid #e8dcc8', color:'#3f3124', fontSize:fontSizePx(14), lineHeight:1.8 }

export default function SharingSupport({ document, position, fallbackOpening }) {
  const support = getSharingSupport(document)
  if (position === 'opening') {
    const opening = support.opening || fallbackOpening
    return <>
      <details className="capture-exclude" style={{...box, background:'#faf7f2'}}>
        <summary style={{cursor:'pointer',fontWeight:700}}>모임 진행 안내 · 45분 기준</summary>
        <p>마음 열기 5분 → 본문·요약 읽기 5분 → 말씀 이해 8분 → 삶 나눔 17분 → 실천 선택 5분 → 서로 기도 5분</p>
        <p>시간과 인원에 맞게 질문을 골라 나누세요.{support.version ? ' ★ 질문은 먼저 나누기 좋은 핵심 질문입니다.' : ''} 말하기 어려운 질문은 넘어가도 괜찮습니다. 참고 답안은 각자 생각을 나눈 뒤 함께 확인해 보세요.</p>
      </details>
      <div data-capture-block style={box}>
        <p style={{margin:'0 0 10px',color:'#8b6e4e',fontWeight:700}}>마음을 열고 말씀으로 이어가요</p>
        <p style={{margin:0,fontWeight:700,fontSize:'1.05em'}}>{opening?.question}</p>
        {opening?.explanation && <p style={{margin:'10px 0 0'}}>{opening.explanation}</p>}
      </div>
    </>
  }
  if (!support.practices.length && !support.closingPrayer) return null
  return <div data-capture-block style={box}>
    {support.practices.length > 0 && <>
      <p style={{fontWeight:700,margin:'0 0 8px'}}>이번 주 실천 · 한 가지만 선택해요</p>
      <p>아래 예시 중 하나를 고르거나, 자신의 상황에 맞는 행동을 직접 정해 보세요.</p>
      <ul style={{paddingLeft:22}}>{support.practices.map((p,i)=><li key={i} style={{marginBottom:10}}>{p.text}<br/><small style={{color:'#8b6e4e'}}>{p.origin === 'sermon' ? '설교에서 제시한 실천' : '말씀에 따라 제안한 예시'}</small></li>)}</ul>
    </>}
    {support.closingPrayer && <details style={{marginTop:12}}><summary style={{cursor:'pointer',fontWeight:700}}>마무리 기도 초안</summary><p style={{whiteSpace:'pre-line'}}>{support.closingPrayer}</p></details>}
  </div>
}
