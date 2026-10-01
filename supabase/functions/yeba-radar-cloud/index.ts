import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.2.12';

const OWNER = '6a1e9d76-a239-4099-bfc8-f95c5a96fe36';
const REPO = 'yebaak-rgb/worktrack';
const JWKS = createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
const normalize = (v: unknown) => String(v ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

Deno.serve(async (request) => {
  // Gateway JWT checking is disabled for this function only; GitHub's signed,
  // short-lived OIDC token is verified here before any database access.
  try {
    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const { payload: p } = await jwtVerify(authorization.slice(7), JWKS, {
      issuer: 'https://token.actions.githubusercontent.com', audience: 'yeba-radar-cloud', algorithms: ['RS256'], maxTokenAge: '10m',
    });
    if (p.repository_id !== '1294610979' || p.repository_owner_id !== '281068635' || p.repository !== REPO
      || p.ref !== 'refs/heads/main' || p.workflow_ref !== `${REPO}/.github/workflows/radar-cloud-collect.yml@refs/heads/main`
      || !['schedule', 'workflow_dispatch'].includes(String(p.event_name)) || p.runner_environment !== 'github-hosted') return json({ error: 'forbidden' }, 403);
  } catch { return json({ error: 'unauthorized' }, 401); }
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const date = today();
    const { data: setting, error: settingsError } = await db.from('yeba_radar_settings').select('body').eq('user_id', OWNER).single();
    if (settingsError || !setting?.body?.questions?.length) throw new Error('settings_unavailable');
    const settings = setting.body;
    const { data: existing, error: readError } = await db.from('yeba_radar_records').select('ai,question,status').eq('user_id', OWNER).eq('date', date).in('ai', ['ChatGPT', 'Gemini']);
    if (readError) throw new Error('records_unavailable');
    if (request.method === 'GET') return json({ date, settings, completed: (existing || []).filter(r => r.status === '완료').map(r => ({ ai: r.ai, question: r.question })) });
    if (Number(request.headers.get('content-length') || 0) > 1000000) return json({ error: 'too_large' }, 413);
    const text = await request.text();
    if (text.length > 500000) return json({ error: 'too_large' }, 413);
    let input;
    try { input = JSON.parse(text); } catch { return json({ error: 'invalid_json' }, 400); }
    if (input.date !== date || !Array.isArray(input.results) || !input.results.length || input.results.length > 40) return json({ error: 'invalid_batch' }, 400);
    const seen = new Set();
    const aliases = [settings.targetName, ...String(settings.aliases || '').split(',')].map(normalize).filter(Boolean);
    const rows = [];
    for (const r of input.results) {
      if (!['ChatGPT', 'Gemini'].includes(r.ai) || !settings.questions.includes(r.question) || !['완료', '실패'].includes(r.status)
        || typeof r.answer !== 'string' || !r.answer.trim() || r.answer.length > 60000
        || !Array.isArray(r.hospitals) || r.hospitals.length > 20 || r.hospitals.some((h: unknown) => typeof h !== 'string' || !h.trim() || h.length > 200)) return json({ error: 'invalid_record' }, 400);
      const key = JSON.stringify([r.ai, r.question]);
      if (seen.has(key)) return json({ error: 'duplicate_record' }, 400);
      seen.add(key);
      let source: URL;
      try { source = new URL(r.source_url); } catch { return json({ error: 'invalid_source' }, 400); }
      if (source.protocol !== 'https:' || source.hostname !== (r.ai === 'ChatGPT' ? 'chatgpt.com' : 'gemini.google.com')) return json({ error: 'invalid_source' }, 400);
      const hospitals = r.status === '완료' ? [...new Set<string>(r.hospitals)] : [];
      if (hospitals.some(h => !normalize(r.answer).includes(normalize(h)))) return json({ error: 'unsupported_hospital' }, 400);
      const own = r.status === '완료' && hospitals.some(h => aliases.some(alias => normalize(h).includes(alias))) && aliases.some(alias => normalize(r.answer).includes(alias));
      if ((existing || []).some(e => e.ai === r.ai && e.question === r.question && e.status === '완료')) continue;
      rows.push({ user_id: OWNER, date, ai: r.ai, question: r.question, answer: r.answer, hospitals, our_mention: own, status: r.status, source_url: source.href, collection_method: '비로그인 웹' });
    }
    if (rows.length) {
      const { error } = await db.from('yeba_radar_records').upsert(rows, { onConflict: 'user_id,date,ai,question' });
      if (error) throw new Error('write_failed');
    }
    return json({ storage_provider: 'worktrack-supabase', date, saved: rows.length, preserved: input.results.length - rows.length });
  } catch (error) {
    console.error('radar storage:', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'storage_unavailable' }, 503);
  }
});
