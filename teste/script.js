// --- Configurações ---
const COLS = 15, ROWS = 15, CELL = 45;
const gridEl = document.getElementById("grid");
const sound = document.getElementById("placeSound");

let occupancy = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
let items = {};
let nextId = 1;

// --- Funções auxiliares ---
const pxToCell = x => Math.floor(x / CELL);
const cellToPx = c => c * CELL;
const canPlace = (r, c, h, w, id = null) => {
  if (r < 0 || c < 0 || r + h > ROWS || c + w > COLS) return false;
  for (let i = r; i < r + h; i++)
    for (let j = c; j < c + w; j++)
      if (occupancy[i][j] && occupancy[i][j] !== id) return false;
  return true;
};
const occupy = (id, r, c, h, w) => {
  for (let i = r; i < r + h; i++)
    for (let j = c; j < c + w; j++) occupancy[i][j] = id;
};
const clearOccupy = id => {
  for (let i = 0; i < ROWS; i++)
    for (let j = 0; j < COLS; j++)
      if (occupancy[i][j] === id) occupancy[i][j] = null;
};

// --- Criar unidade ---
function createItem(id, w, h, r, c, label) {
  const el = document.createElement("div");
  el.className = "item";
  el.dataset.id = id;
  el.style.width = w * CELL - 4 + "px";
  el.style.height = h * CELL - 4 + "px";
  el.style.left = cellToPx(c) + "px";
  el.style.top = cellToPx(r) + "px";
  el.innerHTML = `${label}<div class="resize-handle"></div>`;
  gridEl.appendChild(el);
  return el;
}

function addItem(w, h, r, c, label) {
  if (!canPlace(r, c, h, w)) return;
  const id = "unit" + nextId++;
  const el = createItem(id, w, h, r, c, label);
  occupy(id, r, c, h, w);
  items[id] = { id, w, h, r, c, el };
  attachEvents(items[id]);
  sound.currentTime = 0;
  sound.play();
}

// --- Eventos de arrasto e redimensionamento ---
function attachEvents(item) {
  const el = item.el,
    handle = el.querySelector(".resize-handle");
  let prev = { ...item };

  el.addEventListener("mousedown", ev => {
    if (ev.target === handle) return;
    ev.preventDefault();
    clearOccupy(item.id);
    const rect = gridEl.getBoundingClientRect();
    const offsetX = ev.clientX - rect.left - parseFloat(el.style.left);
    const offsetY = ev.clientY - rect.top - parseFloat(el.style.top);
    el.classList.add("dragging");

    const move = e => {
      let x = e.clientX - rect.left - offsetX;
      let y = e.clientY - rect.top - offsetY;
      let nc = Math.round(x / CELL),
        nr = Math.round(y / CELL);
      if (nc < 0) nc = 0;
      if (nr < 0) nr = 0;
      if (nc + item.w > COLS) nc = COLS - item.w;
      if (nr + item.h > ROWS) nr = ROWS - item.h;
      el.style.left = cellToPx(nc) + "px";
      el.style.top = cellToPx(nr) + "px";
      item._tempR = nr;
      item._tempC = nc;
      el.classList.toggle(
        "invalid",
        !canPlace(nr, nc, item.h, item.w, item.id)
      );
    };

    const up = e => {
      el.classList.remove("dragging");
      const nr = item._tempR ?? item.r,
        nc = item._tempC ?? item.c;
      if (canPlace(nr, nc, item.h, item.w, item.id)) {
        item.r = nr;
        item.c = nc;
        occupy(item.id, nr, nc, item.h, item.w);
        sound.currentTime = 0;
        sound.play();
      } else {
        el.style.left = cellToPx(prev.c) + "px";
        el.style.top = cellToPx(prev.r) + "px";
        occupy(item.id, prev.r, prev.c, prev.h, prev.w);
      }
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  });

  handle.addEventListener("mousedown", ev => {
    ev.stopPropagation();
    ev.preventDefault();
    clearOccupy(item.id);
    const rect = gridEl.getBoundingClientRect();
    const startW = item.w,
      startH = item.h;
    const move = e => {
      let dx = e.clientX - rect.left - parseFloat(el.style.left);
      let dy = e.clientY - rect.top - parseFloat(el.style.top);
      let nw = Math.max(1, Math.round((dx + 1) / CELL));
      let nh = Math.max(1, Math.round((dy + 1) / CELL));
      if (item.c + nw > COLS) nw = COLS - item.c;
      if (item.r + nh > ROWS) nh = ROWS - item.r;
      el.style.width = nw * CELL - 4 + "px";
      el.style.height = nh * CELL - 4 + "px";
      item._tempW = nw;
      item._tempH = nh;
      el.classList.toggle(
        "invalid",
        !canPlace(item.r, item.c, nh, nw, item.id)
      );
    };

    const up = e => {
      el.classList.remove("dragging");
      const nw = item._tempW ?? startW,
        nh = item._tempH ?? startH;
      if (canPlace(item.r, item.c, nh, nw, item.id)) {
        item.w = nw;
        item.h = nh;
        occupy(item.id, item.r, item.c, item.h, item.w);
        sound.currentTime = 0;
        sound.play();
      } else {
        el.style.width = startW * CELL - 4 + "px";
        el.style.height = startH * CELL - 4 + "px";
        occupy(item.id, item.r, item.c, startH, startW);
      }
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    el.classList.add("dragging");
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  });

  el.addEventListener("contextmenu", ev => {
    ev.preventDefault();
    if (confirm("Remover unidade?")) {
      clearOccupy(item.id);
      el.remove();
      delete items[item.id];
    }
  });
}

// --- Paleta ---
const palette = document.querySelectorAll(".palette-item");
let ghost = null;
palette.forEach(p => {
  p.addEventListener("dragstart", ev => {
    const w = +p.dataset.w,
      h = +p.dataset.h,
      label = p.innerText.trim();
    ev.dataTransfer.setData("text/plain", JSON.stringify({ w, h, label }));
    ghost = document.createElement("div");
    ghost.className = "ghost";
    ghost.textContent = label;
    ghost.style.width = w * CELL + "px";
    ghost.style.height = h * CELL + "px";
    document.body.appendChild(ghost);
  });
  p.addEventListener("dragend", () => {
    ghost?.remove();
    ghost = null;
  });
});

window.addEventListener("dragover", ev => {
  if (ghost) {
    ghost.style.left = ev.clientX + "px";
    ghost.style.top = ev.clientY + "px";
  }
  ev.preventDefault();
});

gridEl.addEventListener("dragover", ev => ev.preventDefault());
gridEl.addEventListener("drop", ev => {
  ev.preventDefault();
  const { w, h, label } = JSON.parse(ev.dataTransfer.getData("text/plain"));
  const rect = gridEl.getBoundingClientRect();
  let x = ev.clientX - rect.left,
    y = ev.clientY - rect.top;
  let c = Math.round(x / CELL) - Math.floor(w / 2);
  let r = Math.round(y / CELL) - Math.floor(h / 2);
  if (c < 0) c = 0;
  if (r < 0) r = 0;
  if (c + w > COLS) c = COLS - w;
  if (r + h > ROWS) r = ROWS - h;
  if (canPlace(r, c, h, w)) addItem(w, h, r, c, label);
// script.js
document.addEventListener("DOMContentLoaded", () => {
  const grid = document.querySelector(".grid");
  const logArea = document.getElementById("logArea");

  const rows = 20;
  const cols = 20;
  const totalShips = 15;
  const shipCells = new Set();
  const hitCells = new Set();

  // Criar grid 20x20
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement("div");
      cell.classList.add("cell");
      cell.dataset.row = r;
      cell.dataset.col = c;
      grid.appendChild(cell);
    }
  }

  // Gerar posições aleatórias de navios
  while (shipCells.size < totalShips) {
    const pos = `${Math.floor(Math.random() * rows)},${Math.floor(
      Math.random() * cols
    )}`;
    shipCells.add(pos);
  }

  // Converter coordenadas numéricas em formato A1, B5...
  const coordName = (r, c) => {
    const letter = String.fromCharCode(65 + r);
    return `${letter}${c + 1}`;
  };

  // Função de log no painel lateral
  function log(msg, type = "info") {
    const entry = document.createElement("div");
    entry.textContent = msg;
    entry.classList.add("log-entry", type);
    logArea.prepend(entry);
  }

  // Clique nas células
  grid.addEventListener("click", (e) => {
    const cell = e.target;
    if (!cell.classList.contains("cell")) return;

    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);
    const key = `${r},${c}`;

    if (hitCells.has(key)) return; // já clicado
    hitCells.add(key);

    if (shipCells.has(key)) {
      cell.style.backgroundColor = "var(--green)";
      log(`🎯 Acertou em ${coordName(r, c)}!`, "hit");
      shipCells.delete(key);
      if (shipCells.size === 0) {
        log("🏆 Todos os navios foram destruídos! Vitória!", "win");
      }
    } else {
      cell.style.backgroundColor = "#444";
      log(`💨 Errou em ${coordName(r, c)}.`, "miss");
    }
  });

  // Mensagem inicial
  log("💡 Clique nas células do mapa para atacar posições inimigas!");
});
});

