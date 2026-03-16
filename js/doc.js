import { S, DOC_MAX_UNDO, DOC_BLOCK_TYPES, DOC_DRAG_DEAD_ZONE, DOC_DRAG_HYSTERESIS } from './state.js';

// ═══════════════════════════════════════════
// DOC MODE - Block-based document editing
// ═══════════════════════════════════════════

// ── Doc: Edit from text selection in chat ──
export function docEditFromSelection(){
  window.hideTextSelTooltip();
  const sel=window.getSelection();
  const text=sel?.toString()?.trim();
  if(!text) return;
  const anchor=sel.anchorNode;
  const blockEl=anchor?.parentElement?.closest?.('.doc-block')||anchor?.closest?.('.doc-block');
  if(!blockEl) return;
  const blockId=blockEl.dataset.blockId;
  sel.removeAllRanges();
  // Pre-fill chat with AI edit instruction
  const input=document.getElementById('chatInput');
  input.value=`Edit block: "${text.slice(0,60)}${text.length>60?'...':''}" → `;
  input.focus();
  input.selectionStart=input.selectionEnd=input.value.length;
}

// ── Doc block click → AI action tooltip ──
export function docBlockClickAction(blockId, e){
  // Don't show if user is selecting text
  const sel=window.getSelection();
  if(sel&&!sel.isCollapsed) return;
  if(e.target.closest('.doc-block-handle')) return;
  showDocCtxAiMenu(blockId, e);
}

// ── Doc context AI menu (reuses ctxAiMenu popup, like slide mode) ──
export function showDocCtxAiMenu(blockId, clickEvent){
  const block=docGetBlock(blockId);
  if(!block) return;
  const blockIdx=S.currentDoc.blocks.findIndex(b=>b.id===blockId);
  const typeLabel=block.type.charAt(0).toUpperCase()+block.type.slice(1);
  const text=blockPlainText(block);
  const isTextBlock=['paragraph','heading1','heading2','heading3','quote','code','bullet','numbered'].includes(block.type);
  const isImage=block.type==='image';
  const isTable=block.type==='table';
  const isDivider=block.type==='divider';

  const suggestions=[];

  // ════════ DIRECT ACTIONS ════════
  if(isTextBlock&&text.trim()){
    suggestions.push({icon:'✏️',text:'Edit text',hint:'Double-click to type',action:`__doc_edit__${blockId}`});
  }
  if(!isDivider){
    suggestions.push({icon:'🗑️',text:'Delete block',hint:'Remove entirely',action:`__doc_delete__${blockId}`,danger:true});
  }

  // ════════ AI SUGGESTIONS ════════
  suggestions.push({type:'divider'});

  if(isTextBlock&&text.trim()){
    suggestions.push({icon:'✨',text:'Rewrite concisely',hint:'Shorter, same meaning',action:`__doc_ai__rewrite__Rewrite this block concisely__${blockId}`});
    suggestions.push({icon:'📝',text:'Expand with detail',hint:'Add more context',action:`__doc_ai__expand__Expand this block with more detail and examples__${blockId}`});
    suggestions.push({icon:'🌐',text:'Translate',hint:'To English or any language',action:`__doc_ai__translate__Translate this block to English__${blockId}`});
    suggestions.push({icon:'🎯',text:'More professional',hint:'Formal tone',action:`__doc_ai__tone__Make this block more professional in tone__${blockId}`});
    if(block.type==='paragraph'&&text.length>100){
      suggestions.push({icon:'📋',text:'Convert to bullet list',hint:'Structured format',action:`__doc_ai__bullets__Convert this block into a bullet list__${blockId}`});
    }
    if(block.type.startsWith('heading')){
      suggestions.push({icon:'💡',text:'More impactful',hint:'Attention-grabbing',action:`__doc_ai__impact__Make this heading more impactful and attention-grabbing__${blockId}`});
    }
  }

  if(isImage){
    const hasCaption=block.meta?.showCaption===true;
    if(!hasCaption) suggestions.push({icon:'📝',text:'Add caption',hint:'Describe the image',action:`__doc_caption_on__${blockId}`});
    suggestions.push({icon:'🔄',text:'Change float',hint:'Left / center / right',action:`__doc_float_cycle__${blockId}`});
  }

  if(isTable){
    suggestions.push({icon:'➕',text:'Add row',hint:'Append to bottom',action:`__doc_table_addrow__${blockId}`});
    const hasCaption=block.meta?.showCaption===true;
    if(!hasCaption) suggestions.push({icon:'📝',text:'Add caption',hint:'Describe the table',action:`__doc_caption_on__${blockId}`});
    suggestions.push({icon:'🔄',text:'Change float',hint:'Left / center / right',action:`__doc_float_cycle__${blockId}`});
  }

  if(isDivider){
    suggestions.push({icon:'🗑️',text:'Remove divider',hint:'',action:`__doc_delete__${blockId}`,danger:true});
  }

  const blockEl=document.querySelector(`[data-block-id="${blockId}"]`);
  window.renderCtxMenuPopup({
    title: `Block ${blockIdx+1}: ${typeLabel}`,
    suggestions,
    execFn: 'execDocCtxAction',
    placeholder: 'Ask AI to change this block...',
    customExecCode: `execDocCtxCustom('${blockId}')`,
    clickEvent,
    anchorEl: blockEl
  });
}

export function execDocCtxAction(action){
  window.hideCtxAiMenu();
  // Direct actions
  if(action.startsWith('__doc_edit__')){
    const bid=action.replace('__doc_edit__','');
    const el=document.querySelector(`[data-block-id="${bid}"]`);
    if(el){
      S.docEditingBlockId=bid;
      el.contentEditable='true';
      setTimeout(()=>el.focus(),0);
    }
    return;
  }
  if(action.startsWith('__doc_delete__')){
    const bid=action.replace('__doc_delete__','');
    docPushUndo();
    docDeleteBlock(bid);
    S.docSelectedBlockId=null;
    document.getElementById('selectionBar').style.display='none';
    renderDocMode();
    window.addMessage('✓ Block deleted','system');
    return;
  }
  if(action.startsWith('__doc_caption_on__')){
    const bid=action.replace('__doc_caption_on__','');
    const block=docGetBlock(bid);
    if(block&&block.meta){ block.meta.showCaption=true; block.meta.caption=block.meta.caption||'Caption'; }
    renderDocMode();
    return;
  }
  if(action.startsWith('__doc_float_cycle__')){
    const bid=action.replace('__doc_float_cycle__','');
    const block=docGetBlock(bid);
    if(block&&block.meta){
      const floats=['none','left','right'];
      const cur=block.meta.float||'none';
      const next=floats[(floats.indexOf(cur)+1)%floats.length];
      block.meta.float=next;
      window.addMessage(`✓ Float → ${next}`,'system');
    }
    renderDocMode();
    return;
  }
  if(action.startsWith('__doc_table_addrow__')){
    const bid=action.replace('__doc_table_addrow__','');
    docTableAddRow(bid);
    return;
  }
  // Caption actions
  if(action.startsWith('__doc_caption_off__')){
    const bid=action.replace('__doc_caption_off__','');
    const block=docGetBlock(bid);
    if(block&&block.meta){ block.meta.showCaption=false; }
    renderDocMode();
    return;
  }
  if(action.startsWith('__doc_caption_ai__')){
    const parts=action.replace('__doc_caption_ai__','').split('__');
    if(parts.length>=3){
      docCaptionAI(parts[0], parts[1], parts[2]);
    }
    return;
  }
  // AI actions: __doc_ai__action__instruction__blockId
  if(action.startsWith('__doc_ai__')){
    const parts=action.replace('__doc_ai__','').split('__');
    if(parts.length>=3){
      const aiAction=parts[0];
      const instruction=parts[1];
      const bid=parts[2];
      docCtxAI(aiAction, instruction, bid);
    }
    return;
  }
  // Fallback: inject into chat
  const input=document.getElementById('chatInput');
  input.value=action;
  window.sendMessage();
}

export function execDocCtxCustom(blockId){
  const inp=document.getElementById('ctxMenuInput');
  if(!inp||!inp.value.trim()) return;
  docCtxAI('custom', inp.value.trim(), blockId);
}

let S_docSelectedCaptionBlockId=null;
export function docCaptionClick(event, blockId){
  // In freeflow mode, just mark caption as selected
  S_docSelectedCaptionBlockId=blockId;
  const block=docGetBlock(blockId);
  if(!block) return;
  const blockIdx=S.currentDoc.blocks.findIndex(b=>b.id===blockId);
  const caption=block.meta?.caption||'';
  const typeLabel=block.type.charAt(0).toUpperCase()+block.type.slice(1);

  // Update selection bar to show caption is selected
  document.getElementById('selectionBar').style.display='flex';
  document.getElementById('selectionTag').textContent=`Block ${blockIdx+1}: ${typeLabel} → Caption${caption?(` — "${caption.substring(0,40)}${caption.length>40?'...':''}"`):''}`;

  // Build caption-specific suggestions
  const suggestions=[];
  if(caption.trim()){
    suggestions.push({type:'divider'});
    suggestions.push({icon:'✨',text:'Rewrite caption',hint:'Shorter, punchier',action:`__doc_caption_ai__rewrite__Rewrite this caption more concisely__${blockId}`});
    suggestions.push({icon:'📝',text:'Expand caption',hint:'Add more detail',action:`__doc_caption_ai__expand__Expand this caption with more descriptive detail__${blockId}`});
    suggestions.push({icon:'🌐',text:'Translate caption',hint:'To English',action:`__doc_caption_ai__translate__Translate this caption to English__${blockId}`});
  }
  suggestions.push({icon:'🗑️',text:'Hide caption',hint:'Remove caption',action:`__doc_caption_off__${blockId}`,danger:true});

  const capEl=event.target.closest('.doc-figure-caption')||document.querySelector(`[data-block-id="${blockId}"]`);
  window.renderCtxMenuPopup({
    title: `${typeLabel} Caption`,
    suggestions,
    execFn: 'execDocCtxAction',
    placeholder: 'Ask AI to change this caption...',
    customExecCode: `execDocCaptionCustom('${blockId}')`,
    clickEvent: event,
    anchorEl: capEl
  });
}

export async function docCaptionAI(action, instruction, blockId){
  window.hideCtxAiMenu();
  const block=docGetBlock(blockId);
  if(!block||!block.meta) return;
  const caption=block.meta.caption||'';
  if(!caption.trim()){ window.addMessage('Caption is empty.','system'); return; }
  const statusDiv=window.addMessage('✦ AI processing caption...','system');
  try{
    const prompt=`You are a document editor AI. The user wants you to edit a figure/table caption.
Instruction: ${instruction}
Original caption: "${caption}"
Output ONLY the new caption text. No quotes, no explanation.`;
    const raw=await window.callLLM(prompt,[{role:'user',content:instruction}],{temperature:0.5,max_tokens:512});
    const cleaned=raw.trim().replace(/^["']|["']$/g,'');
    docPushUndo();
    block.meta.caption=cleaned;
    S.currentDoc.updated=new Date().toISOString();
    statusDiv.remove();
    window.addMessage(`✓ Caption updated (${action})`,'ai');
    renderDocMode();
    docAutoSave();
  }catch(err){
    statusDiv.remove();
    window.addMessage(`Error: ${err.message}`,'ai');
  }
}

export function execDocCaptionCustom(blockId){
  const inp=document.getElementById('ctxMenuInput');
  if(!inp||!inp.value.trim()) return;
  window.hideCtxAiMenu();
  docCaptionAI('custom', inp.value.trim(), blockId);
}

// Listen for text selection changes
document.addEventListener('selectionchange',function(){
  clearTimeout(window.textSelTimeout);
  window.textSelTimeout=setTimeout(window.showTextSelTooltip,300);
});

// Hide tooltip on scroll or click outside
document.addEventListener('mousedown',function(e){
  if(e.target.closest('.text-sel-tooltip'))return;
  // Small delay so selectionchange fires first
  setTimeout(window.hideTextSelTooltip,50);
});

// ── Doc: New Document ──
export function docNewDocument(){
  if(S.currentDoc&&S.currentDoc.blocks.some(b=>blockPlainText(b).trim())){
    if(!confirm('Start a new document? Current doc is auto-saved.')) return;
    docSaveNow();
  }
  S.currentDoc=docCreateNew('Untitled Document');
  S.docUndoStack=[];
  S.docRedoStack=[];
  window.updateModeNameBar('doc');
  renderDocMode();
  window.addMessage('New document started.','system');
}

// ── Doc: Import (plain text / JSON) ──
export function docImport(){
  const input=document.createElement('input');
  input.type='file';
  input.accept='.txt,.md,.json,.sloth';
  input.onchange=function(e){
    const file=e.target.files[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=function(ev){
      const text=ev.target.result;
      if(file.name.endsWith('.json')){
        try{
          const data=JSON.parse(text);
          if(data.blocks){
            S.currentDoc={ id:blockId(), title:data.title||file.name.replace(/\.json$/,''), blocks:data.blocks, created:new Date().toISOString(), updated:new Date().toISOString() };
          } else {
            throw new Error('No blocks');
          }
        }catch(err){
          // Treat as plain text
          docImportPlainText(file.name, text);
          return;
        }
      } else {
        docImportPlainText(file.name, text);
      }
      window.updateModeNameBar('doc');
      renderDocMode();
      docAutoSave();
      window.addMessage(`✓ Imported: "${S.currentDoc.title}"`,'system');
    };
    reader.readAsText(file);
  };
  input.click();
}

export function docImportPlainText(filename, text){
  const title=filename.replace(/\.(txt|md|json)$/i,'');
  const lines=text.split('\n').filter(l=>l.trim());
  const blocks=[];
  if(lines.length>0){
    blocks.push(createBlock('heading1', lines[0].replace(/^#+\s*/,'')));
    for(let i=1;i<lines.length;i++){
      const line=lines[i];
      if(line.startsWith('# ')) blocks.push(createBlock('heading1',line.slice(2)));
      else if(line.startsWith('## ')) blocks.push(createBlock('heading2',line.slice(3)));
      else if(line.startsWith('### ')) blocks.push(createBlock('heading3',line.slice(4)));
      else if(line.startsWith('> ')) blocks.push(createBlock('quote',line.slice(2)));
      else if(line.startsWith('- ')||line.startsWith('* ')) blocks.push(createBlock('list',line.slice(2)));
      else if(line.startsWith('---')) blocks.push(createBlock('divider',''));
      else blocks.push(createBlock('paragraph',line));
    }
  }
  if(blocks.length===0) blocks.push(createBlock('paragraph',''));
  S.currentDoc={ id:blockId(), title, blocks, created:new Date().toISOString(), updated:new Date().toISOString() };
}

// ── Doc: Save to Cloud ──
export async function docSaveToCloud(){
  if(!S.currentDoc){window.addMessage('No document to save.','system');return;}
  docSaveNow(); // flush first
  if(!window.supabaseClient||!window.currentUser){
    window.addMessage('Sign in to save to cloud.','system');
    window.doLogin();
    return;
  }
  try{
    const fname=(S.currentDoc.title||'Untitled').replace(/[^a-zA-Z0-9\u4e00-\u9fff\s-]/g,'').replace(/\s+/g,'_')+'.doc.json';
    const path=window.currentUser.id+'/'+fname;
    const payload=JSON.stringify({
      type:'doc',
      doc:S.currentDoc,
      savedAt:new Date().toISOString()
    });
    const blob=new Blob([payload],{type:'application/json'});
    const{error}=await window.supabaseClient.storage.from(window.CLOUD_BUCKET).upload(path,blob,{upsert:true});
    if(error) throw error;
    window.addMessage(`✓ Doc saved to cloud: "${S.currentDoc.title||'Untitled'}"`,'system');
    window.refreshFileList();
  }catch(e){window.addMessage('Cloud save error: '+e.message,'system');}
}

// Doc PDF export
export function exportDocPDF(){
  if(!S.currentDoc||!S.currentDoc.blocks.length){
    window.addMessage('No document content to export.','system');
    return;
  }
  // Build simple HTML from doc blocks and print to PDF
  let html='<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+window.escapeHtml(S.currentDoc.title||'Document')+'</title>';
  html+='<style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:20px;color:#222;line-height:1.7;}';
  html+='h1{font-size:28px;margin:24px 0 12px;}h2{font-size:22px;margin:20px 0 10px;}h3{font-size:18px;margin:16px 0 8px;}';
  html+='blockquote{border-left:3px solid #ccc;padding-left:16px;color:#555;margin:12px 0;}';
  html+='pre{background:#f5f5f5;padding:12px;border-radius:4px;overflow-x:auto;font-size:13px;}';
  html+='hr{border:none;border-top:1px solid #ddd;margin:20px 0;}';
  html+='</style></head><body>';
  html+='<h1>'+window.escapeHtml(S.currentDoc.title||'Untitled Document')+'</h1>';
  for(const block of S.currentDoc.blocks){
    const text=window.escapeHtml(blockPlainText(block));
    switch(block.type){
      case 'heading1': html+='<h1>'+text+'</h1>'; break;
      case 'heading2': html+='<h2>'+text+'</h2>'; break;
      case 'heading3': html+='<h3>'+text+'</h3>'; break;
      case 'quote': html+='<blockquote>'+text+'</blockquote>'; break;
      case 'code': html+='<pre>'+text+'</pre>'; break;
      case 'list': html+='<ul><li>'+text+'</li></ul>'; break;
      case 'numbered': html+='<ol><li>'+text+'</li></ol>'; break;
      case 'divider': html+='<hr>'; break;
      default: html+='<p>'+text+'</p>';
    }
  }
  html+='</body></html>';
  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const w=window.open(url,'_blank');
  if(w){
    window.addMessage('Document opened in new tab. Use your browser\'s Print (Ctrl+P) → Save as PDF.','system');
  } else {
    window.addMessage('Pop-up blocked. Please allow pop-ups for this site.','system');
  }
}

// Doc DOCX export (simple plaintext .docx via blob)
export function exportDocDocx(){
  if(!S.currentDoc||!S.currentDoc.blocks.length){
    window.addMessage('No document content to export.','system');
    return;
  }
  // Build simple XML-based .docx content
  const text=S.currentDoc.blocks.map(b=>blockPlainText(b)).join('\n\n');
  const blob=new Blob([text],{type:'text/plain'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(S.currentDoc.title||'Untitled')+'.txt';
  a.click();
  URL.revokeObjectURL(a.href);
  window.addMessage('Document exported as .txt (full .docx support coming soon).','system');
}

// ── Doc zoom ──
export function docZoom(delta){
  S.docZoomLevel=Math.max(50,Math.min(200,S.docZoomLevel+delta));
  applyDocZoom();
}

export function docZoomReset(){
  S.docZoomLevel=100;
  applyDocZoom();
}

export function applyDocZoom(){
  // Apply zoom to the entire doc canvas so the page + margins all scale together
  // Using CSS zoom (well-supported) so scrollbar and layout adjust naturally
  const canvas=document.getElementById('docCanvas');
  if(canvas){
    canvas.style.zoom=(S.docZoomLevel/100);
  }
  // Clear any old transform on docPage from previous version
  const page=document.getElementById('docPage');
  if(page){
    page.style.transform='';
    page.style.transformOrigin='';
  }
  const label=document.getElementById('docZoomLabel');
  if(label) label.textContent=S.docZoomLevel+'%';
}

// ── Insert menu (shared with slide mode) ──
export function toggleInsertMenu(e){
  e&&e.stopPropagation();
  const menu=document.getElementById('insertMenu');
  const btn=document.getElementById('insertPlusBtn');
  if(!menu||!btn) return;
  if(menu.style.display==='none'||!menu.style.display){
    // Update visibility of mode-specific items
    menu.querySelectorAll('.tb-slide-only').forEach(el=>{
      el.style.display=(S.currentMode==='slide')?'':'none';
    });
    menu.querySelectorAll('.tb-doc-only').forEach(el=>{
      el.style.display=(S.currentMode==='doc')?'':'none';
    });
    // Position menu relative to button (fixed positioning, opens upward since toolbar is at bottom)
    const rect=btn.getBoundingClientRect();
    // Show offscreen briefly to measure
    menu.style.visibility='hidden';
    menu.style.display='block';
    const menuH=menu.offsetHeight;
    menu.style.visibility='';
    // If there's room above, open upward; otherwise open downward
    if(rect.top>menuH+8){
      menu.style.top=(rect.top-menuH-4)+'px';
    } else {
      menu.style.top=(rect.bottom+4)+'px';
    }
    menu.style.left=rect.left+'px';
    // Close on outside click
    setTimeout(()=>document.addEventListener('click',hideInsertMenu,{once:true}),0);
  } else {
    menu.style.display='none';
  }
}

export function hideInsertMenu(){
  const menu=document.getElementById('insertMenu');
  if(menu) menu.style.display='none';
}

export function triggerLocalImageInsert(){
  hideInsertMenu();
  const input=document.getElementById('imgFileInput');
  if(input) input.click();
}

export function triggerUrlImageInsert(){
  hideInsertMenu();
  const url=prompt('Image URL:');
  if(!url||!url.trim()) return;
  if(S.currentMode==='doc'){
    const afterId=S.docEditingBlockId||S.docSelectedBlockId||S.currentDoc?.blocks[S.currentDoc.blocks.length-1]?.id;
    docPushUndo();
    const blk=docInsertBlock(afterId,'image','');
    blk.meta={src:url.trim(), alt:'', float:'right', caption:'', showCaption:false};
    S.currentDoc.updated=new Date().toISOString();
    renderDocMode();
  } else {
    // Slide mode: stage the URL as an image tag
    window.insertTag(`[image: ${url.trim()}]`);
  }
}

export function handleInsertedFiles(files){
  if(!files||!files.length) return;
  if(S.currentMode==='doc'){
    // Doc mode: insert image blocks for each file
    for(const file of files){
      const reader=new FileReader();
      reader.onload=function(e){
        const afterId=S.docEditingBlockId||S.docSelectedBlockId||S.currentDoc?.blocks[S.currentDoc.blocks.length-1]?.id;
        docPushUndo();
        const blk=docInsertBlock(afterId,'image','');
        blk.meta={src:e.target.result, alt:file.name, float:'right', caption:'', showCaption:false};
        S.currentDoc.updated=new Date().toISOString();
        renderDocMode();
      };
      reader.readAsDataURL(file);
    }
  } else {
    // Slide mode: use the original handleImageFiles
    window.handleImageFiles(files);
  }
  // Reset file input
  const input=document.getElementById('imgFileInput');
  if(input) input.value='';
}

// ── Doc undo/redo ──
//
// Architecture:
//   docPushUndo()  — snapshot current state to undo stack (called before edits)
//   docUndo()      — restore previous different state from undo stack
//   docRedo()      — restore next different state from redo stack
//
// Content comparison uses docContentKey() which strips the `updated` timestamp,
// so snapshots that differ only in timestamp are treated as identical.
//
// Persistence: stacks are saved to sessionStorage (survives refresh, cleared on tab close).
// docSaveUndoStacks() is called after every stack mutation.
// docRestoreUndoStacks() is called when entering doc mode.
//
// Guard: S.docUndoRedoInProgress prevents docPushUndo() from firing during
// renderDocMode() re-focus cycles triggered by undo/redo.

// ── Snapshot & comparison ──
export function docSnapshotDoc(){
  if(!S.currentDoc) return null;
  return JSON.parse(JSON.stringify(S.currentDoc));
}

export function docContentKey(doc){
  if(!doc) return '';
  const copy=Object.assign({},doc);
  delete copy.updated;
  return JSON.stringify(copy);
}

export function docStackHasDifferent(stack){
  const curKey=docContentKey(S.currentDoc);
  for(let i=stack.length-1;i>=0;i--){
    if(docContentKey(stack[i])!==curKey) return true;
  }
  return false;
}

// Pop first snapshot from stack whose content differs from current state.
export function docPopDifferent(stack){
  const curKey=docContentKey(S.currentDoc);
  while(stack.length){
    const candidate=stack.pop();
    if(docContentKey(candidate)!==curKey) return candidate;
  }
  return null;
}

// ── Flush editing DOM → model ──
export function docFlushEditing(){
  clearTimeout(S.docUndoPushTimer);
  // In freeflow mode, sync all blocks from the DOM
  const page=document.getElementById('docPage');
  if(!page) return;

  // Walk through all block elements and sync their content
  const walker=document.createTreeWalker(page, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node){
      if(node.dataset?.blockId) return NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_SKIP;
    }
  });

  let node;
  while(node=walker.nextNode()){
    const bid=node.dataset.blockId;
    const block=docGetBlock(bid);
    if(!block) continue;

    // Extract text content from the element
    let text='';
    for(const tn of node.childNodes){
      if(tn.nodeType===Node.TEXT_NODE){
        text+=tn.textContent;
      } else if(tn.nodeType===Node.ELEMENT_NODE){
        text+=tn.textContent;
      }
    }
    blockFromPlainText(block, text);
  }

  S.currentDoc.updated=new Date().toISOString();
}

// ── Stack operations ──
export function docPushUndo(){
  if(S.docUndoRedoInProgress) return;
  const snap=docSnapshotDoc();
  if(!snap) return;
  const key=docContentKey(snap);
  if(S.docUndoStack.length>0 && docContentKey(S.docUndoStack[S.docUndoStack.length-1])===key) return;
  S.docUndoStack.push(snap);
  if(S.docUndoStack.length>DOC_MAX_UNDO) S.docUndoStack.shift();
  S.docRedoStack=[];
  docUpdateUndoUI();
  docSaveUndoStacks();
}

export function docUndo(){
  if(!S.docUndoStack.length) return;
  S.docUndoRedoInProgress=true;
  const snap=docPopDifferent(S.docUndoStack);
  if(!snap){ S.docUndoRedoInProgress=false; docUpdateUndoUI(); docSaveUndoStacks(); return; }
  const current=docSnapshotDoc();
  if(current) S.docRedoStack.push(current);
  S.currentDoc=snap;
  S.docEditingBlockId=null;
  docUpdateUndoUI();
  renderDocMode();
  docAutoSave();
  S.docUndoRedoInProgress=false;
  docSaveUndoStacks();
}

export function docRedo(){
  if(!S.docRedoStack.length) return;
  S.docUndoRedoInProgress=true;
  const snap=docPopDifferent(S.docRedoStack);
  if(!snap){ S.docUndoRedoInProgress=false; docUpdateUndoUI(); docSaveUndoStacks(); return; }
  const current=docSnapshotDoc();
  if(current) S.docUndoStack.push(current);
  S.currentDoc=snap;
  S.docEditingBlockId=null;
  docUpdateUndoUI();
  renderDocMode();
  docAutoSave();
  S.docUndoRedoInProgress=false;
  docSaveUndoStacks();
}

// ── Persistence (sessionStorage) ──
export function docSaveUndoStacks(){
  try{
    const u=S.docUndoStack.slice(-20);
    const r=S.docRedoStack.slice(-20);
    sessionStorage.setItem('sloth_doc_undo',JSON.stringify(u));
    sessionStorage.setItem('sloth_doc_redo',JSON.stringify(r));
  }catch(e){
    try{
      sessionStorage.setItem('sloth_doc_undo',JSON.stringify(S.docUndoStack.slice(-5)));
      sessionStorage.setItem('sloth_doc_redo',JSON.stringify(S.docRedoStack.slice(-5)));
    }catch(e2){}
  }
}

export function docRestoreUndoStacks(){
  try{
    const u=sessionStorage.getItem('sloth_doc_undo');
    const r=sessionStorage.getItem('sloth_doc_redo');
    if(u) S.docUndoStack=JSON.parse(u);
    if(r) S.docRedoStack=JSON.parse(r);
  }catch(e){}
}

// ── UI ──
export function docUpdateUndoUI(){
  const ub=document.getElementById('undoBtn');
  const rb=document.getElementById('redoBtn');
  const canUndo=docStackHasDifferent(S.docUndoStack);
  const canRedo=docStackHasDifferent(S.docRedoStack);
  if(ub){ ub.style.opacity=canUndo?'1':'0.35'; ub.style.color=canUndo?'#fff':'#555'; }
  if(rb){ rb.style.opacity=canRedo?'1':'0.35'; rb.style.color=canRedo?'#fff':'#555'; }
}

// ── Doc toolbar action functions ──
export function docExecCmd(cmd){
  document.execCommand(cmd);
}

export function docToolbarChangeType(type){
  if(!S.docEditingBlockId&&!S.docSelectedBlockId) return;
  const bid=S.docEditingBlockId||S.docSelectedBlockId;
  docPushUndo();
  docConvertBlock(bid, type);
  renderDocMode();
  setTimeout(()=>{ const el=document.querySelector(`[data-block-id="${bid}"]`); if(el) el.focus(); },10);
}

export function docToolbarFont(font){
  document.execCommand('fontName', false, font);
}

export function docToolbarFontSize(size){
  // execCommand fontSize only supports 1-7, so use CSS instead
  const sel=window.getSelection();
  if(!sel||!sel.rangeCount) return;
  const range=sel.getRangeAt(0);
  if(range.collapsed) return;
  const span=document.createElement('span');
  span.style.fontSize=size+'px';
  range.surroundContents(span);
}

export function docToolbarTextColor(color){
  document.execCommand('foreColor', false, color);
}

export function docToolbarBgColor(color){
  document.execCommand('hiliteColor', false, color);
}

export function docInsertDivider(){
  const afterId=S.docEditingBlockId||S.docSelectedBlockId||S.currentDoc?.blocks[S.currentDoc.blocks.length-1]?.id;
  docPushUndo();
  docInsertBlock(afterId,'divider','');
  renderDocMode();
}

export function docInsertImageBlock(){
  const afterId=S.docEditingBlockId||S.docSelectedBlockId||S.currentDoc?.blocks[S.currentDoc.blocks.length-1]?.id;
  docPushUndo();
  docInsertBlock(afterId,'image','');
  renderDocMode();
}

export function docInsertTablePrompt(){
  const rows=parseInt(prompt('Number of rows:','3'))||3;
  const cols=parseInt(prompt('Number of columns:','3'))||3;
  const cells=Array(rows).fill(null).map(()=>Array(cols).fill(''));
  const afterId=S.docEditingBlockId||S.docSelectedBlockId||S.currentDoc?.blocks[S.currentDoc.blocks.length-1]?.id;
  docPushUndo();
  const blk=docInsertBlock(afterId,'table','');
  blk.meta={cells, rows, cols, float:'none', caption:'', showCaption:false};
  renderDocMode();
}

// ── Block popups (image/table edit menu) ──
export function docShowBlockPopup(blockId, anchorEl){
  docHideBlockPopup();
  const block=docGetBlock(blockId);
  if(!block) return;
  const float=block.meta?.float||'right';
  const hasCaption=block.meta?.showCaption===true;

  const popup=document.createElement('div');
  popup.id='blockEditPopup';
  popup.className='img-edit-popup';
  popup.innerHTML=`
    <div class="img-popup-row">
      <button class="${float==='left'?'active':''}" onclick="event.stopPropagation();docSetBlockFloat('${blockId}','left')">◧ Left</button>
      <button class="${float==='none'?'active':''}" onclick="event.stopPropagation();docSetBlockFloat('${blockId}','none')">▣ Center</button>
      <button class="${float==='right'?'active':''}" onclick="event.stopPropagation();docSetBlockFloat('${blockId}','right')">◨ Right</button>
      <span style="width:1px;height:16px;background:#444;margin:0 4px;"></span>
      <button onclick="event.stopPropagation();docToggleBlockCaption('${blockId}')">${hasCaption?'− Caption':'+ Caption'}</button>
    </div>`;

  document.body.appendChild(popup);

  // Position above anchor using getBoundingClientRect
  const rect=anchorEl.getBoundingClientRect();
  const popupW=popup.offsetWidth;
  let left=rect.left+(rect.width/2)-(popupW/2);
  if(left<8) left=8;
  if(left+popupW>window.innerWidth-8) left=window.innerWidth-8-popupW;
  let top=rect.top-popup.offsetHeight-8;
  if(top<8) top=rect.bottom+8;
  popup.style.left=left+'px';
  popup.style.top=top+'px';

  setTimeout(()=>{
    document.addEventListener('click', function closer(e){
      if(!e.target.closest('#blockEditPopup')&&!e.target.closest(`[data-block-id="${blockId}"]`)){
        docHideBlockPopup();
        document.removeEventListener('click',closer);
      }
    });
  },0);
}

export function docHideBlockPopup(){
  const p=document.getElementById('blockEditPopup');
  if(p) p.remove();
}

// Aliases for backward compat
export function docShowImagePopup(blockId, el){ docShowBlockPopup(blockId, el); }
export function docHideImagePopup(){ docHideBlockPopup(); }

// Shared float control (works for image + table)
export function docSetBlockFloat(blockId, float){
  const block=docGetBlock(blockId);
  if(!block) return;
  docPushUndo();
  if(!block.meta) block.meta={};
  block.meta.float=float;
  S.currentDoc.updated=new Date().toISOString();
  renderDocMode();
}

export function docSetImageFloat(bid,f){ docSetBlockFloat(bid,f); }

// Shared caption toggle (works for image + table)
export function docToggleBlockCaption(blockId){
  const block=docGetBlock(blockId);
  if(!block) return;
  if(!block.meta) block.meta={};
  block.meta.showCaption=!block.meta.showCaption;
  if(!block.meta.showCaption) block.meta.caption='';
  S.currentDoc.updated=new Date().toISOString();
  renderDocMode();
}

// Save figure/table caption (shared)
export function docSaveFigureCaption(blockId, text){
  const block=docGetBlock(blockId);
  if(!block) return;
  if(!block.meta) block.meta={};
  block.meta.caption=text.trim();
  S.currentDoc.updated=new Date().toISOString();
}

export function docToggleCaption(bid){ docToggleBlockCaption(bid); }

// Table cell editing
export function docSaveTableCell(blockId, row, col, text){
  const block=docGetBlock(blockId);
  if(!block||block.type!=='table'||!block.meta?.cells) return;
  if(block.meta.cells[row]) block.meta.cells[row][col]=text;
  S.currentDoc.updated=new Date().toISOString();
}

export function docTableKeydown(event, blockId, row, col){
  if(event.key==='Tab'){
    event.preventDefault();
    // Move to next cell
    const block=docGetBlock(blockId);
    if(!block?.meta?.cells) return;
    const maxRow=block.meta.cells.length-1;
    const maxCol=(block.meta.cells[0]?.length||1)-1;
    let nr=row, nc=col+1;
    if(nc>maxCol){ nc=0; nr++; }
    if(nr>maxRow) return;
    // Focus the target cell
    const tableEl=document.querySelector(`[data-block-id="${blockId}"] table`);
    if(tableEl){
      const rows=tableEl.querySelectorAll('tr');
      if(rows[nr]){
        const cells=rows[nr].querySelectorAll('th,td');
        if(cells[nc]) cells[nc].focus();
      }
    }
  }
}

export function docTableAddRow(blockId){
  const block=docGetBlock(blockId);
  if(!block||block.type!=='table'||!block.meta?.cells) return;
  docPushUndo();
  const cols=block.meta.cols||block.meta.cells[0]?.length||3;
  block.meta.cells.push(Array(cols).fill(''));
  block.meta.rows=(block.meta.rows||block.meta.cells.length-1)+1;
  S.currentDoc.updated=new Date().toISOString();
  renderDocMode();
}

// Update block type dropdown when a block is selected/focused
export function docUpdateToolbarState(){
  const bid=S.docEditingBlockId||S.docSelectedBlockId;
  if(!bid) return;
  const block=docGetBlock(bid);
  if(!block) return;
  const typeSelect=document.getElementById('dtBlockType');
  if(typeSelect) typeSelect.value=block.type;
}

// ═══════════════════════════════════════════
// CONTEXT MENU FOR DOC BLOCKS
// ═══════════════════════════════════════════

export function docShowContextMenu(blockId, x, y){
  S.docCtxMenuBlockId=blockId;
  const block=docGetBlock(blockId);
  if(!block) return;
  const text=blockPlainText(block);

  // Remove existing menu
  docHideContextMenu();

  const menu=document.createElement('div');
  menu.id='docCtxMenu';
  menu.className='doc-ctx-menu';

  // Build menu based on block type
  const isText=!['divider','image','table'].includes(block.type);
  menu.innerHTML=`
    <div class="doc-ctx-section">Direct</div>
    ${isText?`
    <div class="doc-ctx-item" onclick="docCtxAction('edit')"><span class="dci-icon">✏️</span>Edit text</div>
    `:''}
    <div class="doc-ctx-item" onclick="docCtxAction('duplicate')"><span class="dci-icon">📋</span>Duplicate block</div>
    <div class="doc-ctx-item" onclick="docCtxAction('moveUp')"><span class="dci-icon">↑</span>Move up</div>
    <div class="doc-ctx-item" onclick="docCtxAction('moveDown')"><span class="dci-icon">↓</span>Move down</div>
    <div class="doc-ctx-item" onclick="docCtxAction('insertBelow')"><span class="dci-icon">＋</span>Insert block below</div>
    <div class="doc-ctx-sep"></div>
    <div class="doc-ctx-section">✦ AI</div>
    ${isText?`
    <div class="doc-ctx-item" onclick="docCtxAI('rewrite','Rewrite this more concisely')"><span class="dci-icon">✨</span>Rewrite concisely</div>
    <div class="doc-ctx-item" onclick="docCtxAI('expand','Expand this with more detail')"><span class="dci-icon">📝</span>Expand / elaborate</div>
    <div class="doc-ctx-item" onclick="docCtxAI('translate','Translate this to English')"><span class="dci-icon">🌐</span>Translate</div>
    <div class="doc-ctx-item" onclick="docCtxAI('improve','Improve the writing quality, fix grammar')"><span class="dci-icon">💡</span>Improve writing</div>
    <div class="doc-ctx-item" onclick="docCtxAI('simplify','Simplify this for a general audience')"><span class="dci-icon">📖</span>Simplify</div>
    `:''}
    <div class="doc-ctx-sep"></div>
    <div class="doc-ctx-input-row">
      <input class="doc-ctx-input" id="docCtxInput" placeholder="Ask AI to change this..." onkeydown="if(event.key==='Enter')docCtxCustomAI()">
      <button class="doc-ctx-go" onclick="docCtxCustomAI()">Go</button>
    </div>
    <div class="doc-ctx-sep"></div>
    <div class="doc-ctx-item" style="color:#e47474;" onclick="docCtxAction('delete')"><span class="dci-icon">🗑️</span>Delete block</div>
  `;

  document.body.appendChild(menu);

  // Position: ensure it stays on screen
  const menuRect=menu.getBoundingClientRect();
  if(x+menuRect.width>window.innerWidth) x=window.innerWidth-menuRect.width-10;
  if(y+menuRect.height>window.innerHeight) y=window.innerHeight-menuRect.height-10;
  menu.style.left=Math.max(5,x)+'px';
  menu.style.top=Math.max(5,y)+'px';

  // Close on outside click
  setTimeout(()=>{
    document.addEventListener('click',function _close(e){
      if(!menu.contains(e.target)){ docHideContextMenu(); document.removeEventListener('click',_close); }
    });
  },10);
}

export function docHideContextMenu(){
  const menu=document.getElementById('docCtxMenu');
  if(menu) menu.remove();
  S.docCtxMenuBlockId=null;
}

export function docCtxAction(action){
  const bid=S.docCtxMenuBlockId;
  if(!bid) return;
  docHideContextMenu();

  switch(action){
    case 'edit': {
      const el=document.querySelector(`[data-block-id="${bid}"]`);
      if(el){ el.focus(); docFocusBlock(bid); }
      break;
    }
    case 'duplicate': {
      docPushUndo();
      const block=docGetBlock(bid);
      if(block){
        const newBlock=docInsertBlock(bid, block.type, blockPlainText(block));
        newBlock.meta={...block.meta};
      }
      renderDocMode();
      break;
    }
    case 'moveUp': docPushUndo(); docMoveBlock(bid,'up'); renderDocMode(); break;
    case 'moveDown': docPushUndo(); docMoveBlock(bid,'down'); renderDocMode(); break;
    case 'insertBelow': {
      docPushUndo();
      const nb=docInsertBlock(bid,'paragraph','');
      S.docEditingBlockId=nb.id;
      renderDocMode();
      setTimeout(()=>{ const el=document.querySelector(`[data-block-id="${nb.id}"]`); if(el) el.focus(); },10);
      break;
    }
    case 'delete': docPushUndo(); docDeleteBlock(bid); renderDocMode(); break;
  }
  docAutoSave();
}

export async function docCtxAI(action, instruction, explicitBlockId){
  const bid=explicitBlockId||S.docCtxMenuBlockId;
  docHideContextMenu();
  if(!bid) return;
  const block=docGetBlock(bid);
  if(!block) return;
  const text=blockPlainText(block);
  if(!text.trim()){ window.addMessage('Block is empty — nothing to process.','system'); return; }

  const statusDiv=window.addMessage('✦ AI processing...','system');
  try{
    const prompt=`You are a document editor AI. The user wants you to edit a single text block.
Instruction: ${instruction}
Original text: "${text}"
Output ONLY the new text. No quotes, no explanation, no JSON. Just the improved text in the same language as the original.`;
    const raw=await window.callLLM(prompt,[{role:'user',content:instruction}],{temperature:0.5,max_tokens:2048});
    const cleaned=raw.trim().replace(/^["']|["']$/g,'');
    docPushUndo();
    blockFromPlainText(block, cleaned);
    S.currentDoc.updated=new Date().toISOString();
    statusDiv.remove();
    window.addMessage(`✓ Block updated (${action})`,'ai');
    renderDocMode();
    docAutoSave();
  }catch(err){
    statusDiv.remove();
    window.addMessage(`Error: ${err.message}`,'ai');
  }
}

export async function docCtxCustomAI(){
  const input=document.getElementById('docCtxInput');
  if(!input) return;
  const instruction=input.value.trim();
  if(!instruction) return;
  const bid=S.docCtxMenuBlockId;
  await docCtxAI('custom', instruction);
}

// Right-click to open context menu on doc blocks
document.addEventListener('contextmenu',function(e){
  if(S.currentMode!=='doc') return;
  const blockEl=e.target.closest('.doc-block');
  if(!blockEl) return;
  e.preventDefault();
  const blockId=blockEl.dataset.blockId;
  if(blockId) docShowContextMenu(blockId, e.clientX, e.clientY);
});


// ═══════════════════════════════════════════
// BLOCK SCHEMA — Unified block type system
// ═══════════════════════════════════════════
// Block types: paragraph, heading1, heading2, heading3, quote, code, list, numbered, image, divider, caption, table
// Each block: { id, type, content (ProseMirror-style runs OR plain text), meta:{} }
// ProseMirror runs: [{text:"hello ", marks:[]}, {text:"world", marks:[{type:"bold"}]}]

export function blockId(){ return 'blk_'+Date.now()+'_'+Math.random().toString(36).slice(2,6); }

export function createBlock(type='paragraph', content='', meta={}){
  return {
    id: blockId(),
    type,
    content: typeof content==='string' ? [{text:content, marks:[]}] : content,
    meta // e.g. {level:1} for headings, {src,alt} for images, {language} for code
  };
}

export function blockPlainText(block){
  if(!block||!block.content) return '';
  if(typeof block.content==='string') return block.content;
  return block.content.map(r=>r.text||'').join('');
}

export function blockFromPlainText(block,text){
  // Preserve marks structure if single run, otherwise reset
  if(block.content&&block.content.length===1){
    block.content[0].text=text;
  } else {
    block.content=[{text, marks:[]}];
  }
}

export function docCreateNew(title){
  const doc={
    id: 'doc_'+Date.now(),
    title: title||'Untitled Document',
    blocks: [
      createBlock('heading1', title||'Untitled Document'),
      createBlock('paragraph', '')
    ],
    created: new Date().toISOString(),
    updated: new Date().toISOString()
  };
  return doc;
}

export function docInsertBlock(afterBlockId, type='paragraph', content=''){
  if(!S.currentDoc) return null;
  const newBlock=createBlock(type, content);
  if(!afterBlockId){
    S.currentDoc.blocks.push(newBlock);
  } else {
    const idx=S.currentDoc.blocks.findIndex(b=>b.id===afterBlockId);
    if(idx===-1) S.currentDoc.blocks.push(newBlock);
    else S.currentDoc.blocks.splice(idx+1, 0, newBlock);
  }
  S.currentDoc.updated=new Date().toISOString();
  return newBlock;
}

export function docDeleteBlock(blockId){
  if(!S.currentDoc) return;
  const idx=S.currentDoc.blocks.findIndex(b=>b.id===blockId);
  if(idx===-1) return;
  S.currentDoc.blocks.splice(idx,1);
  // Always keep at least one block
  if(S.currentDoc.blocks.length===0){
    S.currentDoc.blocks.push(createBlock('paragraph',''));
  }
  S.currentDoc.updated=new Date().toISOString();
}

export function docMoveBlock(blockId, direction){
  if(!S.currentDoc) return;
  const idx=S.currentDoc.blocks.findIndex(b=>b.id===blockId);
  if(idx===-1) return;
  const targetIdx=direction==='up'?idx-1:idx+1;
  if(targetIdx<0||targetIdx>=S.currentDoc.blocks.length) return;
  const tmp=S.currentDoc.blocks[idx];
  S.currentDoc.blocks[idx]=S.currentDoc.blocks[targetIdx];
  S.currentDoc.blocks[targetIdx]=tmp;
  S.currentDoc.updated=new Date().toISOString();
}

export function docGetBlock(blockId){
  if(!S.currentDoc) return null;
  return S.currentDoc.blocks.find(b=>b.id===blockId)||null;
}

// Convert block type (e.g. paragraph → heading1)
export function docConvertBlock(blockId, newType){
  const block=docGetBlock(blockId);
  if(!block) return;
  block.type=newType;
  S.currentDoc.updated=new Date().toISOString();
}

// ═══════════════════════════════════════════
// DOC RENDERER — Vertical block flow
// ═══════════════════════════════════════════

export function renderDocMode(){
  const canvas=document.getElementById('docCanvas');
  if(!canvas) return;
  // Sync doc title to name bar input
  const nameInput=document.getElementById('deckNameInput');
  if(nameInput&&document.activeElement!==nameInput&&S.currentDoc){
    nameInput.value=S.currentDoc.title||'';
  }
  if(!S.currentDoc||!S.currentDoc.blocks||S.currentDoc.blocks.length===0){
    canvas.innerHTML=`
      <div class="doc-page">
        <div class="doc-empty-state">
          <div style="font-size:48px;margin-bottom:16px;opacity:0.3;">📄</div>
          <div style="font-size:16px;color:#999;margin-bottom:8px;">Doc Mode</div>
          <div style="font-size:12px;color:#666;max-width:300px;line-height:1.6;">
            Freeflow document editor. Type in the chat to add content, or start writing directly here.
          </div>
        </div>
      </div>`;
    return;
  }

  // Save cursor position before re-render
  _docSaveCursor();

  // Build HTML: text blocks as semantic elements, media blocks as contenteditable=false islands
  let html='';
  let numberedCounter=0;
  let inUl=false;
  let inOl=false;

  for(const block of S.currentDoc.blocks){
    const content=renderBlockContent(block);
    const bid=block.id;

    // Close open lists if switching away from list
    if((block.type!=='list'&&inUl)||(block.type!=='numbered'&&inOl)){
      if(inUl) html+='</ul>';
      if(inOl) html+='</ol>';
      inUl=false;
      inOl=false;
      numberedCounter=0;
    }

    // Image block (floating island)
    if(block.type==='image'){
      const src=block.meta?.src||'';
      const alt=block.meta?.alt||'';
      const float=block.meta?.float||'right';
      const caption=block.meta?.caption||'';
      const hasCaption=block.meta?.showCaption===true;
      const floatClass='float-'+float;
      html+=`<div class="doc-float ${floatClass}" contenteditable="false" data-block-id="${bid}" data-type="image">
        <div class="doc-float-handle" onclick="event.stopPropagation();docShowBlockPopup('${bid}',this)">⋮</div>
        ${src?`<img src="${src}" alt="${window.escapeHtml(alt)}" draggable="false" onclick="event.stopPropagation();docShowImagePopup('${bid}',this)" />`:`<div style="padding:20px;color:#555;font-size:12px;">Image placeholder</div>`}
        ${hasCaption?`<figcaption class="doc-figure-caption" contenteditable="true" data-caption-for="${bid}"
          onblur="docSaveFigureCaption('${bid}',this.textContent)"
          onclick="event.stopPropagation()"
          onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${window.escapeHtml(caption)}</figcaption>`:''}
      </div>`;
      continue;
    }

    // Table block (floating island)
    if(block.type==='table'){
      const cells=block.meta?.cells||[];
      const float=block.meta?.float||'none';
      const hasCaption=block.meta?.showCaption===true;
      const caption=block.meta?.caption||'';
      const floatClass='float-'+float;
      let tableHtml='<table>';
      cells.forEach((row,ri)=>{
        tableHtml+='<tr>';
        row.forEach((cell,ci)=>{
          const tag=ri===0?'th':'td';
          tableHtml+=`<${tag} contenteditable="true" onblur="docSaveTableCell('${bid}',${ri},${ci},this.textContent)" onkeydown="docTableKeydown(event,'${bid}',${ri},${ci})">${window.escapeHtml(cell)}</${tag}>`;
        });
        tableHtml+='</tr>';
      });
      tableHtml+='</table>';
      tableHtml+=`<button class="table-add-row" onclick="event.stopPropagation();docTableAddRow('${bid}')">+ Add row</button>`;
      html+=`<div class="doc-float ${floatClass}" contenteditable="false" data-block-id="${bid}" data-type="table">
        <div class="doc-float-handle" onclick="event.stopPropagation();docShowBlockPopup('${bid}',this)">⋮</div>
        ${tableHtml}
        ${hasCaption?`<figcaption class="doc-figure-caption" contenteditable="true" data-caption-for="${bid}"
          onblur="docSaveFigureCaption('${bid}',this.textContent)"
          onclick="event.stopPropagation()"
          onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${window.escapeHtml(caption)}</figcaption>`:''}
      </div>`;
      continue;
    }

    // Divider (inline non-editable)
    if(block.type==='divider'){
      html+=`<hr class="doc-divider" contenteditable="false" data-block-id="${bid}" />`;
      numberedCounter=0;
      continue;
    }

    // Text blocks — rendered as semantic HTML elements
    switch(block.type){
      case 'heading1':
        html+=`<h1 data-block-id="${bid}">${content||''}</h1>`;
        numberedCounter=0;
        break;
      case 'heading2':
        html+=`<h2 data-block-id="${bid}">${content||''}</h2>`;
        numberedCounter=0;
        break;
      case 'heading3':
        html+=`<h3 data-block-id="${bid}">${content||''}</h3>`;
        numberedCounter=0;
        break;
      case 'quote':
        html+=`<blockquote data-block-id="${bid}">${content||''}</blockquote>`;
        numberedCounter=0;
        break;
      case 'code':
        html+=`<pre data-block-id="${bid}">${content||''}</pre>`;
        numberedCounter=0;
        break;
      case 'list':
        if(!inUl){ html+='<ul>'; inUl=true; }
        html+=`<li data-block-id="${bid}">${content||''}</li>`;
        break;
      case 'numbered':
        if(!inOl){ html+=`<ol>`; inOl=true; }
        numberedCounter++;
        html+=`<li data-block-id="${bid}" data-number="${numberedCounter}">${content||''}</li>`;
        break;
      default: // paragraph, caption, etc.
        html+=`<p data-block-id="${bid}">${content||''}</p>`;
        numberedCounter=0;
    }
  }

  // Close any open lists
  if(inUl) html+='</ul>';
  if(inOl) html+='</ol>';

  canvas.innerHTML=`
    <div class="doc-page" id="docPage" contenteditable="true"
      oninput="docFreeflowInput()"
      onkeydown="docFreeflowKeydown(event)"
      onclick="docFreeflowClick(event)"
      ondragover="docDragOver(event)" ondrop="docDrop(event)" ondragleave="docDragLeave(event)">
      ${html}
    </div>`;

  // Restore cursor position after render
  _docRestoreCursor();
}

export function renderBlockContent(block){
  if(!block.content) return '';
  if(typeof block.content==='string') return window.escapeHtml(block.content);
  // ProseMirror-style runs
  return block.content.map(run=>{
    let text=window.escapeHtml(run.text||'');
    if(!run.marks||run.marks.length===0) return text;
    for(const mark of run.marks){
      switch(mark.type){
        case 'bold': text=`<strong>${text}</strong>`; break;
        case 'italic': text=`<em>${text}</em>`; break;
        case 'underline': text=`<u>${text}</u>`; break;
        case 'strike': text=`<s>${text}</s>`; break;
        case 'code': text=`<code style="background:#1e1e1e;padding:1px 4px;border-radius:2px;font-size:0.9em;">${text}</code>`; break;
        case 'link': text=`<a href="${window.escapeHtml(mark.attrs?.href||'#')}" style="color:#7886A5;text-decoration:underline;" target="_blank">${text}</a>`; break;
      }
    }
    return text;
  }).join('');
}

// ── Freeflow editor event handlers ──

export function docFreeflowInput(){
  // Sync DOM changes back to blocks data model
  const page=document.getElementById('docPage');
  if(!page) return;

  // Debounced undo snapshot: push undo every 1.5s of typing
  clearTimeout(S.docUndoPushTimer);
  S.docUndoPushTimer=setTimeout(()=>docPushUndo(),1500);

  // Auto-save on every content change (debounced)
  docAutoSave();

  // Slash command detection: check if current selection starts with /
  const sel=window.getSelection();
  if(sel&&sel.rangeCount>0){
    const range=sel.getRangeAt(0);
    const node=range.startContainer;
    const offset=range.startOffset;
    let text='';

    // Find the start of the line from cursor position
    const walker=document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
    walker.currentNode=node;
    let currentNode=node;
    let charCount=0;

    // Collect text from start of element to cursor
    while(currentNode){
      if(currentNode===node){
        text+=currentNode.textContent.substring(0,offset);
        break;
      }
      currentNode=walker.previousNode();
      if(!currentNode||currentNode.parentElement.closest('[contenteditable="false"]')) break;
      text=currentNode.textContent+text;
    }

    // Check if starts with / (simple case for now)
    const lineStart=text.lastIndexOf('\n')+1;
    const lineText=text.substring(lineStart);
    if(lineText.startsWith('/')){
      docShowTypeMenu(page, lineText.slice(1));
    } else {
      docHideTypeMenu();
    }
  }
}

export function docFreeflowKeydown(event){
  const sel=window.getSelection();
  if(!sel||sel.rangeCount===0) return;

  const range=sel.getRangeAt(0);
  const node=range.startContainer;
  const page=document.getElementById('docPage');
  if(!page) return;

  // Keyboard shortcuts: Ctrl/Cmd + B/I/U
  if((event.ctrlKey||event.metaKey)&&!event.shiftKey){
    if(event.key==='b'||event.key==='B'){ event.preventDefault(); document.execCommand('bold'); return; }
    if(event.key==='i'||event.key==='I'){ event.preventDefault(); document.execCommand('italic'); return; }
    if(event.key==='u'||event.key==='U'){ event.preventDefault(); document.execCommand('underline'); return; }
  }

  // Ctrl/Cmd + Z/Y for undo/redo (override browser default)
  if((event.ctrlKey||event.metaKey)&&!event.shiftKey){
    if(event.key==='z'||event.key==='Z'){ event.preventDefault(); docFlushEditing(); docUndo(); return; }
  }
  if((event.ctrlKey||event.metaKey)&&event.shiftKey){
    if(event.key==='z'||event.key==='Z'){ event.preventDefault(); docFlushEditing(); docRedo(); return; }
  }

  // Tab: indent in lists or convert to list
  if(event.key==='Tab'){
    event.preventDefault();
    // Find closest li ancestor
    const li=node.parentElement?.closest('li');
    if(li){
      // TODO: increase indent level (would need nested lists support)
    } else {
      // Convert current block to list
      const blockEl=_docFindBlockElement(node);
      if(blockEl&&(blockEl.tagName==='P'||blockEl.tagName==='H1'||blockEl.tagName==='H2'||blockEl.tagName==='H3')){
        const bid=blockEl.dataset.blockId;
        const block=docGetBlock(bid);
        if(block&&block.type==='paragraph'){
          docConvertBlock(bid,'list');
          renderDocMode();
          _docRestoreCursor();
        }
      }
    }
    return;
  }

  // Enter: handle lists and block creation
  if(event.key==='Enter'&&!event.shiftKey){
    // Check if in list item
    const li=node.parentElement?.closest('li');
    if(li){
      // Let browser handle creating new <li>
      return;
    }

    // Not in list — check for slash menu
    if(S.docTypeMenuVisible){
      event.preventDefault();
      docApplyTypeMenuSelection(null);
      return;
    }

    // Otherwise, allow normal Enter behavior (paragraph break)
    return;
  }

  // Backspace: handle merging blocks
  if(event.key==='Backspace'){
    const atStart=range.startOffset===0 && range.startContainer===node;
    if(!atStart) return;

    // Find the block element we're in
    const blockEl=_docFindBlockElement(node);
    if(!blockEl) return;

    const bid=blockEl.dataset.blockId;
    const block=docGetBlock(bid);
    if(!block) return;

    // Find previous block
    const idx=S.currentDoc.blocks.findIndex(b=>b.id===bid);
    if(idx===0) return; // First block

    const prevBlock=S.currentDoc.blocks[idx-1];
    // Don't merge with media blocks or dividers
    if(prevBlock.type==='divider'||prevBlock.type==='image'||prevBlock.type==='table') return;

    // Merge content
    event.preventDefault();
    const curText=blockPlainText(block);
    const prevText=blockPlainText(prevBlock);
    blockFromPlainText(prevBlock, prevText+curText);
    docDeleteBlock(bid);
    S.currentDoc.updated=new Date().toISOString();
    docPushUndo();
    renderDocMode();
    _docRestoreCursor();
    return;
  }
}

export function docFreeflowClick(event){
  // Handle clicks on media blocks (non-editable islands)
  const target=event.target;
  if(target.closest('[contenteditable="false"][data-block-id]')){
    // Media block clicked — show context menu
    const mediaBlock=target.closest('[data-block-id]');
    if(mediaBlock&&mediaBlock.dataset.blockId){
      showDocCtxAiMenu(mediaBlock.dataset.blockId, event);
    }
  }
}

// ── Stub functions for backward compatibility with old code ──
// In freeflow mode, these are no-ops or simplified versions

export function docSelectBlock(blockId, e){
  // In freeflow mode, selection is implicit with contenteditable
  // Just update toolbar if needed
  S.docSelectedBlockId=blockId;
  docUpdateToolbarState();
}

export function docPageClick(event){
  // Click on blank area → clear selection
  if(!event.target.closest('[data-block-id]')&&!event.target.closest('[contenteditable="false"]')){
    window.clearSelection?.();
  }
}

export function docFocusBlock(blockId){
  // Push undo snapshot when user starts editing a new block
  if(S.docEditingBlockId!==blockId) docPushUndo();
  S.docEditingBlockId=blockId;
  docUpdateToolbarState();
}

export function docBlurBlock(blockId){
  // Save content on blur (in freeflow, this is handled by docFlushEditing)
  S.docEditingBlockId=null;
}

export function docExtractText(el){
  // Get text content from an element
  if(!el) return '';
  let text='';
  for(const node of el.childNodes){
    if(node.nodeType===Node.TEXT_NODE) text+=node.textContent;
    else if(node.nodeType===Node.ELEMENT_NODE) text+=node.textContent;
  }
  return text;
}

// Helper: find the block-level element containing a node
export function _docFindBlockElement(node){
  if(!node) return null;
  let current=node.nodeType===Node.ELEMENT_NODE?node:node.parentElement;
  while(current){
    if(current.dataset?.blockId) return current;
    current=current.parentElement;
  }
  return null;
}

// ── Cursor position save/restore ──
let docSavedCursorPos=null;

export function _docSaveCursor(){
  const sel=window.getSelection();
  if(!sel||sel.rangeCount===0){
    docSavedCursorPos=null;
    return;
  }
  const range=sel.getRangeAt(0);
  const page=document.getElementById('docPage');
  if(!page||!page.contains(range.startContainer)){
    docSavedCursorPos=null;
    return;
  }

  // Find block ID and offset within the page
  const blockEl=_docFindBlockElement(range.startContainer);
  if(!blockEl) return;

  const bid=blockEl.dataset.blockId;
  let offset=0;
  // Count characters from page start to cursor
  const walker=document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  let node=walker.nextNode();
  while(node&&node!==range.startContainer){
    offset+=node.textContent.length;
    node=walker.nextNode();
  }
  if(node){
    offset+=range.startOffset;
  }

  docSavedCursorPos={blockId:bid, offset};
}

export function _docRestoreCursor(){
  if(!docSavedCursorPos) return;
  const page=document.getElementById('docPage');
  if(!page) return;

  const {blockId, offset}=docSavedCursorPos;
  let charCount=0;
  let targetNode=null;
  let targetOffset=0;

  // Walk through all text nodes to find the position
  const walker=document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  let node=walker.nextNode();
  while(node){
    if(charCount+node.textContent.length>=offset){
      targetNode=node;
      targetOffset=offset-charCount;
      break;
    }
    charCount+=node.textContent.length;
    node=walker.nextNode();
  }

  if(targetNode){
    const range=document.createRange();
    range.setStart(targetNode, Math.min(targetOffset, targetNode.textContent.length));
    range.collapse(true);
    const sel=window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  docSavedCursorPos=null;
}

// Helper: find text node at character offset within an element
export function _docFindTextNode(el, charOffset){
  const walker=document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let count=0;
  while(walker.nextNode()){
    const node=walker.currentNode;
    // Skip nodes inside the drag handle
    if(node.parentElement?.closest('.doc-block-handle')) continue;
    if(count+node.textContent.length>=charOffset){
      return {node, offset:charOffset-count};
    }
    count+=node.textContent.length;
  }
  // Fallback: return last text node at end
  const last=walker.currentNode||el;
  return {node:last, offset:last.textContent?.length||0};
}

// ── Slash command type menu ──
export function docShowTypeMenu(anchorEl, filter){
  const filtered=DOC_BLOCK_TYPES.filter(t=>
    !filter||t.label.toLowerCase().includes(filter.toLowerCase())||t.shortcut.includes(filter.toLowerCase())||t.type.includes(filter.toLowerCase())
  );
  if(filtered.length===0){ docHideTypeMenu(); return; }

  let menu=document.getElementById('blockTypeMenu');
  if(!menu){
    menu=document.createElement('div');
    menu.id='blockTypeMenu';
    menu.className='block-type-menu';
    document.body.appendChild(menu);
  }
  S.docTypeMenuVisible=true;
  S.docTypeMenuSelection=0;

  menu.innerHTML=filtered.map((t,i)=>
    `<div class="block-type-option${i===0?' selected':''}" data-type="${t.type}"
      onmouseenter="docTypeMenuHover(${i})"
      onclick="docApplyTypeFromMenu('${t.type}')">
      <span class="bto-icon">${t.icon}</span>
      <span>${t.label}</span>
    </div>`
  ).join('');

  // Position below anchor
  const rect=anchorEl.getBoundingClientRect();
  menu.style.display='block';
  menu.style.left=rect.left+'px';
  menu.style.top=(rect.bottom+4)+'px';
}

export function docHideTypeMenu(){
  const menu=document.getElementById('blockTypeMenu');
  if(menu) menu.style.display='none';
  S.docTypeMenuVisible=false;
}

export function docTypeMenuHover(idx){
  S.docTypeMenuSelection=idx;
  const menu=document.getElementById('blockTypeMenu');
  if(!menu) return;
  menu.querySelectorAll('.block-type-option').forEach((el,i)=>el.classList.toggle('selected',i===idx));
}

export function docApplyTypeFromMenu(type){
  if(!S.docEditingBlockId) return;
  const block=docGetBlock(S.docEditingBlockId);
  if(!block) return;
  // Clear the slash command text
  blockFromPlainText(block,'');
  block.type=type;
  docHideTypeMenu();
  renderDocMode();
  setTimeout(()=>{
    const el=document.querySelector(`[data-block-id="${S.docEditingBlockId}"]`);
    if(el) el.focus();
  },10);
}

export function docApplyTypeMenuSelection(blockId){
  const menu=document.getElementById('blockTypeMenu');
  if(!menu||!S.docTypeMenuVisible) return;
  const options=menu.querySelectorAll('.block-type-option');
  if(options[S.docTypeMenuSelection]){
    const type=options[S.docTypeMenuSelection].dataset.type;
    docApplyTypeFromMenu(type);
  }
}

// ── Drag & drop reorder (smooth displacement animation) ──
let docDragBlockId=null;
let docDragLastOverId=null;
let docDragStartY=null;
let docDragActivated=false;
let docDragLastInsertAfter=null;

export function docDragStart(event, blockId){
  docDragBlockId=blockId;
  docDragLastOverId=null;
  docDragStartY=event.clientY;
  docDragActivated=false;
  docDragLastInsertAfter=null;
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain', blockId);
  docPushUndo();
  setTimeout(()=>{
    const el=document.querySelector(`[data-block-id="${blockId}"]`);
    if(el) el.classList.add('drag-source');
  },0);
}

export function docDragOver(event){
  event.preventDefault();
  event.dataTransfer.dropEffect='move';
  if(!docDragBlockId) return;
  if(!docDragActivated){
    if(docDragStartY!==null&&Math.abs(event.clientY-docDragStartY)<DOC_DRAG_DEAD_ZONE) return;
    docDragActivated=true;
  }
  const page=document.getElementById('docPage');
  if(!page) return;
  const blocks=[...page.querySelectorAll('[data-block-id]')];

  // Find closest block with hysteresis
  let closestBlock=null, closestDist=Infinity, insertAfter=false;
  for(const block of blocks){
    if(block.dataset.blockId===docDragBlockId) continue;
    const rect=block.getBoundingClientRect();
    const midY=rect.top+rect.height/2;
    const dist=Math.abs(event.clientY-midY);
    if(dist<closestDist){
      closestDist=dist;
      closestBlock=block;
      insertAfter=event.clientY>midY;
    }
  }

  const hoverId=closestBlock?.dataset?.blockId;
  // Hysteresis: if same block, only flip insertAfter when cursor moves decisively past midpoint
  if(hoverId===docDragLastOverId && insertAfter!==docDragLastInsertAfter){
    const rect=closestBlock.getBoundingClientRect();
    const midY=rect.top+rect.height/2;
    const dist=Math.abs(event.clientY-midY);
    if(dist<DOC_DRAG_HYSTERESIS) return; // within hysteresis zone, don't flip
  }

  if(hoverId===docDragLastOverId && insertAfter===docDragLastInsertAfter) return;
  docDragLastOverId=hoverId;
  docDragLastInsertAfter=insertAfter;

  const srcIdx=S.currentDoc.blocks.findIndex(b=>b.id===docDragBlockId);
  const srcEl=document.querySelector(`[data-block-id="${docDragBlockId}"]`);
  const srcH=srcEl?srcEl.offsetHeight+8:40;

  if(closestBlock&&closestBlock.dataset.blockId!==docDragBlockId){
    const hoverIdx=S.currentDoc.blocks.findIndex(b=>b.id===hoverId);
    // Determine effective target index
    let targetIdx=insertAfter?hoverIdx:hoverIdx-1;
    if(targetIdx<0) targetIdx=0;
    if(targetIdx>=S.currentDoc.blocks.length) targetIdx=S.currentDoc.blocks.length-1;

    // Directly set transforms (CSS transition handles smooth animation — no clearing)
    for(const block of blocks){
      const bid=block.dataset.blockId;
      if(bid===docDragBlockId) continue;
      const idx=S.currentDoc.blocks.findIndex(b=>b.id===bid);
      let ty=0;
      if(srcIdx<hoverIdx||(srcIdx<hoverIdx+1&&insertAfter)){
        if(idx>srcIdx&&(idx<hoverIdx||(idx===hoverIdx&&insertAfter))) ty=-srcH;
      } else if(srcIdx>hoverIdx||(srcIdx>hoverIdx-1&&!insertAfter)){
        if(idx<srcIdx&&(idx>hoverIdx||(idx===hoverIdx&&!insertAfter))) ty=srcH;
      }
      block.style.transform=ty?`translateY(${ty}px)`:'';
    }
    // Move source visually
    if(srcEl){
      const srcRect=srcEl.getBoundingClientRect();
      const targetRect=closestBlock.getBoundingClientRect();
      const dy=targetRect.top-srcRect.top+(insertAfter?targetRect.height:0)-(insertAfter?0:0);
      srcEl.style.transform=`scale(0.96) translateY(${dy}px)`;
    }
  }

  // Drop indicator
  page.querySelectorAll('.doc-drop-indicator').forEach(el=>el.remove());
  if(closestBlock){
    const indicator=document.createElement('div');
    indicator.className='doc-drop-indicator';
    if(insertAfter) closestBlock.after(indicator);
    else closestBlock.before(indicator);
  }
}

export function docDragLeave(event){
  const page=document.getElementById('docPage');
  if(!page) return;
  if(event.relatedTarget&&page.contains(event.relatedTarget)) return;
  page.querySelectorAll('.doc-drop-indicator').forEach(el=>el.remove());
  page.querySelectorAll('[data-block-id]').forEach(b=>{ b.style.transform=''; });
  docDragLastOverId=null;
  docDragLastInsertAfter=null;
}

export function docDrop(event){
  event.preventDefault();
  const page=document.getElementById('docPage');
  if(!page) return;
  page.querySelectorAll('.doc-drop-indicator').forEach(el=>el.remove());
  if(!docDragBlockId||!S.currentDoc){ docDragBlockId=null; return; }

  // Find target position from cursor
  const blocks=[...page.querySelectorAll('[data-block-id]')];
  let targetIdx=-1;
  for(const block of blocks){
    if(block.dataset.blockId===docDragBlockId) continue;
    const rect=block.getBoundingClientRect();
    const midY=rect.top+rect.height/2;
    if(event.clientY>midY){
      targetIdx=S.currentDoc.blocks.findIndex(b=>b.id===block.dataset.blockId);
    }
  }

  // Move block in data — no clamp, move to actual target
  const srcIdx=S.currentDoc.blocks.findIndex(b=>b.id===docDragBlockId);
  if(srcIdx===-1){ docDragBlockId=null; return; }
  let insertAt=targetIdx===-1?0:(targetIdx>=srcIdx?targetIdx:targetIdx+1);
  if(insertAt===srcIdx){ docDragBlockId=null; renderDocMode(); return; }
  const [moved]=S.currentDoc.blocks.splice(srcIdx,1);
  if(insertAt>srcIdx) insertAt--;
  S.currentDoc.blocks.splice(insertAt,0,moved);
  S.currentDoc.updated=new Date().toISOString();

  // Settling animation
  blocks.forEach(b=>{
    b.classList.remove('drag-source');
    b.style.transform='';
    b.classList.add('drag-settling');
  });

  docDragBlockId=null;
  docDragLastOverId=null;
  docDragLastInsertAfter=null;
  setTimeout(()=>{
    renderDocMode();
    docAutoSave();
  },100);
}

// ── Touch-based drag for mobile ──
let docTouchDragId=null;
let docTouchStartY=null;
let docTouchActivated=false;
let docTouchLastInsertAfter=null;
let docTouchLastOverId=null;

export function docTouchDragStart(event, blockId){
  if(event.touches.length!==1) return;
  event.preventDefault(); // prevent scroll while dragging handle
  event.stopPropagation();
  const touch=event.touches[0];
  docTouchDragId=blockId;
  docTouchStartY=touch.clientY;
  docTouchActivated=false;
  docTouchLastInsertAfter=null;
  docTouchLastOverId=null;
  docPushUndo();
  setTimeout(()=>{
    const el=document.querySelector(`[data-block-id="${blockId}"]`);
    if(el) el.classList.add('drag-source');
  },0);
  document.addEventListener('touchmove', docTouchDragMove, {passive:false});
  document.addEventListener('touchend', docTouchDragEnd, {passive:false});
  document.addEventListener('touchcancel', docTouchDragEnd, {passive:false});
}

export function docTouchDragMove(event){
  if(!docTouchDragId) return;
  event.preventDefault();
  const touch=event.touches[0];
  if(!docTouchActivated){
    if(docTouchStartY!==null&&Math.abs(touch.clientY-docTouchStartY)<DOC_DRAG_DEAD_ZONE) return;
    docTouchActivated=true;
  }
  const page=document.getElementById('docPage');
  if(!page) return;
  const blocks=[...page.querySelectorAll('[data-block-id]')];

  let closestBlock=null, closestDist=Infinity, insertAfter=false;
  for(const block of blocks){
    if(block.dataset.blockId===docTouchDragId) continue;
    const rect=block.getBoundingClientRect();
    const midY=rect.top+rect.height/2;
    const dist=Math.abs(touch.clientY-midY);
    if(dist<closestDist){
      closestDist=dist;
      closestBlock=block;
      insertAfter=touch.clientY>midY;
    }
  }

  const hoverId=closestBlock?.dataset?.blockId;
  if(hoverId===docTouchLastOverId && insertAfter!==docTouchLastInsertAfter){
    const rect=closestBlock.getBoundingClientRect();
    const midY=rect.top+rect.height/2;
    const dist=Math.abs(touch.clientY-midY);
    if(dist<DOC_DRAG_HYSTERESIS) return;
  }
  if(hoverId===docTouchLastOverId && insertAfter===docTouchLastInsertAfter) return;
  docTouchLastOverId=hoverId;
  docTouchLastInsertAfter=insertAfter;

  const srcIdx=S.currentDoc.blocks.findIndex(b=>b.id===docTouchDragId);
  const srcEl=document.querySelector(`[data-block-id="${docTouchDragId}"]`);
  const srcH=srcEl?srcEl.offsetHeight+8:40;

  if(closestBlock&&closestBlock.dataset.blockId!==docTouchDragId){
    const hoverIdx=S.currentDoc.blocks.findIndex(b=>b.id===hoverId);
    let targetIdx=insertAfter?hoverIdx:hoverIdx-1;
    if(targetIdx<0) targetIdx=0;
    if(targetIdx>=S.currentDoc.blocks.length) targetIdx=S.currentDoc.blocks.length-1;
    for(const block of blocks){
      const bid=block.dataset.blockId;
      if(bid===docTouchDragId) continue;
      const idx=S.currentDoc.blocks.findIndex(b=>b.id===bid);
      let ty=0;
      if(srcIdx<hoverIdx||(srcIdx<hoverIdx+1&&insertAfter)){
        if(idx>srcIdx&&(idx<hoverIdx||(idx===hoverIdx&&insertAfter))) ty=-srcH;
      } else if(srcIdx>hoverIdx||(srcIdx>hoverIdx-1&&!insertAfter)){
        if(idx<srcIdx&&(idx>hoverIdx||(idx===hoverIdx&&!insertAfter))) ty=srcH;
      }
      block.style.transform=ty?`translateY(${ty}px)`:'';
    }
    if(srcEl){
      const srcRect=srcEl.getBoundingClientRect();
      const targetRect=closestBlock.getBoundingClientRect();
      const dy=targetRect.top-srcRect.top+(insertAfter?targetRect.height:0);
      srcEl.style.transform=`scale(0.96) translateY(${dy}px)`;
    }
  }

  // Drop indicator
  page.querySelectorAll('.doc-drop-indicator').forEach(el=>el.remove());
  if(closestBlock){
    const indicator=document.createElement('div');
    indicator.className='doc-drop-indicator';
    if(insertAfter) closestBlock.after(indicator);
    else closestBlock.before(indicator);
  }

  // Auto-scroll when near edges
  const canvas=document.querySelector('.doc-canvas');
  if(canvas){
    const canvasRect=canvas.getBoundingClientRect();
    const edgeZone=50;
    if(touch.clientY<canvasRect.top+edgeZone) canvas.scrollTop-=8;
    else if(touch.clientY>canvasRect.bottom-edgeZone) canvas.scrollTop+=8;
  }
}

export function docTouchDragEnd(event){
  document.removeEventListener('touchmove', docTouchDragMove);
  document.removeEventListener('touchend', docTouchDragEnd);
  document.removeEventListener('touchcancel', docTouchDragEnd);
  if(!docTouchDragId||!S.currentDoc){
    docTouchDragId=null;
    return;
  }
  const page=document.getElementById('docPage');
  if(!page){ docTouchDragId=null; return; }
  page.querySelectorAll('.doc-drop-indicator').forEach(el=>el.remove());

  // Use last known insert position
  if(docTouchLastOverId){
    const hoverIdx=S.currentDoc.blocks.findIndex(b=>b.id===docTouchLastOverId);
    const srcIdx=S.currentDoc.blocks.findIndex(b=>b.id===docTouchDragId);
    if(srcIdx!==-1&&hoverIdx!==-1){
      let insertAt=docTouchLastInsertAfter?hoverIdx:(hoverIdx>0?hoverIdx-1:0);
      if(docTouchLastInsertAfter) insertAt=hoverIdx>=srcIdx?hoverIdx:hoverIdx+1;
      else insertAt=hoverIdx>srcIdx?hoverIdx-1:hoverIdx;
      if(insertAt!==srcIdx){
        const [moved]=S.currentDoc.blocks.splice(srcIdx,1);
        if(insertAt>srcIdx) insertAt--;
        S.currentDoc.blocks.splice(insertAt,0,moved);
        S.currentDoc.updated=new Date().toISOString();
      }
    }
  }

  // Settling
  const blocks=[...page.querySelectorAll('.doc-block')];
  blocks.forEach(b=>{
    b.classList.remove('drag-source');
    b.style.transform='';
    b.classList.add('drag-settling');
  });

  docTouchDragId=null;
  docTouchLastOverId=null;
  docTouchLastInsertAfter=null;
  setTimeout(()=>{
    renderDocMode();
    docAutoSave();
  },100);
}

// ── Doc auto-save ──
export function docAutoSave(){
  clearTimeout(S.docAutoSaveTimer);
  S.docAutoSaveTimer=setTimeout(()=>{ docSaveNow(); },800);
}

export function docSaveNow(){
  if(!S.currentDoc) return;
  // 1. Sync any actively editing block content from DOM → data
  if(S.docEditingBlockId){
    const el=document.querySelector(`[data-block-id="${S.docEditingBlockId}"]`);
    if(el){
      const block=docGetBlock(S.docEditingBlockId);
      if(block){
        const text=docExtractText(el);
        blockFromPlainText(block, text);
      }
    }
  }
  // 2. Persist currentDoc to localStorage (survives refresh)
  try{
    localStorage.setItem('sloth_current_doc', JSON.stringify(S.currentDoc));
  }catch(e){}
  // 3. Save to workspace storage
  const files=window.wsLoad();
  const existing=files.findIndex(f=>f.id===S.currentDoc.id);
  const wsDoc={
    id:S.currentDoc.id,
    type:'doc',
    title:S.currentDoc.title,
    created:S.currentDoc.created,
    updated:S.currentDoc.updated,
    content:{ blocks: S.currentDoc.blocks }
  };
  if(existing>=0) files[existing]=wsDoc;
  else files.push(wsDoc);
  window.wsSave(files);
}

// ── Load doc from workspace ──
export function docLoadFromWorkspace(docId){
  const wsDoc=window.wsGetFile(docId);
  if(!wsDoc||wsDoc.type!=='doc') return false;
  S.currentDoc={
    id:wsDoc.id,
    title:wsDoc.title,
    blocks:wsDoc.content?.blocks||[createBlock('paragraph','')],
    created:wsDoc.created,
    updated:wsDoc.updated
  };
  // Ensure blocks have proper structure
  S.currentDoc.blocks=S.currentDoc.blocks.map(b=>{
    if(!b.id) b.id=blockId();
    if(!b.content) b.content=[{text:'',marks:[]}];
    if(typeof b.content==='string') b.content=[{text:b.content,marks:[]}];
    // Legacy: if block has .text instead of .content
    if(b.text&&!b.content?.length){
      b.content=[{text:b.text, marks:[]}];
      delete b.text;
    }
    if(!b.meta) b.meta={};
    return b;
  });
  // Immediately persist to localStorage (don't wait for debounced auto-save)
  try{ localStorage.setItem('sloth_current_doc', JSON.stringify(S.currentDoc)); }catch(e){}
  return true;
}
