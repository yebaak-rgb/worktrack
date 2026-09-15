import {storageRequest} from './radar-storage.js?v=20260915-classification';
import {hasRecommendationEvidence} from './radar-classification.js?v=20260915-classification';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORAGE_KEY = 'yeba-ai-radar-v2';
const DATA_VERSION = 6;
const providers = [
  { id:'OpenAI', name:'ChatGPT', icon:'G', cls:'chatgpt' },
  { id:'Gemini', name:'Gemini', icon:'✦', cls:'gemini' },
  { id:'Perplexity', name:'Perplexity', icon:'P', cls:'perplexity' }
];
const defaultQuestions = [
  '부산에서 교정치과 잘하는 곳 추천해줘. 그리고 이유도 알려줘.',
  '서면에서 교정치료할 건데 치과 추천해줘. 그리고 이유도 알려줘.',
  '부산에서 성인 치아교정 상담받기 좋은 치과를 비교해서 추천해줘.'
];
const sampleHospitals = ['예바치과','라인업치과','이미지플러스치과','뉴욕스마일치과'];

function localISO(date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul' }).format(date); }
function loadState() {
  const fallback = { dataVersion:DATA_VERSION, autoRun:true, scheduleTime:'09:30', targetName:'예바치과교정과치과의원', aliases:'예바, YEBA, 예바치과', questions:defaultQuestions, keys:{}, records:[], lastRun:null };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const records = Array.isArray(saved.records) ? saved.records.filter(record => providers.some(provider => provider.name === record.ai) && !record.demo && !String(record.id || '').startsWith('seed-')) : [];
    let device={};try{device=JSON.parse(localStorage.getItem('yeba-ai-radar-device')||'{}');}catch{}
    const keys=Object.fromEntries(providers.map(p=>[p.id,device.keys?.[p.id]??saved.keys?.[p.id]??'']));
    const migrated = { ...fallback, ...saved, dataVersion:DATA_VERSION, records, keys };
    if (Number(saved.dataVersion || 0) < 4) migrated.scheduleTime = '09:30';
    delete migrated.demoMode;
    if (!records.some(record => record.date === localISO() && record.status === '완료')) migrated.lastRun = null;
    const serialized = JSON.stringify(migrated);
    if (localStorage.getItem(STORAGE_KEY) !== serialized) localStorage.setItem(STORAGE_KEY, serialized);
    return migrated;
  } catch { return fallback; }
}
const legacyState=loadState();
let state={...legacyState,records:[],lastRun:null};
let cloudReady=false,cloudBusy=false,settingsDirty=false;
function cloudSettings(value=state){return{autoRun:value.autoRun,scheduleTime:value.scheduleTime,targetName:value.targetName,aliases:value.aliases,questions:value.questions.slice()};}
function migrationRecords(records){return records.filter(r=>!r.demo&&!String(r.id||'').startsWith('seed-')&&providers.some(p=>p.name===r.ai)).map(r=>({id:r.id,date:r.date,ai:r.ai,question:r.question,answer:r.answer,hospitals:r.hospitals,ourMention:r.ourMention,status:r.status,sourceUrl:r.sourceUrl||'',collectionMethod:r.collectionMethod||(String(r.id).startsWith('browser-')?'비로그인 웹':'API'),demo:false}));}
function storeDeviceKeys(){try{localStorage.setItem('yeba-ai-radar-device',JSON.stringify({keys:state.keys}));}catch{}}
function cloudStatus(message,status='loading'){
  $('#storageStatus').textContent=message;$('#storageNotice').dataset.state=status;$('#retryCloud').disabled=cloudBusy;
  ['saveSettings','startApiRun','importButton'].forEach(id=>$('#'+id).disabled=!cloudReady||cloudBusy);
}
async function cloudAPI(path,body){return storageRequest(path,body);}

function applyCloud(data,forceSettings=false){
  if(data.storage!=='cloud'||!Array.isArray(data.records))throw new Error('사이트에서 올바른 기록을 받지 못했습니다.');
  if(!settingsDirty||forceSettings){Object.assign(state,data.settings);settingsDirty=false;}
  state.records=data.records;state.lastRun=data.lastRun;cloudReady=true;
  if(!settingsDirty)renderAll();else{renderQueue();renderResponses();renderRecords();renderOverview();}
}
function cloudSuccess(){cloudStatus('사이트 저장소 연결됨 · '+state.records.length+'개 기록 · 다른 PC에서도 같은 업무 계정으로 확인','ready');}
async function refreshCloud(){
  if(cloudBusy)throw new Error('동기화 중입니다. 잠시 후 다시 시도해 주세요.');
  cloudBusy=true;cloudStatus('사이트에서 최신 기록을 불러오는 중');
  try{applyCloud(await cloudAPI('/api/state'));}
  catch(error){cloudStatus(error.message+' 현재 표시된 기록은 마지막으로 불러온 결과입니다.','error');throw error;}
  finally{cloudBusy=false;$('#retryCloud').disabled=false;if(cloudReady&&$('#storageNotice').dataset.state!=='error')cloudSuccess();}
}
async function migrateRecords(records,settings){
  const rows=migrationRecords(records);let response;
  if(!rows.length)return await cloudAPI('/api/migrate',{records:[],settings});
  for(let i=0;i<rows.length;i+=40)response=await cloudAPI('/api/migrate',{records:rows.slice(i,i+40),...(i===0?{settings}:{})});
  return response;
}
async function initializeCloud(){
  cloudBusy=true;cloudStatus('사이트 저장소에 연결하는 중');
  try{
    let data=await cloudAPI('/api/state');
    if(!legacyState.cloudMigrated&&legacyState.records.length){
      cloudStatus('기존 브라우저 기록을 사이트 저장소로 옮기는 중');
      data=(await migrateRecords(legacyState.records,cloudSettings(legacyState))).state;
      legacyState.cloudMigrated=true;
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify(legacyState));}catch{}
    }
    applyCloud(data,true);storeDeviceKeys();
  }catch(error){cloudStatus(error.message+' 브라우저의 기존 기록은 지우지 않았습니다.','error');}
  finally{cloudBusy=false;$('#retryCloud').disabled=false;if(cloudReady)cloudSuccess();}
}
async function saveCloudResults(input,method='비로그인 웹'){
  await cloudStartup;
  if(!cloudReady)throw new Error('사이트 저장소 연결 후 다시 저장해 주세요.');
  if(cloudBusy)throw new Error('다른 동기화 작업이 끝난 뒤 다시 저장해 주세요.');
  cloudBusy=true;cloudStatus('실제 조사 결과를 사이트에 저장하는 중');
  try{const result=await cloudAPI('/api/results',{...input,collection_method:method});applyCloud(result.state);return result;}
  catch(error){cloudStatus(error.message,'error');throw error;}
  finally{cloudBusy=false;$('#retryCloud').disabled=false;if($('#storageNotice').dataset.state!=='error')cloudSuccess();}
}
function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(window.__toastTimer); window.__toastTimer=setTimeout(()=>el.classList.remove('show'),2400); }
function openView(name) { $$('.nav-item').forEach(item=>item.classList.toggle('is-active',item.dataset.view===name)); $$('.view').forEach(view=>view.classList.toggle('is-active',view.id===`view-${name}`)); if(name==='manual')prepareManual();window.scrollTo({top:0,behavior:'smooth'}); }
function escapeHTML(value) { const div=document.createElement('div'); div.textContent=String(value); return div.innerHTML; }

$('#todayLabel').textContent = new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date());
$$('.nav-item').forEach(button=>button.addEventListener('click',()=>openView(button.dataset.view)));
$$('[data-action="manual"]').forEach(button=>button.addEventListener('click',()=>openView('manual')));
$$('[data-action="run"]').forEach(button=>button.addEventListener('click',()=>openView('run')));
$$('[data-action="request-investigation"]').forEach(button=>button.addEventListener('click',openInvestigationRequest));
$$('[data-action="history"]').forEach(button=>button.addEventListener('click',()=>openView('history')));
$$('[data-action="settings"]').forEach(button=>button.addEventListener('click',()=>openView('settings')));
$$('[data-action="open-insight"]').forEach(button=>button.addEventListener('click',()=>openView(state.records.length ? 'history' : 'run')));

function completedRecords() { return state.records.filter(record => record.status === '완료' && !record.demo); }
function countHospitals(records) {
  const counts = new Map();
  records.forEach(record => record.hospitals.forEach(name => counts.set(name, (counts.get(name) || 0) + 1)));
  return [...counts.entries()].sort((a,b) => b[1] - a[1]);
}
function shareOf(records) { return records.length ? records.filter(record => record.ourMention).length / records.length * 100 : 0; }
function renderOverview() {
  const real = completedRecords();
  const today = real.filter(record => record.date === localISO());
  const monthKey = localISO().slice(0,7);
  const month = real.filter(record => record.date.startsWith(monthKey));
  const monthShare = shareOf(month);
  const mentions = today.filter(record => record.ourMention).length;
  const expected = providers.length * state.questions.length;
  const unavailable = state.records.filter(record => record.date === localISO() && record.status === '실패' && !record.demo).length;
  const allCollected = today.length >= expected;
  $('#monthShare').textContent = monthShare.toFixed(1);
  $('#monthMeter').style.width = `${monthShare}%`;
  $('#todayMentions').textContent = mentions;
  $('#todayTotal').textContent = `/ ${today.length || expected}`;
  $('#runCounter').textContent = `${today.length} / ${expected} 수집 · ${unavailable}건 미수집`;
  $('#todayStatusTag').textContent = today.length ? '수집됨' : '대기';
  $('#todayStatusTag').className = today.length ? 'tag teal' : 'tag';
  $('#trendShare').textContent = `${monthShare.toFixed(1)}%`;
  $('#modeStatus').lastChild.textContent = allCollected ? ' 오늘 조사 완료' : today.length ? ' 일부 수집' : ' 수집 대기';
  $('#topRunButton').childNodes[0].textContent = '비로그인 조사 요청 ';
  $('#providerQuestionCount').textContent = `${providers.length}개 AI × 질문 ${state.questions.length}개`;
  $('#providerProgress').innerHTML = providers.map(provider => {
    const done = state.questions.filter(question => today.some(record => record.ai === provider.name && record.question === question)).length;
    const percent = state.questions.length ? Math.round(done / state.questions.length * 100) : 0;
    const label = `${provider.name} ${done}/${state.questions.length} 수집`;
    return `<div class="provider-progress" title="${escapeHTML(label)}"><span class="provider-track" role="progressbar" aria-label="${escapeHTML(label)}" aria-valuemin="0" aria-valuemax="${state.questions.length}" aria-valuenow="${done}"><i class="${provider.cls}" style="width:${percent}%"></i></span><small>${provider.name}</small></div>`;
  }).join('');
  $('#briefingText').innerHTML = today.length
    ? `오늘 수집한 <b>${today.length}개 실제 응답</b>에서 예바치과가 <b>${mentions}회</b> 추천됐습니다.`
    : '오늘 첫 실제 조사를 시작해 주세요.';
  $('#monthDelta').textContent = month.length ? `이번 달 실제 응답 ${month.length}건 기준` : '실제 기록이 쌓이면 비교합니다.';

  const hospitalCounts = countHospitals(month);
  const yebaIndex = hospitalCounts.findIndex(([name]) => name.includes('예바'));
  $('#currentRank').textContent = yebaIndex >= 0 ? String(yebaIndex + 1) : '–';
  $('#rankDetail').textContent = yebaIndex >= 0 ? `이번 달 ${hospitalCounts[yebaIndex][1]}회 언급` : '첫 조사 후 계산됩니다.';
  $('#rankDelta').textContent = hospitalCounts.length > 1 && yebaIndex === 0 ? `2위와 ${hospitalCounts[0][1] - hospitalCounts[1][1]}회 차이` : '비교할 실제 기록이 없습니다.';
  $('#alertTitle').textContent = real.length ? '수집을 이어가고 있습니다.' : '아직 변화가 없습니다.';
  $('#alertDescription').textContent = real.length ? '최소 2일 이상 쌓이면 일별 변화를 비교합니다.' : '최소 2일 이상 수집하면 변화를 알려드려요.';

  $('#overviewAIList').innerHTML = providers.map(provider => {
    const rows = month.filter(record => record.ai === provider.name);
    const rate = shareOf(rows);
    return `<div class="ai-row"><span class="ai-icon ${provider.cls}">${provider.icon}</span><div><div><strong>${provider.name}</strong><em>${rate.toFixed(0)}%</em></div><span class="bar"><i style="width:${rate}%"></i></span><small>${rows.filter(record => record.ourMention).length} / ${rows.length}회</small></div></div>`;
  }).join('');
  $('#competitorList').innerHTML = hospitalCounts.length ? hospitalCounts.slice(0,4).map(([name,count],index) => `<div><span class="medal ${index===0?'first':''}">${index+1}</span><strong>${escapeHTML(name)}</strong><div class="mini-bar"><i style="width:${hospitalCounts[0][1] ? count / hospitalCounts[0][1] * 100 : 0}%"></i></div><em>${month.length ? (count / month.length * 100).toFixed(1) : '0.0'}%</em></div>`).join('') : '<p class="empty-inline">실제 기록이 쌓이면 함께 언급된 치과를 보여드립니다.</p>';
  $('#actionSummary').textContent = today.length ? `오늘 실제 응답 ${today.length}건을 수집했습니다. 원문을 검토해 반복되는 추천 이유를 확인하세요.` : '첫 실제 조사 결과가 들어오면 추천 이유를 요약합니다.';
  $('#actionHint').textContent = today.length ? '기록 분석에서 AI별 응답 원문과 추천 치과를 확인해 보세요.' : '아직 제안할 실제 데이터가 없습니다.';

  const percentage = expected ? Math.min(100, Math.round(today.length / expected * 100)) : 0;
  $('#runPercent').textContent = `${percentage}%`;
  $('.run-gauge').style.background = `radial-gradient(circle closest-side,#fff 78%,transparent 80% 100%),conic-gradient(var(--teal) ${percentage}%,#e9edf4 0)`;
  $('#runStatus').className = allCollected ? 'status-pill success' : unavailable ? 'status-pill error' : 'status-pill neutral';
  $('#runStatus').textContent = allCollected ? '완료' : today.length ? '일부 수집' : unavailable ? '수집 제한' : '대기';
  $('#runHeadline').textContent = today.length ? `${expected}개 조사 중 ${today.length}개 응답을 수집했습니다.` : '오늘 첫 조사를 시작해 주세요.';
  $('#runDescription').textContent = today.length || unavailable ? `실제 응답 ${today.length}건 · 미수집 ${unavailable}건. 추천률은 실제 응답만 기준으로 계산합니다.` : '비로그인 AI 웹페이지의 실제 응답을 수집합니다.';
}

function renderQuestions() {
  $('#questionList').innerHTML = state.questions.map((q,i)=>`<div class="question-item"><span>Q${i+1}</span><p>${escapeHTML(q)}</p></div>`).join('');
  $('#settingsQuestions').innerHTML = state.questions.map((q,i)=>`<div class="editable-question"><span>Q${i+1}</span><input aria-label="질문 ${i+1}" value="${escapeHTML(q)}"><button aria-label="질문 ${i+1} 삭제" data-remove-question="${i}">×</button></div>`).join('');
  $('#historyQuestion').innerHTML = '<option value="all">전체 질문</option>' + state.questions.map((q,i)=>`<option value="${i}">질문 ${i+1}</option>`).join('');
  $$('[data-remove-question]').forEach(button=>button.addEventListener('click',()=>{ if(state.questions.length===1)return toast('질문은 한 개 이상 필요합니다.'); settingsDirty=true;state.questions.splice(Number(button.dataset.removeQuestion),1); renderQuestions(); }));
}
function renderQueue(activeProvider = '') {
  const today = completedRecords().filter(record => record.date === localISO());
  $('#queueList').innerHTML = providers.map(provider => {
    const connected = Boolean(state.keys[provider.id]);
    const done = today.filter(record => record.ai === provider.name).length;
    const failed = state.records.filter(record => record.date === localISO() && record.ai === provider.name && record.status === '실패' && !record.demo).length;
    const active = provider.id === activeProvider;
    const message = active ? '응답 수집 중' : failed ? `${done}건 수집 · ${failed}건 미수집` : done ? `${done}개 질문 완료` : connected ? 'API 수집 대기' : '비로그인 웹 조사 대기';
    const icon = active ? '◌' : done ? '✓' : '–';
    return `<div class="queue-item ${active?'is-running':''}"><i class="ai-icon ${provider.cls}">${provider.icon}</i><div><strong>${provider.name}</strong><small>${message}</small></div><span class="queue-icon">${icon}</span></div>`;
  }).join('');
}
function renderResponses() {
  const today = state.records.filter(r=>r.date===localISO()&&!r.demo).slice().reverse();
  $('#responseGrid').innerHTML = today.map(r=>{
    const p=providers.find(x=>x.name===r.ai)||providers[0];
    const stamp = r.savedAt && !Number.isNaN(Date.parse(r.savedAt)) ? `저장 ${new Date(r.savedAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'})}` : '';
    const method = r.collectionMethod || (String(r.id).startsWith('browser-') ? '비로그인 웹' : 'API');
    let source = ''; try { const url = new URL(r.sourceUrl); if (['https:','http:'].includes(url.protocol)) source = `<a href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer">원문 페이지 ↗</a>`; } catch {}
    return `<article class="response-card"><header><i class="ai-icon ${p.cls}">${p.icon}</i><strong>${escapeHTML(r.ai)}</strong><time>${escapeHTML(stamp)}</time></header><p>질문 ${Math.max(1,state.questions.indexOf(r.question)+1)} · ${escapeHTML(method)} · ${r.status==='완료'?'수집':'미수집'}</p><p>${escapeHTML(r.answer)}</p><details><summary>응답 전문 · 미수집 사유</summary><p class="response-full">${escapeHTML(r.answer)}</p>${source}</details><div class="hospital-tags">${r.hospitals.map(h=>`<span class="${h.includes('예바')?'ours':''}">${escapeHTML(h)}</span>`).join('')}</div></article>`;
  }).join('') || '<p class="muted">아직 오늘 수집한 응답이 없습니다.</p>';
}
function renderRecords() {
  const ai=$('#historyAI').value, q=$('#historyQuestion').value, days=$('#historyRange').value;
  const since=new Date(); if(days!=='all') since.setDate(since.getDate()-Number(days));
  const filtered=state.records.filter(r=>!r.demo&&(ai==='all'||r.ai===ai)&&(q==='all'||r.question===state.questions[Number(q)])&&(days==='all'||new Date(r.date)>=since));
  const completed=filtered.filter(r=>r.status==='완료');
  const share=completed.length?completed.filter(r=>r.ourMention).length/completed.length*100:0;
  const aiRates=providers.map(p=>{const rows=completed.filter(r=>r.ai===p.name);return{name:p.name,rate:rows.length?rows.filter(r=>r.ourMention).length/rows.length:0}}).sort((a,b)=>b.rate-a.rate);
  $('#filteredResponses').textContent=filtered.length; $('#filteredShare').textContent=`${share.toFixed(1)}%`; $('#bestAI').textContent=aiRates[0]?.name||'-';
  $('#recordCount').textContent=`최근 ${Math.min(8,filtered.length)}건`;
  $('#recordsBody').innerHTML=filtered.slice().reverse().slice(0,8).map(r=>`<tr><td>${r.date}</td><td>${escapeHTML(r.ai)}</td><td>질문 ${Math.max(1,state.questions.indexOf(r.question)+1)}</td><td>${r.hospitals.map(escapeHTML).join(', ')}</td><td class="${r.ourMention?'yes-mark':'no-mark'}">${r.ourMention?'YES':'—'}</td><td><span class="mini-state">${escapeHTML(r.status)}</span></td></tr>`).join('')||'<tr><td colspan="6">조건에 맞는 기록이 없습니다.</td></tr>';
}
function hydrateSettings() {
  $('#autoRun').checked=state.autoRun; $('#scheduleTime').value=state.scheduleTime; $('#targetName').value=state.targetName; $('#targetAliases').value=state.aliases;
  $('#keyOpenAI').value=state.keys.OpenAI||''; $('#keyGemini').value=state.keys.Gemini||''; $('#keyPerplexity').value=state.keys.Perplexity||'';
  updateConnectionCount();
}
function updateConnectionCount(){const count=['keyOpenAI','keyGemini','keyPerplexity'].filter(id=>$('#'+id).value.trim()).length;$('#connectionCount').textContent=`${count} / ${providers.length} 연결`;}
$$('.api-grid input').forEach(input=>input.addEventListener('input',updateConnectionCount));
$('#addQuestion').addEventListener('click',()=>{settingsDirty=true;state.questions.push('새 조사 질문을 입력하세요.');renderQuestions();$$('#settingsQuestions input').at(-1).focus();});
$('#view-settings').addEventListener('input',()=>{settingsDirty=true;});
$('#saveSettings').addEventListener('click',async()=>{
  if(!cloudReady||cloudBusy)return;
  const next={autoRun:$('#autoRun').checked,scheduleTime:$('#scheduleTime').value,targetName:$('#targetName').value.trim()||'예바치과교정과치과의원',aliases:$('#targetAliases').value.trim(),questions:$$('#settingsQuestions input').map(x=>x.value.trim()).filter(Boolean)};
  cloudBusy=true;cloudStatus('조사 설정을 사이트에 저장하는 중');
  try{
    const data=await cloudAPI('/api/settings',next);
    state.keys={OpenAI:$('#keyOpenAI').value.trim(),Gemini:$('#keyGemini').value.trim(),Perplexity:$('#keyPerplexity').value.trim()};storeDeviceKeys();
    applyCloud(data,true);toast('조사 질문과 설정을 사이트에 저장했습니다.');
  }catch(error){cloudStatus(error.message,'error');toast(error.message);}
  finally{cloudBusy=false;$('#retryCloud').disabled=false;if($('#storageNotice').dataset.state!=='error')cloudSuccess();}
});
$('#resetFilters').addEventListener('click',()=>{$('#historyRange').value='30';$('#historyAI').value='all';$('#historyQuestion').value='all';renderRecords();});
['historyRange','historyAI','historyQuestion'].forEach(id=>$('#'+id).addEventListener('change',renderRecords));

function extractHospitals(text) {
  const aliases=[...new Set([state.targetName,...state.aliases.split(',').map(x=>x.trim()),...sampleHospitals].filter(Boolean))];
  const found=aliases.filter(name=>text.toLowerCase().includes(name.toLowerCase())).map(name=>name.includes('예바')||name.toLowerCase()==='yeba'?'예바치과':name);
  const regex=/([가-힣A-Za-z]+(?:치과교정과)?치과(?:의원)?)/g; return [...new Set([...found,...(text.match(regex)||[])])].slice(0,6);
}
async function queryProvider(provider, question) {
  const key=state.keys[provider.id];
  if (!key) throw new Error(`${provider.name} API 키가 연결되지 않았습니다.`);
  if(provider.id==='OpenAI') { const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model:'gpt-4.1-mini',input:question})}); if(!r.ok)throw new Error(`OpenAI ${r.status}`);const j=await r.json();return j.output_text||j.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join(' ')||''; }
  if(provider.id==='Gemini') { const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:question}]}]})});if(!r.ok)throw new Error(`Gemini ${r.status}`);const j=await r.json();return j.candidates?.[0]?.content?.parts?.map(x=>x.text).join(' ')||''; }
  const r=await fetch('https://api.perplexity.ai/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model:'sonar',messages:[{role:'user',content:question}]})});if(!r.ok)throw new Error(`Perplexity ${r.status}`);const j=await r.json();return j.choices?.[0]?.message?.content||'';
}
function openInvestigationRequest() {
  openView('run');
  $('#investigationPrompt').value = `예바 AI 레이더(${new URL('./',location.href).href}#radar)의 오늘 비로그인 웹 조사를 지금 실행해줘.\nAPI 키 없이 내장 브라우저에서 ${providers.map(provider=>provider.name).join('·')}만 조사해줘. 각 질문은 빈 새 대화에서 그대로 한 번씩 보내고 병원 이름이나 이전 답변을 추가하지 마.\n\n${state.questions.map((question,index)=>`${index+1}. ${question}`).join('\n')}\n\n각 서비스의 비로그인 상태를 확인하고, 로그인·가입 요구나 CAPTCHA가 나오면 우회하지 말고 미수집 사유를 기록해줘. 화면에 보이는 실제 답변 원문과 출처 URL만 레이더에 저장하고, 같은 날짜·AI·질문은 중복 추가하지 말고 갱신해줘. 저장 후 실제 수집 건수와 미수집 건수를 확인해 알려줘.`;
  $('#investigationRequestStatus').textContent = '아직 조사가 시작되지 않았습니다.';
  $('#copyInvestigationPrompt').textContent = '요청문 복사';
  $('#copyInvestigationPrompt').disabled = false;
  if (!$('#investigationDialog').open) $('#investigationDialog').showModal();
}
$('#closeInvestigationDialog').addEventListener('click',()=>$('#investigationDialog').close());
$('#copyInvestigationPrompt').addEventListener('click',async()=>{
  const button=$('#copyInvestigationPrompt');
  button.disabled=true;
  try {
    await navigator.clipboard.writeText($('#investigationPrompt').value);
    button.textContent='복사 완료 · 대화에 붙여넣기';
    $('#investigationRequestStatus').textContent='복사했습니다. Codex 대화에 붙여넣고 전송해야 조사가 시작됩니다.';
  } catch {
    $('#investigationPrompt').focus();$('#investigationPrompt').select();
    $('#investigationRequestStatus').textContent='자동 복사를 사용할 수 없습니다. 선택된 요청문을 Ctrl+C(또는 ⌘C)로 복사해 대화에 보내주세요.';
  } finally {button.disabled=false;}
});
let running=false;
async function runInvestigation() {
  if(running)return;
  const connectedProviders = providers.filter(provider => state.keys[provider.id]);
  if (!connectedProviders.length) {
    openView('settings');
    toast('실제 수집을 시작하려면 AI API 키를 하나 이상 연결해 주세요.');
    return;
  }
  running=true; openView('run'); $('#startApiRun').disabled=true; $('#runStatus').className='status-pill running';$('#runStatus').textContent='진행 중';$('#runHeadline').textContent='실제 API 응답을 수집하고 있습니다.';
  const collected=[];
  let completed=0, mentions=0, failures=0; const total=connectedProviders.length*state.questions.length; const today=localISO();
  for(const provider of connectedProviders) {
    renderQueue(provider.id);
    for(let qi=0;qi<state.questions.length;qi++) {
      const question=state.questions[qi];
      try {
        const answer=await queryProvider(provider,question);const hospitals=extractHospitals(answer);const ours=hospitals.some(h=>h.includes('예바'));if(ours)mentions++;
        collected.push({ai:provider.name,question,answer,hospitals,our_mention:ours,status:'완료'});
      } catch(error) {
        failures++;collected.push({ai:provider.name,question,answer:error.message,hospitals:[],our_mention:false,status:'실패'});
      }
      completed++;const pct=Math.round(completed/total*100);$('#runPercent').textContent=`${pct}%`;$('#runCounter').textContent=`${completed} / ${total} 완료`;
    }
  }
  try{await saveCloudResults({date:today,results:collected},'API');toast('API 조사 결과를 사이트에 저장했습니다.');}
  catch(error){toast(error.message);}
  finally{running=false;$('#startApiRun').disabled=false;renderQueue();renderResponses();renderRecords();renderOverview();}
}
$('#startApiRun').addEventListener('click',runInvestigation);

async function exportData(){
  try{
    await refreshCloud();if(!cloudReady)throw new Error('사이트 기록을 먼저 불러와 주세요.');
    const data={...cloudSettings(),dataVersion:DATA_VERSION,records:state.records,lastRun:state.lastRun,exportedAt:new Date().toISOString()};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='yeba-ai-radar-'+localISO()+'.json';a.click();URL.revokeObjectURL(url);toast('사이트 기록을 백업했습니다. API 키는 백업에 포함하지 않습니다.');
  }catch(error){toast(error.message);}
}
$$('[data-action="export"]').forEach(button=>button.addEventListener('click',exportData));
$('#importButton').addEventListener('click',()=>$('#importFile').click());
$('#importFile').addEventListener('change',async e=>{
  if(!e.target.files?.length)return;
  try{
    const imported=JSON.parse(await e.target.files[0].text());
    if(!Array.isArray(imported.records))throw new Error('올바른 레이더 백업 파일이 아닙니다.');
    if(!cloudReady||cloudBusy)throw new Error('사이트 저장소 연결 후 다시 가져와 주세요.');
    cloudBusy=true;cloudStatus('백업의 누락된 기록을 사이트에 추가하는 중');
    const result=await migrateRecords(imported.records,cloudSettings());applyCloud(result.state);
    toast('기존 서버 기록을 유지하고 누락된 기록을 합쳤습니다.');
  }catch(error){cloudStatus(error.message,'error');toast(error.message);}
  finally{cloudBusy=false;e.target.value='';$('#retryCloud').disabled=false;if(cloudReady&&$('#storageNotice').dataset.state!=='error')cloudSuccess();}
});

function registerWebMCP() {
  const context=document.modelContext;
  const recent=()=>completedRecords().filter(r=>r.date>=localISO(new Date(Date.now()-30*86400000)));
  const readTool={name:'read_yeba_share_summary',title:'예바 추천 점유율 요약',description:'현재 저장된 기록에서 예바치과의 추천 점유율, 조사 질문과 오늘 수집 상태를 읽습니다.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},async execute(input={}){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('입력값 없이 호출해야 합니다.');await cloudStartup;if(!cloudReady)throw new Error('사이트 저장소에 연결되지 않았습니다.');await refreshCloud();const rows=recent();const today=state.records.filter(r=>r.date===localISO()&&!r.demo);return{storage:'cloud',server_record_count:state.records.length,period_days:30,total_responses:rows.length,yeba_mentions:rows.filter(r=>r.ourMention).length,share_percent:rows.length?Number((rows.filter(r=>r.ourMention).length/rows.length*100).toFixed(1)):0,questions:state.questions.slice(),today_success:today.filter(r=>r.status==='완료').length,today_unavailable:today.filter(r=>r.status==='실패').length,today_complete:providers.every(provider=>state.questions.every(question=>today.some(r=>r.ai===provider.name&&r.question===question&&r.status==='완료')))};}};
  const saveTool={
    name:'save_yeba_recommendation_results',
    title:'예바 AI 조사 결과 저장',
    description:'직접 수집한 비로그인 응답을 사이트 데이터베이스에 저장합니다. 같은 계정으로 다른 PC에서도 볼 수 있으며 같은 날짜·AI·질문은 갱신합니다.',
    inputSchema:{
      type:'object',
      properties:{
        date:{type:'string',description:'한국 날짜(YYYY-MM-DD)'},
        results:{type:'array',minItems:1,maxItems:40,items:{type:'object',properties:{ai:{type:'string',enum:providers.map(provider=>provider.name)},question:{type:'string',minLength:1},answer:{type:'string',minLength:1},hospitals:{type:'array',items:{type:'string'},maxItems:20},our_mention:{type:'boolean'},status:{type:'string',enum:['완료','실패']},source_url:{type:'string'}},required:['ai','question','answer','hospitals','our_mention','status'],additionalProperties:false}}
      },
      required:['date','results'],
      additionalProperties:false
    },
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false,untrustedContentHint:true},
    async execute(input){
      if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('저장할 조사 결과가 필요합니다.');
      const result=await saveCloudResults(input);toast((result.saved+result.updated)+'건을 사이트 저장소에 저장했습니다.');
      const {state:serverState,...summary}=result;return summary;
    }
  };
  window.yebaRadarBridge={read:readTool.execute,save:saveTool.execute,merge:async input=>{await cloudStartup;if(!cloudReady||cloudBusy)throw new Error('저장소 연결 후 다시 시도해 주세요.');cloudBusy=true;try{const result=await migrateRecords(input.records,cloudSettings());applyCloud(result.state);const {state:ignored,...summary}=result;return summary;}finally{cloudBusy=false;if(cloudReady)cloudSuccess();}}};
  if(!context?.registerTool)return;
  [readTool,saveTool].forEach(tool=>{try{Promise.resolve(context.registerTool(tool)).catch(()=>{});}catch{}});
}
let manualBusy=false,manualEdited=false,manualClassificationEdited=false;
function manualMessage(text,status='success'){$('#manualFeedback').textContent=text;$('#manualFeedback').dataset.state=status;$('#manualFeedback').hidden=!text;}
function manualDuplicate(){
  const existing=state.records.find(r=>r.date===$('#manualDate').value&&r.ai===$('#manualAI').value&&r.question===$('#manualQuestion').value);
  $('#manualDuplicate').hidden=!existing;$('#manualReplace').required=Boolean(existing);
  $('#manualDuplicateText').textContent=existing?'이 날짜·AI·질문에 '+(existing.status==='완료'?'수집된 답변':'미수집 사유')+'이 있습니다. 저장하면 기존 원문이 바뀝니다.':'';
}
function prepareManual(){
  if(!$('#manualDate').value)$('#manualDate').value=localISO();
  const selected=$('#manualQuestion').value;
  const questions=[...new Set([...state.questions,...(selected?[selected]:[])])];
  $('#manualQuestion').replaceChildren(...questions.map((q,i)=>new Option(`질문 ${i+1} · ${q}`,q)));
  if(selected)$('#manualQuestion').value=selected;
  $('#manualQuestionText').textContent=$('#manualQuestion').value;
  manualDuplicate();
}
function detectManualHospitals(){
  const answer=$('#manualAnswer').value;
  const aliases=[state.targetName,...String(state.aliases||'').split(',')].map(x=>x.trim()).filter(Boolean);
  const ours=aliases.some(alias=>answer.toLocaleLowerCase().includes(alias.toLocaleLowerCase()));
  const known=state.records.flatMap(r=>r.hospitals).filter(name=>answer.toLocaleLowerCase().includes(name.toLocaleLowerCase()));
  const candidates=[...(ours?['예바치과']:[]),...known,...(answer.match(/[가-힣A-Za-z0-9]+(?:치과교정과)?치과(?:교정과치과의원|의원|병원)?/g)||[])];
  $('#manualHospitals').value=[...new Set(candidates.filter(name=>!['치과','치과의원','교정치과','전문치과'].includes(name)).map(name=>/예바|yeba/i.test(name)?'예바치과':name))].slice(0,20).join('\n');
  $('#manualMention').checked=ours;
}
$('#manualDetect').addEventListener('click',()=>{manualClassificationEdited=false;detectManualHospitals();manualEdited=true;manualMessage('치과명을 다시 찾았습니다. 실제 추천 목록과 예바 추천 여부를 확인해 주세요.');});
$('#manualAnswer').addEventListener('input',()=>{$('#manualChars').textContent=$('#manualAnswer').value.length.toLocaleString()+' / 60,000자';manualClassificationEdited=false;detectManualHospitals();$('#manualGuest').checked=false;});
$('#manualHospitals').addEventListener('input',()=>{$('#manualMention').checked=hasRecommendationEvidence($('#manualAnswer').value,$('#manualHospitals').value.split(/[,\n]/).map(x=>x.trim()).filter(Boolean),state);});
['manualHospitals','manualMention'].forEach(id=>$('#'+id).addEventListener('input',()=>{manualClassificationEdited=true;}));
['manualDate','manualAI','manualQuestion'].forEach(id=>$('#'+id).addEventListener('change',()=>{$('#manualReplace').checked=false;$('#manualQuestionText').textContent=$('#manualQuestion').value;manualDuplicate();}));
$('#manualStatus').addEventListener('change',()=>{
  const failed=$('#manualStatus').value==='실패';$('#manualReview').hidden=failed;$('#manualGuest').checked=false;
  $('#manualAnswerLabel').textContent=failed?'미수집 사유':'AI 답변 원문';
  $('#manualAnswer').placeholder=failed?'로그인 요구, CAPTCHA 등 실제로 확인한 미수집 사유를 입력하세요.':'AI 화면에서 답변 전체를 복사해 여기에 붙여넣으세요.';
  $('#manualGuestText').textContent=failed?'비로그인 상태에서 확인한 미수집 사유이며, 답변을 임의로 작성하지 않았습니다.':'로그아웃 상태의 새 대화에서 선택한 질문만 보내고 받은 답변입니다.';
});
$('#manualForm').addEventListener('input',()=>{manualEdited=true;manualMessage('');$('#manualNext').hidden=true;});
$('#manualForm').addEventListener('submit',async event=>{
  event.preventDefault();if(manualBusy)return;
  const failed=$('#manualStatus').value==='실패',answer=$('#manualAnswer').value;
  if(!answer.trim()){manualMessage('답변 원문 또는 미수집 사유를 입력해 주세요.','error');$('#manualAnswer').focus();return;}
  const source=$('#manualSource').value.trim();
  try{if(!['https:','http:'].includes(new URL(source).protocol))throw new Error();}catch{manualMessage('출처는 https:// 또는 http://로 시작하는 주소를 넣어주세요.','error');$('#manualSource').focus();return;}
  manualDuplicate();if(!$('#manualForm').reportValidity())return;
  const hospitals=failed?[]:[...new Set($('#manualHospitals').value.split(/[,\n]/).map(x=>x.trim()).filter(Boolean))];
  if(hospitals.length>20||hospitals.some(name=>name.length>200)){manualMessage('치과는 20곳까지, 이름은 200자 이내로 입력해 주세요.','error');return;}
  const payload={date:$('#manualDate').value,results:[{ai:$('#manualAI').value,question:$('#manualQuestion').value,answer,hospitals,our_mention:!failed&&$('#manualMention').checked,status:failed?'실패':'완료',source_url:source}]};
  manualBusy=true;$('#manualFields').disabled=true;$('#saveManual').disabled=true;manualMessage('사이트에 저장하는 중입니다.');
  try{
    const result=await saveCloudResults(payload,'수동 입력 · 비로그인 웹');manualEdited=false;
    manualMessage(`${payload.date} · ${payload.results[0].ai} · ${failed?'미수집 사유':'답변 원문'} ${result.updated?'1건을 갱신':'1건을 저장'}했습니다. 사이트 저장소 총 ${result.total_records}건입니다.`);
    $('#manualReplace').checked=false;manualDuplicate();$('#manualNext').hidden=false;
  }catch(error){manualMessage(error.message+' 입력 내용은 그대로 남아 있습니다.','error');}
  finally{manualBusy=false;$('#manualFields').disabled=false;$('#saveManual').disabled=false;}
});
$('#manualNext').addEventListener('click',()=>{
  const select=$('#manualQuestion'),next=(select.selectedIndex+1)%select.options.length,date=$('#manualDate').value,ai=$('#manualAI').value;$('#manualForm').reset();$('#manualDate').value=date;$('#manualAI').value=ai;select.selectedIndex=next;
  manualEdited=false;manualClassificationEdited=false;$('#manualChars').textContent='0 / 60,000자';$('#manualReview').hidden=false;$('#manualAnswerLabel').textContent='AI 답변 원문';$('#manualAnswer').placeholder='AI 화면에서 답변 전체를 복사해 여기에 붙여넣으세요.';$('#manualGuestText').textContent='로그아웃 상태의 새 대화에서 선택한 질문만 보내고 받은 답변입니다.';$('#manualNext').hidden=true;manualMessage('');prepareManual();$('#manualAnswer').focus();
});
window.addEventListener('beforeunload',event=>{if(manualEdited){event.preventDefault();event.returnValue='';}});
function renderAll(){renderQuestions();renderQueue();renderResponses();hydrateSettings();renderRecords();renderOverview();if($('#view-manual').classList.contains('is-active'))prepareManual();}
$('#retryCloud').addEventListener('click',()=>{(cloudReady?refreshCloud():initializeCloud()).catch(error=>toast(error.message));});
renderAll();
const cloudStartup=initializeCloud();
registerWebMCP();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&cloudReady&&!cloudBusy&&!running)refreshCloud().catch(()=>{});});
setInterval(()=>{if(document.visibilityState==='visible'&&cloudReady&&!cloudBusy&&!running)refreshCloud().catch(()=>{});},30000);
cloudStartup.then(()=>{
  if(!cloudReady)return;
  const now=new Date(),[hour,minute]=state.scheduleTime.split(':').map(Number);
  if(state.autoRun&&Object.values(state.keys).some(Boolean)&&state.lastRun!==localISO()&&(now.getHours()>hour||(now.getHours()===hour&&now.getMinutes()>=minute)))setTimeout(runInvestigation,500);
});
