/**
 * Welcome Screen & Demo Animation Module
 * Handles Ollama setup guide, welcome slides, typewriter animation, and demo playback
 */

import { llmConfig, LLM_DEFAULTS, loadConfig, saveConfig, isConfigured } from './llm.js';
import { state, PRESETS } from './config.js';
import { syncConfigToCloud } from './auth.js';

// ═══════════════════════════════════════════
// SETTINGS UI
// ═══════════════════════════════════════════

let settingsProvider = 'groq';

export function openSettings() {
  settingsProvider = llmConfig.provider;
  // Build provider cards dynamically
  const cards=document.getElementById('settingsProviderCards');
  cards.innerHTML=Object.entries(LLM_DEFAULTS).map(([key,def])=>
    `<div class="provider-card" data-provider="${key}" onclick="setSettingsProvider('${key}')">
      <div style="width:8px;height:8px;border-radius:50%;background:${def.color};margin:0 auto 4px;"></div>
      <div class="pc-name">${def.label}</div>
      <div class="pc-desc">${def.desc}</div>
    </div>`
  ).join('');
  // Fill fields
  const isCloud=CLOUD_PROVIDERS.includes(settingsProvider);
  if(isCloud){
    document.getElementById('settingsApiKey').value=llmConfig.apiKey||'';
  }
  if(settingsProvider==='ollama'){
    document.getElementById('settingsOllamaUrl').value=llmConfig.url||LLM_DEFAULTS.ollama.url;
    document.getElementById('settingsOllamaModel').value=llmConfig.model||LLM_DEFAULTS.ollama.model;
    document.getElementById('settingsOllamaRouter').value=llmConfig.router||LLM_DEFAULTS.ollama.router;
  }
  if(settingsProvider==='custom'){
    document.getElementById('settingsCustomUrl').value=llmConfig.url||'';
    document.getElementById('settingsCustomKey').value=llmConfig.apiKey||'';
    document.getElementById('settingsCustomModel').value=llmConfig.model||'';
    document.getElementById('settingsCustomRouter').value=llmConfig.router||'';
  }
  document.getElementById('settingsDisplayName').value = llmConfig.displayName || '';
  document.getElementById('settingsTestStatus').className = 'settings-status';
  document.getElementById('settingsTestStatus').style.display = 'none';
  updateSettingsProviderUI();
  document.getElementById('settingsOverlay').classList.add('show');
}

export function closeSettings() {
  document.getElementById('settingsOverlay').classList.remove('show');
}

export function setSettingsProvider(p) {
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

export function saveSettings() {
  const isCloud=CLOUD_PROVIDERS.includes(settingsProvider);
  const newKey=isCloud?document.getElementById('settingsApiKey').value.trim():'';
  const oldKey=llmConfig.apiKey||'';
  // Show confirmation if switching to cloud provider with a new/different API key (skip if already accepted)
  if(isCloud && newKey && newKey!==oldKey && !localStorage.getItem('sloth_api_warning_accepted')){
    showApiCostConfirm(function(){ localStorage.setItem('sloth_api_warning_accepted','1'); _commitSettings(); });
    return;
  }
  _commitSettings();
}

function _commitSettings(){
  const defaults = LLM_DEFAULTS[settingsProvider];
  llmConfig.provider = settingsProvider;
  llmConfig.displayName = document.getElementById('settingsDisplayName').value.trim();

  const isCloud=CLOUD_PROVIDERS.includes(settingsProvider);
  if (isCloud) {
    llmConfig.apiKey = document.getElementById('settingsApiKey').value.trim();
    llmConfig.url = defaults.url;
    llmConfig.model = defaults.model;
    llmConfig.router = defaults.router;
  } else if (settingsProvider === 'ollama') {
    llmConfig.url = document.getElementById('settingsOllamaUrl').value.trim() || defaults.url;
    llmConfig.model = document.getElementById('settingsOllamaModel').value.trim() || defaults.model;
    llmConfig.router = document.getElementById('settingsOllamaRouter').value.trim() || defaults.router;
    llmConfig.apiKey = '';
  } else if (settingsProvider === 'custom') {
    llmConfig.url = document.getElementById('settingsCustomUrl').value.trim() || defaults.url;
    llmConfig.apiKey = document.getElementById('settingsCustomKey').value.trim();
    llmConfig.model = document.getElementById('settingsCustomModel').value.trim() || defaults.model;
    llmConfig.router = document.getElementById('settingsCustomRouter').value.trim() || defaults.router;
  }

  saveConfig();
  syncConfigToCloud();
  closeSettings();
  addMessage(`✓ Settings saved (${LLM_DEFAULTS[settingsProvider]?.label||settingsProvider})`,'system');
}

// ═══════════════════════════════════════════
// WELCOME SCREEN
// ═══════════════════════════════════════════

let welcomeProvider = 'groq';
const CLOUD_PROVIDERS=['groq','openai','claude','grok']; // providers that need API key

export function showMobileForm(){
  const box=document.getElementById('welcomeBox');
  if(box) box.classList.add('mobile-form-active');
}

export function toggleWelcomeProviders(){
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
      `<div class="wb-pgrid-item${key===welcomeProvider?' active':''}" data-provider="${key}" onclick="setWelcomeProvider('${key}')">
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

export function confirmWelcomeProvider(){
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
      detectOllama();
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

export function setWelcomeProvider(p) {
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

export function finishWelcome() {
  // If provider was never confirmed, prompt user to connect LLM first
  const btn=document.getElementById('wbConnectBtn');
  if(!btn._providerConfirmed && !isConfigured()){
    btn.style.animation='none';
    btn.offsetHeight;
    btn.style.animation='pulse-warn 0.5s ease 3';
    toggleWelcomeProviders();
    return;
  }
  // If already configured (returning user), read values from current config
  const isCloud=CLOUD_PROVIDERS.includes(welcomeProvider);

  const defaults = LLM_DEFAULTS[welcomeProvider];
  llmConfig.provider = welcomeProvider;
  llmConfig.displayName = document.getElementById('welcomeDisplayName').value.trim();

  if (isCloud) {
    llmConfig.apiKey = document.getElementById('welcomeApiKey').value.trim();
    llmConfig.url = defaults.url;
    llmConfig.model = defaults.model;
    llmConfig.router = defaults.router;
  } else if (welcomeProvider === 'ollama') {
    llmConfig.url = document.getElementById('welcomeOllamaUrl').value.trim() || defaults.url;
    llmConfig.model = document.getElementById('welcomeOllamaModel').value.trim() || defaults.model;
    llmConfig.router = defaults.router;
    llmConfig.apiKey = '';
  } else if (welcomeProvider === 'custom') {
    llmConfig.url = document.getElementById('welcomeCustomUrl').value.trim();
    llmConfig.apiKey = document.getElementById('welcomeCustomKey').value.trim();
    llmConfig.model = document.getElementById('welcomeCustomModel').value.trim() || 'gpt-4o';
    llmConfig.router = document.getElementById('welcomeCustomRouter').value.trim() || llmConfig.model;
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
  saveConfig();
  syncConfigToCloud();
  enterSlides();
}

// ═══════════════════════════════════════════
// API COST CONFIRMATION DIALOG
// ═══════════════════════════════════════════
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

// ═══════════════════════════════════════════
// TERMS OF SERVICE
// ═══════════════════════════════════════════
export function showTerms(){
  const o=document.getElementById('tosOverlay');
  o.classList.add('show');
  o.addEventListener('click',function handler(e){
    if(e.target===o){ o.classList.remove('show'); o.removeEventListener('click',handler); }
  });
}

export function closeTerms(){
  document.getElementById('tosOverlay').classList.remove('show');
}

// Sync LLM config to Supabase user metadata (encrypted-ish: base64)
export async function syncConfigToCloud(){
  if(!supabaseClient||!currentUser)return;
  try{
    const payload={
      provider:llmConfig.provider,
      url:llmConfig.url,
      model:llmConfig.model,
      router:llmConfig.router,
      apiKey:llmConfig.apiKey?btoa(llmConfig.apiKey):'', // light obfuscation
      displayName:llmConfig.displayName
    };
    await supabaseClient.auth.updateUser({data:{sloth_config:payload}});
  }catch(e){console.warn('Config sync failed:',e);}
}

// Restore config from Supabase user metadata
export function restoreConfigFromCloud(user){
  const cfg=user.user_metadata?.sloth_config;
  if(!cfg||!cfg.provider)return false;
  llmConfig.provider=cfg.provider;
  llmConfig.url=cfg.url||'';
  llmConfig.model=cfg.model||'';
  llmConfig.router=cfg.router||'';
  llmConfig.apiKey=cfg.apiKey?atob(cfg.apiKey):'';
  llmConfig.displayName=cfg.displayName||'';
  saveConfig(); // persist to localStorage too
  return true;
}

export function skipWelcome() {
  enterSlides();
}

export function enterSlides(){
  document.getElementById('welcomeOverlay').classList.add('hidden');
  sessionStorage.setItem('sloth_active','1');
}

export function checkWelcomeScreen() {
  const hasConfig = loadConfig();
  // Only skip welcome if user was actively on slides (refresh), not fresh tab/URL entry
  if (hasConfig && isConfigured() && sessionStorage.getItem('sloth_active')) {
    enterSlides();
  }
  // Otherwise welcome/demo stays visible
}

// ═══════════════════════════════════════════
// OLLAMA SETUP (OS-aware)
// ═══════════════════════════════════════════

export function getOS(){
  const ua=navigator.userAgent;
  if(ua.includes('Mac'))return 'mac';
  if(ua.includes('Win'))return 'win';
  return 'linux';
}

export function initOllamaGuide(){
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
      <div class="og-cmd"><span id="ogCmd1">ollama pull llama3.1:8b</span><button class="og-copy" onclick="copyCmd('ogCmd1')">Copy</button></div>
      <div class="og-warn">If you see "failed to load MLX" — this is safe to ignore, it's a known warning that doesn't affect text models.</div>
    </div>`;

    html+=`<div class="og-card">
      <div class="og-card-head"><span class="og-num">4</span><span class="og-title">Allow Browser Access (CORS)</span></div>
      <div class="og-desc">Paste this in Terminal so our web app can talk to Ollama, then <b>quit and reopen Ollama app</b>:</div>
      <div class="og-cmd"><span id="ogCmd2">launchctl setenv OLLAMA_ORIGINS "*"</span><button class="og-copy" onclick="copyCmd('ogCmd2')">Copy</button></div>
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
      <div class="og-cmd"><span id="ogCmd1">ollama pull llama3.1:8b</span><button class="og-copy" onclick="copyCmd('ogCmd1')">Copy</button></div>
    </div>`;

    html+=`<div class="og-card">
      <div class="og-card-head"><span class="og-num">3</span><span class="og-title">Allow Browser Access &amp; Start</span></div>
      <div class="og-desc">In the same Command Prompt, paste this to start Ollama with browser access enabled:</div>
      <div class="og-cmd"><span id="ogCmd2">set OLLAMA_ORIGINS=* && ollama serve</span><button class="og-copy" onclick="copyCmd('ogCmd2')">Copy</button></div>
      <div class="og-warn">Keep this window open while using Sloth Space. If you see "listening on 127.0.0.1:11434" — it's working!</div>
    </div>`;

  } else {
    // ── Linux ──
    html+=`<div class="og-card">
      <div class="og-card-head"><span class="og-num">1</span><span class="og-title">Install Ollama</span></div>
      <div class="og-desc">Open a terminal and paste this one-liner:</div>
      <div class="og-cmd"><span id="ogCmd1">curl -fsSL https://ollama.com/install.sh | sh</span><button class="og-copy" onclick="copyCmd('ogCmd1')">Copy</button></div>
    </div>`;

    html+=`<div class="og-card">
      <div class="og-card-head"><span class="og-num">2</span><span class="og-title">Download a Model</span></div>
      <div class="og-desc">This downloads ~4.7GB to your machine:</div>
      <div class="og-cmd"><span id="ogCmd2">ollama pull llama3.1:8b</span><button class="og-copy" onclick="copyCmd('ogCmd2')">Copy</button></div>
    </div>`;

    html+=`<div class="og-card">
      <div class="og-card-head"><span class="og-num">3</span><span class="og-title">Start with Browser Access</span></div>
      <div class="og-desc">Run Ollama with CORS enabled so our web app can connect:</div>
      <div class="og-cmd"><span id="ogCmd3">OLLAMA_ORIGINS="*" ollama serve</span><button class="og-copy" onclick="copyCmd('ogCmd3')">Copy</button></div>
      <div class="og-warn">Keep this terminal open while using Sloth Space. If you see "listening on 127.0.0.1:11434" — it's working!</div>
    </div>`;
  }

  html+='</div>'; // close og-steps

  // Detect button
  html+=`<div class="og-bottom"><button class="og-detect-btn" onclick="detectOllama()">Detect Ollama</button><div id="ollamaDetectStatus" class="og-status" style="display:none;"></div></div>`;

  guide.innerHTML=html;
}

export function copyCmd(id){
  const el=document.getElementById(id);
  if(!el)return;
  navigator.clipboard.writeText(el.textContent).then(()=>{
    const btn=el.parentElement.querySelector('.og-copy');
    if(btn){btn.textContent='Copied!';setTimeout(()=>{btn.textContent='Copy';},1500);}
  });
}

export async function detectOllama(){
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
// MOBILE: App-style interactions & constants
// ═══════════════════════════════════════════

export const INITIAL_VH=window.innerHeight;
export const INITIAL_VW=window.innerWidth;

const isMobile=()=>window.innerWidth<=600;

export function initMobileHandlers() {
  // Swipe left/right on slide to navigate (mobile)
  // IMPORTANT: passive:false + preventDefault() to BLOCK browser zoom/scroll on slide area
  let touchStartX=0;
  let touchStartY=0;
  const slideCanvas=document.getElementById('slideCanvas');
  const slidePanel=document.querySelector('.slide-panel');

  // Block zoom but preserve tap-to-click on slide regions
  slidePanel.addEventListener('touchstart',function(e){
    touchStartX=e.touches[0].clientX;
    touchStartY=e.touches[0].clientY;
    // Only preventDefault if multi-touch (pinch zoom) — single finger preserved for tap
    if(e.touches.length>1) e.preventDefault();
  },{passive:false});

  slidePanel.addEventListener('touchmove',function(e){
    e.preventDefault(); // block zoom/scroll during any drag
  },{passive:false});

  slidePanel.addEventListener('touchend',function(e){
    const endX=e.changedTouches[0].clientX;
    const endY=e.changedTouches[0].clientY;
    const dx=endX-touchStartX;
    const dy=endY-touchStartY;
    // Small movement = tap → simulate click so selectRegion() fires
    if(Math.abs(dx)<15&&Math.abs(dy)<15){
      const el=document.elementFromPoint(endX,endY);
      if(el) el.click(); // fire the onclick handler on the tapped region
      return;
    }
    // Large horizontal movement = swipe → navigate slides
    if(!state.currentDeck)return;
    if(Math.abs(dx)<50||Math.abs(dy)>Math.abs(dx))return;
    if(dx<0&&state.currentSlide<state.currentDeck.slides.length-1){
      goSlide(state.currentSlide+1);
    }else if(dx>0&&state.currentSlide>0){
      goSlide(state.currentSlide-1);
    }
  },{passive:false});

  // Auto-scroll chat to bottom when new message arrives (mobile)
  const chatMsgsEl=document.getElementById('chatMessages');
  const chatObserver=new MutationObserver(function(){
    chatMsgsEl.scrollTop=chatMsgsEl.scrollHeight;
  });
  chatObserver.observe(chatMsgsEl,{childList:true});

  // Re-render on orientation change only (not pinch-to-zoom)
  let lastW=window.innerWidth;
  window.addEventListener('resize',function(){
    // Only re-render if width actually changed (orientation change or real resize)
    // Pinch-to-zoom on mobile doesn't change innerWidth
    if(Math.abs(window.innerWidth-lastW)>20){
      lastW=window.innerWidth;
      renderApp();
    }
  });
}

export function initTypewriterPlaceholder() {
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
}

// ═══════════════════════════════════════════
// DEMO DATA & ANIMATION
// ═══════════════════════════════════════════

export const DEMOS=[
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

export function initDemoAnimation() {
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
}
