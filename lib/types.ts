export type Subject = 'english' | 'math';
export type View = 'dashboard' | 'study' | 'review' | 'library' | 'goals' | 'settings';
export type ItemKind = 'choice' | 'input' | 'explain' | 'listen' | 'speak';
export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type StudyItem = {
  id:string;
  subject:Subject;
  skillId:string;
  title:string;
  kind:ItemKind;
  prompt:string;
  target?:string;
  options?:string[];
  answer?:string|number;
  keywords?:string[];
  hint?:string;
  explanation:string;
  difficulty:Difficulty;
  estimatedSeconds:number;
  source:{name:string;url:string};
  tags:string[];
};

export type Attempt = {
  id:string;
  itemId:string;
  skillId:string;
  subject:Subject;
  timestamp:string;
  correct:boolean;
  score:number;
  attempts:number;
  confidence:number;
  responseSeconds:number;
  usedHint:boolean;
  errorType?:'concept'|'calculation'|'language'|'production'|'attention';
  transcriptScore?:number;
};

export type SkillState = {
  mastery:number;
  attempts:number;
  correct:number;
  streak:number;
  lastAttemptAt?:string;
  nextReviewAt?:string;
  avgResponseSeconds:number;
  confidence:number;
  recentErrors:string[];
};

export type StudyState = {
  version:1;
  profile:{name:string;focus:Subject;dailyMinutes:number;onboarded:boolean};
  xp:number;
  streak:number;
  bestStreak:number;
  focusSeconds:number;
  lastStudyDate?:string;
  attempts:Attempt[];
  skills:Record<string,SkillState>;
  recentItemIds:string[];
  diagnostic:{complete:boolean;index:number;itemIds:string[]};
};

export type AnswerResult = {
  correct:boolean;
  score:number;
  errorType?:Attempt['errorType'];
  feedback:string;
};
