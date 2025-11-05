import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// Estrutura de salas
let waitingPlayer = null;
const rooms = new Map(); // roomId -> { players: [socketIds], boards: {}, ready: {}, names: {} }

io.on("connection", (socket) => {
  console.log(`Novo jogador: ${socket.id}`);

  socket.on("set_name", (name) => {
    socket.data.name = name;
  });

  if (waitingPlayer) {
    const roomId = `room-${waitingPlayer}-${socket.id}`;
    rooms.set(roomId, { players: [waitingPlayer, socket.id], boards: {}, ready: {}, names: {} });

    socket.join(roomId);
    io.to(waitingPlayer).socketsJoin(roomId);

    const room = rooms.get(roomId);
    room.names[waitingPlayer] = io.sockets.sockets.get(waitingPlayer)?.data.name || "Jogador1";
    room.names[socket.id] = socket.data.name || "Jogador2";

    io.to(roomId).emit("match_found", { roomId });
    console.log(`Sala criada: ${roomId}`);
    waitingPlayer = null;
  } else {
    waitingPlayer = socket.id;
    socket.emit("waiting", "Aguardando outro jogador...");
  }

  socket.on("ready", ({ roomId, board }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    room.boards[socket.id] = board.map(cell => cell ? true : false);
    room.ready[socket.id] = true;

    if (room.players.every(p => room.ready[p])) {
      const firstTurn = room.players[Math.floor(Math.random() * 2)];
      io.to(roomId).emit("both_ready", { firstTurn });
      console.log(`Ambos prontos na sala ${roomId}`);
    }
  });

  socket.on("attack", ({ roomId, targetIndex }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const opponentId = room.players.find(id => id !== socket.id);
    io.to(opponentId).emit("incoming_attack", { targetIndex, attackerId: socket.id });
  });

  socket.on("attack_result", ({ roomId, targetIndex, hit }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const opponentId = room.players.find(id => id !== socket.id);
    if (hit) room.boards[opponentId][targetIndex] = false;

    io.to(opponentId).emit("attack_feedback", { targetIndex, hit });

    const allShipsSunk = room.boards[opponentId].every(cell => cell === false);
    if (allShipsSunk) {
      const winnerName = room.names[socket.id] || "Jogador";
      const loserName = room.names[opponentId] || "Oponente";

      io.to(socket.id).emit("game_won", { winnerName });
      io.to(opponentId).emit("game_lost", { loserName });
    } else {
      io.to(socket.id).emit("your_turn");
      io.to(opponentId).emit("opponent_turn");
    }
  });

  // NOVO: Quando um navio é destruído
  socket.on("ship_sunk", ({ roomId, shipName, attackerName }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    io.to(roomId).emit("ship_destroyed", { attackerName, shipName });
  });

  socket.on("disconnect", () => {
    console.log(`Jogador saiu: ${socket.id}`);
    if (waitingPlayer === socket.id) waitingPlayer = null;

    for (const [roomId, room] of rooms) {
      if (room.players.includes(socket.id)) {
        io.to(roomId).emit("opponent_left");
        rooms.delete(roomId);
      }
    }
  });
});

server.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));