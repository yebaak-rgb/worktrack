// Recommendation flags need evidence in both the answer and the reviewed list.
export const defaultAliases = '서면 예바, 서면예바, 예바치과 서면점, YEBA Orthodontics Clinic, YEBA Othodontics';
const defaults = {targetName:'예바치과교정과치과의원',aliases:defaultAliases};
const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,'');
const formerClinic = /^(?:(?:부산)?서면(?:점|역)?[·:-]?)?예쁜미소바른이치과(?:의원)?(?:\(?서면(?:점|역|본점)?\)?)?$/;
const otherBranch = /동래|해운대|센텀|덕천|온천동|명륜|동래로\s*25|센텀남대로\s*50/;
const seomyeonLocation = /서면(?:역|점|에서|에\s*위치|에\s*있는|권|\s*(?:일대|인근|지역|근처)|$)|중앙대로\s*736(?:\D|$)|051[-.\s]*809[-.\s]*2861/;
const regionCell = /^(?:부산(?:광역시)?\s*)?(?:부산진구\s*)?서면(?:역|권|권역|지역)?(?:\s*(?:인근|일대|근처))?$/;
const listMarker = /^(?:#{1,6}\s+|(?:\d+[.)]|[①-⑳❶-❿]|[-*•])\s*)/;
const sourceHeading = /^(?:참고\s*(?:자료|링크|문헌)|(?:관련\s*)?출처|관련\s*링크|sources?)\s*[:：]?\s*$/i;
const notRecommended = /비추천|추천(?:하지|에서\s*제외)|추천\s*대상(?:이|에서)\s*(?:아|제외)|가상\s*(?:사례|예시)|추천\s*제외/;

// The former name was shared across branches. Keep the original clinic cell and
// match location to its own recommendation, never to a neighbouring clinic.
export function formerSeomyeonNames(answer) {
  const text = String(answer || '');
  if (!normalize(text).includes('예쁜미소바른이치과')) return [];
  const lines = text.replaceAll('**', '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const localList = !otherBranch.test(text) && lines.some(line =>
    /서면\s*(?:일대|지역|권역)/.test(line) && /치과/.test(line) && /추천|대표/.test(line) && !/[?？]|해\s*줘/.test(line));
  const names = new Set();
  let inSources = false;
  for (const [i, line] of lines.entries()) {
    const entry = line.replace(listMarker, '').trim();
    if (sourceHeading.test(entry)) { inSources = true; continue; }
    if (/추천\s*(?:목록|리스트)|(?:주요|추천)\s*치과\s*(?:비교|및 특징)/.test(entry)) inSources = false;
    if (inSources) continue;
    const cells = entry.split(/\t|\|/).map(cell => cell.trim()).filter(Boolean);
    const nameIndex = cells.findIndex(cell => formerClinic.test(normalize(cell)));
    if (nameIndex !== 0 && !(nameIndex === 1 && regionCell.test(cells[0]))) continue;
    const name = cells[nameIndex];
    const next = lines[i + 1] || '';
    const detail = /^(?:추천\s*이유|위치|주소|소재지|특징)\s*[:：]/.test(next) ? next : '';
    const context = [entry, detail].join(' ');
    if (otherBranch.test(context) || notRecommended.test(context) || (!listMarker.test(next) && notRecommended.test(next))) continue;
    if (cells.length === 1 && !listMarker.test(line) && !detail) continue;
    if (localList || normalize(name).includes('서면') || cells.some(cell => seomyeonLocation.test(cell)) || seomyeonLocation.test(detail)) {
      names.add(name);
    }
  }
  return [...names];
}

export function isFormerSeomyeonRecommendation(name, answer, settings=defaults) {
  if (normalize(settings.targetName) !== normalize(defaults.targetName) || !formerClinic.test(normalize(name))) return false;
  return formerSeomyeonNames(answer).some(label =>
    normalize(label) === normalize(name) || /^예쁜미소바른이치과(?:의원)?$/.test(normalize(name)));
}

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
  return [...new Set(String(text||'').split('\n').map(line=>line.split('\t')[0].replace(/^\s*(?:\d+[.)]\s*|[①-⑳❶-❿]\s*|[-*•]\s*)/,'').replaceAll('**','').trim()).filter(isYebaNetworkName))];
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
export function hasSeomyeonTableEntry(text) {
  return String(text || '').split('\n').some(line => {
    const [clinic, location] = line.replaceAll('**', '').split('\t').map(cell => cell.trim());
    return /^예바치과의원$/.test(clinic) &&
      /^(?:부산(?:진구)?\s+)?서면(?:역|점)?(?:\s+인근)?$/.test(location || '');
  });
}
export function targetInText(text, settings=defaults) {
  if (normalize(settings.targetName)===normalize(defaults.targetName) && hasSeomyeonTableEntry(text)) return true;
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
    .map(normalize).filter(alias=>alias&&!isExcludedHospital(alias)&&!['예바','yeba','예바치과','예바치과교정과'].includes(alias))
    .filter(alias => normalize(settings.targetName) !== normalize(defaults.targetName) || !alias.includes('예쁜미소바른이치과'))
    .some(alias=>body.includes(alias));
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
  if (hospitals.some(name => isFormerSeomyeonRecommendation(name, answer, settings))) return true;
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
