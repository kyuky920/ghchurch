import { readQuestionDocument } from '../lib/sermon-materials.mjs'

export default function SermonReviewNotice({ questions, sourceText }) {
  const meta = readQuestionDocument(questions)?.meta
  if (meta?.content_version !== 'youth-sharing-v2' && !meta?.revision_review) return null
  const corrections = meta.transcript_review?.corrections || []
  return <div style={{background:'#fff8e8',border:'1px solid #e8c989',borderRadius:12,padding:16,lineHeight:1.8}}>
    <strong>원문과 생성 자료 확인</strong>
    <p>원문 녹취는 보존됩니다. 아래 교정은 문맥에 따른 제안이며, 원음 확인이 필요한 표현은 녹음과 대조해 주세요.</p>
    {corrections.length ? <ul>{corrections.map((c,i)=><li key={i}><strong>{c.status === 'needs_confirmation' ? '원음 확인 필요' : '문맥에 따른 교정 제안'}</strong> · {c.paragraph_id}<br/>원문: {c.original}<br/>후보: {c.suggested || '확정하지 않음'}<br/>{c.reason}</li>)}</ul> : <p>AI가 기록한 녹취 확인 항목은 없습니다. 오류가 없음을 보장하는 것은 아닙니다.</p>}
    {meta.revision_review && <p>부분 수정 검토: {meta.revision_review.review?.summary || '검토 결과 없음'}</p>}
    <p>독립 검토: {meta.quality_review?.summary || '검토 결과 없음'}</p>
    {!!meta.quality_review?.issues?.length && <ul>{meta.quality_review.issues.map((x,i)=><li key={i}>{x.severity === 'blocking' ? '공개 전 확인' : '개선 참고'} · {x.target}: {x.explanation} ({x.source_paragraph_ids?.join(', ')})</li>)}</ul>}
    <details><summary>보존된 설교 입력 자료 보기</summary><pre style={{whiteSpace:'pre-wrap',maxHeight:360,overflow:'auto'}}>{sourceText || '입력 자료가 없습니다.'}</pre></details>
  </div>
}
