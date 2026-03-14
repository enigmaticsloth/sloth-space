// ═══════════════════════════════════════════
// EXPORT/SAVE/LOAD MODULE
// Extracted from app.html — handles all deck persistence operations
// ═══════════════════════════════════════════

import { state, PRESETS } from '../shared/config.js';
import { llmConfig, loadConfig, saveConfig } from '../shared/llm.js';
import { wsCreateDoc, wsCreateSheet, wsLoad, wsDeleteFile } from '../shared/storage.js';
import { supabaseClient, currentUser, showWelcome } from '../shared/auth.js';
import { renderApp, pushUndo, goSlide, setPreset } from './renderer.js';
import { addMessage, sendMessage } from './editor.js';

// ═══════════════════════════════════════════
// PERSISTENCE (localStorage)
// ═══════════════════════════════════════════
export const STORAGE_KEY = 'sloth_space_deck';
export const STORAGE_HISTORY_KEY = 'sloth_space_chat';

export function autoSave() {
  if (!state.currentDeck) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      deck: state.currentDeck,
      preset: state.currentPreset,
      slide: state.currentSlide
    }));
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(state.chatHistory.slice(-20)));
    // Also save to the named saves list for file nav
    const name = state.currentDeck.title || 'Untitled';
    const saveKey = name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
    const saves = JSON.parse(localStorage.getItem('sloth_space_saves') || '{}');
    saves[saveKey] = JSON.stringify({ deck: state.currentDeck, preset: state.currentPreset });
    localStorage.setItem('sloth_space_saves', JSON.stringify(saves));
  } catch (e) {
    console.warn('Auto-save failed:', e);
  }
}

export function autoLoad() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      if (data.deck && data.deck.slides) {
        state.currentDeck = data.deck;
        state.currentPreset = data.preset || 'clean-white';
        state.currentSlide = Math.min(data.slide || 0, data.deck.slides.length - 1);
        addMessage(`✓ Restored: "${state.currentDeck.title || 'Untitled'}" (${state.currentDeck.slides.length} slides)`, 'system');
      }
    }
    const savedHistory = localStorage.getItem(STORAGE_HISTORY_KEY);
    if (savedHistory) {
      state.chatHistory = JSON.parse(savedHistory);
    }
  } catch (e) {
    console.warn('Auto-load failed:', e);
  }
}

export function newDeck() {
  if (state.currentDeck && !confirm('Start a new deck? Current work will be saved in browser.')) return;
  // Save current deck to a named slot before clearing
  if (state.currentDeck) {
    try {
      const name = state.currentDeck.title || 'Untitled';
      const saves = JSON.parse(localStorage.getItem('sloth_space_saves') || '{}');
      saves[name + '_' + Date.now()] = JSON.stringify({ deck: state.currentDeck, preset: state.currentPreset });
      localStorage.setItem('sloth_space_saves', JSON.stringify(saves));
    } catch (e) { }
  }
  state.currentDeck = null;
  state.currentSlide = 0;
  state.chatHistory = [];
  state.selectedRegion = null;
  document.getElementById('selectionBar').style.display = 'none';
  document.getElementById('chatMessages').innerHTML = '';
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_HISTORY_KEY);
  addMessage('New deck started. Tell me what you need!', 'system');
  renderApp();
}

export function saveDeck() {
  // saveDeck now redirects to saveSloth for the native format
  saveSloth();
}

export function loadDeck() {
  document.getElementById('fileInput').click();
}

export function handleFileLoad(event) {
  const file = event.target.files[0];
  if (!file) return;

  // .sloth files are zip-based
  if (file.name.endsWith('.sloth')) {
    loadSlothFile(file);
    event.target.value = '';
    return;
  }

  // .json files
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const deck = JSON.parse(e.target.result);
      const err = validateDeck(deck);
      if (err) { addMessage(`Load error: ${err}`, 'system'); return; }
      state.currentDeck = deck;
      state.currentPreset = deck.preset || 'clean-white';
      state.currentSlide = 0;
      autoSave();
      addMessage(`✓ Loaded "${deck.title}" (${deck.slides.length} slides)`, 'ai');
      renderApp();
    } catch (err) {
      addMessage(`Load error: Invalid JSON file`, 'system');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

export function exportJSON() {
  if (!state.currentDeck) return;
  const blob = new Blob([JSON.stringify(state.currentDeck, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.currentDeck.title || 'deck').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_') + '.json';
  a.click();
}

// ═══════════════════════════════════════════
// EXPORT .pptx (PptxGenJS)
// ═══════════════════════════════════════════
export function exportPPTX() {
  if (!state.currentDeck) { addMessage('Nothing to export yet.', 'system'); return; }
  const p = PRESETS[state.currentPreset];
  const pptx = new window.PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 inches = 1280x720 at 96dpi
  pptx.title = state.currentDeck.title || 'Untitled';
  pptx.author = 'Sloth Space';

  // Helper: hex color to pptxgen format (strip #)
  const hx = c => c ? c.replace('#', '') : '000000';

  // Helper: inches from pixels (96dpi base, slide=1280x720 → 13.33x7.5)
  const W = p.slide.width, H = p.slide.height;
  const toX = px => (px / W) * 13.33;
  const toY = px => (px / H) * 7.5;
  const toW = px => (px / W) * 13.33;
  const toH = px => (px / H) * 7.5;

  // Font size: our scale is in px, pptx uses pt (roughly same at screen res)
  const toPt = px => Math.round(px * 0.75); // px to pt approximation

  state.currentDeck.slides.forEach((slide, idx) => {
    const L = LAYOUTS[slide.layout];
    if (!L) return;
    const ov = slide.style_overrides || {};
    const regionOv = ov.regions || {};
    const bg = ov.background || (L.background_override === 'surface' ? p.colors.surface : p.colors.background);
    const globalColor = ov.heading_color || null;
    const fontOv = ov.font || null;

    const sl = pptx.addSlide();
    sl.background = { fill: hx(bg) };

    // Add speaker notes
    if (slide.notes) sl.addNotes(slide.notes);

    L.regions.forEach(r => {
      const c = slide.content[r.id];
      if (!c) return;

      const rOv = regionOv[r.id] || {};
      const regionColor = rOv.color || globalColor || null;
      const regionFont = rOv.font || fontOv || null;
      const isUnderline = rOv.underline !== undefined ? rOv.underline : (ov.underline || false);
      const isBold = rOv.bold !== undefined ? rOv.bold : (ov.bold || false);
      const isItalic = rOv.italic !== undefined ? rOv.italic : (ov.italic || false);

      const s = rs(r.role, p);
      const sk = r.fontSize || 'body';
      const fontSize = toPt(p.typography.scale[SC[sk]] || 16);
      const txtColor = regionColor || s.color;
      const fontFace = regionFont || s.ff || 'Arial';
      const al = r.align || {};

      // Position with margins
      const mx = p.spacing.margin.left, my = p.spacing.margin.top;
      const x = toX(mx + r.bounds.x);
      const y = toY(my + r.bounds.y);
      const w = toW(r.bounds.w);
      const h = toH(r.bounds.h);

      // Horizontal alignment
      const hAlign = al.horizontal === 'center' ? 'center' : al.horizontal === 'right' ? 'right' : 'left';
      // Vertical alignment
      const vAlign = al.vertical === 'middle' ? 'middle' : al.vertical === 'bottom' ? 'bottom' : 'top';

      if (r.role === 'image') {
        if (typeof c === 'object' && c.type === 'image' && c.dataUrl) {
          // Real image — embed in PPTX
          try {
            sl.addImage({ data: c.dataUrl, x, y, w, h, sizing: { type: 'contain', w, h } });
          } catch (imgErr) {
            console.warn('PPTX image embed failed:', imgErr);
            sl.addText(c.alt || c.name || 'Image', { x, y, w, h, fontSize: 10, color: hx(p.colors.secondary), fontFace: 'Arial', align: 'center', valign: 'middle' });
          }
        } else {
          // Image placeholder — draw a dashed box
          sl.addShape(pptx.shapes.RECTANGLE, { x, y, w, h, line: { color: hx(p.colors.border), dashType: 'dash', width: 1.5 }, fill: { type: 'none' } });
          const altText = typeof c === 'object' ? (c.alt || c.src || 'Image') : 'Image';
          sl.addText(altText, { x, y, w, h, fontSize: 10, color: hx(p.colors.secondary), fontFace: 'Arial', align: 'center', valign: 'middle' });
        }
        return;
      }

      if (typeof c === 'object' && c.type === 'table') {
        // Table rendering
        const rows = [];
        // Header row
        if (c.headers) {
          rows.push(c.headers.map(h => ({
            text: h,
            options: { bold: true, fontSize: fontSize * 0.85, color: hx(p.colors.table_header_text), fill: { color: hx(p.colors.table_header_bg) }, fontFace }
          })));
        }
        // Data rows
        if (c.rows) {
          c.rows.forEach((row, ri) => {
            rows.push(row.map((cell, ci) => ({
              text: String(cell),
              options: { fontSize: fontSize * 0.85, color: hx(txtColor), fill: { color: ri % 2 === 1 ? hx(p.colors.table_row_alt) : 'FFFFFF' }, fontFace, bold: ci === 0 }
            })));
          });
        }
        if (rows.length > 0) {
          sl.addTable(rows, {
            x, y, w, h,
            border: { type: 'solid', color: hx(p.colors.border), pt: 0.5 },
            colW: Array(rows[0].length).fill(w / rows[0].length),
            autoPage: false
          });
        }
        return;
      }

      if (typeof c === 'object' && c.type === 'list') {
        // List as bullet points
        const textRows = c.items.map(item => ({
          text: item,
          options: {
            fontSize, color: hx(txtColor), fontFace,
            bold: isBold || (s.fw >= 700), italic: isItalic || (s.fs === 'italic'),
            underline: isUnderline ? { style: 'sng' } : undefined,
            bullet: { type: 'bullet', style: '\u25CF', indent: 18 },
            lineSpacingMultiple: s.lh || 1.5,
            breakType: 'none'
          }
        }));
        sl.addText(textRows, {
          x, y, w, h,
          valign: vAlign, align: hAlign,
          paraSpaceAfter: p.spacing.paragraph * 0.6
        });
        return;
      }

      if (typeof c === 'string') {
        // Plain text
        let pre = '';
        if (r.role === 'quote') pre = '\u201C';
        sl.addText(pre + c, {
          x, y, w, h,
          fontSize,
          color: hx(txtColor),
          fontFace,
          bold: isBold || (s.fw >= 700),
          italic: isItalic || (s.fs === 'italic'),
          underline: isUnderline ? { style: 'sng' } : undefined,
          align: hAlign,
          valign: vAlign,
          lineSpacingMultiple: s.lh || 1.3,
          shrinkText: true
        });
      }
    });

    // Floating overlay images (slide.images[])
    if (slide.images && slide.images.length > 0) {
      slide.images.forEach(fi => {
        try {
          sl.addImage({
            data: fi.dataUrl,
            x: toX(fi.x), y: toY(fi.y),
            w: toW(fi.w), h: toH(fi.h),
            sizing: { type: fi.fit === 'cover' ? 'cover' : 'contain', w: toW(fi.w), h: toH(fi.h) }
          });
        } catch (imgErr) {
          console.warn('PPTX floating image failed:', imgErr);
          sl.addShape(pptx.shapes.RECTANGLE, { x: toX(fi.x), y: toY(fi.y), w: toW(fi.w), h: toH(fi.h), line: { color: 'CCCCCC', dashType: 'dash', width: 1 }, fill: { type: 'none' } });
          sl.addText(fi.name || 'Image', { x: toX(fi.x), y: toY(fi.y), w: toW(fi.w), h: toH(fi.h), fontSize: 9, color: '999999', fontFace: 'Arial', align: 'center', valign: 'middle' });
        }
      });
    }

    // Page number
    sl.addText(String(idx + 1), {
      x: toX(W - p.spacing.margin.right - 40),
      y: toY(H - p.spacing.margin.bottom * 0.7),
      w: 0.5, h: 0.3,
      fontSize: 9, color: hx(p.colors.secondary), fontFace: 'Arial',
      align: 'right', transparency: 60
    });
  });

  const fname = (state.currentDeck.title || 'deck').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
  pptx.writeFile({ fileName: fname + '.pptx' }).then(() => {
    addMessage(`✓ Exported ${fname}.pptx`, 'system');
  }).catch(e => {
    addMessage(`Export error: ${e.message}`, 'system');
  });
}

// ═══════════════════════════════════════════
// .sloth FORMAT (zip-based)
// ═══════════════════════════════════════════
export function saveSloth() {
  if (!state.currentDeck) { addMessage('Nothing to save yet.', 'system'); return; }
  const zip = new window.JSZip();

  // manifest.json = the deck data
  zip.file('manifest.json', JSON.stringify(state.currentDeck, null, 2));

  // meta.json = app state
  zip.file('meta.json', JSON.stringify({
    sloth_version: '0.1.0',
    app: 'Sloth Space',
    created: new Date().toISOString(),
    preset: state.currentPreset,
    currentSlide: state.currentSlide
  }, null, 2));

  // chat.json = conversation history (optional, for restore)
  zip.file('chat.json', JSON.stringify(state.chatHistory.slice(-30), null, 2));

  const fname = (state.currentDeck.title || 'deck').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
  zip.generateAsync({ type: 'blob' }).then(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname + '.sloth';
    a.click();
    addMessage(`✓ Saved ${fname}.sloth`, 'system');
  }).catch(e => {
    addMessage(`Save error: ${e.message}`, 'system');
  });
}

export function loadSlothFile(file) {
  const zip = new window.JSZip();
  zip.loadAsync(file).then(z => {
    // Read manifest
    const manifestFile = z.file('manifest.json');
    if (!manifestFile) { addMessage('Invalid .sloth file: no manifest.json', 'system'); return; }
    return manifestFile.async('string').then(manifestStr => {
      const deck = JSON.parse(manifestStr);
      const err = validateDeck(deck);
      if (err) { addMessage(`Load error: ${err}`, 'system'); return; }
      state.currentDeck = deck;
      state.currentPreset = deck.preset || 'clean-white';
      state.currentSlide = 0;

      // Read meta
      const metaFile = z.file('meta.json');
      if (metaFile) {
        return metaFile.async('string').then(metaStr => {
          try {
            const meta = JSON.parse(metaStr);
            if (meta.preset) state.currentPreset = meta.preset;
            if (meta.currentSlide !== undefined) state.currentSlide = Math.min(meta.currentSlide, deck.slides.length - 1);
          } catch (e) { }
        }).then(() => {
          // Read chat history
          const chatFile = z.file('chat.json');
          if (chatFile) {
            return chatFile.async('string').then(chatStr => {
              try { state.chatHistory = JSON.parse(chatStr); } catch (e) { }
            });
          }
        });
      }
    }).then(() => {
      autoSave();
      addMessage(`✓ Loaded "${state.currentDeck.title}" from .sloth (${state.currentDeck.slides.length} slides)`, 'ai');
      renderApp();
    });
  }).catch(e => {
    addMessage(`Load error: ${e.message}`, 'system');
  });
}

// ═══════════════════════════════════════════
// PRODUCT SWITCHER
// ═══════════════════════════════════════════
export let currentProduct = 'slides';

export function switchProduct(product) {
  currentProduct = product;
  // Update tab buttons
  document.querySelectorAll('.product-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.product === product);
  });
  // Show/hide slides UI
  const isSlides = product === 'slides';
  document.querySelectorAll('.slides-ui').forEach(el => {
    el.style.display = isSlides ? '' : 'none';
  });
  // Show/hide placeholder
  const ph = document.getElementById('productPlaceholder');
  ph.style.display = isSlides ? 'none' : 'flex';
  // Update placeholder text
  const names = { docs: 'Sloth Docs', sheets: 'Sloth Sheets' };
  document.getElementById('placeholderTitle').textContent = names[product] || '';
  // Re-render slides if switching back
  if (isSlides) renderApp();
}

// ═══════════════════════════════════════════
// FILE NAV + CLOUD STORAGE
// ═══════════════════════════════════════════
export let fileNavTab = 'all';
export const CLOUD_BUCKET = 'decks'; // Supabase Storage bucket name

export function openFileNav() {
  document.getElementById('fileNav').classList.add('open');
  document.getElementById('fileNavOverlay').classList.add('open');
  refreshFileList();
}

export function closeFileNav() {
  document.getElementById('fileNav').classList.remove('open');
  document.getElementById('fileNavOverlay').classList.remove('open');
}

export function setFileTab(tab) {
  fileNavTab = tab;
  document.querySelectorAll('.fn-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  refreshFileList();
}

export function getLocalFiles() {
  try {
    const saves = JSON.parse(localStorage.getItem('sloth_space_saves') || '{}');
    return Object.entries(saves).map(([key, val]) => {
      try {
        const data = JSON.parse(val);
        const deck = data.deck || {};
        return {
          id: 'local_' + key,
          title: deck.title || key.replace(/_/g, ' '),
          slides: deck.slides?.length || 0,
          preset: data.preset || 'clean-white',
          source: 'local',
          key: key,
          updated: data.savedAt ? new Date(data.savedAt).getTime() : (parseInt(key.split('_').pop()) || Date.now()),
          data: data
        };
      } catch (e) { return null; }
    }).filter(Boolean).sort((a, b) => b.updated - a.updated);
  } catch (e) { return []; }
}

export async function getCloudFiles() {
  if (!supabaseClient || !currentUser) return [];
  try {
    const userId = currentUser.id;
    const { data, error } = await supabaseClient.storage.from(CLOUD_BUCKET).list(userId, { limit: 50, sortBy: { column: 'updated_at', order: 'desc' } });
    if (error) throw error;
    return (data || []).filter(f => f.name.endsWith('.json')).map(f => ({
      id: 'cloud_' + f.name,
      title: f.name.replace('.json', '').replace(/_/g, ' '),
      source: 'cloud',
      path: userId + '/' + f.name,
      updated: new Date(f.updated_at || f.created_at).getTime(),
      size: f.metadata?.size || 0
    }));
  } catch (e) {
    console.warn('Cloud list error:', e);
    return [];
  }
}

export async function refreshFileList() {
  const list = document.getElementById('fileNavList');
  list.innerHTML = '<div class="fn-empty">Loading...</div>';

  let files = [];

  // Workspace docs & sheets
  if (fileNavTab === 'all' || fileNavTab === 'docs' || fileNavTab === 'sheets') {
    const wsFiles = wsListFiles();
    for (const wf of wsFiles) {
      if (fileNavTab === 'docs' && wf.type !== 'doc') continue;
      if (fileNavTab === 'sheets' && wf.type !== 'sheet') continue;
      files.push({
        id: 'ws_' + wf.id,
        wsId: wf.id,
        title: wf.title,
        type: wf.type,
        source: 'workspace',
        updated: new Date(wf.updated).getTime(),
        meta: wf.type === 'doc' ? `${(wf.content.blocks || []).length} blocks` :
          wf.type === 'sheet' ? `${(wf.content.rows || []).length} rows` : ''
      });
    }
  }

  // Local slides
  if (fileNavTab === 'all' || fileNavTab === 'slides') {
    files.push(...getLocalFiles().map(f => ({ ...f, type: 'slides' })));
  }

  // Cloud files
  if (fileNavTab === 'cloud' || fileNavTab === 'all') {
    const cloud = await getCloudFiles();
    files.push(...cloud.map(f => ({ ...f, type: 'slides' })));
  }

  // Sort by updated descending
  files.sort((a, b) => b.updated - a.updated);

  if (files.length === 0) {
    list.innerHTML = '<div class="fn-empty">No files yet.<br>Use the buttons below to create docs, sheets, or slides!</div>';
    return;
  }

  list.innerHTML = files.map(f => {
    const icons = { doc: '&#128196;', sheet: '&#128202;', slides: '&#128197;', cloud: '&#9729;' };
    const icon = f.source === 'cloud' ? icons.cloud : (icons[f.type] || '&#128196;');
    const typeBadge = f.source === 'workspace' ?
      `<span class="fn-type-badge fn-type-${f.type}">${f.type}</span>` :
      (f.source === 'cloud' ? '<span class="fn-cloud-badge">cloud</span>' : '<span class="fn-type-badge fn-type-slides">slides</span>');
    const date = new Date(f.updated);
    const timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const metaInfo = f.meta ? ` · ${f.meta}` : (f.slides ? ` · ${f.slides} slides` : '');
    const deleteId = f.wsId || f.key || f.path || '';
    const deleteSource = f.source;
    return `<div class="fn-item" onclick="loadFileFromNav('${f.id}')" title="${f.title}">
      <div class="fn-item-icon">${icon}</div>
      <div class="fn-item-info">
        <div class="fn-item-title">${f.title}${typeBadge}</div>
        <div class="fn-item-meta">${timeStr}${metaInfo}</div>
      </div>
      <div class="fn-item-actions">
        ${f.source === 'cloud' ? `<button class="fn-item-btn" onclick="event.stopPropagation();shareFile('${f.path}')">Share</button>` : ''}
        <button class="fn-item-btn danger" onclick="event.stopPropagation();deleteFileFromNav('${f.id}','${deleteSource}','${deleteId}')">Del</button>
      </div>
    </div>`;
  }).join('');
}

export function loadFileFromNav(id) {
  if (id.startsWith('ws_')) {
    // Workspace doc/sheet — show preview in chat, notify user it's available for reference
    const wsFileId = id.replace('ws_', '');
    const file = wsGetFile(wsFileId);
    if (!file) { addMessage('File not found.', 'system'); return; }
    const preview = wsFileToContext(file).slice(0, 300);
    addMessage(`📎 "${file.title}" (${file.type}) is ready in your workspace. Mention it by name when creating slides!\n\nPreview: ${preview}...`, 'system');
    closeFileNav();
    return;
  }
  if (id.startsWith('local_')) {
    const key = id.replace('local_', '');
    try {
      const saves = JSON.parse(localStorage.getItem('sloth_space_saves') || '{}');
      const data = JSON.parse(saves[key]);
      if (data.deck) {
        state.currentDeck = data.deck;
        state.currentPreset = data.preset || 'clean-white';
        state.currentSlide = 0;
        state.chatHistory = [];
        document.getElementById('chatMessages').innerHTML = '';
        addMessage(`✓ Loaded "${state.currentDeck.title || 'Untitled'}" (${state.currentDeck.slides.length} slides)`, 'system');
        autoSave();
        renderApp();
        closeFileNav();
      }
    } catch (e) { addMessage('Failed to load: ' + e.message, 'system'); }
  } else if (id.startsWith('cloud_')) {
    loadFromCloud(id.replace('cloud_', ''));
  }
}

export async function loadFromCloud(filename) {
  if (!supabaseClient || !currentUser) { addMessage('Sign in to load cloud files.', 'system'); return; }
  try {
    const path = currentUser.id + '/' + filename;
    const { data, error } = await supabaseClient.storage.from(CLOUD_BUCKET).download(path);
    if (error) throw error;
    const text = await data.text();
    const parsed = JSON.parse(text);
    if (parsed.deck) {
      state.currentDeck = parsed.deck;
      state.currentPreset = parsed.preset || 'clean-white';
      state.currentSlide = 0;
      state.chatHistory = parsed.chat || [];
      document.getElementById('chatMessages').innerHTML = '';
      if (state.chatHistory.length) {
        state.chatHistory.forEach(m => addMessage(m.text || m.content || '', m.role || 'system'));
      }
      addMessage(`✓ Loaded from cloud: "${state.currentDeck.title || 'Untitled'}"`, 'system');
      autoSave();
      renderApp();
      closeFileNav();
    }
  } catch (e) { addMessage('Cloud load error: ' + e.message, 'system'); }
}

export async function saveCurrentToCloud() {
  if (!state.currentDeck) { addMessage('Nothing to save yet.', 'system'); return; }
  if (!supabaseClient || !currentUser) {
    addMessage('Sign in to save to cloud.', 'system');
    doLogin();
    return;
  }
  try {
    const fname = (state.currentDeck.title || 'Untitled').replace(/[^a-zA-Z0-9\u4e00-\u9fff\s-]/g, '').replace(/\s+/g, '_') + '.json';
    const path = currentUser.id + '/' + fname;
    const payload = JSON.stringify({
      deck: state.currentDeck,
      preset: state.currentPreset,
      chat: state.chatHistory.slice(-20),
      savedAt: new Date().toISOString()
    });
    const blob = new Blob([payload], { type: 'application/json' });
    const { error } = await supabaseClient.storage.from(CLOUD_BUCKET).upload(path, blob, { upsert: true });
    if (error) throw error;
    addMessage(`✓ Saved to cloud: "${state.currentDeck.title || 'Untitled'}"`, 'system');
    refreshFileList();
  } catch (e) { addMessage('Cloud save error: ' + e.message, 'system'); }
}

export async function deleteFileFromNav(id, source, keyOrPath) {
  const name = id.replace('local_', '').replace('cloud_', '').replace('ws_', '').replace(/_\d+$/, '').replace(/_/g, ' ');
  if (!confirm(`Delete "${name}"`)) return;

  if (source === 'workspace') {
    wsDeleteFile(keyOrPath);
  } else if (source === 'local') {
    try {
      const saves = JSON.parse(localStorage.getItem('sloth_space_saves') || '{}');
      delete saves[keyOrPath];
      localStorage.setItem('sloth_space_saves', JSON.stringify(saves));
    } catch (e) { }
  } else if (source === 'cloud') {
    if (!supabaseClient || !currentUser) return;
    try {
      const { error } = await supabaseClient.storage.from(CLOUD_BUCKET).remove([keyOrPath]);
      if (error) throw error;
    } catch (e) { addMessage('Delete error: ' + e.message, 'system'); return; }
  }
  // If the deleted file is the currently loaded deck, reset to blank
  if (state.currentDeck) {
    const deckTitle = (state.currentDeck.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const deletedName = name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (deckTitle && deletedName && (deckTitle === deletedName || deckTitle.includes(deletedName) || deletedName.includes(deckTitle))) {
      state.currentDeck = null;
      state.currentSlide = 0;
      state.chatHistory = [];
      state.selectedRegion = null;
      document.getElementById('deckNameInput').value = '';
      // Clear autoSave storage so it doesn't restore on refresh
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_HISTORY_KEY);
      renderApp();
      addMessage('Deck deleted. Starting fresh.', 'system');
    }
  }
  // For local source, also clear autoSave if the saveKey matches
  if (source === 'local') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        const savedTitle = (data.deck?.title || '').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
        if (savedTitle === keyOrPath) {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(STORAGE_HISTORY_KEY);
        }
      }
    } catch (e) { }
  }
  refreshFileList();
}

export async function shareFile(path) {
  if (!supabaseClient) return;
  try {
    // Create a signed URL that lasts 7 days
    const { data, error } = await supabaseClient.storage.from(CLOUD_BUCKET).createSignedUrl(path, 7 * 24 * 60 * 60);
    if (error) throw error;
    // Create a share URL that includes the signed download URL
    const shareUrl = window.location.href.split('?')[0].split('#')[0] + '?load=' + encodeURIComponent(data.signedUrl);
    await navigator.clipboard.writeText(shareUrl);
    addMessage('✓ Share link copied! Valid for 7 days.', 'system');
  } catch (e) { addMessage('Share error: ' + e.message, 'system'); }
}

// ═══════════════════════════════════════════
// WORKSPACE — New Doc / Sheet modals
// ═══════════════════════════════════════════
export let wsModalType = 'doc'; // 'doc' or 'sheet'

export function showWsNewDoc() {
  wsModalType = 'doc';
  document.getElementById('wsModalTitle').textContent = 'New Document';
  document.getElementById('wsModalContentLabel').textContent = 'Content (paste text — each paragraph becomes a block)';
  document.getElementById('wsModalContent').placeholder = 'Paste or type content here...\n\nEach paragraph separated by a blank line becomes a block.';
  document.getElementById('wsModalTitleInput').value = '';
  document.getElementById('wsModalContent').value = '';
  document.getElementById('wsModalOverlay').style.display = 'flex';
}

export function showWsNewSheet() {
  wsModalType = 'sheet';
  document.getElementById('wsModalTitle').textContent = 'New Sheet';
  document.getElementById('wsModalContentLabel').textContent = 'Data (CSV or tab-separated — first row = headers)';
  document.getElementById('wsModalContent').placeholder = 'Name,Q1,Q2,Q3,Q4\nProduct A,100,150,200,250\nProduct B,80,120,160,200';
  document.getElementById('wsModalTitleInput').value = '';
  document.getElementById('wsModalContent').value = '';
  document.getElementById('wsModalOverlay').style.display = 'flex';
}

export function closeWsModal() {
  document.getElementById('wsModalOverlay').style.display = 'none';
}

export function saveWsModal() {
  const title = document.getElementById('wsModalTitleInput').value.trim();
  const content = document.getElementById('wsModalContent').value.trim();
  if (!content) { alert('Please enter some content.'); return; }

  if (wsModalType === 'doc') {
    const doc = wsCreateDoc(title || 'Untitled Doc', content);
    addMessage(`✓ Created doc "${doc.title}" — ${doc.content.blocks.length} blocks. Mention it by name when creating slides!`, 'system');
  } else {
    const sheet = wsCreateSheet(title || 'Untitled Sheet', content);
    addMessage(`✓ Created sheet "${sheet.title}" — ${sheet.content.columns.length} columns, ${sheet.content.rows.length} rows. Reference it by name in your prompts!`, 'system');
  }
  closeWsModal();
  refreshFileList();
}

// On page load, check for ?load= param
export function checkShareLink() {
  const params = new URLSearchParams(window.location.search);
  const loadUrl = params.get('load');
  if (!loadUrl) return;
  // Clean the URL
  window.history.replaceState({}, '', window.location.pathname);
  // Fetch and load
  fetch(loadUrl).then(r => {
    if (!r.ok) throw new Error('Link expired or invalid');
    return r.json();
  }).then(parsed => {
    if (parsed.deck) {
      state.currentDeck = parsed.deck;
      state.currentPreset = parsed.preset || 'clean-white';
      state.currentSlide = 0;
      state.chatHistory = [];
      document.getElementById('chatMessages').innerHTML = '';
      addMessage(`✓ Loaded shared deck: "${state.currentDeck.title || 'Untitled'}" (${state.currentDeck.slides.length} slides)`, 'system');
      // Hide welcome if showing
      enterSlides();
      renderApp();
    }
  }).catch(e => {
    console.warn('Share link load failed:', e);
  });
}
