import { chromium } from 'playwright';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const question = '부산에서 교정치과 잘하는 곳 추천해줘. 그리고 이유도 알려줘.';
const output = new URL('./output/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: process.env.HEADED !== 'true' });
const results = [];
const providers = [
  { name: 'ChatGPT', url: 'https://chatgpt.com/', answer: '[data-message-author-role="assistant"]' },
  { name: 'Gemini', url: 'https://gemini.google.com/app', answer: 'model-response' },
];
async function blocked(page) {
  const body = await page.locator('body').innerText();
  return /verify you are human|checking your browser|unusual traffic|사람인지 확인|비정상적인 트래픽|보안 확인|access denied/i.test(body)
    || await page.locator('iframe[title*="challenge" i], iframe[title*="captcha" i]').first().isVisible().catch(() => false)
    || await page.getByRole('dialog').filter({ hasText: /로그인|Sign in|Log in/i }).first().isVisible().catch(() => false);
}
try {
  for (const provider of providers) {
    const context = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const result = { provider: provider.name, question, checkedAt: new Date().toISOString(), questionsSent: 0, productionWrites: 0, status: 'not_collected' };
    try {
      const response = await page.goto(provider.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(12000);
      if ([403, 429].includes(response?.status()) || await blocked(page)) throw new Error('접근 제한 또는 로그인 창: 질문을 보내지 않았습니다.');
      const body = await page.locator('body').innerText();
      if (!/로그인|Sign in|Log in/i.test(body)) throw new Error('비로그인 근거를 확인할 수 없습니다.');
      const editors = [];
      for (const editor of await page.locator('textarea, [contenteditable="true"], input[type="text"], [role="textbox"]').all()) {
        if (await editor.isVisible() && await editor.isEditable()) editors.push(editor);
      }
      if (editors.length !== 1) throw new Error('질문 입력창이 하나로 확인되지 않습니다.');
      await editors[0].fill(question);
      await editors[0].press('Enter');
      result.questionsSent = 1;
      const deadline = Date.now() + 180000;
      let previous = '', stableSince = Date.now();
      while (Date.now() < deadline) {
        await page.waitForTimeout(3000);
        if (await blocked(page)) throw new Error('질문 전송 후 접근 제한 또는 로그인 요구가 표시됐습니다.');
        const visibleBody = await page.locator('body').innerText();
        if (/채팅이 예기치 않게 중지|Something went wrong|일시적으로 사용할 수 없/i.test(visibleBody)) throw new Error('응답 생성 오류가 표시됐습니다.');
        const answer = page.locator(provider.answer).last();
        if (!await answer.isVisible().catch(() => false)) continue;
        const text = await answer.innerText();
        if (text !== previous) { previous = text; stableSince = Date.now(); }
        const generating = await page.getByRole('button', { name: /Stop generating|Stop response|응답 중지|생성 중지|답변 중지/i }).first().isVisible().catch(() => false);
        if (text.trim().length > 40 && !generating && Date.now() - stableSince >= 12000) {
          result.answer = text;
          result.status = 'answer_captured_pending_review';
          break;
        }
      }
      if (!result.answer) throw new Error('제한 시간 내 완료된 답변을 확인하지 못했습니다. 재전송하지 않았습니다.');
    } catch (error) {
      result.error = String(error.message).slice(0, 1500);
    } finally {
      result.url = page.url();
      await writeFile(new URL(provider.name + '-question.txt', output), await page.locator('body').innerText().catch(() => '화면 읽기 실패'));
      await page.screenshot({ path: fileURLToPath(new URL(provider.name + '-question.png', output)), fullPage: true, timeout: 15000 }).catch(() => {});
      await context.close();
    }
    results.push(result);
    console.log(JSON.stringify({ provider: result.provider, status: result.status, questionsSent: result.questionsSent, answerLength: result.answer?.length ?? 0, error: result.error }));
  }
} finally { await browser.close(); }
await writeFile(new URL('question-summary.json', output), JSON.stringify(results, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
  '# 클라우드 실제 질문 시험\n\n운영 저장 0건. 원문과 수집 완료 여부 검토 후 저장 연결을 진행합니다.\n\n' + results.map(r => `- ${r.provider}: ${r.status}, 전송 ${r.questionsSent}건, 원문 ${r.answer?.length ?? 0}자${r.error ? ', ' + r.error : ''}`).join('\n'));
if (results.some(r => r.status !== 'answer_captured_pending_review')) process.exitCode = 1;
