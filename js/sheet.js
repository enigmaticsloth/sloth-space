// ═══════════════════════════════════════════════════════════════════
// sheet.js: Sheet mode — grid renderer, cell editing, formula engine
// ═══════════════════════════════════════════════════════════════════

import { S } from './state.js';

// ── Constants ──
const SHEET_MAX_UNDO = 50;
const DEFAULT_COL_WIDTH = 120;
const MAX_COL_WIDTH = 280;
const DEFAULT_ROWS = 10;
const DEFAULT_COLS = 8;

// ── ID Generator ──
let _shIdCounter = 0;
function shId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${(++_shIdCounter).toString(36)}`;
}

// ═══════════════════════════════════════════
// SHEET DATA MODEL
// ═══════════════════════════════════════════

/**
 * Create a blank sheet with default rows/cols.
 */
export function shCreateNew(title) {
  const columns = [];
  for (let c = 0; c < DEFAULT_COLS; c++) {
    columns.push({ id: shId('col'), name: colIndexToLetter(c), width: DEFAULT_COL_WIDTH });
  }
  const rows = [];
  for (let r = 0; r < DEFAULT_ROWS; r++) {
    const cells = {};
    columns.forEach(col => { cells[col.id] = ''; });
    rows.push({ id: shId('row'), cells });
  }
  return {
    title: title || 'Untitled Sheet',
    columns,
    rows,
    frozenRows: 1,
    frozenCols: 0,
  };
}

/**
 * Convert column index to letter (0=A, 1=B, ..., 25=Z, 26=AA).
 */
export function colIndexToLetter(idx) {
  let s = '';
  idx++;
  while (idx > 0) {
    idx--;
    s = String.fromCharCode(65 + (idx % 26)) + s;
    idx = Math.floor(idx / 26);
  }
  return s;
}

/**
 * Convert column letter to index (A=0, B=1, ..., Z=25, AA=26).
 */
export function letterToColIndex(letter) {
  let idx = 0;
  for (let i = 0; i < letter.length; i++) {
    idx = idx * 26 + (letter.charCodeAt(i) - 64);
  }
  return idx - 1;
}

// ═══════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════

/**
 * Main sheet renderer — called by modeEnter('sheet') and after edits.
 */
export function renderSheetMode() {
  const sh = S.sheet.current;
  if (!sh) return;

  let canvas = document.getElementById('sheetCanvas');
  if (!canvas) return;

  const { columns, rows } = sh;
  const totalCols = columns.length;
  const totalRows = rows.length;

  // Build grid template: row-header-width + col widths + add-col button
  const colWidths = columns.map(c => `${c.width || DEFAULT_COL_WIDTH}px`).join(' ');
  const gridCols = `40px ${colWidths} 32px`; // 40px row header + col widths + 32px add-col button

  let html = '';

  // Corner cell
  html += `<div class="sh-corner"></div>`;

  // Column headers
  for (let c = 0; c < totalCols; c++) {
    const col = columns[c];
    html += `<div class="sh-col-header" data-col-id="${col.id}" data-col-idx="${c}"
      oncontextmenu="event.preventDefault(); window.shColHeaderCtx(event, '${col.id}')"
      ondblclick="window.shAutoFitCol('${col.id}')">${col.name}</div>`;
  }

  // Add-column button with batch input (in header row, rightmost)
  html += `<div class="sh-add-col-btn" title="Add columns">
    <input type="number" class="sh-batch-input" id="shBatchColInput" value="1" min="1" max="50"
      onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter'){event.preventDefault();window.shBatchAddCols();}">
    <span class="sh-batch-add" onclick="window.shBatchAddCols()">+Col</span>
  </div>`;

  // Build range set for highlighting
  const rangeSet = _getRangeSet();

  // Rows
  for (let r = 0; r < totalRows; r++) {
    const row = rows[r];
    // Row header
    html += `<div class="sh-row-header" data-row-id="${row.id}" data-row-idx="${r}"
      oncontextmenu="event.preventDefault(); window.shRowHeaderCtx(event, '${row.id}')">${r + 1}</div>`;
    // Cells
    for (let c = 0; c < totalCols; c++) {
      const col = columns[c];
      const rawVal = row.cells[col.id] || '';
      const display = rawVal.startsWith('=') ? shEvalFormula(rawVal, sh) : rawVal;
      const isSelected = S.sheet.selectedCell &&
        S.sheet.selectedCell.rowId === row.id && S.sheet.selectedCell.colId === col.id;
      const isEditing = S.sheet.editingCell &&
        S.sheet.editingCell.rowId === row.id && S.sheet.editingCell.colId === col.id;
      const isInRange = rangeSet && rangeSet.has(`${row.id}:${col.id}`);
      const cls = ['sh-cell'];
      if (isSelected && !isInRange) cls.push('selected');
      if (isInRange) cls.push('in-range');
      if (isEditing) cls.push('editing');
      if (typeof display === 'object' && display.error) cls.push('error');

      const displayText = (typeof display === 'object' && display.error) ? display.error : display;

      html += `<div class="${cls.join(' ')}" data-row-id="${row.id}" data-col-id="${col.id}"
        data-row-idx="${r}" data-col-idx="${c}"
        onmousedown="window.shCellMouseDown(event, '${row.id}', '${col.id}')"
        onclick="window.shCellClick(event, '${row.id}', '${col.id}')"
        ondblclick="window.shCellDblClick(event, '${row.id}', '${col.id}')"
        oncontextmenu="event.preventDefault(); window.shCellCtx(event, '${row.id}', '${col.id}')"
        >${escHtml(String(displayText))}</div>`;
    }
    // Empty spacer for add-col column on each data row
    html += `<div class="sh-add-col-spacer"></div>`;
  }

  // Add-row button row with batch input (spans full width below data)
  html += `<div class="sh-add-row-btn" style="grid-column: 1 / -1;" title="Add rows">
    <input type="number" class="sh-batch-input" id="shBatchRowInput" value="1" min="1" max="100"
      onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter'){event.preventDefault();window.shBatchAddRows();}">
    <span class="sh-batch-add" onclick="window.shBatchAddRows()">+ Add row</span>
  </div>`;

  const grid = document.getElementById('shGrid') || canvas;
  // If shGrid doesn't exist yet, create it
  if (!document.getElementById('shGrid')) {
    const g = document.createElement('div');
    g.id = 'shGrid';
    g.className = 'sh-grid';
    canvas.appendChild(g);
  }

  const shGrid = document.getElementById('shGrid');
  shGrid.style.gridTemplateColumns = gridCols;
  shGrid.style.gridTemplateRows = `32px repeat(${totalRows}, auto) 28px`; // header + data rows + add-row button
  shGrid.innerHTML = html;
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ═══════════════════════════════════════════
// CELL SELECTION + MOUSE DRAG RANGE SELECT
// ═══════════════════════════════════════════

let _dragState = null; // { anchorRowId, anchorColId, active }

export function shCellClick(event, rowId, colId) {
  // Drag-select handles its own logic; ignore plain click if drag just ended
  if (_dragState && _dragState.justFinished) {
    _dragState.justFinished = false;
    return;
  }

  // If clicking a different cell while editing, commit first
  if (S.sheet.editingCell) {
    if (S.sheet.editingCell.rowId !== rowId || S.sheet.editingCell.colId !== colId) {
      shCommitEdit();
    }
  }

  if (event.shiftKey && S.sheet.selectedCell) {
    // Range select
    shSelectRange(S.sheet.selectedCell, { rowId, colId });
  } else {
    shSelectCell(rowId, colId);
  }
}

/**
 * Mousedown on a cell — start drag-select.
 */
export function shCellMouseDown(event, rowId, colId) {
  // Only left-click; ignore if editing the same cell
  if (event.button !== 0) return;
  if (S.sheet.editingCell &&
      S.sheet.editingCell.rowId === rowId && S.sheet.editingCell.colId === colId) return;

  // Commit any current edit
  if (S.sheet.editingCell) shCommitEdit();

  _dragState = { anchorRowId: rowId, anchorColId: colId, active: true, moved: false };
  S.sheet.selectedCell = { rowId, colId };
  S.sheet.selectedRange = null;

  // Prevent text selection during drag
  event.preventDefault();

  // Bind move/up on document (captured once per drag)
  document.addEventListener('mousemove', _onDragMove);
  document.addEventListener('mouseup', _onDragEnd);
}

function _cellFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const cell = el.closest('.sh-cell');
  if (!cell) return null;
  return { rowId: cell.dataset.rowId, colId: cell.dataset.colId };
}

function _onDragMove(e) {
  if (!_dragState || !_dragState.active) return;
  const hit = _cellFromPoint(e.clientX, e.clientY);
  if (!hit) return;

  _dragState.moved = true;
  const anchor = { rowId: _dragState.anchorRowId, colId: _dragState.anchorColId };

  // If same cell as anchor, just single-select
  if (hit.rowId === anchor.rowId && hit.colId === anchor.colId) {
    S.sheet.selectedRange = null;
    S.sheet.selectedCell = anchor;
    renderSheetMode();
    _reattachDragListeners();
    return;
  }

  S.sheet.selectedCell = anchor;
  S.sheet.selectedRange = { start: anchor, end: hit };
  renderSheetMode();
  _reattachDragListeners();
}

function _onDragEnd(e) {
  document.removeEventListener('mousemove', _onDragMove);
  document.removeEventListener('mouseup', _onDragEnd);
  if (_dragState && _dragState.moved) {
    _dragState.justFinished = true; // suppress the click event that follows mouseup
  }
  if (_dragState) _dragState.active = false;
}

/** After re-render, re-attach document listeners if drag is still active */
function _reattachDragListeners() {
  // mousemove/mouseup are on document, so they survive re-renders
}

export function shSelectCell(rowId, colId) {
  S.sheet.selectedCell = { rowId, colId };
  S.sheet.selectedRange = null;
  renderSheetMode();
}

export function shSelectRange(start, end) {
  S.sheet.selectedCell = start;
  S.sheet.selectedRange = { start, end };
  renderSheetMode();
}

export function shClearSelection() {
  S.sheet.selectedCell = null;
  S.sheet.selectedRange = null;
  S.sheet.editingCell = null;
  renderSheetMode();
}

/**
 * Helper: get the set of "rowId:colId" keys that are in the current selected range.
 */
function _getRangeSet() {
  const range = S.sheet.selectedRange;
  if (!range) return null;
  const sh = S.sheet.current;
  if (!sh) return null;

  const r1 = sh.rows.findIndex(r => r.id === range.start.rowId);
  const r2 = sh.rows.findIndex(r => r.id === range.end.rowId);
  const c1 = sh.columns.findIndex(c => c.id === range.start.colId);
  const c2 = sh.columns.findIndex(c => c.id === range.end.colId);
  if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return null;

  const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
  const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);

  const set = new Set();
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      set.add(`${sh.rows[r].id}:${sh.columns[c].id}`);
    }
  }
  return set;
}

// ═══════════════════════════════════════════
// CELL EDITING
// ═══════════════════════════════════════════

export function shCellDblClick(event, rowId, colId) {
  event.stopPropagation();
  shStartEdit(rowId, colId);
}

export function shStartEdit(rowId, colId) {
  // Commit any current edit first
  if (S.sheet.editingCell) shCommitEdit();

  S.sheet.selectedCell = { rowId, colId };
  S.sheet.editingCell = { rowId, colId };

  // Re-render to get the editing state
  renderSheetMode();

  // Find the cell and make it editable
  const cellEl = document.querySelector(`.sh-cell[data-row-id="${rowId}"][data-col-id="${colId}"]`);
  if (!cellEl) return;

  const sh = S.sheet.current;
  const row = sh.rows.find(r => r.id === rowId);
  if (!row) return;
  const rawVal = row.cells[colId] || '';

  cellEl.contentEditable = 'true';
  cellEl.textContent = rawVal; // Show raw value (including formula)
  cellEl.focus();

  // Select all text
  const range = document.createRange();
  range.selectNodeContents(cellEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  // Listen for input to show function autocomplete
  cellEl.addEventListener('input', _onCellInput);
}

function _onCellInput(e) {
  shShowFuncPicker(e.target);
}

export function shCommitEdit() {
  if (!S.sheet.editingCell) return;
  const { rowId, colId } = S.sheet.editingCell;

  const cellEl = document.querySelector(`.sh-cell[data-row-id="${rowId}"][data-col-id="${colId}"]`);
  if (!cellEl) { S.sheet.editingCell = null; return; }

  // Use innerText to preserve line breaks from Shift+Enter, but trim outer whitespace
  const newVal = (cellEl.innerText || cellEl.textContent || '').trim();
  cellEl.contentEditable = 'false';
  cellEl.removeEventListener('input', _onCellInput);
  shHideFuncPicker();

  // Check if value actually changed before pushing undo
  const sh = S.sheet.current;
  const row = sh ? sh.rows.find(r => r.id === rowId) : null;
  const oldVal = row ? (row.cells[colId] || '') : '';
  if (oldVal !== newVal) shPushUndo();

  shSetCellValue(rowId, colId, newVal);
  S.sheet.editingCell = null;
  renderSheetMode();
}

export function shCancelEdit() {
  if (!S.sheet.editingCell) return;
  const { rowId, colId } = S.sheet.editingCell;
  const cellEl = document.querySelector(`.sh-cell[data-row-id="${rowId}"][data-col-id="${colId}"]`);
  if (cellEl) {
    cellEl.contentEditable = 'false';
    cellEl.removeEventListener('input', _onCellInput);
  }
  shHideFuncPicker();
  S.sheet.editingCell = null;
  renderSheetMode();
}

export function shSetCellValue(rowId, colId, val) {
  const sh = S.sheet.current;
  if (!sh) return;
  const row = sh.rows.find(r => r.id === rowId);
  if (!row) return;

  const oldVal = row.cells[colId] || '';
  if (oldVal === val) return; // no change

  row.cells[colId] = val;
  sh.updated = new Date().toISOString();
  shAutoSave();

  // Rebuild deps if it's a formula
  if (val.startsWith('=') || oldVal.startsWith('=')) {
    shBuildDeps(shCellKey(rowId, colId));
  }

  // Recalc downstream
  shRecalc(shCellKey(rowId, colId));
}

// ═══════════════════════════════════════════
// KEYBOARD NAVIGATION
// ═══════════════════════════════════════════

/**
 * Navigate selection in a direction. Called from keys.js dispatch table.
 */
export function shNavigate(dir) {
  const sh = S.sheet.current;
  if (!sh || !S.sheet.selectedCell) return;

  const { rowId, colId } = S.sheet.selectedCell;
  const rowIdx = sh.rows.findIndex(r => r.id === rowId);
  const colIdx = sh.columns.findIndex(c => c.id === colId);
  if (rowIdx < 0 || colIdx < 0) return;

  let newRow = rowIdx, newCol = colIdx;
  if (dir === 'up') newRow = Math.max(0, rowIdx - 1);
  else if (dir === 'down') newRow = Math.min(sh.rows.length - 1, rowIdx + 1);
  else if (dir === 'left') newCol = Math.max(0, colIdx - 1);
  else if (dir === 'right') newCol = Math.min(sh.columns.length - 1, colIdx + 1);

  if (newRow !== rowIdx || newCol !== colIdx) {
    shSelectCell(sh.rows[newRow].id, sh.columns[newCol].id);
  }
}

/**
 * Tab: move right (or wrap to next row). Shift+Tab: move left.
 */
export function shTabNavigate(shift) {
  const sh = S.sheet.current;
  if (!sh || !S.sheet.selectedCell) return;

  const { rowId, colId } = S.sheet.selectedCell;
  const rowIdx = sh.rows.findIndex(r => r.id === rowId);
  const colIdx = sh.columns.findIndex(c => c.id === colId);

  if (shift) {
    // Move left, wrap to previous row end
    if (colIdx > 0) {
      shSelectCell(sh.rows[rowIdx].id, sh.columns[colIdx - 1].id);
    } else if (rowIdx > 0) {
      shSelectCell(sh.rows[rowIdx - 1].id, sh.columns[sh.columns.length - 1].id);
    }
  } else {
    // Move right, wrap to next row start
    if (colIdx < sh.columns.length - 1) {
      shSelectCell(sh.rows[rowIdx].id, sh.columns[colIdx + 1].id);
    } else if (rowIdx < sh.rows.length - 1) {
      shSelectCell(sh.rows[rowIdx + 1].id, sh.columns[0].id);
    }
  }
}

// ═══════════════════════════════════════════
// FORMULA ENGINE — Dependency Graph + Kahn's
// ═══════════════════════════════════════════

// Two Maps: deps = "I reference these cells", dependents = "these cells reference me"
const deps = new Map();       // Map<cellKey, Set<cellKey>>
const dependents = new Map(); // Map<cellKey, Set<cellKey>>

/** Cell key: "colIdx,rowIdx" for formula coord mapping */
function shCellKey(rowId, colId) {
  return `${rowId}:${colId}`;
}

function shCellKeyFromCoord(colIdx, rowIdx) {
  const sh = S.sheet.current;
  if (!sh || rowIdx < 0 || rowIdx >= sh.rows.length || colIdx < 0 || colIdx >= sh.columns.length) return null;
  return shCellKey(sh.rows[rowIdx].id, sh.columns[colIdx].id);
}

/**
 * Parse formula to extract cell references, build/update deps + dependents.
 */
export function shBuildDeps(cellKey) {
  const sh = S.sheet.current;
  if (!sh) return;

  const [rowId, colId] = cellKey.split(':');
  const row = sh.rows.find(r => r.id === rowId);
  if (!row) return;
  const rawVal = row.cells[colId] || '';

  // Remove old deps
  const oldDeps = deps.get(cellKey) || new Set();
  for (const dep of oldDeps) {
    const revSet = dependents.get(dep);
    if (revSet) revSet.delete(cellKey);
  }

  // Parse new deps
  const newDeps = new Set();
  if (rawVal.startsWith('=')) {
    const refs = parseFormulaRefs(rawVal, sh);
    for (const ref of refs) {
      newDeps.add(ref);
      if (!dependents.has(ref)) dependents.set(ref, new Set());
      dependents.get(ref).add(cellKey);
    }
  }

  if (newDeps.size > 0) {
    deps.set(cellKey, newDeps);
  } else {
    deps.delete(cellKey);
  }
}

/**
 * Parse a formula string and return all cell keys it references.
 */
function parseFormulaRefs(formula, sh) {
  const refs = new Set();
  // Match cell references like A1, B23, AA5 and ranges like A1:B5
  const refRegex = /([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?/g;
  let match;
  while ((match = refRegex.exec(formula)) !== null) {
    const col1 = letterToColIndex(match[1]);
    const row1 = parseInt(match[2], 10) - 1;

    if (match[3] && match[4]) {
      // Range: expand all cells
      const col2 = letterToColIndex(match[3]);
      const row2 = parseInt(match[4], 10) - 1;
      const minCol = Math.min(col1, col2), maxCol = Math.max(col1, col2);
      const minRow = Math.min(row1, row2), maxRow = Math.max(row1, row2);
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const k = shCellKeyFromCoord(c, r);
          if (k) refs.add(k);
        }
      }
    } else {
      // Single cell
      const k = shCellKeyFromCoord(col1, row1);
      if (k) refs.add(k);
    }
  }
  return refs;
}

/**
 * BFS from changedCellKey → collect all downstream dirty cells.
 */
export function shGetDirtyCells(startKey) {
  const dirty = new Set();
  const queue = [startKey];
  while (queue.length > 0) {
    const key = queue.shift();
    for (const dep of (dependents.get(key) || [])) {
      if (!dirty.has(dep)) {
        dirty.add(dep);
        queue.push(dep);
      }
    }
  }
  return dirty;
}

/**
 * Kahn's algorithm — topological sort + cycle detection.
 * Only runs on the dirty set.
 */
export function shTopoSort(dirtyCells) {
  const inDegree = new Map();
  for (const id of dirtyCells) {
    let count = 0;
    for (const d of (deps.get(id) || [])) {
      if (dirtyCells.has(d)) count++;
    }
    inDegree.set(id, count);
  }

  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order = [];
  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    for (const dep of (dependents.get(id) || [])) {
      if (!inDegree.has(dep)) continue;
      const newDeg = inDegree.get(dep) - 1;
      inDegree.set(dep, newDeg);
      if (newDeg === 0) queue.push(dep);
    }
  }

  const circular = new Set();
  for (const id of dirtyCells) {
    if (!order.includes(id)) circular.add(id);
  }

  return { order, circular };
}

/**
 * Full recalc pipeline: getDirty → topoSort → eval → mark circular.
 */
export function shRecalc(changedKey) {
  const dirty = shGetDirtyCells(changedKey);
  if (dirty.size === 0) return;

  const { order, circular } = shTopoSort(dirty);
  const sh = S.sheet.current;
  if (!sh) return;

  // Eval in topological order (deps already resolved)
  for (const key of order) {
    // We don't store computed values — rendering re-evals.
    // But we do need to trigger re-render.
  }

  // Mark circular cells — store error marker in a transient cache
  for (const key of circular) {
    // Circular cells will be caught at render time by shEvalFormula
    // since they'll recurse back to themselves.
  }

  // Note: actual evaluation happens at render time via shEvalFormula().
  // The topo sort here is for future optimization where we cache computed values.
  // For now, the dependency graph's main job is cycle detection.
}

/**
 * Evaluate a formula string. Returns computed value or {error: string}.
 */
export function shEvalFormula(formula, sh, _visited) {
  if (!formula || !formula.startsWith('=')) return formula;

  // Circular reference detection
  if (!_visited) _visited = new Set();

  try {
    // Normalize: strip whitespace, uppercase, convert full-width parens/operators
    let expr = formula.slice(1).trim().toUpperCase();
    expr = expr.replace(/（/g, '(').replace(/）/g, ')').replace(/，/g, ',').replace(/：/g, ':');

    // Match function calls: SUM(A1:A10), AVG(B2:B5), etc.
    const funcMatch = expr.match(/^(SUM|AVG|AVERAGE|COUNT|MIN|MAX|STDEV|MEDIAN)\((.+)\)$/);
    if (funcMatch) {
      const funcName = funcMatch[1];
      const argStr = funcMatch[2];
      const values = resolveRange(argStr, sh, _visited);
      if (values.error) return values;
      const nums = values.filter(v => typeof v === 'number' && !isNaN(v));

      switch (funcName) {
        case 'SUM': return nums.reduce((a, b) => a + b, 0);
        case 'AVG':
        case 'AVERAGE': return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        case 'COUNT': return values.filter(v => v !== '' && v !== null && v !== undefined).length;
        case 'MIN': return nums.length > 0 ? Math.min(...nums) : 0;
        case 'MAX': return nums.length > 0 ? Math.max(...nums) : 0;
        case 'STDEV': {
          if (nums.length < 2) return 0;
          const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
          const variance = nums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (nums.length - 1);
          return Math.round(Math.sqrt(variance) * 1000) / 1000;
        }
        case 'MEDIAN': {
          if (nums.length === 0) return 0;
          const sorted = [...nums].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        }
        default: return { error: '#ERROR!' };
      }
    }

    // Simple arithmetic: =A1+B1, =A1*2, etc.
    // Replace cell references with their values
    const evaluated = expr.replace(/([A-Z]+)(\d+)/g, (_, colLetter, rowNum) => {
      const colIdx = letterToColIndex(colLetter);
      const rowIdx = parseInt(rowNum, 10) - 1;
      if (rowIdx < 0 || rowIdx >= sh.rows.length || colIdx < 0 || colIdx >= sh.columns.length) {
        return 'NaN';
      }
      const colId = sh.columns[colIdx].id;
      const rowId = sh.rows[rowIdx].id;
      const cellKey = shCellKey(rowId, colId);

      // Circular check
      if (_visited.has(cellKey)) return 'NaN'; // will produce NaN in eval
      _visited.add(cellKey);

      const raw = sh.rows[rowIdx].cells[colId] || '';
      if (raw.startsWith('=')) {
        const result = shEvalFormula(raw, sh, _visited);
        if (typeof result === 'object' && result.error) return 'NaN';
        return typeof result === 'number' ? result : (parseFloat(result) || 0);
      }
      const n = parseFloat(raw);
      return isNaN(n) ? 0 : n;
    });

    // Safe eval of arithmetic expression
    const result = safeEvalArith(evaluated);
    if (result === null) return { error: '#ERROR!' };
    if (!isFinite(result)) return { error: '#DIV/0!' };
    return Math.round(result * 1000000) / 1000000; // avoid floating point noise

  } catch (e) {
    return { error: '#ERROR!' };
  }
}

/**
 * Resolve a range string (e.g., "A1:B5" or "A1") to an array of numeric values.
 */
function resolveRange(rangeStr, sh, visited) {
  const values = [];
  // Could be "A1:B5" or "A1,B2,C3" or "A1:A5,B1"
  const parts = rangeStr.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    const rangeMatch = trimmed.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (rangeMatch) {
      const col1 = letterToColIndex(rangeMatch[1]), row1 = parseInt(rangeMatch[2], 10) - 1;
      const col2 = letterToColIndex(rangeMatch[3]), row2 = parseInt(rangeMatch[4], 10) - 1;
      const minCol = Math.min(col1, col2), maxCol = Math.max(col1, col2);
      const minRow = Math.min(row1, row2), maxRow = Math.max(row1, row2);
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          if (r < 0 || r >= sh.rows.length || c < 0 || c >= sh.columns.length) continue;
          const raw = sh.rows[r].cells[sh.columns[c].id] || '';
          if (raw.startsWith('=')) {
            const v = shEvalFormula(raw, sh, new Set(visited));
            if (typeof v === 'object' && v.error) continue;
            const n = parseFloat(v);
            values.push(isNaN(n) ? v : n);
          } else {
            const n = parseFloat(raw);
            values.push(isNaN(n) ? raw : n);
          }
        }
      }
    } else {
      // Single cell
      const cellMatch = trimmed.match(/^([A-Z]+)(\d+)$/);
      if (cellMatch) {
        const c = letterToColIndex(cellMatch[1]), r = parseInt(cellMatch[2], 10) - 1;
        if (r >= 0 && r < sh.rows.length && c >= 0 && c < sh.columns.length) {
          const raw = sh.rows[r].cells[sh.columns[c].id] || '';
          if (raw.startsWith('=')) {
            const v = shEvalFormula(raw, sh, new Set(visited));
            if (typeof v === 'object' && v.error) continue;
            const n = parseFloat(v);
            values.push(isNaN(n) ? v : n);
          } else {
            const n = parseFloat(raw);
            values.push(isNaN(n) ? raw : n);
          }
        }
      }
    }
  }
  return values;
}

/**
 * Safe arithmetic evaluator. Only allows numbers and +-*\/().
 */
function safeEvalArith(expr) {
  // Remove whitespace
  const cleaned = expr.replace(/\s/g, '');
  // Validate: only numbers, operators, parens, decimal points
  if (!/^[\d+\-*/.() ]+$/.test(cleaned)) return null;
  try {
    return Function('"use strict"; return (' + cleaned + ')')();
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════
// UNDO / REDO — Snapshot-based (same pattern as doc.js)
// ═══════════════════════════════════════════

function shSnapshot() {
  const sh = S.sheet.current;
  if (!sh) return null;
  return JSON.stringify({
    columns: sh.columns,
    rows: sh.rows,
    frozenRows: sh.frozenRows,
    frozenCols: sh.frozenCols,
  });
}

function shRestore(snapshot) {
  if (!snapshot) return;
  const data = JSON.parse(snapshot);
  const sh = S.sheet.current;
  if (!sh) return;
  sh.columns = data.columns;
  sh.rows = data.rows;
  sh.frozenRows = data.frozenRows;
  sh.frozenCols = data.frozenCols;
  sh.updated = new Date().toISOString();
  // Clear editing state after restore
  S.sheet.editingCell = null;
  renderSheetMode();
  shAutoSave();
}

export function shPushUndo() {
  if (S.sheet.undoRedoInProgress) return;
  const snap = shSnapshot();
  if (!snap) return;
  S.sheet.undoStack.push(snap);
  if (S.sheet.undoStack.length > SHEET_MAX_UNDO) S.sheet.undoStack.shift();
  S.sheet.redoStack = []; // clear redo on new action
  shUpdateUndoUI();
}

export function shUndo() {
  if (S.sheet.undoStack.length === 0) return;
  S.sheet.undoRedoInProgress = true;
  // Push current state to redo
  const current = shSnapshot();
  if (current) S.sheet.redoStack.push(current);
  // Restore previous state
  shRestore(S.sheet.undoStack.pop());
  S.sheet.undoRedoInProgress = false;
  shUpdateUndoUI();
}

export function shRedo() {
  if (S.sheet.redoStack.length === 0) return;
  S.sheet.undoRedoInProgress = true;
  // Push current state to undo
  const current = shSnapshot();
  if (current) S.sheet.undoStack.push(current);
  // Restore redo state
  shRestore(S.sheet.redoStack.pop());
  S.sheet.undoRedoInProgress = false;
  shUpdateUndoUI();
}

export function shUpdateUndoUI() {
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  if (undoBtn) undoBtn.disabled = S.sheet.undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = S.sheet.redoStack.length === 0;
}

// Auto-save sheet to localStorage
function shAutoSave() {
  const sh = S.sheet.current;
  if (!sh) return;
  clearTimeout(S.sheet.autoSaveTimer);
  S.sheet.autoSaveTimer = setTimeout(() => {
    try { localStorage.setItem('sloth_current_sheet', JSON.stringify(sh)); } catch(e) {}
  }, 500);
}

// ═══════════════════════════════════════════
// ROW / COLUMN OPERATIONS (placeholder for Step 7)
// ═══════════════════════════════════════════

export function shAddRow(afterRowId) {
  const sh = S.sheet.current;
  if (!sh) return;
  const cells = {};
  sh.columns.forEach(col => { cells[col.id] = ''; });
  const newRow = { id: shId('row'), cells };
  if (afterRowId) {
    const idx = sh.rows.findIndex(r => r.id === afterRowId);
    sh.rows.splice(idx + 1, 0, newRow);
  } else {
    sh.rows.push(newRow);
  }
  renderSheetMode();
}

export function shAddCol(afterColId) {
  const sh = S.sheet.current;
  if (!sh) return;
  const newColIdx = afterColId
    ? sh.columns.findIndex(c => c.id === afterColId) + 1
    : sh.columns.length;
  const newCol = { id: shId('col'), name: colIndexToLetter(newColIdx), width: DEFAULT_COL_WIDTH };
  sh.columns.splice(newColIdx, 0, newCol);
  // Re-letter all columns
  sh.columns.forEach((c, i) => { c.name = colIndexToLetter(i); });
  // Add empty cells in new column for all rows
  sh.rows.forEach(row => { row.cells[newCol.id] = ''; });
  renderSheetMode();
}

export function shDeleteRow(rowId) {
  const sh = S.sheet.current;
  if (!sh || sh.rows.length <= 1) return;
  sh.rows = sh.rows.filter(r => r.id !== rowId);
  if (S.sheet.selectedCell && S.sheet.selectedCell.rowId === rowId) {
    S.sheet.selectedCell = null;
  }
  renderSheetMode();
}

export function shDeleteCol(colId) {
  const sh = S.sheet.current;
  if (!sh || sh.columns.length <= 1) return;
  sh.columns = sh.columns.filter(c => c.id !== colId);
  sh.columns.forEach((c, i) => { c.name = colIndexToLetter(i); });
  sh.rows.forEach(row => { delete row.cells[colId]; });
  if (S.sheet.selectedCell && S.sheet.selectedCell.colId === colId) {
    S.sheet.selectedCell = null;
  }
  renderSheetMode();
}

export function shAutoFitCol(colId) {
  // Will be properly implemented with DOM measurement in Step 7
  const sh = S.sheet.current;
  if (!sh) return;
  const col = sh.columns.find(c => c.id === colId);
  if (!col) return;
  // For now, toggle between default and max
  col.width = col.width === DEFAULT_COL_WIDTH ? MAX_COL_WIDTH : DEFAULT_COL_WIDTH;
  renderSheetMode();
}

// ── Batch add rows/cols ──

export function shBatchAddRows() {
  const input = document.getElementById('shBatchRowInput');
  const count = Math.max(1, Math.min(100, parseInt(input?.value) || 1));
  const sh = S.sheet.current;
  if (!sh) return;
  shPushUndo();
  for (let i = 0; i < count; i++) {
    const cells = {};
    sh.columns.forEach(col => { cells[col.id] = ''; });
    sh.rows.push({ id: shId('row'), cells });
  }
  renderSheetMode();
}

export function shBatchAddCols() {
  const input = document.getElementById('shBatchColInput');
  const count = Math.max(1, Math.min(50, parseInt(input?.value) || 1));
  const sh = S.sheet.current;
  if (!sh) return;
  shPushUndo();
  for (let i = 0; i < count; i++) {
    const newCol = { id: shId('col'), name: '', width: DEFAULT_COL_WIDTH };
    sh.columns.push(newCol);
    sh.rows.forEach(row => { row.cells[newCol.id] = ''; });
  }
  // Re-letter all columns
  sh.columns.forEach((c, idx) => { c.name = colIndexToLetter(idx); });
  renderSheetMode();
}

// ═══════════════════════════════════════════
// CLIPBOARD — Copy / Paste / Cut
// ═══════════════════════════════════════════

/**
 * Copy selected cell or range to clipboard as tab-separated text.
 */
export function shCopy() {
  const sh = S.sheet.current;
  if (!sh) return;

  const { text } = _getSelectionText(sh);
  if (!text) return;

  navigator.clipboard.writeText(text).catch(() => {});
}

/**
 * Cut = copy + clear.
 */
export function shCut() {
  const sh = S.sheet.current;
  if (!sh) return;

  const { text, cells } = _getSelectionText(sh);
  if (!text) return;

  navigator.clipboard.writeText(text).catch(() => {});
  shPushUndo();
  for (const { rowId, colId } of cells) {
    const row = sh.rows.find(r => r.id === rowId);
    if (row) row.cells[colId] = '';
  }
  shAutoSave();
  renderSheetMode();
}

/**
 * Paste from clipboard into sheet starting at selected cell.
 */
export async function shPaste() {
  const sh = S.sheet.current;
  if (!sh || !S.sheet.selectedCell) return;

  let clipText;
  try { clipText = await navigator.clipboard.readText(); } catch { return; }
  if (!clipText) return;

  shPushUndo();

  const lines = clipText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  // Remove trailing empty line if present
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const startRowIdx = sh.rows.findIndex(r => r.id === S.sheet.selectedCell.rowId);
  const startColIdx = sh.columns.findIndex(c => c.id === S.sheet.selectedCell.colId);
  if (startRowIdx < 0 || startColIdx < 0) return;

  for (let r = 0; r < lines.length; r++) {
    const rowIdx = startRowIdx + r;
    // Auto-expand rows if needed
    while (rowIdx >= sh.rows.length) {
      const cells = {};
      sh.columns.forEach(col => { cells[col.id] = ''; });
      sh.rows.push({ id: shId('row'), cells });
    }
    const cols = lines[r].split('\t');
    for (let c = 0; c < cols.length; c++) {
      const colIdx = startColIdx + c;
      // Auto-expand columns if needed
      while (colIdx >= sh.columns.length) {
        const newCol = { id: shId('col'), name: '', width: DEFAULT_COL_WIDTH };
        sh.columns.push(newCol);
        sh.rows.forEach(row => { row.cells[newCol.id] = ''; });
      }
      sh.rows[rowIdx].cells[sh.columns[colIdx].id] = cols[c];
    }
  }
  // Re-letter columns if expanded
  sh.columns.forEach((col, i) => { col.name = colIndexToLetter(i); });

  shAutoSave();
  renderSheetMode();
}

/**
 * Delete content in selected range.
 */
export function shDeleteSelection() {
  const sh = S.sheet.current;
  if (!sh) return;

  const rangeSet = _getRangeSet();
  if (rangeSet) {
    shPushUndo();
    for (const key of rangeSet) {
      const [rowId, colId] = key.split(':');
      const row = sh.rows.find(r => r.id === rowId);
      if (row) row.cells[colId] = '';
    }
    shAutoSave();
    renderSheetMode();
    return true;
  }
  // Single cell
  if (S.sheet.selectedCell) {
    shPushUndo();
    shSetCellValue(S.sheet.selectedCell.rowId, S.sheet.selectedCell.colId, '');
    renderSheetMode();
    return true;
  }
  return false;
}

/** Internal: build TSV text from selection */
function _getSelectionText(sh) {
  const rangeSet = _getRangeSet();
  const range = S.sheet.selectedRange;

  if (rangeSet && range) {
    const r1 = sh.rows.findIndex(r => r.id === range.start.rowId);
    const r2 = sh.rows.findIndex(r => r.id === range.end.rowId);
    const c1 = sh.columns.findIndex(c => c.id === range.start.colId);
    const c2 = sh.columns.findIndex(c => c.id === range.end.colId);
    const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);

    const lines = [];
    const cells = [];
    for (let r = minR; r <= maxR; r++) {
      const row = sh.rows[r];
      const vals = [];
      for (let c = minC; c <= maxC; c++) {
        const colId = sh.columns[c].id;
        const raw = row.cells[colId] || '';
        const display = raw.startsWith('=') ? shEvalFormula(raw, sh) : raw;
        vals.push(typeof display === 'object' ? '' : String(display));
        cells.push({ rowId: row.id, colId });
      }
      lines.push(vals.join('\t'));
    }
    return { text: lines.join('\n'), cells };
  }

  // Single cell
  if (S.sheet.selectedCell) {
    const { rowId, colId } = S.sheet.selectedCell;
    const row = sh.rows.find(r => r.id === rowId);
    if (!row) return { text: '', cells: [] };
    const raw = row.cells[colId] || '';
    const display = raw.startsWith('=') ? shEvalFormula(raw, sh) : raw;
    const text = typeof display === 'object' ? '' : String(display);
    return { text, cells: [{ rowId, colId }] };
  }

  return { text: '', cells: [] };
}

// ═══════════════════════════════════════════
// FUNCTION PICKER — autocomplete dropdown for formulas
// ═══════════════════════════════════════════

const SHEET_FUNCTIONS = [
  { name: 'SUM', desc: 'Sum of values', usage: 'SUM(A1:A10)' },
  { name: 'AVERAGE', desc: 'Mean of values', usage: 'AVERAGE(A1:A10)' },
  { name: 'COUNT', desc: 'Count non-empty cells', usage: 'COUNT(A1:A10)' },
  { name: 'MIN', desc: 'Smallest value', usage: 'MIN(A1:A10)' },
  { name: 'MAX', desc: 'Largest value', usage: 'MAX(A1:A10)' },
  { name: 'STDEV', desc: 'Standard deviation', usage: 'STDEV(A1:A10)' },
  { name: 'MEDIAN', desc: 'Median value', usage: 'MEDIAN(A1:A10)' },
];

let _funcPickerEl = null;

/**
 * Show/update function picker based on current cell text.
 */
export function shShowFuncPicker(cellEl) {
  if (!cellEl) { shHideFuncPicker(); return; }
  const text = (cellEl.innerText || '').trim().toUpperCase();
  // Only show if starts with = and has partial function name
  if (!text.startsWith('=')) { shHideFuncPicker(); return; }
  const partial = text.slice(1).replace(/\(.*$/, '').trim(); // text before first (
  if (!partial || partial.includes(')')) { shHideFuncPicker(); return; }

  const matches = SHEET_FUNCTIONS.filter(f => f.name.startsWith(partial));
  if (matches.length === 0) { shHideFuncPicker(); return; }

  if (!_funcPickerEl) {
    _funcPickerEl = document.createElement('div');
    _funcPickerEl.className = 'sh-func-picker';
    document.body.appendChild(_funcPickerEl);
  }

  _funcPickerEl.innerHTML = matches.map(f =>
    `<div class="sh-func-item" onmousedown="event.preventDefault(); window.shInsertFunction('${f.name}')">
      <span class="sh-func-name">${f.name}()</span>
      <span class="sh-func-desc">${f.desc} — ${f.usage}</span>
    </div>`
  ).join('');

  // Position below the cell
  const rect = cellEl.getBoundingClientRect();
  _funcPickerEl.style.display = 'block';
  _funcPickerEl.style.left = rect.left + 'px';
  _funcPickerEl.style.top = (rect.bottom + 2) + 'px';
}

export function shHideFuncPicker() {
  if (_funcPickerEl) _funcPickerEl.style.display = 'none';
}

/**
 * Insert a function into the currently editing cell.
 */
export function shInsertFunction(funcName) {
  if (!S.sheet.editingCell) return;
  const { rowId, colId } = S.sheet.editingCell;
  const cellEl = document.querySelector(`.sh-cell[data-row-id="${rowId}"][data-col-id="${colId}"]`);
  if (!cellEl) return;
  cellEl.textContent = `=${funcName}(`;
  cellEl.focus();
  // Move cursor to end
  const range = document.createRange();
  range.selectNodeContents(cellEl);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  shHideFuncPicker();
}

/**
 * Toggle function picker from toolbar button (shows all functions).
 */
export function shToggleFuncPickerToolbar() {
  if (_funcPickerEl && _funcPickerEl.style.display === 'block') {
    shHideFuncPicker();
    return;
  }
  // If no cell is selected, just show list as reference
  if (!_funcPickerEl) {
    _funcPickerEl = document.createElement('div');
    _funcPickerEl.className = 'sh-func-picker';
    document.body.appendChild(_funcPickerEl);
  }

  _funcPickerEl.innerHTML = SHEET_FUNCTIONS.map(f =>
    `<div class="sh-func-item" onmousedown="event.preventDefault(); window.shInsertFuncFromToolbar('${f.name}')">
      <span class="sh-func-name">${f.name}()</span>
      <span class="sh-func-desc">${f.desc} — ${f.usage}</span>
    </div>`
  ).join('');

  // Position under the toolbar fx button
  const btn = document.getElementById('shFuncBtn');
  if (btn) {
    const rect = btn.getBoundingClientRect();
    _funcPickerEl.style.left = rect.left + 'px';
    _funcPickerEl.style.top = (rect.bottom + 4) + 'px';
  } else {
    _funcPickerEl.style.left = '100px';
    _funcPickerEl.style.top = '60px';
  }
  _funcPickerEl.style.display = 'block';

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function _close(ev) {
      if (_funcPickerEl && !_funcPickerEl.contains(ev.target)) {
        shHideFuncPicker();
        document.removeEventListener('click', _close);
      }
    });
  }, 10);
}

/**
 * Insert function from toolbar — starts editing if needed.
 */
export function shInsertFuncFromToolbar(funcName) {
  shHideFuncPicker();
  if (!S.sheet.selectedCell) return;
  const { rowId, colId } = S.sheet.selectedCell;
  // Start editing and set formula
  shStartEdit(rowId, colId);
  // Wait for DOM to update
  requestAnimationFrame(() => {
    const cellEl = document.querySelector(`.sh-cell[data-row-id="${rowId}"][data-col-id="${colId}"]`);
    if (!cellEl) return;
    cellEl.textContent = `=${funcName}(`;
    cellEl.focus();
    const range = document.createRange();
    range.selectNodeContents(cellEl);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
}

// ═══════════════════════════════════════════
// CONTEXT MENUS (placeholder — will use renderCtxMenuPopup in Step 7)
// ═══════════════════════════════════════════

export function shCellCtx(event, rowId, colId) {
  // TODO: Step 7 — right-click context menu
}

export function shColHeaderCtx(event, colId) {
  // TODO: Step 7
}

export function shRowHeaderCtx(event, rowId) {
  // TODO: Step 7
}

// ═══════════════════════════════════════════
// AI INTEGRATION (placeholder for Step 11)
// ═══════════════════════════════════════════

/**
 * Serialize sheet as tab-separated text for LLM context injection.
 */
export function shSerializeForAI() {
  const sh = S.sheet.current;
  if (!sh) return '';
  const header = sh.columns.map(c => c.name).join('\t');
  const rows = sh.rows.map(row =>
    sh.columns.map(col => {
      const raw = row.cells[col.id] || '';
      if (raw.startsWith('=')) {
        const v = shEvalFormula(raw, sh);
        return typeof v === 'object' ? raw : String(v);
      }
      return raw;
    }).join('\t')
  );
  return header + '\n' + rows.join('\n');
}

// ═══════════════════════════════════════════
// SHEET MODE ENTRY
// ═══════════════════════════════════════════

/**
 * Enter sheet mode with a fresh sheet — called from wsNewFile('sheet').
 */
export function enterSheetMode() {
  // Create a fresh sheet (modeEnter will also check, but we want a NEW one)
  S.sheet.current = shCreateNew('Untitled Sheet');
  S.sheet.undoStack = [];
  S.sheet.redoStack = [];
  S.sheet.selectedCell = null;
  S.sheet.editingCell = null;
  S.sheet.selectedRange = null;
  window.modeEnter('sheet');
}
