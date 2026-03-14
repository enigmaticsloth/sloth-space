// ═══════════════════════════════════════════════════════════════════════════════
// SLOTH SLIDES EDITOR MODULE
// Message sending, slide editing, image manipulation, and input handling
// ═══════════════════════════════════════════════════════════════════════════════

import {
  state, PRESETS, LAYOUTS
} from '../shared/config.js';
import { callLLM, llmConfig, isConfigured, LLM_DEFAULTS } from '../shared/llm.js';
import {
  STYLE_PROMPT, CONTENT_EDIT_PROMPT, DECK_EDIT_PROMPT, ROUTER_PROMPT, CHAT_PROMPT, GEN_PROMPT, IMAGE_PROMPT, VALID_PRESETS, VALID_LAYOUTS, deckToContentJSON
} from './prompts.js';
import { renderApp, pushUndo, clearSelection, goSlide, setPreset } from './renderer.js';
import { wsDetectReferences, wsFileToContext, wsLoad } from '../shared/storage.js';

// ═══════════════════════════════════════════
// MESSAGE DISPLAY
// ═══════════════════════════════════════════

export function addMessage(text, type) {
  const div = document.createElement('div');
  div.className = 'msg ' + type;
  div.textContent = text;
  const msgs = document.getElementById('chatMessages');
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

// ═══════════════════════════════════════════
// VALIDATION & EXTRACTION
// ═══════════════════════════════════════════

export function validateDeck(deck) {
  if (!deck || typeof deck !== 'object') return 'Response is not a JSON object';
  if (!deck.slides || !Array.isArray(deck.slides) || deck.slides.length === 0) return 'No slides array found';
  if (deck.preset && !VALID_PRESETS.includes(deck.preset)) return `Invalid preset: ${deck.preset}`;
  for (let i = 0; i < deck.slides.length; i++) {
    const s = deck.slides[i];
    if (!s.layout) return `Slide ${i + 1} has no layout`;
    if (!VALID_LAYOUTS.includes(s.layout)) return `Slide ${i + 1} has invalid layout: ${s.layout}`;
    if (!s.content || typeof s.content !== 'object') return `Slide ${i + 1} has no content`;
  }
  // ensure required fields
  if (!deck.sloth_version) deck.sloth_version = '0.1.0';
  if (!deck.type) deck.type = 'slides';
  if (!deck.title) deck.title = 'Untitled';
  if (!deck.preset) deck.preset = 'clean-white';
  if (!deck.locale) deck.locale = 'en';
  return null; // valid
}

export function extractJSON(text) {
  // Try direct parse first
  try { return JSON.parse(text); } catch (e) { }
  // Try to extract from code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]); } catch (e) { }
  }
  // Try to find first { ... last }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch (e) { }
  }
  return null;
}

// ═══════════════════════════════════════════
// STYLE OVERRIDES
// ═══════════════════════════════════════════

export function applyStyleOverrides(styleObj) {
  pushUndo(); // Save undo snapshot before style change
  const targetSlides = styleObj.slides || 'all';
  // If there's a selected region and no explicit region in styleObj, use the selection
  const regionId = styleObj.region || (state.selectedRegion ? state.selectedRegion.regionId : null);
  const msgs = [];

  state.currentDeck.slides.forEach((s, i) => {
    if (targetSlides !== 'all' && (i + 1) !== targetSlides) return;
    // Also respect selected slide if a region is selected
    if (regionId && state.selectedRegion && targetSlides === 'all' && state.selectedRegion.slideIdx !== undefined) {
      // If user selected a specific region on a specific slide, only apply there
      // Unless they explicitly said "all slides" or a different slide number
    }
    if (!s.style_overrides) s.style_overrides = {};

    // Global overrides
    if (styleObj.background) s.style_overrides.background = styleObj.background;
    if (styleObj.heading_color) s.style_overrides.heading_color = styleObj.heading_color;
    if (styleObj.font) s.style_overrides.font = styleObj.font;
    if (styleObj.font_size) s.style_overrides.font_size = Number(styleObj.font_size);

    // Text decorations (global)
    if (styleObj.underline !== undefined) s.style_overrides.underline = styleObj.underline;
    if (styleObj.bold !== undefined) s.style_overrides.bold = styleObj.bold;
    if (styleObj.italic !== undefined) s.style_overrides.italic = styleObj.italic;

    // Per-region overrides
    const hasRegionStyle = styleObj.region_color || styleObj.region_font || styleObj.region_font_size ||
      (regionId && (styleObj.underline !== undefined || styleObj.bold !== undefined || styleObj.italic !== undefined));
    if (regionId && hasRegionStyle) {
      if (!s.style_overrides.regions) s.style_overrides.regions = {};
      if (!s.style_overrides.regions[regionId]) s.style_overrides.regions[regionId] = {};
      const rr = s.style_overrides.regions[regionId];
      if (styleObj.region_color) rr.color = styleObj.region_color;
      if (styleObj.region_font) rr.font = styleObj.region_font;
      if (styleObj.region_font_size) rr.font_size = Number(styleObj.region_font_size);
      if (styleObj.underline !== undefined) rr.underline = styleObj.underline;
      if (styleObj.bold !== undefined) rr.bold = styleObj.bold;
      if (styleObj.italic !== undefined) rr.italic = styleObj.italic;
      // If targeting a region, don't apply decoration/size globally
      delete s.style_overrides.underline;
      delete s.style_overrides.bold;
      delete s.style_overrides.italic;
      if (styleObj.region_font_size) delete s.style_overrides.font_size;
    }
  });

  if (styleObj.background) msgs.push(`背景 → ${styleObj.background}`);
  if (styleObj.heading_color) msgs.push(`全部文字 → ${styleObj.heading_color}`);
  if (styleObj.font) msgs.push(`字型 → ${styleObj.font}`);
  if (regionId && styleObj.region_color) msgs.push(`${regionId} 文字 → ${styleObj.region_color}`);
  if (regionId && styleObj.region_font) msgs.push(`${regionId} 字型 → ${styleObj.region_font}`);
  if (styleObj.font_size) msgs.push(`全部字體 → ${styleObj.font_size}px`);
  if (regionId && styleObj.region_font_size) msgs.push(`${regionId} 字體 → ${styleObj.region_font_size}px`);
  if (styleObj.underline === true) msgs.push(`${regionId || '全部'} +底線`);
  if (styleObj.underline === false) msgs.push(`${regionId || '全部'} -底線`);
  if (styleObj.bold === true) msgs.push(`${regionId || '全部'} +粗體`);
  if (styleObj.italic === true) msgs.push(`${regionId || '全部'} +斜體`);
  return msgs;
}

// ═══════════════════════════════════════════
// IMAGE COMMANDS
// ═══════════════════════════════════════════

// Place staged images into a slide as a floating overlay (preserves existing content & layout)
export function placeImageOnSlide(images, targetSlide, position) {
  if (!state.currentDeck || images.length === 0) return null;
  pushUndo();
  targetSlide = Math.max(0, Math.min(targetSlide, state.currentDeck.slides.length - 1));
  const slide = state.currentDeck.slides[targetSlide];
  const img = images[0];
  const p = PRESETS[state.currentPreset];
  const W = p.slide.width, H = p.slide.height;

  // Calculate default position based on user intent
  // Image is placed as a floating overlay — never changes the layout
  const imgW = Math.min(img.width, W * 0.4); // max 40% of slide width
  const imgH = imgW * (img.height / img.width); // keep aspect ratio
  let x, y;
  if (position === 'left') { x = 40; y = Math.round((H - imgH) / 2); }
  else if (position === 'right') { x = W - imgW - 40; y = Math.round((H - imgH) / 2); }
  else if (position === 'top') { x = Math.round((W - imgW) / 2); y = 40; }
  else if (position === 'bottom') { x = Math.round((W - imgW) / 2); y = H - imgH - 40; }
  else {
    // Auto: find an empty-ish spot — default to bottom-right corner
    x = W - imgW - 60; y = H - imgH - 60;
  }

  // Store as floating image overlay (not tied to a layout region)
  if (!slide.images) slide.images = [];
  slide.images.push({
    id: 'img_' + Date.now(),
    dataUrl: img.dataUrl, name: img.name,
    origW: img.width, origH: img.height,
    x: Math.round(x), y: Math.round(y),
    w: Math.round(imgW), h: Math.round(imgH),
    fit: 'contain'
  });
  state.currentSlide = targetSlide;

  let msg = `✓ Placed "${img.name}" into slide ${targetSlide + 1}`;
  if (images.length > 1) {
    msg += `. ${images.length - 1} more image(s) still staged.`;
    stagedImages = images.slice(1);
    renderStagedImages();
  }
  return msg;
}

export function hasImageOnCurrentSlide() {
  if (!state.currentDeck || !state.currentDeck.slides[state.currentSlide]) return false;
  const slide = state.currentDeck.slides[state.currentSlide];
  return (slide.images && slide.images.length > 0);
}

// Apply a parsed image action to the last image on current slide
export function applyImageAction(actionObj) {
  const slide = state.currentDeck.slides[state.currentSlide];
  if (!slide) return '⚠ No slide selected.';
  if (!slide.images || slide.images.length === 0) {
    return '⚠ No image on current slide. Attach an image first with the + button.';
  }
  pushUndo();
  const a = actionObj;
  // Operate on the last-placed image (most recent)
  const img = slide.images[slide.images.length - 1];

  if (a.action === 'scale') {
    const f = a.factor || 1;
    img.w = Math.round(img.w * f);
    img.h = Math.round(img.h * f);
    return `✓ Image resized (${img.w}×${img.h})`;
  }
  if (a.action === 'scale_w') {
    img.w = Math.round(img.w * (a.factor || 1));
    return `✓ Image width → ${img.w}px`;
  }
  if (a.action === 'scale_h') {
    img.h = Math.round(img.h * (a.factor || 1));
    return `✓ Image height → ${img.h}px`;
  }
  if (a.action === 'move') {
    img.x = Math.round(img.x + (a.dx || 0));
    img.y = Math.round(img.y + (a.dy || 0));
    return `✓ Image moved to (${img.x}, ${img.y})`;
  }
  if (a.action === 'fit') {
    img.fit = a.mode || 'contain';
    return `✓ Image fit → ${img.fit}`;
  }
  if (a.action === 'remove') {
    slide.images.pop();
    return '✓ Image removed from slide';
  }
  return null;
}

// ═══════════════════════════════════════════
// MESSAGE SENDING & LLM ROUTING
// ═══════════════════════════════════════════

// These are imported from other modules but we reference them here:
// undo(), redo(), saveSloth(), newDeck(), loadDeck(), exportJSON(), exportPPTX(), openSettings()
// wsCreateDoc(), wsCreateSheet()
// autoSave(), autoLoad()

export async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addMessage(text, 'user');
  state.chatHistory.push({ role: 'user', content: text });

  // ── PASS -1: Local UI commands (no LLM needed) ──
  const trimText = text.trim();
  if (/^(復原|undo|撤[銷回]|還原|上一步|回去)$/i.test(trimText)) {
    window.undo(); return;
  }
  if (/^(重做|redo|取消復原|下一步)$/i.test(trimText)) {
    window.redo(); return;
  }
  if (/^(儲存|存檔|save|保存|存sloth|save\s*sloth)$/i.test(trimText)) {
    window.saveSloth(); return;
  }
  if (/^(開新|新檔|新建|new|開新檔案|新增檔案)$/i.test(trimText)) {
    window.newDeck(); return;
  }
  if (/^(載入|讀取|load|開啟|開檔|載入檔案|讀取檔案|open)$/i.test(trimText)) {
    window.loadDeck(); return;
  }
  if (/^(匯出|export|export\s*json|json)$/i.test(trimText)) {
    window.exportJSON(); addMessage('✓ Exported JSON', 'system'); return;
  }
  if (/^(匯出\s*ppt|export\s*ppt|pptx?|匯出簡報|下載簡報|export\s*slides)$/i.test(trimText)) {
    window.exportPPTX(); return;
  }
  if (/^(設定|settings?|設置|config)$/i.test(trimText)) {
    window.openSettings(); return;
  }

  // Workspace quick-create: "/doc Title\nContent..." or "/sheet Title\nCSV..."
  const docMatch = trimText.match(/^\/(doc|文件)\s+(.+)/is);
  if (docMatch) {
    const lines = docMatch[2].split('\n');
    const title = lines[0].trim();
    const body = lines.slice(1).join('\n').trim() || title;
    const doc = window.wsCreateDoc(title, body);
    addMessage(`✓ Created doc "${doc.title}" (${doc.content.blocks.length} blocks). Reference it by name when making slides!`, 'system');
    return;
  }
  const sheetMatch = trimText.match(/^\/(sheet|表格|數據)\s+(.+)/is);
  if (sheetMatch) {
    const lines = sheetMatch[2].split('\n');
    const title = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();
    if (!body) { addMessage('Sheet needs data! Format: /sheet Title\\nHeader1,Header2\\nRow1,Row2', 'system'); return; }
    const sheet = window.wsCreateSheet(title, body);
    addMessage(`✓ Created sheet "${sheet.title}" (${sheet.content.columns.length} cols, ${sheet.content.rows.length} rows). Reference it by name!`, 'system');
    return;
  }

  // ── Consume any staged images before routing ──
  const pendingImages = consumeStagedImages();

  const statusDiv = addMessage('Thinking...', 'system');
  const sendBtn = document.querySelector('.send-btn');
  sendBtn.disabled = true;
  sendBtn.textContent = '...';

  // ── Workspace cross-file reference detection ──
  const wsRefs = wsDetectReferences(text);
  let wsContext = '';
  if (wsRefs.length > 0) {
    wsContext = '\n\n## WORKSPACE REFERENCE DATA\nThe user referenced the following workspace files. Use this data to generate or edit slides:\n\n';
    wsRefs.forEach(f => {
      wsContext += wsFileToContext(f) + '\n\n';
    });
    const refNames = wsRefs.map(f => `"${f.title}"`).join(', ');
    addMessage(`📎 Using workspace data: ${refNames}`, 'system');
  }

  try {
    // ── If user attached images, go straight to image path (no router needed) ──
    if (pendingImages.length > 0) {
      statusDiv.textContent = 'Processing image...';
      try {
        const imgRaw = await callLLM(IMAGE_PROMPT, [{ role: 'user', content: text }], { temperature: 0, max_tokens: 128, json: true });
        const imgAction = JSON.parse(imgRaw);
        const targetSlide = (imgAction.slide || state.currentSlide + 1) - 1;
        const position = imgAction.position || 'auto';
        const msg = placeImageOnSlide(pendingImages, targetSlide, position);
        statusDiv.remove();
        if (msg) addMessage(msg, 'ai');
        renderApp();
      } catch (imgErr) {
        console.warn('Image LLM failed, using default placement:', imgErr);
        statusDiv.remove();
        const msg = placeImageOnSlide(pendingImages, state.currentSlide, 'auto');
        if (msg) addMessage(msg, 'ai');
        renderApp();
      }
      sendBtn.disabled = false; sendBtn.textContent = 'Send';
      window.autoSave();
      return;
    }

    // ── UNIFIED LLM ROUTER — classify intent (no hardcoded regex) ──
    const routerMsgs = state.chatHistory.slice(-6);
    // Add context so router can make informed decisions
    const ctx = [];
    if (state.currentDeck) ctx.push('User has a deck loaded with ' + state.currentDeck.slides.length + ' slides.');
    if (hasImageOnCurrentSlide()) ctx.push('Current slide has floating images.');
    if (state.selectedRegion) ctx.push(`User has selected region "${state.selectedRegion.regionId}" (${state.selectedRegion.role}) on slide ${state.selectedRegion.slideIdx + 1}.`);
    if (wsRefs.length > 0) ctx.push('User referenced workspace files: ' + wsRefs.map(f => f.title).join(', ') + '.');
    if (!state.currentDeck) ctx.push('No deck loaded yet.');
    if (ctx.length > 0) routerMsgs.push({ role: 'system', content: '[Context: ' + ctx.join(' ') + ']' });

    statusDiv.textContent = 'Routing...';
    const routerRaw = await callLLM(ROUTER_PROMPT, routerMsgs, { useRouter: true, temperature: 0, max_tokens: 128, json: true });
    let intent = 'chat';
    let routerData = {};
    try {
      routerData = JSON.parse(routerRaw);
      intent = routerData.intent || 'chat';
    } catch (e) {
      console.warn('Router parse failed:', e, 'raw:', routerRaw);
    }

    // ── Dispatch based on router intent ──

    if (intent === 'image') {
      // ── IMAGE: LLM interprets image command ──
      statusDiv.textContent = 'Processing image...';
      const imgRaw = await callLLM(IMAGE_PROMPT, [{ role: 'user', content: text }], { temperature: 0, max_tokens: 128, json: true });
      const imgAction = JSON.parse(imgRaw);
      if (imgAction.action === 'none') {
        // LLM says not really an image command — fall through to chat
        statusDiv.textContent = '...';
        const raw = await callLLM(CHAT_PROMPT, state.chatHistory);
        state.chatHistory.push({ role: 'assistant', content: raw });
        statusDiv.remove();
        addMessage(raw, 'ai');
      } else if (imgAction.action === 'place') {
        statusDiv.remove();
        addMessage('⚠ No image attached. Use the + button to attach an image first.', 'system');
      } else {
        // Manipulation: scale, move, fit, remove
        const msg = applyImageAction(imgAction);
        statusDiv.remove();
        if (msg) addMessage(msg, 'ai');
        renderApp();
      }

    } else if (intent === 'style' && state.currentDeck) {
      // ── STYLE: LLM interprets style change ──
      statusDiv.textContent = 'Interpreting style...';
      let styleInput = text;
      if (state.selectedRegion) {
        styleInput += `\n[USER HAS SELECTED: slide ${state.selectedRegion.slideIdx + 1}, region "${state.selectedRegion.regionId}" (${state.selectedRegion.role}). Apply changes to this region unless they specify otherwise.]`;
      }
      const styleRaw = await callLLM(STYLE_PROMPT, [{ role: 'user', content: styleInput }], { temperature: 0, max_tokens: 128, json: true });
      const styleObj = JSON.parse(styleRaw);
      if (!styleObj.none) {
        const msgs = applyStyleOverrides(styleObj);
        state.chatHistory.push({ role: 'assistant', content: `[style: ${msgs.join(', ')}]` });
        statusDiv.remove();
        addMessage(`✓ ${msgs.join(', ')}`, 'ai');
        renderApp();
      } else {
        // Style LLM said none — fall through to chat
        statusDiv.textContent = '...';
        const raw = await callLLM(CHAT_PROMPT, state.chatHistory);
        state.chatHistory.push({ role: 'assistant', content: raw });
        statusDiv.remove();
        addMessage(raw, 'ai');
      }

    } else if (intent === 'deck_edit' && state.currentDeck) {
      // ── DECK-WIDE EDIT: all slides at once ──
      statusDiv.textContent = 'Editing all slides...';
      const deckContent = deckToContentJSON();
      const editInput = `Current deck content:\n${JSON.stringify(deckContent)}\n\nUser instruction: ${text}${wsContext}`;
      const raw = await callLLM(DECK_EDIT_PROMPT, [{ role: 'user', content: editInput }], { max_tokens: 8192 });
      state.chatHistory.push({ role: 'assistant', content: `[deck-wide edit: ${text}]` });
      let updated;
      try { updated = JSON.parse(raw); } catch (e) {
        const extracted = extractJSON(raw);
        if (Array.isArray(extracted)) updated = extracted;
        else if (extracted && Array.isArray(extracted.slides)) updated = extracted.slides;
        else throw new Error('LLM returned invalid JSON for deck edit');
      }
      pushUndo();
      let count = 0;
      (Array.isArray(updated) ? updated : []).forEach(item => {
        const idx = (item.slide || 1) - 1;
        if (idx >= 0 && idx < state.currentDeck.slides.length && item.content) {
          for (const [k, v] of Object.entries(item.content)) {
            state.currentDeck.slides[idx].content[k] = v;
          }
          count++;
        }
      });
      statusDiv.remove();
      addMessage(`✓ Updated ${count} slides`, 'ai');
      renderApp();

    } else if (intent === 'content_edit' && state.currentDeck) {
      // ── CONTENT EDIT: targeted region edit ──
      // Router provides slide number and region — no hardcoded regex
      let targetSlide = routerData.slide ? routerData.slide - 1 : state.currentSlide;
      let targetRegion = routerData.region || null;

      // Fall back to click selection if router didn't specify
      if (state.selectedRegion) {
        if (!routerData.slide) targetSlide = state.selectedRegion.slideIdx;
        if (!targetRegion) targetRegion = state.selectedRegion.regionId;
      }

      const slide = state.currentDeck.slides[targetSlide];
      if (!slide) { throw new Error(`Slide ${targetSlide + 1} not found`); }

      // Resolve region ID — handle title↔heading equivalence
      let rId = targetRegion || 'body';
      if (!slide.content[rId]) {
        if (rId === 'title' && slide.content['heading']) rId = 'heading';
        else if (rId === 'heading' && slide.content['title']) rId = 'title';
      }
      // If region doesn't exist, find the main content region
      if (!slide.content[rId]) {
        const fallbacks = ['body', 'left', 'quote', 'table', 'description'];
        rId = fallbacks.find(f => slide.content[f]) || null;
        if (!rId) {
          const L = LAYOUTS[slide.layout];
          if (L) {
            const contentRegion = L.regions.find(r => r.id !== 'heading' && r.id !== 'title' && slide.content[r.id]);
            if (contentRegion) rId = contentRegion.id;
          }
        }
      }
      const currentContent = rId ? slide.content[rId] : null;

      if (currentContent) {
        // Delete: router tells us via delete flag — no hardcoded regex
        if (routerData.delete) {
          pushUndo();
          slide.content[rId] = '';
          statusDiv.remove();
          addMessage(`✓ Slide ${targetSlide + 1} → ${rId} cleared`, 'ai');
          renderApp();
        } else {
          // Edit content via LLM
          statusDiv.textContent = 'Editing content...';
          const contentStr = typeof currentContent === 'object' ? JSON.stringify(currentContent) : currentContent;
          const editInput = `Current content of region "${rId}" on slide ${targetSlide + 1} (layout: ${slide.layout}):\n${contentStr}\n\nUser instruction: ${text}${wsContext}`;
          const raw = await callLLM(CONTENT_EDIT_PROMPT, [{ role: 'user', content: editInput }], { max_tokens: 2048 });
          state.chatHistory.push({ role: 'assistant', content: `[edited slide ${targetSlide + 1} ${rId}]` });
          let cleaned = raw.trim();
          cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
          let newContent;
          try { newContent = JSON.parse(cleaned); } catch (e) { newContent = cleaned; }
          pushUndo();
          slide.content[rId] = newContent;
          statusDiv.remove();
          addMessage(`✓ Slide ${targetSlide + 1} → ${rId} updated`, 'ai');
          renderApp();
        }
      } else {
        // No region found — ask user
        statusDiv.remove();
        addMessage('請點擊投影片上你想修改的區域，或告訴我第幾頁的哪個部分要改。', 'ai');
        state.chatHistory.push({ role: 'assistant', content: '請點擊投影片上你想修改的區域，或告訴我第幾頁的哪個部分要改。' });
      }

    } else if (intent === 'generate') {
      // ── GENERATE: create/modify slides ──
      await doGenerate(statusDiv, wsContext);

    } else {
      // ── CHAT: general conversation ──
      statusDiv.textContent = '...';
      const raw = await callLLM(CHAT_PROMPT, state.chatHistory);
      state.chatHistory.push({ role: 'assistant', content: raw });
      statusDiv.remove();
      addMessage(raw, 'ai');
    }

  } catch (err) {
    console.error('Sloth LLM error:', err);
    statusDiv.remove();
    addMessage(`Error: ${err.message}. Try again?`, 'ai');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
    window.autoSave(); // Save chat history after every message
  }
}

// ── Slide generation (reusable) ──
export async function doGenerate(statusDiv, wsContext) {
  statusDiv.textContent = 'Generating slides...';
  // Capture template style bank BEFORE generation (if coming from a template preview)
  const isTemplate = state.currentDeck && state.currentDeck._isTemplate;
  const styleBank = isTemplate ? state.currentDeck._styleBank : null;
  const templatePreset = isTemplate ? state.currentDeck.preset : null;

  let editContext = '';
  if (state.currentDeck && !isTemplate) {
    editContext = `\n\n## EDITING MODE — CRITICAL\nThe user ALREADY has this deck. They want to MODIFY it, not regenerate from scratch.\nYou MUST keep ALL existing content, slides, and settings UNCHANGED except for what the user specifically asks to change.\nOutput the COMPLETE deck JSON with only the requested changes applied.\n\n[CURRENT DECK]\n${JSON.stringify(state.currentDeck)}`;
  }
  // Inject workspace file data if user referenced any docs/sheets
  const wsExtra = wsContext || '';
  // Only send last 6 messages to generation model to avoid token overflow
  const genHistory = state.chatHistory.slice(-6);
  const raw = await callLLM(GEN_PROMPT + editContext + wsExtra, genHistory, { json: true, max_tokens: 8192 });
  state.chatHistory.push({ role: 'assistant', content: raw });

  const deck = extractJSON(raw);
  if (!deck) throw new Error('LLM returned invalid JSON');
  const err = validateDeck(deck);
  if (err) throw new Error(err);

  // Apply template style bank: override content but keep the color scheme
  if (styleBank) {
    deck.preset = templatePreset || deck.preset;
    const contentIdx = [0, 0]; // track which content style variant to use (round-robin)
    deck.slides.forEach((slide, i) => {
      const layout = slide.layout || 'content';
      let bankEntry = styleBank[layout];
      // For 'content' layout, rotate through the array of style variants
      if (Array.isArray(bankEntry)) {
        slide.style_overrides = { ...(slide.style_overrides || {}), ...JSON.parse(JSON.stringify(bankEntry[contentIdx[0] % bankEntry.length])) };
        contentIdx[0]++;
      } else if (bankEntry) {
        slide.style_overrides = { ...(slide.style_overrides || {}), ...JSON.parse(JSON.stringify(bankEntry)) };
      }
      // Fallback: if layout not in bank, try 'content'
      if (!bankEntry && styleBank.content) {
        const fb = styleBank.content;
        if (Array.isArray(fb)) {
          slide.style_overrides = { ...(slide.style_overrides || {}), ...JSON.parse(JSON.stringify(fb[contentIdx[1] % fb.length])) };
          contentIdx[1]++;
        }
      }
    });
  }

  pushUndo(); // Save undo snapshot before replacing deck
  statusDiv.remove();
  state.currentDeck = deck;
  state.currentPreset = deck.preset || state.currentPreset;
  state.currentSlide = 0;
  addMessage(`✓ Generated ${deck.slides.length} slides (${state.currentPreset})`, 'ai');
  renderApp();
}

// ═══════════════════════════════════════════
// INPUT & COLLAPSE
// ═══════════════════════════════════════════

let inputCollapsed = false;

export function toggleInputSize() {
  const area = document.getElementById('inputArea');
  const btn = document.getElementById('inputToggle');
  inputCollapsed = !inputCollapsed;
  area.classList.toggle('collapsed', inputCollapsed);
  btn.innerHTML = inputCollapsed ? '&#9660;' : '&#9650;'; // ▼ or ▲
}

// ═══════════════════════════════════════════
// IMAGE STAGING
// ═══════════════════════════════════════════

export let stagedImages = []; // [{name, dataUrl, width, height}]

export function handleImageFiles(fileList) {
  if (!fileList || !fileList.length) return;
  Array.from(fileList).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        stagedImages.push({ name: file.name, dataUrl: e.target.result, width: img.width, height: img.height });
        renderStagedImages();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
  // Reset file input so same file can be re-selected
  document.getElementById('imgFileInput').value = '';
}

export function removeStagedImage(idx) {
  stagedImages.splice(idx, 1);
  renderStagedImages();
}

export function renderStagedImages() {
  const staging = document.getElementById('imgStaging');
  const thumbsHtml = stagedImages.map((img, i) =>
    `<div class="img-thumb" title="${img.name} (${img.width}×${img.height})">
      <img src="${img.dataUrl}" alt="${img.name}">
      <button class="img-thumb-remove" onclick="removeStagedImage(${i})">✕</button>
    </div>`
  ).join('');
  // Keep label + thumbs
  staging.innerHTML = `<span class="img-staging-label">📎 ${stagedImages.length} image${stagedImages.length > 1 ? 's' : ''}:</span>${thumbsHtml}`;
  staging.classList.toggle('has-images', stagedImages.length > 0);
}

// Consume staged images (called by sendMessage) — returns array and clears staging
export function consumeStagedImages() {
  const imgs = [...stagedImages];
  stagedImages = [];
  renderStagedImages();
  return imgs;
}

// ═══════════════════════════════════════════
// DRAG & DROP INITIALIZATION
// ═══════════════════════════════════════════

let dragCounter = 0;

export function initDragDrop() {
  document.addEventListener('dragenter', function (e) {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      dragCounter++;
      document.getElementById('dropOverlay').classList.add('show');
    }
  });
  document.addEventListener('dragleave', function (e) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      document.getElementById('dropOverlay').classList.remove('show');
    }
  });
  document.addEventListener('dragover', function (e) {
    e.preventDefault(); // required to allow drop
  });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    dragCounter = 0;
    document.getElementById('dropOverlay').classList.remove('show');
    if (e.dataTransfer.files.length > 0) {
      handleImageFiles(e.dataTransfer.files);
    }
  });

  // Paste images from clipboard
  document.addEventListener('paste', function (e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageFiles.push(items[i].getAsFile());
      }
    }
    if (imageFiles.length > 0) {
      handleImageFiles(imageFiles);
    }
  });
}

// ═══════════════════════════════════════════
// INPUT HANDLERS INITIALIZATION
// ═══════════════════════════════════════════

export function initInputHandlers() {
  const chatInput = document.getElementById('chatInput');
  let imeComposing = false;
  chatInput.addEventListener('compositionstart', () => { imeComposing = true; });
  chatInput.addEventListener('compositionend', () => { imeComposing = false; });
  chatInput.addEventListener('keydown', e => {
    // keyCode 229 = IME processing key (Chrome/Safari CJK input)
    if (e.key === 'Enter' && !e.shiftKey && !imeComposing && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault(); sendMessage();
    }
  });
  document.addEventListener('keydown', e => {
    if (document.activeElement === chatInput) return;
    if (e.key === 'ArrowRight' && state.currentDeck) { goSlide(Math.min(state.currentSlide + 1, state.currentDeck.slides.length - 1)); e.preventDefault(); }
    if (e.key === 'ArrowLeft' && state.currentDeck) { goSlide(Math.max(state.currentSlide - 1, 0)); e.preventDefault(); }
  });
}
