// Shares the existing worktrack session; no admin key, new login, or browser-only record store.
import {hasRecommendationEvidence} from './radar-classification.js';
const AI = new Set(['ChatGPT','Gemini','Perplexity']);
const DEFAULT_SETTINGS = {autoRun:false,scheduleTime:'09:30',targetName:'예바치과교정과치과의원',aliases:'예바, YEBA, 예바치과',questions:[
  '부산에서 교정치과 잘하는 곳 추천해줘. 그리고 이유도 알려줘.',
  '서면에서 교정치료할 건데 치과 추천해줘. 그리고 이유도 알려줘.',
  '부산에서 성인 치아교정 상담받기 좋은 치과를 비교해서 추천해줘.'
]};
function checkedString(value,name,max){if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(name+' 값을 확인해 주세요.');return value.trim();}
export function validDate(date){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('날짜는 유효한 YYYY-MM-DD 형식이어야 합니다.');return date;}
export function validateRecord(item,date,method='비로그인 웹',settings=DEFAULT_SETTINGS){
  if(!item||!AI.has(item.ai)||!['완료','실패'].includes(item.status))throw new Error('조사 AI 또는 상태를 확인해 주세요.');
  const question=checkedString(item.question,'질문',2000);checkedString(item.answer,'답변',60000);
  if(!Array.isArray(item.hospitals)||item.hospitals.length>20||typeof item.our_mention!=='boolean')throw new Error('치과 목록 또는 추천 여부를 확인해 주세요.');
  const hospitals=[...new Set(item.hospitals.map(h=>checkedString(h,'치과명',200)))];
  if(item.status==='완료'&&item.our_mention&&!hasRecommendationEvidence(item.answer,hospitals,settings))throw new Error('예바 추천으로 저장하려면 답변 원문과 추천 치과 목록에 추적 병원 이름이 모두 있어야 합니다. 추천 여부와 치과 목록을 확인해 주세요.');
  let source_url='';if(item.source_url){try{if(typeof item.source_url!=='string'||item.source_url.length>3000)throw new Error();const url=new URL(item.source_url);if(!['http:','https:'].includes(url.protocol))throw new Error();source_url=url.href;}catch{throw new Error('출처는 http 또는 https 주소여야 합니다.');}}
  return {date:validDate(date),ai:item.ai,question,answer:item.answer,hospitals:item.status==='실패'?[]:hospitals,our_mention:item.status==='완료'&&item.our_mention,status:item.status,source_url,collection_method:['API','수동 입력 · 비로그인 웹'].includes(method)?method:'비로그인 웹'};
}
export function validateSettings(input){
  if(!input||!Array.isArray(input.questions)||!input.questions.length||input.questions.length>20)throw new Error('질문은 1~20개로 설정해 주세요.');
  const questions=[...new Set(input.questions.map(q=>checkedString(q,'질문',2000)))];
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.scheduleTime||''))throw new Error('실행 시각을 확인해 주세요.');
  return {questions,scheduleTime:input.scheduleTime,autoRun:Boolean(input.autoRun),targetName:checkedString(input.targetName,'병원명',200),aliases:String(input.aliases||'').slice(0,1000)};
}
function context(){
  let ctx;try{ctx=window.parent!==window&&window.parent.location.origin===window.location.origin?window.parent.getWorktrackRadarContext?.():null;}catch{}
  if(!ctx?.client||!ctx?.user?.id)throw new Error('업무 트래킹 사이트에 로그인한 뒤 AI 점유율 메뉴를 열어주세요.');
  return {db:ctx.client,owner:ctx.user.id};
}
async function result(query){const response=await query.abortSignal(AbortSignal.timeout(20000));if(response.error){const e=response.error;if(['42501','PGRST301'].includes(e.code))throw new Error('업무 계정의 로그인 상태를 확인해 주세요.');if(['42P01','PGRST205'].includes(e.code))throw new Error('AI 기록 저장소가 아직 준비되지 않았습니다.');throw new Error('AI 기록을 저장하거나 불러오지 못했습니다. 다시 시도해 주세요. ('+(e.code||'연결 오류')+')');}return response.data;}
function clientRow(r){return {id:r.id,date:r.date,ai:r.ai,question:r.question,answer:r.answer,hospitals:r.hospitals,ourMention:r.our_mention,status:r.status,sourceUrl:r.source_url,collectionMethod:r.collection_method,savedAt:r.saved_at,demo:false};}
async function readState(db,owner){
  const records=[];
  for(let offset=0;;offset+=500){const page=await result(db.from('yeba_radar_records').select('*').eq('user_id',owner).order('date').order('saved_at').order('id').range(offset,offset+499));records.push(...page.map(clientRow));if(page.length<500)break;}
  const setting=await result(db.from('yeba_radar_settings').select('body').eq('user_id',owner).maybeSingle());
  return {storage:'cloud',storage_provider:'worktrack-supabase',settings:setting?.body||DEFAULT_SETTINGS,records,lastRun:records.filter(r=>r.status==='완료').at(-1)?.date||null};
}
const recordKey=r=>JSON.stringify([r.date,r.ai,r.question]);
export async function storageRequest(path,input){
  const {db,owner}=context();
  if(path==='/api/state')return readState(db,owner);
  if(path==='/api/settings'){
    const settings=validateSettings(input);await result(db.from('yeba_radar_settings').upsert({user_id:owner,body:settings},{onConflict:'user_id'}).select('user_id'));
    return readState(db,owner);
  }
  if(!input||typeof input!=='object')throw new Error('저장할 결과가 필요합니다.');
  const merge=path==='/api/migrate';if(!merge&&path!=='/api/results')throw new Error('지원하지 않는 요청입니다.');
  const list=merge?input.records:input.results;if(!Array.isArray(list)||list.length>40||(!merge&&!list.length))throw new Error('한 번에 1~40건을 저장할 수 있습니다.');
  const settings=merge&&input.settings?validateSettings(input.settings):null;
  const before=await readState(db,owner),known=new Set(before.records.map(recordKey));
  const classificationSettings=settings||before.settings;
  const rows=merge?list.filter(r=>r&&!r.demo&&!String(r.id||'').startsWith('seed-')&&AI.has(r.ai)).map(r=>validateRecord({...r,our_mention:r.ourMention,source_url:r.sourceUrl},r.date,r.collectionMethod,classificationSettings)) : list.map(r=>validateRecord(r,input.date,input.collection_method,classificationSettings));
  if(new Set(rows.map(recordKey)).size!==rows.length)throw new Error('같은 날짜·AI·질문이 요청에 중복되어 있습니다.');
  const toSave=merge?rows.filter(r=>!known.has(recordKey(r))):rows;
  let written=[];if(toSave.length)written=await result(db.from('yeba_radar_records').upsert(toSave.map(r=>({...r,user_id:owner})),{onConflict:'user_id,date,ai,question',ignoreDuplicates:merge}).select('date,ai,question'));
  if(settings)await result(db.from('yeba_radar_settings').upsert({user_id:owner,body:settings},{onConflict:'user_id',ignoreDuplicates:true}).select('user_id'));
  const state=await readState(db,owner),saved=written.filter(r=>!known.has(recordKey(r))).length,updated=written.length-saved;
  return {date:input.date,saved,updated,skipped:rows.length-written.length,completed:rows.filter(r=>r.status==='완료').length,yeba_mentions:rows.filter(r=>r.status==='완료'&&r.our_mention).length,total_records:state.records.length,storage:'cloud',storage_provider:'worktrack-supabase',state};
}
