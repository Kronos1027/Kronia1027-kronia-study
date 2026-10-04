'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3, BookOpen, Brain, Calculator, Check, ChevronRight, Clock3,
  Flame, Info, LibraryBig, Mic, Play, RotateCcw, Settings, ShieldCheck,
  Sparkles, Target, Volume2, Zap
} from 'lucide-react';
import { SUBJECT_INFO, getItem, getItemsForSubject } from '../lib/content';
import {
  applyAttempt, dueCount, emptyState, ensureState, evaluateItem,
  getSkill, masteryLabel, overallMastery, selectNextItem
} from '../lib/engine';
import type { StudyItem, StudyState, Subject, View } from '../lib/types';

const STORE = 'kronia-study-engine';
const dayKey = () => new Date().toISOString().slice(0, 10);

type SpeechRecognitionLike = {
  lang:string;
  interimResults:boolean;
  maxAlternatives:number;
  onresult:(event:any)=>void;
  onerror:()=>void;
  start:()=>void;
};

export default function Home(){
  const [state,setState] = useState<StudyState>(emptyState());
  const [loaded,setLoaded] = useState(false);
  const [view,setView] = useState<View>('dashboard');
  const [subject,setSubject] = useState<Subject>('english');
  const [currentId,setCurrentId] = useState('');
  const [choice,setChoice] = useState<number|null>(null);
  const [answer,setAnswer] = useState('');
  const [transcript,setTranscript] = useState('');
  const [feedback,setFeedback] = useState('');
  const [explanation,setExplanation] = useState('');
  const [confidence,setConfidence] = useState(3);
  const [usedHint,setUsedHint] = useState(false);
  const [listening,setListening] = useState(false);
  const [startedAt,setStartedAt] = useState(Date.now());
  const recognitionRef = useRef<SpeechRecognitionLike|null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if(raw){
        const saved = ensureState(JSON.parse(raw));
        setState(saved);
        setSubject(saved.profile.focus);
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if(loaded){
      try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
    }
  }, [state,loaded]);

  const items = useMemo(() => getItemsForSubject(subject), [subject]);
  const current = useMemo<StudyItem>(() => {
    return getItem(currentId) ?? selectNextItem(state,subject) ?? items[0];
  }, [currentId,state,subject,items]);

  const mastery = overallMastery(state,subject);
  const due = dueCount(state,subject);
  const todayAttempts = state.attempts.filter(a => a.timestamp.slice(0,10) === dayKey());
  const minutesToday = Math.round(todayAttempts.reduce((n,a) => n + a.responseSeconds,0) / 60);
  const practicedSkills = new Set(state.attempts.map(a => a.skillId)).size;
  const hasEvidence = state.attempts.length > 0;

  const begin = (item?:StudyItem) => {
    const nextItem = item ?? selectNextItem(state,subject) ?? items[0];
    if(!nextItem) return;
    setCurrentId(nextItem.id);
    setChoice(null);
    setAnswer('');
    setTranscript('');
    setFeedback('');
    setExplanation('');
    setConfidence(3);
    setUsedHint(false);
    setStartedAt(Date.now());
    setView('study');
  };

  const submit = () => {
    if(!current) return;
    const result = evaluateItem(current,{
      choice:choice ?? undefined,
      value:answer,
      speech:transcript
    },usedHint);
    const updated = applyAttempt(state,current,result,{
      confidence:confidence / 5,
      responseSeconds:Math.max(2,Math.round((Date.now()-startedAt)/1000)),
      attempts:1,
      usedHint
    });
    setState(updated);
    setFeedback((result.correct ? '✓ ' : '') + result.feedback);
    setExplanation(result.correct ? current.explanation : '');
  };

  const speak = () => {
    const spoken = current?.target ?? current?.prompt ?? '';
    if(!('speechSynthesis' in window)){
      setFeedback('Este navegador não oferece leitura de voz.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.onstart = () => setListening(true);
    utterance.onend = () => setListening(false);
    utterance.onerror = () => setListening(false);
    window.speechSynthesis.speak(utterance);
  };

  const recognize = () => {
    const browser = window as Window & {
      SpeechRecognition?:new()=>SpeechRecognitionLike;
      webkitSpeechRecognition?:new()=>SpeechRecognitionLike;
    };
    const SR = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if(!SR){
      setFeedback('Reconhecimento de voz não está disponível aqui. Chrome/Edge costumam oferecer este recurso.');
      return;
    }
    const recognizer = new SR();
    recognitionRef.current = recognizer;
    recognizer.lang = 'en-US';
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 3;
    recognizer.onresult = (event:any) => {
      const heard = event.results?.[0]?.[0]?.transcript ?? '';
      setTranscript(heard);
      setFeedback('Transcrição capturada. Registre a tentativa para que ela entre no modelo.');
    };
    recognizer.onerror = () => setFeedback('Não consegui ouvir. Verifique o microfone e tente novamente.');
    recognizer.start();
    setFeedback('Ouvindo…');
  };

  const changeSubject = (nextSubject:Subject) => {
    setSubject(nextSubject);
    setState(s => ({...s,profile:{...s.profile,focus:nextSubject}}));
    setCurrentId('');
    setFeedback('');
    setView('dashboard');
  };

  const finishSetup = (focus:Subject, minutes:number) => {
    setSubject(focus);
    setState(current => ({...current, profile:{...current.profile, focus, dailyMinutes:minutes, onboarded:true}}));
    begin();
  };

  const resetAll = () => {
    if(!confirm('Apagar todo o progresso salvo neste navegador?')) return;
    setState(emptyState());
    setSubject('english');
    setCurrentId('');
    setView('dashboard');
  };

  if(!loaded){
    return <main className="kronia-app"><div className="grid"/><div className="loading"><div className="logo"><Sparkles/></div><b>Inicializando Kronia Study Engine…</b><span>Carregando seu mapa de aprendizagem</span></div></main>;
  }

  return <main className="kronia-app">
    <div className="orb orbA"/><div className="orb orbB"/><div className="grid"/><Particles/>
    <header>
      <div className="brand"><div className="logo"><Sparkles size={20}/></div><div><b>KRONIA</b><span>STUDY ENGINE</span></div></div>
      <div className="topstats"><span><Flame size={16}/> {state.streak} dias</span><span><Zap size={16}/> {state.xp} XP</span></div>
      <button className="avatar" aria-label="Configurações" onClick={() => setView('settings')}>K</button>
    </header>

    <aside>
      <Nav active={view==='dashboard'} onClick={() => setView('dashboard')} icon={<BarChart3/>} label="Visão geral"/>
      <Nav active={view==='study'} onClick={() => begin()} icon={<Brain/>} label="Estudar"/>
      <Nav active={view==='review'} onClick={() => setView('review')} icon={<RotateCcw/>} label={due>0 ? 'Revisão · '+due : 'Revisão'}/>
      <Nav active={view==='library'} onClick={() => setView('library')} icon={<LibraryBig/>} label="Biblioteca"/>
      <Nav active={view==='goals'} onClick={() => setView('goals')} icon={<Target/>} label="Metas"/>
      <Nav active={view==='settings'} onClick={() => setView('settings')} icon={<Settings/>} label="Configurações"/>
      <div className="sideBottom">
        <div className="miniCard">
          <span>{hasEvidence ? Math.round(mastery*100)+'% · '+masteryLabel(mastery) : 'Sem evidência ainda'}</span>
          <div className="bar"><i style={{width:(hasEvidence ? Math.round(mastery*100) : 5)+'%'}}/></div>
          <small>{todayAttempts.length} tentativas hoje · {minutesToday} min focados</small>
        </div>
        <div className="quote">“Aprender não é acertar. É conseguir fazer de novo depois.”</div>
      </div>
    </aside>

    <section className="content">
      <AnimatePresence mode="wait">
        <motion.div key={view+subject} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.2}}>
          {view==='dashboard' && <Dashboard state={state} subject={subject} mastery={mastery} due={due} minutes={minutesToday} practicedSkills={practicedSkills} onSubject={changeSubject} onStudy={() => begin()}/>}
          {view==='study' && <Study item={current} state={state} choice={choice} setChoice={setChoice} answer={answer} setAnswer={setAnswer} transcript={transcript} feedback={feedback} explanation={explanation} confidence={confidence} setConfidence={setConfidence} usedHint={usedHint} setUsedHint={setUsedHint} listening={listening} onSpeak={speak} onRecognize={recognize} onSubmit={submit} onNext={() => begin()}/>}
          {view==='review' && <Review state={state} subject={subject} onStart={begin}/>}
          {view==='library' && <Library subject={subject} onStart={() => begin()}/>}
          {view==='goals' && <Goals state={state} subject={subject} mastery={mastery} minutes={minutesToday}/>}
          {view==='settings' && <SettingsPanel state={state} onReset={resetAll}/>}
        </motion.div>
      </AnimatePresence>
    </section>
    {!state.profile.onboarded && <Onboarding onDone={finishSetup}/>} 
  </main>;
}

function Nav({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:ReactNode;label:string}){
  return <button className={active ? 'nav active' : 'nav'} onClick={onClick}>{icon}{label}</button>;
}

function Particles(){
  return <div className="particles">{Array.from({length:22},(_,i) =>
    <i key={i} style={{animationDelay:(i*-.45)+'s',left:((i*37)%100)+'%',top:((i*53)%100)+'%'}}/>
  )}</div>;
}

function Stat({icon,value,label,note}:{icon:ReactNode;value:string;label:string;note:string}){
  return <div className="stat"><div className="icon">{icon}</div><b>{value}</b><span>{label}</span><em>{note}</em></div>;
}

function Dashboard({state,subject,mastery,due,minutes,practicedSkills,onSubject,onStudy}:{state:StudyState;subject:Subject;mastery:number;due:number;minutes:number;practicedSkills:number;onSubject:(s:Subject)=>void;onStudy:()=>void}){
  const recent = state.attempts.slice(0,6);
  const hasData = state.attempts.length > 0;
  return <>
    <div className="hero">
      <div>
        <div className="eyebrow"><span className="pulse"/> MOTOR ADAPTATIVO ATIVO</div>
        <h1>Aprenda de verdade<span>.</span></h1>
        <p>O Kronia escolhe o próximo desafio usando suas tentativas, erros, dificuldade, confiança, tempo e revisões. Um acerto isolado não encerra um conceito.</p>
        <button className="primary" onClick={onStudy}><Play size={18}/> {hasData ? 'Continuar estudando' : 'Começar avaliação'} <ChevronRight size={17}/></button>
      </div>
      <div className="core"><div className="coreGlow"/><div className="coreRing r1"/><div className="coreRing r2"/><div className="coreCenter"><Brain size={34}/><small>FOCO</small><span className="corePulse"/></div><div className="node n1"/><div className="node n2"/><div className="node n3"/></div>
    </div>

    <div className="switch">
      <button className={subject==='english' ? 'sel' : ''} onClick={() => onSubject('english')}><span>EN</span> Inglês</button>
      <button className={subject==='math' ? 'sel' : ''} onClick={() => onSubject('math')}><span>∑</span> Matemática</button>
    </div>

    <div className="cards">
      <Stat icon={<Target/>} value={hasData ? Math.round(mastery*100)+'%' : '—'} label="Domínio estimado" note={hasData ? masteryLabel(mastery) : 'aguardando evidência'}/>
      <Stat icon={<Clock3/>} value={minutes+'m'} label="Foco hoje" note={state.profile.dailyMinutes+'m meta diária'}/>
      <Stat icon={<Brain/>} value={String(practicedSkills)} label="Habilidades praticadas" note={state.attempts.length+' tentativas'}/>
      <Stat icon={<RotateCcw/>} value={String(due)} label="Para revisar" note={due ? 'fila de retenção' : 'nenhuma urgente'}/>
    </div>

    <div className="sectionTitle"><div><small>MAPA DE APRENDIZAGEM</small><h2>{hasData ? 'Evidências recentes' : 'Seu mapa começa aqui'}</h2></div><span>{SUBJECT_INFO[subject].description}</span></div>
    <div className="path">
      {recent.length ? recent.map(a => <div className="lesson" key={a.id}>
        <div className="lessonIcon">{a.correct ? <Check/> : <Info/>}</div>
        <div><b>{getItem(a.itemId)?.title ?? a.skillId}</b><small>{a.correct ? 'evidência positiva' : 'precisa de nova prática'} · {new Date(a.timestamp).toLocaleDateString('pt-BR')}</small></div>
        <strong>{Math.round(a.score*100)}%</strong>
      </div>) : <div className="lesson current" onClick={onStudy}>
        <div className="lessonIcon"><Sparkles/></div>
        <div><b>Primeiro passo: descobrir seu ponto de partida</b><small>As primeiras tentativas constroem seu mapa real.</small></div>
        <strong>Começar <ChevronRight/></strong>
      </div>}
    </div>
  </>;
}

function Study({item,state,choice,setChoice,answer,setAnswer,transcript,feedback,explanation,confidence,setConfidence,usedHint,setUsedHint,listening,onSpeak,onRecognize,onSubmit,onNext}:{item:StudyItem;state:StudyState;choice:number|null;setChoice:(v:number|null)=>void;answer:string;setAnswer:(v:string)=>void;transcript:string;feedback:string;explanation:string;confidence:number;setConfidence:(v:number)=>void;usedHint:boolean;setUsedHint:(v:boolean)=>void;listening:boolean;onSpeak:()=>void;onRecognize:()=>void;onSubmit:()=>void;onNext:()=>void}){
  const skill = getSkill(state,item.skillId);
  return <div className="study">
    <div className="studyHead">
      <div><small>SESSÃO · {SUBJECT_INFO[item.subject].label.toUpperCase()} · DIFICULDADE {item.difficulty}/5</small><h1>{item.title}</h1></div>
      <div className="skillBadge"><span>{Math.round(skill.mastery*100)}%</span><small>{masteryLabel(skill.mastery)}</small></div>
    </div>
    <div className="sessionProgress"><i style={{width:Math.max(7,Math.round(skill.mastery*100))+'%'}}/></div>
    <div className="exercise exerciseGlow">
      <div className="scanline"/><div className="exerciseTag">{kindLabel(item.kind)}</div><h2>{item.prompt}</h2>
      {item.target && <div className="targetSentence">“{item.target}”</div>}
      {item.kind==='listen' && <button className={'listen '+(listening ? 'playing':'')} onClick={onSpeak}><Volume2/> {listening ? 'Reproduzindo…' : 'Ouvir frase'}</button>}
      {item.kind==='speak' && <div className="voiceBox"><div className="wave"><i/><i/><i/><i/><i/><i/><i/></div><button className="mic" onClick={onRecognize}><Mic/> Falar agora</button></div>}
      {item.kind==='choice' && <div className="options">{item.options?.map((option,index) =>
        <button key={option} className={choice===index ? 'chosen':''} onClick={() => setChoice(index)}><span>{String.fromCharCode(65+index)}</span>{option}</button>
      )}</div>}
      {(item.kind==='input'||item.kind==='explain') && <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder={item.kind==='input' ? 'Digite sua resposta…' : 'Explique com suas próprias palavras…'}/>}
      {transcript && <div className="transcript">Reconhecido: “{transcript}”</div>}
      {item.hint && <button className="hintButton" onClick={() => setUsedHint(true)}><Info/>{usedHint ? item.hint : 'Precisa de uma pista?'}</button>}
      <div className="confidence"><span>Quão confiante você está?</span><div>{[1,2,3,4,5].map(n => <button key={n} className={confidence===n ? 'selected':''} onClick={() => setConfidence(n)}>{n}</button>)}</div></div>
      <div className="exerciseFoot"><button className="primary" onClick={onSubmit}><Check/> Registrar tentativa</button>{feedback && <div className={feedback.startsWith('✓') ? 'good':'feedback'}>{feedback}</div>}</div>
      {explanation && <div className="explanation"><ShieldCheck size={18}/><div><b>Por que?</b><span>{explanation}</span></div></div>}
    </div>
    <div className="learningNote"><Brain size={18}/><div><b>O que conta como aprendizagem?</b><span>Desempenho, confiança, dificuldade, tempo, erros e revisões entram juntos. O alvo é retenção, não apenas acerto imediato.</span></div></div>
    {feedback && <button className="next" onClick={onNext}>Próximo desafio adaptativo <ChevronRight/></button>}
  </div>;
}

function kindLabel(kind:StudyItem['kind']){
  if(kind==='speak') return 'FALA';
  if(kind==='listen') return 'ESCUTA';
  if(kind==='choice') return 'RECUPERAÇÃO';
  if(kind==='input') return 'RESPOSTA';
  return 'EXPLICAÇÃO';
}

function Review({state,subject,onStart}:{state:StudyState;subject:Subject;onStart:(item?:StudyItem)=>void}){
  const now=Date.now();
  const due=getItemsForSubject(subject).filter(item => {
    const skill=getSkill(state,item.skillId);
    return !skill.nextReviewAt || new Date(skill.nextReviewAt).getTime()<=now;
  }).filter((item,index,array) => array.findIndex(x=>x.skillId===item.skillId)===index).slice(0,8);
  return <div className="study">
    <div className="studyHead"><div><small>REVISÃO ESPAÇADA</small><h1>O que precisa voltar</h1></div><span className="reviewCount">{due.length} na fila</span></div>
    <div className="learningNote"><RotateCcw size={18}/><div><b>Retenção antes de avanço</b><span>Uma revisão em outro momento é mais informativa do que repetir a mesma questão imediatamente.</span></div></div>
    <div className="path">{due.length ? due.map(item => <div className="lesson current" key={item.skillId} onClick={() => onStart(item)}>
      <div className="lessonIcon"><RotateCcw/></div><div><b>{item.title}</b><small>{Math.round(getSkill(state,item.skillId).mastery*100)}% · intervalo adaptativo</small></div><strong>Revisar <ChevronRight/></strong>
    </div>) : <div className="lesson"><div className="lessonIcon"><ShieldCheck/></div><div><b>Nenhuma revisão urgente</b><small>Continue aprendendo um conceito novo.</small></div><strong>✓</strong></div>}</div>
  </div>;
}

function Library({subject,onStart}:{subject:Subject;onStart:()=>void}){
  const items=getItemsForSubject(subject);
  return <div className="study">
    <div className="studyHead"><div><small>BIBLIOTECA</small><h1>Conteúdo rastreável</h1></div></div>
    <p className="hint">Os exercícios são pequenos e originais e apontam para fontes de referência. O material de terceiros não é copiado para dentro do Kronia.</p>
    <div className="path">{items.map(item => <div className="lesson" key={item.id}>
      <div className="lessonIcon">{item.subject==='math' ? <Calculator/> : <BookOpen/>}</div>
      <div><b>{item.title}</b><small>{item.tags.join(' · ')} · {item.source.name}</small></div>
      <a href={item.source.url} target="_blank" rel="noreferrer">Fonte ↗</a>
    </div>)}</div>
    <button className="primary" onClick={onStart}><Play/> Praticar recomendação</button>
  </div>;
}

function Goals({state,subject,mastery,minutes}:{state:StudyState;subject:Subject;mastery:number;minutes:number}){
  const hasData=state.attempts.length>0;
  return <div className="study">
    <div className="studyHead"><div><small>METAS E MÉTRICAS</small><h1>Construindo domínio</h1></div></div>
    <div className="cards">
      <Stat icon={<Target/>} value={hasData ? Math.round(mastery*100)+'%' : '—'} label={'Domínio em '+SUBJECT_INFO[subject].label} note={hasData ? masteryLabel(mastery):'ainda sem evidência'}/>
      <Stat icon={<Clock3/>} value={minutes+'/'+state.profile.dailyMinutes+'m'} label="Foco diário" note={minutes>=state.profile.dailyMinutes ? 'meta atingida':'continue a sessão'}/>
      <Stat icon={<Zap/>} value={String(state.xp)} label="XP" note="por evidência de aprendizagem"/>
      <Stat icon={<Flame/>} value={String(state.bestStreak)} label="Melhor sequência" note="dias consecutivos"/>
    </div>
    <div className="exercise"><div className="exerciseTag">REGRA DE OURO</div><h2>Domínio precisa sobreviver ao tempo.</h2><p className="hint">Revisões atrasadas, variação de contexto e explicação ajudam a evitar uma falsa sensação de domínio.</p></div>
  </div>;
}

function SettingsPanel({state,onReset}:{state:StudyState;onReset:()=>void}){
  return <div className="study">
    <div className="studyHead"><div><small>CONFIGURAÇÕES</small><h1>Seu Study Engine</h1></div></div>
    <div className="exercise">
      <div className="exerciseTag">LOCAL-FIRST</div><h2>{state.profile.name}</h2>
      <p className="hint">O progresso desta versão fica salvo no navegador. Conta e sincronização em nuvem ainda não estão ativadas.</p>
      <div className="learningNote"><ShieldCheck size={18}/><div><b>Privacidade</b><span>As respostas e métricas desta versão não são enviadas para um servidor.</span></div></div>
      <button className="ghost danger" onClick={onReset}>Apagar progresso local</button>
    </div>
  </div>;
}

function Onboarding({onDone}:{onDone:(subject:Subject,minutes:number)=>void}){
  const [focus,setFocus]=useState<Subject>('english');
  const [minutes,setMinutes]=useState(30);
  return <div className="modalBackdrop">
    <motion.div className="onboarding" initial={{opacity:0,scale:.96,y:16}} animate={{opacity:1,scale:1,y:0}} transition={{duration:.25}}>
      <div className="onboardingOrbit"><div/><div/><Sparkles/></div>
      <div className="eyebrow"><span className="pulse"/> PRIMEIRO ACESSO</div>
      <h2>Vamos construir seu mapa.</h2>
      <p>O Kronia começa sem assumir que você já domina alguma coisa. Escolha uma matéria e uma meta diária; as primeiras atividades servem como ponto de partida.</p>
      <div className="switch wide">
        <button className={focus==='english'?'sel':''} onClick={()=>setFocus('english')}><span>EN</span> Inglês</button>
        <button className={focus==='math'?'sel':''} onClick={()=>setFocus('math')}><span>∑</span> Matemática</button>
      </div>
      <label className="rangeLabel">Meta diária <strong>{minutes} min</strong><input type="range" min="10" max="90" step="5" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/><div className="rangeTicks"><span>10</span><span>45</span><span>90</span></div></label>
      <div className="learningNote"><ShieldCheck size={18}/><div><b>Sem números inventados</b><span>Seu domínio só aparece depois que o sistema tiver evidências das suas respostas.</span></div></div>
      <button className="primary" onClick={()=>onDone(focus,minutes)}><Sparkles/> Criar meu plano <ChevronRight/></button>
    </motion.div>
  </div>;
}
