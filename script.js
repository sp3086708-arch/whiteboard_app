// ================= EMOJI PICKER =================
const EMOJIS = [
  '😀','😂','😍','🤔','😎','🥳','😢','😡','🤩','🥰',
  '👍','👎','👋','🙌','🤝','❤️','🔥','⭐','💡','🎉',
  '🌈','🌟','💯','✅','❌','🚀','🎨','🖌️','📝','💬'
];

const picker = document.getElementById('emojiPicker');
EMOJIS.forEach(em => {
  const b = document.createElement('button');
  b.className = 'ep-btn';
  b.textContent = em;
  b.onclick = () => { selectedEmoji = em; setTool('emoji'); picker.classList.remove('open'); };
  picker.appendChild(b);
});

function toggleEmojiPicker() { picker.classList.toggle('open'); }
document.addEventListener('click', e => {
  if (!picker.contains(e.target) && e.target.id !== 'btn-emoji') picker.classList.remove('open');
});

// ================= SETUP =================
const canvas       = document.getElementById('canvas');
const ctx          = canvas.getContext('2d');
const wrap         = document.getElementById('canvas-wrap');
const textInput    = document.getElementById('textInput');
const colorPicker  = document.getElementById('colorPicker');
const brushSizeEl  = document.getElementById('brushSize');
const fontFamilyEl = document.getElementById('fontFamily');
const fontSizeEl   = document.getElementById('fontSize');
const sizeVal      = document.getElementById('sizeVal');
const status       = document.getElementById('status');

brushSizeEl.addEventListener('input', () => sizeVal.textContent = brushSizeEl.value);

function resizeCanvas() {
  const r = wrap.getBoundingClientRect();
  canvas.width  = r.width;
  canvas.height = r.height;
  redraw();
}

// ================= STATE =================
// Single unified timeline: each entry is either a draw element or an erase stroke.
// Order matters — later entries draw on top of earlier ones.
// { kind: 'element', data: {...} }  — a drawn shape/path/text/emoji
// { kind: 'erase',   data: { points, size } } — an erase stroke

let tool            = 'draw';
let timeline        = [];   // unified ordered list
let currentPath     = null;
let currentErase    = null;
let selectedElement = null;
let selectionBox    = null;
let offsetX         = 0, offsetY = 0;
let selectedEmoji   = '😀';
let textPending     = null;
let isMouseDown     = false;
let history         = [];
let redoStack       = [];

// ================= HISTORY =================
function saveState() {
  history.push(JSON.stringify(timeline));
  if (history.length > 80) history.shift();
  redoStack = [];
  updateStatus();
}

function undo() {
  if (history.length <= 1) return;
  redoStack.push(history.pop());
  timeline = JSON.parse(history[history.length - 1]);
  selectedElement = null;
  redraw();
  updateStatus();
}

function redo() {
  if (!redoStack.length) return;
  const s = redoStack.pop();
  history.push(s);
  timeline = JSON.parse(s);
  redraw();
  updateStatus();
}

function clearCanvas() {
  if (!confirm('Clear everything?')) return;
  timeline = [];
  saveState();
  redraw();
}

function saveCanvas() {
  const flat  = document.createElement('canvas');
  flat.width  = canvas.width;
  flat.height = canvas.height;
  const fCtx  = flat.getContext('2d');
  fCtx.fillStyle = '#ffffff';
  fCtx.fillRect(0, 0, flat.width, flat.height);
  fCtx.drawImage(canvas, 0, 0);
  const link  = document.createElement('a');
  link.download = 'drawing.png';
  link.href = flat.toDataURL();
  link.click();
}

// ================= TOOL =================
function setTool(t) {
  tool = t;
  selectedElement = null;
  document.querySelectorAll('.tb-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('btn-' + t);
  if (el) el.classList.add('active');
  canvas.style.cursor = t === 'eraser' ? 'cell' : t === 'select' ? 'default' : 'crosshair';
  commitText();
  redraw();
  updateStatus();
}

function updateStatus() {
  const count = timeline.filter(e => e.kind === 'element').length;
  status.textContent = count + ' object' + (count !== 1 ? 's' : '');
}

function getPos(e) {
  const r = canvas.getBoundingClientRect();
  const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
  return { x: clientX - r.left, y: clientY - r.top };
}

// ================= TEXT =================
function commitText() {
  if (textPending && textInput.value.trim()) {
    timeline.push({
      kind: 'element',
      data: {
        type:  'text',
        value: textInput.value.trim(),
        x:     textPending.x,
        y:     textPending.y,
        color: colorPicker.value,
        size:  parseInt(fontSizeEl.value) || 18,
        font:  fontFamilyEl.value
      }
    });
    saveState();
    redraw();
  }
  textInput.style.display = 'none';
  textInput.value = '';
  textPending = null;
}

textInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
  if (e.key === 'Escape') {
    textPending = null;
    textInput.style.display = 'none';
    textInput.value = '';
  }
});

// ================= MOUSE DOWN =================
canvas.addEventListener('mousedown', e => {
  isMouseDown = true;
  const { x, y } = getPos(e);

  if (tool === 'eraser') {
    currentErase = { points: [{ x, y }], size: parseInt(brushSizeEl.value) * 3 };
    timeline.push({ kind: 'erase', data: currentErase });
    redraw();
    return;
  }

  if (tool === 'text') {
    commitText();
    textPending = { x, y };
    textInput.style.left       = x + 'px';
    textInput.style.top        = (y - (parseInt(fontSizeEl.value) || 18)) + 'px';
    textInput.style.fontSize   = (fontSizeEl.value || 18) + 'px';
    textInput.style.fontFamily = fontFamilyEl.value;
    textInput.style.color      = colorPicker.value;
    textInput.style.display    = 'block';
    textInput.focus();
    return;
  }

  if (tool === 'emoji') {
    timeline.push({
      kind: 'element',
      data: { type: 'emoji', value: selectedEmoji, x, y, size: 32 }
    });
    saveState(); redraw(); return;
  }

  if (tool === 'select') {
    // hit-test in reverse order (topmost first)
    const elements = timeline.filter(e => e.kind === 'element').map(e => e.data);
    for (let i = elements.length - 1; i >= 0; i--) {
      if (hitTest(elements[i], x, y)) {
        selectedElement = elements[i];
        offsetX = x; offsetY = y;
        return;
      }
    }
    selectionBox = { startX: x, startY: y, endX: x, endY: y };
    return;
  }

  if (['rectangle', 'circle', 'line'].includes(tool)) {
    currentPath = {
      type: tool,
      startX: x, startY: y,
      endX: x,   endY: y,
      color: colorPicker.value,
      size: brushSizeEl.value
    };
    timeline.push({ kind: 'element', data: currentPath });
    return;
  }

  // freehand draw
  currentPath = {
    type: 'path',
    points: [{ x, y }],
    color: colorPicker.value,
    size: brushSizeEl.value
  };
  timeline.push({ kind: 'element', data: currentPath });
});

// ================= MOUSE MOVE =================
canvas.addEventListener('mousemove', e => {
  const { x, y } = getPos(e);

  if (tool === 'eraser') {
    if (!isMouseDown || !currentErase) return;
    currentErase.points.push({ x, y });
    redraw();
    return;
  }

  if (!isMouseDown) return;

  if (selectionBox) {
    selectionBox.endX = x; selectionBox.endY = y;
    redraw(); return;
  }

  if (selectedElement) {
    const dx = x - offsetX, dy = y - offsetY;
    if (selectedElement.type === 'path') {
      selectedElement.points.forEach(p => { p.x += dx; p.y += dy; });
    } else if (['rectangle', 'circle', 'line'].includes(selectedElement.type)) {
      selectedElement.startX += dx; selectedElement.startY += dy;
      selectedElement.endX   += dx; selectedElement.endY   += dy;
    } else {
      selectedElement.x += dx; selectedElement.y += dy;
    }
    offsetX = x; offsetY = y;
    redraw(); return;
  }

  if (currentPath && ['rectangle', 'circle', 'line'].includes(currentPath.type)) {
    currentPath.endX = x; currentPath.endY = y;
    redraw(); return;
  }

  if (currentPath && currentPath.type === 'path') {
    currentPath.points.push({ x, y });
    redraw();
  }
});

// ================= MOUSE UP =================
canvas.addEventListener('mouseup', () => {
  isMouseDown = false;
  if (tool === 'eraser') { currentErase = null; saveState(); return; }
  if (selectionBox) { selectionBox = null; redraw(); }
  if (currentPath || selectedElement) saveState();
  currentPath = null;
  selectedElement = null;
});

canvas.addEventListener('mouseleave', () => {
  if (!isMouseDown) return;
  isMouseDown = false;
  if (tool === 'eraser') { currentErase = null; saveState(); return; }
  if (currentPath || selectedElement) saveState();
  currentPath = null;
  selectedElement = null;
});

// ================= TOUCH =================
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  isMouseDown = true;
  canvas.dispatchEvent(new MouseEvent('mousedown', {
    clientX: e.touches[0].clientX, clientY: e.touches[0].clientY
  }));
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  canvas.dispatchEvent(new MouseEvent('mousemove', {
    clientX: e.touches[0].clientX, clientY: e.touches[0].clientY
  }));
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  canvas.dispatchEvent(new MouseEvent('mouseup'));
}, { passive: false });

// ================= REDRAW =================
function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';

  // Walk the timeline in order.
  // Each entry is either a draw element (source-over) or an erase stroke (destination-out).
  // Because we switch composite mode per entry, drawing after an erase is NOT affected by it.
  timeline.forEach(entry => {
    if (entry.kind === 'erase') {
      drawEraseStroke(entry.data);
    } else {
      drawElement(entry.data);
    }
  });

  // Reset composite mode before drawing UI overlays
  ctx.globalCompositeOperation = 'source-over';

  if (selectionBox) {
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#4f8ef7';
    ctx.lineWidth   = 1;
    ctx.strokeRect(
      selectionBox.startX, selectionBox.startY,
      selectionBox.endX - selectionBox.startX,
      selectionBox.endY - selectionBox.startY
    );
    ctx.restore();
  }

  if (selectedElement) {
    const b = getBounds(selectedElement);
    if (b) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#4f8ef7';
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      ctx.restore();
    }
  }
}

function drawElement(el) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';

  if (el.type === 'path') {
    if (!el.points || el.points.length < 1) { ctx.restore(); return; }
    ctx.strokeStyle = el.color;
    ctx.lineWidth   = el.size;
    ctx.beginPath();
    el.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();

  } else if (el.type === 'rectangle') {
    ctx.strokeStyle = el.color;
    ctx.lineWidth   = el.size;
    ctx.strokeRect(el.startX, el.startY, el.endX - el.startX, el.endY - el.startY);

  } else if (el.type === 'circle') {
    ctx.strokeStyle = el.color;
    ctx.lineWidth   = el.size;
    const r = Math.hypot(el.endX - el.startX, el.endY - el.startY);
    ctx.beginPath();
    ctx.arc(el.startX, el.startY, r, 0, Math.PI * 2);
    ctx.stroke();

  } else if (el.type === 'line') {
    ctx.strokeStyle = el.color;
    ctx.lineWidth   = el.size;
    ctx.beginPath();
    ctx.moveTo(el.startX, el.startY);
    ctx.lineTo(el.endX, el.endY);
    ctx.stroke();

  } else if (el.type === 'emoji') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = el.size + 'px Segoe UI Emoji';
    ctx.fillText(el.value, el.x, el.y);

  } else if (el.type === 'text') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.font      = el.size + 'px ' + el.font;
    ctx.fillStyle = el.color;
    ctx.fillText(el.value, el.x, el.y);
  }

  ctx.restore();
}

function drawEraseStroke(stroke) {
  if (!stroke.points || stroke.points.length < 1) return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap   = 'round';
  ctx.lineJoin  = 'round';
  ctx.lineWidth = stroke.size * 2;
  ctx.strokeStyle = 'rgba(0,0,0,1)';
  ctx.beginPath();
  stroke.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.stroke();
  if (stroke.points.length === 1) {
    ctx.beginPath();
    ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();
  }
  ctx.restore();
}

// ================= HELPERS =================
function getBounds(el) {
  if (el.type === 'path') {
    if (!el.points || !el.points.length) return null;
    let x1 =  Infinity, y1 =  Infinity;
    let x2 = -Infinity, y2 = -Infinity;
    el.points.forEach(p => {
      x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
      x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
    });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  if (['rectangle', 'circle', 'line'].includes(el.type)) {
    return {
      x: Math.min(el.startX, el.endX),
      y: Math.min(el.startY, el.endY),
      w: Math.abs(el.endX - el.startX),
      h: Math.abs(el.endY - el.startY)
    };
  }
  return { x: el.x, y: el.y, w: 60, h: 40 };
}

function hitTest(el, x, y) {
  const b = getBounds(el);
  return b && x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4;
}

// ================= INIT =================
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
saveState();
setTool('draw');
updateStatus();

















