// ═══════════════════════════════════════════════════════════════════════════════
// app.js — Main Entry Point
// ═══════════════════════════════════════════════════════════════════════════════
// Imports all ES modules, exposes them to window for HTML onclick handlers,
// and runs the initialization sequence.

// ─── Import all modules ───
import { S } from './state.js?v=20260316vvv';
import * as slide from './slide.js?v=20260316vvv';
import * as doc from './doc.js?v=20260316vvv';
import * as workspace from './workspace.js?v=20260316vvv';
import * as ai from './ai.js?v=20260316vvv';
import * as ui from './ui.js?v=20260316vvv';
import * as storage from './storage.js?v=20260316vvv';
import * as keys from './keys.js?v=20260316vvv';
import * as sheet from './sheet.js?v=20260316vvv';

// ─── Expose ALL module functions to window for HTML onclick handlers ───
// This allows <button onclick="functionName()"> attributes in the HTML to work
const allExports = {
  ...slide,
  ...doc,
  ...sheet,
  ...workspace,
  ...ai,
  ...ui,
  ...storage,
  ...keys,
};

for (const [name, fn] of Object.entries(allExports)) {
  if (typeof fn === 'function') {
    window[name] = fn;
  }
}

// Also expose the state object
window.S = S;

// ─── Function aliases (so AI router can use either name) ───
window.applyPreset = window.setPreset;

// ─── Initialization sequence (order matches app.html exactly) ───
// 1. Init slide infrastructure (toolbar, canvas, keys)
slide.initToolbar();
slide.initFreeformCanvas();
keys.initKeys();

// 2. Check welcome screen / enter saved mode (calls loadConfig internally)
ui.checkWelcomeScreen();
ui.initOllamaGuide();
ui.mpInitInputs();

// 3. Auth + restore persisted data (AFTER mode is established)
storage.initAuth();
storage.autoLoad();

// 4. Restore chat tabs
ai.initChatTabs();

// 5. Check share link (may override loaded deck)
storage.checkShareLink();

// 6. Final render
ui.renderApp();

// ═══════════════════════════════════════════════════════════════════════════════
// ── Typewriter placeholder animation ──
// ═══════════════════════════════════════════════════════════════════════════════
(function(){
  const input=document.getElementById('chatInput');
  const fullText='Tell Sloth what you need — a pitch deck, quarterly report, project proposal...';
  let idx=0;
  let typing=true;
  function tick(){
    // Stop typing if user has focused or typed something
    if(document.activeElement===input||input.value.length>0){
      if(typing){typing=false; input.placeholder=fullText;}
      return;
    }
    if(idx<=fullText.length){
      input.placeholder=fullText.slice(0,idx)+(idx<fullText.length?'|':'');
      idx++;
      setTimeout(tick,25+Math.random()*20);
    }else{
      // Done typing — remove cursor after a pause
      setTimeout(()=>{ input.placeholder=fullText; },600);
    }
  }
  setTimeout(tick,500); // Start after 0.5s
  // If user focuses then blurs without typing, show full text
  input.addEventListener('focus',()=>{
    typing=false;
    input.placeholder=fullText;
  });
})();

// ─── Welcome page demo animation ───
(function(){
  const DEMOS=[
    {
      prompt:'Create a pitch deck for Sloth Space, an AI presentation tool',
      aiReply:'Got it! Generating a 6-slide deck with Monet palette — cover, features, demo, roadmap, and closing...',
      slides:[
        { bg:'linear-gradient(135deg,#E8DDD0,#D8CEBE)',
          icon:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="14" rx="2.5" stroke="#4A5D7A" stroke-width="1.5"/><path d="M8 21h8M12 17v4" stroke="#4A5D7A" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="10" r="3" fill="#7886A5" opacity="0.4"/></svg>',
          title:'Sloth Space',titleColor:'#4A5D7A',
          subtitle:'AI-Native Presentations, Reimagined',subtitleColor:'#7886A5',
          body:'Just describe what you need.\nSloth turns words into slides — instantly.',bodyColor:'#6B7B6B' },
        { bg:'linear-gradient(135deg,#D8CEBE,#C8BEAE)',
          icon:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#4A5D7A" stroke-width="1.5"/><path d="M12 3v9l6 3" stroke="#7886A5" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="2" fill="#4A5D7A"/></svg>',
          title:'How It Works',titleColor:'#4A5D7A',
          subtitle:'Three simple steps',subtitleColor:'#7886A5',
          body:'1. Type a prompt in natural language\n2. AI generates structured slides\n3. Edit style, content, images with chat',bodyColor:'#6B7B6B' },
        { bg:'linear-gradient(135deg,#4A5D7A,#7886A5)',
          icon:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
          title:'Roadmap 2026',titleColor:'#fff',
          subtitle:'What\'s next for Sloth Space',subtitleColor:'rgba(255,255,255,0.8)',
          body:'Real-time collaboration • Template marketplace\nPDF export • Multi-language support',bodyColor:'rgba(255,255,255,0.55)' }
      ]
    },
    {
      prompt:'Build a startup investor deck with market analysis and financials',
      aiReply:'Creating an investor deck — TAM breakdown, competitive landscape, revenue model, and team overview...',
      slides:[
        { bg:'linear-gradient(135deg,#7886A5,#9BA8C4)',
          icon:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="4" height="8" rx="1" fill="rgba(255,255,255,0.5)"/><rect x="10" y="8" width="4" height="12" rx="1" fill="rgba(255,255,255,0.65)"/><rect x="17" y="4" width="4" height="16" rx="1" fill="rgba(255,255,255,0.8)"/></svg>',
          title:'Series A Funding',titleColor:'#fff',
          subtitle:'NovaMind — Personalized Learning at Scale',subtitleColor:'rgba(255,255,255,0.85)',
          body:'$4.2B TAM • 3x YoY Growth • 12K Users\n85% Retention • $1.8M ARR',bodyColor:'rgba(255,255,255,0.6)' },
        { bg:'linear-gradient(135deg,#6775A0,#8895B8)',
          icon:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/><path d="M12 3a9 9 0 0 1 0 18" fill="rgba(255,255,255,0.2)"/><path d="M12 3a9 9 0 0 1 7.8 4.5" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>',
          title:'Market Opportunity',titleColor:'#fff',
          subtitle:'EdTech is exploding globally',subtitleColor:'rgba(255,255,255,0.8)',
          body:'K-12 segment growing 18% CAGR\nEnterprise training $380B by 2028\nAI tutoring adoption up 240% YoY',bodyColor:'rgba(255,255,255,0.55)' },
        { bg:'linear-gradient(135deg,#5A6E95,#7886A5)',
          icon:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="8" r="3" stroke="#fff" stroke-width="1.3"/><circle cx="16" cy="8" r="3" stroke="#fff" stroke-width="1.3"/><circle cx="12" cy="16" r="3" stroke="#fff" stroke-width="1.3"/><path d="M8 11v2a4 4 0 0 0 4 4M16 11v2a4 4 0 0 1-4 4" stroke="rgba(255,255,255,0.4)" stroke-width="1"/></svg>',
          title:'The Team',titleColor:'#fff',
          subtitle:'Backed by ex-Google, Stanford, and YC alumni',subtitleColor:'rgba(255,255,255,0.8)',
          body:'CEO: 10yr ML experience • CTO: ex-Google Brain\nHead of Product: Stanford CS • 15 engineers',bodyColor:'rgba(255,255,255,0.55)' }
      ]
    },
    {
      prompt:'Design a product launch presentation with bold visuals',
      aiReply:'Building a launch deck with Seurat-inspired accents — hero slide, features, pricing, and call to action...',
      slides:[
        { bg:'linear-gradient(135deg,#2D4A3E,#3A5A4E)',
          icon:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#E8C56D" opacity="0.3" stroke="#E8C56D" stroke-width="1.5" stroke-linejoin="round"/></svg>',
          title:'Introducing Arc',titleColor:'#E8C56D',
          subtitle:'The Smartest Way to Manage Your Workflow',subtitleColor:'#A8D5A2',
          body:'Automate • Collaborate • Ship Faster\nFrom idea to production in half the time.',bodyColor:'rgba(255,255,255,0.5)' },
        { bg:'linear-gradient(135deg,#3A5A4E,#4A6A5E)',
          icon:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" fill="#E8C56D" opacity="0.3" stroke="#E8C56D" stroke-width="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.5" fill="#A8D5A2" opacity="0.3" stroke="#A8D5A2" stroke-width="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.5" fill="#A8D5A2" opacity="0.3" stroke="#A8D5A2" stroke-width="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.5" fill="#E8C56D" opacity="0.3" stroke="#E8C56D" stroke-width="1.2"/></svg>',
          title:'Key Features',titleColor:'#E8C56D',
          subtitle:'Everything your team needs in one place',subtitleColor:'#A8D5A2',
          body:'Smart task routing • Real-time dashboards\nAI-powered prioritization • 50+ integrations',bodyColor:'rgba(255,255,255,0.5)' },
        { bg:'linear-gradient(135deg,#4A6A5E,#2D4A3E)',
          icon:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M12 2v4m0 12v4m-7-11H1m22 0h-4" stroke="#E8C56D" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="5" stroke="#A8D5A2" stroke-width="1.5"/><circle cx="12" cy="12" r="2" fill="#E8C56D" opacity="0.5"/></svg>',
          title:'Pricing',titleColor:'#E8C56D',
          subtitle:'Start free. Scale as you grow.',subtitleColor:'#A8D5A2',
          body:'Free: 3 users • Pro: $12/mo per seat\nEnterprise: custom pricing • 14-day trial',bodyColor:'rgba(255,255,255,0.5)' }
      ]
    },
    {
      prompt:'Make a quarterly business review with KPIs and team highlights',
      aiReply:'Generating Q4 review — executive summary, revenue dashboard, OKR scorecard, and next quarter outlook...',
      slides:[
        { bg:'linear-gradient(135deg,#3A2E4A,#5A4E6A)',
          icon:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="#E8D5A3" stroke-width="1.5"/><path d="M8 12h8M8 8h5M8 16h6" stroke="#E8D5A3" stroke-width="1.2" stroke-linecap="round"/></svg>',
          title:'Q4 Business Review',titleColor:'#E8D5A3',
          subtitle:'FY2026 — Exceeding Every Benchmark',subtitleColor:'rgba(232,213,163,0.7)',
          body:'Revenue +23% • NPS 78 • Churn < 2%\nNew Markets: APAC, LATAM • Team +40%',bodyColor:'rgba(255,255,255,0.5)' },
        { bg:'linear-gradient(135deg,#4A3E5A,#6A5E7A)',
          icon:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><rect x="3" y="14" width="4" height="6" rx="1" fill="#A8D5A2" opacity="0.6"/><rect x="10" y="10" width="4" height="10" rx="1" fill="#E8D5A3" opacity="0.6"/><rect x="17" y="6" width="4" height="14" rx="1" fill="#D4A0C0" opacity="0.6"/><path d="M3 6l7 2 4-3 7 1" stroke="#E8D5A3" stroke-width="1.2" stroke-linecap="round"/></svg>',
          title:'Revenue Dashboard',titleColor:'#E8D5A3',
          subtitle:'All metrics trending upward',subtitleColor:'rgba(232,213,163,0.7)',
          body:'MRR $420K (+18% QoQ) • LTV $8,200\nCAC payback 4.2mo • Gross margin 82%',bodyColor:'rgba(255,255,255,0.5)' },
        { bg:'linear-gradient(135deg,#5A4E6A,#3A2E4A)',
          icon:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#A8D5A2" stroke-width="1.5"/><path d="M8 12l3 3 5-6" stroke="#A8D5A2" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
          title:'Q1 2027 Outlook',titleColor:'#E8D5A3',
          subtitle:'Ambitious goals, strong momentum',subtitleColor:'rgba(232,213,163,0.7)',
          body:'Launch enterprise tier • Hire 12 engineers\nExpand EMEA • Target $600K MRR',bodyColor:'rgba(255,255,255,0.5)' }
      ]
    }
  ];
  let demoIdx=0;
  let animTimer=null;

  // Get both desktop and mobile targets (mobile may not exist on desktop, that's ok)
  function getTargets(suffix){
    const desktop={
      prompt:document.getElementById('demoPromptText'),
      msgs:document.getElementById('demoMessages'),
      inner:document.getElementById('demoSlideInner'),
      area:document.getElementById('demoSlideArea'),
      icon:document.getElementById('demoSlideIcon'),
      title:document.getElementById('demoSlideTitle'),
      subtitle:document.getElementById('demoSlideSubtitle'),
      body:document.getElementById('demoSlideBody'),
      dots:document.getElementById('demoPageDots')
    };
    const mobile={
      prompt:document.getElementById('demoPromptTextMobile'),
      msgs:document.getElementById('demoMessagesMobile'),
      inner:document.getElementById('demoSlideInnerMobile'),
      area:document.getElementById('demoSlideAreaMobile'),
      icon:document.getElementById('demoSlideIconMobile'),
      title:document.getElementById('demoSlideTitleMobile'),
      subtitle:document.getElementById('demoSlideSubtitleMobile'),
      body:document.getElementById('demoSlideBodyMobile'),
      dots:document.getElementById('demoPageDotsMobile')
    };
    return [desktop,mobile].filter(t=>t.prompt&&t.inner);
  }

  function renderSlideT(s,t){
    t.area.style.background=s.bg;
    if(t.icon) t.icon.innerHTML=s.icon||'';
    t.title.textContent=s.title; t.title.style.color=s.titleColor;
    t.subtitle.textContent=s.subtitle; t.subtitle.style.color=s.subtitleColor;
    t.body.textContent=s.body; t.body.style.color=s.bodyColor;
  }

  function updateDotsT(total,current,t){
    if(!t.dots)return;
    t.dots.innerHTML=Array.from({length:total},(_,i)=>`<span class="${i===current?'active':''}"></span>`).join('');
  }

  function flipToSlideT(s,t,cb){
    t.inner.classList.remove('visible');
    t.inner.classList.add('slide-out');
    setTimeout(()=>{
      t.inner.classList.remove('slide-out');
      t.inner.classList.add('slide-in');
      renderSlideT(s,t);
      t.inner.offsetHeight;
      t.inner.classList.remove('slide-in');
      t.inner.style.transition='opacity 0.5s ease, transform 0.5s ease';
      t.inner.style.transform='translateX(0)';
      t.inner.classList.add('visible');
      if(cb) cb();
    },380);
  }

  function runDemo(){
    const overlay=document.getElementById('welcomeOverlay');
    if(!overlay||overlay.classList.contains('hidden')){
      animTimer=setTimeout(runDemo,2000);
      return;
    }
    const targets=getTargets();
    if(targets.length===0){ animTimer=setTimeout(runDemo,2000); return; }
    const demo=DEMOS[demoIdx%DEMOS.length];
    demoIdx++;
    // Reset all targets
    targets.forEach(t=>{
      t.prompt.textContent='';
      t.msgs.innerHTML='';
      t.inner.classList.remove('visible','slide-out','slide-in');
      t.inner.style.transform='';
      t.inner.style.transition='';
      t.area.style.background='#1a1a1a';
      updateDotsT(demo.slides.length,0,t);
    });
    // Phase 1: Type prompt
    let pi=0;
    function typePrompt(){
      if(pi<=demo.prompt.length){
        targets.forEach(t=>{ t.prompt.textContent=demo.prompt.slice(0,pi); });
        pi++;
        animTimer=setTimeout(typePrompt,18+Math.random()*12);
      }else{
        animTimer=setTimeout(showUserMsg,400);
      }
    }
    function showUserMsg(){
      targets.forEach(t=>{
        t.prompt.textContent='';
        const um=document.createElement('div');
        um.className='demo-msg user';
        um.textContent=demo.prompt;
        t.msgs.appendChild(um);
        requestAnimationFrame(()=>{ um.classList.add('visible'); });
      });
      animTimer=setTimeout(showAiReply,800);
    }
    function showAiReply(){
      targets.forEach(t=>{
        const am=document.createElement('div');
        am.className='demo-msg ai';
        am.textContent=demo.aiReply;
        t.msgs.appendChild(am);
        requestAnimationFrame(()=>{ am.classList.add('visible'); });
      });
      animTimer=setTimeout(showFirstSlide,1000);
    }
    function showFirstSlide(){
      targets.forEach(t=>{
        renderSlideT(demo.slides[0],t);
        updateDotsT(demo.slides.length,0,t);
        t.inner.classList.add('visible');
      });
      let si=1;
      function nextSlide(){
        if(si<demo.slides.length){
          targets.forEach(t=>updateDotsT(demo.slides.length,si,t));
          let done=0;
          targets.forEach(t=>{
            flipToSlideT(demo.slides[si],t,()=>{
              done++;
              if(done>=targets.length){ animTimer=setTimeout(()=>{ si++; nextSlide(); },2200); }
            });
          });
        }else{
          animTimer=setTimeout(runDemo,2500);
        }
      }
      animTimer=setTimeout(nextSlide,2200);
    }
    typePrompt();
  }
  setTimeout(runDemo,1200);
})();
