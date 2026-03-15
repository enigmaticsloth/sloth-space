// ═════════════════════════════════════════════════════════════════
// keys.js: Keyboard handlers, chat input, and touch/gesture handlers
// ═════════════════════════════════════════════════════════════════

import { S } from './state.js';

// ═══════════════════════════════════════════════════════════════════
// INPUT TOGGLE (expand/collapse)
// ═══════════════════════════════════════════════════════════════════
export function toggleInputSize(){
  const area=document.getElementById('inputArea');
  const btn=document.getElementById('inputToggle');
  S.inputCollapsed=!S.inputCollapsed;
  area.classList.toggle('collapsed',S.inputCollapsed);
  btn.innerHTML=S.inputCollapsed?'&#9660;':'&#9650;'; // ▼ or ▲
}

// ═══════════════════════════════════════════════════════════════════
// IMAGE STAGING
// ═══════════════════════════════════════════════════════════════════
export function handleImageFiles(fileList){
  if(!fileList||!fileList.length)return;
  Array.from(fileList).forEach(file=>{
    if(!file.type.startsWith('image/'))return;
    const reader=new FileReader();
    reader.onload=function(e){
      const img=new Image();
      img.onload=function(){
        S.stagedImages.push({name:file.name, dataUrl:e.target.result, width:img.width, height:img.height});
        renderStagedImages();
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  });
  // Reset file input so same file can be re-selected
  document.getElementById('imgFileInput').value='';
}

export function removeStagedImage(idx){
  S.stagedImages.splice(idx,1);
  renderStagedImages();
}

export function renderStagedImages(){
  const staging=document.getElementById('imgStaging');
  const thumbsHtml=S.stagedImages.map((img,i)=>
    `<div class="img-thumb" title="${img.name} (${img.width}×${img.height})">
      <img src="${img.dataUrl}" alt="${img.name}">
      <button class="img-thumb-remove" onclick="removeStagedImage(${i})">✕</button>
    </div>`
  ).join('');
  // Keep label + thumbs
  staging.innerHTML=`<span class="img-staging-label">📎 ${S.stagedImages.length} image${S.stagedImages.length>1?'s':''}:</span>${thumbsHtml}`;
  staging.classList.toggle('has-images',S.stagedImages.length>0);
}

// Consume staged images (called by sendMessage) — returns array and clears staging
export function consumeStagedImages(){
  const imgs=[...S.stagedImages];
  S.stagedImages=[];
  renderStagedImages();
  return imgs;
}

// ═══════════════════════════════════════════════════════════════════
// KEYBOARD & INPUT INITIALIZATION
// ═══════════════════════════════════════════════════════════════════
export function initKeys(){
  // ── Main keyboard handler for undo/redo and general keys ──
  document.addEventListener('keydown',function(e){
    // Don't intercept when typing in inputs/textareas/contenteditable
    const tag=e.target.tagName;
    const isCE=e.target.isContentEditable;
    const isInput=(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||isCE);

    // ── Undo/Redo ──
    if((e.ctrlKey||e.metaKey)&&!e.altKey&&(e.key==='z'||e.key==='Z'||e.key==='y'||e.key==='Y')){
      // Regular inputs (chatInput, textarea, select) — NOT contenteditable → let browser handle
      const isPlainInput=(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT');
      const isNonSheetPlainInput=isPlainInput&&!(e.target.closest&&e.target.closest('.sh-grid'));
      if(isNonSheetPlainInput) return; // Let browser handle undo in chat input, batch inputs, etc.
      // Sheet editing cell → our undo, not browser
      if(S.currentMode==='sheet'){
        e.preventDefault();
        if(S.sheet.editingCell) window.shCommitEdit();
        const isSheetUndo=(e.key==='z'||e.key==='Z')&&!e.shiftKey;
        const isSheetRedo=(e.key==='y'||e.key==='Y')||((e.key==='z'||e.key==='Z')&&e.shiftKey);
        if(isSheetUndo) window.shUndo();
        else if(isSheetRedo) window.shRedo();
        return;
      }
      // Slide inline edit contenteditable → let browser handle (DOM isn't rebuilt)
      if(window.isInlineEditing()) return;
      // Doc block contenteditable OR no focus → use our undo system
      e.preventDefault();
      if(S.currentMode==='doc') window.docFlushEditing();
      const isUndo=(e.key==='z'||e.key==='Z')&&!e.shiftKey;
      const isRedo=(e.key==='y'||e.key==='Y')||((e.key==='z'||e.key==='Z')&&e.shiftKey);
      if(isUndo){
        if(S.currentMode==='doc'){ window.docUndo(); }
        else { window.modeUndo(); }
      } else if(isRedo){
        if(S.currentMode==='doc') window.docRedo(); else window.modeRedo();
      }
      return;
    }

    if(window.isInlineEditing()) return; // let browser handle other keys in slide inline edit

    // ── Sheet-specific keys (early-return dispatch) ──
    // IMPORTANT: Only intercept keys when focus is on the sheet grid or a sheet cell,
    // NOT when the user is typing in chat input, batch inputs, etc.
    if(S.currentMode==='sheet'){
      // Determine if focus is inside a non-sheet input (chat textarea, batch inputs, etc.)
      const isSheetCell=isCE&&e.target.closest&&e.target.closest('.sh-cell');
      const isNonSheetInput=(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')&&!e.target.closest('.sh-grid');
      // If user is in a non-sheet input, let browser handle everything normally
      if(isNonSheetInput) {/* fall through to slide/doc handlers or browser default */}
      else {
        // ── Copy / Cut / Paste ──
        if((e.ctrlKey||e.metaKey)&&(e.key==='c'||e.key==='C')&&!S.sheet.editingCell){
          e.preventDefault(); window.shCopy(); return;
        }
        if((e.ctrlKey||e.metaKey)&&(e.key==='x'||e.key==='X')&&!S.sheet.editingCell){
          e.preventDefault(); window.shCut(); return;
        }
        if((e.ctrlKey||e.metaKey)&&(e.key==='v'||e.key==='V')&&!S.sheet.editingCell){
          e.preventDefault(); window.shPaste(); return;
        }

        if(e.key==='Escape'){
          e.preventDefault();
          if(S.sheet.editingCell) window.shCancelEdit();
          else window.shClearSelection();
          return;
        }
        if(e.key==='Enter'){
          // Shift+Enter while editing → insert newline (let browser handle contentEditable)
          if(e.shiftKey&&S.sheet.editingCell) return;
          // Enter while editing → commit + move down
          if(S.sheet.editingCell){ e.preventDefault(); window.shCommitEdit(); window.shNavigate('down'); return; }
          // Enter while selected → start editing
          if(S.sheet.selectedCell){ e.preventDefault(); window.shStartEdit(S.sheet.selectedCell.rowId, S.sheet.selectedCell.colId); return; }
        }
        if(e.key==='Tab'){
          e.preventDefault();
          if(S.sheet.editingCell) window.shCommitEdit();
          window.shTabNavigate(e.shiftKey);
          return;
        }
        if((e.key==='Delete'||e.key==='Backspace')&&!S.sheet.editingCell&&(S.sheet.selectedCell||S.sheet.selectedRange)){
          e.preventDefault();
          window.shDeleteSelection();
          return;
        }
        // Arrow keys in sheet (only when not editing)
        if(!S.sheet.editingCell&&(e.key==='ArrowUp'||e.key==='ArrowDown'||e.key==='ArrowLeft'||e.key==='ArrowRight')){
          e.preventDefault();
          const dir=e.key.replace('Arrow','').toLowerCase();
          window.shNavigate(dir);
          return;
        }
        // Type to start editing (printable chars, not editing, not in input)
        if(!S.sheet.editingCell&&S.sheet.selectedCell&&!isInput&&e.key.length===1&&!e.ctrlKey&&!e.metaKey){
          window.shStartEdit(S.sheet.selectedCell.rowId, S.sheet.selectedCell.colId);
          return;
        }
        return; // sheet handled — don't fall through to slide/doc handlers
      }
    }

    // ── Escape — deselect in both modes ──
    if(e.key==='Escape'){
      if(S.currentMode==='doc'){
        window.docHideImagePopup();
        // If actively editing a contenteditable, blur it first
        const ae=document.activeElement;
        if(ae&&ae.isContentEditable){
          ae.blur();
          if(ae.classList.contains('doc-block')) ae.contentEditable='false';
          if(S.docEditingBlockId) S.docEditingBlockId=null;
          e.preventDefault();
          return;
        }
      }
      // Unified deselect for both slide and doc
      if(S.selectedRegion||S.docEditingBlockId||S.docSelectedBlockId){
        S.docEditingBlockId=null;
        window.clearSelection(); // handles both slide region + doc block + selection bar + ctx menu
        e.preventDefault();
      }
      return;
    }

    // ── Delete/Backspace — delete selected object (only when not in input) ──
    if((e.key==='Delete'||e.key==='Backspace')&&!isInput){
      if(S.currentMode==='slide'&&S.selectedRegion){
        e.preventDefault();
        window.pushUndo();
        const slide=S.currentDeck.slides[S.selectedRegion.slideIdx];
        if(slide) slide.content[S.selectedRegion.regionId]='';
        window.addMessage(`✓ Cleared ${S.selectedRegion.regionId} on slide ${S.selectedRegion.slideIdx+1}`,'system');
        window.clearSelection();
        window.renderApp();
      } else if(S.currentMode==='doc'){
        const bid=S.docSelectedBlockId;
        if(bid&&!S.docEditingBlockId){
          e.preventDefault();
          window.docPushUndo();
          window.docDeleteBlock(bid);
          window.clearSelection();
          window.renderDocMode();
        }
      }
      return;
    }
  });

  // ── Arrow key handler for slide navigation ──
  document.addEventListener('keydown',e=>{
    if(document.activeElement===chatInput)return;
    if(window.isInlineEditing())return; // don't hijack arrow keys during inline edit
    // Don't hijack arrow keys when editing in contenteditable or any input
    const aTag=document.activeElement.tagName;
    if(document.activeElement.isContentEditable||aTag==='INPUT'||aTag==='TEXTAREA'||aTag==='SELECT') return;
    // Don't hijack when Shift is held (text selection) or in doc mode (doc has its own arrow key handling)
    if(e.shiftKey) return;
    if(S.currentMode==='doc'||S.currentMode==='sheet') return;
    if(e.key==='ArrowRight'&&S.currentDeck){window.goSlide(Math.min(S.currentSlide+1,S.currentDeck.slides.length-1));e.preventDefault();}
    if(e.key==='ArrowLeft'&&S.currentDeck){window.goSlide(Math.max(S.currentSlide-1,0));e.preventDefault();}
  });

  // ── Chat input handlers ──
  const chatInput=document.getElementById('chatInput');
  chatInput.addEventListener('compositionstart',()=>{S.imeComposing=true;});
  chatInput.addEventListener('compositionend',()=>{S.imeComposing=false;});
  chatInput.addEventListener('keydown',e=>{
    // keyCode 229 = IME processing key (Chrome/Safari CJK input)
    if(e.key==='Enter'&&!e.shiftKey&&!S.imeComposing&&!e.isComposing&&e.keyCode!==229){
      e.preventDefault();window.sendMessage();
    }
  });

  // ── Image drag/drop handlers ──
  document.addEventListener('dragenter',function(e){
    e.preventDefault();
    if(e.dataTransfer.types.includes('Files')){
      S.dragCounter++;
      document.getElementById('dropOverlay').classList.add('show');
    }
  });
  document.addEventListener('dragleave',function(e){
    e.preventDefault();
    S.dragCounter--;
    if(S.dragCounter<=0){
      S.dragCounter=0;
      document.getElementById('dropOverlay').classList.remove('show');
    }
  });
  document.addEventListener('dragover',function(e){
    e.preventDefault(); // required to allow drop
  });
  document.addEventListener('drop',function(e){
    e.preventDefault();
    S.dragCounter=0;
    document.getElementById('dropOverlay').classList.remove('show');
    if(e.dataTransfer.files.length>0){
      handleImageFiles(e.dataTransfer.files);
    }
  });

  // Paste images from clipboard
  document.addEventListener('paste',function(e){
    const items=e.clipboardData?.items;
    if(!items)return;
    const imageFiles=[];
    for(let i=0;i<items.length;i++){
      if(items[i].type.startsWith('image/')){
        imageFiles.push(items[i].getAsFile());
      }
    }
    if(imageFiles.length>0){
      handleImageFiles(imageFiles);
    }
  });

  // ── Mobile: Touch swipe handler for slide navigation ──
  // IMPORTANT: passive:false + preventDefault() to BLOCK browser zoom/scroll on slide area
  const slidePanel=document.querySelector('.slide-panel');

  // Block zoom but preserve tap-to-click on slide regions
  slidePanel.addEventListener('touchstart',function(e){
    S.touchStartX=e.touches[0].clientX;
    S.touchStartY=e.touches[0].clientY;
    // Only preventDefault if multi-touch (pinch zoom) — single finger preserved for tap
    if(e.touches.length>1) e.preventDefault();
  },{passive:false});
  slidePanel.addEventListener('touchmove',function(e){
    e.preventDefault(); // block zoom/scroll during any drag
  },{passive:false});
  slidePanel.addEventListener('touchend',function(e){
    const endX=e.changedTouches[0].clientX;
    const endY=e.changedTouches[0].clientY;
    const dx=endX-S.touchStartX;
    const dy=endY-S.touchStartY;
    // Small movement = tap → simulate click so selectRegion() fires
    if(Math.abs(dx)<15&&Math.abs(dy)<15){
      const el=document.elementFromPoint(endX,endY);
      if(el) el.click(); // fire the onclick handler on the tapped region
      return;
    }
    // Large horizontal movement = swipe → navigate slides
    if(!S.currentDeck)return;
    if(Math.abs(dx)<50||Math.abs(dy)>Math.abs(dx))return;
    if(dx<0&&S.currentSlide<S.currentDeck.slides.length-1){
      window.goSlide(S.currentSlide+1);
    }else if(dx>0&&S.currentSlide>0){
      window.goSlide(S.currentSlide-1);
    }
  },{passive:false});

  // ── Chat auto-scroll observer ──
  const chatMsgsEl=document.getElementById('chatMessages');
  const chatObserver=new MutationObserver(function(){
    chatMsgsEl.scrollTop=chatMsgsEl.scrollHeight;
  });
  chatObserver.observe(chatMsgsEl,{childList:true});

  // ── Resize handler ──
  window.addEventListener('resize',function(){
    // Only re-render if width actually changed (orientation change or real resize)
    // Pinch-to-zoom on mobile doesn't change innerWidth
    if(Math.abs(window.innerWidth-S.lastW)>20){
      S.lastW=window.innerWidth;
      window.renderApp();
    }
  });

  // ── Save on page unload/tab close ──
  window.addEventListener('beforeunload',function(){
    if(S.currentMode==='doc'&&S.currentDoc){
      window.docFlushEditing();
      window.docSaveUndoStacks();
      window.docSaveNow();
    }
    if(S.currentMode==='slide'&&S.currentDeck){
      window.autoSave();
    }
    if(S.currentMode==='sheet'&&S.sheet.current){
      try{ localStorage.setItem('sloth_current_sheet',JSON.stringify(S.sheet.current)); }catch(e){}
    }
    // Always save chat tabs on unload
    if(window.saveChatTabs) window.saveChatTabs();
  });

  window.addEventListener('visibilitychange',function(){
    if(document.hidden){
      if(S.currentMode==='doc'&&S.currentDoc) window.docSaveNow();
      if(S.currentMode==='slide'&&S.currentDeck) window.autoSave();
      if(S.currentMode==='sheet'&&S.sheet.current){
        try{ localStorage.setItem('sloth_current_sheet',JSON.stringify(S.sheet.current)); }catch(e){}
      }
    }
  });
}
