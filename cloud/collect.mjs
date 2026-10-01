import { chromium } from 'playwright';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { collectAnswer, providers } from './browser.mjs';
import { classify } from './classify.mjs';

const endpoint = 'https://qdyumevxeqydjniectol.supabase.co/functions/v1/yeba-radar-cloud';
const output = new URL('./output/', import.meta.url);
await mkdir(output, { recursive: true });
async function storage(method = 'GET', body) {
  const tokenURL = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  tokenURL.searchParams.set('audience', 'yeba-radar-cloud');
  const tokenResponse = await fetch(tokenURL, { headers: { Authorization: `Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` }, signal: AbortSignal.timeout(20000) });
  if (!tokenResponse.ok) throw new Error('GitHub 실행 인증 발급 실패');
  const { value: token } = await tokenResponse.json();
  if (!token) throw new Error('GitHub 실행 인증 누락');
  const response = await fetch(endpoint, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`사이트 저장 연결 실패 (${response.status})`);
  return response.json();
}
const state = await storage();
if (!Array.isArray(state.settings?.questions) || !state.settings.questions.length) throw new Error('사이트 질문 목록 누락');
const results = [], evidence = [];
const browser = await chromium.launch({ headless: process.env.HEADED !== 'true' });
try {
  for (const provider of providers) {
    let stopped = false;
    for (const [index, question] of state.settings.questions.entries()) {
      if (state.completed.some(r => r.ai === provider.name && r.question === question)) continue;
      let result;
      if (stopped) result = { ai: provider.name, question, status: '실패', answer: '이 서비스의 앞선 질문에서 접근 제한·로그인 요구가 확인되어 이후 질문은 전송하지 않았습니다.', source_url: provider.url };
      else {
        result = await collectAnswer(browser, provider, question, output, `${provider.name}-${index + 1}`);
        evidence.push(result);
        stopped = result.blocked;
      }
      let classification = { hospitals: [], our_mention: false };
      if (result.status === '완료') {
        classification = classify(result.answer, state.settings);
        if (classification.needsReview) {
          result.status = '실패';
          result.answer = '[자동 분류 검토 필요: 실제 답변은 받았으나 추천 치과 목록을 확정하지 못해 추천률 집계에서 제외합니다.]\n\n' + result.answer;
          classification = { hospitals: [], our_mention: false };
        }
      }
      const row = { ai: result.ai, question, answer: result.answer, status: result.status, source_url: result.source_url, hospitals: classification.hospitals, our_mention: classification.our_mention };
      results.push(row);
      await writeFile(new URL('collection.json', output), JSON.stringify({ date: state.date, results, evidence }, null, 2));
      const saved = await storage('POST', { date: state.date, results: [row] });
      if (saved.storage_provider !== 'worktrack-supabase') throw new Error('운영 저장소 응답 불일치');
      console.log(`${provider.name} 질문 ${index + 1}: ${result.status}, 저장 ${saved.saved}, 기존 성공 보존 ${saved.preserved}`);
    }
  }
} finally { await browser.close(); }
const verified = await storage();
const expected = state.settings.questions.length * providers.length;
const complete = verified.completed.length;
const summary = `# 예바 클라우드 조사\n\n한국 날짜: ${state.date}\n\n오늘 완료 ${complete}/${expected}건 · 이번 실행 ${results.length}건 · 기존 성공 기록은 보존했습니다.\n\n` + results.map(r => `- ${r.ai}: ${r.status} · 예바 추천 ${r.our_mention ? '있음' : '없음/미집계'}`).join('\n');
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
await writeFile(new URL('verified.json', output), JSON.stringify({ date: verified.date, expected, complete, processed: results.length }, null, 2));
if (complete < expected) process.exitCode = 1;
