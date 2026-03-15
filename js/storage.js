import { S, PRESETS, LAYOUTS, STORAGE_KEY, STORAGE_HISTORY_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, CLOUD_BUCKET, WS_STORAGE_KEY } from './state.js';

// ═══════════════════════════════════════════
// AUTO-SAVE / AUTO-LOAD (localStorage)
// ═══════════════════════════════════════════

export function autoSave(){
  if(!S.currentDeck)return;
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify({
      deck:S.currentDeck,
      preset:S.currentPreset,
      slide:S.currentSlide
    }));
    localStorage.setItem(STORAGE_HISTORY_KEY,JSON.stringify(S.chatHistory.slice(-20)));
    // Also save to the named saves list for file nav
    const name=S.currentDeck.title||'Untitled';
    const saveKey=name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'_');
    const saves=JSON.parse(localStorage.getItem('sloth_space_saves')||'{}');
    saves[saveKey]=JSON.stringify({deck:S.currentDeck,preset:S.currentPreset});
    localStorage.setItem('sloth_space_saves',JSON.stringify(saves));
  }catch(e){console.warn('Auto-save failed:',e);}
}

export function autoLoad(){
  try{
    const saved=localStorage.getItem(STORAGE_KEY);
    if(saved){
      const data=JSON.parse(saved);
      if(data.deck&&data.deck.slides){
        S.currentDeck=data.deck;
        S.currentPreset=data.preset||'clean-white';
        S.currentSlide=Math.min(data.slide||0,data.deck.slides.length-1);
        window.addMessage(`✓ Restored: "${S.currentDeck.title||'Untitled'}" (${S.currentDeck.slides.length} slides)`,'system');
      }
    }
    const savedHistory=localStorage.getItem(STORAGE_HISTORY_KEY);
    if(savedHistory){
      S.chatHistory=JSON.parse(savedHistory);
    }
  }catch(e){console.warn('Auto-load failed:',e);}
}

export function newDeck(){
  if(S.currentDeck&&!confirm('Start a new deck? Current work will be saved in browser.'))return;
  // Save current deck to a named slot before clearing
  if(S.currentDeck){
    try{
      const name=S.currentDeck.title||'Untitled';
      const saves=JSON.parse(localStorage.getItem('sloth_space_saves')||'{}');
      saves[name+'_'+Date.now()]=JSON.stringify({deck:S.currentDeck,preset:S.currentPreset});
      localStorage.setItem('sloth_space_saves',JSON.stringify(saves));
    }catch(e){}
  }
  S.currentDeck=null;
  S.currentSlide=0;
  S.chatHistory=[];
  S.selectedRegion=null;
  document.getElementById('selectionBar').style.display='none';
  document.getElementById('chatMessages').innerHTML='';
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_HISTORY_KEY);
  window.addMessage('New deck started. Tell me what you need!','system');
  window.renderApp();
}

export function saveDeck(){
  // saveDeck now redirects to saveSloth for the native format
  saveSloth();
}

export function loadDeck(){
  document.getElementById('fileInput').click();
}

export function handleFileLoad(event){
  const file=event.target.files[0];
  if(!file)return;

  // .sloth files are zip-based
  if(file.name.endsWith('.sloth')){
    loadSlothFile(file);
    event.target.value='';
    return;
  }

  // .json files
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const deck=JSON.parse(e.target.result);
      const err=window.validateDeck(deck);
      if(err){window.addMessage(`Load error: ${err}`,'system');return;}
      S.currentDeck=deck;
      S.currentPreset=deck.preset||'clean-white';
      S.currentSlide=0;
      autoSave();
      window.addMessage(`✓ Loaded "${deck.title}" (${deck.slides.length} slides)`,'ai');
      window.renderApp();
    }catch(err){
      window.addMessage(`Load error: Invalid JSON file`,'system');
    }
  };
  reader.readAsText(file);
  event.target.value='';
}

export function exportJSON(){
  if(!S.currentDeck)return;
  const blob=new Blob([JSON.stringify(S.currentDeck,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(S.currentDeck.title||'deck').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'_')+'.json';
  a.click();
}

// ═══════════════════════════════════════════
// EXPORT .pptx (PptxGenJS)
// ═══════════════════════════════════════════
export function exportPPTX(){
  if(!S.currentDeck){window.addMessage('Nothing to export yet.','system');return;}
  const p=PRESETS[S.currentPreset];
  const pptx=new window.PptxGenJS();
  pptx.layout='LAYOUT_WIDE'; // 13.33 x 7.5 inches = 1280x720 at 96dpi
  pptx.title=S.currentDeck.title||'Untitled';
  pptx.author='Sloth Space';

  // Helper: hex color to pptxgen format (strip #)
  const hx=c=>c?c.replace('#',''):'000000';

  // Helper: inches from pixels (96dpi base, slide=1280x720 → 13.33x7.5)
  const W=p.slide.width, H=p.slide.height;
  const toX=px=>(px/W)*13.33;
  const toY=px=>(px/H)*7.5;
  const toW=px=>(px/W)*13.33;
  const toH=px=>(px/H)*7.5;

  // Font size: our scale is in px, pptx uses pt (roughly same at screen res)
  const toPt=px=>Math.round(px*0.75); // px to pt approximation

  S.currentDeck.slides.forEach((slide,idx)=>{
    const L=LAYOUTS[slide.layout];
    if(!L)return;
    const ov=slide.style_overrides||{};
    const regionOv=ov.regions||{};
    const bg=ov.background||(L.background_override==='surface'?p.colors.surface:p.colors.background);
    const globalColor=ov.heading_color||null;
    const fontOv=ov.font||null;

    const sl=pptx.addSlide();
    sl.background={fill:hx(bg)};

    // Add speaker notes
    if(slide.notes)sl.addNotes(slide.notes);

    L.regions.forEach(r=>{
      const c=slide.content[r.id];
      if(!c)return;

      const rOv=regionOv[r.id]||{};
      const regionColor=rOv.color||globalColor||null;
      const regionFont=rOv.font||fontOv||null;
      const isUnderline=rOv.underline!==undefined?rOv.underline:(ov.underline||false);
      const isBold=rOv.bold!==undefined?rOv.bold:(ov.bold||false);
      const isItalic=rOv.italic!==undefined?rOv.italic:(ov.italic||false);

      const s=window.rs(r.role,p);
      const sk=r.fontSize||'body';
      const fontSize=toPt(p.typography.scale[window.SC[sk]]||16);
      const txtColor=regionColor||s.color;
      const fontFace=regionFont||s.ff||'Arial';
      const al=r.align||{};

      // Position with margins
      const mx=p.spacing.margin.left, my=p.spacing.margin.top;
      const x=toX(mx+r.bounds.x);
      const y=toY(my+r.bounds.y);
      const w=toW(r.bounds.w);
      const h=toH(r.bounds.h);

      // Horizontal alignment
      const hAlign=al.horizontal==='center'?'center':al.horizontal==='right'?'right':'left';
      // Vertical alignment
      const vAlign=al.vertical==='middle'?'middle':al.vertical==='bottom'?'bottom':'top';

      if(r.role==='image'){
        if(typeof c==='object'&&c.type==='image'&&c.dataUrl){
          // Real image — embed in PPTX
          try{
            sl.addImage({data:c.dataUrl, x,y,w,h, sizing:{type:'contain',w,h}});
          }catch(imgErr){
            console.warn('PPTX image embed failed:',imgErr);
            sl.addText(c.alt||c.name||'Image',{x,y,w,h,fontSize:10,color:hx(p.colors.secondary),fontFace:'Arial',align:'center',valign:'middle'});
          }
        }else{
          // Image placeholder — draw a dashed box
          sl.addShape(pptx.shapes.RECTANGLE,{x,y,w,h,line:{color:hx(p.colors.border),dashType:'dash',width:1.5},fill:{type:'none'}});
          const altText=typeof c==='object'?(c.alt||c.src||'Image'):'Image';
          sl.addText(altText,{x,y,w,h,fontSize:10,color:hx(p.colors.secondary),fontFace:'Arial',align:'center',valign:'middle'});
        }
        return;
      }

      if(typeof c==='object'&&c.type==='table'){
        // Table rendering
        const rows=[];
        // Header row
        if(c.headers){
          rows.push(c.headers.map(h=>({
            text:h,
            options:{bold:true,fontSize:fontSize*0.85,color:hx(p.colors.table_header_text),fill:{color:hx(p.colors.table_header_bg)},fontFace}
          })));
        }
        // Data rows
        if(c.rows){
          c.rows.forEach((row,ri)=>{
            rows.push(row.map((cell,ci)=>({
              text:String(cell),
              options:{fontSize:fontSize*0.85,color:hx(txtColor),fill:{color:ri%2===1?hx(p.colors.table_row_alt):'FFFFFF'},fontFace,bold:ci===0}
            })));
          });
        }
        if(rows.length>0){
          sl.addTable(rows,{
            x,y,w,h,
            border:{type:'solid',color:hx(p.colors.border),pt:0.5},
            colW:Array(rows[0].length).fill(w/rows[0].length),
            autoPage:false
          });
        }
        return;
      }

      if(typeof c==='object'&&c.type==='list'){
        // List as bullet points
        const textRows=c.items.map(item=>({
          text:item,
          options:{
            fontSize,color:hx(txtColor),fontFace,
            bold:isBold||(s.fw>=700),italic:isItalic||(s.fs==='italic'),
            underline:isUnderline?{style:'sng'}:undefined,
            bullet:{type:'bullet',style:'\u25CF',indent:18},
            lineSpacingMultiple:s.lh||1.5,
            breakType:'none'
          }
        }));
        sl.addText(textRows,{
          x,y,w,h,
          valign:vAlign,align:hAlign,
          paraSpaceAfter:p.spacing.paragraph*0.6
        });
        return;
      }

      if(typeof c==='string'){
        // Plain text
        let pre='';
        if(r.role==='quote')pre='\u201C';
        sl.addText(pre+c,{
          x,y,w,h,
          fontSize,
          color:hx(txtColor),
          fontFace,
          bold:isBold||(s.fw>=700),
          italic:isItalic||(s.fs==='italic'),
          underline:isUnderline?{style:'sng'}:undefined,
          align:hAlign,
          valign:vAlign,
          lineSpacingMultiple:s.lh||1.3,
          shrinkText:true
        });
      }
    });

    // Floating overlay images (slide.images[])
    if(slide.images&&slide.images.length>0){
      slide.images.forEach(fi=>{
        try{
          sl.addImage({
            data:fi.dataUrl,
            x:toX(fi.x),y:toY(fi.y),
            w:toW(fi.w),h:toH(fi.h),
            sizing:{type:fi.fit==='cover'?'cover':'contain',w:toW(fi.w),h:toH(fi.h)}
          });
        }catch(imgErr){
          console.warn('PPTX floating image failed:',imgErr);
          sl.addShape(pptx.shapes.RECTANGLE,{x:toX(fi.x),y:toY(fi.y),w:toW(fi.w),h:toH(fi.h),line:{color:'CCCCCC',dashType:'dash',width:1},fill:{type:'none'}});
          sl.addText(fi.name||'Image',{x:toX(fi.x),y:toY(fi.y),w:toW(fi.w),h:toH(fi.h),fontSize:9,color:'999999',fontFace:'Arial',align:'center',valign:'middle'});
        }
      });
    }

    // Page number
    sl.addText(String(idx+1),{
      x:toX(W-p.spacing.margin.right-40),
      y:toY(H-p.spacing.margin.bottom*0.7),
      w:0.5,h:0.3,
      fontSize:9,color:hx(p.colors.secondary),fontFace:'Arial',
      align:'right',transparency:60
    });
  });

  const fname=(S.currentDeck.title||'deck').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'_');
  pptx.writeFile({fileName:fname+'.pptx'}).then(()=>{
    window.addMessage(`✓ Exported ${fname}.pptx`,'system');
  }).catch(e=>{
    window.addMessage(`Export error: ${e.message}`,'system');
  });
}

// ═══════════════════════════════════════════
// .sloth FORMAT (zip-based)
// ═══════════════════════════════════════════
export function saveSloth(){
  const zip=new window.JSZip();
  let fname='untitled';
  let contentType=S.currentMode;

  if(S.currentMode==='slide'){
    if(!S.currentDeck){window.addMessage('Nothing to save yet.','system');return;}
    zip.file('manifest.json',JSON.stringify(S.currentDeck,null,2));
    zip.file('meta.json',JSON.stringify({
      sloth_version:'0.1.0',
      app:'Sloth Space',
      type:'slide',
      created:new Date().toISOString(),
      preset:S.currentPreset,
      currentSlide:S.currentSlide
    },null,2));
    fname=(S.currentDeck.title||'deck').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'_');
  } else if(S.currentMode==='doc'){
    if(!S.currentDoc||!S.currentDoc.blocks.length){window.addMessage('Nothing to save yet.','system');return;}
    zip.file('manifest.json',JSON.stringify(S.currentDoc,null,2));
    zip.file('meta.json',JSON.stringify({
      sloth_version:'0.1.0',
      app:'Sloth Space',
      type:'doc',
      created:new Date().toISOString()
    },null,2));
    fname=(S.currentDoc.title||'document').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'_');
  } else {
    window.addMessage('Nothing to export in this mode.','system');
    return;
  }

  // chat.json = conversation history (optional, for restore)
  zip.file('chat.json',JSON.stringify(S.chatHistory.slice(-30),null,2));

  zip.generateAsync({type:'blob'}).then(blob=>{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=fname+'.sloth';
    a.click();
    window.addMessage(`✓ Saved ${fname}.sloth`,'system');
  }).catch(e=>{
    window.addMessage(`Save error: ${e.message}`,'system');
  });
}

export function loadSlothFile(file){
  const zip=new window.JSZip();
  zip.loadAsync(file).then(z=>{
    // Read manifest
    const manifestFile=z.file('manifest.json');
    if(!manifestFile){window.addMessage('Invalid .sloth file: no manifest.json','system');return;}
    return manifestFile.async('string').then(manifestStr=>{
      const deck=JSON.parse(manifestStr);
      const err=window.validateDeck(deck);
      if(err){window.addMessage(`Load error: ${err}`,'system');return;}
      S.currentDeck=deck;
      S.currentPreset=deck.preset||'clean-white';
      S.currentSlide=0;

      // Read meta
      const metaFile=z.file('meta.json');
      if(metaFile){
        return metaFile.async('string').then(metaStr=>{
          try{
            const meta=JSON.parse(metaStr);
            if(meta.preset)S.currentPreset=meta.preset;
            if(meta.currentSlide!==undefined)S.currentSlide=Math.min(meta.currentSlide,deck.slides.length-1);
          }catch(e){}
        }).then(()=>{
          // Read chat history
          const chatFile=z.file('chat.json');
          if(chatFile){
            return chatFile.async('string').then(chatStr=>{
              try{S.chatHistory=JSON.parse(chatStr);}catch(e){}
            });
          }
        });
      }
    }).then(()=>{
      autoSave();
      window.addMessage(`✓ Loaded "${S.currentDeck.title}" from .sloth (${S.currentDeck.slides.length} slides)`,'ai');
      window.renderApp();
    });
  }).catch(e=>{
    window.addMessage(`Load error: ${e.message}`,'system');
  });
}

// ═══════════════════════════════════════════
// AUTH / CLOUD (Supabase)
// ═══════════════════════════════════════════

export function initAuth(){
  if(!SUPABASE_URL||!SUPABASE_ANON_KEY){
    return;
  }
  try{
    S.supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

    // Handle OAuth PKCE callback — if URL has ?code=, exchange it for a session
    const params=new URLSearchParams(window.location.search);
    if(params.has('code')){
      S.supabaseClient.auth.exchangeCodeForSession(params.get('code')).then(({data,error})=>{
        if(error){
          console.warn('OAuth code exchange failed:',error.message);
          window.addMessage&&window.addMessage('Login failed: '+error.message,'system');
        }
        // Clean URL — remove ?code=... so it doesn't re-trigger on refresh
        window.history.replaceState({},'',window.location.pathname+window.location.hash);
      });
    }

    // Check for existing session
    S.supabaseClient.auth.getSession().then(({data:{session}})=>{
      if(session){
        setAuthUser(session.user);
      }
    });
    // Listen for auth changes (fires after code exchange completes too)
    S.supabaseClient.auth.onAuthStateChange((event,session)=>{
      if(session){
        setAuthUser(session.user);
      }else{
        clearAuthUser();
      }
    });
  }catch(e){
    console.warn('Auth init failed:',e);
  }
}

export function setAuthUser(user){
  S.currentUser=user;
  const bar=document.getElementById('authBar');
  const name=user.user_metadata?.full_name||user.email?.split('@')[0]||'User';
  const email=user.email||'';
  const initial=name.charAt(0).toUpperCase();
  const providerDef=window.LLM_DEFAULTS[window.llmConfig.provider]||window.LLM_DEFAULTS.groq;
  bar.innerHTML=`
    <span class="auth-name">${name}</span>
    <div class="user-menu-wrap">
      <div class="auth-avatar" onclick="toggleUserMenu(event)" title="Account menu">${initial}</div>
      <div class="user-menu" id="userMenu">
        <div class="um-header">
          <div class="um-name">${name}</div>
          <div class="um-email">${email}</div>
        </div>
        <div class="um-provider">
          <div class="um-provider-dot" style="background:${providerDef.color}"></div>
          <span class="um-provider-name">${providerDef.label||window.llmConfig.provider}</span>
          <span class="um-provider-change" onclick="openSettings();closeUserMenu();">Change</span>
        </div>
        <div class="um-item" onclick="openSettings();closeUserMenu();">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2m-9-11h2m18 0h2m-3.3-6.7-1.4 1.4M5.7 18.3l-1.4 1.4m0-13.4 1.4 1.4m12.6 12.6 1.4 1.4"/></svg>
          Settings &amp; API
        </div>
        <div class="um-item" onclick="showModePicker();closeUserMenu();">
          <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Home
        </div>
        <div class="um-divider"></div>
        <div class="um-item danger" onclick="doLogout();closeUserMenu();">
          <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign Out
        </div>
      </div>
    </div>
  `;
  // Update welcome page auth section if visible
  const wStatus=document.getElementById('welcomeAuthStatus');
  const wLoggedIn=document.getElementById('welcomeAuthLoggedIn');
  const wName=document.getElementById('welcomeAuthName');
  if(wStatus&&wLoggedIn){
    wStatus.style.display='none';
    wLoggedIn.style.display='block';
    if(wName)wName.textContent=name;
    const soRow=document.getElementById('welcomeSignOutRow');
    if(soRow)soRow.style.display='block';
  }
  // Auto-fill welcome name field
  const nameInput=document.getElementById('welcomeDisplayName');
  if(nameInput&&!nameInput.value)nameInput.value=name;
  // Always restore LLM config from cloud on login (cloud takes priority)
  // This ensures API keys sync across devices — but only show message once
  if(!S._authSyncDone){
    S._authSyncDone=true;
    const restored=window.restoreConfigFromCloud(user);
    // Set display name from GitHub if not already set from cloud
    if(!window.llmConfig.displayName){
      window.llmConfig.displayName=name;
      window.saveConfig();
    }
    if(restored&&window.isConfigured()){
      // Respect the current mode — don't force slide mode on auth sync
      const savedMode=sessionStorage.getItem('sloth_mode');
      if(savedMode&&savedMode!=='slide'){
        // Already in a mode (doc/workspace), just hide welcome
        document.getElementById('welcomeOverlay').classList.add('hidden');
        sessionStorage.setItem('sloth_active','1');
      } else {
        window.enterSlides();
      }
      window.addMessage('☁️ Settings synced from cloud.','system');
    }
    // Also sync workspace files from cloud
    window.syncWorkspaceFromCloud();
  }
}

export function clearAuthUser(){
  S.currentUser=null;
  S._authSyncDone=false;
  const bar=document.getElementById('authBar');
  bar.innerHTML='<button class="auth-login-btn" onclick="doLogin()" id="authLoginBtn">Sign In</button>';
}

export async function doLogin(){
  if(!S.supabaseClient){
    window.openSettings();
    return;
  }
  // Directly use GitHub — no picker needed
  try{
    // Build redirect URL — must be http(s), not file://
    let redirect=window.location.href.split('#')[0].split('?')[0];
    if(redirect.startsWith('file:')){
      window.addMessage('OAuth login requires http/https. Deploy to GitHub Pages or run a local server first.','system');
      return;
    }
    const{error}=await S.supabaseClient.auth.signInWithOAuth({
      provider:'github',
      options:{redirectTo:redirect}
    });
    if(error)window.addMessage('Login error: '+error.message,'system');
  }catch(e){
    window.addMessage('Login error: '+e.message,'system');
  }
}

export function toggleUserMenu(e){
  e.stopPropagation();
  const menu=document.getElementById('userMenu');
  if(menu)menu.classList.toggle('show');
}

export function closeUserMenu(){
  const menu=document.getElementById('userMenu');
  if(menu)menu.classList.remove('show');
}

// Close user menu on click outside
document.addEventListener('click',function(e){
  if(!e.target.closest('.user-menu-wrap'))closeUserMenu();
});

export function showWelcome(){
  const overlay=document.getElementById('welcomeOverlay');
  overlay.classList.remove('hidden');
  sessionStorage.removeItem('sloth_active');
  // On mobile: reset to splash view (demo first)
  const box=document.getElementById('welcomeBox');
  if(box) box.classList.remove('mobile-form-active');
  // Make sure config panel is hidden
  const configPanel=document.getElementById('wbConfigPanel');
  if(configPanel)configPanel.classList.remove('active');
  // If already configured, pre-fill and show Connected state
  if(window.isConfigured()){
    window.welcomeProvider=window.llmConfig.provider;
    // Pre-fill the config panel fields (in case user clicks to re-configure)
    const grid=document.getElementById('welcomeProviderGrid');
    grid.innerHTML=Object.entries(window.LLM_DEFAULTS).map(([key,def])=>
      `<div class="wb-pgrid-item${key===window.welcomeProvider?' active':''}" data-provider="${key}" onclick="setWelcomeProvider('${key}')">
        <div class="wpg-dot" style="background:${def.color}"></div>
        <div class="wpg-name">${def.label}</div>
        <div class="wpg-desc">${def.desc}</div>
      </div>`
    ).join('');
    window.setWelcomeProvider(window.welcomeProvider);
    // Fill saved values after setWelcomeProvider clears them
    const isCloud=window.CLOUD_PROVIDERS.includes(window.llmConfig.provider);
    if(isCloud){
      document.getElementById('welcomeApiKey').value=window.llmConfig.apiKey||'';
    }else if(window.llmConfig.provider==='ollama'){
      document.getElementById('welcomeOllamaUrl').value=window.llmConfig.url||'http://localhost:11434';
      document.getElementById('welcomeOllamaModel').value=window.llmConfig.model||'llama3.1:8b';
    }else if(window.llmConfig.provider==='custom'){
      document.getElementById('welcomeCustomUrl').value=window.llmConfig.url||'';
      document.getElementById('welcomeCustomKey').value=window.llmConfig.apiKey||'';
      document.getElementById('welcomeCustomModel').value=window.llmConfig.model||'';
      document.getElementById('welcomeCustomRouter').value=window.llmConfig.router||'';
    }
    document.getElementById('welcomeDisplayName').value=window.llmConfig.displayName||'';
    // Show Connected on button
    const btn=document.getElementById('wbConnectBtn');
    const def=window.LLM_DEFAULTS[window.llmConfig.provider]||{};
    btn.innerHTML=`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${def.color||'#8B9E8B'};margin-right:6px;"></span> Connected to ${def.label||window.llmConfig.provider}`;
    btn.style.color='#fff'; btn.style.borderColor=def.color||'#8B9E8B';
    btn.classList.add('connected');
    btn._providerConfirmed=true;
  }
}

export async function doLogout(){
  if(!S.supabaseClient)return;
  if(!confirm('Sign out?'))return;
  await S.supabaseClient.auth.signOut();
  clearAuthUser();
  clearLocalConfig();
  window.addMessage('Signed out.','system');
  showWelcome();
}

// Clear config from memory & localStorage only (cloud keeps it)
export function clearLocalConfig(){
  window.llmConfig.apiKey='';
  window.llmConfig.provider='groq';
  window.llmConfig.url=window.LLM_DEFAULTS.groq.url;
  window.llmConfig.model=window.LLM_DEFAULTS.groq.model;
  window.llmConfig.router=window.LLM_DEFAULTS.groq.router;
  window.llmConfig.displayName='';
  localStorage.removeItem(window.CONFIG_KEY);
}

export async function doWelcomeSignOut(){
  if(!S.supabaseClient)return;
  await S.supabaseClient.auth.signOut();
  clearAuthUser();
  clearLocalConfig();
  // Reset welcome auth section
  const wStatus=document.getElementById('welcomeAuthStatus');
  const wLoggedIn=document.getElementById('welcomeAuthLoggedIn');
  if(wStatus)wStatus.style.display='flex';
  if(wLoggedIn)wLoggedIn.style.display='none';
  const soRow=document.getElementById('welcomeSignOutRow');
  if(soRow)soRow.style.display='none';
  // Reset connect button
  const btn=document.getElementById('wbConnectBtn');
  if(btn){
    btn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4m-7-11H1m22 0h-4m-2.3-6.7-2.8 2.8m-5.8 5.8-2.8 2.8m0-11.4 2.8 2.8m5.8 5.8 2.8 2.8"/><circle cx="12" cy="12" r="3"/></svg> Connect your LLM to get started';
    btn.style.opacity=''; btn.style.color=''; btn.style.borderColor='';
    btn.classList.remove('connected');
    btn._providerConfirmed=false;
  }
  // Clear welcome config fields
  const k=document.getElementById('welcomeApiKey'); if(k)k.value='';
  const n=document.getElementById('welcomeDisplayName'); if(n)n.value='';
}

// ═══════════════════════════════════════════
// CLOUD: LOAD / SAVE / DELETE / SHARE
// ═══════════════════════════════════════════

export async function loadFromCloud(filename){
  if(!S.supabaseClient||!S.currentUser){window.addMessage('Sign in to load cloud files.','system');return;}
  try{
    const path=S.currentUser.id+'/'+filename;
    const{data,error}=await S.supabaseClient.storage.from(CLOUD_BUCKET).download(path);
    if(error)throw error;
    const text=await data.text();
    const parsed=JSON.parse(text);
    if(parsed.deck){
      S.currentDeck=parsed.deck;
      S.currentPreset=parsed.preset||'clean-white';
      S.currentSlide=0;
      S.chatHistory=parsed.chat||[];
      document.getElementById('chatMessages').innerHTML='';
      if(S.chatHistory.length){
        S.chatHistory.forEach(m=>window.addMessage(m.text||m.content||'',m.role||'system'));
      }
      window.addMessage(`✓ Loaded from cloud: "${S.currentDeck.title||'Untitled'}"`,'system');
      autoSave();
      window.renderApp();
      window.closeFileNav();
    }
  }catch(e){window.addMessage('Cloud load error: '+e.message,'system');}
}

export async function saveCurrentToCloud(){
  if(!S.currentDeck){window.addMessage('Nothing to save yet.','system');return;}
  if(!S.supabaseClient||!S.currentUser){
    window.addMessage('Sign in to save to cloud.','system');
    window.doLogin();
    return;
  }
  try{
    const fname=(S.currentDeck.title||'Untitled').replace(/[^a-zA-Z0-9\u4e00-\u9fff\s-]/g,'').replace(/\s+/g,'_')+'.json';
    const path=S.currentUser.id+'/'+fname;
    const payload=JSON.stringify({
      deck:S.currentDeck,
      preset:S.currentPreset,
      chat:S.chatHistory.slice(-20),
      savedAt:new Date().toISOString()
    });
    const blob=new Blob([payload],{type:'application/json'});
    const{error}=await S.supabaseClient.storage.from(CLOUD_BUCKET).upload(path,blob,{upsert:true});
    if(error)throw error;
    window.addMessage(`✓ Saved to cloud: "${S.currentDeck.title||'Untitled'}"`,'system');
    window.refreshFileList();
  }catch(e){window.addMessage('Cloud save error: '+e.message,'system');}
}

export async function deleteFileFromNav(id,source,keyOrPath){
  const name=id.replace('local_','').replace('cloud_','').replace('ws_','').replace(/_\d+$/,'').replace(/_/g,' ');
  if(!confirm(`Delete "${name}"?`))return;

  if(source==='workspace'){
    window.wsDeleteFile(keyOrPath);
  }else if(source==='local'){
    try{
      const saves=JSON.parse(localStorage.getItem('sloth_space_saves')||'{}');
      delete saves[keyOrPath];
      localStorage.setItem('sloth_space_saves',JSON.stringify(saves));
    }catch(e){}
  }else if(source==='cloud'){
    if(!S.supabaseClient||!S.currentUser)return;
    try{
      const{error}=await S.supabaseClient.storage.from(CLOUD_BUCKET).remove([keyOrPath]);
      if(error)throw error;
    }catch(e){window.addMessage('Delete error: '+e.message,'system');return;}
  }
  if(S.currentDeck){
    const deckTitle=(S.currentDeck.title||'').toLowerCase().replace(/\s+/g,' ').trim();
    const deletedName=name.toLowerCase().replace(/\s+/g,' ').trim();
    if(deckTitle&&deletedName&&(deckTitle===deletedName||deckTitle.includes(deletedName)||deletedName.includes(deckTitle))){
      S.currentDeck=null;
      S.currentSlide=0;
      S.chatHistory=[];
      S.selectedRegion=null;
      document.getElementById('deckNameInput').value='';
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_HISTORY_KEY);
      window.renderApp();
      window.addMessage('Deck deleted. Starting fresh.','system');
    }
  }
  if(source==='local'){
    try{
      const saved=localStorage.getItem(STORAGE_KEY);
      if(saved){
        const data=JSON.parse(saved);
        const savedTitle=(data.deck?.title||'').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'_');
        if(savedTitle===keyOrPath){
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(STORAGE_HISTORY_KEY);
        }
      }
    }catch(e){}
  }
  window.refreshFileList();
}

export async function shareFile(path){
  if(!S.supabaseClient)return;
  try{
    const{data,error}=await S.supabaseClient.storage.from(CLOUD_BUCKET).createSignedUrl(path,7*24*60*60);
    if(error)throw error;
    const shareUrl=window.location.href.split('?')[0].split('#')[0]+'?load='+encodeURIComponent(data.signedUrl);
    await navigator.clipboard.writeText(shareUrl);
    window.addMessage('✓ Share link copied! Valid for 7 days.','system');
  }catch(e){window.addMessage('Share error: '+e.message,'system');}
}

// ═══════════════════════════════════════════
// SHARE LINK
// ═══════════════════════════════════════════

export function checkShareLink(){
  const params=new URLSearchParams(window.location.search);
  const loadUrl=params.get('load');
  if(!loadUrl)return;
  // Clean the URL
  window.history.replaceState({},'',window.location.pathname);
  // Fetch and load
  fetch(loadUrl).then(r=>{
    if(!r.ok)throw new Error('Link expired or invalid');
    return r.json();
  }).then(parsed=>{
    if(parsed.deck){
      S.currentDeck=parsed.deck;
      S.currentPreset=parsed.preset||'clean-white';
      S.currentSlide=0;
      S.chatHistory=[];
      document.getElementById('chatMessages').innerHTML='';
      window.addMessage(`✓ Loaded shared deck: "${S.currentDeck.title||'Untitled'}" (${S.currentDeck.slides.length} slides)`,'system');
      // Hide welcome if showing
      window.enterSlides();
      window.renderApp();
    }
  }).catch(e=>{
    console.warn('Share link load failed:',e);
  });
}
