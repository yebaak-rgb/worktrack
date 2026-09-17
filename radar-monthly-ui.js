import {AIS, buildMonth, buildInsights, koreaDate, shiftMonth, isOurRecommendation} from './radar-analytics.js?v=20260917-monthly';
const $ = id => document.getElementById(id);
const e = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rate = value => value === null ? '—' : value.toFixed(1)+'%';
const signed = value => (value > 0 ? '+' : '')+value.toFixed(1)+'%p';
const monthLabel = month => month.slice(0,4)+'년 '+Number(month.slice(5))+'월';
const empty = message => `<div class="analytics-empty"><span>◌</span><strong>${e(message)}</strong><p>실제 응답을 수집하거나 분석 조건을 바꿔주세요.</p></div>`;
let snapshot, model, insights = [], activeEvidence = [];
let selectedMonth = koreaDate().slice(0,7), selectedAI = 'all', selectedMethod = 'web';
function renderChart(m) {
  if (!m.complete.length) { $('monthlyChart').innerHTML = empty('이 달의 추이 데이터가 없습니다'); $('dailyData').innerHTML = '<p>수집된 응답이 없습니다.</p>'; return; }
  const width = 720, height = 246, left = 44, right = 18, top = 20, bottom = 35;
  const x = i => left+i/(m.days.length-1)*(width-left-right), y = n => top+(100-n)/100*(height-top-bottom);
  const segments = []; let segment=[];
  m.days.forEach((d,i) => {if(d.rate === null){if(segment.length)segments.push(segment);segment=[];} else segment.push([x(i),y(d.rate)]);});
  if(segment.length)segments.push(segment);
  const ticks=[0,25,50,75,100].map(v => `<line x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}" stroke="#e7edf3" stroke-dasharray="3 5"/><text x="${left-10}" y="${y(v)+4}" text-anchor="end">${v}%</text>`).join('');
  const lines=segments.filter(s=>s.length>1).map(s=>`<path d="M ${s.map(p=>p.join(',')).join(' L ')}" fill="none" stroke="#2855d9" stroke-width="2.5"/>`).join('');
  const points=m.days.map((d,i)=>d.rate===null?'':`<circle cx="${x(i)}" cy="${y(d.rate)}" r="5" fill="#2855d9" stroke="white" stroke-width="2"><title>${e(d.date)} · ${rate(d.rate)} (${d.count}/${d.total}건)</title></circle>`).join('');
  const labels=[0,7,14,21,m.days.length-1].map(i=>`<text x="${x(i)}" y="${height-9}" text-anchor="middle">${i+1}일</text>`).join('');
  $('monthlyChart').innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${e(monthLabel(m.month))} 예바치과 일별 추천률. ${m.observedDays}일의 실제 응답. 아래 일별 수치에서 확인할 수 있습니다.">${ticks}${lines}${points}${labels}</svg>`;
  $('dailyData').innerHTML='<table><thead><tr><th>일자</th><th>추천 / 실제 응답</th><th>추천률</th></tr></thead><tbody>'+m.days.filter(d=>d.total).map(d=>`<tr><td>${d.date}</td><td>${d.count} / ${d.total}</td><td>${rate(d.rate)}</td></tr>`).join('')+'</tbody></table>';
}
function rankChange(row) {
  const label=row.rankChange===null?'비교 자료 없음':row.rankChange==='new'?'전월 미등장':row.rankChange>0?`↑ ${row.rankChange}위`:row.rankChange<0?`↓ ${-row.rankChange}위`:'순위 유지';
  return `<span class="rank-change">${label}</span>${row.rateChange!==null?`<small>${signed(row.rateChange)}</small>`:''}`;
}
function renderRanking() {
  const query=$('rankingSearch').value.trim().toLocaleLowerCase().replace(/\s/g,'');
  const rows=model.ranks.filter(r=>[r.name,...r.aliases].some(n=>n.toLocaleLowerCase().replace(/\s/g,'').includes(query)));
  $('rankingSummary').textContent=`${monthLabel(model.month)} · 전체 ${model.ranks.length}곳${query?' · 검색 '+rows.length+'곳':''} · 실제 응답 ${model.complete.length}건`;
  $('monthlyRankingBody').innerHTML=rows.map(r=>`<tr class="${r.name==='예바치과'?'our-row':''}"><td><span class="rank-number">${r.rank}</span></td><th scope="row">${e(r.name)}${r.name==='예바치과'?'<span class="our-badge">우리 치과</span>':''}${r.aliases.length>1?`<details class="aliases"><summary>표기 ${r.aliases.length}개 통합</summary>${r.aliases.map(n=>`<span>${e(n)}</span>`).join('')}</details>`:''}</th><td>${r.count} / ${model.complete.length}</td><td><strong>${rate(r.rate)}</strong><span class="rank-track"><i style="width:${r.rate}%"></i></span></td><td>${rankChange(r)}</td>${AIS.map(ai=>`<td>${model.ai==='all'||model.ai===ai?r.byAI[ai]:'—'}</td>`).join('')}<td><button class="text-button" data-hospital="${e(r.name)}">원문 ${r.count}건</button></td></tr>`).join('')||`<tr><td colspan="9">${query?'검색에 맞는 치과가 없습니다.':'이 달에는 추천된 치과 기록이 없습니다.'}</td></tr>`;
}
function drawInsights() {
  $('questionMatrix').innerHTML=model.questions.map((q,i)=>`<div class="question-analysis"><div><span class="question-number">Q${i+1}</span><strong>${e(q.question)}</strong></div><div class="question-score"><span class="rank-track"><i style="width:${q.rate||0}%"></i></span><b>${rate(q.rate)}</b><small>${q.mentions.length} / ${q.answers.length}건</small>${q.answers.length?`<button class="text-button" data-question="${i}">응답 보기</button>`:''}</div></div>`).join('');
  $('insightCards').innerHTML=insights.map((item,i)=>`<article class="panel insight-card"><div class="insight-top"><span class="priority-tag ${item.priority==='우선 점검'?'priority-high':''}">${e(item.priority)}</span><span class="insight-index">${String(i+1).padStart(2,'0')}</span></div><h3>${e(item.title)}</h3><p class="fact-label">관찰된 사실</p><p class="insight-fact">${e(item.fact)}</p><p class="fact-label">점검 · 실행 제안</p><ol>${item.steps.map(s=>`<li>${e(s)}</li>`).join('')}</ol><div class="verification"><span>담당 제안 · ${e(item.owner)}</span><strong>다음 확인 지표</strong><p>${e(item.check)}</p></div>${item.records.length?`<button class="text-button evidence-link" data-insight="${i}">근거 응답 ${item.records.length}건 확인 →</button>`:'<p class="chart-note">조사 설계에 관한 점검 제안입니다.</p>'}</article>`).join('');
}
export function renderMonthly(state) {
  snapshot=state;
  model=buildMonth(state.records,state,{month:selectedMonth,ai:selectedAI,method:selectedMethod});
  insights=buildInsights(model,state);
  const m=model, partial=m.month===koreaDate().slice(0,7);
  $('reportMonth').value=selectedMonth; $('reportMonth').max=koreaDate().slice(0,7);
  $('nextMonth').disabled=selectedMonth>=koreaDate().slice(0,7);
  $('reportContext').textContent=`${monthLabel(m.month)}${partial?' · 오늘까지 누적':''} / ${selectedAI==='all'?'전체 AI':selectedAI} / ${selectedMethod==='web'?'비로그인 웹 (직접 입력 포함)':selectedMethod==='api'?'API':'전체 수집 방식'} · 실제 응답 ${m.complete.length}건 · 미수집 ${m.failed.length}건`;
  $('monthlyRate').textContent=rate(m.rate);
  $('monthlyRateNote').textContent=`예바 추천 ${m.own.length}건 / 실제 응답 ${m.complete.length}건`;
  $('monthlyDelta').textContent=m.delta===null?'전월 비교 자료 없음':`전월 ${m.previous.length}건 대비 ${signed(m.delta)}${partial?' · 당월은 누적':''}`;
  $('monthlyRank').textContent=m.rank?m.rank.rank+'위':'—';
  $('monthlyRankNote').textContent=m.rank?`${m.ranks.length}곳 중 · ${m.rank.count}개 답변에서 추천`:m.complete.length?'예바 추천 기록이 없습니다':'수집 후 계산합니다';
  $('monthlySample').innerHTML=m.complete.length+'<small>건</small>';
  $('monthlySampleNote').textContent=`${m.observedDays}일 관찰 · 미수집 ${m.failed.length}건 제외`;
  $('monthlyCoverage').textContent=m.rows.length?`기록된 조사 중 수집 성공 ${(m.complete.length/m.rows.length*100).toFixed(1)}% · 미실행일 제외`:'저장된 조사 기록이 없습니다';
  renderChart(m);
  $('monthlyProviders').innerHTML=m.provider.filter(p=>selectedAI==='all'||p.name===selectedAI).map((p,i)=>`<div class="provider-analysis"><div><span class="provider-label">${e(p.name)}</span><b>${rate(p.rate)}</b></div><span class="provider-rate-track"><i class="provider-${p.name.toLowerCase()}" style="width:${p.rate||0}%"></i></span><p>예바 ${p.mentions.length} / 실제 응답 ${p.answers.length}건 <span>미수집 ${p.failures.length}건</span></p></div>`).join('');
  $('monthlyLeaders').innerHTML=m.ranks.length?m.ranks.slice(0,5).map(r=>`<button class="leader ${r.name==='예바치과'?'leader-ours':''}" data-hospital="${e(r.name)}"><span>${r.rank}</span><div><strong>${e(r.name)}</strong><span class="leader-track"><i style="width:${r.rate}%"></i></span></div><b>${rate(r.rate)}<small>${r.count}건</small></b></button>`).join(''):empty('추천 치과 기록이 없습니다');
  const first=insights[0];
  $('priorityAction').innerHTML=`<span class="priority-tag">${e(first.priority)}</span><h3>${e(first.title)}</h3><p>${e(first.fact)}</p><p class="action-first-step">${e(first.steps[0])}</p>`;
  $('aliasSummary').innerHTML=m.aliases.length?'<ul>'+m.aliases.map(r=>`<li><strong>${e(r.name)}</strong> ← ${r.aliases.map(e).join(' / ')}</li>`).join('')+'</ul>':'<p>선택 월에 여러 표기가 합쳐진 치과는 없습니다.</p>';
  renderRanking(); drawInsights();
}
function showEvidence(title, records) {
  activeEvidence=records;
  $('evidenceTitle').textContent=title;
  $('evidenceNote').textContent=`${records.length}건 · 저장된 원문을 그대로 표시합니다. AI 답변의 내용이 사실인지 별도로 확인하세요.`;
  $('evidenceBody').innerHTML=records.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r=>{
    let source='';try{const u=new URL(r.sourceUrl);if(['http:','https:'].includes(u.protocol))source=`<a href="${e(u.href)}" target="_blank" rel="noopener noreferrer">원문 출처 열기 ↗</a><small class="source-url">${e(r.sourceUrl)}</small>`;}catch{}
    return `<article class="evidence-record"><header><strong>${e(r.ai)}</strong><span>${e(r.date)} · ${r.status==='완료'?'실제 응답':'미수집'}</span></header><p class="evidence-question">${e(r.question)}</p><p class="chart-note">${e(r.collectionMethod||'수집 방식 미기록')} · 예바 ${isOurRecommendation(r,snapshot)?'추천':'추천 없음'}</p><details><summary>${r.status==='실패'?'미수집 사유':'답변 원문'} 펼치기</summary><pre>${e(r.answer)}</pre></details>${source||'<small>저장된 출처 URL이 없습니다.</small>'}</article>`;
  }).join('');
  if(!$('evidenceDialog').open)$('evidenceDialog').showModal();
}
export function initializeMonthly() {
  $('reportMonth').value=selectedMonth;
  const redraw=()=>{if(snapshot)renderMonthly(snapshot);};
  $('reportMonth').addEventListener('change',()=>{
    const value=$('reportMonth').value;
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)||value>koreaDate().slice(0,7)||value<'2000-01'){$('reportMonth').value=selectedMonth;return;}
    selectedMonth=value;redraw();
  });
  $('reportMonth').min='2000-01';
  $('previousMonth').addEventListener('click',()=>{selectedMonth=shiftMonth(selectedMonth,-1);if(selectedMonth<'2000-01')selectedMonth='2000-01';redraw();});
  $('nextMonth').addEventListener('click',()=>{if(selectedMonth<koreaDate().slice(0,7)){selectedMonth=shiftMonth(selectedMonth,1);redraw();}});
  $('reportAI').addEventListener('change',()=>{selectedAI=$('reportAI').value;redraw();});
  $('reportMethod').addEventListener('change',()=>{selectedMethod=$('reportMethod').value;redraw();});
  $('rankingSearch').addEventListener('input',()=>{if(model)renderRanking();});
  $('closeEvidence').addEventListener('click',()=>{$('evidenceDialog').close();activeEvidence=[];});
  document.addEventListener('click',event=>{
    const hospital=event.target.closest('[data-hospital]');
    if(hospital){const row=model.ranks.find(r=>r.name===hospital.dataset.hospital);if(row)showEvidence(row.name+' · 추천 근거',row.records);}
    const insight=event.target.closest('[data-insight]');
    if(insight){const item=insights[Number(insight.dataset.insight)];if(item)showEvidence(item.title,item.records);}
    const question=event.target.closest('[data-question]');
    if(question){const item=model.questions[Number(question.dataset.question)];if(item)showEvidence('질문별 실제 응답',item.answers);}
  });
}
