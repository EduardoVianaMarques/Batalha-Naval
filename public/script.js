const socket = io();

const SHIPS = [
  { name: 'Porta-aviões', size: 5, id: 'carrier' },
  { name: 'Couraçado', size: 4, id: 'battleship' },
  { name: 'Cruzador', size: 3, id: 'cruiser' },
  { name: 'Submarino', size: 3, id: 'submarine' },
  { name: 'Destroyer', size: 2, id: 'destroyer' }
];

let roomId = null;
let myTurn = false;
let locked = false;
let orientation = 'horizontal';

const playerGrid = document.getElementById('playerGrid');
const enemyGrid = document.getElementById('enemyGrid');
const shipList = document.getElementById('shipList');
const statusEl = document.getElementById('status');
const rotateBtn = document.getElementById('rotate');
const readyBtn = document.getElementById('ready');

let playerCells = [];
let enemyCells = [];
let playerShips = [];

// === Criação dos grids ===
function createGrid(container, arr, clickHandler) {
  container.innerHTML = '';
  for (let i = 0; i < 100; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.index = i;
    if (clickHandler) cell.addEventListener('click', clickHandler);
    container.appendChild(cell);
    arr.push(cell);
  }
}
createGrid(playerGrid, playerCells);
createGrid(enemyGrid, enemyCells, handleAttack);

// === Renderizar lista de navios ===
function renderShipList() {
  shipList.innerHTML = '';
  SHIPS.forEach(ship => {
    const div = document.createElement('div');
    div.className = 'ship-item';
    div.draggable = true;
    div.dataset.id = ship.id;
    div.dataset.size = ship.size;
    div.textContent = `${ship.name} (${ship.size})`;

    // cor/efeito
    const swatch = document.createElement('div');
    swatch.className = 'ship-swatch';
    swatch.style.width = `${ship.size * 30}px`;
    div.appendChild(swatch);

    div.addEventListener('dragstart', dragStart);
    shipList.appendChild(div);
  });
}
renderShipList();

// === Drag & Drop ===
let draggedShip = null;

function dragStart(e) {
  if (locked) return;
  draggedShip = {
    id: e.target.dataset.id,
    size: parseInt(e.target.dataset.size)
  };
  e.dataTransfer.effectAllowed = 'move';
}

playerCells.forEach(cell => {
  cell.addEventListener('dragover', e => {
    if (!draggedShip || locked) return;
    e.preventDefault();
  });

  cell.addEventListener('drop', e => {
    if (!draggedShip || locked) return;
    const idx = +cell.dataset.index;
    placeShip(idx);
  });

  cell.addEventListener('click', e => {
    if (locked) return;
    const c = e.target;
    if (c.classList.contains('ship-cell')) {
      const shipId = c.dataset.shipId;
      removeShip(shipId);
    }
  });
});

function placeShip(startIdx) {
  const ship = draggedShip;
  const row = Math.floor(startIdx / 10);
  const col = startIdx % 10;
  const cells = [];

  for (let i = 0; i < ship.size; i++) {
    const r = orientation === 'horizontal' ? row : row + i;
    const c = orientation === 'horizontal' ? col + i : col;
    if (r > 9 || c > 9) return; // fora do tabuleiro
    const idx = r * 10 + c;
    if (playerCells[idx].dataset.state === 'ship') return; // sobreposição
    cells.push(idx);
  }

  cells.forEach(idx => {
    playerCells[idx].classList.add('ship-cell');
    playerCells[idx].dataset.state = 'ship';
    playerCells[idx].dataset.shipId = ship.id;
  });

  playerShips.push({ ...ship, coords: cells });
  document.querySelector(`[data-id="${ship.id}"]`)?.remove();
  draggedShip = null;
}

function removeShip(shipId) {
  playerShips = playerShips.filter(s => {
    if (s.id === shipId) {
      s.coords.forEach(idx => {
        const c = playerCells[idx];
        c.classList.remove('ship-cell');
        delete c.dataset.state;
        delete c.dataset.shipId;
      });
      // retorna para lista
      const shipData = SHIPS.find(x => x.id === shipId);
      if (shipData) {
        const div = document.createElement('div');
        div.className = 'ship-item';
        div.draggable = true;
        div.dataset.id = shipData.id;
        div.dataset.size = shipData.size;
        div.textContent = `${shipData.name} (${shipData.size})`;
        const swatch = document.createElement('div');
        swatch.className = 'ship-swatch';
        swatch.style.width = `${shipData.size * 30}px`;
        div.appendChild(swatch);
        div.addEventListener('dragstart', dragStart);
        shipList.appendChild(div);
      }
      return false;
    }
    return true;
  });
}

rotateBtn.addEventListener('click', () => {
  orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
  rotateBtn.classList.toggle('rotated');
});

readyBtn.addEventListener('click', () => {
  if (playerShips.length !== SHIPS.length) {
    alert('Posicione todos os navios antes de continuar!');
    return;
  }
  locked = true;
  readyBtn.disabled = true;
  shipList.innerHTML = '';
  const boardState = playerCells.map(c => c.classList.contains('ship-cell'));
  socket.emit('ready', { roomId, board: boardState });
  statusEl.textContent = 'Aguardando oponente...';
});

// === Multiplayer ===
socket.on('connect', () => (statusEl.textContent = '🟡 Aguardando outro jogador...'));
socket.on('waiting', msg => (statusEl.textContent = msg));
socket.on('match_found', ({ roomId: r }) => {
  roomId = r;
  statusEl.textContent = '🟢 Adversário encontrado!';
});
socket.on('both_ready', () => {
  myTurn = Math.random() < 0.5;
  statusEl.textContent = myTurn ? 'Seu turno!' : 'Turno do inimigo...';
});
socket.on('incoming_attack', ({ targetIndex }) => {
  const cell = playerCells[targetIndex];
  const hit = cell.classList.contains('ship-cell');
  cell.classList.add(hit ? 'hit' : 'miss');
  socket.emit('attack_result', { roomId, targetIndex, hit });
  myTurn = true;
  statusEl.textContent = 'Seu turno!';
});
socket.on('attack_feedback', ({ targetIndex, hit }) => {
  const cell = enemyCells[targetIndex];
  cell.classList.add(hit ? 'hit' : 'miss');
  myTurn = false;
  statusEl.textContent = 'Turno do inimigo...';
});
socket.on('opponent_left', () => {
  alert('❌ Oponente saiu da partida.');
  location.reload();
});

function handleAttack(e) {
  if (!myTurn || !roomId || !locked) return;
  const idx = +e.target.dataset.index;
  socket.emit('attack', { roomId, targetIndex: idx });
  myTurn = false;
  statusEl.textContent = 'Turno do inimigo...';
}

socket.on('game_won', () => {
  alert('🎉 Parabéns! Você venceu a partida!');
  statusEl.textContent = 'Vitória!';
  locked = true;
});

socket.on('game_lost', () => {
  alert('💀 Você perdeu a partida.');
  statusEl.textContent = 'Derrota!';
  locked = true;
});

