import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { requiresContentReview, prepareContentReviewForSave } from '../lib/sermon-materials.mjs';

function load(path, database) {
 const source=fs.readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace('export default async function handler','return async function handler');
 return new Function('supabase','requiresContentReview','prepareContentReviewForSave',source)(database,requiresContentReview,prepareContentReviewForSave);
}
function response(){return {code:200,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(){return this;}};}
const questionDoc=()=>({sections:[],meta:{content_version:'youth-sharing-v2',requires_review:true,quality_review:{status:'needs_review'}}});
function db(rows){
 const state={updated:null};
 return {state,from(){return {select(){return this;},eq(){return this;},order(){return this;},update(v){state.updated=v;return this;},async single(){return {data:state.updated?{...rows[0],...state.updated}:rows[0],error:null};},then(resolve,reject){return Promise.resolve({data:rows,error:null}).then(resolve,reject);}};}};
}

test('일반 설교 목록은 신규 검토 대기 자료만 보류하고 구형·검토완료 자료를 제공한다',async()=>{
 const pending={id:1,questions:JSON.stringify(questionDoc())};
 const approved=questionDoc();approved.meta.human_review={confirmed_at:'2026-10-27T00:00:00Z'};
 const rows=[pending,{id:2,questions:JSON.stringify(approved)},{id:3,questions:JSON.stringify([{question:'구형'}])}];
 const res=response();await load('../pages/api/sermons/index.js',db(rows))({method:'GET',query:{},headers:{}},res);
 assert.equal(res.code,200);assert.deepEqual(res.body.data.map(x=>x.id),[2,3]);
});

test('직접 URL로 접근해도 신규 검토 대기 자료는 익명에게 제공하지 않는다',async()=>{
 const row={id:'one',questions:questionDoc()};const res=response();
 await load('../pages/api/sermons/[id].js',db([row]))({method:'GET',query:{id:'one'},headers:{}},res);
 assert.equal(res.code,404);assert.equal(res.body.data,undefined);
});

test('부분 요약 수정은 기존 공개 확인을 서버에서도 취소한다',async()=>{
 const before=questionDoc();before.meta.requires_review=false;before.meta.human_review={confirmed_at:'old'};
 const database=db([{id:'one',questions:JSON.stringify(before)}]);
 const previous=process.env.LEADER_API_SECRET;process.env.LEADER_API_SECRET='local-test-only';
 try {
  const res=response();await load('../pages/api/sermons/[id].js',database)({method:'PATCH',query:{id:'one'},headers:{authorization:'Bearer local-test-only'},body:{sermon_summary:{key_point:'수정',overview:'수정',sections:[]}}},res);
  assert.equal(res.code,200);assert.equal(requiresContentReview(database.state.updated.questions),true);
 } finally {if(previous===undefined)delete process.env.LEADER_API_SECRET;else process.env.LEADER_API_SECRET=previous;}
});

test('관리자의 명시적 공개 요청에만 새 확인 시간을 기록한다',async()=>{
 const database=db([{id:'one',questions:JSON.stringify(questionDoc())}]);
 const previous=process.env.LEADER_API_SECRET;process.env.LEADER_API_SECRET='local-test-only';
 try {
  const res=response();await load('../pages/api/sermons/[id].js',database)({method:'PATCH',query:{id:'one'},headers:{authorization:'Bearer local-test-only'},body:{questions:questionDoc(),confirm_content_review:true}},res);
  assert.equal(res.code,200);assert.equal(requiresContentReview(database.state.updated.questions),false);assert.ok(JSON.parse(database.state.updated.questions).meta.human_review.confirmed_at);
 } finally {if(previous===undefined)delete process.env.LEADER_API_SECRET;else process.env.LEADER_API_SECRET=previous;}
});

test('관리자 비밀이 미설정된 환경에서는 공개 확인 요청을 거부한다',async()=>{
 const previous=process.env.LEADER_API_SECRET;delete process.env.LEADER_API_SECRET;
 try {const res=response();await load('../pages/api/sermons/[id].js',db([{id:'one',questions:questionDoc()}]))({method:'PATCH',query:{id:'one'},headers:{},body:{questions:questionDoc(),confirm_content_review:true}},res);assert.equal(res.code,401);}
 finally {if(previous!==undefined)process.env.LEADER_API_SECRET=previous;}
});
