// Conservative name extraction from standalone clinic headings/list items.
// Full source text remains unchanged for later review in the dashboard.
import {hasRecommendationEvidence, targetInText} from '../radar-classification.js?v=20261023-classification';
export function classify(answer, settings) {
  const hospitals = [];
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
    if (/^(?:치과|교정치과|치과교정과|일반 치과|추천 치과|치과 병원|오늘의 치과)$/.test(line)) continue;
    const name=regionalHeading||line;
    if (!hospitals.includes(name)) hospitals.push(name);
  }
  const own=hasRecommendationEvidence(answer,hospitals,settings);
  return { hospitals: hospitals.slice(0, 20), our_mention: own, needsReview: hospitals.length === 0 || hospitals.length > 20 || (targetInText(answer,settings)&&!own) };
}
