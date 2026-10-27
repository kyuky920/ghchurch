import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourcePacket, buildOutputSchema, buildPrompt, normalizeOutput, validateGeneratedPayload, buildReviewPrompt, validateReview, needsHumanReview } from '../local-agent/sermon-content.mjs';
import { requiresContentReview, prepareContentReviewForSave, getSharingSupport, buildEditedQuestionDocument, sharingOpeningText, sharingClosingText } from '../lib/sermon-materials.mjs';

const source = { passage:'너희가 전에는 어둠이더니 이제는 주 안에서 빛이라.', sermon_points: JSON.stringify({ transcript:'예수님 안에서 이미 빛이 되었습니다.\n\n빛의 열매는 착함과 의로움과 진실함입니다. 빛을 바라는 생활을 합니다.\n\n걱정이 올 때 예수님을 깊이 생각합니다. 믿지 않는 사람도 초청합니다.' }) };
const stages=['말씀을 점검합시다.','말씀을 통해 은혜를 나눕시다.','말씀을 따라 결단합시다.'];
function payload() {
 const q=(stage,n)=>({flow_stage:stages[stage],category:stage===0?'관찰':'성찰',explanation:stage===0?'참고 설명입니다.':'',question:`질문 ${n}은 무엇인가요?`,answer:stage===0?'주 안에서 빛이 되었기 때문입니다.':'',scripture_anchor:'에베소서 5:8',source_paragraph_ids:['P001'],is_core:true});
 return {
  sermon_summary:{key_point:'주 안에서 빛이 되었습니다.',overview:'이미 빛이 된 신분에 따라 살아갑니다.',key_point_source_paragraph_ids:['P001'],overview_source_paragraph_ids:['P001'],sections:[{title:'빛',content:'은혜로 빛이 되었습니다.',source_paragraph_ids:['P001']}]},
  questions:{sections:[{section_title:'빛',summary_anchor:'신분',questions:[q(0,1),q(1,2)]},{section_title:'열매',summary_anchor:'행실',questions:[q(0,3),q(1,4),q(2,5)]},{section_title:'생활',summary_anchor:'의지',questions:[q(1,6),q(2,7)]}],meta:{primary_theme:'주 안에서 빛이 되었습니다.',sermon_evidence:['예수님 안에서 이미 빛이 되었습니다.','빛의 열매는 착함과 의로움과 진실함입니다.'],sharing_direction:'예수님을 의지합니다.',theological_focus:[],application_focus:[],content_version:'youth-sharing-v2',opening_question:{question:'이번 주에 마음에 남았던 일 중 함께 나누고 싶은 한 가지는 무엇인가요?',explanation:'근황과 마음을 편한 범위에서 나눕니다.',source_paragraph_ids:['P001']},source_insights:[{kind:'life_situation',quote:'걱정이 올 때',paragraph_id:'P003',use:'마음 나눔'}],transcript_review:{corrections:[]},practice_options:[{text:'말하기 전에 잠깐 생각해 보세요.',origin:'suggestion',source_paragraph_ids:['P003']}],closing_prayer:'주님을 의지하도록 도와주세요.'}}
 };
}

test('원문을 치환하지 않고 안정적인 문단 ID와 원문을 제공한다',()=>{
 const before=source.sermon_points;const p=buildSourcePacket(source);
 assert.equal(p.kind,'transcript');assert.equal(p.paragraphs.length,3);assert.match(p.paragraphs[1].text,/바라는/);assert.equal(source.sermon_points,before);
 assert.deepEqual(buildSourcePacket(source),p);
});
test('원문 없는 구형 대지·본문 입력도 출처 종류를 구분한다',()=>{
 assert.equal(buildSourcePacket({sermon_points:'기존 대지'}).kind,'sermon_notes');
 assert.equal(buildSourcePacket({passage:'본문'}).kind,'scripture_only');
});
test('스키마에 모든 보조자료와 근거 ID를 요구하며 기본 3단계는 유지한다',()=>{
 const s=buildOutputSchema();assert.ok(s.properties.questions.properties.meta.required.includes('transcript_review'));
 const p=buildPrompt(source);assert.match(p,/needs_confirmation/);assert.match(p,/P001/);assert.match(p,/총 7문항/);assert.doesNotMatch(p,/금지어 치환 규칙/);
});
test('유효한 신규 결과는 근거·핵심 표시·보조자료를 정규화 후에도 보존한다',()=>{
 const p=normalizeOutput(payload(),source);assert.equal(p.questions.flat.length,7);assert.deepEqual(p.sermon_summary.sections[0].source_paragraph_ids,['P001']);assert.equal(p.questions.flat[0].is_core,true);assert.equal(getSharingSupport(p.questions).practices.length,1);
});
test('빈 상세 요약·위조 문단·교정된 가짜 발췌를 거부한다',()=>{
 let p=payload();p.sermon_summary.sections=[];assert.throws(()=>validateGeneratedPayload(p,source),/상세 요약/);
 p=payload();p.questions.sections[0].questions[0].source_paragraph_ids=['P999'];assert.throws(()=>validateGeneratedPayload(p,source),/문단 ID/);
 p=payload();p.questions.meta.source_insights[0].quote='존재하지 않는 문장';assert.throws(()=>validateGeneratedPayload(p,source),/발췌/);
});
test('녹취 교정은 원문 위치가 있어야 하며 부정어 변경을 확정하지 않는다',()=>{
 let p=payload();p.questions.meta.transcript_review.corrections=[{paragraph_id:'P002',original:'빛을 바라는',suggested:'빛을 발하는',reason:'반복된 문맥',status:'context_supported'}];assert.doesNotThrow(()=>validateGeneratedPayload(p,source));
 p.questions.meta.transcript_review.corrections[0].original='없는 발췌';assert.throws(()=>validateGeneratedPayload(p,source),/교정 대상/);
 p=payload();p.questions.meta.transcript_review.corrections=[{paragraph_id:'P003',original:'믿지 않는',suggested:'믿는',reason:'추정',status:'context_supported'}];assert.throws(()=>validateGeneratedPayload(p,source),/부정/);
 p.questions.meta.transcript_review.corrections[0].status='needs_confirmation';assert.doesNotThrow(()=>validateGeneratedPayload(p,source));
});
test('독립 검토는 원문과 결과를 다시 읽고 잘못된 근거를 거부한다',()=>{
 assert.match(buildReviewPrompt(source,payload()),/독립 검토자/);
 assert.match(buildReviewPrompt(source,payload()),/믿지 않는 사람/);
 assert.throws(()=>validateReview({summary:'문제',issues:[{severity:'blocking',target:'요약',explanation:'근거 없음',source_paragraph_ids:['P999']}]},source),/근거/);
 const review=validateReview({summary:'의미 왜곡',issues:[{severity:'blocking',target:'요약',explanation:'원문의 부정이 바뀜',source_paragraph_ids:['P003']}],status:'passed'},source);
 assert.equal(review.status,'needs_review');
});
test('확인 필요한 녹취·독립 검토 실패는 공개 목록에서 보류한다',()=>{
 const p=payload();p.questions.meta.quality_review={status:'passed',issues:[]};assert.equal(needsHumanReview(p),false);assert.equal(requiresContentReview(p.questions),false);
 p.questions.meta.transcript_review.corrections=[{status:'needs_confirmation'}];assert.equal(needsHumanReview(p),true);assert.equal(requiresContentReview(p.questions),true);
 p.questions.meta.human_review={confirmed_at:'2026-10-27T01:00:00Z'};assert.equal(requiresContentReview(p.questions),false);
 delete p.questions.meta.human_review;p.questions.meta.transcript_review.corrections=[];p.questions.meta.quality_review.status='not_run';assert.equal(requiresContentReview(p.questions),true);
});
test('구형 배열과 기존 자료는 별도 검토 없이 읽고 공개할 수 있다',()=>{
 assert.equal(requiresContentReview([{question:'기존 질문'}]),false);assert.equal(requiresContentReview({meta:{}}),false);assert.equal(getSharingSupport('잘못된 JSON').opening,null);
 assert.deepEqual(buildEditedQuestionDocument([], [{question:'수정'}]),[{question:'수정'}]);
});
test('편집 시 보조자료·근거는 남기고 이전 공개 결정을 무효화한다',()=>{
 const p=normalizeOutput(payload(),source).questions;p.meta.human_review={confirmed_at:'이전 승인'};
 const edited=p.flat.map(x=>({...x,question:'수정된 질문'}));const result=buildEditedQuestionDocument(p,edited);
 assert.equal(result.meta.opening_question.question,p.meta.opening_question.question);assert.equal(result.flat[0].question,'수정된 질문');assert.equal(result.flat[0].source_paragraph_ids[0],'P001');assert.equal(result.meta.human_review,undefined);assert.equal(requiresContentReview(result),true);assert.equal(p.meta.human_review.confirmed_at,'이전 승인');
});
test('카톡 공유에 여는 질문과 실천을 포함하고 기존 기도 제안은 제외한다',()=>{
 const p=payload().questions;assert.match(sharingOpeningText(p),/이번 주에 마음에 남았던 일/);assert.match(sharingClosingText(p),/제안한 예시/);assert.doesNotMatch(sharingClosingText(p),/기도 초안|주님을 의지하도록 도와주세요/);assert.equal(getSharingSupport(p).closingPrayer,undefined);
});

 test('서버 저장도 부분 요약 편집의 이전 검토를 무효화하고 명시적 확인만 공개한다',()=>{
 const old=payload().questions;old.meta.human_review={confirmed_at:'old'};old.meta.quality_review={status:'passed'};
 const changed=prepareContentReviewForSave(old,old,false);assert.equal(requiresContentReview(changed),true);assert.equal(changed.meta.human_review,undefined);
 const approved=prepareContentReviewForSave(old,changed,true,'2026-10-27T00:00:00Z');assert.equal(requiresContentReview(approved),false);assert.equal(approved.meta.human_review.confirmed_at,'2026-10-27T00:00:00Z');
 const flat=prepareContentReviewForSave(old,old.sections.flatMap(x=>x.questions),false);assert.equal(flat.meta.opening_question.question,old.meta.opening_question.question);assert.equal(requiresContentReview(flat),true);
});


test('설교 기억을 요구하는 질문과 설교·화자 서술 요약을 거부한다',()=>{
 for (const field of ['question','explanation','answer']) {
  const p=payload();p.questions.sections[0].questions[0][field]='목사님은 무엇이라고 설명하셨나요?';
  assert.throws(()=>validateGeneratedPayload(p,source),/설교 청취/);
 }
 const p=payload();p.sermon_summary.overview='목사님은 예수님을 의지하도록 권면하셨습니다.';
 assert.throws(()=>validateGeneratedPayload(p,source),/말씀 요약/);
 p.sermon_summary.overview='주 안에서 빛인 우리는 빛의 자녀들처럼 행해야 합니다.';
 p.questions.sections[0].questions[0].scripture_anchor='';
 assert.throws(()=>validateGeneratedPayload(p,source),/성경 본문 장절/);
});
test('독립 검토는 화자만 삭제한 설교 의존 문항과 소품 경험 질문도 살핀다',()=>{
 const prompt=buildReviewPrompt(source,payload());
 assert.match(prompt,/화자 표현을 지웠더라도/);assert.match(prompt,/본문만 읽고/);assert.match(prompt,/소품 사용 경험/);
});


test('일반적인 마음 열기는 억지 문단 근거 없이 작성하되 가짜 ID는 거부한다',()=>{
 const p=payload();p.questions.meta.opening_question.source_paragraph_ids=[];
 assert.doesNotThrow(()=>validateGeneratedPayload(p,source));
 p.questions.meta.opening_question.source_paragraph_ids=['P999'];assert.throws(()=>validateGeneratedPayload(p,source),/문단 ID/);
});
test('명시적 게시 요청에 따른 텍스트 검토는 원음 확인과 구분하고 편집 시 취소한다',()=>{
 const p=normalizeOutput(payload(),source).questions;
 p.meta.quality_review={status:'passed',issues:[]};p.meta.requires_review=true;
 const correction={paragraph_id:'P002',original:'빛을 바라는',status:'needs_confirmation'};
 p.meta.transcript_review.corrections=[correction];
 p.meta.publication_review={status:'approved',authorized_by:'user_publish_request',basis:'source_text_and_scripture',audio_verified:false,reviewed_at:'2026-10-27T03:00:00Z',excluded_ambiguous_readings:[]};
 assert.equal(requiresContentReview(p),true);
 p.meta.publication_review.excluded_ambiguous_readings=[{paragraph_id:correction.paragraph_id,original:correction.original,treatment:'ambiguous_reading_not_used',note:'확정할 수 있는 다른 본문 근거만 사용했습니다.'}];
 assert.equal(requiresContentReview(p),false);
 const changed=buildEditedQuestionDocument(p,p.flat);assert.equal(changed.meta.publication_review,undefined);assert.equal(requiresContentReview(changed),true);
 const partial=prepareContentReviewForSave(p,p,false);assert.equal(partial.meta.publication_review,undefined);assert.equal(requiresContentReview(partial),true);
 p.meta.quality_review.status='needs_review';assert.equal(requiresContentReview(p),true);
});

test('핵심·개요·단락 제목·본문의 설교 설명을 막고 본문 중심 직접 서술은 허용한다',()=>{
 for (const field of ['key_point','overview','title','content']) {
  const p=payload(); const target=['title','content'].includes(field)?p.sermon_summary.sections[0]:p.sermon_summary;
  target[field]='설교에서는 빛의 자녀로 살라고 권면합니다.';
  assert.throws(()=>validateGeneratedPayload(p,source),/말씀 요약/);
 }
 assert.doesNotThrow(()=>validateGeneratedPayload(payload(),source));
 assert.match(buildPrompt(source),/본문으로 뒷받침되지 않는/);
 assert.match(buildReviewPrompt(source,payload()),/성경 본문의 실제 표현과 요약/);
});
