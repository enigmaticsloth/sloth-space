// ═══════════════════════════════════════════════════════════════════
// Slide Renderer Module
// Extracted from app.html (lines 1297-1753)
// ═══════════════════════════════════════════════════════════════════

// Import state from config
import {
  state,
  PRESETS,
  LAYOUTS,
  BASIC_COLORS,
  MONET_COLORS,
  SEURAT_COLORS,
  FONTS,
} from '../shared/config.js';

// Hooks for external module callbacks (set via setter functions)
let _onAddMessage = null;
let _onAutoSave = null;
let _onSendMessage = null;
export function setOnAddMessage(fn){ _onAddMessage = fn; }
export function setOnAutoSave(fn){ _onAutoSave = fn; }
export function setOnSendMessage(fn){ _onSendMessage = fn; }

// Helper to call hooks
const addMessage = (msg, type) => {
  if (_onAddMessage) _onAddMessage(msg, type);
};

const autoSave = () => {
  if (_onAutoSave) _onAutoSave();
};

const sendMessage = () => {
  if (_onSendMessage) _onSendMessage();
};

// ═══════════════════════════════════════════
// UNDO / REDO SYSTEM (snapshot-based)
// ═══════════════════════════════════════════

export const MAX_UNDO = 50;
export let undoStack = [];   // past deck snapshots
export let redoStack = [];   // snapshots undone (cleared on new action)

export function snapshotDeck() {
  if (!state.currentDeck) return null;
  return JSON.parse(JSON.stringify({ deck: state.currentDeck, slide: state.currentSlide, preset: state.currentPreset }));
}

export function pushUndo() {
  // Save current state BEFORE any mutation
  const snap = snapshotDeck();
  if (!snap) return;
  undoStack.push(snap);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = []; // new action clears redo
  updateUndoRedoUI();
}

export function undo() {
  if (!undoStack.length) return;
  // Save current state to redo stack
  const current = snapshotDeck();
  if (current) redoStack.push(current);
  // Restore previous state
  const snap = undoStack.pop();
  state.currentDeck = snap.deck;
  state.currentSlide = Math.min(snap.slide, state.currentDeck.slides.length - 1);
  state.currentPreset = snap.preset || state.currentPreset;
  updateUndoRedoUI();
  renderApp();
  autoSave();
  addMessage('↩ Undo', 'system');
}

export function redo() {
  if (!redoStack.length) return;
  // Save current state to undo stack
  const current = snapshotDeck();
  if (current) undoStack.push(current);
  // Restore redo state
  const snap = redoStack.pop();
  state.currentDeck = snap.deck;
  state.currentSlide = Math.min(snap.slide, state.currentDeck.slides.length - 1);
  state.currentPreset = snap.preset || state.currentPreset;
  updateUndoRedoUI();
  renderApp();
  autoSave();
  addMessage('↪ Redo', 'system');
}

export function updateUndoRedoUI() {
  const ub = document.getElementById('undoBtn');
  const rb = document.getElementById('redoBtn');
  if (ub) ub.disabled = undoStack.length === 0;
  if (rb) rb.disabled = redoStack.length === 0;
}

// Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Shift+Z / Ctrl+Y = redo
export function initUndoRedo() {
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); redo(); return; }
    }
  });
}

// ═══════════════════════════════════════════
// REGION SELECTION
// ═══════════════════════════════════════════

export function selectRegion(slideIdx, regionId, role, label) {
  state.selectedRegion = { slideIdx, regionId, role, label };
  document.getElementById('selectionBar').style.display = 'flex';
  document.getElementById('selectionTag').textContent = `Slide ${slideIdx + 1} → ${label} (${regionId})`;
  // Re-render to show highlight
  renderApp();
  updateFontSizeIndicator();
}

export function clearSelection() {
  state.selectedRegion = null;
  document.getElementById('selectionBar').style.display = 'none';
  updateFontSizeIndicator();
  renderApp();
}

export function updateFontSizeIndicator() {
  const el = document.getElementById('fontSizeIndicator');
  if (!el) return;
  if (!state.currentDeck || !state.currentDeck.slides[state.currentSlide]) {
    el.textContent = '--';
    el.classList.remove('has-selection');
    return;
  }
  const slide = state.currentDeck.slides[state.currentSlide];
  const ov = slide.style_overrides || {};
  const regionOv = ov.regions || {};
  const p = PRESETS[state.currentPreset];
  if (state.selectedRegion && state.selectedRegion.slideIdx === state.currentSlide) {
    // Show the selected region's font size
    const rId = state.selectedRegion.regionId;
    const rOv = regionOv[rId] || {};
    const L = LAYOUTS[slide.layout];
    const regionDef = L ? L.regions.find(r => r.id === rId) : null;
    const sk = regionDef?.fontSize || 'body';
    const defaultFs = p.typography.scale[SC[sk]] || 16;
    const effectiveFs = rOv.font_size || ov.font_size || defaultFs;
    el.textContent = effectiveFs + 'px';
    el.classList.add('has-selection');
  } else {
    // No selection — show body default
    const defaultFs = ov.font_size || p.typography.scale[SC['body']] || 18;
    el.textContent = defaultFs + 'px';
    el.classList.remove('has-selection');
  }
}

// ═══════════════════════════════════════════
// RENDERER
// ═══════════════════════════════════════════

export const SC = { title: 0, h1: 1, h2: 2, body: 3, caption: 4, small: 5 };

export function rs(role, p) {
  const h = p.typography.heading, b = p.typography.body;
  const m = {
    title: { color: p.colors.primary, ff: h.family, fw: h.weight, ls: h.letterSpacing },
    subtitle: { color: p.colors.secondary, ff: h.family, fw: 400 },
    heading: { color: p.colors.primary, ff: h.family, fw: h.weight, ls: h.letterSpacing },
    body: { color: p.colors.primary, ff: b.family, fw: b.weight, lh: b.lineHeight },
    caption: { color: p.colors.secondary, ff: b.family, fw: 400 },
    quote: { color: p.colors.primary, ff: h.family, fw: h.weight, fs: "italic", lh: 1.4 },
    author: { color: p.colors.primary, ff: b.family, fw: 700 },
    table: { color: p.colors.primary, ff: b.family, fw: b.weight }
  };
  return m[role] || m.body;
}

export function rc(content, role, p, region, colorOv, fontSizeOv) {
  if (!content) return '';
  const s = rs(role, p);
  // Apply color override: colorOv overrides preset color for ALL text
  const txtColor = colorOv || s.color;
  const sk = region.fontSize || 'body';
  const fs = fontSizeOv || p.typography.scale[SC[sk]] || 16;

  if (role === 'image') {
    if (typeof content === 'object' && content.type === 'image' && content.dataUrl) {
      // Real image with data URL — render actual image
      const imgStyle = content.fit || 'contain'; // contain, cover, or fill
      const imgW = content.displayW ? content.displayW + 'px' : '100%';
      const imgH = content.displayH ? content.displayH + 'px' : '100%';
      const offX = content.offsetX || 0;
      const offY = content.offsetY || 0;
      return `<div style="width:100%;height:100%;overflow:hidden;display:flex;align-items:center;justify-content:center;">
        <img src="${content.dataUrl}" alt="${content.alt || content.name || 'Image'}" style="width:${imgW};height:${imgH};object-fit:${imgStyle};transform:translate(${offX}px,${offY}px);pointer-events:none;">
      </div>`;
    }
    if (typeof content === 'object' && content.type === 'image') {
      // Placeholder (no image data yet)
      return `<div style="width:100%;height:100%;border:2px dashed ${p.colors.border};border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:${p.colors.surface};">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${p.colors.secondary}" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        <span style="font-family:Arial;font-size:12px;color:${p.colors.secondary};">${content.alt || content.src || 'Image'}</span>
      </div>`;
    }
    return '';
  }

  if (typeof content === 'object' && content.type === 'table') {
    const hBg = p.colors.table_header_bg, hT = colorOv || p.colors.table_header_text, alt = p.colors.table_row_alt, bc = p.colors.border, tc = txtColor;
    const tf = fs * 0.9;
    let h = `<table style="width:100%;border-collapse:collapse;font-family:Arial;font-size:${tf}px;"><thead><tr>`;
    content.headers.forEach(x => { h += `<th style="background:${hBg};color:${hT};padding:12px 16px;text-align:left;font-weight:700;font-size:${tf * 0.9}px;border-bottom:2px solid ${bc};">${x}</th>`; });
    h += '</tr></thead><tbody>';
    content.rows.forEach((r, i) => { h += `<tr style="background:${i % 2 === 1 ? alt : 'transparent'};">`; r.forEach((c, j) => { h += `<td style="padding:10px 16px;border-bottom:1px solid ${bc};color:${tc};font-weight:${j === 0 ? 500 : 400};">${c}</td>`; }); h += '</tr>'; });
    return h + '</tbody></table>';
  }

  if (typeof content === 'object' && content.type === 'list') {
    const g = p.spacing.paragraph;
    return content.items.map(item => `<div style="display:flex;align-items:flex-start;margin-bottom:${g}px;font-size:${fs}px;color:${txtColor};font-family:${s.ff};font-weight:${s.fw};line-height:${s.lh || 1.5};"><span style="color:${colorOv || p.colors.secondary};margin-right:14px;flex-shrink:0;font-size:7px;margin-top:${fs * 0.4}px;">●</span><span>${item}</span></div>`).join('');
  }

  if (typeof content === 'string') {
    let pre = '';
    if (role === 'quote') pre = `<span style="font-size:${fs * 1.5}px;color:${colorOv || p.colors.secondary};margin-right:2px;">"</span>`;
    return `<div style="font-size:${fs}px;color:${txtColor};font-family:${s.ff};font-weight:${s.fw};font-style:${s.fs || 'normal'};line-height:${s.lh || 1.3};letter-spacing:${s.ls || 0}px;">${pre}${content}</div>`;
  }
  return '';
}

export function renderSlide(slide, idx, p, total) {
  const L = LAYOUTS[slide.layout];
  if (!L) return `<div style="padding:40px;color:red;">Unknown layout: ${slide.layout}</div>`;
  const W = p.slide.width, H = p.slide.height, m = p.spacing.margin;
  const ov = slide.style_overrides || {};
  const regionOv = ov.regions || {}; // per-region overrides: {title:{color:"#hex"}, body:{color:"#hex"}}
  const bg = ov.background || (L.background_override === 'surface' ? p.colors.surface : p.colors.background);
  const globalColor = ov.heading_color || null;
  const fontOv = ov.font || null;
  let html = `<div style="width:${W}px;height:${H}px;position:relative;background:${bg};overflow:hidden;">`;
  L.regions.forEach(r => {
    const c = slide.content[r.id];
    if (!c && r.optional) return;
    if (!c) return;
    const ax = m.left + r.bounds.x, ay = m.top + r.bounds.y;
    const al = r.align || {};
    const jc = al.vertical === 'middle' ? 'center' : al.vertical === 'bottom' ? 'flex-end' : 'flex-start';
    // Per-region overrides: region-specific > global > null (use preset)
    const rOv = regionOv[r.id] || {};
    const regionColor = rOv.color || globalColor || null;
    const regionFont = rOv.font || fontOv || null;
    // Text decorations: region-specific > global
    const isUnderline = rOv.underline !== undefined ? rOv.underline : (ov.underline || false);
    const isBold = rOv.bold !== undefined ? rOv.bold : (ov.bold || false);
    const isItalic = rOv.italic !== undefined ? rOv.italic : (ov.italic || false);
    let extra = '';
    if (regionColor) extra += `color:${regionColor};`;
    if (regionFont) extra += `font-family:'${regionFont}',Arial,sans-serif;`;
    let deco = [];
    if (isUnderline) deco.push('underline');
    if (deco.length) extra += `text-decoration:${deco.join(' ')};`;
    if (isBold) extra += `font-weight:700;`;
    if (isItalic) extra += `font-style:italic;`;
    // Font size override: region-specific > global > null
    const regionFontSize = rOv.font_size || ov.font_size || null;
    // Clickable region selection
    const isSel = state.selectedRegion && state.selectedRegion.slideIdx === idx && state.selectedRegion.regionId === r.id;
    const selClass = isSel ? 'region-box selected' : 'region-box';
    const roleLabel = r.role.charAt(0).toUpperCase() + r.role.slice(1);
    html += `<div class="${selClass}" onclick="event.stopPropagation();selectRegion(${idx},'${r.id}','${r.role}','${roleLabel}')" style="position:absolute;left:${ax}px;top:${ay}px;width:${r.bounds.w}px;height:${r.bounds.h}px;display:flex;flex-direction:column;justify-content:${jc};text-align:${al.horizontal || 'left'};overflow:hidden;${extra}">`;
    html += rc(c, r.role, p, r, regionColor, regionFontSize);
    html += '</div>';
  });
  // Render floating images (overlays on top of content)
  if (slide.images && slide.images.length > 0) {
    slide.images.forEach(fi => {
      html += `<div style="position:absolute;left:${fi.x}px;top:${fi.y}px;width:${fi.w}px;height:${fi.h}px;overflow:hidden;pointer-events:none;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.2);">
        <img src="${fi.dataUrl}" alt="${fi.name || 'image'}" style="width:100%;height:100%;object-fit:${fi.fit || 'contain'};pointer-events:none;">
      </div>`;
    });
  }
  html += `<div style="position:absolute;bottom:${m.bottom * 0.4}px;right:${m.right}px;font-family:Arial;font-size:${p.typography.scale[5]}px;color:${p.colors.secondary};opacity:0.4;">${idx + 1}</div>`;
  html += '</div>';
  return html;
}

// ═══════════════════════════════════════════
// UI
// ═══════════════════════════════════════════

export const ONBOARDING_PROMPTS = [
  { icon: '🎯', text: 'Create a 5-slide deck about AI trends in 2026' },
  { icon: '🚀', text: 'Build a startup pitch deck for a food delivery app' },
  { icon: '📊', text: 'Make a quarterly business review with charts and data' },
  { icon: '🎓', text: 'Design a lecture about climate change for students' },
];

export function useOnboardingPrompt(text) {
  const input = document.getElementById('chatInput');
  input.value = text;
  input.focus();
  // Remove onboarding UI
  const ob = document.getElementById('chatOnboarding');
  if (ob) ob.remove();
  // Auto-send
  sendMessage();
}

export function renderChatOnboarding() {
  const msgs = document.getElementById('chatMessages');
  const existing = document.getElementById('chatOnboarding');
  // Show onboarding only when chat is empty (no user messages yet)
  const hasMessages = msgs.querySelector('.msg');
  if (hasMessages) {
    if (existing) existing.remove();
    return;
  }
  if (existing) return; // already showing
  const div = document.createElement('div');
  div.id = 'chatOnboarding';
  div.className = 'chat-onboarding';
  div.innerHTML = `
    <div class="chat-onboarding-title">What would you like to create?<br><span style="color:#333;font-size:10px;">Click a suggestion or type your own</span></div>
    <div class="chat-onboarding-chips">
      ${ONBOARDING_PROMPTS.map(p => `<button class="chat-chip" onclick="useOnboardingPrompt('${p.text.replace(/'/g, "\\'")}')" ><span class="chip-icon">${p.icon}</span>${p.text}</button>`).join('')}
    </div>
  `;
  msgs.appendChild(div);
}

export function renderApp() {
  // Auto-save on every render (deck changes trigger render)
  autoSave();

  // Sync deck name input
  const deckNameEl = document.getElementById('deckNameInput');
  if (deckNameEl && document.activeElement !== deckNameEl) {
    deckNameEl.value = state.currentDeck?.title || '';
  }

  document.getElementById('presetPills').innerHTML = Object.values(PRESETS).map(pr =>
    `<button class="${pr.id === state.currentPreset ? 'active' : ''}" onclick="setPreset('${pr.id}')">${pr.name}</button>`
  ).join('');

  // Hide toolbar when no deck loaded
  const toolbarEl = document.querySelector('.toolbar');
  if (toolbarEl) toolbarEl.style.display = state.currentDeck ? 'flex' : 'none';

  // Onboarding: show prompt chips in empty chat
  renderChatOnboarding();

  const panel = document.querySelector('.slide-panel');
  const isMobile = window.innerWidth <= 600;
  const panelW = panel.clientWidth - (isMobile ? 8 : 12);
  // On mobile: use CACHED initial viewport height so pinch-to-zoom doesn't shrink slide
  // On desktop: use actual panel height minus chrome
  let panelH;
  if (isMobile) {
    const stableVH = typeof INITIAL_VH !== 'undefined' ? INITIAL_VH : window.innerHeight;
    panelH = Math.max(stableVH * 0.36 - 64, 80); // match CSS flex:0 0 36vh
  } else {
    panelH = panel.clientHeight - 70;
  }

  if (!state.currentDeck) {
    const emptyH = isMobile ? Math.max(panelH, 80) : panelH;
    const emptyPad = isMobile ? '16px' : '30px';
    const emptyIcon = isMobile ? '24px' : '32px';
    const emptyTitle = isMobile ? '12px' : '15px';
    document.getElementById('slideCanvas').innerHTML = `<div style="width:${panelW}px;height:${emptyH}px;background:#131313;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:${isMobile ? '8px' : '14px'};padding:${emptyPad};">
      <div style="font-size:${emptyIcon};">🦥</div>
      <div style="color:#555;font-size:${emptyTitle};font-family:Arial;text-align:center;">Type what you want in the chat.<br>Sloth will design it.</div>
      ${isMobile ? '' : `<div style="color:#333;font-size:11px;font-family:Arial;text-align:center;max-width:320px;line-height:1.5;">Try: &quot;Create a 5-slide deck about AI trends&quot; or &quot;Build a startup pitch deck&quot;</div>`}
    </div>`;
    document.getElementById('slideNav').innerHTML = '';
    document.getElementById('slideInfo').textContent = '';
    return;
  }

  const p = PRESETS[state.currentPreset];
  const slides = state.currentDeck.slides;
  const s = slides[state.currentSlide];
  const sc = Math.min(panelW / p.slide.width, panelH / p.slide.height, 1);

  const cv = document.getElementById('slideCanvas');
  cv.style.width = (p.slide.width * sc) + 'px';
  cv.style.height = (p.slide.height * sc) + 'px';
  // Two-layer structure: outer div = swipe animation, inner div = scale transform
  // This prevents CSS animation from overwriting the scale (animation forwards was killing transform:scale)
  const animClass = slideAnimDir > 0 ? 'slide-enter-left' : slideAnimDir < 0 ? 'slide-enter-right' : '';
  cv.innerHTML = `<div class="${animClass}" style="width:${p.slide.width * sc}px;height:${p.slide.height * sc}px;overflow:hidden;"><div style="transform:scale(${sc});transform-origin:top left;width:${p.slide.width}px;height:${p.slide.height}px;">${renderSlide(s, state.currentSlide, p, slides.length)}</div></div>`;

  document.getElementById('slideNav').innerHTML = slides.map((_, i) =>
    `<button class="${i === state.currentSlide ? 'active' : ''}" onclick="goSlide(${i})">${i + 1}</button>`
  ).join('');

  document.getElementById('slideInfo').textContent = `${state.currentSlide + 1}/${slides.length} | ${s.layout} | ${state.currentPreset}`;
  updateFontSizeIndicator();
}

// Slide navigation with animation direction tracking
export let slideAnimDir = 0; // -1 = going left (prev), +1 = going right (next), 0 = no anim

export function goSlide(i) {
  if (i === state.currentSlide) return;
  slideAnimDir = i > state.currentSlide ? 1 : -1;
  state.currentSlide = i;
  renderApp();
  slideAnimDir = 0;
}

export function setPreset(id) {
  state.currentPreset = id;
  // If no deck loaded, generate a sample template deck for this preset
  if (!state.currentDeck) {
    state.currentDeck = generateTemplateDeck(id);
    state.currentSlide = 0;
    state.chatHistory = [];
    addMessage(`✓ Created ${PRESETS[id].name} template deck`, 'system');
  }
  renderApp();
}

export function generateTemplateDeck(presetId) {
  const name = PRESETS[presetId].name;
  const deck = {
    title: name + ' Template',
    preset: presetId,
    _isTemplate: true, // flag: next generate should override content but keep style_overrides
    slides: []
  };
  // Each preset gets a single title-page preview with its signature color scheme
  if (presetId === 'monet') {
    deck._styleBank = {
      title: { background: '#E8DDD0', heading_color: '#4A5D7A', regions: { subtitle: { color: '#8B6F5E' }, tagline: { color: '#9BA08E' } } },
      content: [
        { background: '#7886A5', heading_color: '#F6F3EE', regions: { body: { color: '#E8E0D4' } } },
        { background: '#8B9E8B', heading_color: '#F6F3EE', regions: { body: { color: '#F0EDE6' } } }
      ],
      'two-column': { background: '#F6F3EE', heading_color: '#4A5D7A', regions: { left: { color: '#6B5E4A' }, right: { color: '#4A5D7A' }, left_label: { color: '#C67A3C' }, right_label: { color: '#7886A5' } } },
      quote: { background: '#C9B8D4', heading_color: '#2C2C3A', regions: { quote: { color: '#2C2C3A' }, author: { color: '#4A5D7A' } } },
      'data-table': { background: '#EDE8DF', heading_color: '#4A5D7A', regions: { description: { color: '#6B5E4A' } } },
      closing: { background: '#D4C4A8', heading_color: '#2C2C3A', regions: { subtitle: { color: '#4A5D7A' } } }
    };
    deck.slides = [{ layout: 'title', content: { title: 'Impressions of Light', subtitle: 'Describe your topic — Sloth will paint your slides', tagline: 'Monet preset · warm impressionist palette', date: new Date().toLocaleDateString() }, style_overrides: deck._styleBank.title }];
  } else if (presetId === 'seurat') {
    deck._styleBank = {
      title: { background: '#2A2A1E', heading_color: '#E8D8BD', regions: { subtitle: { color: '#C67A3C' }, tagline: { color: '#8B9E6B' } } },
      content: [
        { background: '#C67A3C', heading_color: '#FDF8EF', regions: { body: { color: '#FEF5E8' } } },
        { background: '#D4564A', heading_color: '#FDF8EF', regions: { body: { color: '#FEF0EC' } } }
      ],
      'two-column': { background: '#FDF8EF', heading_color: '#2A2A1E', regions: { left: { color: '#6B4D30' }, right: { color: '#3B6E8E' }, left_label: { color: '#C67A3C' }, right_label: { color: '#5B8FA8' } } },
      quote: { background: '#4A7C6F', heading_color: '#FDF8EF', regions: { quote: { color: '#F0E8D8' }, author: { color: '#E8D8BD' } } },
      'data-table': { background: '#F0E8D8', heading_color: '#2A2A1E', regions: { description: { color: '#6B6B58' } } },
      closing: { background: '#2A2A1E', heading_color: '#E8D8BD', regions: { subtitle: { color: '#C67A3C' } } }
    };
    deck.slides = [{ layout: 'title', content: { title: 'Points of Brilliance', subtitle: 'Describe your topic — Sloth will compose your slides', tagline: 'Seurat preset · vivid pointillist palette', date: new Date().toLocaleDateString() }, style_overrides: deck._styleBank.title }];
  } else {
    // White / Gray / Dark — no special style bank, preset colors suffice
    deck.slides = [{ layout: 'title', content: { title: 'Your Presentation', subtitle: 'Describe your topic in the chat below', tagline: name + ' preset · Sloth Space', date: new Date().toLocaleDateString() } }];
  }
  return deck;
}

// ═══════════════════════════════════════════
// TOOLBAR
// ═══════════════════════════════════════════

export function togglePopup(id, btn, e) {
  if (e) e.stopPropagation();
  const popup = document.getElementById(id);
  const isOpen = popup.classList.contains('show');
  document.querySelectorAll('.popup').forEach(p => p.classList.remove('show'));
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active-btn'));
  if (!isOpen) { popup.classList.add('show'); btn.classList.add('active-btn'); }
}

export function insertTag(tag) {
  const input = document.getElementById('chatInput');
  const start = input.selectionStart;
  const val = input.value;
  input.value = val.slice(0, start) + tag + ' ' + val.slice(start);
  input.focus();
  input.selectionStart = input.selectionEnd = start + tag.length + 1;
  document.querySelectorAll('.popup').forEach(p => p.classList.remove('show'));
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active-btn'));
}

export function insertTextColor(hex) { insertTag(`[color: ${hex}]`); }
export function insertBgColor(hex) { insertTag(`[bg: ${hex}]`); }

export function initToolbar() {
  const makeSwatches = (arr, containerId, fn) => {
    document.getElementById(containerId).innerHTML = arr.map(c =>
      `<div class="color-swatch" style="background:${c};" onclick="${fn}('${c}')" title="${c}"></div>`
    ).join('');
  };
  makeSwatches(BASIC_COLORS, 'textBasicColors', 'insertTextColor');
  makeSwatches(MONET_COLORS, 'textMonetColors', 'insertTextColor');
  makeSwatches(SEURAT_COLORS, 'textSeuratColors', 'insertTextColor');
  makeSwatches(BASIC_COLORS, 'bgBasicColors', 'insertBgColor');
  makeSwatches(MONET_COLORS, 'bgMonetColors', 'insertBgColor');
  makeSwatches(SEURAT_COLORS, 'bgSeuratColors', 'insertBgColor');
  document.getElementById('fontList').innerHTML = FONTS.map(f =>
    `<div class="font-item" style="font-family:'${f}';" onclick="insertTag('[font: ${f}]')">${f}</div>`
  ).join('');

  // Popup close click listener
  document.addEventListener('click', e => {
    if (!e.target.closest('.tool-btn')) {
      document.querySelectorAll('.popup').forEach(p => p.classList.remove('show'));
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active-btn'));
    }
  });
}
