import test from 'node:test';
import assert from 'node:assert/strict';
import {targetInText,hasRecommendationEvidence} from './radar-classification.js';
import {classify} from './cloud/classify.mjs';
import {buildMonth,canonicalHospital} from './radar-analytics.js';
const settings={targetName:'예바치과교정과치과의원',aliases:'예바, YEBA, 예바치과',questions:['추천']};
test('Dongnae never matches legacy broad aliases or formal-name variants',()=>{
 for(const name of ['동래 예바','동래예바치과','예바치과교정과의원','예바치과교정과의원 서면','동래 예바치과교정과치과의원','예바치과교정과치과의원 (동래점)']){
  assert.equal(targetInText(name,settings),false,name);
  assert.equal(hasRecommendationEvidence(name,[name],settings),false,name);
 }
 assert.equal(targetInText('예바치과',settings),false);
});
test('mixed branches keep only independently supported Seomyeon evidence',()=>{
 const answer='1. 예바치과교정과의원\n2. 예바치과교정과치과의원';
 assert.equal(hasRecommendationEvidence(answer,['예바치과교정과의원'],settings),false);
 assert.equal(hasRecommendationEvidence(answer,['예바치과교정과치과의원'],settings),true);
 assert.equal(canonicalHospital('예바치과교정과의원',settings),'동래예바치과');
 assert.equal(canonicalHospital('예바치과교정과치과의원',settings),'예바치과');
});
test('English clinic headings are extracted and count without broad YEBA aliases',()=>{
 for(const name of ['YEBA Orthodontics Clinic','YEBA Othodontics']){
  const r=classify(`1. ${name}\n추천 이유\n2. Image Plus Orthodontics Dental Clinic`,settings);
  assert.equal(r.our_mention,true);assert.deepEqual(r.hospitals,[name,'Image Plus Orthodontics Dental Clinic']);
 }
});
test('parenthetical branch and Korean spacing do not lose Dongnae identity',()=>{
 const r=classify('1. 예바치과교정과치과의원 (동래점)\n2. 서울클리어치과',settings);
 assert.equal(r.our_mention,false);
 assert(r.hospitals.includes('예바치과교정과치과의원 (동래점)'));
 assert.equal(targetInText('예바 치과교정과 치과의원',settings),true);
});
test('monthly percentage excludes Dongnae and failures, but keeps English Seomyeon',()=>{
 const rows=['예바치과교정과의원','YEBA Orthodontics Clinic','예바치과교정과치과의원'].map((name,i)=>({id:String(i),date:'2026-10-21',ai:'ChatGPT',question:String(i),answer:name,hospitals:[name],ourMention:true,status:'완료',collectionMethod:'비로그인 웹'}));
 rows.push({...rows[0],id:'failed',question:'failed',status:'실패'});
 const m=buildMonth(rows,settings,{month:'2026-10',today:'2026-10-22'});
 assert.equal(m.complete.length,3);assert.equal(m.own.length,2);assert.equal(m.rate,2/3*100);
 assert.equal(m.ranks.find(r=>r.name==='동래예바치과').count,1);
});
