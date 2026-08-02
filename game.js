'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const gameoverExtra = document.getElementById('gameover-extra');
const overlayStats = document.getElementById('overlay-stats');
const saveRecordBox = document.getElementById('save-record');
const recordNameInput = document.getElementById('record-name');
const saveRecordBtn = document.getElementById('save-record-btn');
const overlayRecordsEl = document.getElementById('overlay-records');
const startScreen = document.getElementById('start-screen');
const startRecordsEl = document.getElementById('start-records');
const startStatsEl = document.getElementById('start-stats');
const playBtn = document.getElementById('play-btn');
const clearRecordsBtn = document.getElementById('clear-records-btn');
const clearConfirm = document.getElementById('clear-confirm');
const clearYesBtn = document.getElementById('clear-yes');
const clearNoBtn = document.getElementById('clear-no');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo, started, pendingRecord;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    // pieza bloqueada sin limpiar líneas: se rompe el combo
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = '#22222e';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

/* ---- Records (localStorage) ---- */

const RECORDS_KEY = 'tetris.records';
const MAX_RECORDS = 5;
const NAME_MAX = 10;

let recordsData = emptyRecords();

function emptyRecords() {
  return { records: [], mejorCombo: 0, maxLineas: 0 };
}

function sanitizeName(raw) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return name || 'Anónimo';
}

function toNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function loadRecords() {
  let raw = null;
  try {
    raw = localStorage.getItem(RECORDS_KEY);
  } catch (err) {
    return emptyRecords(); // localStorage no disponible (modo privado, etc.)
  }
  if (!raw) return emptyRecords();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return emptyRecords(); // JSON corrupto
  }
  if (!parsed || typeof parsed !== 'object') return emptyRecords();
  const list = Array.isArray(parsed.records) ? parsed.records : [];
  const records = list
    .filter(r => r && typeof r === 'object')
    .map(r => ({
      nombre: sanitizeName(r.nombre),
      puntuacion: toNumber(r.puntuacion),
      lineas: toNumber(r.lineas),
      fecha: typeof r.fecha === 'string' ? r.fecha.slice(0, 10) : '',
    }))
    .sort((a, b) => b.puntuacion - a.puntuacion)
    .slice(0, MAX_RECORDS);
  return {
    records,
    mejorCombo: toNumber(parsed.mejorCombo),
    maxLineas: toNumber(parsed.maxLineas),
  };
}

function saveRecordsData() {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(recordsData));
  } catch (err) {
    // sin persistencia (cuota o modo privado): el juego sigue funcionando
  }
}

function today() {
  const d = new Date(); // fecha local, no UTC
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length !== 3) return '—';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function statsText() {
  return `Mejor combo: ${recordsData.mejorCombo}  ·  Líneas máximas: ${recordsData.maxLineas}`;
}

function renderRecords(container, highlight) {
  container.textContent = '';
  if (!recordsData.records.length) {
    const empty = document.createElement('p');
    empty.className = 'records-empty';
    empty.textContent = 'Todavía no hay records';
    container.appendChild(empty);
    return;
  }
  const head = document.createElement('div');
  head.className = 'record-row record-head';
  appendCells(head, ['#', 'Nombre', 'Puntos', 'Líneas', 'Fecha']);
  container.appendChild(head);
  recordsData.records.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = i === highlight ? 'record-row record-new' : 'record-row';
    appendCells(row, [
      String(i + 1),
      r.nombre,
      r.puntuacion.toLocaleString(),
      String(r.lineas),
      formatDate(r.fecha),
    ]);
    container.appendChild(row);
  });
}

function appendCells(row, values) {
  for (const value of values) {
    const cell = document.createElement('span');
    cell.textContent = value; // nunca innerHTML: el nombre lo escribe el jugador
    row.appendChild(cell);
  }
}

function qualifies(value) {
  if (value <= 0) return false;
  if (recordsData.records.length < MAX_RECORDS) return true;
  return value > recordsData.records[recordsData.records.length - 1].puntuacion;
}

function saveCurrentRecord() {
  if (!pendingRecord) return;
  pendingRecord = false;
  const entry = {
    nombre: sanitizeName(recordNameInput.value),
    puntuacion: score,
    lineas: lines,
    fecha: today(),
  };
  recordsData.records.push(entry);
  recordsData.records.sort((a, b) => b.puntuacion - a.puntuacion);
  const index = recordsData.records.indexOf(entry);
  recordsData.records = recordsData.records.slice(0, MAX_RECORDS);
  saveRecordsData();
  saveRecordBox.classList.add('hidden');
  renderRecords(overlayRecordsEl, index < MAX_RECORDS ? index : -1);
}

function showGameOverRecords() {
  recordsData = loadRecords();
  if (maxCombo > recordsData.mejorCombo) recordsData.mejorCombo = maxCombo;
  if (lines > recordsData.maxLineas) recordsData.maxLineas = lines;
  saveRecordsData();
  overlayStats.textContent = `Combo de la partida: ${maxCombo}  ·  ${statsText()}`;
  pendingRecord = qualifies(score);
  if (pendingRecord) {
    recordNameInput.value = '';
    saveRecordBox.classList.remove('hidden');
  } else {
    saveRecordBox.classList.add('hidden');
  }
  renderRecords(overlayRecordsEl, -1);
  gameoverExtra.classList.remove('hidden');
  if (pendingRecord) recordNameInput.focus();
}

function showStartScreen() {
  recordsData = loadRecords();
  renderRecords(startRecordsEl, -1);
  startStatsEl.textContent = statsText();
  clearConfirm.classList.add('hidden');
  startScreen.classList.remove('hidden');
}

function clearAllRecords() {
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch (err) {
    // sin persistencia: al menos limpiamos la vista
  }
  recordsData = emptyRecords();
  renderRecords(startRecordsEl, -1);
  startStatsEl.textContent = statsText();
  clearConfirm.classList.add('hidden');
}

function endGame() {
  if (gameOver) return; // reentrante: no repetir el fin de partida
  gameOver = true;
  started = false;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  showGameOverRecords(); // después de mostrar el overlay para poder enfocar el input
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // si la partida ha terminado dentro de este mismo frame, animId ya no apunta
  // a una petición pendiente: hay que dejar de reprogramar el loop aquí.
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  combo = 0;
  maxCombo = 0;
  pendingRecord = false;
  started = true;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  overlay.classList.add('hidden');
  gameoverExtra.classList.add('hidden');
  saveRecordBox.classList.add('hidden');
  startScreen.classList.add('hidden');
  next = randomPiece();
  spawn(); // ojo: spawn() puede terminar la partida, así que va después de limpiar la UI
  updateHUD();
  cancelAnimationFrame(animId);
  if (!gameOver) animId = requestAnimationFrame(loop);
}

function isTyping(target) {
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}

document.addEventListener('keydown', e => {
  if (isTyping(e.target)) return; // escribir el nombre no debe mover la pieza
  if (e.code === 'Space') e.preventDefault(); // nunca hacer scroll con la barra
  if (!started) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => { restartBtn.blur(); init(); });

playBtn.addEventListener('click', () => { playBtn.blur(); init(); });

clearRecordsBtn.addEventListener('click', () => {
  clearRecordsBtn.blur();
  clearConfirm.classList.remove('hidden');
});

clearYesBtn.addEventListener('click', () => { clearYesBtn.blur(); clearAllRecords(); });

clearNoBtn.addEventListener('click', () => {
  clearNoBtn.blur();
  clearConfirm.classList.add('hidden');
});

saveRecordBtn.addEventListener('click', () => { saveRecordBtn.blur(); saveCurrentRecord(); });

recordNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    saveCurrentRecord();
  }
});

started = false;
showStartScreen();
