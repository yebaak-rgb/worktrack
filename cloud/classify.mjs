// Conservative name extraction from standalone clinic headings/list items.
// Full source text remains unchanged for later review in the dashboard.
import {hasRecommendationEvidence, targetInText, branchQualifiedNames} from '../radar-classification.js?v=20261023-october-audit';
export function classify(answer, settings) {
  const hospitals = [];
  const qualified=branchQualifiedNames(answer);
  for (const raw of answer.split('\n')) {
    // Tables expose cells separated by tabs; the first cell is the clinic.
    let line = raw.split('\t')[0].replace(/^\s*(?:\d+[.)]\s*|[-*•]\s*)/, '').replaceAll('**', '').trim();
    const parts=line.split(/\s+[—–]\s+|\s*[:：]\s*/);
    const regionFirst=parts.length>1&&!/치과|orthodont|othodont|dental/i.test(parts[0])&&/치과|orthodont|othodont|dental/i.test(parts[1]);
    const regionalHeading=regionFirst&&/동래/.test(parts[0])?line:null;
    line = (regionFirst?parts[1]:parts[0]).replace(/\s+\|\s+.*$/,'').replace(/\s*\(([^)]*)\)\s*$/, (match, label) => /동래/.test(label) ? match : '').trim();
    // Map cards can append translated names after the Korean clinic/branch.
    if (/^[가-힣]/.test(line) && line.includes('치과')) line = line.replace(/(치과[^A-Za-z]*?)\s+[A-Za-z].*$/, '$1').trim();
    if (line.length > 70 || !/^[가-힣A-Za-z0-9·&()\s]+$/.test(line)) continue;
    const candidate=line.replace(/\s*\([^)]*\)\s*$/,'').trim();
    const englishClinic=/^[A-Za-z][A-Za-z0-9 &·-]*(?:Orthodontics?(?: Dental)?(?: Clinic)?|Othodontics?(?: Clinic)?|Dental Clinic)$/i.test(line);
    if (!englishClinic&&!/(?:치과(?:\s*교정과)?(?:\s*치과)?(?:의원|병원)?)(?:\s+(?:[가-힣0-9]{1,12}(?:점|지점)|부산서면|서면|센텀|해운대|동래|덕천|구서|부산))?$/.test(candidate)) continue;
    if (/^(?:치과|교정치과|치과교정과|일반 치과|추천 치과|치과 병원|오늘의 치과)$/.test(line) || /(?:중심|가능한|갖춰진|만한)\s+(?:교정)?치과$/.test(line)) continue;
    // Descriptive prefixes and multi-clinic comparison cells are not names.
    line=line.replace(/^.*(?:위치한|싶다면|편하다면)\s+/, '');
    if (/\s·\s/.test(line)) continue;
    const name=regionalHeading||line;
    if (!hospitals.includes(name)) hospitals.push(name);
  }
  for (const name of qualified) {
    // A full legal name already identifies the target; keep existing deduplication.
    if (/^예바치과교정과치과의원/.test(name) && hospitals.includes('예바치과교정과치과의원')) continue;
    if (!hospitals.includes(name)) hospitals.push(name);
  }
  const own=hasRecommendationEvidence(answer,hospitals,settings);
  // A Seomyeon question/intro alone cannot identify an abbreviated map-card name.
  const ambiguousBranch=!own && hospitals.includes('예바치과교정과의원') && /서면/.test(answer) && !/동래|온천동|명륜|051[- ]?791/.test(answer);
  return { hospitals: hospitals.slice(0, 20), our_mention: own, needsReview: hospitals.length === 0 || hospitals.length > 20 || ambiguousBranch || (targetInText(answer,settings)&&!own) };
}
