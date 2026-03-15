// ═══════════════════════════════════════════
// WORKSPACE MODULE
// ═══════════════════════════════════════════
// Manages workspace file storage (docs, sheets, slides).
// Persists to localStorage and syncs with cloud (Supabase).

import { S, WS_STORAGE_KEY } from './state.js';

// Doc content:  { blocks: [ { id, type:"paragraph"|"heading"|"list", text } ] }
// Sheet content: { columns: ["A","B",...], rows: [ [val, val, ...], ... ] }
// Slides content: standard deck JSON (currentDeck)

// ── Utility Functions ──

/**
 * Generate a unique file ID.
 */
export function wsId() {
  return 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

/**
 * Escape HTML special characters.
 */
export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Storage Operations ──

/**
 * Load all workspace files from localStorage.
 */
export function wsLoad() {
  try {
    return JSON.parse(localStorage.getItem(WS_STORAGE_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

/**
 * Save workspace files to localStorage and trigger cloud sync.
 */
export function wsSave(files) {
  try {
    localStorage.setItem(WS_STORAGE_KEY, JSON.stringify(files));
  } catch (e) {
    console.warn('Workspace save failed:', e);
  }
  // Auto-sync to cloud (debounced)
  clearTimeout(wsSave._timer);
  wsSave._timer = setTimeout(syncWorkspaceToCloud, 2000);
}

// ── Workspace Cloud Sync (Supabase Storage) ──

/**
 * Upload workspace files to cloud (Supabase).
 */
export async function syncWorkspaceToCloud() {
  if (!window.supabaseClient || !S.currentUser) return;
  try {
    const files = wsLoad();
    const blob = new Blob([JSON.stringify(files)], { type: 'application/json' });
    const path = S.currentUser.id + '/workspace.json';
    await window.supabaseClient.storage.from('decks').upload(path, blob, { upsert: true });
  } catch (e) {
    console.warn('Workspace cloud sync failed:', e);
  }
}

/**
 * Download workspace files from cloud and merge with local files.
 */
export async function syncWorkspaceFromCloud() {
  if (!window.supabaseClient || !S.currentUser) return;
  try {
    const path = S.currentUser.id + '/workspace.json';
    const { data, error } = await window.supabaseClient.storage.from('decks').download(path);
    if (error || !data) return; // no cloud workspace yet
    const text = await data.text();
    const cloudFiles = JSON.parse(text);
    if (!Array.isArray(cloudFiles) || cloudFiles.length === 0) return;
    // Merge: cloud files + local files, deduplicate by id, prefer newer
    // But never restore files that were explicitly deleted locally
    const deletedIds = new Set(JSON.parse(localStorage.getItem('sloth_ws_deleted') || '[]'));
    const localFiles = wsLoad();
    const merged = new Map();
    for (const f of localFiles) merged.set(f.id, f);
    for (const f of cloudFiles) {
      if (deletedIds.has(f.id)) continue; // skip deleted files
      const existing = merged.get(f.id);
      if (!existing || new Date(f.updated) > new Date(existing.updated)) {
        merged.set(f.id, f);
      }
    }
    const result = [...merged.values()];
    localStorage.setItem(WS_STORAGE_KEY, JSON.stringify(result)); // save without triggering re-upload
  } catch (e) {
    console.warn('Workspace cloud restore failed:', e);
  }
}

// ── File Operations ──

/**
 * Get a single workspace file by ID.
 */
export function wsGetFile(id) {
  return wsLoad().find(f => f.id === id) || null;
}

/**
 * Create a new document in workspace.
 */
export function wsCreateDoc(title, text) {
  const files = wsLoad();
  const blocks = text
    .split(/\n\n+/)
    .filter(Boolean)
    .map((t, i) => ({
      id: 'blk_' + Date.now() + '_' + i,
      type: /^#{1,3}\s/.test(t) ? 'heading' : 'paragraph',
      text: t.replace(/^#{1,3}\s/, '')
    }));
  const doc = {
    id: wsId(),
    type: 'doc',
    title: title || 'Untitled Doc',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    content: { blocks }
  };
  files.push(doc);
  wsSave(files);
  return doc;
}

/**
 * Create a new sheet in workspace.
 */
export function wsCreateSheet(title, csvOrText) {
  const files = wsLoad();
  // Parse simple CSV / tab-separated / line-separated table
  const lines = csvOrText
    .trim()
    .split('\n')
    .map(l => l.split(/[,\t]/).map(c => c.trim()));
  const columns = lines[0] || [];
  const rows = lines.slice(1);
  const sheet = {
    id: wsId(),
    type: 'sheet',
    title: title || 'Untitled Sheet',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    content: { columns, rows }
  };
  files.push(sheet);
  wsSave(files);
  return sheet;
}

/**
 * Delete a workspace file by ID.
 */
export function wsDeleteFile(id) {
  const files = wsLoad().filter(f => f.id !== id);
  wsSave(files);
  // Track deleted IDs so cloud sync never restores them
  try {
    const deleted = JSON.parse(localStorage.getItem('sloth_ws_deleted') || '[]');
    if (!deleted.includes(id)) {
      deleted.push(id);
      localStorage.setItem('sloth_ws_deleted', JSON.stringify(deleted));
    }
  } catch (e) {}
  // If the deleted file is the currently active file, reset to blank state
  if (S.currentDoc && S.currentDoc.id === id) {
    S.currentDoc = null;
    localStorage.removeItem('sloth_current_doc');
    if (S.currentMode === 'doc') {
      S.currentDoc = window.docCreateNew('Untitled Document');
      window.updateModeNameBar('doc');
      window.renderDocMode();
    }
    window.addMessage('Current document deleted. Starting fresh.', 'system');
  }
  if (S.currentDeck) {
    // Check workspace slide files (type:'slides')
    const deckWsEntry = wsLoad().find(f => f.type === 'slides' && f.title === S.currentDeck.title);
    if (!deckWsEntry) {
      // Deck might have been the deleted file
      // (title-based match as fallback since slides don't always have wsId)
    }
  }
  // Force immediate cloud sync so deleted state is persisted before any refresh
  clearTimeout(wsSave._timer);
  syncWorkspaceToCloud();
}

/**
 * Update a workspace file with partial updates.
 */
export function wsUpdateFile(id, updates) {
  const files = wsLoad();
  const idx = files.findIndex(f => f.id === id);
  if (idx === -1) return null;
  Object.assign(files[idx], updates, { updated: new Date().toISOString() });
  wsSave(files);
  return files[idx];
}

/**
 * Get all workspace files, optionally filtered by type.
 */
export function wsListFiles(typeFilter) {
  const files = wsLoad();
  if (typeFilter) return files.filter(f => f.type === typeFilter);
  return files;
}

/**
 * Serialize a workspace file to plain text for LLM context injection.
 */
export function wsFileToContext(file) {
  if (!file) return '';
  if (file.type === 'doc') {
    return (
      `[WORKSPACE DOC: "${file.title}" (id: ${file.id})]\n` +
      (file.content.blocks || [])
        .map(b => (b.type === 'heading' ? `## ${b.text}` : b.text))
        .join('\n\n')
    );
  }
  if (file.type === 'sheet') {
    const c = file.content;
    let table = c.columns.join('\t') + '\n';
    table += (c.rows || []).map(r => r.join('\t')).join('\n');
    return `[WORKSPACE SHEET: "${file.title}" (id: ${file.id})]\n${table}`;
  }
  if (file.type === 'slides') {
    return `[WORKSPACE SLIDES: "${file.title}" (id: ${file.id})]\n${JSON.stringify(file.content)}`;
  }
  return '';
}

/**
 * Detect workspace file references in user message.
 * Patterns: "用[文件名/doc名]", "從[sheet名]抓", "reference [title]", "@doc名", etc.
 */
export function wsDetectReferences(text) {
  const files = wsLoad();
  if (files.length === 0) return [];
  const matched = [];
  for (const f of files) {
    const t = f.title.toLowerCase();
    const words = t.split(/\s+/);
    // Direct title match (case-insensitive)
    if (text.toLowerCase().includes(t)) {
      matched.push(f);
      continue;
    }
    // @mention style: @filename
    if (text.toLowerCase().includes('@' + t.replace(/\s/g, ''))) {
      matched.push(f);
      continue;
    }
    // Partial match: if all significant words of title appear in text
    if (words.length >= 2 && words.every(w => w.length > 1 && text.toLowerCase().includes(w))) {
      matched.push(f);
      continue;
    }
  }
  return matched;
}

// ═══════════════════════════════════════════
// WORKSPACE UI — Mode and Multi-select
// ═══════════════════════════════════════════

/**
 * Enter workspace mode (show all files).
 */
export function enterWorkspaceMode() {
  window.modeEnter('workspace');
}

/**
 * Render the workspace mode UI with file list and batch controls.
 */
export function renderWorkspaceMode() {
  const canvas = document.getElementById('workspaceCanvas');
  if (!canvas) return;
  const saved = wsLoad();

  // Batch action bar (visible when items selected)
  let batchHtml = '';
  if (S.wsSelectedIds.size > 0) {
    batchHtml = `<div class="ws-batch-bar">
      <span class="ws-batch-count">${S.wsSelectedIds.size} selected</span>
      <button class="ws-batch-btn danger" onclick="wsBatchDelete()">Delete</button>
      <button class="ws-batch-btn" onclick="wsBatchDuplicate()">Duplicate</button>
      <button class="ws-batch-cancel" onclick="wsClearSelection()">Cancel</button>
    </div>`;
  }

  let itemsHtml = '';
  if (saved.length === 0) {
    itemsHtml = `
      <div class="ws-empty">
        <div style="font-size:14px;color:#888;margin-bottom:12px;">No files yet</div>
        <div style="font-size:12px;color:#555;line-height:1.6;">Create your first document or presentation from the mode picker.</div>
      </div>`;
  } else {
    itemsHtml = saved
      .map((item, i) => {
        const type = item.type || 'slide';
        const isSelected = S.wsSelectedIds.has(item.id);
        const selClass = isSelected ? ' ws-selected' : '';
        const date = item.updated
          ? new Date(item.updated).toLocaleDateString()
          : item.modified
          ? new Date(item.modified).toLocaleDateString()
          : '';
        // Mini preview based on type
        const preview = wsRenderFilePreview(item);
        return `<div class="ws-file-card${selClass}" data-ws-id="${item.id}">
        <div class="ws-check" onclick="event.stopPropagation();wsToggleSelect('${item.id}')">${isSelected ? '✓' : ''}</div>
        <div onclick="openWorkspaceItem(${i})" style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;">
          ${preview}
          <div class="ws-file-info">
            <div class="ws-file-name">${escapeHtml(item.title || item.name || 'Untitled')}</div>
            <div class="ws-file-meta">${type.charAt(0).toUpperCase() + type.slice(1)} · ${date}</div>
          </div>
        </div>
      </div>`;
      })
      .join('');
  }
  canvas.innerHTML = `
    <div class="ws-page">
      <div class="ws-header">
        <div class="ws-title">Workspace</div>
        <div class="ws-subtitle">Your files and projects</div>
      </div>
      <div class="ws-actions">
        <button class="ws-new-btn" onclick="showModePicker()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New
        </button>
      </div>
      ${batchHtml}
      <div class="ws-file-list">${itemsHtml}</div>
    </div>
  `;
}

/**
 * Render a mini preview of a workspace file.
 */
export function wsRenderFilePreview(item) {
  const type = item.type || 'slide';
  if (type === 'slide') {
    // Mini slide preview: show first slide's title if available
    const title = item.content?.slides?.[0]?.content?.title || item.content?.slides?.[0]?.content?.heading || '';
    const shortTitle = typeof title === 'string' ? title.slice(0, 12) : '';
    return `<div class="ws-file-preview slide-prev">
      <div style="width:100%;height:100%;padding:4px;display:flex;flex-direction:column;gap:2px;">
        <div style="height:4px;width:60%;background:rgba(255,255,255,0.25);border-radius:1px;"></div>
        <div style="height:3px;width:40%;background:rgba(255,255,255,0.12);border-radius:1px;"></div>
        <div style="flex:1;display:flex;gap:2px;margin-top:2px;">
          <div style="flex:1;background:rgba(255,255,255,0.06);border-radius:1px;"></div>
          <div style="flex:1;background:rgba(255,255,255,0.06);border-radius:1px;"></div>
        </div>
      </div>
    </div>`;
  } else if (type === 'doc') {
    // Mini doc preview: show lines
    const blockCount = item.content?.blocks?.length || 0;
    const lines = Math.min(blockCount, 4);
    let linesHtml = '';
    for (let i = 0; i < lines; i++) {
      const w = i === 0 ? '50%' : ['80%', '65%', '70%'][i - 1] || '60%';
      const h = i === 0 ? '4px' : '2px';
      const bg = i === 0 ? 'rgba(120,134,165,0.4)' : 'rgba(255,255,255,0.1)';
      linesHtml += `<div style="height:${h};width:${w};background:${bg};border-radius:1px;"></div>`;
    }
    return `<div class="ws-file-preview doc-prev">
      <div style="width:100%;height:100%;padding:5px 6px;display:flex;flex-direction:column;gap:3px;justify-content:center;">
        ${linesHtml}
      </div>
    </div>`;
  } else if (type === 'sheet') {
    return `<div class="ws-file-preview sheet-prev">
      <div style="width:100%;height:100%;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr 1fr;gap:1px;padding:3px;">
        ${Array(9)
          .fill('<div style="background:rgba(255,255,255,0.05);border-radius:1px;"></div>')
          .join('')}
      </div>
    </div>`;
  }
  return `<div class="ws-file-preview" style="background:rgba(255,255,255,0.05);">?</div>`;
}

/**
 * Toggle selection of a workspace file.
 */
export function wsToggleSelect(id) {
  if (S.wsSelectedIds.has(id)) S.wsSelectedIds.delete(id);
  else S.wsSelectedIds.add(id);
  renderWorkspaceMode();
}

/**
 * Clear all selections in workspace.
 */
export function wsClearSelection() {
  S.wsSelectedIds.clear();
  renderWorkspaceMode();
}

/**
 * Delete all selected workspace files.
 */
export function wsBatchDelete() {
  if (S.wsSelectedIds.size === 0) return;
  const count = S.wsSelectedIds.size;
  if (!confirm(`Delete ${count} file${count > 1 ? 's' : ''}? This cannot be undone.`)) return;
  for (const id of S.wsSelectedIds) {
    wsDeleteFile(id);
  }
  S.wsSelectedIds.clear();
  renderWorkspaceMode();
  window.addMessage(`✓ Deleted ${count} file${count > 1 ? 's' : ''}`, 'system');
}

/**
 * Duplicate all selected workspace files.
 */
export function wsBatchDuplicate() {
  if (S.wsSelectedIds.size === 0) return;
  const files = wsLoad();
  let count = 0;
  for (const id of S.wsSelectedIds) {
    const orig = files.find(f => f.id === id);
    if (!orig) continue;
    const dup = JSON.parse(JSON.stringify(orig));
    dup.id = wsId();
    dup.title = (dup.title || 'Untitled') + ' (copy)';
    dup.created = new Date().toISOString();
    dup.updated = new Date().toISOString();
    files.push(dup);
    count++;
  }
  wsSave(files);
  S.wsSelectedIds.clear();
  renderWorkspaceMode();
  window.addMessage(`✓ Duplicated ${count} file${count > 1 ? 's' : ''}`, 'system');
}

/**
 * Dispatch table for loading different workspace item types.
 */
export const wsItemLoaders = {
  doc(item) {
    S.currentDoc = null; // clear stale data
    const loaded = window.docLoadFromWorkspace(item.id);
    if (!loaded) {
      window.addMessage('Could not load document.', 'system');
      return false;
    }
    return true;
  },
  slides(item) {
    // TODO: load slide deck from workspace item
    // slideLoadFromWorkspace(item);
    return true;
  },
  sheet(item) {
    // TODO: load sheet from workspace item
    return true;
  }
};

/**
 * Load a workspace file by index and enter its mode.
 */
export function openWorkspaceItem(index) {
  const files = wsLoad();
  if (!files[index]) return;
  const item = files[index];
  const mode = item.type || 'slide';
  const targetMode = mode === 'slides' ? 'slide' : mode; // normalize 'slides' → 'slide'

  // Save current state before loading new item
  window.modeSaveCurrent();

  // Load item data via dispatch table
  const loader = wsItemLoaders[mode] || wsItemLoaders[targetMode];
  if (loader && !loader(item)) return; // loader returned false = load failed

  // Enter or refresh the target mode
  if (S.currentMode === targetMode) {
    // Already in the right mode — just refresh UI
    window.updateModeNameBar(targetMode);
    if (targetMode === 'doc') window.renderDocMode();
    else if (targetMode === 'slide') window.renderApp();
  } else {
    window.modeEnter(targetMode);
  }
}

// ═══════════════════════════════════════════
// WORKSPACE — New Doc / Sheet modals
// ═══════════════════════════════════════════

/**
 * Show the modal to create a new document.
 */
export function showWsNewDoc() {
  S.wsModalType = 'doc';
  document.getElementById('wsModalTitle').textContent = 'New Document';
  document.getElementById('wsModalContentLabel').textContent =
    'Content (paste text — each paragraph becomes a block)';
  document.getElementById('wsModalContent').placeholder =
    'Paste or type content here...\n\nEach paragraph separated by a blank line becomes a block.';
  document.getElementById('wsModalTitleInput').value = '';
  document.getElementById('wsModalContent').value = '';
  document.getElementById('wsModalOverlay').style.display = 'flex';
}

/**
 * Show the modal to create a new sheet.
 */
export function showWsNewSheet() {
  S.wsModalType = 'sheet';
  document.getElementById('wsModalTitle').textContent = 'New Sheet';
  document.getElementById('wsModalContentLabel').textContent =
    'Data (CSV or tab-separated — first row = headers)';
  document.getElementById('wsModalContent').placeholder =
    'Name,Q1,Q2,Q3,Q4\nProduct A,100,150,200,250\nProduct B,80,120,160,200';
  document.getElementById('wsModalTitleInput').value = '';
  document.getElementById('wsModalContent').value = '';
  document.getElementById('wsModalOverlay').style.display = 'flex';
}

/**
 * Close the workspace modal.
 */
export function closeWsModal() {
  document.getElementById('wsModalOverlay').style.display = 'none';
}

/**
 * Save the new document or sheet from the modal.
 */
export function saveWsModal() {
  const title = document.getElementById('wsModalTitleInput').value.trim();
  const content = document.getElementById('wsModalContent').value.trim();
  if (!content) {
    alert('Please enter some content.');
    return;
  }

  if (S.wsModalType === 'doc') {
    const doc = wsCreateDoc(title || 'Untitled Doc', content);
    window.addMessage(
      `✓ Created doc "${doc.title}" — ${doc.content.blocks.length} blocks. Mention it by name when creating slides!`,
      'system'
    );
  } else {
    const sheet = wsCreateSheet(title || 'Untitled Sheet', content);
    window.addMessage(
      `✓ Created sheet "${sheet.title}" — ${sheet.content.columns.length} columns, ${sheet.content.rows.length} rows. Reference it by name in your prompts!`,
      'system'
    );
  }
  closeWsModal();
  window.refreshFileList();
}
