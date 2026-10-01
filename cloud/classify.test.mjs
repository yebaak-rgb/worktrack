import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './classify.mjs';
const settings = { targetName: '예바치과교정과치과의원', aliases: '예바, YEBA, 예바치과' };
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
