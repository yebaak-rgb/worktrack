import { chromium } from 'playwright';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// This first migration gate never submits questions or writes production data.
// No existing browser profile, account, cookies, or secrets are used.
const output = new URL('./output/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: process.env.HEADED !== 'true' });
const results = [];
const providers = [
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { name: 'Gemini', url: 'https://gemini.google.com/app' },
];
try {
  for (const provider of providers) {
    const context = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const result = { provider: provider.name, checkedAt: new Date().toISOString(), questionsSent: 0, productionWrites: 0 };
    try {
      const response = await page.goto(provider.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      result.httpStatus = response?.status() ?? null;
      // A bounded render window allows the initial app to finish loading.
      await page.waitForTimeout(12000);
      result.url = page.url();
      result.title = await page.title();
      const visibleText = await page.locator('body').innerText({ timeout: 15000 });
      const controls = await page.locator('textarea, [contenteditable="true"], input[type="text"], [role="textbox"]').all();
      result.visibleEditors = 0;
      for (const control of controls) {
        if (await control.isVisible() && await control.isEditable()) result.visibleEditors++;
      }
      result.signedOutEvidence = /로그인|Sign in|Log in/i.test(visibleText);
      result.accessChallenge = /verify you are human|checking your browser|unusual traffic|사람인지 확인|비정상적인 트래픽|보안 확인|access denied/i.test(visibleText)
        || [403, 429].includes(result.httpStatus)
        || await page.locator('iframe[title*="challenge" i], iframe[title*="captcha" i]').first().isVisible().catch(() => false);
      result.status = result.accessChallenge ? 'blocked'
        : result.signedOutEvidence && result.visibleEditors ? 'candidate_for_question_test' : 'manual_review_required';
      await writeFile(new URL(provider.name + '.txt', output), visibleText);
      await page.screenshot({ path: fileURLToPath(new URL(provider.name + '.png', output)), fullPage: true, timeout: 15000 });
    } catch (error) {
      result.status = 'error';
      result.error = String(error.message).slice(0, 1500);
    } finally {
      await context.close();
    }
    results.push(result);
    console.log(JSON.stringify(result));
  }
} finally {
  await browser.close();
}
await writeFile(new URL('summary.json', output), JSON.stringify(results, null, 2));
const lines = [
  '# 비로그인 클라우드 접근 시험',
  '',
  '질문 전송 0건 · 운영 데이터 저장 0건. 입력창이 보여도 실제 응답 수집 가능 여부는 별도 시험이 필요합니다.',
  '',
  '| AI | 상태 | HTTP | 입력창 | 비로그인 근거 |',
  '| --- | --- | --- | --- | --- |',
  ...results.map(r => `| ${r.provider} | ${r.status} | ${r.httpStatus ?? '-'} | ${r.visibleEditors ?? 0} | ${r.signedOutEvidence ?? false} |`),
  '',
  '로그인 요구나 접근 제한을 우회하지 않습니다. 기존 PC 예약은 이관 검증 완료 전까지 유지합니다.',
];
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
if (results.some(r => r.status !== 'candidate_for_question_test')) process.exitCode = 1;
