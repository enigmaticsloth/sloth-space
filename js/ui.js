import { S, PRESETS, LAYOUTS, LLM_DEFAULTS, CLOUD_PROVIDERS, FONTS } from './state.js';

// ═══════════════════════════════════════════
// RENDER APP — Main dispatcher
// ═══════════════════════════════════════════
function renderApp(){
  // Skip re-render while user is inline-editing text (would destroy cursor + edit state)
  if(window.isInlineEditing())return;

  // If in doc or workspace mode, don't render slide UI — enforce mode isolation
  if(S.currentMode==='doc'){
    document.getElementById('slideCanvas').style.display='none';
    const sb=document.querySelector('.slide-bar'); if(sb) sb.style.display='none';
    window.renderDocMode(); return;
  }
  if(S.currentMode==='sheet'){
    document.getElementById('slideCanvas').style.display='none';
    const sb2=document.querySelector('.slide-bar'); if(sb2) sb2.style.display='none';
    window.renderSheetMode(); return;
  }
  if(S.currentMode==='workspace'){
    document.getElementById('slideCanvas').style.display='none';
    const sb=document.querySelector('.slide-bar'); if(sb) sb.style.display='none';
    window.renderWorkspaceMode(); return;
  }

  // Auto-save on every render (deck changes trigger render)
  window.autoSave();

  // Sync deck name input
  const deckNameEl=document.getElementById('deckNameInput');
  if(deckNameEl&&document.activeElement!==deckNameEl){
    deckNameEl.value=S.currentDeck?.title||'';
  }

  // Vivid preset pill colors
  const PILL_COLORS={
    'clean-white':{bg:'#FFFFFF',fg:'#111',bd:'#ccc',aBg:'#111',aFg:'#fff'},
    'clean-gray':{bg:'#D0D0D0',fg:'#222',bd:'#aaa',aBg:'#666',aFg:'#fff'},
    'clean-dark':{bg:'#222',fg:'#eee',bd:'#555',aBg:'#000',aFg:'#fff'},
    'monet':{bg:'#B8C4D8',fg:'#2C2C3A',bd:'#7886A5',aBg:'#7886A5',aFg:'#fff'},
    'seurat':{bg:'#E8C89A',fg:'#2A2A1E',bd:'#C67A3C',aBg:'#C67A3C',aFg:'#fff'}
  };
  document.getElementById('presetPills').innerHTML=Object.values(PRESETS).map(pr=>{
    const p=PILL_COLORS[pr.id]||{bg:'#333',fg:'#ccc',bd:'#555',aBg:'#666',aFg:'#fff'};
    const isActive=pr.id===S.currentPreset;
    return `<button class="${isActive?'active':''}" data-preset="${pr.id}" onclick="window.setPreset('${pr.id}')" style="background:${isActive?p.aBg:p.bg};color:${isActive?p.aFg:p.fg};">${pr.name}</button>`;
  }).join('');

  // Toolbar visibility is ONLY controlled by updateToolbarForMode().
  // Do NOT touch toolbar display here — it causes mode conflicts.

  // Onboarding: show prompt chips in empty chat
  window.renderChatOnboarding();

  const panel=document.querySelector('.slide-panel');
  const isMobile=window.innerWidth<=600;
  const panelW=panel.clientWidth-(isMobile?8:12);
  // On mobile: use CACHED initial viewport height so pinch-to-zoom doesn't shrink slide
  // On desktop: use actual panel height minus chrome
  let panelH;
  if(isMobile){
    const stableVH=typeof window.INITIAL_VH!=='undefined'?window.INITIAL_VH:window.innerHeight;
    panelH=Math.max(stableVH*0.36-64, 80); // match CSS flex:0 0 36vh
  }else{
    panelH=panel.clientHeight-70;
  }

  if(!S.currentDeck){
    const emptyH=isMobile?Math.max(panelH,80):panelH;
    const emptyPad=isMobile?'16px':'30px';
    const emptyIcon=isMobile?'24px':'32px';
    const emptyTitle=isMobile?'12px':'15px';
    document.getElementById('slideCanvas').innerHTML=`<div style="width:${panelW}px;height:${emptyH}px;background:#131313;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:${isMobile?'8px':'14px'};padding:${emptyPad};">
      <div style="font-size:${emptyIcon};">🦥</div>
      <div style="color:#555;font-size:${emptyTitle};font-family:Arial;text-align:center;">Type what you want in the chat.<br>Sloth will design it.</div>
      ${isMobile?'':`<div style="color:#333;font-size:11px;font-family:Arial;text-align:center;max-width:320px;line-height:1.5;">Try: &quot;Create a 5-slide deck about AI trends&quot; or &quot;Build a startup pitch deck&quot;</div>`}
    </div>`;
    document.getElementById('slideNav').innerHTML='';
    document.getElementById('slideInfo').textContent='';
    return;
  }

  const p=PRESETS[S.currentPreset];
  const slides=S.currentDeck.slides;
  const s=slides[S.currentSlide];
  const sc=Math.min(panelW/p.slide.width, panelH/p.slide.height, 1);

  const cv=document.getElementById('slideCanvas');
  cv.style.width=(p.slide.width*sc)+'px';
  cv.style.height=(p.slide.height*sc)+'px';
  // Two-layer structure: outer div = swipe animation, inner div = scale transform
  // This prevents CSS animation from overwriting the scale (animation forwards was killing transform:scale)
  const animClass=S.slideAnimDir>0?'slide-enter-left':S.slideAnimDir<0?'slide-enter-right':'';
  cv.innerHTML=`<div class="${animClass}" style="width:${p.slide.width*sc}px;height:${p.slide.height*sc}px;overflow:hidden;"><div style="transform:scale(${sc});transform-origin:top left;width:${p.slide.width}px;height:${p.slide.height}px;">${window.renderSlide(s,S.currentSlide,p,slides.length)}</div></div>`;

  document.getElementById('slideNav').innerHTML=slides.map((_,i)=>
    `<button class="${i===S.currentSlide?'active':''}" onclick="window.goSlide(${i})">${i+1}</button>`
  ).join('');

  document.getElementById('slideInfo').textContent=`${S.currentSlide+1}/${slides.length} | ${s.layout} | ${S.currentPreset}`;
  window.updateFontSizeIndicator();
}

// ═══════════════════════════════════════════
// SETTINGS UI
// ═══════════════════════════════════════════
let settingsProvider = 'groq';

function openSettings() {
  settingsProvider = S.llmConfig.provider;
  // Build provider cards dynamically
  const cards=document.getElementById('settingsProviderCards');
  cards.innerHTML=Object.entries(LLM_DEFAULTS).map(([key,def])=>
    `<div class="provider-card" data-provider="${key}" onclick="window.setSettingsProvider('${key}')">
      <div style="width:8px;height:8px;border-radius:50%;background:${def.color};margin:0 auto 4px;"></div>
      <div class="pc-name">${def.label}</div>
      <div class="pc-desc">${def.desc}</div>
    </div>`
  ).join('');
  // Fill fields
  const isCloud=CLOUD_PROVIDERS.includes(settingsProvider);
  if(isCloud){
    document.getElementById('settingsApiKey').value=S.llmConfig.apiKey||'';
  }
  if(settingsProvider==='ollama'){
    document.getElementById('settingsOllamaUrl').value=S.llmConfig.url||LLM_DEFAULTS.ollama.url;
    document.getElementById('settingsOllamaModel').value=S.llmConfig.model||LLM_DEFAULTS.ollama.model;
    document.getElementById('settingsOllamaRouter').value=S.llmConfig.router||LLM_DEFAULTS.ollama.router;
  }
  if(settingsProvider==='custom'){
    document.getElementById('settingsCustomUrl').value=S.llmConfig.url||'';
    document.getElementById('settingsCustomKey').value=S.llmConfig.apiKey||'';
    document.getElementById('settingsCustomModel').value=S.llmConfig.model||'';
    document.getElementById('settingsCustomRouter').value=S.llmConfig.router||'';
  }
  document.getElementById('settingsDisplayName').value = S.llmConfig.displayName || '';
  // Storage pref
  const sPref=getStoragePref();
  document.getElementById('prefCloud')?.classList.toggle('active',sPref==='cloud');
  document.getElementById('prefLocal')?.classList.toggle('active',sPref==='local');
  document.getElementById('settingsTestStatus').className = 'settings-status';
  document.getElementById('settingsTestStatus').style.display = 'none';
  updateSettingsProviderUI();
  document.getElementById('settingsOverlay').classList.add('show');
}

function closeSettings() {
  document.getElementById('settingsOverlay').classList.remove('show');
}

function setSettingsProvider(p) {
  settingsProvider = p;
  updateSettingsProviderUI();
}

function updateSettingsProviderUI() {
  document.querySelectorAll('#settingsProviderCards .provider-card').forEach(c => {
    c.classList.toggle('active', c.dataset.provider === settingsProvider);
  });
  const isCloud=CLOUD_PROVIDERS.includes(settingsProvider);
  document.getElementById('settingsCloudFields').style.display = isCloud ? '' : 'none';
  document.getElementById('settingsOllamaFields').style.display = settingsProvider === 'ollama' ? '' : 'none';
  document.getElementById('settingsCustomFields').style.display = settingsProvider === 'custom' ? '' : 'none';
  if(isCloud){
    const def=LLM_DEFAULTS[settingsProvider];
    document.getElementById('settingsKeyLabel').textContent=`${def.label} API Key`;
    document.getElementById('settingsApiKey').placeholder=def.keyPrefix+'...';
  }
}

function saveSettings() {
  const isCloud=CLOUD_PROVIDERS.includes(settingsProvider);
  const newKey=isCloud?document.getElementById('settingsApiKey').value.trim():'';
  const oldKey=S.llmConfig.apiKey||'';
  // Show confirmation if switching to cloud provider with a new/different API key (skip if already accepted)
  if(isCloud && newKey && newKey!==oldKey && !localStorage.getItem('sloth_api_warning_accepted')){
    showApiCostConfirm(function(){ localStorage.setItem('sloth_api_warning_accepted','1'); _commitSettings(); });
    return;
  }
  _commitSettings();
}

function _commitSettings(){
  const defaults = LLM_DEFAULTS[settingsProvider];
  S.llmConfig.provider = settingsProvider;
  S.llmConfig.displayName = document.getElementById('settingsDisplayName').value.trim();

  const isCloud=CLOUD_PROVIDERS.includes(settingsProvider);
  if (isCloud) {
    S.llmConfig.apiKey = document.getElementById('settingsApiKey').value.trim();
    S.llmConfig.url = defaults.url;
    S.llmConfig.model = defaults.model;
    S.llmConfig.router = defaults.router;
  } else if (settingsProvider === 'ollama') {
    S.llmConfig.url = document.getElementById('settingsOllamaUrl').value.trim() || defaults.url;
    S.llmConfig.model = document.getElementById('settingsOllamaModel').value.trim() || defaults.model;
    S.llmConfig.router = document.getElementById('settingsOllamaRouter').value.trim() || defaults.router;
    S.llmConfig.apiKey = '';
  } else if (settingsProvider === 'custom') {
    S.llmConfig.url = document.getElementById('settingsCustomUrl').value.trim() || defaults.url;
    S.llmConfig.apiKey = document.getElementById('settingsCustomKey').value.trim();
    S.llmConfig.model = document.getElementById('settingsCustomModel').value.trim() || defaults.model;
    S.llmConfig.router = document.getElementById('settingsCustomRouter').value.trim() || defaults.router;
  }

  window.saveConfig();
  window.syncConfigToCloud();
  closeSettings();
  window.addMessage(`✓ Settings saved (${LLM_DEFAULTS[settingsProvider]?.label||settingsProvider})`,'system');
}

async function testConnection() {
  const statusEl = document.getElementById('settingsTestStatus');
  statusEl.textContent = 'Testing...';
  statusEl.className = 'settings-status';
  statusEl.style.display = 'block';

  // Build temporary config from form
  const tmpProvider = settingsProvider;
  const defaults = LLM_DEFAULTS[tmpProvider];
  const isCloud = CLOUD_PROVIDERS.includes(tmpProvider);
  let tmpUrl, tmpKey, tmpModel;

  if (isCloud) {
    tmpUrl = defaults.url;
    tmpKey = document.getElementById('settingsApiKey').value.trim();
    tmpModel = defaults.router; // Use small model for test
  } else if (tmpProvider === 'ollama') {
    tmpUrl = document.getElementById('settingsOllamaUrl').value.trim() || defaults.url;
    tmpKey = '';
    tmpModel = document.getElementById('settingsOllamaRouter').value.trim() || defaults.router;
  } else {
    tmpUrl = document.getElementById('settingsCustomUrl').value.trim() || defaults.url;
    tmpKey = document.getElementById('settingsCustomKey').value.trim();
    tmpModel = document.getElementById('settingsCustomRouter').value.trim() || defaults.router;
  }

  try {
    const headers = {'Content-Type': 'application/json'};
    let body;
    if (tmpProvider === 'claude') {
      // Anthropic uses x-api-key header and different body format
      headers['x-api-key'] = tmpKey;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
      body = JSON.stringify({ model: tmpModel, messages: [{role:'user',content:'hi'}], max_tokens: 5 });
    } else {
      if (tmpKey) headers['Authorization'] = `Bearer ${tmpKey}`;
      body = JSON.stringify({ model: tmpModel, messages: [{role:'user',content:'hi'}], max_tokens: 5 });
    }
    const res = await fetch(tmpUrl, { method: 'POST', headers, body });
    if (res.ok) {
      statusEl.textContent = `Connected to ${defaults.label} (${tmpModel})`;
      statusEl.className = 'settings-status ok';
    } else {
      const e = await res.text();
      statusEl.textContent = `Error ${res.status}: ${e.slice(0,100)}`;
      statusEl.className = 'settings-status err';
    }
  } catch(e) {
    statusEl.textContent = `Connection failed: ${e.message}`;
    statusEl.className = 'settings-status err';
  }
}

// ═══════════════════════════════════════════
// WELCOME SCREEN
// ═══════════════════════════════════════════
let welcomeProvider = 'groq';

function showMobileForm(){
  const box=document.getElementById('welcomeBox');
  if(box) box.classList.add('mobile-form-active');
}

function toggleWelcomeProviders(){
  const configPanel=document.getElementById('wbConfigPanel');
  const btn=document.getElementById('wbConnectBtn');
  const isOpen=configPanel.classList.contains('active');
  if(!isOpen){
    configPanel.classList.add('active');
    btn.textContent='Configuring...';
    btn.style.opacity='0.6';
    // Build provider grid dynamically
    const grid=document.getElementById('welcomeProviderGrid');
    grid.innerHTML=Object.entries(LLM_DEFAULTS).map(([key,def])=>
      `<div class="wb-pgrid-item${key===welcomeProvider?' active':''}" data-provider="${key}" onclick="window.setWelcomeProvider('${key}')">
        <div class="wpg-dot" style="background:${def.color}"></div>
        <div class="wpg-name">${def.label}</div>
        <div class="wpg-desc">${def.desc}</div>
      </div>`
    ).join('');
  }else{
    configPanel.classList.remove('active');
    btn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4m-7-11H1m22 0h-4m-2.3-6.7-2.8 2.8m-5.8 5.8-2.8 2.8m0-11.4 2.8 2.8m5.8 5.8 2.8 2.8"/><circle cx="12" cy="12" r="3"/></svg> Connect your LLM to get started';
    btn.style.opacity='';
  }
}

function confirmWelcomeProvider(){
  // Validate the selected provider fields
  const isCloud=CLOUD_PROVIDERS.includes(welcomeProvider);
  if(isCloud){
    const key=document.getElementById('welcomeApiKey').value.trim();
    if(!key){
      const input=document.getElementById('welcomeApiKey');
      const def=LLM_DEFAULTS[welcomeProvider];
      input.style.border='2px solid #e74c3c';
      input.placeholder=`API Key required — get at ${def.keyUrl}`;
      input.focus();
      input.addEventListener('input',()=>{input.style.border='';},{once:true});
      return;
    }
  }else if(welcomeProvider==='ollama'){
    const statusEl=document.getElementById('ollamaDetectStatus');
    if(!statusEl||!statusEl.classList.contains('ok')){
      window.detectOllama();
      return;
    }
  }else if(welcomeProvider==='custom'){
    const url=document.getElementById('welcomeCustomUrl').value.trim();
    if(!url){
      document.getElementById('welcomeCustomUrl').style.border='2px solid #e74c3c';
      document.getElementById('welcomeCustomUrl').focus();
      return;
    }
  }
  // Close config panel, update button to Connected
  const configPanel=document.getElementById('wbConfigPanel');
  configPanel.classList.remove('active');
  const btn=document.getElementById('wbConnectBtn');
  const def=LLM_DEFAULTS[welcomeProvider]||{};
  btn.innerHTML=`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${def.color||'#8B9E8B'};margin-right:6px;"></span> Connected to ${def.label||welcomeProvider}`;
  btn.style.opacity='';
  btn.style.color='#fff';
  btn.style.borderColor=def.color||'#8B9E8B';
  btn.classList.add('connected');
  // Mark that provider panel was "opened" so finishWelcome won't re-prompt
  btn._providerConfirmed=true;
}

function setWelcomeProvider(p) {
  welcomeProvider = p;
  const def=LLM_DEFAULTS[p];
  document.querySelectorAll('#welcomeProviderGrid .wb-pgrid-item').forEach(c => {
    c.classList.toggle('active', c.dataset.provider === p);
  });
  // Show/hide appropriate fields
  const isCloud=CLOUD_PROVIDERS.includes(p);
  const isOllama=p==='ollama';
  const isCustom=p==='custom';
  document.getElementById('welcomeKeyFields').style.display=isCloud?'':'none';
  document.getElementById('welcomeOllamaFields').style.display=isOllama?'':'none';
  document.getElementById('welcomeCustomFields').style.display=isCustom?'':'none';
  if(isCloud){
    document.getElementById('welcomeKeyLabel').textContent=`${def.label} API Key (get at ${def.keyUrl})`;
    document.getElementById('welcomeApiKey').placeholder=def.keyPrefix+'...';
    document.getElementById('welcomeApiKey').value='';
  }
}

function finishWelcome() {
  // If provider was never confirmed, prompt user to connect LLM first
  const btn=document.getElementById('wbConnectBtn');
  if(!btn._providerConfirmed && !window.isConfigured()){
    btn.style.animation='none';
    btn.offsetHeight;
    btn.style.animation='pulse-warn 0.5s ease 3';
    toggleWelcomeProviders();
    return;
  }
  // If already configured (returning user), read values from current config
  const isCloud=CLOUD_PROVIDERS.includes(welcomeProvider);

  const defaults = LLM_DEFAULTS[welcomeProvider];
  S.llmConfig.provider = welcomeProvider;
  S.llmConfig.displayName = document.getElementById('welcomeDisplayName').value.trim();

  if (isCloud) {
    S.llmConfig.apiKey = document.getElementById('welcomeApiKey').value.trim();
    S.llmConfig.url = defaults.url;
    S.llmConfig.model = defaults.model;
    S.llmConfig.router = defaults.router;
  } else if (welcomeProvider === 'ollama') {
    S.llmConfig.url = document.getElementById('welcomeOllamaUrl').value.trim() || defaults.url;
    S.llmConfig.model = document.getElementById('welcomeOllamaModel').value.trim() || defaults.model;
    S.llmConfig.router = defaults.router;
    S.llmConfig.apiKey = '';
  } else if (welcomeProvider === 'custom') {
    S.llmConfig.url = document.getElementById('welcomeCustomUrl').value.trim();
    S.llmConfig.apiKey = document.getElementById('welcomeCustomKey').value.trim();
    S.llmConfig.model = document.getElementById('welcomeCustomModel').value.trim() || 'gpt-4o';
    S.llmConfig.router = document.getElementById('welcomeCustomRouter').value.trim() || S.llmConfig.model;
  }

  // For cloud providers, show cost confirmation before saving (skip if already accepted)
  if(isCloud && !localStorage.getItem('sloth_api_warning_accepted')){
    showApiCostConfirm(function(){
      localStorage.setItem('sloth_api_warning_accepted','1');
      _commitWelcomeConfig(defaults, isCloud);
    });
    return;
  }
  _commitWelcomeConfig(defaults, isCloud);
}

function _commitWelcomeConfig(defaults, isCloud){
  window.saveConfig();
  window.syncConfigToCloud();
  showModePicker();
}

function showApiCostConfirm(onConfirm){
  const providerLabel=LLM_DEFAULTS[welcomeProvider||settingsProvider]?.label||'LLM';
  const overlay=document.createElement('div');
  overlay.className='confirm-overlay';
  overlay.innerHTML=`
    <div class="confirm-box">
      <div class="cb-title">&#9888; API Usage Warning</div>
      <div class="cb-body">
        <p>You are about to connect <b>${providerLabel}</b> with your own API key. Please understand:</p>
        <ul>
          <li>Every AI action (generate, edit, style change) <b>costs real money</b> via API calls</li>
          <li>Costs depend on model, token usage, and frequency of use</li>
          <li>Sloth Space does <b>not</b> monitor or limit your spending</li>
          <li><b style="color:#e74c3c;">Uncapped API keys can lead to unexpected bills</b></li>
        </ul>
        <p>We strongly recommend you set a <b>monthly spending cap</b> on your provider's billing dashboard before continuing.</p>
      </div>
      <label class="cb-check" id="confirmCheck">
        <input type="checkbox" id="confirmCheckbox">
        <span>I understand that API usage costs real money and I am responsible for setting my own spending limits.</span>
      </label>
      <div class="cb-btns">
        <button class="cb-btn cancel" id="confirmCancel">Cancel</button>
        <button class="cb-btn proceed" id="confirmProceed">Confirm &amp; Continue</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const checkbox=overlay.querySelector('#confirmCheckbox');
  const proceedBtn=overlay.querySelector('#confirmProceed');
  const cancelBtn=overlay.querySelector('#confirmCancel');
  checkbox.addEventListener('change',function(){
    proceedBtn.classList.toggle('enabled',checkbox.checked);
  });
  cancelBtn.addEventListener('click',function(){
    overlay.remove();
  });
  proceedBtn.addEventListener('click',function(){
    if(!checkbox.checked)return;
    overlay.remove();
    if(onConfirm)onConfirm();
  });
}

function showTerms(){
  const o=document.getElementById('tosOverlay');
  o.classList.add('show');
  o.addEventListener('click',function handler(e){
    if(e.target===o){ o.classList.remove('show'); o.removeEventListener('click',handler); }
  });
}

function closeTerms(){
  document.getElementById('tosOverlay').classList.remove('show');
}

async function syncConfigToCloud(){
  if(!window.supabaseClient||!window.currentUser)return;
  try{
    const payload={
      provider:S.llmConfig.provider,
      url:S.llmConfig.url,
      model:S.llmConfig.model,
      router:S.llmConfig.router,
      apiKey:S.llmConfig.apiKey?btoa(S.llmConfig.apiKey):'', // light obfuscation
      displayName:S.llmConfig.displayName
    };
    await window.supabaseClient.auth.updateUser({data:{sloth_config:payload}});
  }catch(e){console.warn('Config sync failed:',e);}
}

function restoreConfigFromCloud(user){
  const cfg=user.user_metadata?.sloth_config;
  if(!cfg||!cfg.provider)return false;
  S.llmConfig.provider=cfg.provider;
  S.llmConfig.url=cfg.url||'';
  S.llmConfig.model=cfg.model||'';
  S.llmConfig.router=cfg.router||'';
  S.llmConfig.apiKey=cfg.apiKey?atob(cfg.apiKey):'';
  S.llmConfig.displayName=cfg.displayName||'';
  window.saveConfig(); // persist to localStorage too
  return true;
}

function skipWelcome() {
  showModePicker();
}

function showModePicker(){
  document.getElementById('welcomeOverlay').classList.add('hidden');
  document.getElementById('modePickerOverlay').classList.remove('hidden');
}

function showWelcomeFromPicker(){
  document.getElementById('modePickerOverlay').classList.add('hidden');
  window.showWelcome();
}

function enterSlides(){
  // Legacy compat — go through mode picker or directly to slides
  document.getElementById('welcomeOverlay').classList.add('hidden');
  sessionStorage.setItem('sloth_active','1');
  enterSlideMode();
}

// ═══════════════════════════════════════════
// MODE MANAGEMENT
// ═══════════════════════════════════════════
// Note: S.currentMode is the main state store

function modeSaveCurrent(){
  // Flush-save whatever mode we're leaving — unified via modeSave()
  if(window.modeSave) window.modeSave();
}

function modeShowUI(mode){
  // Single source of truth for showing/hiding mode-specific panels
  const slideCanvas=document.getElementById('slideCanvas');
  const slideBar=document.querySelector('.slide-bar');
  const nameBar=document.getElementById('modeNameBar');
  const docCanvas=document.getElementById('docCanvas');
  const wsCanvas=document.getElementById('workspaceCanvas');

  // Hide everything first
  if(slideCanvas) slideCanvas.style.display='none';
  if(slideBar) slideBar.style.display='none';
  if(docCanvas) docCanvas.style.display='none';
  if(wsCanvas) wsCanvas.style.display='none';
  // Always restore slide-panel visibility (doc mode hides it)
  const sp=document.querySelector('.slide-panel');
  if(sp) sp.style.display='';

  // Name bar always visible
  if(nameBar) nameBar.style.display='';

  // Also hide sheet canvas
  const sheetCanvas=document.getElementById('sheetCanvas');
  if(sheetCanvas) sheetCanvas.style.display='none';

  // Show mode-specific panels
  if(mode==='slide'){
    // Move name bar back into slide-panel
    const spForName=document.querySelector('.slide-panel');
    if(nameBar&&spForName) spForName.prepend(nameBar);
    if(slideCanvas) slideCanvas.style.display='';
    if(slideBar) slideBar.style.display='';
  } else if(mode==='sheet'){
    let sc=sheetCanvas;
    if(!sc){
      sc=document.createElement('div');
      sc.id='sheetCanvas';
      sc.className='sheet-canvas';
      // Click on canvas padding → deselect
      sc.addEventListener('click',function(ev){
        if(ev.target===sc) window.shClearSelection();
      });
      const middle=document.querySelector('.middle');
      const chatPanel=document.getElementById('chatPanel');
      middle.insertBefore(sc, chatPanel);
    }
    // Move name bar into sheet-canvas
    if(nameBar) sc.prepend(nameBar);
    // Hide slide-panel
    const spSheet=document.querySelector('.slide-panel');
    if(spSheet) spSheet.style.display='none';
    sc.style.display='';
  } else if(mode==='doc'){
    let dc=docCanvas;
    if(!dc){
      dc=document.createElement('div');
      dc.id='docCanvas';
      dc.className='doc-canvas';
      // Click on canvas padding → deselect
      dc.addEventListener('click',function(ev){
        if(ev.target===dc) window.clearSelection();
      });
      // Insert into .middle before chat-panel (NOT inside .slide-panel) to avoid touch-action:none
      const middle=document.querySelector('.middle');
      const chatPanel=document.getElementById('chatPanel');
      middle.insertBefore(dc, chatPanel);
    }
    // Move name bar into doc-canvas (before content)
    if(nameBar) dc.prepend(nameBar);
    // Hide slide-panel entirely
    const spDoc=document.querySelector('.slide-panel');
    if(spDoc) spDoc.style.display='none';
    dc.style.display='';
  } else if(mode==='workspace'){
    let wc=wsCanvas;
    if(!wc){
      wc=document.createElement('div');
      wc.id='workspaceCanvas';
      wc.className='workspace-canvas';
      const middle2=document.querySelector('.middle');
      const chatPanel2=document.getElementById('chatPanel');
      middle2.insertBefore(wc, chatPanel2);
    }
    // Move name bar into workspace-canvas
    if(nameBar) wc.prepend(nameBar);
    const spWs=document.querySelector('.slide-panel');
    if(spWs) spWs.style.display='none';
    wc.style.display='';
  }

  // Move input area into chat panel for workspace mode (chat-app feel)
  const inputArea=document.getElementById('inputArea');
  const chatPanel=document.getElementById('chatPanel');
  const bottomInner=document.querySelector('.bottom-panel-inner');
  if(inputArea && chatPanel && bottomInner){
    if(mode==='workspace'){
      // Move input + img staging into chat panel
      const imgStaging=document.getElementById('imgStaging');
      if(imgStaging) chatPanel.appendChild(imgStaging);
      chatPanel.appendChild(inputArea);
    } else {
      // Restore input back to bottom-panel-inner (imgStaging and inputArea are its children)
      const imgStaging=document.getElementById('imgStaging');
      if(imgStaging) bottomInner.appendChild(imgStaging);
      bottomInner.appendChild(inputArea);
    }
  }
}

function modeEnter(mode){
  // Universal mode entry — call this for all mode switches
  modeSaveCurrent();
  S.currentMode=mode;
  // Set body class for mode-specific CSS (touch-action, layout, etc.)
  document.body.classList.remove('mode-slide','mode-doc','mode-sheet','mode-workspace');
  document.body.classList.add('mode-'+mode);
  document.getElementById('modePickerOverlay').classList.add('hidden');
  sessionStorage.setItem('sloth_active','1');
  sessionStorage.setItem('sloth_mode',mode);
  if(window.saveCurrentMode) window.saveCurrentMode(); // persist to localStorage too
  updateModeBadge(mode);
  modeShowUI(mode);
  updateToolbarForMode(mode);
  // Mode-specific initialization
  if(mode==='slide'){
    updateModeNameBar('slide');
    renderApp();
  } else if(mode==='doc'){
    // Restore doc: memory → localStorage → workspace → new
    if(!S.currentDoc){
      try{
        const saved=localStorage.getItem('sloth_current_doc');
        if(saved){
          const parsed=JSON.parse(saved);
          if(parsed&&parsed.blocks&&parsed.blocks.length) S.currentDoc=parsed;
        }
      }catch(e){}
      if(!S.currentDoc) S.currentDoc=window.docCreateNew('Untitled Document');
    }
    window.docRestoreUndoStacks();
    updateModeNameBar('doc');
    window.docUpdateUndoUI();
    window.renderDocMode();
  } else if(mode==='sheet'){
    // Restore sheet: memory → localStorage → new
    if(!S.sheet.current){
      try{
        const saved=localStorage.getItem('sloth_current_sheet');
        if(saved){
          const parsed=JSON.parse(saved);
          if(parsed&&parsed.columns&&parsed.rows) S.sheet.current=parsed;
        }
      }catch(e){}
      if(!S.sheet.current) S.sheet.current=window.shCreateNew('Untitled Sheet');
    }
    updateModeNameBar('sheet');
    window.renderSheetMode();
  } else if(mode==='workspace'){
    updateModeNameBar('workspace');
    window.renderWorkspaceMode();
  }
}

function pickMode(mode){
  modeEnter(mode);
}

function updateModeBadge(mode){
  const label=document.getElementById('modeBadgeLabel');
  const icon=document.getElementById('modeBadgeIcon');
  if(!label||!icon) return;
  const icons={
    slide:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
    doc:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    sheet:'<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>',
    workspace:'<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'
  };
  label.textContent=mode.charAt(0).toUpperCase()+mode.slice(1);
  icon.innerHTML=icons[mode]||icons.slide;
}

function toggleModeSwitchMenu(e){
  e.stopPropagation();
  const menu=document.getElementById('modeSwitchMenu');
  if(!menu) return;
  if(menu.style.display!=='none'){ menu.style.display='none'; return; }
  const modes=[
    {id:'slide',label:'Slide',color:'#7886A5',icon:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>'},
    {id:'doc',label:'Doc',color:'#6B8E7B',icon:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'},
    {id:'sheet',label:'Sheet',color:'#A08060',icon:'<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/>'},
    {id:'workspace',label:'Workspace',color:'#8B7BA8',icon:'<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'}
  ];
  menu.innerHTML=modes.map(m=>{
    const isCurrent=m.id===S.currentMode;
    return `<div class="mode-switch-item${isCurrent?' current':''}" onclick="event.stopPropagation();window.switchToMode('${m.id}')">
      <div class="msi-icon" style="background:${m.color}30;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${m.color}" stroke-width="2">${m.icon}</svg></div>
      <span>${m.label}</span>${isCurrent?'<span style="margin-left:auto;font-size:9px;opacity:0.5;">current</span>':''}
    </div>`;
  }).join('');
  menu.style.display='block';
  // Close on outside click
  setTimeout(()=>{
    document.addEventListener('click',function _close(){ menu.style.display='none'; document.removeEventListener('click',_close); },{once:true});
  },10);
}

function switchToMode(mode){
  document.getElementById('modeSwitchMenu').style.display='none';
  if(mode===S.currentMode) return;
  modeEnter(mode);
}

function updateModeNameBar(mode){
  const nameInput=document.getElementById('deckNameInput');
  if(!nameInput) return;
  if(mode==='slide'){
    nameInput.placeholder='Untitled Presentation';
    nameInput.value=S.currentDeck?.title||'';
    nameInput.oninput=function(){ if(S.currentDeck){ S.currentDeck.title=this.value.trim()||'Untitled'; window.autoSave(); }};
  } else if(mode==='doc'){
    nameInput.placeholder='Untitled Document';
    nameInput.value=S.currentDoc?.title||'';
    nameInput.oninput=function(){ if(S.currentDoc){ S.currentDoc.title=this.value; S.currentDoc.updated=new Date().toISOString(); window.docAutoSave(); }};
  } else if(mode==='sheet'){
    nameInput.placeholder='Untitled Sheet';
    nameInput.value=S.sheet.current?.title||'';
    nameInput.oninput=function(){ if(S.sheet.current){ S.sheet.current.title=this.value.trim()||'Untitled Sheet'; S.sheet.current.updated=new Date().toISOString(); try{ localStorage.setItem('sloth_current_sheet',JSON.stringify(S.sheet.current)); }catch(e){} }};
  } else if(mode==='workspace'){
    nameInput.placeholder='Workspace';
    nameInput.value='Workspace';
    nameInput.oninput=null;
  }
}

function modeNew(){
  if(S.currentMode==='slide'){
    window.newDeck();
  } else if(S.currentMode==='doc'){
    window.docNewDocument();
  } else if(S.currentMode==='workspace'){
    // In workspace, open new slide deck by default
    window.newDeck();
    switchToMode('slide');
  }
}

function modeImport(){
  if(S.currentMode==='slide'){
    window.loadDeck();
  } else if(S.currentMode==='doc'){
    window.docImport();
  } else if(S.currentMode==='workspace'){
    window.loadDeck();
  }
}

function modeSaveCloud(){
  if(S.currentMode==='slide'){
    window.saveCurrentToCloud();
  } else if(S.currentMode==='doc'){
    window.docSaveToCloud();
  } else {
    window.addMessage('Select a doc or slide to save to cloud.','system');
  }
}

// ═══════════════════════════════════════════
// MODE DISPATCHERS — Toolbar commands
// ═══════════════════════════════════════════
function toggleChatPanel(){
  const panel=document.getElementById('chatPanel');
  if(!panel) return;
  panel.classList.toggle('collapsed');
  const icon=document.getElementById('chatToggleIcon');
  if(icon) icon.textContent=panel.classList.contains('collapsed')?'▲':'▼';
}

function updateToolbarForMode(mode){
  const toolbar=document.getElementById('unifiedToolbar');
  if(!toolbar) return;
  // Show toolbar for slide and doc modes, hide for workspace
  if(mode==='workspace'){
    toolbar.style.display='none';
  } else {
    toolbar.style.display='flex';
  }
  // Toggle mode-specific groups
  toolbar.querySelectorAll('.tb-slide-only').forEach(el=>{
    el.style.display=(mode==='slide')?'':'none';
  });
  toolbar.querySelectorAll('.tb-doc-only').forEach(el=>{
    el.style.display=(mode==='doc')?'':'none';
  });
  toolbar.querySelectorAll('.tb-sheet-only').forEach(el=>{
    el.style.display=(mode==='sheet')?'':'none';
  });
  // Update undo/redo button state for current mode
  modeUpdateUndoUI();
  // Update topbar elements (preset pills, export buttons)
  updateTopbarForMode(mode);
}

const MODE_EXPORTS={
  slide:[
    {label:'Export .sloth', action:'window.saveSloth()'},
    {label:'Export .pptx', action:'window.exportPPTX()'},
    {label:'Export PDF', action:'modeExportPDF()'}
  ],
  doc:[
    {label:'Export .sloth', action:'window.saveSloth()'},
    {label:'Export .docx', action:'modeExportDocx()'},
    {label:'Export PDF', action:'modeExportPDF()'}
  ],
  sheet:[
    {label:'Export .sloth', action:'window.saveSloth()'},
    {label:'Export .xlsx', action:'modeExportXlsx()'},
    {label:'Export PDF', action:'modeExportPDF()'}
  ],
  workspace:[]
};

function updateTopbarForMode(mode){
  // Preset pills: only for slide mode
  const pills=document.getElementById('presetPills');
  if(pills) pills.style.display=(mode==='slide')?'flex':'none';

  // Export buttons: mode-specific
  const exArea=document.getElementById('topbarExports');
  if(!exArea) return;
  const exports=MODE_EXPORTS[mode]||[];
  exArea.innerHTML=exports.map(e=>
    `<button class="export-btn" onclick="${e.action}">${e.label}</button>`
  ).join('');

  // Project badge in topbar: show for editing modes (slide/doc/sheet), hide for workspace
  let projArea=document.getElementById('topbarProjectArea');
  if(!projArea){
    // Create the project area in topbar-left after mode badge
    const topLeft=document.querySelector('.topbar-left');
    if(topLeft){
      projArea=document.createElement('div');
      projArea.id='topbarProjectArea';
      projArea.style.cssText='display:inline-flex;align-items:center;gap:4px;margin-left:4px;';
      topLeft.appendChild(projArea);
    }
  }
  if(projArea){
    if(mode==='workspace'||!window.wsRenderTopbarProjectInfo){
      projArea.style.display='none';
      projArea.innerHTML='';
    } else {
      projArea.style.display='inline-flex';
      projArea.innerHTML=window.wsRenderTopbarProjectInfo();
    }
  }
}

function modeExportPDF(){
  if(S.currentMode==='slide') window.exportSlidePDF();
  else if(S.currentMode==='doc') window.exportDocPDF();
  else window.addMessage('PDF export not available for this mode yet.','system');
}

function modeExportDocx(){
  window.exportDocDocx();
}

function modeExportXlsx(){
  window.addMessage('Sheet export coming soon!','system');
}

function modeUndo(){
  if(S.currentMode==='doc'){
    window.docFlushEditing();
    window.docUndo();
  } else if(S.currentMode==='sheet'){
    window.shUndo();
  } else { window.undo(); }
}

function modeRedo(){
  if(S.currentMode==='doc') window.docRedo();
  else if(S.currentMode==='sheet') window.shRedo();
  else window.redo();
}

function modeExecCmd(cmd){
  if(S.currentMode==='doc'){
    window.docExecCmd(cmd);
  } else if(S.currentMode==='sheet'&&S.sheet.editingCell){
    // Sheet cell editing: apply formatting via execCommand on contentEditable cell
    const cellEl=document.querySelector(`.sh-cell[data-row-id="${S.sheet.editingCell.rowId}"][data-col-id="${S.sheet.editingCell.colId}"]`);
    if(cellEl){ cellEl.focus(); document.execCommand(cmd); }
  } else if(window.isInlineEditing()){
    // Slide inline edit: apply formatting directly via execCommand
    document.execCommand(cmd);
  } else {
    // Slide mode (not inline editing): insert tag into chat input
    window.insertTag(`[${cmd}]`);
  }
}

function modeToolbarFont(font){
  if(S.currentMode==='doc'){
    window.docToolbarFont(font);
  } else {
    window.insertTag(`[font: ${font}]`);
  }
}

function modeToolbarFontSize(size){
  if(S.currentMode==='doc'){
    window.docToolbarFontSize(size);
  } else {
    window.insertTag(`[size: ${size}]`);
  }
}

function modeToolbarTextColor(color){
  if(S.currentMode==='doc'){
    window.docToolbarTextColor(color);
  } else {
    window.insertTextColor(color);
  }
}

function modeToolbarBgColor(color){
  if(S.currentMode==='doc'){
    window.docToolbarBgColor(color);
  } else {
    window.insertBgColor(color);
  }
}

function modeUpdateUndoUI(){
  if(S.currentMode==='doc'){
    window.docUpdateUndoUI();
  } else if(S.currentMode==='sheet'){
    window.shUpdateUndoUI();
  } else {
    window.updateUndoRedoUI();
  }
}

// ═══════════════════════════════════════════
// MODE ENTRY POINTS
// ═══════════════════════════════════════════
function enterSlideMode(){
  modeEnter('slide');
}

function enterDocMode(){
  modeEnter('doc');
}

// ═══════════════════════════════════════════
// WELCOME AND SETUP CHECKS
// ═══════════════════════════════════════════
function checkWelcomeScreen() {
  const hasConfig = window.loadConfig();
  // Restore sessionStorage from localStorage backup (survives tab close)
  // Must happen here BEFORE the check, since autoLoad runs after this
  if(hasConfig && !sessionStorage.getItem('sloth_active')){
    const lastMode=localStorage.getItem('sloth_last_mode');
    if(lastMode){
      sessionStorage.setItem('sloth_mode',lastMode);
      sessionStorage.setItem('sloth_active','1');
    }
  }
  // Only skip welcome if user was actively working (refresh or restored), not fresh setup
  if (hasConfig && window.isConfigured() && sessionStorage.getItem('sloth_active')) {
    const savedMode=sessionStorage.getItem('sloth_mode')||'slide';
    if(savedMode==='workspace'){ window.enterWorkspaceMode(); }
    else { pickMode(savedMode); }
  }
  // Otherwise welcome/demo stays visible
}

function getOS(){
  const ua=navigator.userAgent;
  if(ua.includes('Mac'))return 'mac';
  if(ua.includes('Win'))return 'win';
  return 'linux';
}

function initOllamaGuide(){
  const os=getOS();
  const guide=document.getElementById('ollamaGuide');
  if(!guide)return;

  const osNames={mac:'macOS',win:'Windows',linux:'Linux'};
  let html=`<span class="og-os-badge">${osNames[os]} detected</span>`;
  html+='<div class="og-steps">';

  if(os==='mac'){
    // ── macOS ──
    html+=`<div class="og-card">
      <div class="og-card-head"><span class="og-num">1</span><span class="og-title">Download &amp; Install Ollama</span></div>
      <div class="og-desc">Click below to download the <b>.dmg</b> file. Open it and drag Ollama into Applications. <br><b>Do NOT use <code>brew install</code> or <code>curl</code></b> — those versions have known bugs on Mac.</div>
      <a href="https://ollama.com/download/mac" target="_blank" class="og-link-btn">Download Ollama for Mac</a>
    </div>`;

    html+=`<div class="og-card">
      <div class="og-card-head"><span class="og-num">2</span><span class="og-title">Open Ollama App</span></div>
      <div class="og-desc">Open <b>Ollama</b> from Applications (or Spotlight search "Ollama"). You'll see a llama icon appear in your menu bar — that means it's running.</div>
    </div>`;

    html+=`<div class="og-card">
      <div class="og-card-head"><span class="og-num">3</span><span class="og-title">Download a Model</span></div>
      <div class="og-desc">Open <b>Terminal</b> (Spotlight → "Terminal") and paste this command. It will download ~4.7GB:</div>
      <div class="og-cmd"><span id="ogCmd1">ollama pull llama3.1:8b</span><button class="og-copy" onclick="window.copyCmd('ogCmd1')">Copy</button></div>
      <div class="og-warn">If you see "failed to load MLX" — this is safe to ignore, it's a known warning that doesn't affect text models.</div>
    </div>`;

    html+=`<div class="og-card">
      <div class="og-card-head"><span class="og-num">4</span><span class="og-title">Allow Browser Access (CORS)</span></div>
      <div class="og-desc">Paste this in Terminal so our web app can talk to Ollama, then <b>quit and reopen Ollama app</b>:</div>
      <div class="og-cmd"><span id="ogCmd2">launchctl setenv OLLAMA_ORIGINS "*"</span><button class="og-copy" onclick="window.copyCmd('ogCmd2')">Copy</button></div>
      <div class="og-warn">After running this, right-click the llama icon in menu bar → Quit, then reopen Ollama from Applications.</div>
    </div>`;

  } else if(os==='win'){
    // ── Windows ──
    html+=`<div class="og-card">
      <div class="og-card-head"><span class="og-num">1</span><span class="og-title">Download &amp; Install Ollama</span></div>
      <div class="og-desc">Click below to download the installer. Run it and follow the prompts — it takes about 1 minute.</div>
      <a href="https://ollama.com/download/windows" target="_blank" class="og-link-btn">Download Ollama for Windows</a>
    </div>`;

    html+=`<div class="og-card">
      <div class="og-card-head"><span class="og-num">2</span><span class="og-title">Download a Model</span></div>
      <div class="og-desc">Open <b>Command Prompt</b> (Win+R → type "cmd" → Enter) and paste this. It will download ~4.7GB:</div>
      <div class="og-cmd"><span id="ogCmd1">ollama pull llama3.1:8b</span><button class="og-copy" onclick="window.copyCmd('ogCmd1')">Copy</button></div>
    </div>`;

    html+=`<div class="og-card">
      <div class="og-card-head"><span class="og-num">3</span><span class="og-title">Allow Browser Access &amp; Start</span></div>
      <div class="og-desc">In the same Command Prompt, paste this to start Ollama with browser access enabled:</div>
      <div class="og-cmd"><span id="ogCmd2">set OLLAMA_ORIGINS=* && ollama serve</span><button class="og-copy" onclick="window.copyCmd('ogCmd2')">Copy</button></div>
      <div class="og-warn">Keep this window open while using Sloth Space. If you see "listening on 127.0.0.1:11434" — it's working!</div>
    </div>`;

  } else {
    // ── Linux ──
    html+=`<div class="og-card">
      <div class="og-card-head"><span class="og-num">1</span><span class="og-title">Install Ollama</span></div>
      <div class="og-desc">Open a terminal and paste this one-liner:</div>
      <div class="og-cmd"><span id="ogCmd1">curl -fsSL https://ollama.com/install.sh | sh</span><button class="og-copy" onclick="window.copyCmd('ogCmd1')">Copy</button></div>
    </div>`;

    html+=`<div class="og-card">
      <div class="og-card-head"><span class="og-num">2</span><span class="og-title">Download a Model</span></div>
      <div class="og-desc">This downloads ~4.7GB to your machine:</div>
      <div class="og-cmd"><span id="ogCmd2">ollama pull llama3.1:8b</span><button class="og-copy" onclick="window.copyCmd('ogCmd2')">Copy</button></div>
    </div>`;

    html+=`<div class="og-card">
      <div class="og-card-head"><span class="og-num">3</span><span class="og-title">Start with Browser Access</span></div>
      <div class="og-desc">Run Ollama with CORS enabled so our web app can connect:</div>
      <div class="og-cmd"><span id="ogCmd3">OLLAMA_ORIGINS="*" ollama serve</span><button class="og-copy" onclick="window.copyCmd('ogCmd3')">Copy</button></div>
      <div class="og-warn">Keep this terminal open while using Sloth Space. If you see "listening on 127.0.0.1:11434" — it's working!</div>
    </div>`;
  }

  html+='</div>'; // close og-steps

  // Detect button
  html+=`<div class="og-bottom"><button class="og-detect-btn" onclick="window.detectOllama()">Detect Ollama</button><div id="ollamaDetectStatus" class="og-status" style="display:none;"></div></div>`;

  guide.innerHTML=html;
}

function copyCmd(id){
  const el=document.getElementById(id);
  if(!el)return;
  navigator.clipboard.writeText(el.textContent).then(()=>{
    const btn=el.parentElement.querySelector('.og-copy');
    if(btn){btn.textContent='Copied!';setTimeout(()=>{btn.textContent='Copy';},1500);}
  });
}

async function detectOllama(){
  const statusEl=document.getElementById('ollamaDetectStatus');
  statusEl.style.display='block';
  statusEl.className='og-status checking';
  statusEl.textContent='Detecting...';

  const url=(document.getElementById('welcomeOllamaUrl')?.value||'http://localhost:11434').trim();

  try{
    const res=await fetch(url+'/api/tags',{signal:AbortSignal.timeout(3000)});
    if(!res.ok)throw new Error('Not reachable');
    const data=await res.json();
    const models=(data.models||[]).map(m=>m.name);

    if(models.length===0){
      statusEl.className='og-status err';
      const pullStep=getOS()==='mac'?'step 3':'step 2';
      statusEl.innerHTML=`Ollama is running but no models found. Run <b>${pullStep}</b> above to download a model.`;
    }else{
      statusEl.className='og-status ok';
      statusEl.textContent='Connected! Found: '+models.slice(0,3).join(', ');
      const modelInput=document.getElementById('welcomeOllamaModel');
      if(modelInput&&(!modelInput.value||modelInput.value==='llama3.1:8b')){
        modelInput.value=models[0];
      }
    }
  }catch(e){
    statusEl.className='og-status err';
    const os=getOS();
    if(os==='mac'){
      statusEl.innerHTML='Not detected. Make sure Ollama app is <b>open</b> (look for llama icon in menu bar). If you just ran the CORS command, quit and reopen Ollama.';
    }else if(os==='win'){
      statusEl.innerHTML='Not detected. Open Command Prompt and run: <code>set OLLAMA_ORIGINS=* && ollama serve</code>';
    }else if(e.message.includes('Failed to fetch')||e.message.includes('NetworkError')){
      statusEl.innerHTML='Cannot reach Ollama. Make sure <code>ollama serve</code> is running in a terminal with CORS enabled.';
    }else{
      statusEl.textContent='Not detected at '+url+'. Is Ollama installed and running?';
    }
  }
}

// ═══════════════════════════════════════════
// FILE NAVIGATION AND CLOUD STORAGE
// ═══════════════════════════════════════════
let currentProduct='slides';

function switchProduct(product){
  currentProduct=product;
  // Update tab buttons
  document.querySelectorAll('.product-tab').forEach(t=>{
    t.classList.toggle('active',t.dataset.product===product);
  });
  // Show/hide slides UI
  const isSlides=product==='slides';
  document.querySelectorAll('.slides-ui').forEach(el=>{
    el.style.display=isSlides?'':'none';
  });
  // Show/hide placeholder
  const ph=document.getElementById('productPlaceholder');
  ph.style.display=isSlides?'none':'flex';
  // Update placeholder text
  const names={docs:'Sloth Docs',sheets:'Sloth Sheets'};
  document.getElementById('placeholderTitle').textContent=names[product]||'';
  // Re-render slides if switching back
  if(isSlides)renderApp();
}

let fileNavSource='cloud';
let fileSelectMode=false;
let fileSelectedIds=new Set();
let _allFilesCached=[];
const CLOUD_BUCKET='decks'; // Supabase Storage bucket name

function getStoragePref(){ return localStorage.getItem('sloth_storage_pref')||'cloud'; }
function setStoragePref(pref){
  localStorage.setItem('sloth_storage_pref',pref);
  document.getElementById('prefCloud')?.classList.toggle('active',pref==='cloud');
  document.getElementById('prefLocal')?.classList.toggle('active',pref==='local');
}

function openFileNav(){
  // Set source tab order based on storage pref
  const pref=getStoragePref();
  fileNavSource=pref;
  const tabs=document.getElementById('fnSourceTabs');
  if(tabs){
    const order=pref==='local'?['local','cloud','all']:['cloud','local','all'];
    tabs.innerHTML=order.map(s=>
      `<button class="fn-src-tab${s===fileNavSource?' active':''}" data-src="${s}" onclick="setFileSource('${s}')">${s.charAt(0).toUpperCase()+s.slice(1)}</button>`
    ).join('');
  }
  document.getElementById('fileNav').classList.add('open');
  document.getElementById('fileNavOverlay').classList.add('open');
  // Exit select mode on reopen
  if(fileSelectMode) toggleFileSelect();
  window.refreshFileList();
}

function closeFileNav(){
  document.getElementById('fileNav').classList.remove('open');
  document.getElementById('fileNavOverlay').classList.remove('open');
}

function setFileSource(src){
  fileNavSource=src;
  document.querySelectorAll('.fn-src-tab').forEach(t=>t.classList.toggle('active',t.dataset.src===src));
  window.refreshFileList();
}

function applyFileFilters(){
  _renderFilteredFiles();
}

function toggleFileSelect(){
  fileSelectMode=!fileSelectMode;
  fileSelectedIds.clear();
  const nav=document.getElementById('fileNav');
  const btn=document.getElementById('fnSelectToggle');
  const bar=document.getElementById('fnSelectBar');
  nav.classList.toggle('selecting',fileSelectMode);
  btn.classList.toggle('active',fileSelectMode);
  btn.textContent=fileSelectMode?'Cancel':'Select';
  bar.style.display=fileSelectMode?'flex':'none';
  _updateSelectCount();
  // Re-render to show/hide checkboxes
  _renderFilteredFiles();
}

function _updateSelectCount(){
  const el=document.getElementById('fnSelectCount');
  if(el) el.textContent=fileSelectedIds.size+' selected';
}

function _toggleFileItem(id,ev){
  ev.stopPropagation();
  if(fileSelectedIds.has(id)) fileSelectedIds.delete(id); else fileSelectedIds.add(id);
  _updateSelectCount();
  // Toggle visual
  const item=document.querySelector(`.fn-item[data-fid="${id}"]`);
  if(item) item.classList.toggle('selected',fileSelectedIds.has(id));
}

async function fnCopySelected(){
  if(fileSelectedIds.size===0) return;
  if(!S.supabaseClient||!S.currentUser){
    window.addMessage('Sign in to sync files to cloud.','system');
    toggleFileSelect();
    return;
  }
  // Force a full workspace → cloud sync
  if(window.syncWorkspaceToCloud){
    await window.syncWorkspaceToCloud();
    window.addMessage(`☁️ Synced ${fileSelectedIds.size} file(s) to cloud.`,'system');
  }
  toggleFileSelect();
  window.refreshFileList();
}

async function fnDeleteSelected(){
  if(fileSelectedIds.size===0)return;
  if(!confirm(`Delete ${fileSelectedIds.size} file(s)?`))return;
  for(const fid of fileSelectedIds){
    const f=_allFilesCached.find(x=>x.id===fid);
    if(!f)continue;
    const deleteId=f.wsId||f.key||f.path||'';
    await window.deleteFileFromNav(f.id,f.source,deleteId);
  }
  fileSelectedIds.clear();
  toggleFileSelect();
  window.refreshFileList();
}

function fnImportImages(){
  // Trigger the existing image import — create a temp file input
  const inp=document.createElement('input');
  inp.type='file'; inp.accept='image/*'; inp.multiple=true;
  inp.onchange=()=>{
    if(inp.files.length) window.handleImageFiles(inp.files);
    closeFileNav();
  };
  inp.click();
}

function getLocalFiles(){
  try{
    const saves=JSON.parse(localStorage.getItem('sloth_space_saves')||'{}');
    return Object.entries(saves).map(([key,val])=>{
      try{
        const data=JSON.parse(val);
        const deck=data.deck||{};
        return {
          id:'local_'+key,
          title:deck.title||key.replace(/_/g,' '),
          slides:deck.slides?.length||0,
          preset:data.preset||'clean-white',
          source:'local',
          key:key,
          updated:data.savedAt?new Date(data.savedAt).getTime():(parseInt(key.split('_').pop())||Date.now()),
          data:data
        };
      }catch(e){return null;}
    }).filter(Boolean).sort((a,b)=>b.updated-a.updated);
  }catch(e){return [];}
}

async function getCloudFiles(){
  if(!window.supabaseClient||!window.currentUser)return [];
  try{
    const userId=window.currentUser.id;
    const{data,error}=await window.supabaseClient.storage.from(CLOUD_BUCKET).list(userId,{limit:50,sortBy:{column:'updated_at',order:'desc'}});
    if(error)throw error;
    return (data||[]).filter(f=>f.name.endsWith('.json')).map(f=>({
      id:'cloud_'+f.name,
      title:f.name.replace('.json','').replace(/_/g,' '),
      source:'cloud',
      path:userId+'/'+f.name,
      updated:new Date(f.updated_at||f.created_at).getTime(),
      size:f.metadata?.size||0
    }));
  }catch(e){
    console.warn('Cloud list error:',e);
    return [];
  }
}

async function refreshFileList(){
  const list=document.getElementById('fileNavList');
  list.innerHTML='<div class="fn-empty">Loading...</div>';

  let files=[];

  // Workspace docs & sheets (stored locally, auto-synced to cloud when logged in)
  const wsFiles=window.wsListFiles?window.wsListFiles():[];
  const isLoggedIn=!!(S.supabaseClient&&S.currentUser);
  for(const wf of wsFiles){
    files.push({
      id:'ws_'+wf.id,
      wsId:wf.id,
      title:wf.title,
      type:wf.type,
      source: isLoggedIn ? 'cloud' : 'local',
      updated:new Date(wf.updated).getTime(),
      meta: wf.type==='doc'? `${(wf.content.blocks||[]).length} blocks` :
            wf.type==='sheet'? `${(wf.content.rows||[]).length} rows` : ''
    });
  }

  // Local slides
  const localSlides=getLocalFiles().map(f=>({...f,type:'slides'}));
  files.push(...localSlides);

  // Cloud files
  const cloud=await getCloudFiles();
  files.push(...cloud.map(f=>({...f,type:'slides'})));

  // Build project list from all files
  _buildProjectSelect(files);

  // Cache all files
  _allFilesCached=files;

  // Render with current filters
  _renderFilteredFiles();
}

function _buildProjectSelect(files){
  // For now, projects are not yet implemented — just show "All Projects"
  const sel=document.getElementById('fnProjectSelect');
  if(!sel)return;
  sel.innerHTML='<option value="all">All Projects</option>';
}

function _renderFilteredFiles(){
  const list=document.getElementById('fileNavList');
  if(!list)return;

  // Get active type filters
  const typeChecks=document.querySelectorAll('.fn-type-chk input');
  const activeTypes=new Set();
  typeChecks.forEach(c=>{ if(c.checked) activeTypes.add(c.dataset.type); });

  // Filter by source
  let files=_allFilesCached.filter(f=>{
    if(fileNavSource!=='all'&&f.source!==fileNavSource)return false;
    // Map type for filter matching
    const t=f.type==='slides'?'slides':f.type;
    if(!activeTypes.has(t))return false;
    return true;
  });

  // Sort by updated descending
  files.sort((a,b)=>b.updated-a.updated);

  if(files.length===0){
    list.innerHTML='<div class="fn-empty">No files found.</div>';
    return;
  }

  list.innerHTML=files.map(f=>{
    const icons={doc:'\u{1F4C4}',sheet:'\u{1F4CA}',slides:'\u{1F4C5}'};
    const icon=icons[f.type]||'\u{1F4C4}';
    const sourceBadge=f.source==='cloud'?'<span class="fn-cloud-badge">cloud</span>':'<span class="fn-local-badge">local</span>';
    const typeBadge=`<span class="fn-type-badge fn-type-${f.type}">${f.type}</span>`;
    const date=new Date(f.updated);
    const timeStr=date.toLocaleDateString()+' '+date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    const metaInfo=f.meta?` · ${f.meta}`:(f.slides?` · ${f.slides} slides`:'');
    const deleteId=f.wsId||f.key||f.path||'';
    const deleteSource=f.source;
    const isSelected=fileSelectedIds.has(f.id);
    return `<div class="fn-item${isSelected?' selected':''}" data-fid="${f.id}" onclick="${fileSelectMode?`window._toggleFileItem('${f.id}',event)`:`window.loadFileFromNav('${f.id}')`}" title="${f.title}">
      <div class="fn-item-check"></div>
      <div class="fn-item-icon">${icon}</div>
      <div class="fn-item-info">
        <div class="fn-item-title">${f.title} ${typeBadge}${sourceBadge}</div>
        <div class="fn-item-meta">${timeStr}${metaInfo}</div>
      </div>
      <div class="fn-item-actions">
        ${f.source==='cloud'?`<button class="fn-item-btn" onclick="event.stopPropagation();window.shareFile('${f.path}')">Share</button>`:''}
        <button class="fn-item-btn danger" onclick="event.stopPropagation();window.deleteFileFromNav('${f.id}','${deleteSource}','${deleteId}')">Del</button>
      </div>
    </div>`;
  }).join('');
}

function loadFileFromNav(id){
  if(id.startsWith('ws_')){
    // Workspace doc/sheet — open it directly (unified with openWorkspaceItem)
    const wsFileId=id.replace('ws_','');
    const file=window.wsGetFile(wsFileId);
    if(!file){window.addMessage('File not found.','system');return;}
    const files=window.wsLoad();
    const idx=files.findIndex(f=>f.id===wsFileId);
    if(idx>=0) window.openWorkspaceItem(idx);
    closeFileNav();
    return;
  }
  if(id.startsWith('local_')){
    const key=id.replace('local_','');
    try{
      const saves=JSON.parse(localStorage.getItem('sloth_space_saves')||'{}');
      const data=JSON.parse(saves[key]);
      if(data.deck){
        S.currentDeck=data.deck;
        S.currentPreset=data.preset||'clean-white';
        S.currentSlide=0;
        S.chatHistory=[];
        document.getElementById('chatMessages').innerHTML='';
        window.addMessage(`✓ Loaded "${S.currentDeck.title||'Untitled'}" (${S.currentDeck.slides.length} slides)`,'system');
        window.autoSave();
        closeFileNav();
        // Switch to slide mode if not already there
        if(S.currentMode!=='slide') modeEnter('slide');
        else renderApp();
      }
    }catch(e){window.addMessage('Failed to load: '+e.message,'system');}
  }else if(id.startsWith('cloud_')){
    window.loadFromCloud(id.replace('cloud_',''));
  }
}


// Export all functions
export {
  renderApp,
  openSettings,
  closeSettings,
  setSettingsProvider,
  updateSettingsProviderUI,
  saveSettings,
  _commitSettings,
  testConnection,
  showMobileForm,
  toggleWelcomeProviders,
  confirmWelcomeProvider,
  setWelcomeProvider,
  finishWelcome,
  _commitWelcomeConfig,
  showApiCostConfirm,
  showTerms,
  closeTerms,
  syncConfigToCloud,
  restoreConfigFromCloud,
  skipWelcome,
  showModePicker,
  showWelcomeFromPicker,
  modeSaveCurrent,
  modeShowUI,
  modeEnter,
  pickMode,
  updateModeBadge,
  toggleModeSwitchMenu,
  switchToMode,
  updateModeNameBar,
  modeNew,
  modeImport,
  modeSaveCloud,
  toggleChatPanel,
  updateToolbarForMode,
  MODE_EXPORTS,
  updateTopbarForMode,
  modeExportPDF,
  modeExportDocx,
  modeExportXlsx,
  modeUndo,
  modeRedo,
  modeExecCmd,
  modeToolbarFont,
  modeToolbarFontSize,
  modeToolbarTextColor,
  modeToolbarBgColor,
  modeUpdateUndoUI,
  enterSlideMode,
  enterDocMode,
  checkWelcomeScreen,
  enterSlides,
  getOS,
  initOllamaGuide,
  detectOllama,
  copyCmd,
  switchProduct,
  openFileNav,
  closeFileNav,
  setFileSource,
  applyFileFilters,
  toggleFileSelect,
  fnCopySelected,
  fnDeleteSelected,
  fnImportImages,
  _toggleFileItem,
  getStoragePref,
  setStoragePref,
  getLocalFiles,
  getCloudFiles,
  refreshFileList,
  loadFileFromNav
};
