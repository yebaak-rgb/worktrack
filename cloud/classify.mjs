// Conservative name extraction from standalone clinic headings/list items.
// Full source text remains unchanged for later review in the dashboard.
export function classify(answer, settings) {
  const hospitals = [];
  for (const raw of answer.split('\n')) {
    let line = raw.replace(/^\s*(?:\d+[.)]\s*|[-*•]\s*)/, '').replaceAll('**', '').trim();
    line = line.split(/\s+[—–]\s+/)[0].replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (line.length > 70 || !/^[가-힣A-Za-z0-9·&\s]+$/.test(line)) continue;
    if (!/(?:치과(?:\s*교정과)?(?:\s*치과)?(?:의원|병원)?)$/.test(line)) continue;
    if (/^(?:치과|교정치과|치과교정과|일반 치과|추천 치과|치과 병원)$/.test(line)) continue;
    if (!hospitals.includes(line)) hospitals.push(line);
  }
  const normalize = text => String(text).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  const aliases = [settings.targetName, ...String(settings.aliases || '').split(',')].map(normalize).filter(Boolean);
  const own = hospitals.some(name => aliases.some(alias => normalize(name).includes(alias)));
  return { hospitals: hospitals.slice(0, 20), our_mention: own && aliases.some(alias => normalize(answer).includes(alias)), needsReview: hospitals.length === 0 || hospitals.length > 20 };
}
