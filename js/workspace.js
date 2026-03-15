// ═══════════════════════════════════════════
// WORKSPACE MODULE
// ═══════════════════════════════════════════
// Manages workspace file storage (docs, sheets, slides).
// Persists to localStorage and syncs with cloud (Supabase).

import { S, WS_STORAGE_KEY, WS_PROJECTS_KEY, WS_LINKS_KEY } from './state.js';

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
 * Create a new image in workspace.
 * @param {string} title - Image title
 * @param {string} dataUrl - Base64 data URL of the image
 * @param {object} meta - Optional metadata { mimeType, width, height, size }
 */
export function wsCreateImage(title, dataUrl, meta = {}) {
  const files = wsLoad();
  const img = {
    id: wsId(),
    type: 'image',
    title: title || 'Untitled Image',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    content: {
      dataUrl: dataUrl,
      mimeType: meta.mimeType || 'image/png',
      width: meta.width || 0,
      height: meta.height || 0,
      size: meta.size || 0
    }
  };
  files.push(img);
  wsSave(files);
  return img;
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
  if (file.type === 'image') {
    const c = file.content;
    return `[WORKSPACE IMAGE: "${file.title}" (id: ${file.id}) ${c.width}×${c.height} ${c.mimeType}]`;
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
// PROJECTS — CRUD
// ═══════════════════════════════════════════

function loadProjects() {
  try { return JSON.parse(localStorage.getItem(WS_PROJECTS_KEY) || '[]'); }
  catch(e) { return []; }
}

function saveProjects(projects) {
  try { localStorage.setItem(WS_PROJECTS_KEY, JSON.stringify(projects)); }
  catch(e) { console.warn('Projects save failed:', e); }
}

export function wsCreateProject(name, description) {
  const projects = loadProjects();
  // Auto-assign next Monet color (round-robin)
  const colorIdx = projects.length % S.wsProjectColors.length;
  const project = {
    id: 'prj_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
    name: name || 'Untitled Project',
    description: description || '',
    color: S.wsProjectColors[colorIdx].id,
    status: 'active',
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  };
  projects.push(project);
  saveProjects(projects);
  return project;
}

/** Get the Monet color object for a project */
export function wsGetProjectColor(project) {
  if (!project || !project.color) return S.wsProjectColors[0];
  return S.wsProjectColors.find(c => c.id === project.color) || S.wsProjectColors[0];
}

/** Cycle a project's color to the next Monet palette */
export function wsCycleProjectColor(projectId) {
  const project = wsGetProject(projectId);
  if (!project) return;
  const currentIdx = S.wsProjectColors.findIndex(c => c.id === project.color);
  const nextIdx = (currentIdx + 1) % S.wsProjectColors.length;
  wsUpdateProject(projectId, { color: S.wsProjectColors[nextIdx].id });
  renderWorkspaceMode();
}

export function wsGetProject(id) {
  return loadProjects().find(p => p.id === id) || null;
}

export function wsListProjects() {
  return loadProjects().filter(p => p.status !== 'archived');
}

export function wsUpdateProject(id, updates) {
  const projects = loadProjects();
  const idx = projects.findIndex(p => p.id === id);
  if (idx === -1) return null;
  Object.assign(projects[idx], updates, { modified: new Date().toISOString() });
  saveProjects(projects);
  return projects[idx];
}

export function wsDeleteProject(id) {
  const projects = loadProjects().filter(p => p.id !== id);
  saveProjects(projects);
  // Also remove all links to this project
  const links = loadLinks().filter(l => l.projectId !== id);
  saveLinks(links);
  // If this was the active project, clear it
  if (S.wsActiveProjectId === id) {
    S.wsActiveProjectId = null;
    S.wsView = 'projects';
  }
}

export function wsArchiveProject(id) {
  wsUpdateProject(id, { status: 'archived' });
}

/** Rename a project via prompt */
export function wsRenameProject(id) {
  const project = wsGetProject(id);
  if (!project) return;
  const name = prompt('Rename project:', project.name);
  if (name && name.trim() && name.trim() !== project.name) {
    wsUpdateProject(id, { name: name.trim() });
    renderWorkspaceMode();
  }
}

/** Edit project description via prompt */
export function wsEditProjectDesc(id) {
  const project = wsGetProject(id);
  if (!project) return;
  const desc = prompt('Project description:', project.description || '');
  if (desc !== null) {
    wsUpdateProject(id, { description: desc.trim() });
    renderWorkspaceMode();
  }
}

/** Show a picker to add (link) existing files to a project */
export function wsShowAddFilePicker(projectId) {
  const allFiles = wsLoad();
  const linkedFiles = wsGetProjectFiles(projectId);
  const linkedIds = new Set(linkedFiles.map(f => f.id));
  const unlinked = allFiles.filter(f => !linkedIds.has(f.id));

  if (unlinked.length === 0) {
    window.addMessage('All files are already linked to this project.', 'system');
    return;
  }

  const needsSearch = unlinked.length > 5;
  let html = `<div class="ws-link-picker">
    <div class="ws-link-picker-title">Add files to project:</div>
    ${needsSearch ? `<input class="ws-picker-search" type="text" placeholder="Search files..." oninput="wsFilterPickerList(this)" autofocus>` : ''}
    <div class="ws-link-picker-list" id="wsLinkPickerList">`;
  for (const f of unlinked) {
    const typeLabel = (f.type || 'slide').charAt(0).toUpperCase() + (f.type || 'slide').slice(1);
    html += `<label class="ws-link-picker-item" data-name="${escapeHtml((f.title||'').toLowerCase())}">
      <input type="checkbox" onchange="wsToggleFileLink('${f.id}','${projectId}',this.checked)">
      <span>${escapeHtml(f.title || 'Untitled')}</span>
      <span class="ws-link-count">${typeLabel}</span>
    </label>`;
  }
  html += `</div>
    <button class="ws-link-picker-close" onclick="closeLinkPicker();renderWorkspaceMode()">Done</button>
  </div>`;

  // Show in modal overlay
  const overlay = document.getElementById('wsModalOverlay');
  if (overlay) {
    overlay.querySelector('.ws-modal-content').innerHTML = html;
    overlay.style.display = 'flex';
  }
}

// ═══════════════════════════════════════════
// FILE-LINKS — Many-to-Many
// ═══════════════════════════════════════════

function loadLinks() {
  try { return JSON.parse(localStorage.getItem(WS_LINKS_KEY) || '[]'); }
  catch(e) { return []; }
}

function saveLinks(links) {
  try { localStorage.setItem(WS_LINKS_KEY, JSON.stringify(links)); }
  catch(e) { console.warn('Links save failed:', e); }
}

/** Link a file to a project */
export function wsLinkFile(fileId, projectId, note) {
  const links = loadLinks();
  // Prevent duplicate
  if (links.some(l => l.fileId === fileId && l.projectId === projectId)) return null;
  const link = {
    fileId,
    projectId,
    linkedAt: new Date().toISOString(),
    note: note || ''
  };
  links.push(link);
  saveLinks(links);
  // Touch project modified time
  wsUpdateProject(projectId, {});
  return link;
}

/** Unlink a file from a project */
export function wsUnlinkFile(fileId, projectId) {
  const links = loadLinks().filter(l => !(l.fileId === fileId && l.projectId === projectId));
  saveLinks(links);
}

/** Get all files linked to a project */
export function wsGetProjectFiles(projectId) {
  const links = loadLinks().filter(l => l.projectId === projectId);
  const files = wsLoad();
  return links.map(l => {
    const file = files.find(f => f.id === l.fileId);
    return file ? { ...file, _link: l } : null;
  }).filter(Boolean);
}

/** Get all projects a file belongs to */
export function wsGetFileProjects(fileId) {
  const links = loadLinks().filter(l => l.fileId === fileId);
  const projects = loadProjects();
  return links.map(l => {
    const proj = projects.find(p => p.id === l.projectId);
    return proj ? { ...proj, _link: l } : null;
  }).filter(Boolean);
}

/** Get all unlinked files (not in any project) */
export function wsGetUnlinkedFiles() {
  const links = loadLinks();
  const linkedFileIds = new Set(links.map(l => l.fileId));
  return wsLoad().filter(f => !linkedFileIds.has(f.id));
}

/** Get project file count */
export function wsProjectFileCount(projectId) {
  return loadLinks().filter(l => l.projectId === projectId).length;
}

// ═══════════════════════════════════════════
// PROJECT-SCOPED AI CONTEXT
// ═══════════════════════════════════════════

/**
 * Build full context string for a project (all linked files serialized).
 * Used by AI module to inject into LLM prompts.
 */
export function wsProjectContext(projectId) {
  if (!projectId) return '';
  const project = wsGetProject(projectId);
  if (!project) return '';
  const files = wsGetProjectFiles(projectId);
  if (files.length === 0) return '';
  let ctx = `[PROJECT CONTEXT: "${project.name}" (${files.length} files)]\n`;
  if (project.description) ctx += `Description: ${project.description}\n`;
  ctx += '---\n';
  for (const f of files) {
    ctx += wsFileToContext(f) + '\n---\n';
  }
  return ctx;
}

/**
 * Get the active project context for AI injection.
 * Returns empty string if no project is active.
 */
export function wsGetActiveProjectContext() {
  return wsProjectContext(S.wsActiveProjectId);
}

/**
 * Set the active project (for AI context scoping).
 */
export function wsSetActiveProject(projectId) {
  S.wsActiveProjectId = projectId;
  // Notify user
  if (projectId) {
    const proj = wsGetProject(projectId);
    if (proj) {
      const fileCount = wsProjectFileCount(projectId);
      window.addMessage(`📁 Working in project: "${proj.name}" (${fileCount} file${fileCount !== 1 ? 's' : ''} in context)`, 'system');
    }
  }
}

/**
 * Clear active project context.
 */
export function wsClearActiveProject() {
  S.wsActiveProjectId = null;
  window.addMessage('📁 Project context cleared', 'system');
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
 * Set the workspace navigation view.
 */
export function wsSetView(view) {
  S.wsView = view;
  if (view !== 'project-detail') S.wsActiveProjectId = null;
  S.wsSelectedIds.clear();
  renderWorkspaceMode();
}

/**
 * Open a project detail view.
 */
export function wsOpenProject(projectId) {
  S.wsActiveProjectId = projectId;
  S.wsView = 'project-detail';
  S.wsSelectedIds.clear();
  renderWorkspaceMode();
}

/**
 * Show project create modal (reuses ws modal).
 */
export function showWsNewProject() {
  const name = prompt('Project name:');
  if (!name || !name.trim()) return;
  const desc = prompt('Description (optional):') || '';
  const proj = wsCreateProject(name.trim(), desc.trim());
  window.addMessage(`✓ Created project "${proj.name}"`, 'system');
  wsOpenProject(proj.id);
}

/** Toggle "New File" dropdown */
export function wsToggleNewMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('wsNewMenu');
  if (!menu) return;
  const isOpen = menu.classList.contains('show');
  menu.classList.toggle('show', !isOpen);
  if (!isOpen) {
    // Close on next click anywhere
    const close = () => { menu.classList.remove('show'); document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 0);
  }
}

/** Create a new file of specific type and open it */
export function wsNewFile(type) {
  // Close menu
  const menu = document.getElementById('wsNewMenu');
  if (menu) menu.classList.remove('show');

  if (type === 'slide') {
    window.enterSlideMode();
  } else if (type === 'doc') {
    window.enterDocMode();
  } else if (type === 'sheet') {
    window.enterSheetMode ? window.enterSheetMode() : window.addMessage('Sheet mode coming soon!', 'system');
  } else if (type === 'image') {
    wsPickImageFile();
  }
}

/**
 * Open a file picker for image upload.
 */
export function wsPickImageFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    for (const file of files) {
      wsHandleImageFile(file);
    }
  };
  input.click();
}

/**
 * Process an image File object and add it to workspace.
 * Resizes large images and converts to data URL.
 */
export function wsHandleImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;

  // Max image size: 2MB after encoding (to keep localStorage manageable)
  const MAX_DIMENSION = 1920;
  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;

      // Downscale if too large
      if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      // Draw to canvas for resizing + compression
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      // Try JPEG first for photos (smaller), fallback to PNG
      let dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      if (dataUrl.length > MAX_FILE_SIZE) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      }
      if (dataUrl.length > MAX_FILE_SIZE) {
        window.addMessage('Image too large even after compression. Try a smaller image.', 'system');
        return;
      }

      const title = file.name.replace(/\.[^.]+$/, '') || 'Untitled Image';
      const created = wsCreateImage(title, dataUrl, {
        mimeType: 'image/jpeg',
        width: w,
        height: h,
        size: dataUrl.length
      });

      window.addMessage(`✓ Added image "${created.title}" (${w}×${h})`, 'system');
      if (S.currentMode === 'workspace') renderWorkspaceMode();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/**
 * Show link-file-to-project picker.
 */
export function wsShowLinkPicker(fileId) {
  const projects = wsListProjects();
  const fileProjects = wsGetFileProjects(fileId);
  const linkedIds = new Set(fileProjects.map(p => p.id));

  if (projects.length === 0) {
    if (confirm('No projects yet. Create one now?')) {
      showWsNewProject();
    }
    return;
  }

  const file = wsGetFile(fileId);
  const fname = file ? file.title : fileId;
  const needsSearch = projects.length > 5;

  let html = `<div class="ws-link-picker">
    <div class="ws-link-picker-title">Link "${escapeHtml(fname)}" to projects:</div>
    ${needsSearch ? `<input class="ws-picker-search" type="text" placeholder="Search projects..." oninput="wsFilterPickerList(this)" autofocus>` : ''}
    <div class="ws-link-picker-list" id="wsLinkPickerList">`;
  for (const p of projects) {
    const checked = linkedIds.has(p.id) ? 'checked' : '';
    const c = wsGetProjectColor(p);
    html += `<label class="ws-link-picker-item" data-name="${escapeHtml(p.name.toLowerCase())}">
      <input type="checkbox" ${checked} onchange="wsToggleFileLink('${fileId}','${p.id}',this.checked)">
      <span class="ws-picker-dot" style="background:${c.dot}"></span>
      <span class="ws-picker-name">${escapeHtml(p.name)}</span>
      <span class="ws-link-count">${wsProjectFileCount(p.id)} files</span>
    </label>`;
  }
  html += `</div>
    <div class="ws-link-picker-footer">
      <button class="ws-link-picker-new" onclick="wsQuickNewProjectAndLink('${fileId}')">+ New Project</button>
      <button class="ws-link-picker-close" onclick="closeLinkPicker()">Done</button>
    </div>
  </div>`;

  let overlay = document.getElementById('wsLinkPickerOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'wsLinkPickerOverlay';
    overlay.className = 'ws-modal-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) closeLinkPicker(); };
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="ws-modal">${html}</div>`;
  overlay.style.display = 'flex';
  // Auto-focus search if present
  const searchEl = overlay.querySelector('.ws-picker-search');
  if (searchEl) setTimeout(() => searchEl.focus(), 50);
}

/** Filter link picker list items by search query */
export function wsFilterPickerList(inputEl) {
  const q = (inputEl.value || '').toLowerCase().trim();
  const items = document.querySelectorAll('#wsLinkPickerList .ws-link-picker-item');
  items.forEach(item => {
    const name = item.getAttribute('data-name') || '';
    item.style.display = name.includes(q) ? '' : 'none';
  });
}

export function closeLinkPicker() {
  const overlay = document.getElementById('wsLinkPickerOverlay');
  if (overlay) overlay.style.display = 'none';
  // Refresh: workspace view or topbar project info
  if (S.currentMode === 'workspace') {
    renderWorkspaceMode();
  } else {
    // Refresh topbar project badge
    const projArea = document.getElementById('topbarProjectArea');
    if (projArea && window.wsRenderTopbarProjectInfo) {
      projArea.innerHTML = window.wsRenderTopbarProjectInfo();
    }
  }
}

export function wsToggleFileLink(fileId, projectId, checked) {
  if (checked) wsLinkFile(fileId, projectId);
  else wsUnlinkFile(fileId, projectId);
}

export function wsQuickNewProjectAndLink(fileId) {
  const name = prompt('New project name:');
  if (!name || !name.trim()) return;
  const proj = wsCreateProject(name.trim());
  wsLinkFile(fileId, proj.id);
  closeLinkPicker();
  window.addMessage(`✓ Created project "${proj.name}" and linked file`, 'system');
}

/**
 * Render the workspace mode UI with multi-view navigation.
 */
export function renderWorkspaceMode() {
  const canvas = document.getElementById('workspaceCanvas');
  if (!canvas) return;

  const view = S.wsView || 'recent';

  // Build navigation tabs
  const tabs = [
    { id: 'recent', label: 'Recent', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
    { id: 'projects', label: 'Projects', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' },
    { id: 'all', label: 'All Files', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
    { id: 'unlinked', label: 'Unlinked', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71"/><line x1="8" y1="2" x2="8" y2="5"/><line x1="2" y1="8" x2="5" y2="8"/><line x1="16" y1="19" x2="16" y2="22"/><line x1="19" y1="16" x2="22" y2="16"/></svg>' }
  ];
  const navHtml = `<div class="ws-nav">
    ${tabs.map(t => `<button class="ws-nav-tab${view === t.id ? ' active' : ''}" onclick="wsSetView('${t.id}')">${t.icon} ${t.label}</button>`).join('')}
  </div>`;

  // Active project badge
  let projectBadge = '';
  if (S.wsActiveProjectId && view !== 'project-detail') {
    const proj = wsGetProject(S.wsActiveProjectId);
    if (proj) {
      const c = wsGetProjectColor(proj);
      const fCount = wsProjectFileCount(proj.id);
      projectBadge = `<div class="ws-project-badge" style="background:${c.bg};border-color:${c.border}" onclick="wsOpenProject('${proj.id}')">
        <span class="ws-tag-dot" style="background:${c.dot}"></span>
        <span style="color:${c.text}">Working in <strong>${escapeHtml(proj.name)}</strong></span>
        <span style="color:${c.text};opacity:0.6;font-size:10px;">${fCount} file${fCount!==1?'s':''} in context</span>
        <button onclick="event.stopPropagation();wsClearActiveProject()" title="Clear project context" style="color:${c.text}">✕</button>
      </div>`;
    }
  }

  // Batch bar
  let batchHtml = '';
  if (S.wsSelectedIds.size > 0) {
    const projects = wsListProjects();
    let moveMenu = '';
    if (projects.length > 0) {
      moveMenu = `<div class="ws-new-dropdown">
        <button class="ws-batch-btn" onclick="wsToggleBatchMoveMenu(event)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Move to... ▾</button>
        <div class="ws-new-menu" id="wsBatchMoveMenu">${projects.map(p => {
          const c = wsGetProjectColor(p);
          return `<button class="ws-new-menu-item" onclick="wsBatchMoveToProject('${p.id}')"><span class="ws-tag-dot" style="background:${c.dot};width:8px;height:8px;flex-shrink:0"></span> ${escapeHtml(p.name)}</button>`;
        }).join('')}</div>
      </div>`;
    }
    batchHtml = `<div class="ws-batch-bar">
      <span class="ws-batch-count">${S.wsSelectedIds.size} selected</span>
      <button class="ws-batch-btn" onclick="wsSelectAll()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> All</button>
      ${moveMenu}
      <button class="ws-batch-btn" onclick="wsBatchUnlink()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71"/></svg> Unlink</button>
      <button class="ws-batch-btn" onclick="wsBatchDuplicate()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Duplicate</button>
      <button class="ws-batch-btn danger" onclick="wsBatchDelete()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete</button>
      <button class="ws-batch-cancel" onclick="wsClearSelection()">✕</button>
    </div>`;
  }

  // Content based on view
  let contentHtml = '';
  if (view === 'project-detail') {
    contentHtml = renderProjectDetailView();
  } else if (view === 'projects') {
    contentHtml = renderProjectsListView();
  } else {
    // recent / all / unlinked — file list views
    contentHtml = renderFileListView(view);
  }

  canvas.innerHTML = `
    <div class="ws-page">
      <div class="ws-header">
        <div class="ws-title">Workspace</div>
        <div class="ws-header-actions">
          <div class="ws-new-dropdown">
            <button class="ws-new-btn" onclick="wsToggleNewMenu(event)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New File ▾
            </button>
            <div class="ws-new-menu" id="wsNewMenu">
              <button class="ws-new-menu-item" onclick="wsNewFile('slide')"><span class="ws-nm-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span> Slide Deck</button>
              <button class="ws-new-menu-item" onclick="wsNewFile('doc')"><span class="ws-nm-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span> Document</button>
              <button class="ws-new-menu-item" onclick="wsNewFile('sheet')"><span class="ws-nm-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg></span> Spreadsheet</button>
              <button class="ws-new-menu-item" onclick="wsNewFile('image')"><span class="ws-nm-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span> Image</button>
            </div>
          </div>
          <button class="ws-new-btn project" onclick="showWsNewProject()" style="font-size:13px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            New Project
          </button>
        </div>
      </div>
      ${projectBadge}
      ${navHtml}
      ${batchHtml}
      ${(view !== 'projects' && view !== 'project-detail') ? renderSearchAndSort() : ''}
      <div class="ws-content">${contentHtml}</div>
    </div>
  `;

  // Init drag-drop & paste handlers
  wsInitDragDrop();
  wsInitPasteHandler();
}

/** Toggle file type filter */
export function wsToggleTypeFilter(type) {
  S.wsTypeFilters[type] = !S.wsTypeFilters[type];
  // Ensure at least one is checked
  if (!S.wsTypeFilters.slide && !S.wsTypeFilters.doc && !S.wsTypeFilters.sheet && !S.wsTypeFilters.image) {
    S.wsTypeFilters[type] = true; // revert — can't uncheck all
  }
  renderWorkspaceMode();
}

/** Render file type filter checkboxes */
function renderTypeFilters() {
  const f = S.wsTypeFilters;
  return `<div class="ws-filters">
    <span class="ws-filter-label">Show:</span>
    <label class="ws-filter-check${f.slide ? ' active' : ''}">
      <input type="checkbox" ${f.slide ? 'checked' : ''} onchange="wsToggleTypeFilter('slide')"> Slides
    </label>
    <label class="ws-filter-check${f.doc ? ' active' : ''}">
      <input type="checkbox" ${f.doc ? 'checked' : ''} onchange="wsToggleTypeFilter('doc')"> Docs
    </label>
    <label class="ws-filter-check${f.sheet ? ' active' : ''}">
      <input type="checkbox" ${f.sheet ? 'checked' : ''} onchange="wsToggleTypeFilter('sheet')"> Sheets
    </label>
    <label class="ws-filter-check${f.image ? ' active' : ''}">
      <input type="checkbox" ${f.image ? 'checked' : ''} onchange="wsToggleTypeFilter('image')"> Images
    </label>
  </div>`;
}

/** Render file list for recent / all / unlinked views */
function renderFileListView(view) {
  let files;
  if (view === 'unlinked') {
    files = wsGetUnlinkedFiles();
  } else {
    files = wsLoad();
  }

  // Apply type filters
  const f = S.wsTypeFilters;
  files = files.filter(item => {
    const t = item.type || 'slide';
    return f[t] !== false;
  });

  // Apply search filter
  const q = (S.wsSearchQuery || '').trim().toLowerCase();
  if (q) {
    files = files.filter(item => {
      const title = (item.title || '').toLowerCase();
      const type = (item.type || 'slide').toLowerCase();
      // Also search project names
      const projNames = wsGetFileProjects(item.id).map(p => p.name.toLowerCase()).join(' ');
      return title.includes(q) || type.includes(q) || projNames.includes(q);
    });
  }

  // Apply sort
  const sortBy = S.wsSortBy || 'date';
  const asc = S.wsSortAsc;
  files.sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'date') {
      const da = new Date(a.updated || a.created || 0).getTime();
      const db = new Date(b.updated || b.created || 0).getTime();
      cmp = db - da;
    } else if (sortBy === 'name') {
      cmp = (a.title || '').localeCompare(b.title || '');
    } else if (sortBy === 'type') {
      cmp = (a.type || 'slide').localeCompare(b.type || 'slide');
      if (cmp === 0) cmp = (a.title || '').localeCompare(b.title || '');
    }
    return asc ? cmp : -cmp;
  });

  if (view === 'recent') {
    files = files.slice(0, 20);
  }

  const filtersHtml = renderTypeFilters();
  const totalCount = files.length;

  if (files.length === 0) {
    const msg = q
      ? `No files matching "${escapeHtml(q)}"`
      : view === 'unlinked'
        ? 'All files are linked to projects. Nice!'
        : 'No files yet. Create one to get started.';
    return `${filtersHtml}<div class="ws-empty"><div class="ws-empty-text">${msg}</div></div>`;
  }

  const countHtml = q ? `<div class="ws-result-count">${totalCount} result${totalCount !== 1 ? 's' : ''}</div>` : '';
  return `${filtersHtml}${countHtml}<div class="ws-file-list">${files.map(f => renderFileCard(f)).join('')}</div>`;
}

/** Render a single file card */
function renderFileCard(item) {
  const allFiles = wsLoad();
  const idx = allFiles.findIndex(f => f.id === item.id);
  const type = item.type || 'slide';
  const isSelected = S.wsSelectedIds.has(item.id);
  const selClass = isSelected ? ' ws-selected' : '';
  const date = item.updated ? new Date(item.updated).toLocaleDateString() : '';
  const preview = wsRenderFilePreview(item);
  const status = item.status || 'draft';

  // Project tags with Monet colors
  const fileProjects = wsGetFileProjects(item.id);
  let tagsHtml = '';
  if (fileProjects.length > 0) {
    tagsHtml = `<div class="ws-file-tags">${fileProjects.map(p => {
      const c = wsGetProjectColor(p);
      return `<span class="ws-file-tag" style="background:${c.bg};border-color:${c.border};color:${c.text}" onclick="event.stopPropagation();wsOpenProject('${p.id}')" title="${escapeHtml(p.name)}"><span class="ws-tag-dot" style="background:${c.dot}"></span>${escapeHtml(p.name)}</span>`;
    }).join('')}</div>`;
  }

  return `<div class="ws-file-card${selClass}" data-ws-id="${item.id}">
    <div class="ws-check" onclick="event.stopPropagation();wsToggleSelect('${item.id}')">${isSelected ? '✓' : ''}</div>
    <div onclick="openWorkspaceItem(${idx})" style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;cursor:pointer;">
      ${preview}
      <div class="ws-file-info">
        <div class="ws-file-name">${escapeHtml(item.title || 'Untitled')}</div>
        <div class="ws-file-meta">
          <span class="ws-status-dot ${status}"></span>
          ${type.charAt(0).toUpperCase() + type.slice(1)} · ${date}
        </div>
        ${tagsHtml}
      </div>
    </div>
    <div class="ws-file-actions">
      <button class="ws-link-btn${fileProjects.length > 0 ? ' has-links' : ''}" onclick="event.stopPropagation();wsShowLinkPicker('${item.id}')" title="${fileProjects.length > 0 ? 'Linked to ' + fileProjects.length + ' project(s) — click to manage' : 'Link to project'}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>
    </div>
  </div>`;
}

/** Render projects list view */
function renderProjectsListView() {
  const allProjects = wsListProjects();
  if (allProjects.length === 0) {
    return `<div class="ws-empty">
      <div class="ws-empty-text">No projects yet</div>
      <button class="ws-new-btn project" onclick="showWsNewProject()" style="margin-top:12px;">Create Your First Project</button>
    </div>`;
  }

  // Filter by search query if present
  const q = (S.wsProjectSearch || '').toLowerCase().trim();
  const projects = q
    ? allProjects.filter(p => (p.name||'').toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q))
    : allProjects;

  // Search bar (show when > 5 projects)
  const searchHtml = allProjects.length > 5
    ? `<div class="ws-project-search-bar">
        <input class="ws-project-search-input" type="text" placeholder="Search ${allProjects.length} projects..." value="${escapeHtml(S.wsProjectSearch||'')}" oninput="wsSetProjectSearch(this.value)">
        ${q ? `<button class="ws-project-search-clear" onclick="wsSetProjectSearch('')">✕</button>` : ''}
      </div>`
    : '';

  const noResults = q && projects.length === 0
    ? `<div class="ws-empty"><div class="ws-empty-text">No projects matching "${escapeHtml(q)}"</div></div>`
    : '';

  return `${searchHtml}${noResults}<div class="ws-project-list">${projects.map(p => {
    const fileCount = wsProjectFileCount(p.id);
    const status = p.status || 'active';
    const date = p.modified ? new Date(p.modified).toLocaleDateString() : '';
    const isActive = S.wsActiveProjectId === p.id;
    const c = wsGetProjectColor(p);
    const statusLabel = { active:'Active', paused:'Paused', done:'Done' }[status] || status;
    return `<div class="ws-project-card${isActive ? ' active-context' : ''}" style="border-left:3px solid ${c.dot}" onclick="wsOpenProject('${p.id}')">
      <div class="ws-project-icon" style="background:${c.bg};color:${c.dot}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      </div>
      <div class="ws-project-info">
        <div class="ws-project-name">${escapeHtml(p.name)}</div>
        <div class="ws-project-meta">
          <span class="ws-status-badge ${status}">${statusLabel}</span>
          ${fileCount} file${fileCount !== 1 ? 's' : ''} · ${date}
        </div>
        ${p.description ? `<div class="ws-project-desc">${escapeHtml(p.description)}</div>` : ''}
      </div>
      <div class="ws-project-actions">
        <button class="ws-color-btn" onclick="event.stopPropagation();wsCycleProjectColor('${p.id}')" title="Change color"><span class="ws-color-dot" style="background:${c.dot}"></span></button>
        <button class="ws-ctx-btn${isActive ? ' active' : ''}" onclick="event.stopPropagation();${isActive ? 'wsClearActiveProject()' : `wsSetActiveProject('${p.id}')`}" title="${isActive ? 'Clear AI context' : 'Set as AI context'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 0 1 4 4c0 1.1-.5 2.1-1.2 2.8A6 6 0 0 1 18 14v1a3 3 0 0 1-3 3h-1v3h-4v-3H9a3 3 0 0 1-3-3v-1a6 6 0 0 1 3.2-5.2A4 4 0 0 1 8 6a4 4 0 0 1 4-4z"/></svg>${isActive ? ' Active' : ''}
        </button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

/** Render project detail view (files in a project) */
function renderProjectDetailView() {
  const project = wsGetProject(S.wsActiveProjectId);
  if (!project) {
    S.wsView = 'projects';
    return renderProjectsListView();
  }

  const files = wsGetProjectFiles(S.wsActiveProjectId);
  const isActive = S.wsActiveProjectId === project.id;

  let filesHtml;
  if (files.length === 0) {
    filesHtml = `<div class="ws-empty">
      <div class="ws-empty-text">No files linked yet</div>
      <div class="ws-empty-hint">Use the link button on any file to link it here, or create a new file.</div>
    </div>`;
  } else {
    filesHtml = `<div class="ws-file-list">${files.map(f => renderProjectFileCard(f, project.id)).join('')}</div>`;
  }

  const c = wsGetProjectColor(project);

  // File count breakdown by type
  const typeCounts = {};
  for (const f of files) {
    const t = f.type || 'slide';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  const typeLabels = { slide:'slide', slides:'slide', doc:'doc', sheet:'sheet', image:'image' };
  const breakdownParts = Object.entries(typeCounts).map(([t, n]) => {
    const label = typeLabels[t] || t;
    return `${n} ${label}${n > 1 ? 's' : ''}`;
  });
  const statsText = files.length === 0
    ? 'No files'
    : breakdownParts.join(', ');

  return `<div class="ws-project-detail">
    <div class="ws-pd-header" style="border-left:3px solid ${c.dot};padding-left:16px;">
      <button class="ws-back-btn" onclick="wsSetView('projects')">← Projects</button>
      <div class="ws-pd-title-row">
        <div class="ws-pd-title" onclick="wsRenameProject('${project.id}')" title="Click to rename">${escapeHtml(project.name)}<svg class="ws-pd-edit-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
        <button class="ws-color-btn" onclick="wsCycleProjectColor('${project.id}')" title="Change color"><span class="ws-color-dot" style="background:${c.dot}"></span></button>
      </div>
      <div class="ws-pd-actions-row">
        <button class="ws-ctx-btn${isActive ? ' active' : ''}" onclick="${isActive ? 'wsClearActiveProject()' : `wsSetActiveProject('${project.id}')`}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 0 1 4 4c0 1.1-.5 2.1-1.2 2.8A6 6 0 0 1 18 14v1a3 3 0 0 1-3 3h-1v3h-4v-3H9a3 3 0 0 1-3-3v-1a6 6 0 0 1 3.2-5.2A4 4 0 0 1 8 6a4 4 0 0 1 4-4z"/></svg> ${isActive ? 'AI Context Active' : 'Use as AI Context'}
        </button>
        <div class="ws-pd-status-group">
          <button class="ws-status-pill${project.status==='active'?' selected':''}" onclick="wsUpdateProject('${project.id}',{status:'active'});renderWorkspaceMode()">Active</button>
          <button class="ws-status-pill${project.status==='paused'?' selected':''}" onclick="wsUpdateProject('${project.id}',{status:'paused'});renderWorkspaceMode()">Paused</button>
          <button class="ws-status-pill${project.status==='done'?' selected':''}" onclick="wsUpdateProject('${project.id}',{status:'done'});renderWorkspaceMode()">Done</button>
        </div>
        <button class="ws-pd-btn danger" onclick="if(confirm('Delete this project? Files will not be deleted.'))wsDeleteProject('${project.id}')">Delete</button>
      </div>
      <div class="ws-pd-desc-wrap" onclick="wsEditProjectDesc('${project.id}')" title="Click to edit description">
        ${project.description
          ? `<div class="ws-pd-desc">${escapeHtml(project.description)}</div>`
          : `<div class="ws-pd-desc ws-pd-desc-placeholder">Add a description...</div>`}
        <svg class="ws-pd-edit-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </div>
      <div class="ws-pd-stats">${statsText} · Created ${new Date(project.created).toLocaleDateString()}</div>
    </div>
    <div class="ws-pd-file-header">
      <span class="ws-pd-file-label">Linked Files (${files.length})</span>
      <div class="ws-pd-file-header-actions">
        ${files.length > 0 ? `<button class="ws-pd-unlink-all-btn" onclick="if(confirm('Unlink all ${files.length} files from this project?'))wsUnlinkAllFromProject('${project.id}')">Unlink All</button>` : ''}
        <button class="ws-pd-add-file-btn" onclick="wsShowAddFilePicker('${project.id}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add File
        </button>
      </div>
    </div>
    ${filesHtml}
  </div>`;
}

/** Render a file card inside project detail (with unlink button) */
function renderProjectFileCard(item, projectId) {
  const allFiles = wsLoad();
  const idx = allFiles.findIndex(f => f.id === item.id);
  const type = item.type || 'slide';
  const date = item.updated ? new Date(item.updated).toLocaleDateString() : '';
  const preview = wsRenderFilePreview(item);
  const status = item.status || 'draft';

  return `<div class="ws-file-card" data-ws-id="${item.id}">
    <div onclick="openWorkspaceItem(${idx})" style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;cursor:pointer;">
      ${preview}
      <div class="ws-file-info">
        <div class="ws-file-name">${escapeHtml(item.title || 'Untitled')}</div>
        <div class="ws-file-meta">
          <span class="ws-status-dot ${status}"></span>
          ${type.charAt(0).toUpperCase() + type.slice(1)} · ${date}
        </div>
      </div>
    </div>
    <div class="ws-file-actions">
      <button class="ws-unlink-btn" onclick="event.stopPropagation();wsUnlinkAndRefresh('${item.id}','${projectId}')" title="Unlink from project">✕</button>
    </div>
  </div>`;
}

/** Unlink a file from project and refresh the view */
export function wsUnlinkAndRefresh(fileId, projectId) {
  wsUnlinkFile(fileId, projectId);
  renderWorkspaceMode();
}

/** Unlink ALL files from a project */
export function wsUnlinkAllFromProject(projectId) {
  const files = wsGetProjectFiles(projectId);
  for (const f of files) {
    wsUnlinkFile(f.id, projectId);
  }
  renderWorkspaceMode();
  window.addMessage(`✓ Unlinked ${files.length} file${files.length > 1 ? 's' : ''} from project`, 'system');
}

/**
 * Get current file's ID (the file being edited in slide/doc/sheet mode).
 * Returns null if not editing a saved workspace file.
 */
export function wsGetCurrentFileId() {
  return S._wsCurrentFileId || null;
}

/**
 * Render topbar project badge HTML (called from ui.js).
 * Shows the file's linked project(s) and a link button.
 */
export function wsRenderTopbarProjectInfo() {
  const fileId = wsGetCurrentFileId();
  if (!fileId) return '<button class="topbar-project-link-btn" onclick="wsShowLinkPicker()" title="Link to project" style="opacity:0.5;cursor:default" disabled><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> No file</button>';

  const fileProjects = wsGetFileProjects(fileId);
  let html = '';

  // Show project badges with Monet colors
  if (fileProjects.length > 0) {
    html += fileProjects.map(p => {
      const c = wsGetProjectColor(p);
      return `<span class="topbar-project-badge" style="background:${c.bg};border-color:${c.border}" onclick="wsOpenProject('${p.id}')" title="${escapeHtml(p.name)}"><span class="ws-tag-dot" style="background:${c.dot}"></span><span class="tpb-name" style="color:${c.text}">${escapeHtml(p.name)}</span></span>`;
    }).join('');
  }

  // Link button (flat SVG)
  html += `<button class="topbar-project-link-btn" onclick="wsShowLinkPicker('${fileId}')" title="Link to project"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> ${fileProjects.length > 0 ? 'Edit' : 'Link'}</button>`;

  return html;
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
  if (type === 'image') {
    const src = item.content?.dataUrl || '';
    if (src) {
      return `<div class="ws-file-preview img-prev">
        <img src="${src}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:4px;">
      </div>`;
    }
    return `<div class="ws-file-preview img-prev">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
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
 * Select all visible files.
 */
export function wsSelectAll() {
  const files = wsLoad();
  const f = S.wsTypeFilters;
  files.forEach(item => {
    const t = item.type || 'slide';
    if (f[t] !== false) S.wsSelectedIds.add(item.id);
  });
  renderWorkspaceMode();
}

/**
 * Batch move selected files to a project.
 */
export function wsBatchMoveToProject(projectId) {
  if (S.wsSelectedIds.size === 0) return;
  let count = 0;
  for (const fileId of S.wsSelectedIds) {
    if (!wsIsLinked(fileId, projectId)) {
      wsLinkFile(fileId, projectId);
      count++;
    }
  }
  S.wsSelectedIds.clear();
  const proj = wsGetProject(projectId);
  renderWorkspaceMode();
  window.addMessage(`✓ Linked ${count} file${count > 1 ? 's' : ''} to "${proj?.name || 'project'}"`, 'system');
}

/**
 * Toggle the batch move menu.
 */
export function wsToggleBatchMoveMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('wsBatchMoveMenu');
  if (menu) menu.classList.toggle('show');
}

/**
 * Batch unlink selected files from all projects.
 */
export function wsBatchUnlink() {
  if (S.wsSelectedIds.size === 0) return;
  let count = 0;
  for (const fileId of S.wsSelectedIds) {
    const linkedProjects = wsGetFileProjects(fileId);
    for (const p of linkedProjects) {
      wsUnlinkFile(fileId, p.id);
      count++;
    }
  }
  S.wsSelectedIds.clear();
  renderWorkspaceMode();
  window.addMessage(`✓ Unlinked ${count} link${count > 1 ? 's' : ''}`, 'system');
}

// ═══════════════════════════════════════════
// SEARCH & SORT
// ═══════════════════════════════════════════

/**
 * Render search bar and sort controls.
 */
function renderSearchAndSort() {
  const q = S.wsSearchQuery || '';
  const sortBy = S.wsSortBy || 'date';
  const asc = S.wsSortAsc;
  const arrow = asc ? '↑' : '↓';
  return `<div class="ws-search-sort">
    <div class="ws-search-wrap">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="ws-search-input" type="text" placeholder="Search files..." value="${escapeHtml(q)}" oninput="wsSetSearch(this.value)" id="wsSearchInput">
      ${q ? `<button class="ws-search-clear" onclick="wsSetSearch('');document.getElementById('wsSearchInput').value=''">✕</button>` : ''}
    </div>
    <div class="ws-sort-controls">
      <button class="ws-sort-btn${sortBy==='date'?' active':''}" onclick="wsSetSort('date')">Date ${sortBy==='date'?arrow:''}</button>
      <button class="ws-sort-btn${sortBy==='name'?' active':''}" onclick="wsSetSort('name')">Name ${sortBy==='name'?arrow:''}</button>
      <button class="ws-sort-btn${sortBy==='type'?' active':''}" onclick="wsSetSort('type')">Type ${sortBy==='type'?arrow:''}</button>
    </div>
  </div>`;
}

/**
 * Set search query and re-render.
 */
export function wsSetSearch(query) {
  S.wsSearchQuery = query;
  renderWorkspaceMode();
  // Re-focus search input after re-render
  setTimeout(() => {
    const input = document.getElementById('wsSearchInput');
    if (input) { input.focus(); input.selectionStart = input.selectionEnd = input.value.length; }
  }, 0);
}

/**
 * Set sort mode. Clicking same sort toggles direction.
 */
export function wsSetSort(by) {
  if (S.wsSortBy === by) {
    S.wsSortAsc = !S.wsSortAsc;
  } else {
    S.wsSortBy = by;
    S.wsSortAsc = by === 'name'; // name defaults A-Z, others default desc
  }
  renderWorkspaceMode();
}

/** Set project search query and re-render */
export function wsSetProjectSearch(query) {
  S.wsProjectSearch = query;
  renderWorkspaceMode();
  setTimeout(() => {
    const input = document.querySelector('.ws-project-search-input');
    if (input) { input.focus(); input.selectionStart = input.selectionEnd = input.value.length; }
  }, 0);
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
    if (!item.content || !item.content.slides || !item.content.slides.length) {
      window.addMessage('This slide deck has no content.', 'system');
      return false;
    }
    S.currentDeck = item.content;
    S.currentPreset = item.content.preset || 'clean-white';
    S.currentSlide = 0;
    S.selectedRegion = null;
    S.undoStack = [];
    S.redoStack = [];
    window.addMessage(`✓ Opened: "${item.title || 'Untitled'}" (${item.content.slides.length} slides)`, 'system');
    window.autoSave(); // persist to localStorage too
    return true;
  },
  slide(item) {
    // alias — some items stored with type:'slide' instead of 'slides'
    return wsItemLoaders.slides(item);
  },
  sheet(item) {
    // Sheet: just enter workspace with the sheet selected
    // TODO: full sheet editor
    window.addMessage(`Sheet "${item.title}" — sheet editor coming soon!`, 'system');
    return false;
  },
  image(item) {
    // Open image viewer overlay
    wsShowImageViewer(item);
    return false; // don't switch modes — stays in workspace
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

  // Track the workspace file ID for project linking from topbar
  S._wsCurrentFileId = item.id;

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

// ═══════════════════════════════════════════
// IMAGE VIEWER
// ═══════════════════════════════════════════

/**
 * Show full-screen image viewer overlay.
 */
export function wsShowImageViewer(item) {
  // Remove existing viewer if any
  wsCloseImageViewer();

  const src = item.content?.dataUrl || '';
  if (!src) return;

  const overlay = document.createElement('div');
  overlay.id = 'wsImageViewer';
  overlay.className = 'ws-img-viewer-overlay';
  overlay.innerHTML = `
    <div class="ws-img-viewer-header">
      <span class="ws-img-viewer-title">${escapeHtml(item.title)}</span>
      <span class="ws-img-viewer-meta">${item.content.width}×${item.content.height}</span>
      <button class="ws-img-viewer-close" onclick="wsCloseImageViewer()">✕</button>
    </div>
    <div class="ws-img-viewer-body">
      <img src="${src}" alt="${escapeHtml(item.title)}" class="ws-img-viewer-img">
    </div>
    <div class="ws-img-viewer-footer">
      <button class="ws-img-viewer-btn" onclick="wsImageDownload('${item.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download
      </button>
      <button class="ws-img-viewer-btn danger" onclick="if(confirm('Delete this image?')){wsDeleteFile('${item.id}');wsCloseImageViewer();renderWorkspaceMode();}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Delete
      </button>
    </div>
  `;

  // Click backdrop to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) wsCloseImageViewer();
  });

  document.body.appendChild(overlay);
}

/**
 * Close the image viewer overlay.
 */
export function wsCloseImageViewer() {
  const el = document.getElementById('wsImageViewer');
  if (el) el.remove();
}

/**
 * Download a workspace image to the user's device.
 */
export function wsImageDownload(fileId) {
  const file = wsGetFile(fileId);
  if (!file || !file.content?.dataUrl) return;
  const a = document.createElement('a');
  a.href = file.content.dataUrl;
  a.download = (file.title || 'image') + '.jpg';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ═══════════════════════════════════════════
// DRAG & DROP / PASTE IMAGE UPLOAD
// ═══════════════════════════════════════════

/**
 * Initialize workspace drag-and-drop zone.
 * Called when entering workspace mode.
 */
export function wsInitDragDrop() {
  const canvas = document.getElementById('workspaceCanvas');
  if (!canvas || canvas._wsDragDropInit) return;
  canvas._wsDragDropInit = true;

  canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    canvas.classList.add('ws-drag-over');
  });

  canvas.addEventListener('dragleave', (e) => {
    e.preventDefault();
    canvas.classList.remove('ws-drag-over');
  });

  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    canvas.classList.remove('ws-drag-over');

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    for (const file of files) {
      wsHandleImageFile(file);
    }
  });
}

/**
 * Initialize paste handler for images.
 * Listens globally for Ctrl+V with image data.
 */
export function wsInitPasteHandler() {
  if (window._wsPasteInit) return;
  window._wsPasteInit = true;

  document.addEventListener('paste', (e) => {
    // Only handle paste when in workspace mode
    if (S.currentMode !== 'workspace') return;
    // Don't capture paste if focus is in an input/textarea
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const items = Array.from(e.clipboardData?.items || []);
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) wsHandleImageFile(file);
      }
    }
  });
}
