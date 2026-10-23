import test from 'node:test';
import assert from 'node:assert/strict';
import {classify} from './classify.mjs';
import {hasRecommendationEvidence, isClassificationReview, collectionLabel} from '../radar-classification.js';
import {buildMonth} from '../radar-analytics.js';
import {readFileSync} from 'node:fs';
const settings={targetName:'예바치과교정과치과의원',aliases:'서면 예바',questions:['추천']};
test('October 23 regional colon headings classify the actual recommendations',()=>{
 const r=classify('1. 해운대 센텀시티 권역: 연세센텀치과교정과치과의원\n2. 서면 권역: 예바치과교정과치과의원\n예바치과교정과의원\n3. 서면 / 센텀 / 광안 권역: 뉴욕치과 (서면뉴욕·센텀뉴욕·광안뉴욕 등)',settings);
 assert.equal(r.our_mention,true);assert.equal(r.needsReview,false);
 for(const n of ['연세센텀치과교정과치과의원','예바치과교정과치과의원','뉴욕치과'])assert(r.hospitals.includes(n));
});
test('explicit Seomyeon overrides abbreviated name without including Dongnae',()=>{
 const answer='2. 예바치과교정과의원 동래점\n4. 예바치과교정과의원 서면점';
 assert.equal(classify(answer,settings).our_mention,true);
 assert.equal(hasRecommendationEvidence(answer,['예바치과교정과의원 동래점'],settings),false);
 assert.equal(hasRecommendationEvidence(answer,['예바치과교정과의원 서면점'],settings),true);
});
test('mixed Korean and English clinic names are not stripped as translations',()=>{
 assert(classify('서면 CS치과병원\t서면역\n오늘의 치과',settings).hospitals.includes('서면 CS치과병원'));
 assert(!classify('서면 CS치과병원\t서면역\n오늘의 치과',settings).hospitals.includes('오늘의 치과'));
});
test('review is collected but excluded from rates, not an access failure or negative',()=>{
 const row={id:'r',date:'2026-10-23',ai:'Gemini',question:'추천',status:'실패',answer:'[자동 분류 검토 필요: 원문 보존]\n실제 응답',collectionMethod:'비로그인 웹'};
 assert.equal(isClassificationReview(row),true);
 assert.equal(collectionLabel(row),'수집 완료 · 분류 검토');
 const m=buildMonth([row],settings,{month:'2026-10',today:'2026-10-23'});
 assert.equal(m.failed.length,0);assert.equal(m.review.length,1);assert.equal(m.rate,null);
});
test('deployed server and frontend share the exact branch evidence rules',()=>{
 assert.equal(readFileSync(new URL('../radar-classification.js',import.meta.url),'utf8'),readFileSync(new URL('../supabase/functions/yeba-radar-cloud/radar-classification.js',import.meta.url),'utf8'));
});

test('October table retains a branch on the next nonempty line',()=>{
 const answer='예바치과교정과의원\n\n\n(부산진구 서면)\n\t전문의\nCS치과병원';
 const r=classify(answer,settings);
 assert.equal(r.our_mention,true);assert.equal(r.needsReview,false);
 assert(r.hospitals.includes('예바치과교정과의원 (부산진구 서면)'));
 assert.equal(hasRecommendationEvidence('예바치과교정과의원\n디자인치과\n(부산진구 서면)', ['예바치과교정과의원'],settings),false);
 assert.equal(classify('예바치과교정과의원\n(동래구 온천동)',settings).our_mention,false);
});

test('combined branch heading preserves Seomyeon while Dongnae alone stays excluded',()=>{
 const answer='2. 예바치과교정과 — 서면/동래권에서 비교하기 좋은 후보\n예바는 부산진구 서면에 별도 지점이 있습니다.';
 const r=classify(answer,settings);
 assert.equal(r.our_mention,true);assert.equal(r.needsReview,false);
 assert(r.hospitals.includes('예바치과교정과 — 서면/동래권'));
 assert.equal(classify('2. 예바치과교정과 — 동래권\n서면에서도 접근 가능합니다.',settings).our_mention,false);
});

test('Seomyeon introduction does not resolve an ambiguous abbreviated card',()=>{
 const r=classify('서면 지역 치과 추천\n예바치과교정과의원\n전문의 진료\nCS치과병원',settings);
 assert.equal(r.our_mention,false);assert.equal(r.needsReview,true);
 assert.equal(classify('서면도 고려한다면\n예바치과교정과의원\n동래구 온천동',settings).needsReview,false);
});

test('generic headings and description prefixes do not become separate clinics',()=>{
 const r=classify('교정 전문의 중심 치과\n추가로 비교할 만한 치과\n투명교정 진료가 가능한 치과\n정밀검사와 유지관리가 잘 갖춰진 치과\n해운대 센텀 지역에 위치한 연세센텀치과 교정과치과의원\n연세센텀치과 교정과치과의원',settings);
 assert.deepEqual(r.hospitals,['연세센텀치과 교정과치과의원']);
});
