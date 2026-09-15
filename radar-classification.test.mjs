import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecord} from './radar-storage.js';
import {hasRecommendationEvidence} from './radar-classification.js';

const record={ai:'Perplexity',question:'부산에서 교정치과 잘하는 곳 추천해줘. 그리고 이유도 알려줘.',answer:'디자인치과교정과치과의원을 추천합니다.',hospitals:['디자인치과교정과치과의원'],our_mention:true,status:'완료',source_url:'https://www.perplexity.ai/'};
test('stale YES cannot be saved for a competitor-only answer',()=>{
  assert.throws(()=>validateRecord(record,'2026-09-15','수동 입력 · 비로그인 웹'),/원문과 추천 치과 목록/);
  const saved=validateRecord({...record,our_mention:false},'2026-09-15','수동 입력 · 비로그인 웹');
  assert.equal(saved.our_mention,false);
  assert.equal(saved.answer,record.answer);
  assert.equal(saved.collection_method,'수동 입력 · 비로그인 웹');
});
test('both answer and reviewed hospitals must support YES',()=>{
  assert.equal(hasRecommendationEvidence('예바치과를 추천합니다.',['디자인치과']),false);
  assert.equal(hasRecommendationEvidence(record.answer,['예바치과']),false);
  assert.equal(hasRecommendationEvidence('예바 치과교정과를 추천합니다.',['예바치과']),true);
  assert.equal(hasRecommendationEvidence('YEBA dental',['Yeba']),true);
  assert.equal(hasRecommendationEvidence('디자인치과 추천 https://example.com/yeba',['예바치과']),false);
});
test('manual NO is preserved and failures never count',()=>{
  assert.equal(validateRecord({...record,answer:'예바치과는 추천하지 않습니다.',hospitals:['예바치과'],our_mention:false},'2026-09-15').our_mention,false);
  const failed=validateRecord({...record,status:'실패'},'2026-09-15');
  assert.equal(failed.our_mention,false);
  assert.deepEqual(failed.hospitals,[]);
});
test('configured target names are used at the storage boundary',()=>{
  const custom={targetName:'디자인치과교정과치과의원',aliases:'디자인치과'};
  assert.equal(validateRecord(record,'2026-09-15','비로그인 웹',custom).our_mention,true);
});
