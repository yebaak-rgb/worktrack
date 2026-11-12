import test from 'node:test';
import assert from 'node:assert/strict';
import {classify} from './classify.mjs';
const settings={targetName:'예바치과교정과치과의원',aliases:'서면 예바'};
test('November 8 table examples retain all explicitly recommended clinics',()=>{
 const answer='추천 대상 및 참고할 만한 치과 유형\n• 대표예: 서면 예바치과교정과치과의원, 서면 CS치과병원 등\n• 대표예: 부산대학교치과병원\n• 대표예: 연세센텀치과교정과치과의원(해운대·우동), 키다리아저씨치과(연제구) 등';
 const r=classify(answer,settings);
 assert.equal(r.our_mention,true); assert.equal(r.needsReview,false);
 assert.deepEqual(new Set(r.hospitals),new Set(['서면 예바치과교정과치과의원','서면 CS치과병원','부산대학교치과병원','연세센텀치과교정과치과의원','키다리아저씨치과']));
});
test('November 9 clinic examples inside numbered category headings are extracted',()=>{
 const r=classify('1. 교정 전문 치과 (예: 예바치과교정과치과의원 등)\n2. 대학병원 급 대형 치과병원 (예: 굿윌치과병원, CS치과병원, 라인업치과 등)',settings);
 assert.equal(r.our_mention,true); assert.equal(r.needsReview,false);
 for(const name of ['예바치과교정과치과의원','굿윌치과병원','CS치과병원','라인업치과']) assert(r.hospitals.includes(name));
});
test('table cells and location parentheses do not lose clinic examples',()=>{
 for(const sep of ['\t',' | ']){
  const r=classify('성인 교정'+sep+'• 대표 예: 예바치과교정과치과의원, 연세센텀치과교정과치과의원(해운대, 우동) 등'+sep+'상담',settings);
  assert.equal(r.our_mention,true);assert(r.hospitals.includes('연세센텀치과교정과치과의원'));
 }
});
test('example expansion preserves Dongnae exclusions and leaves unnamed guidance in review',()=>{
 const r=classify('1. 교정 전문 치과 (예: 예바치과교정과의원 동래점 등)',settings);
 assert.equal(r.our_mention,false);
 const unnamed=classify('서면/부전동 권역 (교정 전문 치과 밀집 지역)\n치과교정과 전문의 상주 여부를 확인하세요.',settings);
 assert.equal(unnamed.our_mention,false);assert.equal(unnamed.needsReview,true);
});
test('prose, non-recommendation examples and negative lists are not promoted',()=>{
 for(const answer of ['본문에서 예바치과교정과치과의원도 언급했습니다.','잘못된 치과 예시 (예: 예바치과교정과치과의원 등)','비추천 치과 (예: 예바치과교정과치과의원 등)','제외할 치과 (예: 예바치과교정과치과의원 등)']){
  assert.equal(classify(answer,settings).our_mention,false,answer);
 }
});
