const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, '../public')));

// ── Card Engine ───────────────────────────────────────────────────────────────
const SUITS = ['S','H','D','C']; // spades hearts diamonds clubs
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function createDeck(numDecks) {
  const d = [];
  for (let deck = 0; deck < numDecks; deck++) {
    for (const s of SUITS) {
      for (const r of RANKS) {
        d.push({ id: `${r}${s}_${deck}`, rank: r, suit: s });
      }
    }
  }
  return shuffle(d);
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardValue(c) {
  if (['J','Q','K'].includes(c.rank)) return 10;
  if (c.rank === 'A') return 1;
  return parseInt(c.rank);
}

function rankIdx(r) { return RANKS.indexOf(r); }

function findAllMelds(hand) {
  const melds = [];
  const byRank = {};
  for (const c of hand) { (byRank[c.rank] = byRank[c.rank] || []).push(c); }
  for (const g of Object.values(byRank)) {
    if (g.length >= 3) melds.push(g.slice(0, 3));
    if (g.length >= 4) melds.push(g.slice(0, 4));
  }
  const bySuit = {};
  for (const c of hand) { (bySuit[c.suit] = bySuit[c.suit] || []).push(c); }
  for (const g of Object.values(bySuit)) {
    const sorted = [...g].sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank));
    let i = 0;
    while (i < sorted.length) {
      let j = i + 1;
      while (j < sorted.length && rankIdx(sorted[j].rank) === rankIdx(sorted[j-1].rank) + 1) j++;
      if (j - i >= 3) {
        for (let s = i; s <= j - 3; s++)
          for (let e = s + 3; e <= j; e++)
            melds.push(sorted.slice(s, e));
      }
      i = j;
    }
  }
  return melds;
}

function calcDeadwood(hand) {
  const melds = findAllMelds(hand);
  let best = hand.reduce((s, c) => s + cardValue(c), 0);
  let bestMelds = [];
  function solve(remaining, chosen, usedIds) {
    const dw = remaining.reduce((s, c) => s + cardValue(c), 0);
    if (dw < best) { best = dw; bestMelds = [...chosen]; }
    for (const m of melds) {
      if (m.some(c => usedIds.has(c.id))) continue;
      if (!m.every(c => remaining.some(r => r.id === c.id))) continue;
      const ids = new Set([...usedIds, ...m.map(c => c.id)]);
      solve(remaining.filter(c => !ids.has(c.id)), [...chosen, m], ids);
    }
  }
  solve(hand, [], new Set());
  return { deadwood: best, melds: bestMelds };
}

// ── Rooms ─────────────────────────────────────────────────────────────────────
const rooms = {};

function makeRoom(id, hostId) {
  return {
    id, host: hostId,
    players: [], deck: [], discard: [],
    phase: 'draw', currentTurn: 0,
    state: 'waiting', scores: {}, round: 0,
    maxPlayers: 10, minPlayers: 2,
    chat: []
  };
}

// How many decks for N players
function numDecks(n) {
  if (n <= 4) return 1;
  if (n <= 7) return 2;
  return 3;
}

// Cards per player based on count
function cardsPerPlayer(n) {
  if (n <= 2) return 10;
  if (n <= 4) return 10;
  if (n <= 6) return 8;
  return 7;
}

function deal(room) {
  const n = room.players.length;
  room.deck = createDeck(numDecks(n));
  room.discard = [];
  room.round++;
  room.phase = 'draw';
  const cpp = cardsPerPlayer(n);
  for (const p of room.players) {
    p.hand = [];
    for (let i = 0; i < cpp; i++) p.hand.push(room.deck.pop());
  }
  room.discard.push(room.deck.pop());
  room.currentTurn = Math.floor(Math.random() * n);
  room.state = 'playing';
}

function stateView(room, socketId) {
  return {
    state: room.state,
    round: room.round,
    phase: room.phase,
    currentTurn: room.currentTurn,
    deckCount: room.deck.length,
    topDiscard: room.discard.length ? room.discard[room.discard.length - 1] : null,
    discardCount: room.discard.length,
    scores: room.scores,
    isHost: room.host === socketId,
    maxPlayers: room.maxPlayers,
    minPlayers: room.minPlayers,
    players: room.players.map((p, i) => ({
      id: p.id, name: p.name, avatar: p.avatar,
      cardCount: p.hand.length,
      isMe: p.id === socketId,
      isTurn: i === room.currentTurn,
      hand: p.id === socketId ? p.hand : null,
      seatIndex: i
    }))
  };
}

function broadcast(room) {
  for (const p of room.players)
    io.to(p.id).emit('state', stateView(room, p.id));
}

function broadcastChat(room, msg) {
  io.to(room.id).emit('chat', msg);
}

function nextTurn(room) {
  room.currentTurn = (room.currentTurn + 1) % room.players.length;
  room.phase = 'draw';
}

// ── Socket Events ─────────────────────────────────────────────────────────────
io.on('connection', sock => {
  console.log('connect', sock.id);

  sock.on('create', ({ name, avatar }) => {
    const rid = Math.random().toString(36).substr(2, 5).toUpperCase();
    rooms[rid] = makeRoom(rid, sock.id);
    rooms[rid].players.push({ id: sock.id, name: name || 'Host', avatar: avatar || '🦊', hand: [] });
    rooms[rid].scores[sock.id] = 0;
    sock.join(rid);
    sock.rid = rid;
    sock.emit('joined', { roomId: rid, name: name });
    broadcast(rooms[rid]);
  });

  sock.on('join', ({ roomId, name, avatar }) => {
    const room = rooms[roomId];
    if (!room) return sock.emit('err', 'Room not found');
    if (room.state === 'playing') return sock.emit('err', 'Game already in progress');
    if (room.players.length >= room.maxPlayers) return sock.emit('err', `Room full (max ${room.maxPlayers})`);
    if (room.players.find(p => p.id === sock.id)) return;
    room.players.push({ id: sock.id, name: name || 'Player', avatar: avatar || '🐺', hand: [] });
    room.scores[sock.id] = 0;
    sock.join(roomId);
    sock.rid = roomId;
    sock.emit('joined', { roomId, name });
    broadcastChat(room, { system: true, text: `${name} joined the room!` });
    broadcast(room);
  });

  sock.on('start', () => {
    const room = rooms[sock.rid];
    if (!room) return;
    if (room.host !== sock.id) return sock.emit('err', 'Only the host can start');
    if (room.players.length < 2) return sock.emit('err', 'Need at least 2 players');
    deal(room);
    io.to(room.id).emit('started');
    broadcastChat(room, { system: true, text: `Round ${room.round} started! Good luck!` });
    broadcast(room);
  });

  sock.on('drawDeck', () => {
    const room = rooms[sock.rid];
    if (!room || room.state !== 'playing') return;
    if (room.players[room.currentTurn].id !== sock.id) return;
    if (room.phase !== 'draw') return;
    if (room.deck.length === 0) {
      const top = room.discard.pop();
      room.deck = shuffle(room.discard);
      room.discard = top ? [top] : [];
      broadcastChat(room, { system: true, text: 'Deck reshuffled from discard pile!' });
    }
    const card = room.deck.pop();
    room.players[room.currentTurn].hand.push(card);
    room.phase = 'discard';
    broadcast(room);
  });

  sock.on('drawDiscard', () => {
    const room = rooms[sock.rid];
    if (!room || room.state !== 'playing') return;
    if (room.players[room.currentTurn].id !== sock.id) return;
    if (room.phase !== 'draw') return;
    if (!room.discard.length) return;
    const card = room.discard.pop();
    room.players[room.currentTurn].hand.push(card);
    room.phase = 'discard';
    broadcast(room);
  });

  sock.on('discard', ({ cardId }) => {
    const room = rooms[sock.rid];
    if (!room || room.state !== 'playing') return;
    const player = room.players[room.currentTurn];
    if (player.id !== sock.id) return;
    if (room.phase !== 'discard') return;
    const idx = player.hand.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    const [card] = player.hand.splice(idx, 1);
    room.discard.push(card);
    // Win by empty hand
    if (player.hand.length === 0) {
      endRound(room, sock.id, 'empty');
      return;
    }
    nextTurn(room);
    broadcast(room);
  });

  sock.on('knock', ({ cardId }) => {
    const room = rooms[sock.rid];
    if (!room || room.state !== 'playing') return;
    const player = room.players[room.currentTurn];
    if (player.id !== sock.id) return;
    if (room.phase !== 'discard') return;
    const idx = player.hand.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    const [card] = player.hand.splice(idx, 1);
    room.discard.push(card);
    const { deadwood } = calcDeadwood(player.hand);
    if (deadwood > 10) {
      // can't knock
      player.hand.push(card);
      room.discard.pop();
      return sock.emit('err', 'Cannot knock — deadwood must be 10 or less!');
    }
    endRound(room, sock.id, deadwood === 0 ? 'gin' : 'knock');
  });

  sock.on('sortHand', () => {
    const room = rooms[sock.rid];
    if (!room) return;
    const player = room.players.find(p => p.id === sock.id);
    if (!player) return;
    player.hand.sort((a, b) => {
      if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
      return rankIdx(a.rank) - rankIdx(b.rank);
    });
    sock.emit('state', stateView(room, sock.id));
  });

  sock.on('chat', ({ text }) => {
    const room = rooms[sock.rid];
    if (!room) return;
    const player = room.players.find(p => p.id === sock.id);
    if (!player) return;
    broadcastChat(room, { name: player.name, avatar: player.avatar, text: text.slice(0, 200) });
  });

  sock.on('disconnect', () => {
    const room = rooms[sock.rid];
    if (!room) return;
    const pi = room.players.findIndex(p => p.id === sock.id);
    if (pi === -1) return;
    const player = room.players[pi];
    broadcastChat(room, { system: true, text: `${player.name} disconnected.` });
    room.players.splice(pi, 1);
    delete room.scores[sock.id];
    if (room.players.length === 0) { delete rooms[sock.rid]; return; }
    if (room.host === sock.id) room.host = room.players[0].id;
    if (room.state === 'playing') {
      if (room.players.length < 2) {
        room.state = 'waiting';
        io.to(room.id).emit('ended', { reason: 'Not enough players' });
      } else {
        if (room.currentTurn >= room.players.length) room.currentTurn = 0;
        broadcast(room);
      }
    } else {
      broadcast(room);
    }
  });
});

function endRound(room, knockerId, type) {
  const knockerPlayer = room.players.find(p => p.id === knockerId);
  const { deadwood: kDW, melds: kMelds } = calcDeadwood(knockerPlayer.hand);
  const results = [];

  for (const p of room.players) {
    const { deadwood: dw } = calcDeadwood(p.hand);
    results.push({ id: p.id, name: p.name, deadwood: dw, hand: p.hand, isKnocker: p.id === knockerId });
  }

  // Scoring
  if (type === 'gin') {
    for (const r of results) {
      if (!r.isKnocker) {
        room.scores[knockerId] = (room.scores[knockerId] || 0) + r.deadwood + 25;
      }
    }
  } else if (type === 'knock') {
    for (const r of results) {
      if (r.isKnocker) continue;
      const diff = r.deadwood - kDW;
      if (diff > 0) {
        room.scores[knockerId] = (room.scores[knockerId] || 0) + diff;
      } else {
        // undercut
        room.scores[r.id] = (room.scores[r.id] || 0) + Math.abs(diff) + 25;
      }
    }
  } else if (type === 'empty') {
    for (const r of results) {
      if (!r.isKnocker) {
        room.scores[knockerId] = (room.scores[knockerId] || 0) + r.deadwood;
      }
    }
  }

  io.to(room.id).emit('roundEnd', { type, results, scores: room.scores, knockerName: knockerPlayer.name });
  room.state = 'roundEnd';

  // Check winner (first to 100)
  const winner = Object.entries(room.scores).find(([, s]) => s >= 100);
  if (winner) {
    const wp = room.players.find(p => p.id === winner[0]);
    room.state = 'ended';
    io.to(room.id).emit('gameOver', { winnerName: wp?.name || '?', scores: room.scores });
  } else {
    setTimeout(() => {
      deal(room);
      io.to(room.id).emit('started');
      broadcastChat(room, { system: true, text: `Round ${room.round} started!` });
      broadcast(room);
    }, 6000);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🃏 Royal Rummy running → http://localhost:${PORT}`));
