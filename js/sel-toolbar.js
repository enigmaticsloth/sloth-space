// ═══════════════════════════════════════════
// sel-toolbar.js: Shared text-selection & range-selection toolbar
// Used by slide, doc, and sheet modes
// ═══════════════════════════════════════════

import { S } from './state.js?v=20260317c29';

// ── Position helper ──
function _positionTooltip(rect){
  const tooltip=document.getElementById('textSelTooltip');
  if(!tooltip) return;
  let x=rect.left+rect.width/2-tooltip.offsetWidth/2;
  let y=rect.top-tooltip.offsetHeight-6;
  if(x<8)x=8;
  if(x+tooltip.offsetWidth>window.innerWidth-8)x=window.innerWidth-tooltip.offsetWidth-8;
  if(y<8){ y=rect.bottom+6; }
  tooltip.style.left=x+'px';
  tooltip.style.top=y+'px';
}

// ═══════════════════════════════════════════
// TEXT SELECTION TOOLTIP — Quick actions on highlighted text
// Shared by slide / doc / sheet
// ═══════════════════════════════════════════

/**
 * Show tooltip when user selects (highlights) text inside
 * a slide region-box, doc-block, or sheet cell.
 */
export function showTextSelTooltip(){
  const sel=window.getSelection();
  if(!sel||sel.isCollapsed||!sel.toString().trim()) return hideTextSelTooltip();

  const anchor=sel.anchorNode;
  const regionEl=anchor?.parentElement?.closest?.('.region-box')||anchor?.closest?.('.region-box');
  // Doc blocks are semantic elements (h1/p/blockquote) inside .doc-page with [data-block-id]
  const docBlockEl=anchor?.parentElement?.closest?.('.doc-page [data-block-id]')||anchor?.parentElement?.closest?.('.doc-page');
  const shCellEl=anchor?.parentElement?.closest?.('.sh-cell')||anchor?.closest?.('.sh-cell');

  if(!regionEl&&!docBlockEl&&!shCellEl) return hideTextSelTooltip();

  const tooltip=document.getElementById('textSelTooltip');
  if(!tooltip) return;

  // Determine mode for button set
  const mode=shCellEl?'sheet':(docBlockEl?'doc':'slide');
  _buildToolbarMain(mode);

  const range=sel.getRangeAt(0);
  const rect=range.getBoundingClientRect();
  tooltip.style.display='flex';
  _positionTooltip(rect);
}

export function hideTextSelTooltip(){
  const tooltip=document.getElementById('textSelTooltip');
  if(tooltip) tooltip.style.display='none';
}

// ── Build main toolbar ──
function _buildToolbarMain(mode){
  const tooltip=document.getElementById('textSelTooltip');
  if(!tooltip) return;
  tooltip.className='text-sel-tooltip';

  // All buttons use onmousedown="event.preventDefault()" to preserve text selection
  const md='onmousedown="event.preventDefault()"';
  if(mode==='sheet'){
    // Sheet: no AI Edit
    tooltip.innerHTML=
      `<button ${md} onclick="selToolbarCut()">Cut</button>`+
      `<button ${md} onclick="copySelectionToClipboard()">Copy</button>`+
      `<button ${md} onclick="selToolbarPaste()">Paste</button>`;
  } else {
    // Slide / Doc: Cut | Copy | Paste | AI Edit ▸
    tooltip.innerHTML=
      `<button ${md} onclick="selToolbarCut()">Cut</button>`+
      `<button ${md} onclick="copySelectionToClipboard()">Copy</button>`+
      `<button ${md} onclick="selToolbarPaste()">Paste</button>`+
      `<span class="sel-divider"></span>`+
      `<button class="sel-ai-btn" ${md} onclick="selToolbarShowAI(event)">AI Edit ▸</button>`;
  }
}

/** Public version called from inline onclick */
export function updateSelTooltipForMode(isDoc){
  _buildToolbarMain(S.currentMode==='sheet'?'sheet':(isDoc?'doc':'slide'));
}

// ── AI sub-menu (slide/doc only) ──

export function selToolbarShowAI(e){
  if(e){ e.stopPropagation(); e.preventDefault(); }
  const tooltip=document.getElementById('textSelTooltip');
  if(!tooltip) return;
  tooltip.className='text-sel-tooltip ai-mode';
  tooltip.innerHTML=
    `<button onmousedown="event.preventDefault()" onclick="selToolbarAiAction('expand')">Write More</button>`+
    `<button onmousedown="event.preventDefault()" onclick="selToolbarAiAction('shorten')">Write Less</button>`+
    `<span class="sel-divider"></span>`+
    `<button class="sel-ai-ask" onmousedown="event.preventDefault()" onclick="selToolbarAskAI()">Ask AI</button>`+
    `<button class="sel-back-btn" onmousedown="event.preventDefault()" onclick="selToolbarBack()">◂</button>`;
  // Reposition since width may change
  const sel=window.getSelection();
  if(sel&&sel.rangeCount>0){
    _positionTooltip(sel.getRangeAt(0).getBoundingClientRect());
  }
}

export function selToolbarBack(){
  _buildToolbarMain(S.currentMode==='sheet'?'sheet':(S.currentMode==='doc'?'doc':'slide'));
  const sel=window.getSelection();
  if(sel&&sel.rangeCount>0){
    const range=sel.getRangeAt(0);
    _positionTooltip(range.getBoundingClientRect());
  }
}

// ── Shared actions ──

export function selToolbarCut(){
  const sel=window.getSelection();
  const text=sel?.toString();
  if(!text) return;
  navigator.clipboard.writeText(text).catch(()=>{});
  document.execCommand('delete');
  hideTextSelTooltip();
  window.addMessage(`✂ Cut: "${text.slice(0,40)}${text.length>40?'...':''}"`, 'system');
}

export function selToolbarPaste(){
  navigator.clipboard.readText().then(text=>{
    if(!text) return;
    document.execCommand('insertText',false,text);
    hideTextSelTooltip();
  }).catch(()=>{
    hideTextSelTooltip();
    window.addMessage('Paste failed — browser requires permission.','system');
  });
}

export function selToolbarAiAction(action){
  const sel=window.getSelection();
  const text=sel?.toString()?.trim();
  if(!text) return;
  hideTextSelTooltip();
  const input=document.getElementById('chatInput');
  const instruction=action==='expand'
    ? `Expand and add more detail to: "${text}"`
    : `Make this shorter and more concise: "${text}"`;
  input.value=instruction;
  input.focus();
  window.sendMessage();
}

export function selToolbarAskAI(){
  const sel=window.getSelection();
  const text=sel?.toString()?.trim();
  if(!text) return;
  hideTextSelTooltip();
  const input=document.getElementById('chatInput');
  input.value=`"${text}" ← `;
  input.focus();
  input.selectionStart=input.selectionEnd=input.value.length;
  sel.removeAllRanges();
}

// ═══════════════════════════════════════════
// SHEET: Multi-cell range selection toolbar
// Appears when user selects a range of cells (not text inside one cell)
// ═══════════════════════════════════════════

/**
 * Show a toolbar anchored to the selected range bounding box.
 * Actions: Copy | Paste | Delete | Fill Down
 */
export function showSheetRangeToolbar(){
  const range=S.sheet.selectedRange;
  if(!range) return hideTextSelTooltip();
  const sh=S.sheet.current;
  if(!sh) return;

  // Find bounding cells on screen
  const startEl=document.querySelector(`.sh-cell[data-row-id="${range.start.rowId}"][data-col-id="${range.start.colId}"]`);
  const endEl=document.querySelector(`.sh-cell[data-row-id="${range.end.rowId}"][data-col-id="${range.end.colId}"]`);
  if(!startEl||!endEl) return;

  const r1=startEl.getBoundingClientRect();
  const r2=endEl.getBoundingClientRect();
  const minX=Math.min(r1.left,r2.left);
  const maxX=Math.max(r1.right,r2.right);
  const minY=Math.min(r1.top,r2.top);

  const tooltip=document.getElementById('textSelTooltip');
  if(!tooltip) return;
  tooltip.className='text-sel-tooltip';
  const md='onmousedown="event.preventDefault()"';
  tooltip.innerHTML=
    `<button ${md} onclick="shRangeCopy()">Copy</button>`+
    `<button ${md} onclick="shRangePaste()">Paste</button>`+
    `<span class="sel-divider"></span>`+
    `<button ${md} onclick="shRangeDelete()">Delete</button>`;
  tooltip.style.display='flex';

  // Position above the selection range
  const cx=minX+(maxX-minX)/2;
  let x=cx-tooltip.offsetWidth/2;
  let y=minY-tooltip.offsetHeight-6;
  if(x<8)x=8;
  if(x+tooltip.offsetWidth>window.innerWidth-8)x=window.innerWidth-tooltip.offsetWidth-8;
  if(y<8) y=Math.max(r1.bottom,r2.bottom)+6;
  tooltip.style.left=x+'px';
  tooltip.style.top=y+'px';
}

/** Copy all cells in range to clipboard as TSV */
export function shRangeCopy(){
  const data=_getRangeCellData();
  if(!data) return;
  const tsv=data.map(row=>row.join('\t')).join('\n');
  navigator.clipboard.writeText(tsv).catch(()=>{});
  hideTextSelTooltip();
  window.addMessage(`📋 Copied ${data.length} row(s) × ${data[0].length} col(s)`,'system');
}

/** Paste TSV into range starting from selected cell */
export function shRangePaste(){
  navigator.clipboard.readText().then(text=>{
    if(!text) return;
    const rows=text.split('\n').map(r=>r.split('\t'));
    const sh=S.sheet.current;
    const sel=S.sheet.selectedCell||S.sheet.selectedRange?.start;
    if(!sh||!sel) return;
    const startR=sh.rows.findIndex(r=>r.id===sel.rowId);
    const startC=sh.columns.findIndex(c=>c.id===sel.colId);
    if(startR<0||startC<0) return;
    window.shPushUndo();
    for(let r=0;r<rows.length&&(startR+r)<sh.rows.length;r++){
      for(let c=0;c<rows[r].length&&(startC+c)<sh.columns.length;c++){
        sh.rows[startR+r].cells[sh.columns[startC+c].id]=rows[r][c];
      }
    }
    sh.updated=new Date().toISOString();
    window.shAutoSave();
    window.renderSheetMode();
    hideTextSelTooltip();
    window.addMessage(`📋 Pasted ${rows.length}×${rows[0].length}`,'system');
  }).catch(()=>{
    hideTextSelTooltip();
    window.addMessage('Paste failed — browser requires permission.','system');
  });
}

/** Delete all cells in range */
export function shRangeDelete(){
  const range=S.sheet.selectedRange;
  if(!range) return;
  const sh=S.sheet.current;
  if(!sh) return;
  const r1=sh.rows.findIndex(r=>r.id===range.start.rowId);
  const r2=sh.rows.findIndex(r=>r.id===range.end.rowId);
  const c1=sh.columns.findIndex(c=>c.id===range.start.colId);
  const c2=sh.columns.findIndex(c=>c.id===range.end.colId);
  if(r1<0||r2<0||c1<0||c2<0) return;
  const minR=Math.min(r1,r2), maxR=Math.max(r1,r2);
  const minC=Math.min(c1,c2), maxC=Math.max(c1,c2);
  window.shPushUndo();
  for(let r=minR;r<=maxR;r++){
    for(let c=minC;c<=maxC;c++){
      sh.rows[r].cells[sh.columns[c].id]='';
    }
  }
  sh.updated=new Date().toISOString();
  window.shAutoSave();
  window.renderSheetMode();
  hideTextSelTooltip();
  window.addMessage(`🗑 Cleared ${(maxR-minR+1)*(maxC-minC+1)} cell(s)`,'system');
}

/** Get 2D array of cell values from current range */
function _getRangeCellData(){
  const range=S.sheet.selectedRange;
  if(!range) return null;
  const sh=S.sheet.current;
  if(!sh) return null;
  const r1=sh.rows.findIndex(r=>r.id===range.start.rowId);
  const r2=sh.rows.findIndex(r=>r.id===range.end.rowId);
  const c1=sh.columns.findIndex(c=>c.id===range.start.colId);
  const c2=sh.columns.findIndex(c=>c.id===range.end.colId);
  if(r1<0||r2<0||c1<0||c2<0) return null;
  const minR=Math.min(r1,r2), maxR=Math.max(r1,r2);
  const minC=Math.min(c1,c2), maxC=Math.max(c1,c2);
  const data=[];
  for(let r=minR;r<=maxR;r++){
    const row=[];
    for(let c=minC;c<=maxC;c++){
      const val=sh.rows[r].cells[sh.columns[c].id]||'';
      row.push(val);
    }
    data.push(row);
  }
  return data;
}

// ── selectionchange + mousedown listeners (self-registering) ──
document.addEventListener('selectionchange',function(){
  clearTimeout(window._selToolbarTimeout);
  window._selToolbarTimeout=setTimeout(showTextSelTooltip,300);
});

document.addEventListener('mousedown',function(e){
  // Clicking inside the tooltip should NOT collapse the text selection
  if(e.target.closest('.text-sel-tooltip')){
    e.preventDefault(); // preserve text selection when clicking toolbar buttons
    return;
  }
  setTimeout(hideTextSelTooltip,50);
});
