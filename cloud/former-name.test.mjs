import test from 'node:test';
import assert from 'node:assert/strict';
import {classify} from './classify.mjs';
import {hasRecommendationEvidence} from '../radar-classification.js';
import {hasRecommendationEvidence as edgeEvidence} from '../supabase/functions/yeba-radar-cloud/radar-classification.js';
import {buildMonth, canonicalHospital} from '../radar-analytics.js';
import {validateRecord} from '../radar-storage.js';

const former = '예쁜미소바른이치과';
const current = '예바치과교정과치과의원';
const settings = {targetName:current, aliases:'서면예바', questions:['서면 교정치과 추천']};
const answer = [
  '치과명\t주요 특징 및 강점\t추천 대상',
  '수치과병원 (서면점)\t분야별 협진\t복합 진료',
  former + '\t교정과 전문의 중심, 오랜 임상 경험\t사후 관리',
  '2. ' + former,
  '추천 이유: 서면에서 오랫동안 교정 진료에 집중해 온 곳으로 소개됩니다.',
].join('\n');

test('Gemini recommendation body identifies the historical name and preserves the source', () => {
  const result = classify(answer, settings);
  assert.equal(result.our_mention, true);
  assert.equal(result.needsReview, false);
  assert.deepEqual(result.hospitals, ['수치과병원', former]);
  assert.equal(edgeEvidence(answer, result.hospitals, settings), true);
  assert.equal(hasRecommendationEvidence(answer, ['수치과병원'], settings), false);
  const saved = validateRecord({ai:'Gemini', question:settings.questions[0], answer,
    hospitals:result.hospitals, our_mention:true, status:'완료'}, '2026-11-24', '비로그인 웹', settings);
  assert.equal(saved.answer, answer);
  assert.deepEqual(saved.hospitals, result.hospitals);
});

test('explicit Seomyeon headings, list introductions and either order of location cells', () => {
  for (const source of [
    '1. 서면 예쁜미소 바른이치과의원',
    '1. 예쁜미소바른이치과 (서면점)',
    '서면 일대 대표적인 치과 4곳과 추천 이유입니다.\n' + former + '\t교정 상담',
    '| 서면역 인근 | ' + former + ' | 교정 상담 |',
    former + '\t부산진구 중앙대로 736 경암센터 4층',
  ]) {
    const result = classify(source, settings);
    assert.equal(result.our_mention, true, source);
    assert.equal(result.needsReview, false, source);
    assert.equal(edgeEvidence(source, result.hospitals, settings), true, source);
  }
});

test('other branches, source labels, negatives and other clinics cannot supply location', () => {
  const configured = {...settings, aliases:former};
  for (const source of [
    '1. 해운대예쁜미소바른이치과\n추천 이유: 서면에서도 이동 가능',
    '서면 일대 대표 치과 추천\n1. 예쁜미소바른이치과 (동래점)',
    '서면 치과 추천\n1. 예쁜미소바른이치과\n위치: 덕천역',
    '해운대\t해운대예쁜미소바른이치과\t네트워크',
    '1. ' + former + '\n2. 다른치과\n추천 이유: 서면에서 진료',
    '1. ' + former + ' (서면점)\n추천하지 않습니다.',
    '다른치과\t서면역\t' + former,
    '다른치과를 추천합니다.\n출처\n- 서면 예쁜미소바른이치과',
  ]) {
    const result = classify(source, configured);
    assert.equal(result.our_mention, false, source);
    assert.equal(edgeEvidence(source, result.hospitals, configured), false, source);
  }
  assert.equal(hasRecommendationEvidence(answer, [former], {targetName:'다른치과', aliases:''}), false);
});

test('rankings merge both names once per answer and keep an explicit Haeundae row separate', () => {
  const source = answer + '\n3. ' + current + '\n4. ' + former + ' (해운대점)';
  const result = classify(source, settings);
  const record = {id:'gemini-q2', date:'2026-11-24', ai:'Gemini', question:settings.questions[0],
    answer:source, hospitals:result.hospitals, ourMention:result.our_mention, status:'완료', collectionMethod:'비로그인 웹'};
  const report = buildMonth([record], settings, {month:'2026-11',today:'2026-11-24'});
  assert.equal(report.rank.count, 1);
  assert.deepEqual(report.rank.aliases.sort(), [former,current].sort());
  assert(report.ranks.some(row => row.name.includes('해운대')));
  assert(!report.ranks.some(row => row.name === former));
  assert.notEqual(canonicalHospital(former + ' (해운대점)', settings, source), '예바치과');
});
