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

/* ---- Skins ----------------------------------------------------------------
   Cada skin define su paleta (array de 8, null en la posición 0 porque el
   índice de tipo de pieza hace de índice de color), el color de la rejilla y
   una función de dibujo de bloque (context, px, py, size, color) en píxeles.
--------------------------------------------------------------------------- */

const SKIN_KEY = 'tetris.skin';
const DEFAULT_SKIN = 'retro';

function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, w, h, r);
    return;
  }
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// Retro: comportamiento original (cuadrado plano + banda de highlight).
function drawBlockRetro(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

// Neon: núcleo tenue + contorno con glow. Resetea shadowBlur al salir.
function drawBlockNeon(context, px, py, size, color) {
  const inset = Math.max(2, Math.round(size * 0.08));
  const x = px + inset, y = py + inset;
  const w = size - inset * 2, h = size - inset * 2;
  context.fillStyle = withAlpha(color, 0.2);
  context.fillRect(x, y, w, h);
  context.shadowColor = color;
  context.shadowBlur = size * 0.5;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(x + 1, y + 1, w - 2, h - 2);
  context.shadowBlur = 0;
  context.shadowColor = 'rgba(0,0,0,0)';
}

// Pastel: colores suaves y esquinas redondeadas.
function drawBlockPastel(context, px, py, size, color) {
  const m = 2;
  const x = px + m, y = py + m, w = size - m * 2, h = size - m * 2;
  const r = Math.max(3, size * 0.24);
  context.fillStyle = color;
  roundRectPath(context, x, y, w, h, r);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.45)';
  roundRectPath(context, x + w * 0.16, y + h * 0.14, w * 0.68, h * 0.2, r * 0.5);
  context.fill();
  context.strokeStyle = 'rgba(90,80,110,0.25)';
  context.lineWidth = 1;
  roundRectPath(context, x + 0.5, y + 0.5, w - 1, h - 1, r);
  context.stroke();
}

// Pixel art: bisel de 1 "píxel" + dithering en damero.
function drawBlockPixel(context, px, py, size, color) {
  const u = size / 6;
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  context.fillStyle = 'rgba(255,255,255,0.38)';
  context.fillRect(px, py, size, u);
  context.fillRect(px, py, u, size);
  context.fillStyle = 'rgba(0,0,0,0.38)';
  context.fillRect(px, py + size - u, size, u);
  context.fillRect(px + size - u, py, u, size);
  context.fillStyle = 'rgba(255,255,255,0.16)';
  for (let i = 1; i < 5; i++)
    for (let j = 1; j < 5; j++)
      if ((i + j) % 2 === 0) context.fillRect(px + i * u, py + j * u, u, u);
  context.strokeStyle = 'rgba(0,0,0,0.55)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
}

const SKINS = {
  retro: {
    colors: COLORS,
    grid: '#22222e',
    draw: drawBlockRetro,
  },
  neon: {
    colors: [null, '#00e5ff', '#ffea00', '#d500f9', '#00ff85', '#ff1744', '#2979ff', '#ff9100'],
    grid: '#141428',
    draw: drawBlockNeon,
  },
  pastel: {
    colors: [null, '#a8e4ee', '#ffe9a8', '#dcc0f0', '#bde5c0', '#f5b7b7', '#b9c2ec', '#ffd6a8'],
    grid: '#e4dcef',
    draw: drawBlockPastel,
  },
  pixel: {
    colors: [null, '#00b8c4', '#f0c000', '#a040c0', '#40b040', '#d03030', '#3050c8', '#e08020'],
    grid: '#2b2b1e',
    draw: drawBlockPixel,
  },
};

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
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let activeSkin = DEFAULT_SKIN;

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
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
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

function currentSkin() {
  return SKINS[activeSkin] || SKINS[DEFAULT_SKIN];
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = currentSkin();
  const color = skin.colors[colorIndex] || COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.save();
  skin.draw(context, x * size, y * size, size, color);
  context.restore();
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = currentSkin().grid;
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

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
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
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function loadSkin() {
  try {
    const stored = localStorage.getItem(SKIN_KEY);
    if (stored && Object.prototype.hasOwnProperty.call(SKINS, stored)) return stored;
  } catch (err) {
    // localStorage puede lanzar (modo privado / cookies bloqueadas): skin por defecto.
  }
  return DEFAULT_SKIN;
}

function saveSkin(id) {
  try {
    localStorage.setItem(SKIN_KEY, id);
  } catch (err) {
    // Sin persistencia, pero el juego sigue funcionando.
  }
}

// Repinta ambos canvas al vuelo: en pausa o game over el rAF está cancelado.
function repaint() {
  if (board && current) draw();
  if (next) drawNext();
}

function applySkin(id) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, id)) id = DEFAULT_SKIN;
  activeSkin = id;
  for (const key of Object.keys(SKINS)) document.body.classList.remove('skin-' + key);
  document.body.classList.add('skin-' + id);
  if (skinSelect && skinSelect.value !== id) skinSelect.value = id;
  repaint();
}

if (skinSelect) {
  skinSelect.addEventListener('change', () => {
    applySkin(skinSelect.value);
    saveSkin(activeSkin);
    // Devolvemos el teclado al tablero: con el foco en el <select> las
    // flechas (y P) son suyas, no del juego.
    skinSelect.blur();
  });
}

document.addEventListener('keydown', e => {
  // Con el foco en un control de formulario (p. ej. el selector de skin)
  // el teclado es suyo, no del tablero.
  const tag = e.target && e.target.tagName;
  if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
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

restartBtn.addEventListener('click', init);

applySkin(loadSkin());
init();
