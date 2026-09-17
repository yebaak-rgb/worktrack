import {targetInText, hasRecommendationEvidence} from './radar-classification.js?v=20260915-classification';

export const AIS = ['ChatGPT', 'Gemini', 'Perplexity'];
export const percent = (n, d) => d ? n / d * 100 : null;
export const koreaDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul'}).format(date);
export function shiftMonth(month, offset) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7);
}
export function canonicalHospital(name, settings) {
  const value = String(name || '').normalize('NFKC').trim();
  if (!value) return '';
  if (targetInText(value, settings)) return '예바치과';
  // Only typographic/formal suffix variants are merged. Branch words stay intact.
  return value.replace(/\s+/g, '').replace(/치과교정과치과의원/g, '치과')
    .replace(/치과교정과의원/g, '치과').replace(/치과의원/g, '치과');
}
export function uniqueRecords(records, today = koreaDate()) {
  const map = new Map();
  for (const r of records) {
    if (!r || r.demo || String(r.id || '').startsWith('seed-') || !AIS.includes(r.ai) || !['완료','실패'].includes(r.status)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(Date.parse(r.date)) || new Date(r.date).toISOString().slice(0,10) !== r.date || r.date > today) continue;
    const key = JSON.stringify([r.date, r.ai, r.question]);
    const prior = map.get(key);
    if (!prior || String(r.savedAt || '') >= String(prior.savedAt || '')) map.set(key, r);
  }
  return [...map.values()];
}
export function isOurRecommendation(r, settings) {
  return r.status === '완료' && r.ourMention === true && hasRecommendationEvidence(r.answer, r.hospitals || [], settings);
}
export function hospitalNames(r, settings) {
  return [...new Set((r.hospitals || []).map(h => canonicalHospital(h, settings)).filter(Boolean))]
    .filter(name => name !== '예바치과' || isOurRecommendation(r, settings));
}
function ranking(rows, settings) {
  const map = new Map();
  for (const r of rows) for (const name of hospitalNames(r, settings)) {
    if (!map.has(name)) map.set(name, {name, count:0, records:[], aliases:new Set(), byAI:Object.fromEntries(AIS.map(ai => [ai,0]))});
    const item = map.get(name); item.count++; item.records.push(r); item.byAI[r.ai]++;
    (r.hospitals || []).filter(h => canonicalHospital(h, settings) === name).forEach(h => item.aliases.add(h));
  }
  const result = [...map.values()].sort((a,b) => b.count - a.count || a.name.localeCompare(b.name,'ko'));
  result.forEach((item,i) => {
    item.rank = i && item.count === result[i-1].count ? result[i-1].rank : i+1;
    item.rate = percent(item.count, rows.length); item.aliases = [...item.aliases].sort();
  });
  return result;
}
export function buildMonth(records, settings, {month = koreaDate().slice(0,7), ai = 'all', method = 'web', today = koreaDate()} = {}) {
  const scoped = uniqueRecords(records, today).filter(r => (ai === 'all' || r.ai === ai) &&
    (method === 'all' || (method === 'api' ? r.collectionMethod === 'API' : ['비로그인 웹','수동 입력 · 비로그인 웹'].includes(r.collectionMethod))));
  const rows = scoped.filter(r => r.date.startsWith(month));
  const complete = rows.filter(r => r.status === '완료');
  const failed = rows.filter(r => r.status === '실패');
  const previous = scoped.filter(r => r.date.startsWith(shiftMonth(month,-1)) && r.status === '완료');
  const own = complete.filter(r => isOurRecommendation(r,settings));
  const prevOwn = previous.filter(r => isOurRecommendation(r,settings));
  const ranks = ranking(complete, settings), prevRanks = ranking(previous, settings);
  for (const rank of ranks) {
    const prev = prevRanks.find(p => p.name === rank.name);
    rank.previousRank = prev?.rank ?? null;
    rank.rankChange = previous.length ? (prev ? prev.rank-rank.rank : 'new') : null;
    rank.rateChange = previous.length ? rank.rate - (prev?.rate || 0) : null;
  }
  const provider = AIS.map(name => {
    const answers = complete.filter(r => r.ai === name), failures = failed.filter(r => r.ai === name);
    const mentions = answers.filter(r => isOurRecommendation(r,settings));
    return {name, answers, failures, mentions, rate:percent(mentions.length,answers.length)};
  });
  const questions = [...new Set([...settings.questions, ...rows.map(r => r.question)])].map(question => {
    const answers = complete.filter(r => r.question === question);
    return {question, answers, mentions:answers.filter(r => isOurRecommendation(r,settings)),
      rate:percent(answers.filter(r => isOurRecommendation(r,settings)).length,answers.length)};
  });
  const daysInMonth = new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate();
  const days = Array.from({length:daysInMonth}, (_,i) => {
    const date = month+'-'+String(i+1).padStart(2,'0'), answers = complete.filter(r => r.date === date);
    return {date, total:answers.length, count:answers.filter(r => isOurRecommendation(r,settings)).length,
      rate:percent(answers.filter(r => isOurRecommendation(r,settings)).length,answers.length)};
  });
  const rate = percent(own.length, complete.length), previousRate = percent(prevOwn.length,previous.length);
  return {month, today, ai, method, rows, complete, failed, previous, own, ranks, provider, questions, days,
    rate, previousRate, delta:rate !== null && previousRate !== null ? rate-previousRate : null,
    rank:ranks.find(r => r.name === '예바치과'), observedDays:new Set(complete.map(r => r.date)).size,
    aliases:ranks.filter(r => r.aliases.length > 1),
    inconsistencies:complete.filter(r => Boolean(r.ourMention) !== isOurRecommendation(r,settings) ||
      (!r.ourMention && (r.hospitals || []).some(h => canonicalHospital(h,settings) === '예바치과')))};
}
export function buildInsights(model, settings) {
  const m = model, items = [];
  if (m.failed.length) items.push({priority:'우선 점검',type:'collection',title:'미수집 구간부터 확인하세요',
    fact:`저장된 조사 ${m.rows.length}건 중 ${m.failed.length}건이 미수집입니다. 실패 응답은 추천률에서 제외했습니다.`,
    steps:['미수집 사유에서 로그인 요구·접근 제한 여부를 확인하세요.','수집 가능한 비로그인 서비스는 같은 질문으로 다시 확인하고 원문을 입력하세요. 로그인이나 CAPTCHA는 우회하지 마세요.'],
    owner:'조사 담당',check:'다음 조사에서 AI별 수집 건수와 미수집 사유를 비교',records:m.failed});
  if (m.inconsistencies.length) items.push({priority:'우선 점검',type:'quality',title:'추천 분류와 원문을 대조하세요',
    fact:`추천 표시·치과 목록·답변 원문이 일치하지 않는 기록 ${m.inconsistencies.length}건이 있습니다. 근거가 불일치한 예바 추천은 집계에서 제외했습니다.`,
    steps:['근거 응답을 열어 실제 추천 목록인지 확인하세요.','필요하면 원문 직접 입력에서 같은 날짜·AI·질문으로 분류를 갱신하세요. 원문 자체를 바꾸지 마세요.'],owner:'조사 담당',check:'불일치 기록 0건',records:m.inconsistencies});
  if (!m.complete.length) return [...items,{priority:'자료 필요',type:'sample',title:'분석 가능한 응답을 먼저 모아주세요',fact:'선택한 조건에 수집된 실제 답변이 없습니다. 순위나 개선 효과를 판단할 수 없습니다.',steps:['월·AI·수집 방식 필터를 확인하세요.','빈 새 대화에서 정해진 질문만 보내고 실제 원문과 출처를 저장하세요.'],owner:'조사 담당',check:'동일 조건으로 AI별·질문별 응답 확보',records:[]}];
  const weak = m.questions.filter(q => q.answers.length && q.mentions.length < q.answers.length).sort((a,b) => a.rate-b.rate || b.answers.length-a.answers.length)[0];
  if (weak) items.push({priority:'개선 후보',type:'content',title:'추천이 빠진 질문의 정보부터 보완하세요',
    fact:`“${weak.question}”에서 예바 추천은 ${weak.mentions.length}/${weak.answers.length}건 (${weak.rate.toFixed(1)}%)입니다.`,
    steps:['예바가 빠진 답변에서 경쟁 치과의 추천 이유와 출처를 비교하세요.','해당 질문에 답하는 홈페이지 안내를 점검하세요: 위치·상담 과정·진료 범위·의료진 소개 중 실제로 제공하는 정보를 구체화하세요.'],
    owner:'경영지원 · 홈페이지 담당',check:'같은 질문·AI의 추천률을 다음 달 같은 조건으로 비교',records:weak.answers.filter(r => !isOurRecommendation(r,settings))});
  const themes = [
    {label:'의료진·전문성',rx:/전문의|의료진|전문성|경력/,step:'의료진 소개에 확인 가능한 자격·담당 진료·경력을 정확히 기재하고, 외부 프로필과 일치하는지 점검하세요.'},
    {label:'상담·진단 과정',rx:/정밀|진단|상담|검사/,step:'첫 상담 준비사항, 진단 단계와 설명 절차를 질문·답변 형식으로 안내하세요. 실제 운영과 일치하는 정보만 사용하세요.'},
    {label:'위치·접근성',rx:/접근성|주차|서면역|위치|교통/,step:'홈페이지와 지도 서비스의 병원명·주소·연락처·진료시간을 대조하고, 실제 길찾기·주차 안내를 보완하세요.'},
    {label:'비용·사후 관리',rx:/비용|유지장치|사후|분납/,step:'상담 시 확인할 비용 항목과 유지·사후 관리 절차를 정확하게 안내하세요. 효과 보장이나 과장 표현은 넣지 마세요.'}
  ].map(t => ({...t, records:m.complete.filter(r => t.rx.test(r.answer || ''))})).sort((a,b) => b.records.length-a.records.length);
  const theme = themes.find(t => t.records.length);
  if (theme) items.push({priority:'콘텐츠 점검',type:'theme',title:`답변에서 반복된 “${theme.label}” 정보를 확인하세요`,
    fact:`선택 월 답변 ${m.complete.length}건 중 ${theme.records.length}건에 관련 단어가 있습니다. 답변 전체의 키워드 빈도이며, 예바에 대한 평가나 추천 원인 분석은 아닙니다.`,
    steps:[theme.step,'실제 누락 여부는 담당자가 원문 출처와 현재 홈페이지를 대조해 판단하세요. 현재 사이트가 부족하다고 단정하지 않습니다.'],
    owner:'경영지원 · 콘텐츠 담당',check:'정보 수정 후 동일한 조사 조건으로 최소 2개 월 관찰',records:theme.records});
  const missingSources = m.complete.filter(r => !/^https?:\/\//.test(r.sourceUrl || ''));
  if (missingSources.length) items.push({priority:'근거 보완',type:'sources',title:'출처가 없는 응답을 보완하세요',fact:`실제 응답 ${missingSources.length}건에 출처 URL이 없습니다.`,steps:['원래 조사한 답변 페이지에서 출처를 확인하세요.','확인 가능한 URL만 같은 기록에 추가하세요. 추정 URL은 넣지 마세요.'],owner:'조사 담당',check:'출처 누락 0건',records:missingSources});
  items.push({priority:'해석 주의',type:'sample',title:'높은 추천률도 표본과 함께 판단하세요',
    fact:`이번 분석은 ${m.observedDays}일 · 실제 응답 ${m.complete.length}건입니다. AI별·질문별 표본 수가 다르면 전체 추천률도 달라질 수 있습니다.`,
    steps:['질문·비로그인 조건·수집 방식을 유지하고 AI별 표본 수를 맞추세요.','개선 전후는 같은 AI와 질문으로 비교하세요. 추천률 변화만으로 콘텐츠 수정의 효과를 단정하지 마세요.'],owner:'경영지원',check:'전월과 당월의 표본 수·조사 조건을 함께 검토',records:[]});
  return items;
}
