import type { AnswerResult, Attempt, Difficulty, SkillState, StudyItem, StudyState, Subject } from './types';
import { getItemsForSubject } from './content';

const clamp=(n:number,min=0,max=1)=>Math.max(min,Math.min(max,n));
const dayKey=(date=new Date())=>date.toISOString().slice(0,10);

export function emptyState():StudyState{
  return {
    version:1,
    profile:{name:'Você',focus:'english',dailyMinutes:30,onboarded:false},
    xp:0,streak:0,bestStreak:0,focusSeconds:0,lastStudyDate:undefined,
    attempts:[],skills:{},recentItemIds:[],
    diagnostic:{complete:false,index:0,itemIds:[]}
  };
}

export function ensureState(raw?:Partial<StudyState>|null):StudyState{
  const base=emptyState();
  if(!raw)return base;
  return {
    ...base,...raw,
    profile:{...base.profile,...raw.profile},
    attempts:raw.attempts??[],
    skills:raw.skills??{},
    recentItemIds:raw.recentItemIds??[],
    diagnostic:{...base.diagnostic,...raw.diagnostic}
  };
}

export function getSkill(state:StudyState,skillId:string):SkillState{
  return state.skills[skillId]??{mastery:0.18,attempts:0,correct:0,streak:0,avgResponseSeconds:0,confidence:.5,recentErrors:[]};
}

export function masteryLabel(value:number){
  if(value<.3)return 'Inicial';
  if(value<.5)return 'Emergente';
  if(value<.7)return 'Funcional';
  if(value<.85)return 'Forte';
  return 'Estável';
}

export function difficultyForMastery(mastery:number):Difficulty{
  if(mastery<.25)return 1;
  if(mastery<.45)return 2;
  if(mastery<.65)return 3;
  if(mastery<.82)return 4;
  return 5;
}

export function selectNextItem(state:StudyState,subject:Subject){
  const items=getItemsForSubject(subject);
  const now=Date.now();
  const scored=items.map(item=>{
    const skill=getSkill(state,item.skillId);
    const due=!skill.nextReviewAt || new Date(skill.nextReviewAt).getTime()<=now;
    const target=difficultyForMastery(skill.mastery);
    const difficultyFit=1-Math.min(1,Math.abs(item.difficulty-target)/4);
    const weakness=1-skill.mastery;
    const dueBoost=due?1.2:0;
    const recentPenalty=state.recentItemIds.includes(item.id)?.65:0;
    const repetitionPenalty=skill.streak>=3?0.1:0;
    const score=weakness*.62+difficultyFit*.22+dueBoost*.14-recentPenalty-repetitionPenalty;
    return {item,score};
  }).sort((a,b)=>b.score-a.score);
  return scored[0]?.item??items[0];
}

export function normalizeAnswer(value:string){
  return value.trim().toLowerCase().replace(/,/g,'.').replace(/^(r\$\s*)/,'').replace(/\s+/g,' ');
}

function tokenSimilarity(target:string,heard:string){
  const a=normalizeAnswer(target).split(' ').filter(Boolean);
  const b=normalizeAnswer(heard).split(' ').filter(Boolean);
  if(!a.length||!b.length)return 0;
  const dp=Array.from({length:a.length+1},()=>Array<number>(b.length+1).fill(0));
  for(let i=0;i<=a.length;i++)dp[i][0]=i;
  for(let j=0;j<=b.length;j++)dp[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
    const cost=a[i-1]===b[j-1]?0:1;
    dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+cost);
  }
  return 1-dp[a.length][b.length]/Math.max(a.length,b.length);
}

export function evaluateItem(item:StudyItem,answer:{choice?:number;value?:string;speech?:string},usedHint=false):AnswerResult{
  if(item.kind==='choice'){
    const correct=answer.choice===item.answer;
    return {correct,score:correct?1:0,errorType:correct?undefined:'concept',feedback:correct?'Boa. Agora o motor pode variar o contexto para testar transferência.':'O erro não é fracasso: ele mostra qual parte precisa ser retomada.'};
  }
  if(item.kind==='listen'){
    return {correct:true,score:.75,feedback:'Escuta praticada. O próximo passo deve verificar se você consegue recuperar o sentido sem apoio.'};
  }
  if(item.kind==='speak'){
    const sim=tokenSimilarity(item.target??'',answer.speech??'');
    const correct=sim>=.82;
    return {correct,score:sim,errorType:correct?undefined:'production',transcriptScore:sim,feedback:correct?'A transcrição ficou próxima do alvo. Isso é evidência inicial de produção, não uma certificação fonêmica.':'A transcrição ficou distante. Repita em blocos curtos e depois tente a frase inteira.'};
  }
  if(item.kind==='input'){
    const got=normalizeAnswer(answer.value??'');
    const expected=normalizeAnswer(String(item.answer??''));
    const numeric=Number(got), expectedNumeric=Number(expected);
    const correct=Number.isFinite(numeric)&&Number.isFinite(expectedNumeric)?Math.abs(numeric-expectedNumeric)<1e-9:got===expected;
    return {correct,score:correct?1:0,errorType:correct?undefined:'calculation',feedback:correct?'Cálculo correto. Tente agora reconhecer o mesmo princípio em outro formato.':'Confira a representação, a operação e a unidade antes de tentar de novo.'};
  }
  const text=normalizeAnswer(answer.value??'');
  const hits=(item.keywords??[]).filter(k=>text.includes(normalizeAnswer(k))).length;
  const required=Math.max(2,Math.ceil((item.keywords??[]).length*.45));
  const score=(item.keywords?.length??0)>0?hits/(item.keywords?.length??1):text.length>35?1:0;
  const correct=hits>=required && text.length>=25;
  return {correct,score,errorType:correct?undefined:'concept',feedback:correct?'Explicação suficiente para esta etapa. O conceito será testado novamente mais tarde.':'Sua explicação ainda está curta ou não cobre a relação central. Tente usar causa, operação e consequência.'};
}

export function reviewIntervalDays(mastery:number,correct:boolean){
  if(!correct)return mastery<.5?0.04:0.25;
  if(mastery<.3)return 0.5;
  if(mastery<.5)return 1;
  if(mastery<.7)return 3;
  if(mastery<.85)return 7;
  return 14;
}

function updateSkill(previous:SkillState,result:AnswerResult,confidence:number,responseSeconds:number,usedHint:boolean):SkillState{
  const speedTarget=75;
  const speedScore=clamp(1-Math.max(0,responseSeconds-speedTarget)/(speedTarget*1.4));
  const attemptQuality=usedHint?.72:1;
  const evidence=clamp(result.score*.62+confidence*.15+speedScore*.08+attemptQuality*.15);
  const luckyPenalty=!result.correct&&result.score<.2?.03:0;
  const next=clamp(previous.mastery*.72+evidence*.28-luckyPenalty);
  const streak=result.correct?previous.streak+1:0;
  const interval=reviewIntervalDays(next,result.correct);
  return {
    mastery:next,attempts:previous.attempts+1,correct:previous.correct+(result.correct?1:0),
    streak,lastAttemptAt:new Date().toISOString(),
    nextReviewAt:new Date(Date.now()+interval*86400000).toISOString(),
    avgResponseSeconds:previous.attempts===0?responseSeconds:(previous.avgResponseSeconds*.7+responseSeconds*.3),
    confidence:previous.confidence*.7+confidence*.3,
    recentErrors:result.errorType?[result.errorType,...previous.recentErrors].slice(0,4):previous.recentErrors
  };
}

export function applyAttempt(state:StudyState,item:StudyItem,result:AnswerResult,meta:{confidence:number;responseSeconds:number;attempts:number;usedHint:boolean}):StudyState{
  const skill=updateSkill(getSkill(state,item.skillId),result,meta.confidence,meta.responseSeconds,meta.usedHint);
  const attempt:Attempt={
    id:crypto.randomUUID(),itemId:item.id,skillId:item.skillId,subject:item.subject,timestamp:new Date().toISOString(),
    correct:result.correct,score:result.score,attempts:meta.attempts,confidence:meta.confidence,
    responseSeconds:meta.responseSeconds,usedHint:meta.usedHint,errorType:result.errorType,transcriptScore:result.transcriptScore
  };
  const today=dayKey();
  const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  let streak=state.streak;
  if(state.lastStudyDate!==today)streak=state.lastStudyDate===yesterday?state.streak+1:1;
  return {
    ...state, xp:state.xp+Math.round(25+result.score*55+(result.correct?15:0)),
    streak,bestStreak:Math.max(state.bestStreak,streak),
    focusSeconds:state.focusSeconds+Math.max(item.estimatedSeconds,meta.responseSeconds),
    lastStudyDate:today,
    attempts:[attempt,...state.attempts].slice(0,500),
    skills:{...state.skills,[item.skillId]:skill},
    recentItemIds:[item.id,...state.recentItemIds.filter(x=>x!==item.id)].slice(0,6)
  };
}

export function overallMastery(state:StudyState,subject?:Subject){
  const skills=subject?getItemsForSubject(subject).map(x=>x.skillId):Object.keys(state.skills);
  const ids=[...new Set(skills)];
  if(!ids.length)return .18;
  return ids.reduce((sum,id)=>sum+getSkill(state,id).mastery,0)/ids.length;
}

export function dueCount(state:StudyState,subject:Subject){
  const now=Date.now();
  const ids=[...new Set(getItemsForSubject(subject).map(x=>x.skillId))];
  return ids.filter(id=>{
    const s=getSkill(state,id);
    return !s.nextReviewAt||new Date(s.nextReviewAt).getTime()<=now;
  }).length;
}

export function dailyMinutes(state:StudyState){
  const today=dayKey();
  return Math.round(state.attempts.filter(a=>a.timestamp.slice(0,10)===today).reduce((s,a)=>s+a.responseSeconds,0)/60);
}

export function diagnosticItems(subject:Subject){
  return getItemsForSubject(subject).slice(0,6);
}
