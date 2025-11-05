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
let playerName = '';
let placedShips = new Map(); // id -> { size, cells: [], sunk: false }

const playerGrid = document.getElementById('playerGrid');
const enemyGrid = document.getElementById('enemyGrid');
const shipList = document.getElementById('shipList');
const statusEl = document.getElementById('status');
const rotateBtn = document.getElementById('rotate');
const readyBtn = document.getElementById('ready');

// Modal de nome
const nameModal = document.getElementById('nameModal');
const confirmNameBtn = document.getElementById('confirmName');
const playerNameInput = document.getElementById('playerName');

confirmNameBtn.addEventListener('click', () => {
  const val = playerNameInput.value.trim();
  if (!val) return alert('Digite seu nome!');
  playerName = val;
  nameModal.style.display = 'none';
  socket.emit('set_name', playerName);
});

playerNameInput.addEventListener('keyup', (e) => {
  if (e.key === 'Enter') confirmNameBtn.click();
});

let playerCells = [];
let enemyCells = [];
let playerShips = [];
let enemyHits = 0;

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

function renderShipList() {
  shipList.innerHTML = '';
  SHIPS.forEach(ship => {
    const div = document.createElement('div');
    div.className = 'ship-item';
    div.draggable = true;
    div.dataset.id = ship.id;
    div.dataset.size = ship.size;
    div.textContent = `${ship.name} (${ship.size})`;

    const swatch = document.createElement('div');
    swatch.className = 'ship-swatch';
    swatch.style.width = `${ship.size * 30}px`;
    div.appendChild(swatch);

    div.addEventListener('dragstart', dragStart);
    shipList.appendChild(div);
  });
}
renderShipList();

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
    if (r > 9 || c > 9) return;
    const idx = r * 10 + c;
    if (playerCells[idx].dataset.state === 'ship') return;
    cells.push(idx);
  }

  cells.forEach(idx => {
    playerCells[idx].classList.add('ship-cell');
    playerCells[idx].dataset.state = 'ship';
    playerCells[idx].dataset.shipId = ship.id;
  });

  playerShips.push({ ...ship, coords: cells });
  placedShips.set(ship.id, { size: ship.size, cells: cells.slice(), sunk: false });

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
      placedShips.delete(shipId);

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

socket.on('connect', () => (statusEl.textContent = 'Aguardando outro jogador...'));
socket.on('waiting', msg => (statusEl.textContent = msg));
socket.on('match_found', ({ roomId: r }) => {
  roomId = r;
  statusEl.textContent = 'Adversário encontrado!';
});
socket.on('both_ready', ({ firstTurn }) => {
  myTurn = (firstTurn === socket.id);
  statusEl.textContent = myTurn ? 'Seu turno!' : 'Turno do inimigo...';
});

socket.on('incoming_attack', ({ targetIndex }) => {
  const cell = playerCells[targetIndex];
  const hit = cell.classList.contains('ship-cell');
  cell.classList.add(hit ? 'hit' : 'miss');

  if (hit) {
    const shipId = cell.dataset.shipId;
    if (shipId && placedShips.has(shipId)) {
      const ship = placedShips.get(shipId);
      ship.cells = ship.cells.filter(idx => !playerCells[idx].classList.contains('hit'));
      if (ship.cells.length === 0 && !ship.sunk) {
        ship.sunk = true;
        const shipName = SHIPS.find(s => s.id === shipId).name;
        socket.emit('ship_sunk', { roomId, shipName, attackerName: playerName });
      }
    }
  }

  socket.emit('attack_result', { roomId, targetIndex, hit });
  myTurn = true;
  statusEl.textContent = 'Seu turno!';
});

socket.on('attack_feedback', ({ targetIndex, hit }) => {
  const cell = enemyCells[targetIndex];
  cell.classList.add(hit ? 'hit' : 'miss');

  if (hit) {
    enemyHits++;
    if (enemyHits === 17) {
      showEndModal(`${playerName} venceu!`);
      return;
    }
  }

  myTurn = false;
  statusEl.textContent = 'Turno do inimigo...';
});

socket.on('opponent_left', () => {
  alert('Oponente saiu da partida.');
  location.reload();
});

function handleAttack(e) {
  if (!myTurn || !roomId || !locked) return;
  const idx = +e.target.dataset.index;
  socket.emit('attack', { roomId, targetIndex: idx });
  myTurn = false;
  statusEl.textContent = 'Turno do inimigo...';
}

socket.on('game_won', () => showEndModal(`${playerName} venceu!`));
socket.on('game_lost', () => showEndModal(`Você perdeu!`));

// NOVO: Modal temporário de navio destruído
socket.on('ship_destroyed', ({ attackerName, shipName }) => {
  showTempModal(`${attackerName} destruiu ${shipName}!`, 3000);
});

function showEndModal(msg) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>${msg}</h2>
    </div>
  `;
  document.body.appendChild(modal);
  locked = true;
}

// Modal temporário
function showTempModal(message, duration = 3000) {
  const modal = document.createElement('div');
  modal.className = 'temp-modal';
  modal.innerHTML = `
    <div class="temp-modal-content">
      <p>${message}</p>
    </div>
  `;
  document.body.appendChild(modal);

  setTimeout(() => {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 300);
  }, duration);
}