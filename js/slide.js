// ═══════════════════════════════════════════
// SLIDE MODULE — Slide mode functions
// ═══════════════════════════════════════════
import { S, PRESETS, LAYOUTS, MAX_UNDO, BASIC_COLORS, MONET_COLORS, SEURAT_COLORS, FONTS, VALID_PRESETS } from './state.js';

// ═══════════════════════════════════════════
// UNDO/REDO SYSTEM
// ═══════════════════════════════════════════

export function snapshotDeck(){
  if(!S.currentDeck)return null;
  return JSON.parse(JSON.stringify({deck:S.currentDeck,slide:S.currentSlide,preset:S.currentPreset}));
}

export function pushUndo(){
  // Save current state BEFORE any mutation
  const snap=snapshotDeck();
  if(!snap)return;
  S.undoStack.push(snap);
  if(S.undoStack.length>MAX_UNDO)S.undoStack.shift();
  S.redoStack=[]; // new action clears redo
  updateUndoRedoUI();
}

export function undo(){
  if(!S.undoStack.length)return;
  // Save current state to redo stack
  const current=snapshotDeck();
  if(current)S.redoStack.push(current);
  // Restore previous state
  const snap=S.undoStack.pop();
  S.currentDeck=snap.deck;
  S.currentSlide=Math.min(snap.slide,S.currentDeck.slides.length-1);
  S.currentPreset=snap.preset||S.currentPreset;
  updateUndoRedoUI();
  window.renderApp();
  window.autoSave();
  window.addMessage('↩ Undo','system');
}

export function redo(){
  if(!S.redoStack.length)return;
  // Save current state to undo stack
  const current=snapshotDeck();
  if(current)S.undoStack.push(current);
  // Restore redo state
  const snap=S.redoStack.pop();
  S.currentDeck=snap.deck;
  S.currentSlide=Math.min(snap.slide,S.currentDeck.slides.length-1);
  S.currentPreset=snap.preset||S.currentPreset;
  updateUndoRedoUI();
  window.renderApp();
  window.autoSave();
  window.addMessage('↪ Redo','system');
}

export function updateUndoRedoUI(){
  const ub=document.getElementById('undoBtn');
  const rb=document.getElementById('redoBtn');
  const uOk=S.undoStack.length>0;
  const rOk=S.redoStack.length>0;
  if(ub){ ub.style.opacity=uOk?'1':'0.35'; ub.style.color=uOk?'#fff':'#555'; }
  if(rb){ rb.style.opacity=rOk?'1':'0.35'; rb.style.color=rOk?'#fff':'#555'; }
}

// Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Shift+Z / Ctrl+Y = redo
document.addEventListener('keydown',function(e){
  // Don't intercept when typing in inputs/textareas/contenteditable
  const tag=e.target.tagName;
  const isCE=e.target.isContentEditable;
  const isInput=(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||isCE);

  // ── Undo/Redo ──
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&(e.key==='z'||e.key==='Z'||e.key==='y'||e.key==='Y')){
    // Regular inputs (chatInput, textarea, select) — NOT contenteditable → let browser handle
    const isPlainInput=(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT');
    if(isPlainInput) return;
    // Slide inline edit contenteditable → let browser handle (DOM isn't rebuilt)
    if(isInlineEditing()) return;
    // Doc block contenteditable OR no focus → use our undo system
    e.preventDefault();
    if(S.currentMode==='doc') window.docFlushEditing();
    const isUndo=(e.key==='z'||e.key==='Z')&&!e.shiftKey;
    const isRedo=(e.key==='y'||e.key==='Y')||((e.key==='z'||e.key==='Z')&&e.shiftKey);
    if(isUndo){
      if(S.currentMode==='doc'){ window.docUndo(); }
      else { undo(); }
    } else if(isRedo){
      if(S.currentMode==='doc') window.docRedo(); else redo();
    }
    return;
  }

  if(isInlineEditing()) return; // let browser handle other keys in slide inline edit

  // ── Escape — deselect in both modes ──
  if(e.key==='Escape'){
    if(S.currentMode==='doc'){
      window.docHideImagePopup();
      // If actively editing a contenteditable, blur it first
      const ae=document.activeElement;
      if(ae&&ae.isContentEditable){
        ae.blur();
        if(ae.classList.contains('doc-block')) ae.contentEditable='false';
        if(window.docEditingBlockId) window.docEditingBlockId=null;
        e.preventDefault();
        return;
      }
    }
    // Unified deselect for both slide and doc
    if(S.selectedRegion||window.docEditingBlockId||window.docSelectedBlockId){
      window.docEditingBlockId=null;
      clearSelection(); // handles both slide region + doc block + selection bar + ctx menu
      e.preventDefault();
    }
    return;
  }

  // ── Delete/Backspace — delete selected object (only when not in input) ──
  if((e.key==='Delete'||e.key==='Backspace')&&!isInput){
    if(S.currentMode==='slide'&&S.selectedRegion){
      e.preventDefault();
      pushUndo();
      const slide=S.currentDeck.slides[S.selectedRegion.slideIdx];
      if(slide) slide.content[S.selectedRegion.regionId]='';
      window.addMessage(`✓ Cleared ${S.selectedRegion.regionId} on slide ${S.selectedRegion.slideIdx+1}`,'system');
      clearSelection();
      window.renderApp();
    } else if(S.currentMode==='doc'){
      const bid=window.docSelectedBlockId;
      if(bid&&!window.docEditingBlockId){
        e.preventDefault();
        window.docPushUndo();
        window.docDeleteBlock(bid);
        clearSelection();
        window.renderDocMode();
      }
    }
    return;
  }
});

// ═══════════════════════════════════════════
// REGION SELECTION & CONTEXT MENUS
// ═══════════════════════════════════════════

export function handleRegionClick(slideIdx,regionId,role,label,event){
  // If inline editing is active on THIS region, don't interfere
  if(isInlineEditing()&&S.inlineEdit.regionId===regionId)return;
  // If user selected text, don't trigger — let selection tooltip handle it
  const sel=window.getSelection();
  if(sel&&sel.toString().trim().length>0) return;
  // If in move mode and we already have this region selected, ignore
  if(S.fcMoveMode&&S.selectedRegion&&S.selectedRegion.regionId===regionId) return;
  // Single click → select region + enter inline edit directly (no AI menu popup)
  if(role==='image'){
    selectRegion(slideIdx,regionId,role,label,event);
    return;
  }
  selectRegionQuiet(slideIdx,regionId,role,label);
  enterInlineEdit(slideIdx,regionId);
  showSlideDragHandle(true);
}

export function handleRegionDblClick(slideIdx,regionId,role){
  // Double-click: select word (browser default), no extra action needed
  // since single-click already enters edit mode
}

export function selectRegion(slideIdx,regionId,role,label,clickEvent){
  S.selectedRegion={slideIdx,regionId,role,label};
  document.getElementById('selectionBar').style.display='flex';
  document.getElementById('selectionTag').textContent=`Slide ${slideIdx+1} → ${label} (${regionId})`;
  window.renderApp();
  updateFontSizeIndicator();
  // AI menu only for images (no inline edit for images)
  if(clickEvent&&!S.fcDrag&&!S.fcJustDragged&&role==='image') showCtxAiMenu(slideIdx,regionId,role,label,clickEvent);
}

/** Select region without re-render or AI menu (for inline edit entry) */
function selectRegionQuiet(slideIdx,regionId,role,label){
  S.selectedRegion={slideIdx,regionId,role,label};
  const selBar=document.getElementById('selectionBar');
  if(selBar){ selBar.style.display='flex'; }
  const selTag=document.getElementById('selectionTag');
  if(selTag) selTag.textContent=`Slide ${slideIdx+1} → ${label} (${regionId})`;
}

/** Show/hide drag handle at top-left of slide frame */
export function showSlideDragHandle(show){
  let handle=document.getElementById('slideDragHandle');
  if(show){
    const frame=document.getElementById('slideCanvas');
    if(!frame) return;
    if(!handle){
      handle=document.createElement('div');
      handle.id='slideDragHandle';
      handle.className='slide-drag-handle';
      handle.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';
      handle.title='Drag to move slide position';
      frame.parentElement.style.position='relative';
      frame.parentElement.insertBefore(handle,frame);
      // Drag logic
      let startX,startY,origLeft,origTop;
      const onMove=e=>{
        const cx=e.touches?e.touches[0].clientX:e.clientX;
        const cy=e.touches?e.touches[0].clientY:e.clientY;
        frame.style.position='relative';
        frame.style.left=(origLeft+cx-startX)+'px';
        frame.style.top=(origTop+cy-startY)+'px';
      };
      const onUp=()=>{
        document.removeEventListener('mousemove',onMove);
        document.removeEventListener('mouseup',onUp);
        document.removeEventListener('touchmove',onMove);
        document.removeEventListener('touchend',onUp);
      };
      handle.addEventListener('mousedown',e=>{
        e.preventDefault();
        startX=e.clientX; startY=e.clientY;
        origLeft=parseInt(frame.style.left)||0;
        origTop=parseInt(frame.style.top)||0;
        document.addEventListener('mousemove',onMove);
        document.addEventListener('mouseup',onUp);
      });
      handle.addEventListener('touchstart',e=>{
        const t=e.touches[0];
        startX=t.clientX; startY=t.clientY;
        origLeft=parseInt(frame.style.left)||0;
        origTop=parseInt(frame.style.top)||0;
        document.addEventListener('touchmove',onMove,{passive:false});
        document.addEventListener('touchend',onUp);
      },{passive:false});
    }
    handle.style.display='flex';
  } else {
    if(handle) handle.style.display='none';
  }
}

export function clearSelection(){
  if(isInlineEditing()) commitInlineEdit();
  S.selectedRegion=null;
  showSlideDragHandle(false);
  // Doc selection
  window.docSelectedBlockId=null;
  window.docSelectedCaptionBlockId=null;
  document.querySelectorAll('.doc-block.selected').forEach(el=>el.classList.remove('selected'));
  // Shared UI
  document.getElementById('selectionBar').style.display='none';
  hideCtxAiMenu();
  exitMoveMode();
  updateFontSizeIndicator();
  if(S.currentMode==='slide') window.renderApp();
}

// ═══════════════════════════════════════════
// FREE-FORM CANVAS — Drag-to-move & resize regions
// ═══════════════════════════════════════════

export function getRegionBounds(slideIdx,regionId){
  const slide=S.currentDeck.slides[slideIdx];
  if(!slide)return null;
  const ov=(slide.style_overrides||{}).regions||{};
  const rOv=ov[regionId]||{};
  const L=LAYOUTS[slide.layout];
  if(!L)return null;
  const r=L.regions.find(r=>r.id===regionId);
  if(!r)return null;
  return rOv.bounds?{...rOv.bounds}:{...r.bounds};
}

export function setRegionBounds(slideIdx,regionId,bounds){
  const slide=S.currentDeck.slides[slideIdx];
  if(!slide)return;
  if(!slide.style_overrides) slide.style_overrides={};
  if(!slide.style_overrides.regions) slide.style_overrides.regions={};
  if(!slide.style_overrides.regions[regionId]) slide.style_overrides.regions[regionId]={};
  slide.style_overrides.regions[regionId].bounds={x:Math.round(bounds.x),y:Math.round(bounds.y),w:Math.round(bounds.w),h:Math.round(bounds.h)};
}

export function resetRegionBounds(slideIdx,regionId){
  const slide=S.currentDeck?.slides[slideIdx];
  if(!slide?.style_overrides?.regions?.[regionId]?.bounds)return;
  delete slide.style_overrides.regions[regionId].bounds;
  window.addMessage(`✓ Reset "${regionId}" to default position.`,'system');
  pushUndo();
  window.renderApp();
}

export function initFreeformCanvas(){
  const canvas=document.getElementById('slideCanvas');
  if(!canvas)return;

  // ── Helper: compute scale from rendered slide to data coordinates ──
  function getSlideScale(){
    const slideEl=canvas.querySelector('[style*="position:relative"]');
    if(!slideEl)return null;
    const p=PRESETS[S.currentPreset];
    return slideEl.offsetWidth/p.slide.width;
  }

  // ── Helper: get slide element bounding rect + scale ──
  function getSlideInfo(){
    const slideEl=canvas.querySelector('[style*="position:relative"]');
    if(!slideEl)return null;
    const scale=getSlideScale();
    if(!scale)return null;
    return {slideEl,scale,rect:slideEl.getBoundingClientRect()};
  }


  // ── MOUSE ──
  canvas.addEventListener('mousedown',function(e){
    if(!S.currentDeck||!S.selectedRegion||isInlineEditing())return;
    // Move mode is handled by global fcMovePlaceClick — skip canvas handler
    if(S.fcMoveMode)return;

    const handle=e.target.closest('.fc-handle');
    if(!handle)return; // only resize handles use canvas mousedown now

    const info=getSlideInfo();
    if(!info)return;
    const slideIdx=S.selectedRegion.slideIdx;
    const regionId=S.selectedRegion.regionId;
    const origBounds=getRegionBounds(slideIdx,regionId);
    if(!origBounds)return;

    // Resize handle drag (always available on selected regions)
    e.preventDefault();e.stopPropagation();
    document.body.classList.add('fc-dragging');
    S.fcDrag={type:'resize',regionId,slideIdx,startX:e.clientX,startY:e.clientY,origBounds,dir:handle.dataset.dir,scale:info.scale};
  });

  document.addEventListener('mousemove',function(e){
    if(!S.fcDrag||S.fcDrag.type!=='resize')return;
    e.preventDefault();
    const dx=(e.clientX-S.fcDrag.startX)/S.fcDrag.scale;
    const dy=(e.clientY-S.fcDrag.startY)/S.fcDrag.scale;
    const ob=S.fcDrag.origBounds;
    let nx=ob.x,ny=ob.y,nw=ob.w,nh=ob.h;
    const d=S.fcDrag.dir;
    if(d.includes('e'))nw=Math.max(60,ob.w+dx);
    if(d.includes('w')){nw=Math.max(60,ob.w-dx);nx=ob.x+dx;}
    if(d.includes('s'))nh=Math.max(30,ob.h+dy);
    if(d.includes('n')){nh=Math.max(30,ob.h-dy);ny=ob.y+dy;}
    setRegionBounds(S.fcDrag.slideIdx,S.fcDrag.regionId,{x:nx,y:ny,w:nw,h:nh});
    window.renderApp();
  });

  document.addEventListener('mouseup',function(e){
    if(!S.fcDrag)return;
    const moved=Math.abs(e.clientX-S.fcDrag.startX)>2||Math.abs(e.clientY-S.fcDrag.startY)>2;
    if(moved){
      pushUndo(); window.autoSave();
      S.fcJustDragged=true; setTimeout(()=>{S.fcJustDragged=false;},100);
    }
    S.fcDrag=null;
    document.body.classList.remove('fc-dragging');
  });

  // ── TOUCH ──
  canvas.addEventListener('touchstart',function(e){
    if(!S.currentDeck||!S.selectedRegion||isInlineEditing())return;
    // Move mode is handled by global fcMovePlaceTouch — skip canvas handler
    if(S.fcMoveMode)return;

    const t=e.touches[0];
    const el=document.elementFromPoint(t.clientX,t.clientY);
    const handle=el?.closest('.fc-handle');
    if(!handle)return; // only resize handles

    const info=getSlideInfo();
    if(!info)return;
    const slideIdx=S.selectedRegion.slideIdx;
    const regionId=S.selectedRegion.regionId;
    const origBounds=getRegionBounds(slideIdx,regionId);
    if(!origBounds)return;

    e.preventDefault();
    S.fcDrag={type:'resize',regionId,slideIdx,startX:t.clientX,startY:t.clientY,origBounds,dir:handle.dataset.dir,scale:info.scale};
  },{passive:false});

  document.addEventListener('touchmove',function(e){
    if(!S.fcDrag||S.fcDrag.type!=='resize')return;
    e.preventDefault();
    const t=e.touches[0];
    const dx=(t.clientX-S.fcDrag.startX)/S.fcDrag.scale;
    const dy=(t.clientY-S.fcDrag.startY)/S.fcDrag.scale;
    const ob=S.fcDrag.origBounds;
    let nx=ob.x,ny=ob.y,nw=ob.w,nh=ob.h;
    const d=S.fcDrag.dir;
    if(d.includes('e'))nw=Math.max(60,ob.w+dx);
    if(d.includes('w')){nw=Math.max(60,ob.w-dx);nx=ob.x+dx;}
    if(d.includes('s'))nh=Math.max(30,ob.h+dy);
    if(d.includes('n')){nh=Math.max(30,ob.h-dy);ny=ob.y+dy;}
    setRegionBounds(S.fcDrag.slideIdx,S.fcDrag.regionId,{x:nx,y:ny,w:nw,h:nh});
    window.renderApp();
  },{passive:false});

  document.addEventListener('touchend',function(e){
    if(!S.fcDrag)return;
    pushUndo(); window.autoSave();
    S.fcDrag=null;
  });

  // ── Click empty space to deselect ──
  canvas.addEventListener('click',function(e){
    if(!S.selectedRegion||S.fcMoveMode||S.fcJustDragged||isInlineEditing())return;
    // Only deselect if clicked on empty canvas area (not on a region)
    const onRegion=!!e.target.closest('.region-box');
    if(onRegion)return;
    // Don't deselect if user just selected text
    const sel=window.getSelection();
    if(sel&&sel.toString().trim().length>0)return;
    clearSelection();
  });
}

export function enterMoveMode(){
  if(!S.selectedRegion)return;
  const slideIdx=S.selectedRegion.slideIdx;
  const regionId=S.selectedRegion.regionId;
  const origBounds=getRegionBounds(slideIdx,regionId);
  if(!origBounds)return;
  S.fcMoveMode=true;
  S.fcMoveOrigin={slideIdx,regionId,origBounds:{...origBounds}};
  const selEl=document.querySelector('.region-box.selected');
  if(selEl) selEl.classList.add('fc-move-mode');
  // Listen for passive mouse follow
  document.addEventListener('mousemove',fcMoveFollowMouse);
  document.addEventListener('touchmove',fcMoveFollowTouch,{passive:false});
  // Listen for click-to-place (use capture + timeout so current click doesn't fire)
  setTimeout(()=>{
    document.addEventListener('mousedown',fcMovePlaceClick,true);
    document.addEventListener('mouseup',fcMoveSuppressUp,true);
    document.addEventListener('click',fcMoveSuppressUp,true);
    document.addEventListener('touchstart',fcMovePlaceTouch,true);
    document.addEventListener('keydown',fcMoveCancelKey,true);
  },50);
  window.addMessage('✥ Move mode: move cursor to reposition, click to place. Esc to cancel.','system');
}

export function exitMoveMode(cancelled,keepSuppressUp){
  if(!S.fcMoveMode)return;
  S.fcMoveMode=false;
  document.removeEventListener('mousemove',fcMoveFollowMouse);
  document.removeEventListener('touchmove',fcMoveFollowTouch);
  document.removeEventListener('mousedown',fcMovePlaceClick,true);
  if(!keepSuppressUp){
    document.removeEventListener('mouseup',fcMoveSuppressUp,true);
    document.removeEventListener('click',fcMoveSuppressUp,true);
  }
  document.removeEventListener('touchstart',fcMovePlaceTouch,true);
  document.removeEventListener('keydown',fcMoveCancelKey,true);
  document.querySelectorAll('.fc-move-mode').forEach(el=>el.classList.remove('fc-move-mode'));
  if(cancelled&&S.fcMoveOrigin){
    // Restore original position
    setRegionBounds(S.fcMoveOrigin.slideIdx,S.fcMoveOrigin.regionId,S.fcMoveOrigin.origBounds);
    window.renderApp();
  }
  S.fcMoveOrigin=null;
}

// Passive follow: region tracks mouse cursor (no button held)
function fcMoveFollowMouse(e){
  if(!S.fcMoveMode||!S.fcMoveOrigin||S.fcDrag)return;
  _fcMoveFollow(e.clientX,e.clientY);
}

function fcMoveFollowTouch(e){
  if(!S.fcMoveMode||!S.fcMoveOrigin||S.fcDrag)return;
  e.preventDefault();
  const t=e.touches[0];
  _fcMoveFollow(t.clientX,t.clientY);
}

function _fcMoveFollow(clientX,clientY){
  const canvas=document.getElementById('slideCanvas');
  if(!canvas)return;
  const slideEl=canvas.querySelector('[style*="position:relative"]');
  if(!slideEl)return;
  const p=PRESETS[S.currentPreset];
  const scale=slideEl.offsetWidth/p.slide.width;
  const rect=slideEl.getBoundingClientRect();
  const mx=p.spacing.margin.left, my=p.spacing.margin.top;
  const ob=S.fcMoveOrigin.origBounds;
  const newX=(clientX-rect.left)/scale-mx-ob.w/2;
  const newY=(clientY-rect.top)/scale-my-ob.h/2;
  setRegionBounds(S.fcMoveOrigin.slideIdx,S.fcMoveOrigin.regionId,{x:Math.round(newX),y:Math.round(newY),w:ob.w,h:ob.h});
  window.renderApp();
}

// Click to place
function fcMovePlaceClick(e){
  if(!S.fcMoveMode)return;
  e.preventDefault();e.stopPropagation();
  pushUndo();window.autoSave();
  window.addMessage('✓ Region placed.','system');
  // Don't remove mouseup/click suppress yet — let fcMoveSuppressUp handle the follow-up events
  const keepSuppressUp=true;
  exitMoveMode(false,keepSuppressUp);
  S.fcJustDragged=true;setTimeout(()=>{S.fcJustDragged=false;},150);
}

function fcMovePlaceTouch(e){
  if(!S.fcMoveMode)return;
  e.preventDefault();e.stopPropagation();
  pushUndo();window.autoSave();
  window.addMessage('✓ Region placed.','system');
  exitMoveMode(false);
  S.fcJustDragged=true;setTimeout(()=>{S.fcJustDragged=false;},150);
}

// Suppress mouseup/click after placing so region onmouseup doesn't open context menu
function fcMoveSuppressUp(e){
  e.preventDefault();e.stopPropagation();
  // Remove self after one use (placed already, just cleaning up)
  document.removeEventListener('mouseup',fcMoveSuppressUp,true);
  document.removeEventListener('click',fcMoveSuppressUp,true);
}

function fcMoveCancelKey(e){
  if(!S.fcMoveMode)return;
  if(e.key==='Escape'){
    e.preventDefault();e.stopPropagation();
    window.addMessage('✥ Move cancelled.','system');
    exitMoveMode(true);
  }
}

// ═══════════════════════════════════════════
// TEXT SELECTION TOOLTIP — moved to sel-toolbar.js (shared module)
// Re-export for backward compat with existing onclick handlers
// ═══════════════════════════════════════════
export { showTextSelTooltip, hideTextSelTooltip, updateSelTooltipForMode,
         selToolbarShowAI, selToolbarBack, selToolbarCut, selToolbarPaste,
         selToolbarAiAction, selToolbarAskAI,
         showSheetRangeToolbar, shRangeCopy, shRangePaste, shRangeDelete
       } from './sel-toolbar.js?v=20260317c29';

export function editFromSelection(){
  hideTextSelTooltip();
  // Find the region element containing the selection
  const sel=window.getSelection();
  const anchor=sel?.anchorNode;
  const regionEl=anchor?.parentElement?.closest?.('.region-box')||anchor?.closest?.('.region-box');
  if(!regionEl)return;
  const regionId=regionEl.dataset.region;
  const slideIdx=parseInt(regionEl.dataset.slide);
  if(regionId===undefined||isNaN(slideIdx))return;
  sel.removeAllRanges();
  // Select the region first, then enter inline edit
  const L=LAYOUTS[S.currentDeck.slides[slideIdx].layout];
  const r=L?.regions.find(r=>r.id===regionId);
  if(r){
    const roleLabel=r.role.charAt(0).toUpperCase()+r.role.slice(1);
    S.selectedRegion={slideIdx,regionId,role:r.role,label:roleLabel};
    document.getElementById('selectionBar').style.display='flex';
    document.getElementById('selectionTag').textContent=`Slide ${slideIdx+1} → ${roleLabel} (${regionId})`;
  }
  enterInlineEdit(slideIdx,regionId);
}

export function copySelectionToChat(){
  const sel=window.getSelection();
  const text=sel?.toString()?.trim();
  if(!text)return;
  hideTextSelTooltip();
  const input=document.getElementById('chatInput');
  // Pre-fill with the selected text in quotes and place cursor for instruction
  input.value=`"${text}" ← `;
  input.focus();
  // Place cursor at end
  input.selectionStart=input.selectionEnd=input.value.length;
  // Clear the text selection
  sel.removeAllRanges();
}

export function copySelectionToClipboard(){
  const sel=window.getSelection();
  const text=sel?.toString()?.trim();
  if(!text)return;
  navigator.clipboard.writeText(text).then(()=>{
    hideTextSelTooltip();
    window.addMessage(`📋 Copied: "${text.slice(0,50)}${text.length>50?'...':''}"`, 'system');
  }).catch(()=>{
    // Fallback
    hideTextSelTooltip();
  });
  sel.removeAllRanges();
}

// ═══════════════════════════════════════════
// CONTEXT AI MENU — Smart actions on region click
// ═══════════════════════════════════════════

export function getRegionContent(slideIdx,regionId){
  if(!S.currentDeck||!S.currentDeck.slides[slideIdx])return null;
  return S.currentDeck.slides[slideIdx].content[regionId]||null;
}

export function getContentPreview(content){
  if(!content) return '';
  if(typeof content==='string') return content.slice(0,80);
  if(typeof content==='object'){
    if(content.type==='table') return `Table (${content.headers?.length||0} cols × ${content.rows?.length||0} rows)`;
    if(content.type==='list') return `List (${content.items?.length||0} items)`;
    if(content.type==='image') return content.alt||'Image';
  }
  return JSON.stringify(content).slice(0,60);
}

export function generateCtxSuggestions(role,regionId,content){
  const suggestions=[];
  const isText=typeof content==='string';
  const isTable=typeof content==='object'&&content?.type==='table';
  const isList=typeof content==='object'&&content?.type==='list';
  const isImage=typeof content==='object'&&content?.type==='image';
  const textLen=isText?content.length:0;

  // ════════ DIRECT ACTIONS (non-AI, at top) ════════
  if(!isImage){
    suggestions.push({icon:'✏️',text:'Edit text directly',hint:'Or double-click',action:`__edit__${regionId}`});
  }
  suggestions.push({icon:'✥',text:'Move / reposition',hint:'Drag to new location',action:`__move__${regionId}`});
  // Reset position if customized
  if(S.currentDeck&&S.currentDeck.slides[S.selectedRegion?.slideIdx]){
    const slide=S.currentDeck.slides[S.selectedRegion.slideIdx];
    if(slide.style_overrides?.regions?.[regionId]?.bounds){
      suggestions.push({icon:'📍',text:'Reset position',hint:'Back to default layout',action:`__reset_bounds__${regionId}`});
    }
  }
  suggestions.push({icon:'🔀',text:'Change layout',hint:'Different arrangement',action:`Change this slide to a different layout`});

  // ════════ AI SUGGESTIONS (below divider) ════════
  suggestions.push({type:'divider'});

  if(isText&&textLen>0){
    suggestions.push({icon:'✨',text:'Rewrite concisely',hint:'Shorter, same meaning',action:`Rewrite the ${regionId} region to be more concise`});
    suggestions.push({icon:'🌐',text:'Translate',hint:'To English or any language',action:`Translate the ${regionId} region to English`});
  }

  if(role==='title'||role==='heading'){
    suggestions.push({icon:'💡',text:'More impactful',hint:'Punchy, attention-grabbing',action:`Make the ${regionId} more impactful and attention-grabbing`});
    suggestions.push({icon:'📐',text:'Shorten title',hint:'Max 5 words',action:`Shorten the ${regionId} to 5 words or fewer`});
  }

  if(role==='body'){
    if(isText&&textLen>100){
      suggestions.push({icon:'📊',text:'Key data points',hint:'Extract 3-4 bullet stats',action:`Convert the ${regionId} into 3-4 key data points with numbers`});
      suggestions.push({icon:'📋',text:'Bullet list',hint:'Structured, scannable',action:`Convert the ${regionId} text into a structured bullet list`});
    }
    if(isText&&textLen>0){
      suggestions.push({icon:'📈',text:'Add numbers',hint:'Statistics, metrics',action:`Enhance the ${regionId} by adding concrete numbers, statistics, or metrics`});
      suggestions.push({icon:'🎯',text:'More persuasive',hint:'Stronger language',action:`Make the ${regionId} more persuasive with stronger language`});
    }
    suggestions.push({icon:'📊',text:'Comparison table',hint:'Side-by-side layout',action:`Convert this slide's content into a data-table layout with a comparison table`});
  }

  if(role==='subtitle'||role==='caption'){
    suggestions.push({icon:'✏️',text:'Expand with detail',hint:'Add context',action:`Expand the ${regionId} with more detail and context`});
  }

  if(role==='quote'){
    suggestions.push({icon:'🔄',text:'Better quote',hint:'More relevant',action:`Replace the quote with a more impactful one on the same topic`});
  }

  if(isTable){
    suggestions.push({icon:'📈',text:'Add trends column',hint:'Growth %, YoY',action:`Add a growth/trends column to the table on this slide`});
    suggestions.push({icon:'🔢',text:'Sort by value',hint:'Reorder rows',action:`Sort the table rows by the main numeric column, highest first`});
  }

  if(isList){
    suggestions.push({icon:'✨',text:'Strengthen points',hint:'More specific',action:`Rewrite each bullet point in the ${regionId} to be more specific and data-driven`});
  }

  // ════════ DANGER ZONE ════════
  suggestions.push({type:'divider'});
  suggestions.push({icon:'🗑️',text:'Clear this region',hint:'Remove content',action:`__clear__${regionId}`,danger:true});

  return suggestions;
}

export function showCtxAiMenu(slideIdx,regionId,role,label,clickEvent){
  const content=getRegionContent(slideIdx,regionId);
  const suggestions=generateCtxSuggestions(role,regionId,content);
  // Find the clicked region element on the canvas for anchoring
  const regionEl=document.querySelector(`[data-region="${regionId}"]`);
  renderCtxMenuPopup({
    title: label,
    suggestions,
    execFn: 'execCtxAction',
    placeholder: 'Ask AI to change this...',
    customExecCode: 'execCtxCustom()',
    clickEvent,
    anchorEl: regionEl
  });
}

// ── Shared context menu renderer (used by slide, doc, and caption menus) ──
export function renderCtxMenuPopup({title, suggestions, execFn, placeholder, customExecCode, clickEvent, anchorEl}){
  const menu=document.getElementById('ctxAiMenu');
  let html=`<div class="ctx-ai-header">
    <span class="ctx-region-name">${title}</span>
    <button class="ctx-close" onclick="event.stopPropagation();hideCtxAiMenu()">×</button>
  </div>`;
  html+=`<div class="ctx-ai-actions">`;
  let afterFirstDivider=false;
  suggestions.forEach(s=>{
    if(s.type==='divider'){
      html+=afterFirstDivider?`<div class="ctx-ai-divider"></div>`
        :`<div class="ctx-ai-divider"><span class="ctx-section-label">✦ AI Suggestions</span></div>`;
      afterFirstDivider=true;
      return;
    }
    const cls=s.danger?'ctx-ai-btn danger':'ctx-ai-btn';
    const ds=s.danger?'color:#D55B5B;':'';
    html+=`<button class="${cls}" style="${ds}" onclick="event.stopPropagation();${execFn}('${s.action.replace(/'/g,"\\'")}')">
      <span class="ctx-btn-icon">${s.icon}</span>
      <span class="ctx-btn-text">${s.text}<span class="ctx-btn-hint">${s.hint||''}</span></span>
    </button>`;
  });
  html+=`</div>`;
  html+=`<div class="ctx-ai-input">
    <input type="text" id="ctxMenuInput" placeholder="${placeholder||'Ask AI to change this...'}" onkeydown="if(event.key==='Enter'){event.stopPropagation();${customExecCode}}">
    <button onclick="event.stopPropagation();${customExecCode}">Go</button>
  </div>`;
  menu.innerHTML=html;

  // Position: anchor to element's right side, fallback to click position
  menu.style.display='block';
  const menuW=menu.offsetWidth, menuH=menu.offsetHeight;
  const vw=window.innerWidth, vh=window.innerHeight;
  let x,y;
  if(anchorEl){
    const rect=anchorEl.getBoundingClientRect();
    x=rect.right+8; // right side of block
    y=rect.top;      // aligned to top of block
    // If no room on right, try left side
    if(x+menuW>vw-10) x=rect.left-menuW-8;
    // If still no room, fall back to centered below
    if(x<10){ x=Math.max(10, (rect.left+rect.right)/2 - menuW/2); y=rect.bottom+8; }
  } else {
    x=clickEvent.clientX+8;
    y=clickEvent.clientY-20;
  }
  if(x+menuW>vw-10) x=vw-menuW-10;
  if(x<10) x=10;
  if(y+menuH>vh-10) y=vh-menuH-10;
  if(y<10) y=10;
  menu.style.position='fixed';
  menu.style.left=x+'px';
  menu.style.top=y+'px';
  setTimeout(()=>{ const inp=document.getElementById('ctxMenuInput'); if(inp) inp.focus(); },100);
}

export function hideCtxAiMenu(){
  const menu=document.getElementById('ctxAiMenu');
  if(menu) menu.style.display='none';
}

export function execCtxAction(action){
  hideCtxAiMenu();
  // Handle special actions
  if(action.startsWith('__clear__')){
    const regionId=action.replace('__clear__','');
    if(!S.currentDeck||!S.currentDeck.slides[S.currentSlide])return;
    pushUndo();
    S.currentDeck.slides[S.currentSlide].content[regionId]='';
    window.addMessage(`✓ Cleared ${regionId} on slide ${S.currentSlide+1}`,'system');
    clearSelection();
    window.renderApp();
    return;
  }
  if(action.startsWith('__reset_bounds__')){
    const regionId=action.replace('__reset_bounds__','');
    resetRegionBounds(S.currentSlide,regionId);
    return;
  }
  if(action.startsWith('__move__')){
    enterMoveMode();
    return;
  }
  if(action.startsWith('__edit__')){
    const regionId=action.replace('__edit__','');
    if(S.selectedRegion) enterInlineEdit(S.selectedRegion.slideIdx,regionId);
    return;
  }
  // Normal AI actions: inject into chat input and send
  const input=document.getElementById('chatInput');
  input.value=action;
  window.sendMessage();
}

export function execCtxCustom(){
  const inp=document.getElementById('ctxMenuInput');
  if(!inp||!inp.value.trim())return;
  hideCtxAiMenu();
  const input=document.getElementById('chatInput');
  input.value=inp.value.trim();
  window.sendMessage();
}

// Close ctx menu on click outside
document.addEventListener('click',function(e){
  const menu=document.getElementById('ctxAiMenu');
  if(menu&&menu.style.display!=='none'&&!menu.contains(e.target)){
    hideCtxAiMenu();
  }
});

export function updateFontSizeIndicator(){
  const el=document.getElementById('fontSizeIndicator');
  if(!el)return;
  if(!S.currentDeck||!S.currentDeck.slides[S.currentSlide]){
    el.textContent='--';
    el.classList.remove('has-selection');
    return;
  }
  const slide=S.currentDeck.slides[S.currentSlide];
  const ov=slide.style_overrides||{};
  const regionOv=ov.regions||{};
  const p=PRESETS[S.currentPreset];
  if(S.selectedRegion&&S.selectedRegion.slideIdx===S.currentSlide){
    // Show the selected region's font size
    const rId=S.selectedRegion.regionId;
    const rOv=regionOv[rId]||{};
    const L=LAYOUTS[slide.layout];
    const regionDef=L?L.regions.find(r=>r.id===rId):null;
    const sk=regionDef?.fontSize||'body';
    const SC = {title:0,h1:1,h2:2,body:3,caption:4,small:5};
    const defaultFs=p.typography.scale[SC[sk]]||16;
    const effectiveFs=rOv.font_size||ov.font_size||defaultFs;
    el.textContent=effectiveFs+'px';
    el.classList.add('has-selection');
  }else{
    // No selection — show body default
    const SC = {title:0,h1:1,h2:2,body:3,caption:4,small:5};
    const defaultFs=ov.font_size||p.typography.scale[SC['body']]||18;
    el.textContent=defaultFs+'px';
    el.classList.remove('has-selection');
  }
}

// ═══════════════════════════════════════════
// SLIDE RENDERER
// ═══════════════════════════════════════════

export const SC = {title:0,h1:1,h2:2,body:3,caption:4,small:5};

export function rs(role,p){
  const h=p.typography.heading,b=p.typography.body;
  const m={title:{color:p.colors.primary,ff:h.family,fw:h.weight,ls:h.letterSpacing},subtitle:{color:p.colors.secondary,ff:h.family,fw:400},heading:{color:p.colors.primary,ff:h.family,fw:h.weight,ls:h.letterSpacing},body:{color:p.colors.primary,ff:b.family,fw:b.weight,lh:b.lineHeight},caption:{color:p.colors.secondary,ff:b.family,fw:400},quote:{color:p.colors.primary,ff:h.family,fw:h.weight,fs:"italic",lh:1.4},author:{color:p.colors.primary,ff:b.family,fw:700},table:{color:p.colors.primary,ff:b.family,fw:b.weight}};
  return m[role]||m.body;
}

function rc(content,role,p,region,colorOv,fontSizeOv){
  if(!content) return '';
  const s=rs(role,p);
  // Apply color override: colorOv overrides preset color for ALL text
  const txtColor=colorOv||s.color;
  const sk=region.fontSize||'body';
  const fs=fontSizeOv||p.typography.scale[SC[sk]]||16;

  if(role==='image'){
    if(typeof content==='object'&&content.type==='image'&&content.dataUrl){
      // Real image with data URL — render actual image
      const imgStyle=content.fit||'contain'; // contain, cover, or fill
      const imgW=content.displayW?content.displayW+'px':'100%';
      const imgH=content.displayH?content.displayH+'px':'100%';
      const offX=content.offsetX||0;
      const offY=content.offsetY||0;
      return `<div style="width:100%;height:100%;overflow:hidden;display:flex;align-items:center;justify-content:center;">
        <img src="${content.dataUrl}" alt="${content.alt||content.name||'Image'}" style="width:${imgW};height:${imgH};object-fit:${imgStyle};transform:translate(${offX}px,${offY}px);pointer-events:none;">
      </div>`;
    }
    if(typeof content==='object'&&content.type==='image'){
      // Placeholder (no image data yet)
      return `<div style="width:100%;height:100%;border:2px dashed ${p.colors.border};border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:${p.colors.surface};">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${p.colors.secondary}" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        <span style="font-family:Arial;font-size:12px;color:${p.colors.secondary};">${content.alt||content.src||'Image'}</span>
      </div>`;
    }
    return '';
  }

  if(typeof content==='object'&&content.type==='table'){
    const hBg=p.colors.table_header_bg,hT=colorOv||p.colors.table_header_text,alt=p.colors.table_row_alt,bc=p.colors.border,tc=txtColor;
    const tf=fs*0.9;
    let h=`<table style="width:100%;border-collapse:collapse;font-family:Arial;font-size:${tf}px;"><thead><tr>`;
    const hdrs=Array.isArray(content.headers)?content.headers:[];
    hdrs.forEach(x=>{h+=`<th style="background:${hBg};color:${hT};padding:12px 16px;text-align:left;font-weight:700;font-size:${tf*0.9}px;border-bottom:2px solid ${bc};">${x}</th>`;});
    h+='</tr></thead><tbody>';
    const rows=Array.isArray(content.rows)?content.rows:[];
    rows.forEach((r,i)=>{h+=`<tr style="background:${i%2===1?alt:'transparent'};">`;const cells=Array.isArray(r)?r:(typeof r==='object'&&r?Object.values(r):[String(r)]);cells.forEach((c,j)=>{h+=`<td style="padding:10px 16px;border-bottom:1px solid ${bc};color:${tc};font-weight:${j===0?500:400};">${c}</td>`;});h+='</tr>';});
    return h+'</tbody></table>';
  }

  if(typeof content==='object'&&content.type==='list'){
    const g=p.spacing.paragraph;
    return content.items.map(item=>`<div style="display:flex;align-items:flex-start;margin-bottom:${g}px;font-size:${fs}px;color:${txtColor};font-family:${s.ff};font-weight:${s.fw};line-height:${s.lh||1.5};"><span style="color:${colorOv||p.colors.secondary};margin-right:14px;flex-shrink:0;font-size:7px;margin-top:${fs*0.4}px;">●</span><span>${item}</span></div>`).join('');
  }

  if(typeof content==='string'){
    let pre='';
    if(role==='quote') pre=`<span style="font-size:${fs*1.5}px;color:${colorOv||p.colors.secondary};margin-right:2px;">"</span>`;
    return `<div style="font-size:${fs}px;color:${txtColor};font-family:${s.ff};font-weight:${s.fw};font-style:${s.fs||'normal'};line-height:${s.lh||1.3};letter-spacing:${s.ls||0}px;">${pre}${content}</div>`;
  }
  return '';
}

export function renderSlide(slide,idx,p,total){
  try{ return _renderSlideInner(slide,idx,p,total); }
  catch(e){ console.warn('[renderSlide] Error on slide',idx,e); return `<div style="padding:40px;color:#e8913a;font-family:Arial;font-size:14px;">⚠ Slide ${idx+1} has corrupt data.<br><span style="font-size:11px;color:#888;">${e.message}</span></div>`; }
}
function _renderSlideInner(slide,idx,p,total){
  const L=LAYOUTS[slide.layout];
  if(!L)return `<div style="padding:40px;color:red;">Unknown layout: ${slide.layout}</div>`;
  const W=p.slide.width,H=p.slide.height,m=p.spacing.margin;
  const ov=slide.style_overrides||{};
  const regionOv=ov.regions||{}; // per-region overrides: {title:{color:"#hex"}, body:{color:"#hex"}}
  const bg=ov.background||(L.background_override==='surface'?p.colors.surface:p.colors.background);
  const globalColor=ov.heading_color||null;
  const fontOv=ov.font||null;
  let html=`<div style="width:${W}px;height:${H}px;position:relative;background:${bg};overflow:hidden;">`;
  L.regions.forEach(r=>{
    const c=slide.content[r.id];
    if(!c&&r.optional)return;
    if(!c)return;
    // FREE-FORM CANVAS: per-region bounds override
    const rOv=regionOv[r.id]||{};
    const b=rOv.bounds||r.bounds; // custom position > layout default
    const ax=m.left+b.x,ay=m.top+b.y;
    const bw=b.w||r.bounds.w, bh=b.h||r.bounds.h;
    const al=r.align||{};
    const jc=al.vertical==='middle'?'center':al.vertical==='bottom'?'flex-end':'flex-start';
    // Per-region overrides: region-specific > global > null (use preset)
    const regionColor=rOv.color||globalColor||null;
    const regionFont=rOv.font||fontOv||null;
    // Text decorations: region-specific > global
    const isUnderline=rOv.underline!==undefined?rOv.underline:(ov.underline||false);
    const isBold=rOv.bold!==undefined?rOv.bold:(ov.bold||false);
    const isItalic=rOv.italic!==undefined?rOv.italic:(ov.italic||false);
    let extra='';
    if(regionColor)extra+=`color:${regionColor};`;
    if(regionFont)extra+=`font-family:'${regionFont}',Arial,sans-serif;`;
    let deco=[];
    if(isUnderline)deco.push('underline');
    if(deco.length)extra+=`text-decoration:${deco.join(' ')};`;
    if(isBold)extra+=`font-weight:700;`;
    if(isItalic)extra+=`font-style:italic;`;
    // Font size override: region-specific > global > null
    const regionFontSize=rOv.font_size||ov.font_size||null;
    // Clickable region selection
    const isSel=S.selectedRegion&&S.selectedRegion.slideIdx===idx&&S.selectedRegion.regionId===r.id;
    const selClass=isSel?'region-box selected':'region-box';
    const roleLabel=r.role.charAt(0).toUpperCase()+r.role.slice(1);
    html+=`<div class="${selClass}" data-region="${r.id}" data-slide="${idx}" onmouseup="event.stopPropagation();handleRegionClick(${idx},'${r.id}','${r.role}','${roleLabel}',event)" ondblclick="event.stopPropagation();handleRegionDblClick(${idx},'${r.id}','${r.role}')" style="position:absolute;left:${ax}px;top:${ay}px;width:${bw}px;height:${bh}px;display:flex;flex-direction:column;justify-content:${jc};text-align:${al.horizontal||'left'};overflow:hidden;${extra}">`;
    html+=rc(c,r.role,p,r,regionColor,regionFontSize);
    // Resize handles on selected region
    if(isSel){
      html+=`<div class="fc-handle fc-handle-se" data-dir="se"></div>`;
      html+=`<div class="fc-handle fc-handle-sw" data-dir="sw"></div>`;
      html+=`<div class="fc-handle fc-handle-ne" data-dir="ne"></div>`;
      html+=`<div class="fc-handle fc-handle-nw" data-dir="nw"></div>`;
    }
    html+='</div>';
  });
  // Render floating images (overlays on top of content)
  if(slide.images&&slide.images.length>0){
    slide.images.forEach(fi=>{
      html+=`<div style="position:absolute;left:${fi.x}px;top:${fi.y}px;width:${fi.w}px;height:${fi.h}px;overflow:hidden;pointer-events:none;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.2);">
        <img src="${fi.dataUrl}" alt="${fi.name||'image'}" style="width:100%;height:100%;object-fit:${fi.fit||'contain'};pointer-events:none;">
      </div>`;
    });
  }
  html+=`<div style="position:absolute;bottom:${m.bottom*0.4}px;right:${m.right}px;font-family:Arial;font-size:${p.typography.scale[5]}px;color:${p.colors.secondary};opacity:0.4;">${idx+1}</div>`;
  html+='</div>';
  return html;
}

// ═══════════════════════════════════════════
// ONBOARDING UI
// ═══════════════════════════════════════════

const ONBOARDING_PROMPTS=[
  {icon:'🎯',text:'Create a 5-slide deck about AI trends in 2026'},
  {icon:'🚀',text:'Build a startup pitch deck for a food delivery app'},
  {icon:'📊',text:'Make a quarterly business review with charts and data'},
  {icon:'🎓',text:'Design a lecture about climate change for students'},
];

export function useOnboardingPrompt(text){
  const input=document.getElementById('chatInput');
  input.value=text;
  input.focus();
  // Remove onboarding UI
  const ob=document.getElementById('chatOnboarding');
  if(ob)ob.remove();
  // Auto-send
  window.sendMessage();
}

export function renderChatOnboarding(){
  const msgs=document.getElementById('chatMessages');
  const existing=document.getElementById('chatOnboarding');
  // Show onboarding only when chat is empty (no user messages yet)
  const hasMessages=msgs.querySelector('.msg');
  if(hasMessages){
    if(existing)existing.remove();
    return;
  }
  if(existing)return; // already showing
  const div=document.createElement('div');
  div.id='chatOnboarding';
  div.className='chat-onboarding';
  div.innerHTML=`
    <div class="chat-onboarding-title">What would you like to create?<br><span style="color:#333;font-size:10px;">Click a suggestion or type your own</span></div>
    <div class="chat-onboarding-chips">
      ${ONBOARDING_PROMPTS.map(p=>`<button class="chat-chip" onclick="useOnboardingPrompt('${p.text.replace(/'/g,"\\'")}')"><span class="chip-icon">${p.icon}</span>${p.text}</button>`).join('')}
    </div>
  `;
  msgs.appendChild(div);
}

// ═══════════════════════════════════════════
// INLINE TEXT EDITING — Edit region text directly on the slide
// ═══════════════════════════════════════════

export function enterInlineEdit(slideIdx,regionId){
  if(S.inlineEdit?.active) commitInlineEdit(); // commit previous edit first
  const slide=S.currentDeck?.slides[slideIdx];
  if(!slide)return;
  const content=slide.content[regionId];
  // Only support inline edit for string, list, and table content
  if(!content)return;

  S.inlineEdit={slideIdx,regionId,active:true};
  pushUndo();
  hideCtxAiMenu();

  // Find the region element and make it editable
  const regionEl=document.querySelector(`.region-box[data-region="${regionId}"][data-slide="${slideIdx}"]`);
  if(!regionEl)return;

  // Add editing class for visual feedback
  regionEl.classList.add('inline-editing');

  if(typeof content==='string'){
    // Simple text: make the inner div contenteditable
    const textDiv=regionEl.querySelector('div');
    if(!textDiv)return;
    textDiv.contentEditable='true';
    textDiv.focus();
    // Place cursor at end
    const range=document.createRange();
    const sel=window.getSelection();
    range.selectNodeContents(textDiv);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    // Listen for blur and keydown
    textDiv.addEventListener('blur',onInlineEditBlur);
    textDiv.addEventListener('keydown',onInlineEditKeydown);
  }else if(typeof content==='object'&&content.type==='list'){
    // List: make each bullet item editable via a simple editable div
    const itemDivs=regionEl.querySelectorAll('div[style*="display:flex"] > span:last-child');
    itemDivs.forEach(span=>{
      span.contentEditable='true';
      span.addEventListener('blur',onInlineEditBlur);
      span.addEventListener('keydown',onInlineEditKeydown);
    });
    if(itemDivs.length>0) itemDivs[0].focus();
  }else if(typeof content==='object'&&content.type==='table'){
    // Table: make cells editable
    const cells=regionEl.querySelectorAll('td, th');
    cells.forEach(cell=>{
      cell.contentEditable='true';
      cell.style.cursor='text';
      cell.addEventListener('blur',onInlineEditBlur);
      cell.addEventListener('keydown',onInlineEditKeydown);
    });
    if(cells.length>0) cells[0].focus();
  }
}

function onInlineEditBlur(e){
  // Small delay to check if focus moved to another editable element in the same region
  setTimeout(()=>{
    if(!S.inlineEdit?.active)return;
    const regionEl=document.querySelector(`.region-box[data-region="${S.inlineEdit.regionId}"][data-slide="${S.inlineEdit.slideIdx}"]`);
    if(regionEl&&regionEl.contains(document.activeElement))return; // still editing within the region
    commitInlineEdit();
  },150);
}

function onInlineEditKeydown(e){
  if(e.key==='Escape'){
    e.preventDefault();
    commitInlineEdit();
    return;
  }
  // Allow all normal text editing keys (arrows, backspace, delete, typing, etc.)
  // Stop propagation so slide keyboard shortcuts (arrow keys for navigation) don't interfere
  e.stopPropagation();

  // Tab in tables: move to next cell
  if(e.key==='Tab'&&S.inlineEdit?.active){
    const slide=S.currentDeck?.slides[S.inlineEdit.slideIdx];
    if(slide&&typeof slide.content[S.inlineEdit.regionId]==='object'&&slide.content[S.inlineEdit.regionId].type==='table'){
      e.preventDefault();
      const cells=document.querySelectorAll(`.region-box[data-region="${S.inlineEdit.regionId}"] td[contenteditable], .region-box[data-region="${S.inlineEdit.regionId}"] th[contenteditable]`);
      const arr=Array.from(cells);
      const idx=arr.indexOf(e.target);
      const next=e.shiftKey?arr[idx-1]:arr[idx+1];
      if(next) next.focus();
    }
  }
}

export function commitInlineEdit(){
  if(!S.inlineEdit?.active)return;
  const {slideIdx,regionId}=S.inlineEdit;
  const slide=S.currentDeck?.slides[slideIdx];
  if(!slide){S.inlineEdit=null;return;}

  const regionEl=document.querySelector(`.region-box[data-region="${regionId}"][data-slide="${slideIdx}"]`);
  const content=slide.content[regionId];

  if(regionEl&&typeof content==='string'){
    const textDiv=regionEl.querySelector('div[contenteditable]');
    if(textDiv){
      // Get the text content (strip HTML from any paste)
      slide.content[regionId]=textDiv.innerText||textDiv.textContent||'';
      textDiv.contentEditable='false';
      textDiv.removeEventListener('blur',onInlineEditBlur);
      textDiv.removeEventListener('keydown',onInlineEditKeydown);
    }
  }else if(regionEl&&typeof content==='object'&&content.type==='list'){
    const itemSpans=regionEl.querySelectorAll('span[contenteditable]');
    const newItems=Array.from(itemSpans).map(s=>s.innerText||s.textContent||'').filter(t=>t.trim());
    slide.content[regionId]={...content,items:newItems};
    itemSpans.forEach(span=>{
      span.contentEditable='false';
      span.removeEventListener('blur',onInlineEditBlur);
      span.removeEventListener('keydown',onInlineEditKeydown);
    });
  }else if(regionEl&&typeof content==='object'&&content.type==='table'){
    const headerCells=regionEl.querySelectorAll('th[contenteditable]');
    const dataCells=regionEl.querySelectorAll('td[contenteditable]');
    const newHeaders=Array.from(headerCells).map(c=>c.innerText||c.textContent||'');
    const colCount=newHeaders.length||content.headers.length;
    const allData=Array.from(dataCells).map(c=>c.innerText||c.textContent||'');
    const newRows=[];
    for(let i=0;i<allData.length;i+=colCount){
      newRows.push(allData.slice(i,i+colCount));
    }
    slide.content[regionId]={...content,headers:newHeaders.length?newHeaders:content.headers,rows:newRows};
    [...headerCells,...dataCells].forEach(cell=>{
      cell.contentEditable='false';
      cell.removeEventListener('blur',onInlineEditBlur);
      cell.removeEventListener('keydown',onInlineEditKeydown);
    });
  }

  if(regionEl) regionEl.classList.remove('inline-editing');
  S.inlineEdit=null;
  window.autoSave();
  window.renderApp();
}

export function isInlineEditing(){
  return !!(S.inlineEdit?.active);
}

// ═══════════════════════════════════════════
// SLIDE EXPORT
// ═══════════════════════════════════════════

export function exportSlidePDF(){
  if(!S.currentDeck||!S.currentDeck.slides||!S.currentDeck.slides.length){
    window.addMessage('No slides to export.','system');
    return;
  }
  const p=PRESETS[S.currentPreset]||PRESETS['clean-white'];
  const slides=S.currentDeck.slides;
  const W=p.slide.width, H=p.slide.height;

  // Render each slide as HTML
  const slidePages=slides.map((s,i)=>{
    const inner=renderSlide(s,i,p,slides.length);
    // Each slide is a print page
    return `<div class="slide-page">${inner}</div>`;
  }).join('\n');

  const html=`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${_esc(S.currentDeck.title||'Slides')} — PDF Export</title>
<style>
@page{size:${W}px ${H}px;margin:0;}
*{margin:0;padding:0;box-sizing:border-box;}
body{margin:0;padding:0;background:#fff;}
.slide-page{width:${W}px;height:${H}px;overflow:hidden;page-break-after:always;position:relative;}
.slide-page:last-child{page-break-after:auto;}
@media screen{
  body{background:#888;display:flex;flex-direction:column;align-items:center;gap:20px;padding:20px;}
  .slide-page{box-shadow:0 4px 20px rgba(0,0,0,0.3);border-radius:4px;flex-shrink:0;}
}
/* region text styling inherited from renderSlide inline styles */
</style>
</head><body>
${slidePages}
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;

  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const w=window.open(url,'_blank');
  if(w){
    window.addMessage('✓ Slides opened for PDF export. Use Print → Save as PDF (set margins to None for best results).','system');
  } else {
    window.addMessage('Pop-up blocked! Please allow pop-ups for this site and try again.','system');
  }
}

function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ═══════════════════════════════════════════
// SLIDE NAVIGATION & PRESETS
// ═══════════════════════════════════════════

export function goSlide(i){
  if(i===S.currentSlide)return;
  S.slideAnimDir=i>S.currentSlide?1:-1;
  S.currentSlide=i;
  window.renderApp();
  S.slideAnimDir=0;
}

export function setPreset(id){
  const prevPreset=S.currentPreset;
  S.currentPreset=id;
  if(!S.currentDeck){
    // No deck yet → create template
    S.currentDeck=generateTemplateDeck(id);
    S.currentSlide=0;
    S.chatHistory=[];
    window.addMessage(`✓ Created ${PRESETS[id].name} template deck`,'system');
  }else if(S.currentDeck._isTemplate){
    // Still on a template deck (user hasn't generated real content) → regenerate template
    S.currentDeck=generateTemplateDeck(id);
    S.currentSlide=0;
    window.addMessage(`✓ Switched to ${PRESETS[id].name} template`,'system');
  }else{
    // Real deck with content → clear per-slide style_overrides from old preset
    // Apply the new preset's style bank if available
    const newTemplate=generateTemplateDeck(id);
    if(newTemplate._styleBank){
      S.currentDeck._styleBank=newTemplate._styleBank;
      // Re-apply style bank to existing slides based on their layout
      S.currentDeck.slides.forEach(s=>{
        const bank=newTemplate._styleBank;
        if(bank[s.layout]){
          s.style_overrides={...bank[s.layout]};
        }else if(s.layout==='content'&&bank.content){
          s.style_overrides={...bank.content[0]};
        }else{
          s.style_overrides={};
        }
      });
    }else{
      // Clean presets (white/gray/dark): clear all style overrides
      S.currentDeck.slides.forEach(s=>{ s.style_overrides={}; });
    }
    window.addMessage(`✓ Applied ${PRESETS[id].name} preset to all slides`,'system');
  }
  S.currentDeck.preset=id;
  window.renderApp();
}

export function generateTemplateDeck(presetId){
  const name=PRESETS[presetId].name;
  const deck={
    title:name+' Template',
    preset:presetId,
    _isTemplate:true, // flag: next generate should override content but keep style_overrides
    slides:[]
  };
  // Each preset gets a single title-page preview with its signature color scheme
  if(presetId==='monet'){
    deck._styleBank={
      title:{background:'#E8DDD0',heading_color:'#4A5D7A',regions:{subtitle:{color:'#8B6F5E'},tagline:{color:'#9BA08E'}}},
      content:[
        {background:'#7886A5',heading_color:'#F6F3EE',regions:{body:{color:'#E8E0D4'}}},
        {background:'#8B9E8B',heading_color:'#F6F3EE',regions:{body:{color:'#F0EDE6'}}}
      ],
      'two-column':{background:'#F6F3EE',heading_color:'#4A5D7A',regions:{left:{color:'#6B5E4A'},right:{color:'#4A5D7A'},left_label:{color:'#C67A3C'},right_label:{color:'#7886A5'}}},
      quote:{background:'#C9B8D4',heading_color:'#2C2C3A',regions:{quote:{color:'#2C2C3A'},author:{color:'#4A5D7A'}}},
      'data-table':{background:'#EDE8DF',heading_color:'#4A5D7A',regions:{description:{color:'#6B5E4A'}}},
      closing:{background:'#D4C4A8',heading_color:'#2C2C3A',regions:{subtitle:{color:'#4A5D7A'}}}
    };
    deck.slides=[{layout:'title',content:{title:'Impressions of Light',subtitle:'Describe your topic — Sloth will paint your slides',tagline:'Monet preset · warm impressionist palette',date:new Date().toLocaleDateString()},style_overrides:deck._styleBank.title}];
  }else if(presetId==='seurat'){
    deck._styleBank={
      title:{background:'#FDF8EF',heading_color:'#C67A3C',regions:{subtitle:{color:'#4A7C6F'},tagline:{color:'#D4564A'},date:{color:'#8B9E6B'}}},
      content:[
        {background:'#FEF5E8',heading_color:'#C67A3C',regions:{body:{color:'#3D3D2E'}}},
        {background:'#F0EDE6',heading_color:'#D4564A',regions:{body:{color:'#3D3D2E'}}}
      ],
      'two-column':{background:'#FDF8EF',heading_color:'#C67A3C',regions:{left:{color:'#4A7C6F'},right:{color:'#D4564A'},left_label:{color:'#C67A3C'},right_label:{color:'#5B8FA8'}}},
      quote:{background:'#E8F0ED',heading_color:'#4A7C6F',regions:{quote:{color:'#2A2A1E'},author:{color:'#C67A3C'}}},
      'data-table':{background:'#FDF8EF',heading_color:'#C67A3C',regions:{description:{color:'#6B6B58'}}},
      closing:{background:'#F0E8D8',heading_color:'#C67A3C',regions:{subtitle:{color:'#4A7C6F'}}}
    };
    deck.slides=[{layout:'title',content:{title:'Points of Brilliance',subtitle:'Describe your topic — Sloth will compose your slides',tagline:'Seurat preset · vivid pointillist palette',date:new Date().toLocaleDateString()},style_overrides:deck._styleBank.title}];
  }else{
    // White / Gray / Dark — no special style bank, preset colors suffice
    deck.slides=[{layout:'title',content:{title:'Your Presentation',subtitle:'Describe your topic in the chat below',tagline:name+' preset · Sloth Space',date:new Date().toLocaleDateString()}}];
  }
  return deck;
}

// ═══════════════════════════════════════════
// TOOLBAR
// ═══════════════════════════════════════════

export function togglePopup(id,btn,e){
  if(e)e.stopPropagation();
  const popup=document.getElementById(id);
  const isOpen=popup.classList.contains('show');
  document.querySelectorAll('.popup').forEach(p=>p.classList.remove('show'));
  document.querySelectorAll('.tool-btn').forEach(b=>b.classList.remove('active-btn'));
  if(!isOpen){ popup.classList.add('show'); btn.classList.add('active-btn'); }
}

document.addEventListener('click',e=>{
  if(!e.target.closest('.tool-btn')){
    document.querySelectorAll('.popup').forEach(p=>p.classList.remove('show'));
    document.querySelectorAll('.tool-btn').forEach(b=>b.classList.remove('active-btn'));
  }
});

export function insertTag(tag){
  const input=document.getElementById('chatInput');
  const start=input.selectionStart;
  const val=input.value;
  input.value=val.slice(0,start)+tag+' '+val.slice(start);
  input.focus();
  input.selectionStart=input.selectionEnd=start+tag.length+1;
  document.querySelectorAll('.popup').forEach(p=>p.classList.remove('show'));
  document.querySelectorAll('.tool-btn').forEach(b=>b.classList.remove('active-btn'));
}

export function insertTextColor(hex){ insertTag(`[color: ${hex}]`); }
export function insertBgColor(hex){ insertTag(`[bg: ${hex}]`); }

export function initToolbar(){
  const makeSwatches=(arr,containerId,fn)=>{
    const el=document.getElementById(containerId);
    if(!el) return;
    el.innerHTML=arr.map(c=>
      `<div class="color-swatch" style="background:${c};" onclick="${fn}('${c}')" title="${c}"></div>`
    ).join('');
  };
  makeSwatches(BASIC_COLORS,'textBasicColors','insertTextColor');
  makeSwatches(MONET_COLORS,'textMonetColors','insertTextColor');
  makeSwatches(SEURAT_COLORS,'textSeuratColors','insertTextColor');
  makeSwatches(BASIC_COLORS,'bgBasicColors','insertBgColor');
  makeSwatches(MONET_COLORS,'bgMonetColors','insertBgColor');
  makeSwatches(SEURAT_COLORS,'bgSeuratColors','insertBgColor');
  const fontListEl=document.getElementById('fontList');
  if(fontListEl) fontListEl.innerHTML=FONTS.map(f=>
    `<div class="font-item" style="font-family:'${f}';" onclick="insertTag('[font: ${f}]')">${f}</div>`
  ).join('');
  // Prevent toolbar buttons from stealing focus from contenteditable
  // This ensures execCommand works on the current selection
  document.querySelectorAll('.dt-btn, .dt-select, .color-swatch, .font-item').forEach(el=>{
    el.addEventListener('mousedown', ev=>ev.preventDefault());
  });
  // Set initial toolbar mode
  window.updateToolbarForMode(S.currentMode||'slide');
}

// ═══════════════════════════════════════════
// EVENT LISTENERS
// (selectionchange + mousedown for tooltip now in sel-toolbar.js)
// ═══════════════════════════════════════════
