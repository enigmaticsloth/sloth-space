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
import { S } from './state.js';

// ═══════════════════════════════════════════
// BENCH — Context staging area for AI
// ═══════════════════════════════════════════
// Users drop/import files here. AI reads everything on the Bench
// as context when generating slides, docs, or sheets.

// ── File type detection ──
const _BENCH_EXT_MAP = {
  pdf:'pdf', docx:'docx', doc:'docx',
  pptx:'pptx', ppt:'pptx',
  xlsx:'xlsx', xls:'xlsx', csv:'csv', tsv:'csv',
  sloth:'sloth', json:'sloth',
  png:'image', jpg:'image', jpeg:'image', gif:'image', webp:'image', svg:'image',
  txt:'text', md:'text', html:'text'
};

const _BENCH_ICONS = {
  pdf:'📕', docx:'📄', pptx:'📊', xlsx:'📗', csv:'📋',
  sloth:'🦥', image:'🖼️', text:'📝', other:'📎'
};

const _BENCH_COLORS = {
  pdf:'#C45C4A', docx:'#4A6FA5', pptx:'#C4783A', xlsx:'#5A8A5A', csv:'#8B7BA8',
  sloth:'#A08060', image:'#7886A5', text:'#888', other:'#666'
};

const _BENCH_ACCEPT = '.pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.tsv,.sloth,.json,.png,.jpg,.jpeg,.gif,.webp,.svg,.txt,.md,.html';

function _benchFileType(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return _BENCH_EXT_MAP[ext] || 'other';
}

function _sizeStr(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1048576).toFixed(1) + 'MB';
}

// ── Text extraction from various file types ──
async function _extractText(file, type) {
  try {
    if (type === 'text' || type === 'csv') {
      return await file.text();
    }
    if (type === 'sloth') {
      const raw = await file.text();
      try {
        const j = JSON.parse(raw);
        // Extract meaningful content from sloth format
        if (j.slides) {
          return j.slides.map((s, i) => `[Slide ${i + 1}] ${s.title || ''}\n${_flattenSlideText(s)}`).join('\n\n');
        }
        if (j.blocks) {
          return j.blocks.map(b => b.content || b.text || '').join('\n\n');
        }
        return JSON.stringify(j, null, 2).slice(0, 8000);
      } catch { return raw.slice(0, 8000); }
    }
    if (type === 'docx') return await _extractDocxText(file);
    if (type === 'pptx') return await _extractPptxText(file);
    if (type === 'xlsx') return await _extractXlsxText(file);
    if (type === 'pdf') return await _extractPdfText(file);
    if (type === 'image') return `[Image: ${file.name}, ${_sizeStr(file.size)}]`;
    return await file.text().then(t => t.slice(0, 8000));
  } catch (e) {
    return `[Error reading ${file.name}: ${e.message}]`;
  }
}

function _flattenSlideText(slide) {
  const parts = [];
  if (slide.content) parts.push(slide.content);
  if (slide.regions) {
    for (const r of slide.regions) {
      if (r.text) parts.push(r.text);
      if (r.items) parts.push(r.items.join(', '));
    }
  }
  return parts.join('\n');
}

// Extract text from .docx via JSZip
async function _extractDocxText(file) {
  if (typeof JSZip === 'undefined') return `[DOCX: ${file.name} — JSZip not loaded]`;
  try {
    const zip = await JSZip.loadAsync(file);
    const xml = await zip.file('word/document.xml')?.async('string');
    if (!xml) return '[Empty DOCX]';
    // Extract <w:t> text nodes
    const texts = [];
    xml.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, (_, t) => { texts.push(t); });
    // Group by paragraphs (rough heuristic: split on </w:p>)
    const paragraphs = xml.split('</w:p>').map(chunk => {
      const ts = [];
      chunk.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, (_, t) => { ts.push(t); });
      return ts.join('');
    }).filter(Boolean);
    return paragraphs.join('\n\n').slice(0, 12000) || texts.join(' ').slice(0, 12000);
  } catch (e) { return `[DOCX parse error: ${e.message}]`; }
}

// Extract text from .pptx via JSZip
async function _extractPptxText(file) {
  if (typeof JSZip === 'undefined') return `[PPTX: ${file.name} — JSZip not loaded]`;
  try {
    const zip = await JSZip.loadAsync(file);
    const slideFiles = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort();
    const results = [];
    for (let i = 0; i < slideFiles.length; i++) {
      const xml = await zip.file(slideFiles[i])?.async('string');
      if (!xml) continue;
      const texts = [];
      xml.replace(/<a:t>([^<]*)<\/a:t>/g, (_, t) => { texts.push(t); });
      results.push(`[Slide ${i + 1}] ${texts.join(' ')}`);
    }
    return results.join('\n\n').slice(0, 12000);
  } catch (e) { return `[PPTX parse error: ${e.message}]`; }
}

// Extract text from .xlsx via JSZip
async function _extractXlsxText(file) {
  if (typeof JSZip === 'undefined') return `[XLSX: ${file.name} — JSZip not loaded]`;
  try {
    const zip = await JSZip.loadAsync(file);
    // Read shared strings
    const ssXml = await zip.file('xl/sharedStrings.xml')?.async('string');
    const strings = [];
    if (ssXml) ssXml.replace(/<t[^>]*>([^<]*)<\/t>/g, (_, t) => { strings.push(t); });
    // Read first sheet
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml')?.async('string');
    if (!sheetXml) return strings.length ? `Shared strings: ${strings.join(', ')}` : '[Empty XLSX]';
    const rows = [];
    sheetXml.replace(/<row[^>]*>([\s\S]*?)<\/row>/g, (_, rowContent) => {
      const cells = [];
      rowContent.replace(/<c[^>]*(?:t="s"[^>]*)?>[\s\S]*?<v>(\d+)<\/v>/g, (_, idx) => {
        cells.push(strings[parseInt(idx)] || idx);
      });
      rowContent.replace(/<c[^>]*(?!t="s")[^>]*>[\s\S]*?<v>([^<]+)<\/v>/g, (_, val) => {
        cells.push(val);
      });
      if (cells.length) rows.push(cells.join('\t'));
    });
    return rows.join('\n').slice(0, 12000) || `[XLSX with ${strings.length} strings]`;
  } catch (e) { return `[XLSX parse error: ${e.message}]`; }
}

// Extract text from PDF via pdf.js (Mozilla) — loaded on-demand via dynamic import
let _pdfjsLib = null;
async function _loadPdfJs() {
  if (_pdfjsLib) return _pdfjsLib;
  // Try window.pdfjsLib first (from <script> tag in index.html)
  if (window.pdfjsLib) {
    _pdfjsLib = window.pdfjsLib;
    // Ensure worker is configured (index.html script may have set it, but double-check)
    if (!_pdfjsLib.GlobalWorkerOptions.workerSrc) {
      _pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    console.log('[PDF.js] Using window.pdfjsLib, worker:', _pdfjsLib.GlobalWorkerOptions.workerSrc);
    return _pdfjsLib;
  }
  // Dynamic import as fallback — try multiple CDN sources
  const cdns = [
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.mjs',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.mjs',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs',
  ];
  for (const url of cdns) {
    try {
      console.log('[PDF.js] Trying dynamic import:', url);
      const mod = await import(url);
      _pdfjsLib = mod;
      // Set worker
      const workerUrl = url.replace('pdf.min.mjs', 'pdf.worker.min.mjs');
      _pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      console.log('[PDF.js] Loaded successfully from:', url);
      window.pdfjsLib = _pdfjsLib; // cache globally
      return _pdfjsLib;
    } catch (e) {
      console.warn('[PDF.js] Failed to load from', url, ':', e.message);
    }
  }
  return null;
}

async function _extractPdfText(file) {
  const lib = await _loadPdfJs();
  if (!lib) {
    return `[PDF file: ${file.name} — ${_sizeStr(file.size)}. PDF.js library failed to load from all CDN sources. Check network/console.]`;
  }
  try {
    const arrayBuf = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: arrayBuf }).promise;
    const pages = [];
    const maxPages = Math.min(pdf.numPages, 50);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      if (pageText.trim()) pages.push(`[Page ${i}]\n${pageText.trim()}`);
    }
    const result = pages.join('\n\n');
    if (!result) return `[PDF: ${file.name} — no extractable text (may be scanned/image-only)]`;
    return result.slice(0, 16000);
  } catch (e) {
    console.error('[PDF] Extraction error:', e);
    return `[PDF parse error: ${e.message}. File: ${file.name}]`;
  }
}

// ── Limits ──
const _BENCH_MAX_FILES = 5;
const _BENCH_FILE_MAX_BYTES = 20 * 1024 * 1024; // 20 MB per file
const _BENCH_IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB for images

// ── localStorage persistence ──
const _BENCH_STORAGE_KEY = 'sloth_bench';

function _benchSave() {
  try {
    // Save bench items (skip dataUrl for images to keep storage small)
    const stripped = S.bench.map(b => ({
      id: b.id, name: b.name, type: b.type, size: b.size,
      extractedText: b.extractedText, addedAt: b.addedAt,
      // Store small thumbnails only (< 200KB dataUrl), skip large ones
      dataUrl: (b.dataUrl && b.dataUrl.length < 200000) ? b.dataUrl : null
    }));
    localStorage.setItem(_BENCH_STORAGE_KEY, JSON.stringify({
      items: stripped,
      idCounter: S._benchIdCounter
    }));
  } catch (e) {
    console.warn('[Bench] localStorage save failed:', e.message);
  }
}

function _benchLoad() {
  try {
    const raw = localStorage.getItem(_BENCH_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.items && Array.isArray(data.items)) {
      // Purge stale PDF entries that were cached before PDF extraction was implemented
      let purged = false;
      data.items.forEach(b => {
        if (b.type === 'pdf' && b.extractedText && /PDF text extraction pending|PDF\.js library not loaded|PDF\.js library failed to load|cached without text extraction|PDF parse error/.test(b.extractedText)) {
          b.extractedText = `[PDF: ${b.name} — cached without text extraction. Please remove and re-add this file to extract text.]`;
          purged = true;
        }
      });
      S.bench = data.items;
      S._benchIdCounter = data.idCounter || data.items.length;
      if (purged) {
        _benchSave(); // Update cache with warning text
        console.warn('[Bench] Found stale PDF entries from before text extraction was enabled. Please re-add PDF files.');
      }
    }
  } catch (e) {
    console.warn('[Bench] localStorage load failed:', e.message);
  }
}

// ── Core bench operations ──

async function benchAddFile(file) {
  // Enforce max file count
  if (S.bench.length >= _BENCH_MAX_FILES) {
    if (window.addMessage) {
      window.addMessage(`Bench is full (max ${_BENCH_MAX_FILES} files). Remove a file before adding more.`, 'system');
    }
    return null;
  }

  // Enforce per-file size limit
  if (file.size > _BENCH_FILE_MAX_BYTES) {
    const maxMB = (_BENCH_FILE_MAX_BYTES / (1024 * 1024)).toFixed(0);
    if (window.addMessage) {
      window.addMessage(`"${file.name}" (${_sizeStr(file.size)}) exceeds the ${maxMB}MB file size limit.`, 'system');
    }
    return null;
  }

  const type = _benchFileType(file.name);

  // Enforce image size limit (stricter)
  if (type === 'image' && file.size > _BENCH_IMAGE_MAX_BYTES) {
    const maxMB = (_BENCH_IMAGE_MAX_BYTES / (1024 * 1024)).toFixed(0);
    if (window.addMessage) {
      window.addMessage(`Image "${file.name}" (${_sizeStr(file.size)}) exceeds the ${maxMB}MB limit. Please use a smaller image.`, 'system');
    }
    return null;
  }

  const extractedText = await _extractText(file, type);
  // Diagnostic: show what was extracted so user can verify
  console.log(`[Bench] Extracted from "${file.name}" (${type}): ${extractedText.substring(0,300)}...`);
  if(type==='pdf' && window.addMessage){
    const preview=extractedText.substring(0,200).replace(/\n/g,' ');
    if(/\[PDF.*pending|not loaded|parse error/i.test(extractedText)){
      window.addMessage(`⚠️ PDF extraction failed: ${preview}`, 'system');
    } else {
      window.addMessage(`✓ PDF text extracted (${extractedText.length} chars): "${preview}..."`, 'system');
    }
  }

  // For images, create data URL thumbnail (resized to save space)
  let dataUrl = null;
  let slideDataUrl = null;
  let origW = 0, origH = 0;
  if (type === 'image') {
    const thumbResult = await _createThumbnail(file);
    dataUrl = thumbResult.thumb;
    slideDataUrl = thumbResult.slideDataUrl;
    origW = thumbResult.origW;
    origH = thumbResult.origH;
  }

  const item = {
    id: ++S._benchIdCounter,
    name: file.name,
    type,
    size: file.size,
    dataUrl,
    slideDataUrl,  // higher-res for slide insertion (memory only, not persisted)
    origW, origH,  // original dimensions
    extractedText,
    addedAt: new Date().toISOString()
  };

  S.bench.push(item);
  _benchSave();
  renderBench();
  return item;
}

// Create a resized thumbnail dataUrl to keep localStorage small
// Also creates a slide-suitable higher-res version (in memory only)
async function _createThumbnail(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Slide-quality version (max 1000px) — kept in memory for insertion
        const slideMax = 1000;
        let sw = img.width, sh = img.height;
        if (sw > slideMax || sh > slideMax) {
          const ratio = Math.min(slideMax / sw, slideMax / sh);
          sw = Math.round(sw * ratio);
          sh = Math.round(sh * ratio);
        }
        const slideCanvas = document.createElement('canvas');
        slideCanvas.width = sw; slideCanvas.height = sh;
        slideCanvas.getContext('2d').drawImage(img, 0, 0, sw, sh);
        const slideDataUrl = slideCanvas.toDataURL('image/jpeg', 0.85);

        // Thumbnail (200px) — for bench card display and localStorage
        const maxDim = 200;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve({
          thumb: canvas.toDataURL('image/jpeg', 0.7),
          slideDataUrl,
          origW: img.width,
          origH: img.height
        });
      };
      img.onerror = () => resolve({ thumb: reader.result, slideDataUrl: reader.result, origW: 400, origH: 400 });
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function benchAddFiles(fileList) {
  if (!fileList || !fileList.length) return;
  const results = await Promise.all(Array.from(fileList).map(f => benchAddFile(f)));
  return results.filter(Boolean);
}

function benchRemove(id) {
  S.bench = S.bench.filter(b => b.id !== id);
  _benchSave();
  renderBench();
}

function benchClear() {
  S.bench = [];
  S._benchIdCounter = 0;
  _benchSave();
  renderBench();
}

// Import bench item to workspace
function benchImportToWs(id) {
  const item = S.bench.find(b => b.id === id);
  if (!item) return;
  // Create a workspace-compatible file entry
  if (window.wsImportBenchItem) {
    window.wsImportBenchItem(item);
    window.addMessage(`Imported "${item.name}" to Workspace.`, 'system');
  } else {
    window.addMessage('Workspace import not available yet.', 'system');
  }
}

// ── AI context getter ──
function benchGetContext() {
  if (S.bench.length === 0) return '';
  const parts = S.bench.map(b =>
    `--- [Bench: ${b.name} (${b.type}, ${_sizeStr(b.size)})] ---\n${b.extractedText}`
  );
  return '\n\n## BENCH CONTEXT\nThe user has placed the following files on the Bench as reference material. Use this data when the user asks you to generate content from Bench files.\n\n' + parts.join('\n\n');
}

function benchGetSummary() {
  if (S.bench.length === 0) return '';
  return S.bench.map(b => `"${b.name}" (${b.type})`).join(', ');
}

/** Return the first image on the bench (for auto-insertion into slides) */
function benchGetFirstImage() {
  return S.bench.find(b => b.type === 'image' && (b.slideDataUrl || b.dataUrl)) || null;
}

// ── Render ──
function renderBench() {
  const area = document.getElementById('benchArea');
  if (!area) return;

  const items = S.bench;
  const wrapper = document.getElementById('benchWrapper');
  const countEl = document.getElementById('benchCount');
  const clearBtn = document.getElementById('benchClearBtn');

  // Update header
  if (countEl) countEl.textContent = items.length > 0 ? `${items.length} file${items.length > 1 ? 's' : ''}` : '';
  if (clearBtn) clearBtn.style.display = items.length > 0 ? '' : 'none';

  if (items.length === 0) {
    area.innerHTML = `<div class="bench-empty" onclick="window.benchTriggerFileInput()">
      <svg class="bench-empty-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5A6A88" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
      <div class="bench-empty-text">
        <span class="bench-empty-title">Drop or import reference files here</span>
        <span class="bench-empty-desc">PDF, Word, PPT, Excel, images, .sloth — AI reads everything on the Bench to generate your content.</span>
      </div>
    </div>`;
    if (wrapper) wrapper.classList.remove('has-items');
    return;
  }

  if (wrapper) wrapper.classList.add('has-items');

  area.innerHTML = items.map(item => {
    const icon = _BENCH_ICONS[item.type] || '📎';
    const color = _BENCH_COLORS[item.type] || '#666';
    const thumb = item.dataUrl
      ? `<img class="bench-card-thumb" src="${item.dataUrl}" alt="${_escHtml(item.name)}">`
      : `<div class="bench-card-icon" style="color:${color}">${icon}</div>`;
    return `<div class="bench-card" data-benchid="${item.id}">
      ${thumb}
      <div class="bench-card-info">
        <div class="bench-card-name" title="${_escHtml(item.name)}">${_escHtml(item.name)}</div>
        <div class="bench-card-meta">${item.type.toUpperCase()} · ${_sizeStr(item.size)}</div>
      </div>
      <button class="bench-card-action" onclick="event.stopPropagation();window.benchImportToWs(${item.id})" title="Import to Workspace">↗</button>
      <button class="bench-card-del" onclick="event.stopPropagation();window.benchRemove(${item.id})" title="Remove from Bench">×</button>
    </div>`;
  }).join('');
}

function _escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── File input trigger ──
function benchTriggerFileInput() {
  const inp = document.getElementById('benchFileInput');
  if (inp) inp.click();
}

function benchHandleFileInput(input) {
  if (input.files && input.files.length) {
    benchAddFiles(input.files);
  }
  input.value = '';
}

// ── Drag-drop helpers (called from keys.js) ──
function benchHandleDrop(files) {
  // Filter: images go to staged images (existing behavior), everything else goes to bench
  const imageFiles = [];
  const benchFiles = [];
  Array.from(files).forEach(f => {
    const type = _benchFileType(f.name);
    if (type === 'image') {
      // Images go to both: staged images (for slide insertion) AND bench
      imageFiles.push(f);
      benchFiles.push(f);
    } else {
      benchFiles.push(f);
    }
  });
  // Add non-image files to bench
  if (benchFiles.length) benchAddFiles(benchFiles);
  // Return image files for existing image staging behavior
  return imageFiles;
}

// ── Initialize bench area drag highlights ──
function initBench() {
  const wrapper = document.getElementById('benchWrapper');
  if (!wrapper) return;

  // Restore persisted bench items from localStorage
  _benchLoad();

  wrapper.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    wrapper.classList.add('bench-dragover');
  });
  wrapper.addEventListener('dragleave', (e) => {
    e.preventDefault();
    wrapper.classList.remove('bench-dragover');
  });
  wrapper.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    wrapper.classList.remove('bench-dragover');
    S.dragCounter = 0;
    document.getElementById('dropOverlay')?.classList.remove('show');
    if (e.dataTransfer.files.length) {
      benchAddFiles(e.dataTransfer.files);
    }
  });

  renderBench();
}

export {
  benchAddFile,
  benchAddFiles,
  benchRemove,
  benchClear,
  benchImportToWs,
  benchGetContext,
  benchGetSummary,
  benchGetFirstImage,
  renderBench,
  benchTriggerFileInput,
  benchHandleFileInput,
  benchHandleDrop,
  initBench,
  _BENCH_ACCEPT
};
