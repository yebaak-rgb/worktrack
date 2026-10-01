import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const providers = [
  { name: 'ChatGPT', url: 'https://chatgpt.com/', selector: '[data-message-author-role="assistant"]' },
  { name: 'Gemini', url: 'https://gemini.google.com/app', selector: 'model-response' },
];
async function blocked(page) {
  const body = await page.locator('body').innerText();
  return /verify you are human|checking your browser|unusual traffic|사람인지 확인|비정상적인 트래픽|보안 확인|access denied/i.test(body)
    || await page.locator('iframe[title*="challenge" i], iframe[title*="captcha" i]').first().isVisible().catch(() => false)
    || await page.getByRole('dialog').filter({ hasText: /로그인|Sign in|Log in/i }).first().isVisible().catch(() => false);
}
export async function collectAnswer(browser, provider, question, output, label) {
  const context = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const result = { ai: provider.name, question, checkedAt: new Date().toISOString(), questionsSent: 0, status: '실패', blocked: false };
  try {
    const response = await page.goto(provider.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(12000);
    if ([403, 429].includes(response?.status()) || await blocked(page)) {
      result.blocked = true;
      throw new Error('접근 제한 또는 로그인 요구로 질문을 전송하지 않았습니다.');
    }
    const body = await page.locator('body').innerText();
    if (!/로그인|Sign in|Log in/i.test(body)) throw new Error('비로그인 근거를 확인하지 못해 질문을 전송하지 않았습니다.');
    const editors = [];
    for (const editor of await page.locator('textarea, [contenteditable="true"], input[type="text"], [role="textbox"]').all()) {
      if (await editor.isVisible() && await editor.isEditable()) editors.push(editor);
    }
    if (editors.length !== 1) throw new Error('질문 입력창이 하나로 확인되지 않아 전송하지 않았습니다.');
    await editors[0].fill(question);
    await editors[0].press('Enter');
    result.questionsSent = 1;
    const deadline = Date.now() + 180000;
    let previous = '', stableSince = Date.now();
    while (Date.now() < deadline) {
      await page.waitForTimeout(3000);
      if (await blocked(page)) { result.blocked = true; throw new Error('질문 전송 후 접근 제한 또는 로그인 요구가 표시됐습니다.'); }
      const visibleBody = await page.locator('body').innerText();
      if (/채팅이 예기치 않게 중지|Something went wrong|일시적으로 사용할 수 없/i.test(visibleBody)) throw new Error('응답 생성 오류가 표시됐습니다.');
      const region = page.locator(provider.selector).last();
      let text = await region.isVisible().catch(() => false) ? await region.innerText() : '';
      if (!text && provider.name === 'ChatGPT') {
        const marker = 'ChatGPT의 말:';
        const start = visibleBody.lastIndexOf(marker);
        if (start >= 0) {
          text = visibleBody.slice(start + marker.length);
          const end = text.lastIndexOf('ChatGPT와 채팅');
          if (end >= 0) text = text.slice(0, end);
          text = text.trim();
        }
      }
      if (!text) continue;
      if (text !== previous) { previous = text; stableSince = Date.now(); }
      const generating = await page.getByRole('button', { name: /Stop generating|Stop response|응답 중지|생성 중지|답변 중지/i }).first().isVisible().catch(() => false);
      if (text.trim().length > 40 && !generating && Date.now() - stableSince >= 12000) {
        result.answer = text;
        result.status = '완료';
        break;
      }
    }
    if (!result.answer) throw new Error('제한 시간 내 완료된 답변을 확인하지 못했습니다. 재전송하지 않았습니다.');
  } catch (error) { result.answer = String(error.message).slice(0, 2000); }
  finally {
    result.source_url = page.url().startsWith(provider.url) ? page.url() : provider.url;
    await writeFile(new URL(label + '.txt', output), await page.locator('body').innerText().catch(() => '화면 읽기 실패'));
    await page.screenshot({ path: fileURLToPath(new URL(label + '.png', output)), fullPage: true, timeout: 15000 }).catch(() => {});
    await context.close();
  }
  return result;
}
