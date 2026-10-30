// Recommendation flags need evidence in both the answer and the reviewed list.
export const defaultAliases = '서면 예바, 서면예바, 예바치과 서면점, YEBA Orthodontics Clinic, YEBA Othodontics';
const defaults = {targetName:'예바치과교정과치과의원',aliases:defaultAliases};
const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,'');
// Network recommendations include Seomyeon; a named other branch alone does not.
export function isYebaNetworkName(name) {
  const value=normalize(name);
  const clinic='예바(?:치과(?:교정과)?(?:치과)?(?:의원)?)?';
  if (new RegExp('^'+clinic+'(?:치과)?(?:네트워크|network)$','i').test(value)) return true;
  const branches=value.match(new RegExp('^'+clinic+'\\(([^)]+)\\)$'));
  if (!branches) return false;
  const names=branches[1].split(/[\/·,、]/);
  return names.length>1 && names.includes('서면점') && names.every(n=>/^[가-힣]{1,12}(?:점|지점)$/.test(n));
}
export function networkRecommendationNames(text) {
  return [...new Set(String(text||'').split('\n').map(line=>line.replace(/^\s*(?:\d+[.)]\s*|[①-⑳❶-❿]\s*|[-*•]\s*)/,'').replaceAll('**','').trim()).filter(isYebaNetworkName))];
}
// Preserve branch labels that the rendered table places on a separate line.
// Return source substrings, never inferred or invented clinic names.
export function branchQualifiedNames(text) {
  const body=String(text || '').replaceAll('**','');
  const patterns=[
    /예바치과(?:교정과)?(?:치과)?(?:의원)?\s*\((?:부산\s*)?(?:부산진구\s*)?서면(?:역|점)?\)/g,
    /예바치과(?:교정과)?(?:치과)?(?:의원)?\s+[—–]\s+(?:서면\s*\/\s*동래|동래\s*\/\s*서면)권?/g
  ];
  return [...new Set(patterns.flatMap(pattern=>[...body.matchAll(pattern)].map(m=>m[0].replace(/\s+/g,' ').trim())))];
}
export function isExcludedHospital(name) {
  const value=normalize(name);
  if (isYebaNetworkName(name)) return false;
  if (addressQualifiedNames(name).length) return false;
  if (branchQualifiedNames(name).some(h=>normalize(h)===value)) return false;
  if (/동래.*예바|예바.*동래/.test(value)) return true;
  // An explicit branch takes precedence over the abbreviated legal name.
  return /예바치과교정과의원/.test(value) && !/서면/.test(value);
}
export function targetInText(text, settings=defaults) {
  if (normalize(settings.targetName)===normalize(defaults.targetName)&&addressQualifiedNames(text).length) return true;
  if (normalize(settings.targetName)===normalize(defaults.targetName) && networkRecommendationNames(text).length) return true;
  if (normalize(settings.targetName)===normalize(defaults.targetName) && branchQualifiedNames(text).length) return true;
  // Resolve each occurrence independently; a Dongnae mention elsewhere must
  // never erase an explicitly named Seomyeon branch in the same answer.
  const explicit = String(text || '').split(/\n|[.!?]/).some(line =>
    /(?:서면\s*(?:권역\s*[:：]\s*)?예바(?:치과교정과치과의원|치과교정과의원|치과)?|예바(?:치과교정과치과의원|치과교정과의원|치과)?\s*\(?서면(?:점|역)?)/.test(line)
    && !isExcludedHospital(line));
  if (normalize(settings.targetName)===normalize(defaults.targetName) && explicit) return true;
  // Strip only excluded name occurrences, so a separate Seomyeon recommendation survives.
  const body=normalize(String(text || '').replace(/https?:\/\/\S+/gi,''))
    .replace(/동래(?:점)?[·:()\-]*예바(?:치과교정과치과의원|치과교정과의원|치과교정과|치과)?/g,'')
    .replace(/예바(?:치과교정과치과의원|치과교정과의원|치과교정과|치과)?[·:()\-]*동래(?:점)?/g,'')
    .replace(/예바치과교정과의원/g,'');
  const safeAliases=normalize(settings.targetName)===normalize(defaults.targetName)?defaultAliases.split(','):[];
  return [settings.targetName,...safeAliases,...String(settings.aliases || '').split(',')]
    .map(normalize).filter(alias=>alias&&!isExcludedHospital(alias)&&!['예바','yeba','예바치과','예바치과교정과'].includes(alias)).some(alias=>body.includes(alias));
}
export function hasSeomyeonContext(answer) {
  const body=String(answer || '');
  return /(?:부산\s*)?서면\s*지역에서/.test(body.slice(0,300)) && /추천/.test(body.slice(0,300))
    && /(?:^|\n)\s*예바치과교정과의원\s*(?:\n|$)/.test(body)
    && !/동래|온천동|명륜|051[- ]?791/.test(body);
}
export function addressQualifiedNames(answer) {
  const blocks=String(answer||'').split(/\n(?=\s*\d+[.)]\s+)/);
  return blocks.flatMap(block=>{
    const match=block.match(/^\s*\d+[.)]\s*([^\n]+)/);
    if (!match||!/예바/.test(match[1])||/동래/.test(match[1])) return [];
    const body=block.slice(match[0].length,match[0].length+450).split(/\n\s*(?:보기 재설정|지도 펼치기|병원 위치|위치 비교)/)[0];
    if (/동래구|동래로|온천동|명륜|051[- ]?791[- ]?2804/.test(body)) return [];
    const address=body.split('\n').find(line=>/중앙대로\s*736(?:\D|$)/.test(line)&&/서면|부산진구|경암센터|051[- ]?809[- ]?2861/.test(line));
    if (!address) return [];
    const end=block.indexOf(address,match[0].length)+address.length;
    const evidence=block.slice(0,end).trim();
    return evidence.length<=200?[evidence]:[];
  });
}
export function hasSeomyeonAddressEvidence(answer,hospitals) {
  return hospitals.some(name=>/예바|yeba/i.test(name))&&addressQualifiedNames(answer).length>0;
}

export function hasRecommendationEvidence(answer,hospitals,settings=defaults) {
  if (normalize(settings.targetName)===normalize(defaults.targetName)&&hasSeomyeonAddressEvidence(answer,hospitals)) return true;
  const contextual=normalize(settings.targetName)===normalize(defaults.targetName) && hasSeomyeonContext(answer)
    && hospitals.some(name=>normalize(name)==='예바치과교정과의원');
  return contextual || targetInText(answer,settings) && hospitals.some(name=>!isExcludedHospital(name)&&targetInText(name,settings));
}

export function isClassificationReview(record) {
  return record.status === '실패' && /^\[자동 분류 검토 필요:/.test(record.answer || '');
}
export function collectionLabel(record) {
  return isClassificationReview(record) ? '수집 완료 · 분류 검토' : record.status === '완료' ? '수집 완료' : '미수집';
}
