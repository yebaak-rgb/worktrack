// Recommendation flags need evidence in both the answer and the reviewed list.
const defaults = {targetName:'예바치과교정과치과의원',aliases:'예바, YEBA, 예바치과'};
const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,'');
export function targetInText(text, settings=defaults) {
  const body=normalize(String(text || '').replace(/https?:\/\/\S+/gi,''));
  return [settings.targetName,...String(settings.aliases || '').split(',')]
    .map(normalize).filter(Boolean).some(alias=>body.includes(alias));
}
export function hasRecommendationEvidence(answer,hospitals,settings=defaults) {
  return targetInText(answer,settings) && hospitals.some(name=>targetInText(name,settings));
}
