import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMonth, buildInsights, canonicalHospital, uniqueRecords, shiftMonth} from './radar-analytics.js';
const settings={targetName:'예바치과교정과치과의원',aliases:'예바, YEBA, 예바치과',questions:['부산 교정 추천','서면 교정 추천','성인 교정 추천']};
const row=(extra={})=>({id:'r',date:'2026-09-17',ai:'ChatGPT',question:settings.questions[0],answer:'예바치과와 비교치과를 추천합니다. 정밀 진단과 상담을 확인하세요.',hospitals:['예바치과','비교치과'],ourMention:true,status:'완료',collectionMethod:'비로그인 웹',sourceUrl:'https://chatgpt.com/',...extra});
const report=(records,opts={})=>buildMonth(records,settings,{month:'2026-09',today:'2026-09-17',...opts});
test('aliases and duplicates count once per answer without changing source',()=>{
 const records=[row({hospitals:['예바치과','예바치과교정과치과의원','YEBA','비교치과','비교 치과의원']})];
 const original=JSON.stringify(records),m=report(records);
 assert.equal(m.ranks.length,2);assert.equal(m.rank.count,1);assert.equal(m.rate,100);assert.equal(m.rank.aliases.length,3);assert.equal(JSON.stringify(records),original);
});
test('calendar months, year rollover, previous data and partial month comparison',()=>{
 const m=report([row(),row({date:'2026-08-31',ourMention:false,hospitals:['비교치과']}),row({date:'2026-07-31'})]);
 assert.equal(m.complete.length,1);assert.equal(m.previous.length,1);assert.equal(m.delta,100);assert.equal(m.rank.rankChange,'new');assert.equal(shiftMonth('2026-01',-1),'2025-12');
});
test('failure excluded from denominator; no record is not zero',()=>{
 const m=report([row(),row({ai:'Gemini',status:'실패',answer:'로그인 필요',hospitals:[],ourMention:false})]);
 assert.equal(m.rate,100);assert.equal(m.failed.length,1);assert.equal(m.provider[1].rate,null);assert.equal(m.days[0].rate,null);
 assert.equal(report([]).rate,null);assert.equal(report([]).rank,undefined);assert.equal(report([]).delta,null);
});
test('default web filter excludes API and unknown collection methods',()=>{
 const rows=[row(),row({ai:'Gemini',collectionMethod:'API'}),row({ai:'Perplexity',collectionMethod:undefined})];
 assert.equal(report(rows).complete.length,1);assert.equal(report(rows,{method:'all'}).complete.length,3);assert.equal(report(rows,{method:'api'}).complete.length,1);
});
test('date/AI/question update wins; invalid, demo, future and Claude are excluded',()=>{
 const rows=[row({savedAt:'2026-09-17T00:00:00Z'}),row({savedAt:'2026-09-17T01:00:00Z',ourMention:false,hospitals:['비교치과']}),row({ai:'Claude'}),row({id:'seed-x',question:'x'}),row({date:'2026-09-31'}),row({date:'2026-09-18'}),row({demo:true,question:'demo'})];
 const m=report(rows);assert.equal(m.complete.length,1);assert.equal(m.rate,0);assert.equal(uniqueRecords(rows,'2026-09-17').length,1);
});
test('manual NO and unsupported YES do not inflate ranking',()=>{
 const m=report([row({ourMention:false}),row({ai:'Gemini',answer:'비교치과만 추천합니다.'})]);
 assert.equal(m.own.length,0);assert.equal(m.rank,undefined);assert.equal(m.inconsistencies.length,2);assert(buildInsights(m,settings).some(i=>i.type==='quality'));
});
test('all ranks beyond four, ties use competition ranks; branch names retained',()=>{
 const hospitals=['가치과','나치과','다치과','라치과','마치과','바치과','사치과'];
 const m=report([row({hospitals,ourMention:false}),row({ai:'Gemini',hospitals:['가치과','나치과'],ourMention:false})]);
 assert.equal(m.ranks.length,7);assert.deepEqual(m.ranks.slice(0,3).map(r=>r.rank),[1,1,3]);
 assert.notEqual(canonicalHospital('비교치과 서면점',settings),canonicalHospital('비교치과 해운대점',settings));
 assert.equal(canonicalHospital('연세센텀치과 교정과치과의원',settings),'연세센텀치과');
});
test('provider/question filters and dated daily series use real observations',()=>{
 const m=report([row(),row({ai:'Gemini',question:settings.questions[1],date:'2026-09-15',ourMention:false,hospitals:[]})]);
 assert.equal(m.observedDays,2);assert.equal(m.days[14].rate,0);assert.equal(m.days[16].rate,100);assert.equal(m.days[15].rate,null);assert.equal(m.questions[2].rate,null);
 assert.equal(report(m.rows,{ai:'Gemini'}).rate,0);
});
test('insights cite source rows, distinguish proposals and preserve raw answers',()=>{
 const rows=[row({ourMention:false,hospitals:['비교치과']}),row({ai:'Perplexity',status:'실패',answer:'로그인 요구',ourMention:false,hospitals:[]})];
 const actions=buildInsights(report(rows),settings);
 assert.equal(actions[0].type,'collection');assert.equal(actions.find(i=>i.type==='content').records[0].answer,rows[0].answer);
 assert(actions.find(i=>i.type==='theme').fact.includes('추천 원인 분석은 아닙니다'));
 assert.equal(buildInsights(report([]),settings).at(-1).priority,'자료 필요');
});
