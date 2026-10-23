// Recommendation flags need evidence in both the answer and the reviewed list.
export const defaultAliases = '서면 예바, 서면예바, 예바치과 서면점, YEBA Orthodontics Clinic, YEBA Othodontics';
const defaults = {targetName:'예바치과교정과치과의원',aliases:defaultAliases};
const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,'');
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
  if (branchQualifiedNames(name).some(h=>normalize(h)===value)) return false;
  if (/동래.*예바|예바.*동래/.test(value)) return true;
  // An explicit branch takes precedence over the abbreviated legal name.
  return /예바치과교정과의원/.test(value) && !/서면/.test(value);
}
export function targetInText(text, settings=defaults) {
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
export function hasRecommendationEvidence(answer,hospitals,settings=defaults) {
  return targetInText(answer,settings) && hospitals.some(name=>!isExcludedHospital(name)&&targetInText(name,settings));
}

export function isClassificationReview(record) {
  return record.status === '실패' && /^\[자동 분류 검토 필요:/.test(record.answer || '');
}
export function collectionLabel(record) {
  return isClassificationReview(record) ? '수집 완료 · 분류 검토' : record.status === '완료' ? '수집 완료' : '미수집';
}
