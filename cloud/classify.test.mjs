import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './classify.mjs';
const settings = { targetName: '예바치과교정과치과의원', aliases: '예바, YEBA, 예바치과' };
test('unresolved exact target mention is flagged for review instead of silent negative',()=>{
 const result=classify('디자인치과\n다른 형식의 본문: 예바치과교정과치과의원도 상담해 보세요.',settings);
 assert.equal(result.our_mention,false);
 assert.equal(result.needsReview,true);
 assert.equal(classify('예바치과교정과의원\n디자인치과',settings).needsReview,false);
});
test('Gemini region-first headings retain clinic names despite excluded source labels',()=>{
 const answer='예바치과교정과의원\n서면 예바치과교정과치과의원 | 부산 서면역 교정전문치과·인비절라인\n1. 부산 해운대구 — 연세센텀치과교정과치과의원 (센텀시티)\n2. 부산 부산진구(서면) — 예바치과교정과치과의원 (서면역)\n예바치과교정과의원\n3. 부산 부산진구(서면) — CS치과병원';
 const result=classify(answer,settings);
 assert.equal(result.our_mention,true);
 for(const name of ['예바치과교정과치과의원','연세센텀치과교정과치과의원','CS치과병원'])assert(result.hospitals.includes(name));
});
test('region-first Dongnae heading remains excluded even with the Seomyeon formal name',()=>{
 const result=classify('1. 부산 동래구 — 예바치과교정과치과의원',settings);
 assert.equal(result.our_mention,false);
 assert.deepEqual(result.hospitals,['부산 동래구 — 예바치과교정과치과의원']);
});
test('clinic headings count once and retain source names', () => {
  const result = classify('1. 예바치과교정과치과의원 (서면)\n추천 이유: 전문의\n예바치과교정과치과의원\n연세센텀치과 교정과치과의원\n', settings);
  assert.deepEqual(result.hospitals, ['예바치과교정과치과의원', '연세센텀치과 교정과치과의원']);
  assert.equal(result.our_mention, true);
  assert.equal(result.needsReview, false);
});
test('prose-only target mention does not count as a recommendation', () => {
  const result = classify('디자인치과교정과\n추천합니다. 예바치과에 대해서는 정보가 없습니다.', settings);
  assert.equal(result.our_mention, false);
});
test('missing reviewed structure is withheld rather than recorded as zero', () => {
  assert.equal(classify('여러 치과에서 상담을 받아보세요.', settings).needsReview, true);
});
test('comparison tables, branch labels and translated map cards retain all clinics', () => {
  const result = classify('서울클리어치과교정과치과의원 부산서면\n서울바른교정치과 부산점\t덕천\t성인교정\n뉴티스 치과교정과\t구서역\t전문의\n부산 굿윌치과병원 서면 Goodwill Busan Dental Clinic 釜山牙科', settings);
  assert.deepEqual(result.hospitals, ['서울클리어치과교정과치과의원 부산서면', '서울바른교정치과 부산점', '뉴티스 치과교정과', '부산 굿윌치과병원 서면']);
});
