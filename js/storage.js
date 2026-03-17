/**
 * Sloth Space - AI-Native Agentic Workspace
 * Copyright (c) 2026 EnigmaticSloth
 *
 * This source code is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).
 * You may use, distribute and modify this code under the terms of the AGPL-3.0 license.
 *
 * ⚠️ WARNING TO COMMERCIAL/SAAS ENTITIES:
 * Under AGPL-3.0, if you modify this program and allow users to interact with it
 * over a network (SaaS), you MUST fully open-source your entire backend infrastructure.
 *
 * For commercial, closed-source licensing exceptions, contact the author.
 */
import { S, PRESETS, LAYOUTS, STORAGE_KEY, STORAGE_HISTORY_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, CLOUD_BUCKET, WS_STORAGE_KEY, LLM_DEFAULTS, CLOUD_PROVIDERS, CONFIG_KEY } from './state.js';
import { rs, SC } from './slide.js';

// ═══════════════════════════════════════════
// CLOUD AUTO-SYNC
// ═══════════════════════════════════════════
// When logged in, all data auto-syncs to Supabase cloud.
// Per-user quota: 20MB. Warns at 16MB, stops uploading at 20MB.

const CLOUD_QUOTA_BYTES = 20 * 1024 * 1024;  // 20MB
const CLOUD_WARN_BYTES  = 16 * 1024 * 1024;  // 16MB warning
let _cloudSyncTimer = null;
let _cloudQuotaCache = { bytes: 0, checkedAt: 0 };  // cache for 60s

// Debounced cloud sync for the current slide deck (5s after last change)
function _scheduleCloudSync(){
  if(!S.supabaseClient||!S.currentUser) return;
  clearTimeout(_cloudSyncTimer);
  _cloudSyncTimer = setTimeout(_doCloudSyncDeck, 5000);
}

async function _doCloudSyncDeck(){
  if(!S.supabaseClient||!S.currentUser||!S.currentDeck) return;
  // Check quota before uploading
  const usage = await getCloudQuota();
  if(usage >= CLOUD_QUOTA_BYTES){
    // Over quota — don't upload, show warning once
    if(!S._cloudQuotaWarned){
      S._cloudQuotaWarned = true;
      window.addMessage&&window.addMessage('⚠️ Cloud storage full (20MB). New changes are saved locally only. Delete some cloud files to resume sync.','system');
    }
    return;
  }
  if(usage >= CLOUD_WARN_BYTES && !S._cloudQuotaWarned){
    S._cloudQuotaWarned = true;
    const usedMB = (usage / 1024 / 1024).toFixed(1);
    window.addMessage&&window.addMessage(`⚠️ Cloud storage ${usedMB}/20MB. Consider deleting unused files.`,'system');
  }
  try{
    const fname = (S.currentDeck.title||'Untitled').replace(/[^a-zA-Z0-9\u4e00-\u9fff\s-]/g,'').replace(/\s+/g,'_') + '.json';
    const path = S.currentUser.id + '/' + fname;
    const payload = JSON.stringify({
      deck: S.currentDeck,
      preset: S.currentPreset,
      chat: S.chatHistory.slice(-20),
      savedAt: new Date().toISOString()
    });
    const blob = new Blob([payload], {type:'application/json'});
    await S.supabaseClient.storage.from(CLOUD_BUCKET).upload(path, blob, {upsert:true});
  }catch(e){
    console.warn('[CloudSync] Deck sync failed:', e.message);
  }
}

// Doc cloud sync — debounced, triggered after docSaveNow writes to workspace
// (workspace.js wsSave already syncs workspace.json to cloud with 2s debounce)
// So doc data flows: docSaveNow → wsSave → syncWorkspaceToCloud ✓

// Check per-user cloud storage usage
export async function getCloudQuota(){
  // Cache for 60 seconds to avoid spamming
  if(Date.now() - _cloudQuotaCache.checkedAt < 60000) return _cloudQuotaCache.bytes;
  if(!S.supabaseClient||!S.currentUser) return 0;
  try{
    const { data, error } = await S.supabaseClient.storage.from(CLOUD_BUCKET).list(S.currentUser.id, { limit: 200 });
    if(error||!data) return _cloudQuotaCache.bytes;
    let total = 0;
    for(const f of data) total += (f.metadata?.size || 0);
    _cloudQuotaCache = { bytes: total, checkedAt: Date.now() };
    return total;
  }catch(e){
    return _cloudQuotaCache.bytes;
  }
}

// Pull latest data from cloud (called once on login)
export async function cloudAutoLoad(){
  if(!S.supabaseClient||!S.currentUser) return;
  try{
    // List user's files in cloud
    const { data: files, error } = await S.supabaseClient.storage.from(CLOUD_BUCKET).list(S.currentUser.id, { limit: 200, sortBy: { column: 'updated_at', order: 'desc' } });
    if(error||!files||files.length===0) return;

    // Find the most recent .json deck file (not workspace.json, chat_tabs.json, config.json)
    const deckFile = files.find(f => f.name.endsWith('.json') && f.name !== 'workspace.json' && f.name !== 'chat_tabs.json' && f.name !== 'config.json');
    if(!deckFile) return;

    // Compare: cloud deck vs local deck — load cloud if it's newer
    const cloudTime = new Date(deckFile.updated_at||deckFile.created_at||0).getTime();
    const localSaved = localStorage.getItem(STORAGE_KEY);
    let localTime = 0;
    if(localSaved){
      try{
        const ld = JSON.parse(localSaved);
        // Use savedAt from local if available, otherwise assume old
        localTime = ld.savedAt ? new Date(ld.savedAt).getTime() : 0;
      }catch(e){}
    }

    // Only override local if cloud is significantly newer (>10s to avoid race)
    if(cloudTime > localTime + 10000){
      const path = S.currentUser.id + '/' + deckFile.name;
      const { data: blob, error: dlErr } = await S.supabaseClient.storage.from(CLOUD_BUCKET).download(path);
      if(dlErr||!blob) return;
      const text = await blob.text();
      const parsed = JSON.parse(text);
      if(parsed.deck&&parsed.deck.slides){
        S.currentDeck = _sanitizeDeckContent(parsed.deck);
        S.currentPreset = parsed.preset || 'clean-white';
        S.currentSlide = Math.min(parsed.slide||0, parsed.deck.slides.length-1);
        // Also save locally so next refresh is fast
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          deck: S.currentDeck,
          preset: S.currentPreset,
          slide: S.currentSlide,
          savedAt: parsed.savedAt
        }));
        window.addMessage&&window.addMessage(`☁️ Synced from cloud: "${S.currentDeck.title||'Untitled'}"`,'system');
        if(window.renderApp) window.renderApp();
      }
    }
  }catch(e){
    console.warn('[CloudSync] Auto-load failed:', e.message);
  }
}

// ═══════════════════════════════════════════
// AUTO-SAVE / AUTO-LOAD (localStorage)
// ═══════════════════════════════════════════

export function autoSave(){
  if(!S.currentDeck)return;
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify({
      deck:S.currentDeck,
      preset:S.currentPreset,
      slide:S.currentSlide,
      savedAt:new Date().toISOString()
    }));
    localStorage.setItem(STORAGE_HISTORY_KEY,JSON.stringify(S.chatHistory.slice(-20)));
    // Also save to the named saves list for file nav
    const name=S.currentDeck.title||'Untitled';
    const saveKey=name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'_');
    const saves=JSON.parse(localStorage.getItem('sloth_space_saves')||'{}');
    saves[saveKey]=JSON.stringify({deck:S.currentDeck,preset:S.currentPreset});
    localStorage.setItem('sloth_space_saves',JSON.stringify(saves));
  }catch(e){console.warn('Auto-save failed:',e);}

  // ── Also save slides to workspace storage (same as doc/sheet) ──
  if(window.wsLoad && window.wsSave){
    try{
      const files=window.wsLoad();
      // Use existing workspace file ID or generate one
      const deckId=S.currentDeck._wsId || S._wsCurrentFileId;
      const wsSlide={
        id: deckId || ('ws_slide_'+Date.now().toString(36)),
        type:'slides',
        title:S.currentDeck.title||'Untitled',
        created:S.currentDeck.created||new Date().toISOString(),
        updated:new Date().toISOString(),
        content:{ slides:S.currentDeck.slides, preset:S.currentPreset, locale:S.currentDeck.locale }
      };
      const existing=files.findIndex(f=>f.id===wsSlide.id);
      if(existing>=0){
        files[existing]=wsSlide;
      }else{
        // Try to find by title match (migration from old saves)
        const byTitle=files.findIndex(f=>f.type==='slides'&&f.title===wsSlide.title);
        if(byTitle>=0){
          wsSlide.id=files[byTitle].id;
          files[byTitle]=wsSlide;
        }else{
          files.push(wsSlide);
        }
      }
      window.wsSave(files);
      // Track the workspace file ID for future saves
      if(!S._wsCurrentFileId) S._wsCurrentFileId=wsSlide.id;
      if(!S.currentDeck._wsId) S.currentDeck._wsId=wsSlide.id;
    }catch(e){console.warn('Slide workspace save failed:',e);}
  }

  // Trigger cloud sync (debounced)
  _scheduleCloudSync();
}

// ═══════════════════════════════════════════
// UNIFIED SAVE — one function for all modes
// ═══════════════════════════════════════════
// modeSave() is the single entry point for saving. It dispatches to the
// correct per-mode save logic (slide/doc/sheet) so callers don't need
// to know which mode is active.
export function modeSave(){
  const mode=S.currentMode;
  if(mode==='sheet'){
    // 1. Commit any active cell edit
    if(S.sheet.editingCell && window.shCommitEdit) window.shCommitEdit();
    // 2. Persist to localStorage
    if(S.sheet.current){
      try{ localStorage.setItem('sloth_current_sheet',JSON.stringify(S.sheet.current)); }catch(e){}
    }
    // 3. Save to workspace (→ cloud sync via wsSave debounce)
    if(window.shSaveToWorkspace) window.shSaveToWorkspace();
  }else if(mode==='doc'){
    // 1. Flush any contentEditable → data model
    if(window.docFlushEditing) window.docFlushEditing();
    // 2. Full save (localStorage + workspace + cloud)
    if(window.docSaveNow) window.docSaveNow();
  }else if(mode==='slide'){
    // Existing autoSave handles localStorage + cloud
    autoSave();
  }
  // else: workspace mode has nothing to save
}

// Persist current mode to localStorage (survives tab close, not just refresh)
export function saveCurrentMode(){
  try{ localStorage.setItem('sloth_last_mode', S.currentMode); }catch(e){}
}

// Sanitize slide table/list content to prevent r.forEach crashes
function _sanitizeDeckContent(deck){
  if(!deck||!deck.slides) return deck;
  for(const s of deck.slides){
    if(!s.content||typeof s.content!=='object') continue;
    for(const[k,v]of Object.entries(s.content)){
      if(v&&typeof v==='object'&&v.type==='table'){
        if(!Array.isArray(v.headers)) v.headers=v.headers?Object.values(v.headers):[];
        if(!Array.isArray(v.rows)) v.rows=v.rows?[Object.values(v.rows)]:[];
        v.rows=v.rows.map(r=>Array.isArray(r)?r:(typeof r==='object'&&r?Object.values(r):[String(r)]));
      }
      if(v&&typeof v==='object'&&v.type==='list'){
        if(!Array.isArray(v.items)) v.items=v.items?[String(v.items)]:[];
      }
    }
  }
  return deck;
}

export function autoLoad(){
  try{
    // Restore slide deck
    const saved=localStorage.getItem(STORAGE_KEY);
    if(saved){
      const data=JSON.parse(saved);
      if(data.deck&&data.deck.slides){
        S.currentDeck=_sanitizeDeckContent(data.deck);
        S.currentPreset=data.preset||'clean-white';
        S.currentSlide=Math.min(data.slide||0,data.deck.slides.length-1);
        window.addMessage(`✓ Restored: "${S.currentDeck.title||'Untitled'}" (${S.currentDeck.slides.length} slides)`,'system');
      }
    }
    // Restore current doc (if user was in doc mode)
    const savedDoc=localStorage.getItem('sloth_current_doc');
    if(savedDoc){
      try{
        const parsed=JSON.parse(savedDoc);
        if(parsed&&parsed.blocks&&parsed.blocks.length){
          S.currentDoc=parsed;
        }
      }catch(e){}
    }
    // Restore last mode to localStorage (backup for sessionStorage)
    // BUT only if user isn't on the mode picker (showModePicker clears session state)
    const lastMode=localStorage.getItem('sloth_last_mode');
    const modePickerVisible=!document.getElementById('landingOverlay')?.classList.contains('hidden');
    const onPicker=sessionStorage.getItem('sloth_on_picker')==='1';
    if(lastMode&&!sessionStorage.getItem('sloth_mode')&&!modePickerVisible&&!onPicker){
      sessionStorage.setItem('sloth_mode',lastMode);
      sessionStorage.setItem('sloth_active','1');
    }
    // Chat history is now managed by chat tabs (initChatTabs)
    // Legacy fallback: only load if no chat tabs exist yet
    if(!S.chatTabs||S.chatTabs.length===0){
      const savedHistory=localStorage.getItem(STORAGE_HISTORY_KEY);
      if(savedHistory){
        S.chatHistory=JSON.parse(savedHistory);
      }
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
  try{ _doExportPPTX(); }catch(e){ console.error('exportPPTX error:',e); window.addMessage('Export error: '+e.message,'system'); }
}
function _doExportPPTX(){
  const p=PRESETS[S.currentPreset];
  // PptxGenJS CDN: v3.x exposes window.PptxGenJS as constructor
  const PptxCtor=window.PptxGenJS||(window.PptxGenJS?.default)||(window.pptxgen)||(window.pptxgen?.default);
  if(!PptxCtor){ window.addMessage('PptxGenJS library failed to load. Try refreshing the page.','system'); return; }
  const pptx=new PptxCtor();
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

      const s=rs(r.role,p);
      const sk=r.fontSize||'body';
      const fontSize=toPt(p.typography.scale[SC[sk]]||16);
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
        // Header row (guard: ensure array)
        const hdrs=Array.isArray(c.headers)?c.headers:(c.headers?Object.values(c.headers):[]);
        if(hdrs.length){
          rows.push(hdrs.map(h=>({
            text:String(h||''),
            options:{bold:true,fontSize:fontSize*0.85,color:hx(p.colors.table_header_text),fill:{color:hx(p.colors.table_header_bg)},fontFace}
          })));
        }
        // Data rows (guard: ensure array of arrays)
        const dataRows=Array.isArray(c.rows)?c.rows:(c.rows?[Object.values(c.rows)]:[]);
        dataRows.forEach((row,ri)=>{
          const cells=Array.isArray(row)?row:(row&&typeof row==='object'?Object.values(row):[String(row||'')]);
          rows.push(cells.map((cell,ci)=>({
            text:String(cell||''),
            options:{fontSize:fontSize*0.85,color:hx(txtColor),fill:{color:ri%2===1?hx(p.colors.table_row_alt):'FFFFFF'},fontFace,bold:ci===0}
          })));
        });
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
        // List as bullet points (guard: ensure array)
        const items=Array.isArray(c.items)?c.items:(c.items?[String(c.items)]:[]);
        const textRows=items.map(item=>({
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
  } else if(S.currentMode==='sheet'){
    if(!S.sheet||!S.sheet.current){window.addMessage('Nothing to save yet.','system');return;}
    const sh=S.sheet.current;
    zip.file('manifest.json',JSON.stringify(sh,null,2));
    zip.file('meta.json',JSON.stringify({
      sloth_version:'0.1.0',
      app:'Sloth Space',
      type:'sheet',
      created:new Date().toISOString()
    },null,2));
    fname=(sh.title||'sheet').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'_');
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
  console.log('[Auth] initAuth called, URL=', window.location.href);
  if(!SUPABASE_URL||!SUPABASE_ANON_KEY){ return; }
  if(!window.supabase){ console.error('[Auth] window.supabase not loaded!'); return; }
  try{
    S.supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

    // ── Handle implicit-flow OAuth callback (#access_token=... in hash) ──
    // Supabase CDN v2 may not auto-detect hash tokens reliably.
    // We manually parse and call setSession() before anything else can strip the hash.
    const hash=window.location.hash;
    if(hash && hash.includes('access_token=')){
      const params=new URLSearchParams(hash.substring(1));
      const access_token=params.get('access_token');
      const refresh_token=params.get('refresh_token');
      console.log('[Auth] Detected implicit-flow tokens in hash, calling setSession...');
      if(access_token && refresh_token){
        S.supabaseClient.auth.setSession({access_token,refresh_token}).then(({data,error})=>{
          if(error){ console.error('[Auth] setSession error:',error); return; }
          if(data.session){
            console.log('[Auth] setSession OK:', data.session.user.email);
            setAuthUser(data.session.user);
          }
          // Clean the hash so tokens don't linger in URL / browser history
          window.history.replaceState({},'',window.location.pathname+window.location.search+'#home');
        }).catch(e=>console.error('[Auth] setSession exception:',e));
        // Still register the listener for future changes (logout etc.)
        S.supabaseClient.auth.onAuthStateChange((event,session)=>{
          console.log('[Auth] onAuthStateChange:', event);
          if(session) setAuthUser(session.user);
          else clearAuthUser();
        });
        return; // skip normal getSession — setSession handles it
      }
    }

    // ── Normal flow: check stored session ──
    S.supabaseClient.auth.getSession().then(({data:{session}})=>{
      if(session) setAuthUser(session.user);
    }).catch(e=>console.error('[Auth] getSession error:',e));

    S.supabaseClient.auth.onAuthStateChange((event,session)=>{
      console.log('[Auth] onAuthStateChange:', event);
      if(session) setAuthUser(session.user);
      else clearAuthUser();
    });
  }catch(e){
    console.error('[Auth] initAuth EXCEPTION:', e);
  }
}

export function setAuthUser(user){
  console.log('[Auth] setAuthUser called:', user?.email, 'authBar exists:', !!document.getElementById('authBar'));
  try{
    S.currentUser=user;
    const bar=document.getElementById('authBar');
    if(!bar){ console.warn('[Auth] authBar element NOT FOUND!'); return; }
    const name=user.user_metadata?.full_name||user.email?.split('@')[0]||'User';
    const email=user.email||'';
    const initial=name.charAt(0).toUpperCase();
    const cfg=S.llmConfig||{provider:'groq'};
    const providerDef=(LLM_DEFAULTS||{})[cfg.provider]||{label:'AI',color:'#8B9E8B',desc:''};
    bar.innerHTML=`
      <div class="user-menu-wrap">
        <div class="auth-account-btn" onclick="toggleUserMenu(event)" title="Account menu">
          <div class="auth-avatar">${initial}</div>
          <span class="auth-name">${name}</span>
          <svg class="auth-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="user-menu" id="userMenu">
          <div class="um-header">
            <div class="um-name">${name}</div>
            <div class="um-email">${email}</div>
          </div>
          <div class="um-provider">
            <div class="um-provider-dot" style="background:${providerDef.color}"></div>
            <span class="um-provider-name">${providerDef.label||cfg.provider}</span>
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
    // Update landing page auth section if visible
    const lStatus=document.getElementById('landingAuthStatus');
    const lLoggedIn=document.getElementById('landingAuthLoggedIn');
    const lName=document.getElementById('landingAuthName');
    if(lStatus&&lLoggedIn){
      lStatus.style.display='none';
      lLoggedIn.style.display='block';
      if(lName)lName.textContent=name;
    }
    // Auto-fill landing name field
    const nameInput=document.getElementById('landingDisplayName');
    if(nameInput&&!nameInput.value)nameInput.value=name;
    // Restore LLM config from cloud on login (cloud takes priority)
    if(!S._authSyncDone){
      S._authSyncDone=true;
      if(window.restoreConfigFromCloud) window.restoreConfigFromCloud(user);
      if(S.llmConfig&&!S.llmConfig.displayName){
        S.llmConfig.displayName=name;
        if(window.saveConfig) window.saveConfig();
      }
      if(window.isConfigured&&window.isConfigured()){
        const savedMode=sessionStorage.getItem('sloth_mode');
        const pickerActive=sessionStorage.getItem('sloth_on_picker')==='1'||!document.getElementById('landingOverlay')?.classList.contains('hidden');
        if(pickerActive){
          // User was on the landing page — don't auto-enter any mode
        } else if(savedMode&&savedMode!=='slide'){
          if(window.hideLanding) window.hideLanding();
          sessionStorage.setItem('sloth_active','1');
        } else if(savedMode==='slide'||!savedMode){
          if(window.enterSlides) window.enterSlides();
        }
        if(window.addMessage) window.addMessage('☁️ Settings synced from cloud.','system');
      }
      if(window.syncWorkspaceFromCloud) window.syncWorkspaceFromCloud();
      if(window.loadChatTabsFromCloud) window.loadChatTabsFromCloud();
      // Auto-load latest deck from cloud
      cloudAutoLoad();
    }
  }catch(e){
    console.warn('[Auth] setAuthUser error (non-fatal):',e.message);
    // Still set the user even if UI rendering failed
    S.currentUser=user;
  }
}

export function clearAuthUser(){
  S.currentUser=null;
  S._authSyncDone=false;
  const bar=document.getElementById('authBar');
  bar.innerHTML='<button class="auth-login-btn" onclick="doLogin()" id="authLoginBtn">Sign In</button>';
  // Also reset landing page auth section so GitHub button is visible
  const lStatus=document.getElementById('landingAuthStatus');
  const lLoggedIn=document.getElementById('landingAuthLoggedIn');
  if(lStatus)lStatus.style.display='block';
  if(lLoggedIn)lLoggedIn.style.display='none';
}

export async function doLogin(){
  console.log('[Auth] doLogin called, supabaseClient exists:', !!S.supabaseClient);
  if(!S.supabaseClient){
    window.openSettings();
    return;
  }
  try{
    let redirect=window.location.href.split('#')[0].split('?')[0];
    console.log('[Auth] doLogin redirectTo:', redirect);
    if(redirect.startsWith('file:')){
      window.addMessage('OAuth login requires http/https. Deploy to GitHub Pages or run a local server first.','system');
      return;
    }
    const{error}=await S.supabaseClient.auth.signInWithOAuth({
      provider:'github',
      options:{redirectTo:redirect}
    });
    if(error){
      window.addMessage('Login error: '+error.message,'system');
    }
  }catch(e){
    console.error('[Auth] doLogin exception:', e);
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
  // Redirect to the unified landing page
  if(window.showLanding) window.showLanding();
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
  S.llmConfig.apiKey='';
  S.llmConfig.provider='groq';
  S.llmConfig.url=LLM_DEFAULTS.groq.url;
  S.llmConfig.model=LLM_DEFAULTS.groq.model;
  S.llmConfig.router=LLM_DEFAULTS.groq.router;
  S.llmConfig.displayName='';
  localStorage.removeItem(CONFIG_KEY);
}

export async function doWelcomeSignOut(){
  if(!S.supabaseClient)return;
  await S.supabaseClient.auth.signOut();
  clearAuthUser();
  clearLocalConfig();
  // Reset landing page auth section
  const lStatus=document.getElementById('landingAuthStatus');
  const lLoggedIn=document.getElementById('landingAuthLoggedIn');
  if(lStatus)lStatus.style.display='block';
  if(lLoggedIn)lLoggedIn.style.display='none';
  // Clear landing config fields
  const k=document.getElementById('landingApiKey'); if(k)k.value='';
  const n=document.getElementById('landingDisplayName'); if(n)n.value='';
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
      S.currentDeck=_sanitizeDeckContent(parsed.deck);
      S.currentPreset=parsed.preset||'clean-white';
      S.currentSlide=0;
      S.chatHistory=parsed.chat||[];
      document.getElementById('chatMessages').innerHTML='';
      if(S.chatHistory.length){
        S.chatHistory.forEach(m=>window.addMessage(m.text||m.content||'',m.role||'system'));
      }
      window.addMessage(`✓ Loaded from cloud: "${S.currentDeck.title||'Untitled'}"`,'system');
      autoSave();
      window.closeFileNav();
      // Switch to slide mode if not already there (use modeEnterWithData to preserve loaded data)
      if(S.currentMode!=='slide'){
        if(window.modeEnterWithData) window.modeEnterWithData('slide');
        else window.modeEnter('slide');
      } else window.renderApp();
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
    _cloudQuotaCache.checkedAt=0; // invalidate quota cache
    window.addMessage(`✓ Saved to cloud: "${S.currentDeck.title||'Untitled'}"`,'system');
    window.refreshFileList();
  }catch(e){window.addMessage('Cloud save error: '+e.message,'system');}
}

export async function deleteFileFromNav(id,source,keyOrPath){
  const name=id.replace('local_','').replace('cloud_','').replace('ws_','').replace(/_\d+$/,'').replace(/_/g,' ');
  if(!confirm(`Delete "${name}"?`))return;

  if(source==='workspace'||id.startsWith('ws_')){
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
      S.currentDeck=_sanitizeDeckContent(parsed.deck);
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
