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

// ── Formula Reference Mode ──
// When active, clicking cells inserts references into the formula being edited
let _formulaRefMode = false;  // true when user is building a formula and can click cells for refs
let _formulaRefAnchor = null; // { rowIdx, colIdx } — for drag-to-build range refs

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

  // Corner cell (sticky if frozen)
  const cornerFrozenCls = (sh.frozenRows > 1 || sh.frozenCols > 0) ? ' sh-frozen-corner' : '';
  html += `<div class="sh-corner${cornerFrozenCls}"></div>`;

  // Column headers
  for (let c = 0; c < totalCols; c++) {
    const col = columns[c];
    const colHdrFrozen = (c === 0 && sh.frozenCols > 0) ? ' sh-frozen-col-hdr' : '';
    html += `<div class="sh-col-header${colHdrFrozen}" data-col-id="${col.id}" data-col-idx="${c}"
      onclick="window.shColHeaderCtx(event, '${col.id}')"
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
    const rowHdrFrozen = (r === 0 && sh.frozenRows > 1) ? ' sh-frozen-row-hdr' : '';
    html += `<div class="sh-row-header${rowHdrFrozen}" data-row-id="${row.id}" data-row-idx="${r}"
      onclick="window.shRowHeaderCtx(event, '${row.id}')"
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
      // Frozen cell classes
      if (r === 0 && sh.frozenRows > 1) cls.push('sh-frozen-row');
      if (c === 0 && sh.frozenCols > 0) cls.push('sh-frozen-col');

      const displayText = (typeof display === 'object' && display.error) ? display.error : display;
      // Cell background color
      const cellBg = row.cellStyles && row.cellStyles[col.id] && row.cellStyles[col.id].bg;
      const bgStyle = cellBg ? ` style="background:${cellBg}"` : '';

      // Add fill handle to the selected cell (bottom-right corner drag square)
      const fillHandle = (isSelected && !isEditing && !isInRange)
        ? `<div class="sh-fill-handle" onmousedown="event.stopPropagation(); window.shFillHandleDown(event, '${row.id}', '${col.id}')"></div>`
        : '';
      html += `<div class="${cls.join(' ')}" data-row-id="${row.id}" data-col-id="${col.id}"
        data-row-idx="${r}" data-col-idx="${c}"${bgStyle}
        onmousedown="window.shCellMouseDown(event, '${row.id}', '${col.id}')"
        onclick="window.shCellClick(event, '${row.id}', '${col.id}')"
        ondblclick="window.shCellDblClick(event, '${row.id}', '${col.id}')"
        oncontextmenu="event.preventDefault(); window.shCellCtx(event, '${row.id}', '${col.id}')"
        >${escHtml(String(displayText))}${fillHandle}</div>`;
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

  // ── Formula ref mode: clicking a cell inserts its reference ──
  if (_formulaRefMode && S.sheet.editingCell) {
    if (S.sheet.editingCell.rowId === rowId && S.sheet.editingCell.colId === colId) return;
    event.preventDefault();
    event.stopPropagation();
    _insertCellRef(rowId, colId);
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
 * Mousedown on a cell — start drag-select or formula ref.
 */
export function shCellMouseDown(event, rowId, colId) {
  // Only left-click; ignore if editing the same cell
  if (event.button !== 0) return;
  if (S.sheet.editingCell &&
      S.sheet.editingCell.rowId === rowId && S.sheet.editingCell.colId === colId) return;

  // ── Formula ref mode: mousedown starts a potential range ref ──
  if (_formulaRefMode && S.sheet.editingCell) {
    event.preventDefault();
    event.stopPropagation();
    const sh = S.sheet.current;
    const rIdx = sh.rows.findIndex(r => r.id === rowId);
    const cIdx = sh.columns.findIndex(c => c.id === colId);
    _formulaRefAnchor = { rowIdx: rIdx, colIdx: cIdx };
    // Insert single ref immediately
    _insertCellRef(rowId, colId);
    // Listen for drag to extend to range
    document.addEventListener('mousemove', _onFormulaRefDrag);
    document.addEventListener('mouseup', _onFormulaRefDragEnd);
    return;
  }

  // Commit any current edit
  if (S.sheet.editingCell) shCommitEdit();

  _dragState = { anchorRowId: rowId, anchorColId: colId, active: true, moved: false };
  S.sheet.selectedCell = { rowId, colId };
  S.sheet.selectedRange = null;

  // Prevent text selection during drag
  event.preventDefault();
  // Clear any existing browser text selection
  window.getSelection().removeAllRanges();
  // Block selectstart globally while dragging
  document.addEventListener('selectstart', _blockSelect);

  // Bind move/up on document (captured once per drag)
  document.addEventListener('mousemove', _onDragMove);
  document.addEventListener('mouseup', _onDragEnd);
}

function _blockSelect(e) { e.preventDefault(); }

// ── Formula reference insertion helpers ──

/** Enter formula ref mode (called after inserting a function like =SUM( ) */
export function shEnterFormulaRefMode() {
  _formulaRefMode = true;
  _formulaRefAnchor = null;
}

/** Exit formula ref mode */
export function shExitFormulaRefMode() {
  _formulaRefMode = false;
  _formulaRefAnchor = null;
}

/** Get the cell coordinate label like "A1" from rowId/colId */
function _cellLabel(rowId, colId) {
  const sh = S.sheet.current;
  if (!sh) return '';
  const rIdx = sh.rows.findIndex(r => r.id === rowId);
  const cIdx = sh.columns.findIndex(c => c.id === colId);
  if (rIdx < 0 || cIdx < 0) return '';
  return colIndexToLetter(cIdx) + (rIdx + 1);
}

function _cellLabelFromIdx(rowIdx, colIdx) {
  return colIndexToLetter(colIdx) + (rowIdx + 1);
}

/**
 * Insert a single cell reference into the formula cell being edited.
 * Replaces any previous ref at cursor position (between last separator and cursor).
 */
function _insertCellRef(rowId, colId) {
  if (!S.sheet.editingCell) return;
  const { rowId: eRow, colId: eCol } = S.sheet.editingCell;
  const cellEl = document.querySelector(`.sh-cell[data-row-id="${eRow}"][data-col-id="${eCol}"]`);
  if (!cellEl) return;

  const label = _cellLabel(rowId, colId);
  if (!label) return;

  const text = cellEl.innerText || '';
  // Find the position to insert: after last ( , or :
  const insertPos = _findRefInsertPos(text);
  const before = text.slice(0, insertPos);
  const after = text.slice(insertPos);
  // Strip any existing partial ref from after (up to next , or ) or end)
  const stripped = after.replace(/^[A-Z]+\d+(?::[A-Z]+\d+)?/, '');
  cellEl.textContent = before + label + stripped;
  cellEl.focus();
  // Move cursor right after the inserted label
  _setCursorAfter(cellEl, (before + label).length);
}

/**
 * During formula ref drag, update ref to a range like A1:B3
 */
function _onFormulaRefDrag(e) {
  if (!_formulaRefAnchor || !S.sheet.editingCell) return;
  const hit = _cellFromPoint(e.clientX, e.clientY);
  if (!hit) return;

  const sh = S.sheet.current;
  const rIdx = sh.rows.findIndex(r => r.id === hit.rowId);
  const cIdx = sh.columns.findIndex(c => c.id === hit.colId);
  if (rIdx < 0 || cIdx < 0) return;

  const a = _formulaRefAnchor;
  // If same cell, single ref
  const label = (a.rowIdx === rIdx && a.colIdx === cIdx)
    ? _cellLabelFromIdx(a.rowIdx, a.colIdx)
    : _cellLabelFromIdx(a.rowIdx, a.colIdx) + ':' + _cellLabelFromIdx(rIdx, cIdx);

  const { rowId: eRow, colId: eCol } = S.sheet.editingCell;
  const cellEl = document.querySelector(`.sh-cell[data-row-id="${eRow}"][data-col-id="${eCol}"]`);
  if (!cellEl) return;

  const text = cellEl.innerText || '';
  const insertPos = _findRefInsertPos(text);
  const before = text.slice(0, insertPos);
  const after = text.slice(insertPos);
  const stripped = after.replace(/^[A-Z]+\d+(?::[A-Z]+\d+)?/, '');
  cellEl.textContent = before + label + stripped;
  cellEl.focus();
  _setCursorAfter(cellEl, (before + label).length);
}

function _onFormulaRefDragEnd(e) {
  document.removeEventListener('mousemove', _onFormulaRefDrag);
  document.removeEventListener('mouseup', _onFormulaRefDragEnd);
  _formulaRefAnchor = null;
}

/** Find where to insert/replace a cell reference in formula text.
 *  Scans backward to find last ( or , separator — returns the position right after it.
 *  Skips past ), :, and ref characters (A-Z, 0-9) so that existing refs get replaced.
 */
function _findRefInsertPos(text) {
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '(' || ch === ',') {
      return i + 1;
    }
  }
  return text.length;
}

/** Set cursor position in a contenteditable element */
function _setCursorAfter(el, charPos) {
  const textNode = el.firstChild;
  if (!textNode) return;
  const range = document.createRange();
  const pos = Math.min(charPos, textNode.length);
  range.setStart(textNode, pos);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
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
  document.removeEventListener('selectstart', _blockSelect);
  if (_dragState && _dragState.moved) {
    _dragState.justFinished = true; // suppress the click event that follows mouseup
  }
  if (_dragState) _dragState.active = false;
}

/** After re-render, re-attach document listeners if drag is still active */
function _reattachDragListeners() {
  // mousemove/mouseup are on document, so they survive re-renders
}

// ═══════════════════════════════════════════
// FILL HANDLE — drag to extend formulas/values
// ═══════════════════════════════════════════

let _fillState = null; // { srcRowId, srcColId, srcRowIdx, srcColIdx }

export function shFillHandleDown(event, rowId, colId) {
  event.preventDefault();
  const sh = S.sheet.current;
  if (!sh) return;
  const rIdx = sh.rows.findIndex(r => r.id === rowId);
  const cIdx = sh.columns.findIndex(c => c.id === colId);
  _fillState = { srcRowId: rowId, srcColId: colId, srcRowIdx: rIdx, srcColIdx: cIdx, lastRowIdx: rIdx, lastColIdx: cIdx };

  document.addEventListener('mousemove', _onFillMove);
  document.addEventListener('mouseup', _onFillEnd);
  document.addEventListener('selectstart', _blockSelect);
}

function _onFillMove(e) {
  if (!_fillState) return;
  const hit = _cellFromPoint(e.clientX, e.clientY);
  if (!hit) return;
  const sh = S.sheet.current;
  if (!sh) return;
  const rIdx = sh.rows.findIndex(r => r.id === hit.rowId);
  const cIdx = sh.columns.findIndex(c => c.id === hit.colId);

  // Show preview: highlight the fill range
  // Determine fill direction: vertical (same col) or horizontal (same row)
  _fillState.lastRowIdx = rIdx;
  _fillState.lastColIdx = cIdx;

  // Use selectedRange to show preview highlight
  S.sheet.selectedRange = {
    start: { rowId: _fillState.srcRowId, colId: _fillState.srcColId },
    end: hit
  };
  renderSheetMode();
}

function _onFillEnd(e) {
  document.removeEventListener('mousemove', _onFillMove);
  document.removeEventListener('mouseup', _onFillEnd);
  document.removeEventListener('selectstart', _blockSelect);

  if (!_fillState) return;
  const sh = S.sheet.current;
  if (!sh) { _fillState = null; return; }

  const { srcRowIdx, srcColIdx } = _fillState;
  const endRowIdx = _fillState.lastRowIdx;
  const endColIdx = _fillState.lastColIdx;

  // Nothing to fill if same cell
  if (srcRowIdx === endRowIdx && srcColIdx === endColIdx) {
    _fillState = null;
    S.sheet.selectedRange = null;
    renderSheetMode();
    return;
  }

  const srcRow = sh.rows[srcRowIdx];
  const srcColId = sh.columns[srcColIdx].id;
  const srcVal = srcRow.cells[srcColId] || '';

  shPushUndo();

  const minR = Math.min(srcRowIdx, endRowIdx), maxR = Math.max(srcRowIdx, endRowIdx);
  const minC = Math.min(srcColIdx, endColIdx), maxC = Math.max(srcColIdx, endColIdx);

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (r === srcRowIdx && c === srcColIdx) continue; // skip source cell
      const rowDelta = r - srcRowIdx;
      const colDelta = c - srcColIdx;
      let val = srcVal;
      if (val.startsWith('=')) {
        val = _adjustFormulaRefs(val, rowDelta, colDelta);
      }
      // Auto-expand rows if needed
      while (r >= sh.rows.length) {
        const cells = {};
        sh.columns.forEach(col => { cells[col.id] = ''; });
        sh.rows.push({ id: shId('row'), cells });
      }
      sh.rows[r].cells[sh.columns[c].id] = val;
    }
  }

  _fillState = null;
  S.sheet.selectedRange = null;
  // Select the fill range
  S.sheet.selectedCell = { rowId: sh.rows[srcRowIdx].id, colId: sh.columns[srcColIdx].id };
  S.sheet.selectedRange = {
    start: { rowId: sh.rows[minR].id, colId: sh.columns[minC].id },
    end: { rowId: sh.rows[maxR].id, colId: sh.columns[maxC].id }
  };
  shAutoSave();
  renderSheetMode();
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
  const text = (e.target.innerText || '').trim().toUpperCase();
  // Auto-enter formula ref mode if text looks like =FUNC( with open paren
  if (text.startsWith('=') && text.includes('(') && !text.includes(')')) {
    if (!_formulaRefMode) shEnterFormulaRefMode();
  } else if (text.startsWith('=') && text.includes(')')) {
    // Has closing paren — exit ref mode
    if (_formulaRefMode) shExitFormulaRefMode();
  }
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
  shExitFormulaRefMode();

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
  shExitFormulaRefMode();
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

// Auto-save sheet to localStorage + workspace
function shAutoSave() {
  const sh = S.sheet.current;
  if (!sh) return;
  clearTimeout(S.sheet.autoSaveTimer);
  S.sheet.autoSaveTimer = setTimeout(() => {
    // 1. Persist to localStorage (survives refresh)
    try { localStorage.setItem('sloth_current_sheet', JSON.stringify(sh)); } catch(e) {}
    // 2. Sync back to workspace storage (like doc does)
    shSaveToWorkspace();
  }, 500);
}

// Sync current sheet data back to workspace file list
export function shSaveToWorkspace() {
  const sh = S.sheet.current;
  if (!sh) return;
  const fileId = S._wsCurrentFileId;
  if (!fileId || !window.wsLoad || !window.wsSave) return;
  const files = window.wsLoad();
  const idx = files.findIndex(f => f.id === fileId && f.type === 'sheet');
  if (idx < 0) return;
  // Update content and metadata
  const { title, ...content } = sh;
  files[idx].title = title || files[idx].title;
  files[idx].content = content;
  files[idx].updated = new Date().toISOString();
  window.wsSave(files);
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

// ── Clipboard helpers (fallback for file:// and non-HTTPS) ──
let _shClipboard = ''; // internal fallback clipboard

function _copyToClipboard(text) {
  _shClipboard = text; // always store internally
  // Try modern clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
    return;
  }
  // Fallback: hidden textarea + execCommand
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
}

async function _readFromClipboard() {
  // Try modern clipboard API
  if (navigator.clipboard && navigator.clipboard.readText) {
    try { return await navigator.clipboard.readText(); } catch(e) {}
  }
  // Fallback: return internal clipboard
  return _shClipboard;
}

/**
 * Copy selected cell or range to clipboard as tab-separated text.
 */
// Internal clipboard metadata for formula-aware paste
let _shCopyMeta = null; // { srcRowIdx, srcColIdx } — origin of copy for ref adjustment

export function shCopy() {
  const sh = S.sheet.current;
  if (!sh) return;

  const { text, startRowIdx, startColIdx } = _getSelectionText(sh, false);
  if (!text) return;

  // Remember source position for relative formula adjustment on paste
  let srcRow, srcCol;
  if (startRowIdx !== undefined) {
    srcRow = startRowIdx;
    srcCol = startColIdx;
  } else if (S.sheet.selectedCell) {
    srcRow = sh.rows.findIndex(r => r.id === S.sheet.selectedCell.rowId);
    srcCol = sh.columns.findIndex(c => c.id === S.sheet.selectedCell.colId);
  }
  _shCopyMeta = { srcRowIdx: srcRow, srcColIdx: srcCol };
  _copyToClipboard(text);
}

/**
 * Cut = copy + clear.
 */
export function shCut() {
  const sh = S.sheet.current;
  if (!sh) return;

  const { text, cells, startRowIdx, startColIdx } = _getSelectionText(sh, false);
  if (!text) return;

  let srcRow, srcCol;
  if (startRowIdx !== undefined) {
    srcRow = startRowIdx;
    srcCol = startColIdx;
  } else if (S.sheet.selectedCell) {
    srcRow = sh.rows.findIndex(r => r.id === S.sheet.selectedCell.rowId);
    srcCol = sh.columns.findIndex(c => c.id === S.sheet.selectedCell.colId);
  }
  _shCopyMeta = { srcRowIdx: srcRow, srcColIdx: srcCol };
  _copyToClipboard(text);
  shPushUndo();
  for (const { rowId, colId } of cells) {
    const row = sh.rows.find(r => r.id === rowId);
    if (row) row.cells[colId] = '';
  }
  shAutoSave();
  renderSheetMode();
}

/**
 * Adjust cell references in a formula by a row/col offset.
 * e.g. "=SUM(B2:C2)" with rowDelta=1 → "=SUM(B3:C3)"
 */
function _adjustFormulaRefs(formula, rowDelta, colDelta) {
  // Match cell references like A1, AB12, etc.
  return formula.replace(/([A-Z]+)(\d+)/g, (match, colLetters, rowNum) => {
    // Convert column letters to index
    let colIdx = 0;
    for (let i = 0; i < colLetters.length; i++) {
      colIdx = colIdx * 26 + (colLetters.charCodeAt(i) - 64);
    }
    colIdx -= 1; // 0-based
    const rowIdx = parseInt(rowNum) - 1; // 0-based

    const newCol = Math.max(0, colIdx + colDelta);
    const newRow = Math.max(0, rowIdx + rowDelta);
    return colIndexToLetter(newCol) + (newRow + 1);
  });
}

/**
 * Paste from clipboard into sheet starting at selected cell.
 * Formulas are adjusted relative to source position.
 */
export async function shPaste() {
  const sh = S.sheet.current;
  if (!sh || !S.sheet.selectedCell) return;

  const clipText = await _readFromClipboard();
  if (!clipText) return;

  shPushUndo();

  const lines = clipText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const startRowIdx = sh.rows.findIndex(r => r.id === S.sheet.selectedCell.rowId);
  const startColIdx = sh.columns.findIndex(c => c.id === S.sheet.selectedCell.colId);
  if (startRowIdx < 0 || startColIdx < 0) return;

  // Calculate offset from source position for formula adjustment
  const meta = _shCopyMeta;
  const rowDelta = meta ? startRowIdx - meta.srcRowIdx : 0;
  const colDelta = meta ? startColIdx - meta.srcColIdx : 0;

  for (let r = 0; r < lines.length; r++) {
    const rowIdx = startRowIdx + r;
    while (rowIdx >= sh.rows.length) {
      const cells = {};
      sh.columns.forEach(col => { cells[col.id] = ''; });
      sh.rows.push({ id: shId('row'), cells });
    }
    const cols = lines[r].split('\t');
    for (let c = 0; c < cols.length; c++) {
      const colIdx = startColIdx + c;
      while (colIdx >= sh.columns.length) {
        const newCol = { id: shId('col'), name: '', width: DEFAULT_COL_WIDTH };
        sh.columns.push(newCol);
        sh.rows.forEach(row => { row.cells[newCol.id] = ''; });
      }
      let val = cols[c];
      // Adjust formula references relative to source→destination offset
      if (val.startsWith('=') && meta && (rowDelta !== 0 || colDelta !== 0)) {
        val = _adjustFormulaRefs(val, rowDelta, colDelta);
      }
      sh.rows[rowIdx].cells[sh.columns[colIdx].id] = val;
    }
  }
  sh.columns.forEach((col, i) => { col.name = colIndexToLetter(i); });

  shAutoSave();
  renderSheetMode();
}

/**
 * Paste values only (Ctrl+Shift+V) — evaluates formulas before pasting.
 */
export async function shPasteValues() {
  const sh = S.sheet.current;
  if (!sh || !S.sheet.selectedCell) return;

  // If we have internal copy meta, re-read as values
  const { text } = _getSelectionText(sh, true);
  // But we use clipboard since it's already there
  const clipText = await _readFromClipboard();
  if (!clipText) return;

  shPushUndo();

  const lines = clipText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const startRowIdx = sh.rows.findIndex(r => r.id === S.sheet.selectedCell.rowId);
  const startColIdx = sh.columns.findIndex(c => c.id === S.sheet.selectedCell.colId);
  if (startRowIdx < 0 || startColIdx < 0) return;

  for (let r = 0; r < lines.length; r++) {
    const rowIdx = startRowIdx + r;
    while (rowIdx >= sh.rows.length) {
      const cells = {};
      sh.columns.forEach(col => { cells[col.id] = ''; });
      sh.rows.push({ id: shId('row'), cells });
    }
    const cols = lines[r].split('\t');
    for (let c = 0; c < cols.length; c++) {
      const colIdx = startColIdx + c;
      while (colIdx >= sh.columns.length) {
        const newCol = { id: shId('col'), name: '', width: DEFAULT_COL_WIDTH };
        sh.columns.push(newCol);
        sh.rows.forEach(row => { row.cells[newCol.id] = ''; });
      }
      let val = cols[c];
      // Evaluate formula to get value
      if (val.startsWith('=')) {
        const evaled = shEvalFormula(val, sh);
        val = (typeof evaled === 'object') ? '' : String(evaled);
      }
      sh.rows[rowIdx].cells[sh.columns[colIdx].id] = val;
    }
  }
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
/**
 * Get selection text. When valuesOnly=false (default), copies raw cell content
 * including formulas. When valuesOnly=true, copies evaluated values.
 */
function _getSelectionText(sh, valuesOnly) {
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
        if (valuesOnly && raw.startsWith('=')) {
          const display = shEvalFormula(raw, sh);
          vals.push(typeof display === 'object' ? '' : String(display));
        } else {
          vals.push(raw);
        }
        cells.push({ rowId: row.id, colId });
      }
      lines.push(vals.join('\t'));
    }
    return { text: lines.join('\n'), cells, startRowIdx: minR, startColIdx: minC };
  }

  // Single cell
  if (S.sheet.selectedCell) {
    const { rowId, colId } = S.sheet.selectedCell;
    const row = sh.rows.find(r => r.id === rowId);
    if (!row) return { text: '', cells: [] };
    const raw = row.cells[colId] || '';
    if (valuesOnly && raw.startsWith('=')) {
      const display = shEvalFormula(raw, sh);
      const text = typeof display === 'object' ? '' : String(display);
      return { text, cells: [{ rowId, colId }] };
    }
    return { text: raw, cells: [{ rowId, colId }] };
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
  cellEl.textContent = `=${funcName}()`;
  cellEl.focus();
  // Place cursor between the parens: =SUM(|)
  _setCursorAfter(cellEl, `=${funcName}(`.length);
  shHideFuncPicker();
  shEnterFormulaRefMode();
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
    cellEl.textContent = `=${funcName}()`;
    cellEl.focus();
    _setCursorAfter(cellEl, `=${funcName}(`.length);
    shEnterFormulaRefMode();
  });
}

// ═══════════════════════════════════════════
// CELL BACKGROUND COLOR
// ═══════════════════════════════════════════

const MONET_PALETTE = [
  '#2C3E6B','#4A6FA5','#6B8FC5','#8FAFD5', // Monet Blues
  '#C4783A','#D9945A','#E8B07A','#F0C89A', // Monet Oranges
  '#3A6B3A','#5A8A5A','#7AAF7A','#9ACF9A', // Monet Greens
  '#6B4A6B','#8B6B8B','#A889A8','#C4A5C4', // Monet Purples
  '#8B6B4A','#A88A6A','#C4A882','#D9C8A5', // Monet Earth
  '#1a1a1a','#2a2a2a','#333333','#555555', // Dark grays
  '#888888','#aaaaaa','#cccccc','#ffffff', // Light grays
  'transparent', // clear
];

export function shSetCellBg(color) {
  const sh = S.sheet.current;
  if (!sh) return;

  // Apply to range or single cell
  const rangeSet = _getRangeSet();
  const targets = [];
  if (rangeSet) {
    for (const key of rangeSet) {
      const [rowId, colId] = key.split(':');
      targets.push({ rowId, colId });
    }
  } else if (S.sheet.selectedCell) {
    targets.push(S.sheet.selectedCell);
  }
  if (targets.length === 0) return;

  shPushUndo();
  for (const { rowId, colId } of targets) {
    const row = sh.rows.find(r => r.id === rowId);
    if (!row) continue;
    if (!row.cellStyles) row.cellStyles = {};
    if (!row.cellStyles[colId]) row.cellStyles[colId] = {};
    if (color === 'transparent') {
      delete row.cellStyles[colId].bg;
    } else {
      row.cellStyles[colId].bg = color;
    }
  }
  shAutoSave();
  renderSheetMode();
}

let _shBgPickerEl = null;

export function shToggleBgPicker() {
  if (_shBgPickerEl && _shBgPickerEl.style.display === 'block') {
    _shBgPickerEl.style.display = 'none';
    return;
  }
  if (!_shBgPickerEl) {
    _shBgPickerEl = document.createElement('div');
    _shBgPickerEl.className = 'sh-bg-picker';
    document.body.appendChild(_shBgPickerEl);
  }
  _shBgPickerEl.innerHTML = MONET_PALETTE.map(c =>
    `<div class="sh-bg-swatch" style="background:${c === 'transparent' ? '#1a1a1a' : c};${c === 'transparent' ? 'background-image:linear-gradient(45deg,#333 25%,transparent 25%,transparent 75%,#333 75%),linear-gradient(45deg,#333 25%,transparent 25%,transparent 75%,#333 75%);background-size:8px 8px;background-position:0 0,4px 4px;' : ''}"
     title="${c}" onmousedown="event.preventDefault(); window.shSetCellBg('${c}'); document.querySelector('.sh-bg-picker').style.display='none';"></div>`
  ).join('');

  const btn = document.getElementById('shBgColorBtn');
  _shBgPickerEl.style.display = 'block';
  if (btn) {
    const r = btn.getBoundingClientRect();
    const pickerH = _shBgPickerEl.offsetHeight;
    _shBgPickerEl.style.left = r.left + 'px';
    _shBgPickerEl.style.top = (r.top - pickerH - 6) + 'px';
  }

  setTimeout(() => {
    document.addEventListener('click', function _c(ev) {
      if (_shBgPickerEl && !_shBgPickerEl.contains(ev.target)) {
        _shBgPickerEl.style.display = 'none';
        document.removeEventListener('click', _c);
      }
    });
  }, 10);
}

// ═══════════════════════════════════════════
// HEADER CONTEXT MENUS + FREEZE
// ═══════════════════════════════════════════

let _shHeaderMenuEl = null;

function _showHeaderMenu(event, items) {
  event.stopPropagation();
  // If menu is already visible, hide it (toggle behavior)
  if (_shHeaderMenuEl && _shHeaderMenuEl.style.display === 'block') {
    _shHeaderMenuEl.style.display = 'none';
    return;
  }
  if (!_shHeaderMenuEl) {
    _shHeaderMenuEl = document.createElement('div');
    _shHeaderMenuEl.className = 'sh-header-menu';
    document.body.appendChild(_shHeaderMenuEl);
  }
  _shHeaderMenuEl.innerHTML = items.map(it =>
    it.divider ? '<div class="sh-hm-divider"></div>' :
    `<div class="sh-hm-item${it.disabled ? ' disabled' : ''}" onclick="event.stopPropagation();${it.disabled ? '' : it.action};this.closest('.sh-header-menu').style.display='none';">
      <span>${it.label}</span>${it.info ? `<span class="sh-hm-info">${it.info}</span>` : ''}
    </div>`
  ).join('');

  // Position above the clicked element
  const target = event.currentTarget || event.target;
  const rect = target.getBoundingClientRect();
  _shHeaderMenuEl.style.display = 'block';
  const menuH = _shHeaderMenuEl.offsetHeight;
  let top = rect.top - menuH - 4;
  // If not enough room above, show below
  if (top < 4) top = rect.bottom + 4;
  _shHeaderMenuEl.style.left = rect.left + 'px';
  _shHeaderMenuEl.style.top = top + 'px';

  setTimeout(() => {
    document.addEventListener('click', function _c() {
      if (_shHeaderMenuEl) _shHeaderMenuEl.style.display = 'none';
      document.removeEventListener('click', _c);
    });
  }, 10);
}

export function shCellCtx(event, rowId, colId) {
  // Simple cell context menu
  _showHeaderMenu(event, [
    { label: 'Copy', action: 'window.shCopy()', info: 'Ctrl+C' },
    { label: 'Cut', action: 'window.shCut()', info: 'Ctrl+X' },
    { label: 'Paste', action: 'window.shPaste()', info: 'Ctrl+V' },
    { divider: true },
    { label: 'Clear cell', action: `window.shPushUndo(); window.shSetCellValue('${rowId}','${colId}',''); window.renderSheetMode();` },
  ]);
}

export function shColHeaderCtx(event, colId) {
  const sh = S.sheet.current;
  if (!sh) return;
  const colIdx = sh.columns.findIndex(c => c.id === colId);
  const isFirst = colIdx === 0;
  const isFrozen = sh.frozenCols > 0;
  _showHeaderMenu(event, [
    { label: 'Copy column', action: `window.shCopyCol('${colId}')` },
    { label: 'Paste into column', action: `window.shPasteCol('${colId}')` },
    { divider: true },
    { label: 'Insert column left', action: `window.shPushUndo(); window.shInsertColAt('${colId}', 'before')` },
    { label: 'Insert column right', action: `window.shPushUndo(); window.shInsertColAt('${colId}', 'after')` },
    { label: 'Delete column', action: `window.shPushUndo(); window.shDeleteCol('${colId}')`, disabled: sh.columns.length <= 1 },
    { divider: true },
    { label: isFrozen ? 'Unfreeze first column' : 'Freeze first column',
      action: `window.shToggleFreezeCol()`, disabled: !isFirst && !isFrozen },
  ]);
}

export function shRowHeaderCtx(event, rowId) {
  const sh = S.sheet.current;
  if (!sh) return;
  const rowIdx = sh.rows.findIndex(r => r.id === rowId);
  const isFirst = rowIdx === 0;
  const isFrozen = sh.frozenRows > 1; // frozenRows default=1 means header only; >1 means first data row frozen
  _showHeaderMenu(event, [
    { label: 'Copy row', action: `window.shCopyRow('${rowId}')` },
    { label: 'Paste into row', action: `window.shPasteRow('${rowId}')` },
    { divider: true },
    { label: 'Insert row above', action: `window.shPushUndo(); window.shInsertRowAt('${rowId}', 'before')` },
    { label: 'Insert row below', action: `window.shPushUndo(); window.shInsertRowAt('${rowId}', 'after')` },
    { label: 'Delete row', action: `window.shPushUndo(); window.shDeleteRow('${rowId}')`, disabled: sh.rows.length <= 1 },
    { divider: true },
    { label: isFrozen ? 'Unfreeze first row' : 'Freeze first row',
      action: `window.shToggleFreezeRow()`, disabled: !isFirst && !isFrozen },
  ]);
}

// ── Insert row/col at position ──

export function shInsertRowAt(rowId, pos) {
  const sh = S.sheet.current;
  if (!sh) return;
  const idx = sh.rows.findIndex(r => r.id === rowId);
  if (idx < 0) return;
  const cells = {};
  sh.columns.forEach(col => { cells[col.id] = ''; });
  const newRow = { id: shId('row'), cells };
  sh.rows.splice(pos === 'before' ? idx : idx + 1, 0, newRow);
  renderSheetMode();
  shAutoSave();
}

export function shInsertColAt(colId, pos) {
  const sh = S.sheet.current;
  if (!sh) return;
  const idx = sh.columns.findIndex(c => c.id === colId);
  if (idx < 0) return;
  const insertIdx = pos === 'before' ? idx : idx + 1;
  const newCol = { id: shId('col'), name: '', width: DEFAULT_COL_WIDTH };
  sh.columns.splice(insertIdx, 0, newCol);
  sh.columns.forEach((c, i) => { c.name = colIndexToLetter(i); });
  sh.rows.forEach(row => { row.cells[newCol.id] = ''; });
  renderSheetMode();
  shAutoSave();
}

// ── Copy/Paste entire row/col ──

export function shCopyRow(rowId) {
  const sh = S.sheet.current;
  if (!sh) return;
  const row = sh.rows.find(r => r.id === rowId);
  if (!row) return;
  const vals = sh.columns.map(col => row.cells[col.id] || '');
  _copyToClipboard(vals.join('\t'));
}

export function shCopyCol(colId) {
  const sh = S.sheet.current;
  if (!sh) return;
  const vals = sh.rows.map(row => row.cells[colId] || '');
  _copyToClipboard(vals.join('\n'));
}

export async function shPasteRow(rowId) {
  const sh = S.sheet.current;
  if (!sh) return;
  const text = await _readFromClipboard();
  if (!text) return;
  shPushUndo();
  const row = sh.rows.find(r => r.id === rowId);
  if (!row) return;
  const vals = text.split('\t');
  for (let c = 0; c < Math.min(vals.length, sh.columns.length); c++) {
    row.cells[sh.columns[c].id] = vals[c];
  }
  shAutoSave();
  renderSheetMode();
}

export async function shPasteCol(colId) {
  const sh = S.sheet.current;
  if (!sh) return;
  const text = await _readFromClipboard();
  if (!text) return;
  shPushUndo();
  const vals = text.split(/[\n\t]/);
  for (let r = 0; r < Math.min(vals.length, sh.rows.length); r++) {
    sh.rows[r].cells[colId] = vals[r];
  }
  shAutoSave();
  renderSheetMode();
}

// ── Freeze toggle ──

export function shToggleFreezeRow() {
  const sh = S.sheet.current;
  if (!sh) return;
  sh.frozenRows = sh.frozenRows > 1 ? 1 : 2; // 1=header only, 2=header+first data row
  renderSheetMode();
  shAutoSave();
}

export function shToggleFreezeCol() {
  const sh = S.sheet.current;
  if (!sh) return;
  sh.frozenCols = sh.frozenCols > 0 ? 0 : 1;
  renderSheetMode();
  shAutoSave();
}

// ═══════════════════════════════════════════
// AI INTEGRATION (placeholder for Step 11)
// ═══════════════════════════════════════════

/**
 * Serialize sheet as structured text for LLM context injection.
 * Includes both raw formulas and evaluated values so the LLM can understand the sheet.
 */
export function shSerializeForAI() {
  const sh = S.sheet.current;
  if (!sh) return '';

  // Build a rich representation
  const lines = [];

  // Header row with column letters
  const colNames = sh.columns.map(c => c.name);
  lines.push('| Row | ' + colNames.join(' | ') + ' |');
  lines.push('|' + colNames.map(() => '---').join('|') + '|');

  // Data rows
  for (let r = 0; r < sh.rows.length; r++) {
    const row = sh.rows[r];
    const cells = sh.columns.map(col => {
      const raw = row.cells[col.id] || '';
      if (!raw) return '';
      if (raw.startsWith('=')) {
        const v = shEvalFormula(raw, sh);
        const display = (typeof v === 'object') ? '#ERR' : String(v);
        return `${raw} → ${display}`;
      }
      return raw;
    });
    lines.push(`| ${r + 1} | ` + cells.join(' | ') + ' |');
  }

  return lines.join('\n');
}

/**
 * Convert any sheet data (live or workspace-stored) to compact Markdown table.
 * Accepts either the live S.sheet.current or a workspace file's content object.
 * Token-efficient: ~70-80% smaller than raw JSON.
 */
export function sheetToMarkdownTable(sheetData) {
  const sh = sheetData || S.sheet.current;
  if (!sh || !sh.columns || !sh.rows) return '';
  const cols = sh.columns;
  const colNames = cols.map(c => c.name || c.id);
  const lines = [];
  lines.push('| ' + colNames.join(' | ') + ' |');
  lines.push('|' + cols.map(() => ' --- ').join('|') + '|');
  for (const row of sh.rows) {
    const cells = cols.map(col => {
      const raw = row.cells?.[col.id] ?? '';
      if (!raw) return '';
      // For formulas, show evaluated result
      if (typeof raw === 'string' && raw.startsWith('=')) {
        try {
          const v = shEvalFormula(raw, sh);
          return (typeof v === 'object') ? '#ERR' : String(v);
        } catch { return raw; }
      }
      return String(raw);
    });
    lines.push('| ' + cells.join(' | ') + ' |');
  }
  return lines.join('\n');
}

/**
 * Convert any sheet data to CSV string.
 * Even more compact than markdown for very large sheets.
 */
export function sheetToCSV(sheetData) {
  const sh = sheetData || S.sheet.current;
  if (!sh || !sh.columns || !sh.rows) return '';
  const cols = sh.columns;
  const escape = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [];
  lines.push(cols.map(c => escape(c.name || c.id)).join(','));
  for (const row of sh.rows) {
    const cells = cols.map(col => {
      const raw = row.cells?.[col.id] ?? '';
      if (typeof raw === 'string' && raw.startsWith('=')) {
        try {
          const v = shEvalFormula(raw, sh);
          return escape((typeof v === 'object') ? '#ERR' : v);
        } catch { return escape(raw); }
      }
      return escape(raw);
    });
    lines.push(cells.join(','));
  }
  return lines.join('\n');
}

/**
 * Get info about the current selection (cell, range) for AI context.
 */
export function shGetSelectionContext() {
  const sh = S.sheet.current;
  if (!sh) return '';

  const parts = [];

  // Selected cell
  if (S.sheet.selectedCell) {
    const { rowId, colId } = S.sheet.selectedCell;
    const rIdx = sh.rows.findIndex(r => r.id === rowId);
    const cIdx = sh.columns.findIndex(c => c.id === colId);
    if (rIdx >= 0 && cIdx >= 0) {
      const raw = sh.rows[rIdx].cells[colId] || '';
      const label = colIndexToLetter(cIdx) + (rIdx + 1);
      if (raw.startsWith('=')) {
        const v = shEvalFormula(raw, sh);
        const display = (typeof v === 'object') ? '#ERR' : String(v);
        parts.push(`Selected cell: ${label} contains formula "${raw}" which evaluates to ${display}`);
      } else {
        parts.push(`Selected cell: ${label} = "${raw}"`);
      }
    }
  }

  // Selected range
  if (S.sheet.selectedRange) {
    const { start, end } = S.sheet.selectedRange;
    const r1 = sh.rows.findIndex(r => r.id === start.rowId);
    const c1 = sh.columns.findIndex(c => c.id === start.colId);
    const r2 = sh.rows.findIndex(r => r.id === end.rowId);
    const c2 = sh.columns.findIndex(c => c.id === end.colId);
    if (r1 >= 0 && c1 >= 0 && r2 >= 0 && c2 >= 0) {
      const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
      const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
      const rangeLabel = colIndexToLetter(minC) + (minR + 1) + ':' + colIndexToLetter(maxC) + (maxR + 1);
      parts.push(`Selected range: ${rangeLabel}`);

      // Collect values in range for context
      const vals = [];
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          const raw = sh.rows[r].cells[sh.columns[c].id] || '';
          if (raw) {
            const label = colIndexToLetter(c) + (r + 1);
            if (raw.startsWith('=')) {
              const v = shEvalFormula(raw, sh);
              vals.push(`${label}: ${raw} → ${typeof v === 'object' ? '#ERR' : v}`);
            } else {
              vals.push(`${label}: ${raw}`);
            }
          }
        }
      }
      if (vals.length > 0 && vals.length <= 50) {
        parts.push('Range contents: ' + vals.join(', '));
      }
    }
  }

  // Frozen state
  if (sh.frozenRows > 1) parts.push('First row is frozen');
  if (sh.frozenCols > 0) parts.push('First column is frozen');

  return parts.join('. ');
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

  // Auto-register in workspace so auto-save works from the start
  if (window.wsLoad && window.wsSave) {
    const files = window.wsLoad();
    const wsId = 'ws_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7);
    const { title, ...content } = S.sheet.current;
    files.push({
      id: wsId,
      type: 'sheet',
      title: title || 'Untitled Sheet',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      content
    });
    window.wsSave(files);
    S._wsCurrentFileId = wsId;
  }

  window.modeEnter('sheet');
}

/**
 * Load arbitrary sheet data (e.g. from AI conversion).
 * Replaces current sheet, registers in workspace, and re-renders.
 */
export function shLoadData(sheetData) {
  if (!sheetData || !sheetData.columns || !sheetData.rows) return;
  S.sheet.current = {
    title: sheetData.title || 'Untitled Sheet',
    columns: sheetData.columns,
    rows: sheetData.rows,
    frozenRows: sheetData.frozenRows ?? 1,
    frozenCols: sheetData.frozenCols ?? 0,
    created: sheetData.created || new Date().toISOString(),
    updated: sheetData.updated || new Date().toISOString(),
  };
  S.sheet.undoStack = [];
  S.sheet.redoStack = [];
  S.sheet.selectedCell = null;
  S.sheet.editingCell = null;
  S.sheet.selectedRange = null;

  // Register in workspace
  if (window.wsLoad && window.wsSave) {
    const files = window.wsLoad();
    const wsId = sheetData.id || ('ws_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7));
    const { title, ...content } = S.sheet.current;
    files.push({
      id: wsId,
      type: 'sheet',
      title: title || 'Untitled Sheet',
      created: S.sheet.current.created,
      updated: S.sheet.current.updated,
      content
    });
    window.wsSave(files);
    S._wsCurrentFileId = wsId;
  }

  if (window.renderSheetMode) window.renderSheetMode();
}
