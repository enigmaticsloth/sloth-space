// ═══════════════════════════════════════════════════════════════════════════════
// app.js — Main Entry Point
// ═══════════════════════════════════════════════════════════════════════════════
// Imports all ES modules, exposes them to window for HTML onclick handlers,
// and runs the initialization sequence.

// ─── Import all modules ───
import { S } from './state.js?v=20260317c3';
import * as slide from './slide.js?v=20260317c3';
import * as doc from './doc.js?v=20260317c3';
import * as workspace from './workspace.js?v=20260317c3';
import * as ai from './ai.js?v=20260317c3';
import * as ui from './ui.js?v=20260317c3';
import * as storage from './storage.js?v=20260317c3';
import * as keys from './keys.js?v=20260317c3';
import * as sheet from './sheet.js?v=20260317c3';
import * as bench from './bench.js?v=20260317c3';

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
  ...bench,
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

// 1b. Init bench (context staging area)
bench.initBench();

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

// ─── Left sidebar demo showcase animation (visual mockups) ───
(function(){
  let sceneIdx=0, _timer=null, _running=false;
  function el(id){ return document.getElementById(id); }
  function wait(ms){ return new Promise(r=>{ _timer=setTimeout(r,ms); }); }
  function alive(){ return !!el('llDemo'); }

  // Typewriter into the mini prompt bar
  async function typePrompt(text){
    const t=el('demoInputText');
    if(!t) return;
    t.textContent='';
    for(let i=0;i<text.length;i++){
      if(!alive()) return;
      t.textContent=text.slice(0,i+1);
      await wait(28+Math.random()*18);
    }
    await wait(350);
  }

  function setStatus(html){ const s=el('demoStatus'); if(s) s.innerHTML=html; }
  function clearCanvas(){ const c=el('demoCanvas'); if(c){ c.innerHTML=''; c.classList.remove('fade-out'); } }

  // Transition: fade out phase-1 canvas → show result card
  async function showResultCard(c, cardHTML){
    if(!alive()) return;
    c.classList.add('fade-out');
    await wait(350);
    if(!alive()) return;
    c.innerHTML=cardHTML;
    c.classList.remove('fade-out');
    // trigger show animation on card
    await wait(30);
    const card=c.querySelector('.demo-result-card');
    if(card) card.classList.add('show');
    await wait(2800);
  }

  // ──── Scene 1: Generate Slides ────
  async function sceneSlides(){
    await typePrompt('Create a pitch deck for our startup');
    setStatus('<span class="ds-spin"></span> Generating slides...');
    clearCanvas();
    const c=el('demoCanvas');
    if(!c) return;
    const slides=[
      {bars:['title','w1','w2']},
      {bars:['title','w3','w1','w2']},
      {bars:['title','w2 accent','w1']},
      {bars:['title','w1','w3','w2']},
      {bars:['title','w2','w1 accent']},
      {bars:['title','w3','w1','w2']},
    ];
    const wrap=document.createElement('div');
    wrap.className='demo-slides';
    slides.forEach(s=>{
      const card=document.createElement('div');
      card.className='demo-slide';
      s.bars.forEach(b=>{
        const bar=document.createElement('div');
        bar.className='ds-bar '+b;
        card.appendChild(bar);
      });
      wrap.appendChild(card);
    });
    c.appendChild(wrap);
    const cards=wrap.querySelectorAll('.demo-slide');
    for(let i=0;i<cards.length;i++){
      if(!alive()) return;
      await wait(180);
      cards[i].classList.add('show');
      setStatus(`<span class="ds-spin"></span> Slide ${i+1} of 6`);
    }
    await wait(600);
    setStatus('<span class="ds-ok">✓ Pitch deck ready</span>');
    // Phase 2: result card
    await showResultCard(c,`
      <div class="demo-result-card">
        <div class="demo-rc-header">
          <div class="demo-rc-icon" style="background:rgba(120,134,165,0.2);color:#B8C4D8;">▦</div>
          <div><div class="demo-rc-title">Startup Pitch Deck</div>
          <div class="demo-rc-subtitle">Monet theme · 6 slides</div></div>
        </div>
        <div class="demo-rc-body">
          <div class="demo-rc-row"><span class="demo-rc-dot" style="background:#7886A5"></span><span class="demo-rc-text">Cover — name & tagline</span></div>
          <div class="demo-rc-row"><span class="demo-rc-dot" style="background:#9BA8C4"></span><span class="demo-rc-text">Problem & Solution</span></div>
          <div class="demo-rc-row"><span class="demo-rc-dot" style="background:#A899C4"></span><span class="demo-rc-text">Market Opportunity</span></div>
          <div class="demo-rc-row"><span class="demo-rc-dot" style="background:#C8A870"></span><span class="demo-rc-text">Revenue Model</span></div>
          <div class="demo-rc-row"><span class="demo-rc-dot" style="background:#7886A5"></span><span class="demo-rc-text">Traction & Roadmap</span></div>
          <div class="demo-rc-row"><span class="demo-rc-dot" style="background:#5A9E5A"></span><span class="demo-rc-text">Ask & Contact</span></div>
        </div>
      </div>`);
  }

  // ──── Scene 2: AI reads project files ────
  async function sceneContext(){
    await typePrompt('Summarize all files in Project Alpha');
    setStatus('<span class="ds-spin"></span> Scanning project files...');
    clearCanvas();
    const c=el('demoCanvas');
    if(!c) return;
    const files=[
      {icon:'#7886A5',label:'SL',name:'pitch-deck.sloth'},
      {icon:'#5A9E5A',label:'DC',name:'market-research.doc'},
      {icon:'#C8A870',label:'SH',name:'budget-q4.sheet'},
      {icon:'#A899C4',label:'DC',name:'strategy-notes.doc'},
      {icon:'#7886A5',label:'SL',name:'team-intro.sloth'},
      {icon:'#C8A870',label:'SH',name:'metrics.sheet'},
    ];
    const wrap=document.createElement('div');
    wrap.className='demo-files';
    files.forEach(f=>{
      const row=document.createElement('div');
      row.className='demo-file';
      row.innerHTML=`<div class="df-icon" style="background:${f.icon}">${f.label}</div><span class="df-name">${f.name}</span><span class="df-check">✓</span>`;
      wrap.appendChild(row);
    });
    c.appendChild(wrap);
    const rows=wrap.querySelectorAll('.demo-file');
    for(let i=0;i<rows.length;i++){
      if(!alive()) return;
      await wait(120);
      rows[i].classList.add('show');
    }
    await wait(300);
    for(let i=0;i<rows.length;i++){
      if(!alive()) return;
      await wait(220);
      rows[i].classList.add('scanned');
      setStatus(`<span class="ds-spin"></span> Reading ${files[i].name}...`);
    }
    await wait(500);
    setStatus('<span class="ds-ok">✓ Analysis complete</span>');
    // Phase 2: summary result card
    await showResultCard(c,`
      <div class="demo-result-card">
        <div class="demo-rc-header">
          <div class="demo-rc-icon" style="background:rgba(90,158,90,0.2);color:#5A9E5A;">✦</div>
          <div><div class="demo-rc-title">Project Alpha Summary</div>
          <div class="demo-rc-subtitle">6 files · 5 insights</div></div>
        </div>
        <div class="demo-rc-body">
          <div class="demo-rc-row"><span class="demo-rc-dot" style="background:#5A9E5A"></span><span class="demo-rc-text">Revenue up 27% QoQ</span></div>
          <div class="demo-rc-row"><span class="demo-rc-dot" style="background:#C8A870"></span><span class="demo-rc-text">Budget on track for Q4</span></div>
          <div class="demo-rc-row"><span class="demo-rc-dot" style="background:#7886A5"></span><span class="demo-rc-text">3 action items pending</span></div>
          <div class="demo-rc-divider"></div>
          <div class="demo-rc-stat"><span class="demo-rc-stat-label">Files scanned</span><span class="demo-rc-stat-val">6</span></div>
          <div class="demo-rc-stat"><span class="demo-rc-stat-label">Total content</span><span class="demo-rc-stat-val">4,200 words</span></div>
          <div class="demo-rc-stat"><span class="demo-rc-stat-label">Cross-refs</span><span class="demo-rc-stat-val">12 found</span></div>
        </div>
      </div>`);
  }

  // ──── Scene 3: Build a spreadsheet ────
  async function sceneSheet(){
    await typePrompt('Create a Q4 budget spreadsheet');
    setStatus('<span class="ds-spin"></span> Building spreadsheet...');
    clearCanvas();
    const c=el('demoCanvas');
    if(!c) return;
    const wrap=document.createElement('div');
    wrap.className='demo-sheet';
    const hdr=document.createElement('div');
    hdr.className='demo-sheet-header';
    ['A','B','C','D'].forEach(l=>{
      const s=document.createElement('span');
      s.textContent=l;
      hdr.appendChild(s);
    });
    wrap.appendChild(hdr);
    const data=[
      ['Revenue','$48K','$52K','$61K'],
      ['COGS','$18K','$19K','$22K'],
      ['Gross','$30K','$33K','$39K'],
      ['Opex','$12K','$11K','$13K'],
      ['EBITDA','$18K','$22K','$26K'],
      ['Margin','37%','42%','43%'],
    ];
    const rowEls=[];
    data.forEach((r,ri)=>{
      const row=document.createElement('div');
      row.className='demo-sheet-row';
      r.forEach((v,ci)=>{
        const cell=document.createElement('div');
        cell.className='demo-sheet-cell'+(ri===4&&ci>0?' highlight':'');
        cell.textContent=v;
        row.appendChild(cell);
      });
      wrap.appendChild(row);
      rowEls.push(row);
    });
    c.appendChild(wrap);
    for(let i=0;i<rowEls.length;i++){
      if(!alive()) return;
      await wait(200);
      rowEls[i].classList.add('show');
      setStatus(`<span class="ds-spin"></span> Row ${i+1} of ${data.length}`);
    }
    await wait(600);
    setStatus('<span class="ds-ok">✓ Spreadsheet ready</span>');
    // Phase 2: result card
    await showResultCard(c,`
      <div class="demo-result-card">
        <div class="demo-rc-header">
          <div class="demo-rc-icon" style="background:rgba(200,168,112,0.2);color:#C8A870;">⊞</div>
          <div><div class="demo-rc-title">Q4 Budget</div>
          <div class="demo-rc-subtitle">4 columns · 6 rows · formulas</div></div>
        </div>
        <div class="demo-rc-body">
          <div class="demo-rc-stat"><span class="demo-rc-stat-label">Revenue (Oct)</span><span class="demo-rc-stat-val">$48K</span></div>
          <div class="demo-rc-stat"><span class="demo-rc-stat-label">Revenue (Dec)</span><span class="demo-rc-stat-val" style="color:#5A9E5A">$61K ▲</span></div>
          <div class="demo-rc-stat"><span class="demo-rc-stat-label">EBITDA growth</span><span class="demo-rc-stat-val" style="color:#5A9E5A">+44%</span></div>
          <div class="demo-rc-divider"></div>
          <div class="demo-rc-row"><span class="demo-rc-dot" style="background:#5A9E5A"></span><span class="demo-rc-text">Auto-calculated margins</span></div>
          <div class="demo-rc-row"><span class="demo-rc-dot" style="background:#7886A5"></span><span class="demo-rc-text">EBITDA row highlighted</span></div>
        </div>
      </div>`);
  }

  // ──── Scene 4: Generate a doc ────
  async function sceneDoc(){
    await typePrompt('Write a project proposal for Q1');
    setStatus('<span class="ds-spin"></span> Writing document...');
    clearCanvas();
    const c=el('demoCanvas');
    if(!c) return;
    const wrap=document.createElement('div');
    wrap.className='demo-doc';
    const title=document.createElement('div');
    title.className='dd-title';
    wrap.appendChild(title);
    const widths=['w1','w3','w2','w5','w4','w6','w1','w3'];
    const lines=[];
    widths.forEach(w=>{
      const l=document.createElement('div');
      l.className='dd-line '+w;
      wrap.appendChild(l);
      lines.push(l);
    });
    c.appendChild(wrap);
    await wait(200);
    if(!alive()) return;
    title.classList.add('show');
    setStatus('<span class="ds-spin"></span> Writing title...');
    await wait(350);
    for(let i=0;i<lines.length;i++){
      if(!alive()) return;
      await wait(140);
      lines[i].classList.add('show');
      if(i===0) setStatus('<span class="ds-spin"></span> Introduction...');
      if(i===3) setStatus('<span class="ds-spin"></span> Key objectives...');
      if(i===6) setStatus('<span class="ds-spin"></span> Timeline...');
    }
    await wait(600);
    setStatus('<span class="ds-ok">✓ Document ready</span>');
    // Phase 2: result card
    await showResultCard(c,`
      <div class="demo-result-card">
        <div class="demo-rc-header">
          <div class="demo-rc-icon" style="background:rgba(168,153,196,0.2);color:#A899C4;">☰</div>
          <div><div class="demo-rc-title">Q1 Project Proposal</div>
          <div class="demo-rc-subtitle">8 paragraphs · 1,200 words</div></div>
        </div>
        <div class="demo-rc-body">
          <div class="demo-rc-row"><span class="demo-rc-dot" style="background:#A899C4"></span><span class="demo-rc-text">Executive summary</span></div>
          <div class="demo-rc-row"><span class="demo-rc-dot" style="background:#7886A5"></span><span class="demo-rc-text">Goals & key objectives</span></div>
          <div class="demo-rc-row"><span class="demo-rc-dot" style="background:#C8A870"></span><span class="demo-rc-text">Budget & resources</span></div>
          <div class="demo-rc-row"><span class="demo-rc-dot" style="background:#5A9E5A"></span><span class="demo-rc-text">Timeline & milestones</span></div>
          <div class="demo-rc-divider"></div>
          <div class="demo-rc-stat"><span class="demo-rc-stat-label">Sections</span><span class="demo-rc-stat-val">4</span></div>
          <div class="demo-rc-stat"><span class="demo-rc-stat-label">Export</span><span class="demo-rc-stat-val">.docx .pdf</span></div>
        </div>
      </div>`);
  }

  const SCENES=[sceneSlides, sceneContext, sceneSheet, sceneDoc];

  function updateDots(){
    const d=el('llDemoDots');
    if(!d) return;
    d.innerHTML=SCENES.map((_,i)=>`<span class="${i===sceneIdx%SCENES.length?'active':''}"></span>`).join('');
  }

  async function loop(){
    if(_running) return;
    _running=true;
    while(alive()){
      const overlay=document.getElementById('landingOverlay');
      if(!overlay||overlay.classList.contains('hidden')){
        await wait(2000);
        continue;
      }
      updateDots();
      const scene=SCENES[sceneIdx%SCENES.length];
      // Clear state
      const t=el('demoInputText'); if(t) t.textContent='';
      clearCanvas();
      setStatus('');
      await scene();
      sceneIdx++;
    }
    _running=false;
  }
  setTimeout(loop,1500);
})();
