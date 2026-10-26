import test from 'node:test';
import assert from 'node:assert/strict';
import {classify} from './classify.mjs';
import {hasRecommendationEvidence,isExcludedHospital,targetInText,networkRecommendationNames} from '../radar-classification.js';
import {buildMonth} from '../radar-analytics.js';
const settings={targetName:'예바치과교정과치과의원',aliases:'예바',questions:['추천']};
test('October 26 circled headings retain the network and every actual clinic',()=>{
 const name='예바치과교정과의원 (서면점 / 해운대센텀점 / 동래점 / 덕천점)';
 const answer=`① ${name}\nprettymiso.com\n특징: 교정 중점 네트워크 치과입니다.\n② 연세센텀치과교정과치과의원 (해운대 센텀)\n③ 뉴욕스마일치과의원 (해운대 장산)\n④ CS치과병원 (서면)`;
 const r=classify(answer,settings);
 assert.equal(r.our_mention,true);assert.equal(r.needsReview,false);
 for(const h of [name,'연세센텀치과교정과치과의원','뉴욕스마일치과의원','CS치과병원'])assert(r.hospitals.includes(h));
 assert.equal(isExcludedHospital(name),false);assert.equal(targetInText(name,settings),true);
 const m=buildMonth([{id:'n',date:'2026-10-26',ai:'Gemini',question:'추천',answer,hospitals:r.hospitals,ourMention:true,status:'완료',collectionMethod:'비로그인 웹'}],settings,{month:'2026-10',today:'2026-10-26'});
 assert.equal(m.own.length,1);assert.equal(m.ranks.find(r=>r.name==='예바치과').count,1);
});
test('network-wide names count without inventing a branch label',()=>{
 for(const name of ['예바 네트워크','예바치과 네트워크','예바치과교정과의원 네트워크']){
 const answer='1. '+name+'\n추천 이유: 교정 진료';
 const r=classify(answer,settings);assert.equal(r.our_mention,true);assert(r.hospitals.includes(name));
 }
});
test('another branch alone, competitor network and incidental references do not count',()=>{
 for(const answer of ['① 예바치과교정과의원 (동래점)','예바치과 동래점 (예바 네트워크)','예바치과교정과의원 (동래점 / 덕천점)','서울클리어치과 치아교정네트워크\n예바치과교정과의원','예바 네트워크는 추천하지 않습니다.\n다른치과']){
 assert.equal(classify(answer,settings).our_mention,false,answer);
 assert.deepEqual(networkRecommendationNames(answer),[]);
 }
 assert.equal(hasRecommendationEvidence('예바 네트워크',['다른치과'],settings),false);
 assert.equal(hasRecommendationEvidence('다른치과',['예바 네트워크'],settings),false);
 assert.equal(classify('예바 네트워크',{targetName:'다른치과',aliases:''}).our_mention,false);
});
