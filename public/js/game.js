const socket = io();

let myId = null;
let myName = '';
let myAvatar = '🦊';
let roomId = null;
let gameState = null;
let isMyTurn = false;
let currentPhase = 'draw';
let selectedCardIds = new Set();
let selectedMeldId = null;
let cardLayouts = new Map();
let zCounter = 20;
let dragState = null;

const HAND_ROW_Y = 38;

const lobbyEl         = document.getElementById('lobby');
const gameEl          = document.getElementById('game');
const createBtn       = document.getElementById('createBtn');
const joinBtn         = document.getElementById('joinBtn');
const joinCode        = document.getElementById('joinCode');
const playerNameEl    = document.getElementById('playerName');
const avatarRow       = document.getElementById('avatarRow');
const lobbyError      = document.getElementById('lobbyError');

const waitingOverlay  = document.getElementById('waitingOverlay');
const wRoomCode       = document.getElementById('wRoomCode');
const wPlayerList     = document.getElementById('wPlayerList');
const wStartBtn       = document.getElementById('wStartBtn');
const wWaitMsg        = document.getElementById('wWaitMsg');
const wError          = document.getElementById('wError');

const tbRoomId        = document.getElementById('tbRoomId');
const tbRound         = document.getElementById('tbRound');
const tbLeave         = document.getElementById('tbLeave');

const playerZonesEl   = document.getElementById('playerZones');
const meldTable       = document.getElementById('meldTable');
const deckStack       = document.getElementById('deckStack');
const deckCount       = document.getElementById('deckCount');
const discardPile     = document.getElementById('discardPile');
const discardEmpty    = document.getElementById('discardEmpty');
const statusBar       = document.getElementById('statusBar');
const meldBtn         = document.getElementById('meldBtn');
const layoffBtn       = document.getElementById('layoffBtn');
const discardBtn      = document.getElementById('discardBtn');
const goOutBtn        = document.getElementById('goOutBtn');
const sortBtn         = document.getElementById('sortBtn');

const chatMessages    = document.getElementById('chatMessages');
const chatInput       = document.getElementById('chatInput');
const chatSend        = document.getElementById('chatSend');

const roundEndOverlay = document.getElementById('roundEndOverlay');
const reTitle         = document.getElementById('reTitle');
const reResults       = document.getElementById('reResults');
const reNext          = document.getElementById('reNext');

const gameOverOverlay = document.getElementById('gameOverOverlay');
const goWinner        = document.getElementById('goWinner');
const goScores        = document.getElementById('goScores');
const goPlayAgain     = document.getElementById('goPlayAgain');

const SEAT_CLASSES = ['seat-0', 'seat-1', 'seat-2', 'seat-3', 'seat-4', 'seat-5'];
const SEAT_MAP = {
  2: [0, 2],
  3: [0, 1, 2],
  4: [0, 1, 2, 3],
  5: [0, 1, 4, 5, 3],
  6: [0, 1, 4, 2, 5, 3]
};
const SEAT_ORIENTATION = {
  'seat-0': 'h',
  'seat-1': 'v',
  'seat-2': 'h',
  'seat-3': 'v',
  'seat-4': 'h',
  'seat-5': 'h'
};
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLOR = { S: 'black', H: 'red', D: 'red', C: 'black' };
const SUIT_ORDER = ['S', 'H', 'D', 'C'];
const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

avatarRow.querySelectorAll('.avatar-opt').forEach(el => {
  el.addEventListener('click', () => {
    avatarRow.querySelectorAll('.avatar-opt').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    myAvatar = el.dataset.v;
  });
});

createBtn.addEventListener('click', () => {
  myName = playerNameEl.value.trim() || 'Player';
  socket.emit('create', { name: myName, avatar: myAvatar });
});

joinBtn.addEventListener('click', () => {
  myName = playerNameEl.value.trim() || 'Player';
  const code = joinCode.value.trim().toUpperCase();
  if (!code) {
    showError('Enter a room code');
    return;
  }
  socket.emit('join', { roomId: code, name: myName, avatar: myAvatar });
});

joinCode.addEventListener('keydown', e => { if (e.key === 'Enter') joinBtn.click(); });
playerNameEl.addEventListener('keydown', e => { if (e.key === 'Enter') joinBtn.click(); });
joinCode.addEventListener('input', () => { joinCode.value = joinCode.value.toUpperCase(); });

socket.on('joined', ({ roomId: rid }) => {
  myId = socket.id;
  roomId = rid;
  showError('');
  switchScreen('game');
  tbRoomId.textContent = `Room: ${rid}`;
  wRoomCode.textContent = rid;
  waitingOverlay.style.display = 'flex';
});

socket.on('err', msg => showError(msg));

socket.on('state', state => {
  gameState = state;
  myId = socket.id;
  tbRound.textContent = `Round ${state.round || 1} | Wild ${state.wildJokerRank || '-'} | Target ${state.targetScore || 101}`;

  const me = state.players.find(p => p.isMe);
  isMyTurn = !!(me && me.isTurn);
  currentPhase = state.phase;
  reconcileSelection(me?.hand || []);
  reconcileLayouts(me?.hand || []);

  updateWaitingOverlay(state);

  if (state.state === 'playing' || state.state === 'roundEnd') {
    waitingOverlay.style.display = 'none';
    renderTable(state);
    renderMeldTable(state);
    updateDeck(state);
    updateDiscard(state);
    updateStatus(state);
    updateActionBtns(state);
  }
});

socket.on('started', () => {
  roundEndOverlay.classList.remove('show');
  gameOverOverlay.classList.remove('show');
  selectedCardIds.clear();
  selectedMeldId = null;
  cardLayouts.clear();
});

socket.on('roundEnd', ({ type, results, scores, winnerName, points, doubled }) => {
  selectedCardIds.clear();
  selectedMeldId = null;
  if (type === 'stalemate') {
    reTitle.textContent = 'Stalemate. No points awarded.';
  } else {
    reTitle.textContent = `${winnerName} wins the hand for ${points} point${points === 1 ? '' : 's'}`;
  }

  reResults.innerHTML = '';
  for (const result of results) {
    const row = document.createElement('div');
    row.className = 'result-row';
    row.innerHTML = `
      <span>${escHtml(result.name)}${result.isWinner ? ' - Winner' : ''}</span>
      <span class="result-deadwood">Hand: ${result.remaining}</span>
      <span style="color:#aed6b0">Score: ${scores[result.id] || 0}</span>
    `;
    reResults.appendChild(row);
  }

  reNext.textContent = 'Next round starting in 6s...';
  roundEndOverlay.classList.add('show');

  let secs = 6;
  const timer = setInterval(() => {
    secs--;
    reNext.textContent = `Next round starting in ${secs}s...`;
    if (secs <= 0) clearInterval(timer);
  }, 1000);
});

socket.on('gameOver', ({ winnerName, scores }) => {
  roundEndOverlay.classList.remove('show');
  goWinner.textContent = `Winner: ${winnerName}`;
  goScores.innerHTML = '<tr><th>Player</th><th>Score</th></tr>';
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  for (const [pid, score] of sorted) {
    const player = gameState?.players.find(p => p.id === pid);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escHtml(player?.name || pid)}</td><td>${score}</td>`;
    goScores.appendChild(tr);
  }
  gameOverOverlay.classList.add('show');
});

socket.on('chat', msg => addChat(msg));

function updateWaitingOverlay(state) {
  if (state.state !== 'waiting') return;
  waitingOverlay.style.display = 'flex';
  wPlayerList.innerHTML = '';

  for (const player of state.players) {
    const div = document.createElement('div');
    div.className = 'player-list-item';
    div.innerHTML = `
      <span class="pli-avatar">${escHtml(player.avatar)}</span>
      <span class="pli-name">${escHtml(player.name)}</span>
      ${player.seatIndex === 0 ? '<span class="pli-host">HOST</span>' : ''}
    `;
    wPlayerList.appendChild(div);
  }

  if (state.isHost) {
    wStartBtn.style.display = 'block';
    wWaitMsg.style.display = 'none';
    wStartBtn.disabled = state.players.length < 2;
    wStartBtn.classList.toggle('btn-start-pulse', state.players.length >= 2);
  } else {
    wStartBtn.style.display = 'none';
    wWaitMsg.style.display = 'block';
  }
}

wStartBtn.addEventListener('click', () => socket.emit('start'));

function renderTable(state) {
  playerZonesEl.innerHTML = '';

  const playerCount = state.players.length;
  const meIdx = state.players.findIndex(p => p.isMe);
  if (meIdx === -1) return;

  const map = SEAT_MAP[playerCount] || SEAT_MAP[4];
  const ordered = [];
  for (let i = 0; i < playerCount; i++) {
    ordered.push(state.players[(meIdx + i) % playerCount]);
  }

  ordered.forEach((player, index) => {
    const seatClass = SEAT_CLASSES[map[index]] || `seat-${index}`;
    const orient = SEAT_ORIENTATION[seatClass] || 'h';
    const zone = document.createElement('div');
    zone.className = `player-zone ${seatClass}${player.isTurn ? ' my-turn' : ''}`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'player-avatar';
    avatarDiv.innerHTML = `
      <div class="avatar-face">${escHtml(player.avatar)}</div>
      <div class="avatar-name">${escHtml(player.name)}</div>
      <div class="score-badge">${state.scores[player.id] || 0} / ${state.targetScore} pts</div>
    `;
    if (player.seatIndex === state.dealerIndex) {
      const badge = document.createElement('div');
      badge.className = 'dealer-badge';
      badge.textContent = 'DEALER';
      avatarDiv.querySelector('.avatar-face').appendChild(badge);
    }

    const handDiv = document.createElement('div');
    handDiv.className = player.isMe ? 'hand-container free-hand-surface' : `hand-container hand-${orient}`;

    if (player.isMe && player.hand) {
      player.hand.forEach((card, ci) => {
        ensureLayout(card, ci);
        const cardEl = buildFaceCard(card);
        const layout = cardLayouts.get(card.id);
        cardEl.classList.add('card-in-hand', 'mine');
        cardEl.dataset.cardId = card.id;
        cardEl.style.left = `${layout.x}px`;
        cardEl.style.top = `${layout.y}px`;
        cardEl.style.zIndex = layout.z;
        if (selectedCardIds.has(card.id)) cardEl.classList.add('selected');
        attachCardPointerHandlers(cardEl, card);
        handDiv.appendChild(cardEl);
      });
    } else {
      const show = Math.min(player.cardCount || 0, orient === 'h' ? 10 : 8);
      for (let i = 0; i < show; i++) {
        const cardEl = buildBackCard();
        cardEl.classList.add('card-in-hand');
        handDiv.appendChild(cardEl);
      }
    }

    if (seatClass === 'seat-0') {
      zone.appendChild(handDiv);
      zone.appendChild(avatarDiv);
    } else {
      zone.appendChild(avatarDiv);
      zone.appendChild(handDiv);
    }

    playerZonesEl.appendChild(zone);
  });
}

function renderMeldTable(state) {
  meldTable.innerHTML = '';
  if (!state.melds.length) {
    const empty = document.createElement('div');
    empty.className = 'meld-table-empty';
    empty.textContent = 'No melds on the table yet';
    meldTable.appendChild(empty);
    return;
  }

  state.melds.forEach(meld => {
    const group = document.createElement('div');
    group.className = `meld-group${selectedMeldId === meld.id ? ' selected' : ''}`;
    group.dataset.meldId = meld.id;
    group.addEventListener('click', () => {
      selectedMeldId = selectedMeldId === meld.id ? null : meld.id;
      renderMeldTable(gameState);
      updateActionBtns(gameState);
    });

    const label = document.createElement('div');
    label.className = 'meld-label';
    label.textContent = `${meldTypeLabel(meld.type)} ${meld.id}`;
    group.appendChild(label);

    const cards = document.createElement('div');
    cards.className = 'meld-cards';
    meld.cards.forEach(card => {
      const cardEl = buildFaceCard(card);
      cardEl.classList.add('meld-card');
      cards.appendChild(cardEl);
    });
    group.appendChild(cards);
    meldTable.appendChild(group);
  });
}

function attachCardPointerHandlers(cardEl, card) {
  cardEl.addEventListener('pointerdown', event => {
    if (!isMyTurn) return;
    const layout = cardLayouts.get(card.id);
    const parentRect = cardEl.parentElement.getBoundingClientRect();
    dragState = {
      cardId: card.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - parentRect.left - layout.x,
      offsetY: event.clientY - parentRect.top - layout.y,
      moved: false
    };
    layout.z = ++zCounter;
    cardEl.style.zIndex = layout.z;
    cardEl.classList.add('dragging');
    cardEl.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  cardEl.addEventListener('pointermove', event => {
    if (!dragState || dragState.cardId !== card.id) return;
    const parent = cardEl.parentElement;
    const parentRect = parent.getBoundingClientRect();
    const layout = cardLayouts.get(card.id);
    const { width, height } = cardMetrics();
    const maxX = Math.max(0, parent.clientWidth - width);
    const maxY = Math.max(0, parent.clientHeight - height);
    layout.x = clamp(event.clientX - parentRect.left - dragState.offsetX, 0, maxX);
    layout.y = clamp(event.clientY - parentRect.top - dragState.offsetY, 0, maxY);
    cardEl.style.left = `${layout.x}px`;
    cardEl.style.top = `${layout.y}px`;
    if (Math.abs(event.clientX - dragState.startX) > 4 || Math.abs(event.clientY - dragState.startY) > 4) {
      dragState.moved = true;
    }
  });

  cardEl.addEventListener('pointerup', event => finishCardPointer(event, cardEl, card));
  cardEl.addEventListener('pointercancel', event => finishCardPointer(event, cardEl, card));
}

function finishCardPointer(event, cardEl, card) {
  if (!dragState || dragState.cardId !== card.id) return;
  cardEl.classList.remove('dragging');
  cardEl.releasePointerCapture(event.pointerId);

  if (dragState.moved) {
    snapLayout(card.id);
    swapWithNearbyCard(card.id);
    renderTable(gameState);
  } else {
    toggleCardSelection(card.id);
  }

  dragState = null;
}

function toggleCardSelection(cardId) {
  if (!isMyTurn) return;
  if (selectedCardIds.has(cardId)) selectedCardIds.delete(cardId);
  else selectedCardIds.add(cardId);
  renderTable(gameState);
  updateActionBtns(gameState);
}

function snapLayout(cardId) {
  const layout = cardLayouts.get(cardId);
  if (!layout) return;
  if (Math.abs(layout.y - HAND_ROW_Y) < 26) layout.y = HAND_ROW_Y;
}

function swapWithNearbyCard(cardId) {
  const layout = cardLayouts.get(cardId);
  if (!layout) return;
  for (const [otherId, other] of cardLayouts.entries()) {
    if (otherId === cardId) continue;
    const distance = Math.hypot(layout.x - other.x, layout.y - other.y);
    if (distance < 34) {
      [layout.x, other.x] = [other.x, layout.x];
      [layout.y, other.y] = [other.y, layout.y];
      return;
    }
  }
}

function ensureLayout(card, index) {
  if (cardLayouts.has(card.id)) return;
  cardLayouts.set(card.id, {
    x: 22 + index * 42,
    y: HAND_ROW_Y,
    z: ++zCounter
  });
}

function reconcileLayouts(hand) {
  const ids = new Set(hand.map(card => card.id));
  for (const id of [...cardLayouts.keys()]) {
    if (!ids.has(id)) cardLayouts.delete(id);
  }
}

function reconcileSelection(hand) {
  const ids = new Set(hand.map(card => card.id));
  for (const id of [...selectedCardIds]) {
    if (!ids.has(id)) selectedCardIds.delete(id);
  }
}

function updateDeck(state) {
  deckCount.textContent = state.deckCount;
  deckStack.style.opacity = state.deckCount > 0 || state.discardCount > 1 ? '1' : '0.45';
  deckStack.style.cursor = isMyTurn && currentPhase === 'draw' ? 'pointer' : 'default';
}

function updateDiscard(state) {
  discardPile.querySelectorAll('.card').forEach(card => card.remove());
  if (state.topDiscard) {
    discardEmpty.style.display = 'none';
    const cardEl = buildFaceCard(state.topDiscard);
    cardEl.style.position = 'absolute';
    cardEl.style.top = '0';
    cardEl.style.left = '0';
    discardPile.appendChild(cardEl);
  } else {
    discardEmpty.style.display = 'flex';
  }
  discardPile.style.cursor = isMyTurn && currentPhase === 'draw' && state.discardCount > 0 ? 'pointer' : 'default';
}

function updateStatus(state) {
  const me = state.players.find(p => p.isMe);
  const current = state.players[state.currentTurn];
  if (!current) return;

  if (me && me.isTurn) {
    if (currentPhase === 'draw') {
      statusBar.textContent = `Your turn: draw from the stock or discard pile. Wild joker rank is ${state.wildJokerRank}.`;
    } else {
      statusBar.textContent = 'Play phase: make valid groups. Declaration needs 13 grouped cards, 2 sequences, and 1 pure sequence.';
    }
  } else {
    statusBar.textContent = `Waiting for ${current.name} to ${currentPhase === 'draw' ? 'draw' : 'play and discard'}.`;
  }
}

function updateActionBtns(state) {
  const selectedCount = selectedCardIds.size;
  const selectedOne = selectedCount === 1;
  const me = state?.players.find(p => p.isMe);
  const canPlay = !!(isMyTurn && currentPhase === 'play');
  const selectedCard = selectedOne ? [...selectedCardIds][0] : null;

  meldBtn.disabled = !(canPlay && selectedCount >= 3);
  layoffBtn.disabled = !(canPlay && selectedOne && selectedMeldId);
  discardBtn.disabled = !(canPlay && selectedOne && selectedCard !== state.drawnDiscardCardId);
  goOutBtn.disabled = !(canPlay && me && (
    me.cardCount === 0 ||
    (me.cardCount === 1 && selectedOne && selectedCard !== state.drawnDiscardCardId)
  ));
  sortBtn.disabled = !me || !me.hand || me.hand.length === 0;
}

meldBtn.addEventListener('click', () => {
  if (selectedCardIds.size < 3) return;
  socket.emit('createMeld', { cardIds: [...selectedCardIds] });
  selectedCardIds.clear();
});

layoffBtn.addEventListener('click', () => {
  if (selectedCardIds.size !== 1 || !selectedMeldId) return;
  socket.emit('layoffCard', { cardId: [...selectedCardIds][0], meldId: selectedMeldId, position: 'auto' });
  selectedCardIds.clear();
});

discardBtn.addEventListener('click', () => {
  if (selectedCardIds.size !== 1) return;
  socket.emit('discard', { cardId: [...selectedCardIds][0] });
  selectedCardIds.clear();
});

goOutBtn.addEventListener('click', () => {
  const selected = [...selectedCardIds];
  socket.emit('goOut', { discardCardId: selected.length === 1 ? selected[0] : null });
  selectedCardIds.clear();
});

sortBtn.addEventListener('click', () => arrangeHandBySort());

deckStack.addEventListener('click', () => {
  if (!isMyTurn || currentPhase !== 'draw') return;
  selectedCardIds.clear();
  socket.emit('drawDeck');
});

discardPile.addEventListener('click', () => {
  if (!isMyTurn || currentPhase !== 'draw') return;
  if (!gameState || !gameState.discardCount) return;
  selectedCardIds.clear();
  socket.emit('drawDiscard');
});

function arrangeHandBySort() {
  const me = gameState?.players.find(p => p.isMe);
  if (!me?.hand) return;
  const sorted = [...me.hand].sort((a, b) => {
    if (a.suit !== b.suit) return SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
    return RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
  });
  sorted.forEach((card, index) => {
    cardLayouts.set(card.id, {
      x: 22 + index * 46,
      y: HAND_ROW_Y,
      z: ++zCounter
    });
  });
  renderTable(gameState);
}

function centerPips(rank, suit) {
  if (rank === 'PJ') return '<span style="font-size:1.1rem">JOKER</span>';
  const sym = SUIT_SYMBOL[suit];
  const faceSymbols = { J: 'J', Q: 'Q', K: 'K', A: sym };
  if (faceSymbols[rank]) {
    return `<span style="font-size:${rank === 'A' ? '1.8rem' : '1.5rem'}">${faceSymbols[rank]}</span>`;
  }
  return `<span style="font-size:1.1rem">${sym}</span>`;
}

function buildFaceCard(card) {
  const el = document.createElement('div');
  const color = SUIT_COLOR[card.suit] || 'black';
  const sym = card.rank === 'PJ' ? '★' : (SUIT_SYMBOL[card.suit] || card.suit);
  const rank = card.rank === 'PJ' ? 'JOKER' : card.rank;
  el.className = `card ${color}`;
  el.innerHTML = `
    <div class="card-face">
      <div class="card-corner-top">
        <span class="card-rank">${escHtml(rank)}</span>
        <span class="card-suit-small">${sym}</span>
      </div>
      <div class="card-center">${centerPips(card.rank, card.suit)}</div>
      <div class="card-corner-bottom">
        <span class="card-rank">${escHtml(rank)}</span>
        <span class="card-suit-small">${sym}</span>
      </div>
    </div>
  `;
  return el;
}

function buildBackCard() {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = '<div class="card-back"><div class="card-back-inner"></div></div>';
  return el;
}

function addChat(msg) {
  const div = document.createElement('div');
  div.className = 'chat-msg' + (msg.system ? ' system' : '');
  if (msg.system) {
    div.textContent = `- ${msg.text} -`;
  } else {
    div.innerHTML = `<span class="chat-name">${escHtml(msg.avatar || '')} ${escHtml(msg.name)}: </span>${escHtml(msg.text)}`;
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('chat', { text });
  chatInput.value = '';
}

function showError(message) {
  lobbyError.textContent = message || '';
  wError.textContent = message || '';
  if (message && statusBar) statusBar.textContent = message;
}

function switchScreen(name) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
  document.getElementById(name).classList.add('active');
}

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cardMetrics() {
  const styles = getComputedStyle(document.documentElement);
  return {
    width: parseFloat(styles.getPropertyValue('--card-w')) || 72,
    height: parseFloat(styles.getPropertyValue('--card-h')) || 100
  };
}

function meldTypeLabel(type) {
  if (type === 'pureSequence') return 'PURE SEQ';
  if (type === 'impureSequence') return 'IMPURE SEQ';
  return 'SET';
}

chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
tbLeave.addEventListener('click', () => { if (confirm('Leave this room?')) location.reload(); });
goPlayAgain.addEventListener('click', () => location.reload());
