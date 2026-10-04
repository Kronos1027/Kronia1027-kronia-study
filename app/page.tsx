'use client';

import { useEffect, useState } from 'react';
import { ITEMS, getItem } from '../lib/content';
import { applyAttempt, emptyState, ensureState, evaluateItem, getSkill, masteryLabel, overallMastery, selectNextItem } from '../lib/engine';
import type { StudyItem, StudyState } from '../lib/types';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3, Brain, BookOpen, Calculator, Check, ChevronRight, Clock3,
  Flame, LockKeyhole, Mic, Play, RotateCcw, Sparkles, Target, Volume2
} from 'lucide-react';

type Subject='english'|'math';
type SpeechRecognitionLike={lang:string;interimResults:boolean;maxAlternatives:number;onresult:(e:any)=>void;onerror:()=>void;start:()=>void};
type ChoiceItem={kind:'choice';title:string;text:string;options:string[];answer:number;explanation:string};
type TextItem={kind:'calc'|'explain';title:string;text:string;answer?:string;hint:string};
type VoiceItem={kind:'listen'|'speak';title:string;text:string;hint:string};
type Item=ChoiceItem|TextItem|VoiceItem;

const content:Record<Subject,Item[]>={
  english:[
    {kind:'listen',title:'Listening — Everyday English',text:'Could you send me the report by Friday?',hint:'Ouça duas vezes e identifique a intenção da frase.'},
    {kind:'speak',title:'Speaking — Natural request',text:'Could you send me the report by Friday?',hint:'Fale naturalmente. A avaliação inicial compara a transcrição, não substitui uma análise fonêmica.'},
    {kind:'choice',title:'Meaning in context',text:'I have been studying for two hours.',options:['Comecei há duas horas e ainda estudo.','Estudei duas horas ontem.','Vou estudar daqui a duas horas.'],answer:0,explanation:'Present perfect continuous conecta uma ação que começou no passado com o presente.'},
  ],
  math:[
    {kind:'calc',title:'Cálculo com sentido',text:'Uma loja dá 20% de desconto em um produto de R$ 150. Qual é o preço final?',answer:'120',hint:'Descubra primeiro quanto representa 20% e depois subtraia do preço.'},
    {kind:'choice',title:'Transfira o conceito',text:'Se o mesmo desconto de 20% fosse aplicado a R$ 80, qual seria o preço final?',options:['R$ 60','R$ 64','R$ 68'],answer:1,explanation:'Depois de retirar 20%, restam 80% do preço: 80 × 0,8 = 64.'},
    {kind:'explain',title:'Explique seu raciocínio',text:'Por que multiplicar por 0,8 produz o preço após um desconto de 20%?',hint:'Explique a relação entre 100%, 20% e os 80% que permanecem.'},
  ]
};

const normalize=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\\s+/g,' ').trim();
const toLegacy=(item:StudyItem):Item=>{
 if(item.kind==='choice')return {kind:'choice',title:item.title,text:item.prompt,options:item.options??[],answer:item.answer as number};
 if(item.kind==='input')return {kind:'calc',title:item.title,text:item.prompt,answer:String(item.answer??''),hint:item.hint??''};
 if(item.kind==='explain')return {kind:'explain',title:item.title,text:item.prompt,hint:item.hint??''};
 if(item.kind==='listen')return {kind:'listen',title:item.title,text:item.target??item.prompt,hint:item.hint??''};
 return {kind:'speak',title:item.title,text:item.target??item.prompt,hint:item.hint??''};
};

export default function Home(){
  const [subject,setSubject]=useState<Subject>('english');
  const [active,setActive]=useState<'dashboard'|'study'|'library'|'goals'>('dashboard');
  const [step,setStep]=useState(0);
  const [xp,setXp]=useState(640);
  const [streak,setStreak]=useState(7);
  const [mastery,setMastery]=useState(72);
  const [choice,setChoice]=useState<number|null>(null);
  const [input,setInput]=useState('');
  const [feedback,setFeedback]=useState('');
  const [transcript,setTranscript]=useState('');
  const [listening,setListening]=useState(false);
  const [engine,setEngine]=useState<StudyState>(emptyState());
  const [loaded,setLoaded]=useState(false);
  const [itemId,setItemId]=useState('');
  const [startedAt,setStartedAt]=useState(Date.now());
  const [engine,setEngine]=useState<StudyState>(emptyState());
  const [loaded,setLoaded]=useState(false);
  const [itemId,setItemId]=useState('');

  useEffect(()=>{try{const raw=localStorage.getItem('kronia-study-engine');if(raw){const s=ensureState(JSON.parse(raw));setEngine(s);setXp(s.xp);setStreak(s.streak);setMastery(overallMastery(s,subject));}}catch{}setLoaded(true)},[]);
 useEffect(()=>{if(loaded)try{localStorage.setItem('kronia-study-engine',JSON.stringify(engine))}catch{}},[engine,loaded]);
 useEffect(()=>{setMastery(overallMastery(engine,subject));},[engine,subject]);
 useEffect(()=>{
    try{
      const raw=localStorage.getItem('kronia-study-progress');
      if(raw){const d=JSON.parse(raw);if(typeof d.xp==='number')setXp(d.xp);if(typeof d.streak==='number')setStreak(d.streak);if(typeof d.mastery==='number')setMastery(d.mastery);}
    }catch{}
  },[]);
  useEffect(()=>{
    try{localStorage.setItem('kronia-study-progress',JSON.stringify({xp,streak,mastery}));}catch{}
  },[xp,streak,mastery]);

  const items=content[subject];
  const current=items[step%items.length];
  const selected=getItem(itemId);
  const progress=Math.round(((step%items.length)/items.length)*100);

  const speak=()=>{
    if(typeof window==='undefined'||!('speechSynthesis' in window)){setFeedback('Seu navegador não oferece reprodução de voz.');return;}
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(current.text);u.lang='en-US';u.rate=.9;
    u.onstart=()=>setListening(true);u.onend=()=>setListening(false);u.onerror=()=>setListening(false);
    window.speechSynthesis.speak(u);
  };

  const recognize=()=>{
    const SR=(window as Window & {SpeechRecognition?:new()=>SpeechRecognitionLike;webkitSpeechRecognition?:new()=>SpeechRecognitionLike}).SpeechRecognition
      ||(window as Window & {webkitSpeechRecognition?:new()=>SpeechRecognitionLike}).webkitSpeechRecognition;
    if(!SR){setFeedback('Reconhecimento de voz não está disponível neste navegador. Use Edge/Chrome ou pratique a frase em voz alta.');return;}
    const r=new SR();r.lang='en-US';r.interimResults=false;r.maxAlternatives=3;
    r.onresult=(e:SpeechRecognitionEvent)=>{
      const t=e.results[0][0].transcript;setTranscript(t);
      const target=normalize(current.text), heard=normalize(t);
      const targetWords=target.split(' '), heardWords=new Set(heard.split(' '));
      const score=targetWords.filter(w=>heardWords.has(w)).length/targetWords.length;
      setFeedback(score>=.82?'Boa produção! A transcrição ficou próxima do alvo. Isso é um sinal inicial, não uma prova de pronúncia perfeita.':'Ainda há diferença na transcrição. Repita mais devagar e tente ligar as palavras naturalmente.');
      if(score>=.82){setXp(v=>v+25);setMastery(v=>Math.min(100,v+1));}
    };
    r.onerror=()=>setFeedback('Não consegui ouvir. Verifique o microfone e tente novamente.');
    r.start();setFeedback('Ouvindo…');
  };

  const submit=()=>{
    if(selected){const result=evaluateItem(selected,{choice:choice??undefined,value:input,speech:transcript});const updated=applyAttempt(engine,selected,result,{confidence:.6,responseSeconds:Math.max(2,Math.round((Date.now()-startedAt)/1000)),attempts:1,usedHint:false});setEngine(updated);setXp(updated.xp);setStreak(updated.streak);setFeedback((result.correct?'✓ ':'')+result.feedback);return;}
    let ok=false;
    if(current.kind==='choice')ok=choice===current.answer;
    if(current.kind==='calc')ok=normalize(input).replace(',','.')===normalize(current.answer??'').replace(',','.');
    if(current.kind==='explain')ok=input.trim().length>=35;
    if(current.kind==='speak')ok=!!transcript;
    if(ok){setXp(v=>v+40);setMastery(v=>Math.min(100,v+2));setFeedback('✓ Evidência positiva. O próximo item muda o contexto para testar retenção e transferência.');}
    else setFeedback('Ainda não. O erro também é dado: tente novamente e observe o raciocínio, não apenas o resultado.');
  };

  const reset=()=>{setStep(0);setChoice(null);setInput('');setTranscript('');setFeedback('');};

  return <main className="kronia-app">
    <div className="orb orbA"/><div className="orb orbB"/><div className="grid"/><div className="particles">{Array.from({length:18},(_,i)=><i key={i} style={{animationDelay:`${i*-.7}s`,left:`${(i*17)%100}%`,top:`${(i*31)%100}%`}}/> )}</div>
    <header>
      <div className="brand"><div className="logo"><Sparkles size={20}/></div><div><b>KRONIA</b><span>STUDY ENGINE</span></div></div>
      <div className="topstats"><span><Flame size={16}/> {streak} dias</span><span><Target size={16}/> {xp} XP</span></div>
      <button className="avatar" aria-label="Perfil">K</button>
    </header>

    <aside>
      {([
        ['dashboard',<BarChart3/>,'Visão geral'],
        ['study',<Brain/>,'Estudar'],
        ['library',<BookOpen/>,'Biblioteca'],
        ['goals',<Target/>,'Metas']
      ] as const).map(([id,icon,label])=><button key={id} className={active===id?'nav active':'nav'} onClick={()=>setActive(id)}>{icon} {label}</button>)}
      <div className="sideBottom"><div className="miniCard"><span>Domínio estimado {mastery}%</span><div className="bar"><i style={{width:`${mastery}%`}}/></div><small>O domínio sobe com evidências consistentes.</small></div><div className="quote">“Aprender não é acertar. É conseguir fazer de novo depois.”</div></div>
    </aside>

    <section className="content">
      <AnimatePresence mode="wait">
        <motion.div key={active+subject} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.25}}>
          {active==='dashboard'&&<Dashboard subject={subject} setSubject={setSubject} mastery={mastery} xp={xp} streak={streak} onStudy={()=>setActive('study')}/>}
          {active==='study'&&<Study current={current} step={step} progress={progress} subject={subject} setSubject={setSubject} choice={choice} setChoice={setChoice} input={input} setInput={setInput} transcript={transcript} listening={listening} feedback={feedback} speak={speak} recognize={recognize} submit={submit} next={()=>{setStep(s=>s+1);setChoice(null);setInput('');setTranscript('');setFeedback('')}} reset={reset}/>}
          {active==='library'&&<Library/>}
          {active==='goals'&&<Goals mastery={mastery} xp={xp} streak={streak}/>}
        </motion.div>
      </AnimatePresence>
    </section>
  </main>
}

function Dashboard({subject,setSubject,mastery,xp,streak,onStudy}:{subject:Subject;setSubject:(s:Subject)=>void;mastery:number;xp:number;streak:number;onStudy:()=>void}){
  return <><div className="hero"><div><div className="eyebrow"><span className="pulse"/> MOTOR ADAPTATIVO ATIVO</div><h1>Aprenda de verdade<span>.</span></h1><p>O Kronia alterna recuperação, produção e transferência. Um acerto isolado não é tratado como domínio.</p><button className="primary" onClick={onStudy}><Play size={18}/> Começar sessão <ChevronRight size={17}/></button></div><div className="core"><div className="coreGlow"/><div className="coreRing r1"/><div className="coreRing r2"/><div className="coreCenter"><Brain size={34}/><small>FOCO</small><span className="corePulse"/></div><div className="node n1"/><div className="node n2"/><div className="node n3"/></div></div>
  <div className="switch"><button className={subject==='english'?'sel':''} onClick={()=>setSubject('english')}><span>EN</span> Inglês</button><button className={subject==='math'?'sel':''} onClick={()=>setSubject('math')}><span>∑</span> Matemática</button></div>
  <div className="cards" data-animate="stagger">
    <div className="stat"><div className="icon"><Target/></div><b>{mastery}%</b><span>Domínio estimado</span><em>calculado nesta sessão</em></div>
    <div className="stat"><div className="icon"><Clock3/></div><b>4h 35m</b><span>Tempo focado</span><em>+42m hoje</em></div>
    <div className="stat"><div className="icon"><Brain/></div><b>38</b><span>Conceitos em estudo</span><em>revisão espaçada</em></div>
    <div className="stat"><div className="icon"><Flame/></div><b>{streak}</b><span>Dias consecutivos</span><em>mantenha a consistência</em></div>
  </div>
  <div className="sectionTitle"><div><small>CAMINHO RECOMENDADO</small><h2>O que vale a pena estudar agora</h2></div><span>Personalizado para você</span></div>
  <div className="path"><div className="lesson done"><Check/><div><b>Fundamentos essenciais</b><small>Sinais de domínio · próxima revisão em breve</small></div><strong>feito</strong></div><div className="lesson current" onClick={onStudy}><div className="lessonIcon">{subject==='english'?<Volume2/>:<Calculator/>}</div><div><b>{subject==='english'?'Produção + compreensão':'Porcentagem aplicada'}</b><small>Próxima atividade · dificuldade adaptativa</small></div><strong>Agora <ChevronRight/></strong></div><div className="lesson locked"><LockKeyhole/><div><b>Próximo conceito</b><small>Liberação depende de evidências de retenção</small></div><span>bloqueado</span></div></div>
  </>;
}

function Study({current,step,progress,subject,setSubject,choice,setChoice,input,setInput,transcript,listening,feedback,speak,recognize,submit,next,reset}:{current:Item;step:number;progress:number;subject:Subject;setSubject:(s:Subject)=>void;choice:number|null;setChoice:(v:number|null)=>void;input:string;setInput:(v:string)=>void;transcript:string;listening:boolean;feedback:string;speak:()=>void;recognize:()=>void;submit:()=>void;next:()=>void;reset:()=>void}){
  return <div className="study"><div className="studyHead"><div><small>SESSÃO {subject==='english'?'INGLÊS':'MATEMÁTICA'} · {step+1}</small><h1>{current.title}</h1></div><div style={{display:'flex',gap:8}}><button className="ghost" onClick={()=>setSubject(subject==='english'?'math':'english')}>Trocar matéria</button><button className="ghost" onClick={reset}><RotateCcw/> Reiniciar</button></div></div><div className="sessionProgress"><i style={{width:`${Math.max(8,progress)}%`}}/></div>
  <div className="exercise exerciseGlow"><div className="scanline"/><div className="exerciseTag">{current.kind==='speak'?'FALA':current.kind==='listen'?'ESCUTA':current.kind==='calc'?'CÁLCULO':'PRÁTICA'}</div><h2>{current.text}</h2><p className="hint">{'hint' in current ? current.hint : current.explanation}</p>
  {current.kind==='listen'&&<button className={`listen ${listening?'playing':''}`} onClick={speak}><Volume2/> {listening?'Reproduzindo…':'Ouvir frase'}</button>}
  {current.kind==='speak'&&<><div className="voiceBox"><div className="wave"><i/><i/><i/><i/><i/><i/><i/></div><button className="mic" onClick={recognize}><Mic/> Falar agora</button></div>{transcript&&<div className="transcript">Reconhecido: “{transcript}”</div>}</>}
  {current.kind==='choice'&&<div className="options">{current.options.map((o,i)=><button key={o} className={choice===i?'chosen':''} onClick={()=>setChoice(i)}><span>{String.fromCharCode(65+i)}</span>{o}</button>)}</div>}
  {(current.kind==='calc'||current.kind==='explain')&&<textarea value={input} onChange={e=>setInput(e.target.value)} placeholder={current.kind==='calc'?'Digite o resultado…':'Explique com suas próprias palavras…'}/>}
  <div className="exerciseFoot"><button className="primary" onClick={submit}><Check/> Verificar</button>{feedback&&<div className={feedback.startsWith('✓')||feedback.startsWith('Boa')?'good':'feedback'}>{feedback}</div>}</div></div>
  <div className="learningNote"><Brain size={18}/><div><b>Por que este exercício?</b><span>O motor usa tipos diferentes de evidência. Acertos ajudam, mas retenção futura e transferência serão necessárias para declarar domínio.</span></div></div><button className="next" onClick={next}>Próxima atividade <ChevronRight/></button></div>;
}

function Library(){return <div className="study"><div className="studyHead"><div><small>BIBLIOTECA</small><h1>Materiais para aprender</h1></div></div><div className="path"><div className="lesson"><BookOpen/><div><b>English foundations</b><small>Escuta, vocabulário, produção e compreensão contextual.</small></div><strong>em construção</strong></div><div className="lesson"><Calculator/><div><b>Matemática essencial</b><small>Porcentagem, razão, álgebra e resolução de problemas.</small></div><strong>em construção</strong></div><div className="lesson"><Sparkles/><div><b>Fontes rastreáveis</b><small>Próxima camada: materiais públicos e referências por conceito.</small></div><strong>planejado</strong></div></div></div>}

function Goals({mastery,xp,streak}:{mastery:number;xp:number;streak:number}){return <div className="study"><div className="studyHead"><div><small>METAS</small><h1>Seu progresso</h1></div></div><div className="cards"><div className="stat"><div className="icon"><Target/></div><b>{mastery}%</b><span>Domínio estimado</span><em>meta inicial: 80%</em></div><div className="stat"><div className="icon"><Sparkles/></div><b>{xp}</b><span>XP acumulado</span><em>ganhe XP por evidência</em></div><div className="stat"><div className="icon"><Flame/></div><b>{streak}</b><span>dias seguidos</span><em>consistência importa</em></div></div><div className="exercise"><div className="exerciseTag">PRINCÍPIO</div><h2>Não confunda desempenho imediato com aprendizagem duradoura.</h2><p className="hint">O objetivo do motor é testar novamente, variar contexto e usar revisões atrasadas antes de considerar um conceito estável.</p></div></div>}
