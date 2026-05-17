const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, '../public')));

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const DECK_COUNT = 2;

function createDeck() {
  const deck = [];
  for (let deckIndex = 0; deckIndex < DECK_COUNT; deckIndex++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ id: `${rank}${suit}_${deckIndex}`, rank, suit, deckIndex });
      }
    }
    deck.push({ id: `PJ_${deckIndex}`, rank: 'PJ', suit: 'J', deckIndex, isPrintedJoker: true });
  }
  return shuffle(deck);
}

function shuffle(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cardValue(card) {
  if (card.isPrintedJoker || card.rank === 'PJ') return 0;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  if (card.rank === 'A') return 10;
  return parseInt(card.rank, 10);
}

function rankIdx(rank) {
  return RANKS.indexOf(rank);
}

function cardsPerPlayer(playerCount) {
  return 13;
}

function targetScore(playerCount) {
  return 101;
}

function isJoker(card, wildRank) {
  return !!card && (card.isPrintedJoker || card.rank === 'PJ' || card.rank === wildRank);
}

function visibleCardRank(card) {
  return card.isPrintedJoker ? 'PJ' : card.rank;
}

function chooseWildJoker(deck) {
  const natural = deck.find(card => !card.isPrintedJoker);
  return natural ? natural.rank : 'A';
}

function naturalCards(cards, wildRank) {
  return cards.filter(card => !isJoker(card, wildRank));
}

function validateSet(cards, wildRank) {
  const naturals = naturalCards(cards, wildRank);
  if (cards.length < 3 || naturals.length < 2) return null;

  const rank = naturals[0].rank;
  if (!naturals.every(card => card.rank === rank)) return null;

  const suits = new Set();
  for (const card of naturals) {
    if (suits.has(card.suit)) return null;
    suits.add(card.suit);
  }

  return { type: 'set', cards: [...cards], pure: false };
}

function validatePureSequence(cards, wildRank) {
  if (cards.length < 3 || cards.some(card => isJoker(card, wildRank))) return null;
  if (!cards.every(card => card.suit === cards[0].suit)) return null;

  const sorted = [...cards].sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank));
  for (let i = 1; i < sorted.length; i++) {
    if (rankIdx(sorted[i].rank) !== rankIdx(sorted[i - 1].rank) + 1) return null;
  }

  return { type: 'pureSequence', cards: sorted, pure: true };
}

function validateImpureSequence(cards, wildRank) {
  if (cards.length < 3) return null;
  const naturals = naturalCards(cards, wildRank);
  const jokers = cards.length - naturals.length;
  if (jokers < 1 || naturals.length < 2) return null;
  if (!naturals.every(card => card.suit === naturals[0].suit)) return null;

  const ranks = new Set();
  for (const card of naturals) {
    if (ranks.has(card.rank)) return null;
    ranks.add(card.rank);
  }

  const sorted = [...naturals].sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank));
  let gaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    const diff = rankIdx(sorted[i].rank) - rankIdx(sorted[i - 1].rank);
    if (diff <= 0) return null;
    gaps += diff - 1;
  }
  if (gaps > jokers) return null;

  return { type: 'impureSequence', cards: [...cards], pure: false };
}

function isValidMeld(cards, wildRank) {
  if (!Array.isArray(cards) || cards.length < 3) return null;

  return validatePureSequence(cards, wildRank)
    || validateImpureSequence(cards, wildRank)
    || validateSet(cards, wildRank);
}

function validDeclarationFor(room, playerId, extraMeld = null) {
  const groups = room.melds.filter(meld => meld.ownerId === playerId);
  if (extraMeld) groups.push(extraMeld);

  const sequenceCount = groups.filter(meld => meld.type === 'pureSequence' || meld.type === 'impureSequence').length;
  const pureCount = groups.filter(meld => meld.type === 'pureSequence').length;
  const groupedCount = groups.reduce((sum, meld) => sum + meld.cards.length, 0);

  return {
    valid: groupedCount === 13 && sequenceCount >= 2 && pureCount >= 1,
    groupedCount,
    sequenceCount,
    pureCount
  };
}

function playerPenalty(room, player) {
  const groups = room.melds.filter(meld => meld.ownerId === player.id);
  const sequenceCount = groups.filter(meld => meld.type === 'pureSequence' || meld.type === 'impureSequence').length;
  const pureCount = groups.filter(meld => meld.type === 'pureSequence').length;
  const ungrouped = player.hand.reduce(
    (sum, card) => sum + (isJoker(card, room.wildJokerRank) ? 0 : cardValue(card)),
    0
  );

  if (sequenceCount >= 2 && pureCount >= 1) return Math.min(80, ungrouped);

  const grouped = groups.flatMap(meld => meld.cards).reduce(
    (sum, card) => sum + (isJoker(card, room.wildJokerRank) ? 0 : cardValue(card)),
    0
  );
  return Math.min(80, ungrouped + grouped);
}

function canLayoff(card, meld, wildRank, position = 'auto') {
  if (!card || !meld) return null;
  if (isJoker(card, wildRank)) return null;

  if (meld.type === 'set') {
    if (meld.cards.some(existing => existing.id === card.id)) return null;
    const naturals = naturalCards(meld.cards, wildRank);
    if (!naturals.length || card.rank !== naturals[0].rank) return null;
    if (naturals.some(existing => existing.suit === card.suit)) return null;
    return { ...meld, cards: [...meld.cards, card] };
  }

  if (meld.type !== 'pureSequence' && meld.type !== 'impureSequence') return null;
  const naturals = naturalCards(meld.cards, wildRank);
  if (!naturals.length) return null;
  const sorted = [...naturals].sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank));
  if (card.suit !== sorted[0].suit) return null;
  if (sorted.some(existing => existing.id === card.id || existing.rank === card.rank)) return null;

  const before = rankIdx(sorted[0].rank) - 1;
  const after = rankIdx(sorted[sorted.length - 1].rank) + 1;
  const cardRank = rankIdx(card.rank);
  if ((position === 'start' || position === 'auto') && cardRank === before) {
    return { ...meld, cards: [card, ...sorted] };
  }
  if ((position === 'end' || position === 'auto') && cardRank === after) {
    return { ...meld, cards: [...sorted, card] };
  }
  return null;
}

const rooms = {};

function makeRoom(id, hostId) {
  return {
    id,
    host: hostId,
    players: [],
    deck: [],
    discard: [],
    melds: [],
    phase: 'draw',
    currentTurn: 0,
    dealerIndex: -1,
    state: 'waiting',
    scores: {},
    round: 0,
    maxPlayers: 6,
    minPlayers: 2,
    targetScore: 100,
    stockReshuffleCount: 0,
    drawnDiscardCardId: null,
    wildJokerRank: null,
    nextMeldId: 1
  };
}

function deal(room) {
  const playerCount = room.players.length;
  room.deck = createDeck();
  room.discard = [];
  room.melds = [];
  room.round++;
  room.phase = 'draw';
  room.stockReshuffleCount = 0;
  room.drawnDiscardCardId = null;
  room.wildJokerRank = chooseWildJoker(room.deck);
  room.targetScore = targetScore(playerCount);
  room.dealerIndex = room.dealerIndex === -1
    ? Math.floor(Math.random() * playerCount)
    : (room.dealerIndex + 1) % playerCount;
  room.currentTurn = (room.dealerIndex + 1) % playerCount;
  room.nextMeldId = 1;

  const count = cardsPerPlayer(playerCount);
  for (const player of room.players) {
    player.hand = [];
    player.hasPlayedToTable = false;
    player.rummyTurnActive = false;
    player.wentRummyOnWin = false;
    for (let i = 0; i < count; i++) player.hand.push(room.deck.pop());
  }

  room.discard.push(room.deck.pop());
  room.state = 'playing';
}

function stateView(room, socketId) {
  return {
    state: room.state,
    round: room.round,
    phase: room.phase,
    currentTurn: room.currentTurn,
    dealerIndex: room.dealerIndex,
    deckCount: room.deck.length,
    topDiscard: room.discard.length ? room.discard[room.discard.length - 1] : null,
    discardCount: room.discard.length,
    scores: room.scores,
    isHost: room.host === socketId,
    maxPlayers: room.maxPlayers,
    minPlayers: room.minPlayers,
    targetScore: room.targetScore,
    stockReshuffleCount: room.stockReshuffleCount,
    wildJokerRank: room.wildJokerRank,
    drawnDiscardCardId: room.players[room.currentTurn]?.id === socketId ? room.drawnDiscardCardId : null,
    melds: room.melds,
    players: room.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      cardCount: player.hand.length,
      isMe: player.id === socketId,
      isTurn: index === room.currentTurn,
      hand: player.id === socketId ? player.hand : null,
      seatIndex: index,
      hasPlayedToTable: !!player.hasPlayedToTable
    }))
  };
}

function broadcast(room) {
  for (const player of room.players) {
    io.to(player.id).emit('state', stateView(room, player.id));
  }
}

function broadcastChat(room, msg) {
  io.to(room.id).emit('chat', msg);
}

function currentPlayer(room) {
  return room.players[room.currentTurn];
}

function nextTurn(room) {
  if (room.players[room.currentTurn]) room.players[room.currentTurn].rummyTurnActive = false;
  room.currentTurn = (room.currentTurn + 1) % room.players.length;
  room.phase = 'draw';
  room.drawnDiscardCardId = null;
}

function refillStock(room) {
  if (room.deck.length > 0) return true;
  if (room.stockReshuffleCount >= 1) return false;
  if (room.discard.length <= 1) return false;

  const top = room.discard.pop();
  room.deck = shuffle(room.discard);
  room.discard = [top];
  room.stockReshuffleCount++;
  broadcastChat(room, { system: true, text: 'Stock was reshuffled from the discard pile.' });
  return room.deck.length > 0;
}

function playerCardsById(player, cardIds) {
  if (!Array.isArray(cardIds)) return null;
  const unique = [...new Set(cardIds)];
  if (unique.length !== cardIds.length) return null;

  const cards = [];
  for (const id of unique) {
    const card = player.hand.find(item => item.id === id);
    if (!card) return null;
    cards.push(card);
  }
  return cards;
}

function removeCards(player, cardIds) {
  const ids = new Set(cardIds);
  player.hand = player.hand.filter(card => !ids.has(card.id));
}

function scoreRemainingHands(room, winnerId, doubled) {
  let points = 0;
  const results = room.players.map(player => {
    const handValue = player.id === winnerId ? 0 : playerPenalty(room, player);
    if (player.id !== winnerId) points += handValue;
    return {
      id: player.id,
      name: player.name,
      remaining: handValue,
      hand: player.hand,
      isWinner: player.id === winnerId
    };
  });

  if (doubled) points *= 2;
  room.scores[winnerId] = (room.scores[winnerId] || 0) + points;
  return { points, results };
}

function endRound(room, winnerId, type) {
  room.state = 'roundEnd';

  let payload;
  if (type === 'stalemate') {
    payload = {
      type,
      winnerName: 'Stalemate',
      points: 0,
      doubled: false,
      results: room.players.map(player => ({
        id: player.id,
        name: player.name,
        remaining: playerPenalty(room, player),
        hand: player.hand,
        isWinner: false
      })),
      scores: room.scores
    };
  } else {
    const winner = room.players.find(player => player.id === winnerId);
    const doubled = false;
    const scored = scoreRemainingHands(room, winnerId, doubled);
    payload = {
      type,
      winnerName: winner.name,
      points: scored.points,
      doubled,
      results: scored.results,
      scores: room.scores
    };
  }

  io.to(room.id).emit('roundEnd', payload);

  const matchWinner = Object.entries(room.scores).find(([, score]) => score >= room.targetScore);
  if (matchWinner) {
    const player = room.players.find(item => item.id === matchWinner[0]);
    room.state = 'ended';
    io.to(room.id).emit('gameOver', { winnerName: player?.name || '?', scores: room.scores });
    return;
  }

  setTimeout(() => {
    if (!rooms[room.id] || room.players.length < room.minPlayers) return;
    deal(room);
    io.to(room.id).emit('started');
    broadcastChat(room, { system: true, text: `Round ${room.round} started.` });
    broadcast(room);
  }, 6000);
}

function canAnyHandCardPlay(room, player) {
  if (isValidMeld(player.hand, room.wildJokerRank)) return true;
  for (const card of player.hand) {
    if (room.melds.some(meld => canLayoff(card, meld, room.wildJokerRank))) return true;
  }
  return false;
}

function isNoProgressStalemate(room) {
  if (room.players.some(player => player.hand.length > 1)) return false;
  return room.players.every(player => !canAnyHandCardPlay(room, player));
}

function afterSuccessfulPlay(room, playerId) {
  const player = room.players.find(item => item.id === playerId);
  if (player && player.hand.length === 0) {
    const declaration = validDeclarationFor(room, playerId);
    if (!declaration.valid) return false;
    endRound(room, playerId, 'out');
    return true;
  }
  return false;
}

io.on('connection', sock => {
  console.log('connect', sock.id);

  sock.on('create', ({ name, avatar }) => {
    const rid = Math.random().toString(36).substr(2, 5).toUpperCase();
    rooms[rid] = makeRoom(rid, sock.id);
    rooms[rid].players.push({ id: sock.id, name: name || 'Host', avatar: avatar || '🦊', hand: [], hasPlayedToTable: false, rummyTurnActive: false, wentRummyOnWin: false });
    rooms[rid].scores[sock.id] = 0;
    sock.join(rid);
    sock.rid = rid;
    sock.emit('joined', { roomId: rid, name });
    broadcast(rooms[rid]);
  });

  sock.on('join', ({ roomId, name, avatar }) => {
    const room = rooms[roomId];
    if (!room) return sock.emit('err', 'Room not found');
    if (room.state === 'playing' || room.state === 'roundEnd') return sock.emit('err', 'Game already in progress');
    if (room.players.length >= room.maxPlayers) return sock.emit('err', `Room full (max ${room.maxPlayers})`);
    if (room.players.find(player => player.id === sock.id)) return;
    room.players.push({ id: sock.id, name: name || 'Player', avatar: avatar || '🐺', hand: [], hasPlayedToTable: false, rummyTurnActive: false, wentRummyOnWin: false });
    room.scores[sock.id] = 0;
    sock.join(roomId);
    sock.rid = roomId;
    sock.emit('joined', { roomId, name });
    broadcastChat(room, { system: true, text: `${name || 'Player'} joined the room.` });
    broadcast(room);
  });

  sock.on('start', () => {
    const room = rooms[sock.rid];
    if (!room) return;
    if (room.host !== sock.id) return sock.emit('err', 'Only the host can start');
    if (room.players.length < room.minPlayers) return sock.emit('err', 'Need at least 2 players');
    deal(room);
    io.to(room.id).emit('started');
    broadcastChat(room, { system: true, text: `Round ${room.round} started.` });
    broadcast(room);
  });

  sock.on('drawDeck', () => {
    const room = rooms[sock.rid];
    if (!room || room.state !== 'playing') return;
    const player = currentPlayer(room);
    if (!player || player.id !== sock.id || room.phase !== 'draw') return;
    if (!refillStock(room)) {
      endRound(room, null, 'stalemate');
      return;
    }
    player.hand.push(room.deck.pop());
    room.phase = 'play';
    room.drawnDiscardCardId = null;
    player.rummyTurnActive = !player.hasPlayedToTable;
    broadcast(room);
  });

  sock.on('drawDiscard', () => {
    const room = rooms[sock.rid];
    if (!room || room.state !== 'playing') return;
    const player = currentPlayer(room);
    if (!player || player.id !== sock.id || room.phase !== 'draw' || !room.discard.length) return;
    const card = room.discard.pop();
    player.hand.push(card);
    room.phase = 'play';
    room.drawnDiscardCardId = card.id;
    player.rummyTurnActive = !player.hasPlayedToTable;
    broadcast(room);
  });

  sock.on('createMeld', ({ cardIds }) => {
    const room = rooms[sock.rid];
    if (!room || room.state !== 'playing') return;
    const player = currentPlayer(room);
    if (!player || player.id !== sock.id || room.phase !== 'play') return;
    const cards = playerCardsById(player, cardIds);
    const meld = cards && isValidMeld(cards, room.wildJokerRank);
    if (!meld) return sock.emit('err', 'That is not a valid set, pure sequence, or impure sequence.');

    const canEarnRummyBonus = player.rummyTurnActive;
    const remainingCount = player.hand.length - cardIds.length;
    const candidateMeld = {
      id: `M${room.nextMeldId}`,
      type: meld.type,
      cards: meld.cards,
      ownerId: player.id,
      ownerName: player.name
    };
    if (remainingCount === 0) {
      const declaration = validDeclarationFor(room, player.id, candidateMeld);
      if (!declaration.valid) {
        return sock.emit('err', 'Invalid declaration. You need 13 grouped cards, at least 2 sequences, and at least 1 pure sequence.');
      }
    }

    removeCards(player, cardIds);
    player.hasPlayedToTable = true;
    room.nextMeldId++;
    room.melds.push(candidateMeld);

    if (player.hand.length === 0 && canEarnRummyBonus) player.wentRummyOnWin = true;
    if (afterSuccessfulPlay(room, player.id)) return;
    broadcast(room);
  });

  sock.on('layoffCard', ({ cardId, meldId, position }) => {
    const room = rooms[sock.rid];
    if (!room || room.state !== 'playing') return;
    const player = currentPlayer(room);
    if (!player || player.id !== sock.id || room.phase !== 'play') return;
    const card = player.hand.find(item => item.id === cardId);
    const meldIndex = room.melds.findIndex(item => item.id === meldId);
    if (!card || meldIndex === -1) return;

    const updated = canLayoff(card, room.melds[meldIndex], room.wildJokerRank, position);
    if (!updated) return sock.emit('err', 'That card cannot be laid off on this meld.');
    if (player.hand.length === 1) {
      return sock.emit('err', 'You can only finish with your own valid declaration groups.');
    }

    const canEarnRummyBonus = player.rummyTurnActive;
    player.hand = player.hand.filter(item => item.id !== cardId);
    player.hasPlayedToTable = true;
    room.melds[meldIndex] = updated;

    if (player.hand.length === 0 && canEarnRummyBonus) player.wentRummyOnWin = true;
    if (afterSuccessfulPlay(room, player.id)) return;
    broadcast(room);
  });

  sock.on('discard', ({ cardId }) => {
    const room = rooms[sock.rid];
    if (!room || room.state !== 'playing') return;
    const player = currentPlayer(room);
    if (!player || player.id !== sock.id || room.phase !== 'play') return;
    if (room.drawnDiscardCardId && cardId === room.drawnDiscardCardId) {
      return sock.emit('err', 'You cannot discard the same card you just drew from the discard pile.');
    }
    const idx = player.hand.findIndex(card => card.id === cardId);
    if (idx === -1) return;

    const [card] = player.hand.splice(idx, 1);
    room.discard.push(card);
    if (player.hand.length === 0) {
      const declaration = validDeclarationFor(room, player.id);
      if (!declaration.valid) {
        player.hand.splice(idx, 0, card);
        room.discard.pop();
        return sock.emit('err', 'Invalid declaration. You need 13 grouped cards, at least 2 sequences, and at least 1 pure sequence.');
      }
      if (player.rummyTurnActive) player.wentRummyOnWin = true;
      endRound(room, sock.id, 'discard');
      return;
    }

    nextTurn(room);
    if (isNoProgressStalemate(room)) {
      endRound(room, null, 'stalemate');
      return;
    }
    broadcast(room);
  });

  sock.on('goOut', ({ discardCardId } = {}) => {
    const room = rooms[sock.rid];
    if (!room || room.state !== 'playing') return;
    const player = currentPlayer(room);
    if (!player || player.id !== sock.id || room.phase !== 'play') return;
    let finalDiscard = null;
    let finalDiscardIndex = -1;

    if (discardCardId) {
      if (room.drawnDiscardCardId && discardCardId === room.drawnDiscardCardId) {
        return sock.emit('err', 'You cannot discard the same card you just drew from the discard pile.');
      }
      const idx = player.hand.findIndex(card => card.id === discardCardId);
      if (idx === -1 || player.hand.length !== 1) return sock.emit('err', 'You can only declare with a final discard when it is your last card.');
      finalDiscardIndex = idx;
      [finalDiscard] = player.hand.splice(idx, 1);
      room.discard.push(finalDiscard);
    }

    if (player.hand.length !== 0) return sock.emit('err', 'You still have cards in your hand.');
    const declaration = validDeclarationFor(room, player.id);
    if (!declaration.valid) {
      if (finalDiscard) {
        room.discard.pop();
        player.hand.splice(finalDiscardIndex, 0, finalDiscard);
      }
      return sock.emit('err', 'Invalid declaration. You need 13 grouped cards, at least 2 sequences, and at least 1 pure sequence.');
    }
    if (player.rummyTurnActive) player.wentRummyOnWin = true;
    endRound(room, sock.id, discardCardId ? 'discard' : 'out');
  });

  sock.on('chat', ({ text }) => {
    const room = rooms[sock.rid];
    if (!room) return;
    const player = room.players.find(item => item.id === sock.id);
    if (!player) return;
    broadcastChat(room, { name: player.name, avatar: player.avatar, text: String(text || '').slice(0, 200) });
  });

  sock.on('disconnect', () => {
    const room = rooms[sock.rid];
    if (!room) return;
    const index = room.players.findIndex(player => player.id === sock.id);
    if (index === -1) return;
    const player = room.players[index];
    broadcastChat(room, { system: true, text: `${player.name} disconnected.` });
    room.players.splice(index, 1);
    delete room.scores[sock.id];
    if (room.players.length === 0) {
      delete rooms[sock.rid];
      return;
    }
    if (room.host === sock.id) room.host = room.players[0].id;
    if (room.currentTurn >= room.players.length) room.currentTurn = 0;
    if (room.dealerIndex >= room.players.length) room.dealerIndex = 0;
    if (room.state === 'playing' && room.players.length < room.minPlayers) {
      room.state = 'waiting';
      room.phase = 'draw';
      room.melds = [];
      io.to(room.id).emit('ended', { reason: 'Not enough players' });
    }
    broadcast(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Royal Rummy running at http://localhost:${PORT}`));
