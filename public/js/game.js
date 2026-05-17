// ── Royal Rummy Client ──────────────────────────────────────────────────────
const socket = io();

// State
let myId = null;
let myName = '';
let myAvatar = '🦊';
let roomId = null;
let gameState = null;
let selectedCardId = null;
let isMyTurn = false;
let currentPhase = 'draw';

// ── DOM refs ──────────────────────────────────────────────────────────────────
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
const deckStack       = document.getElementById('deckStack');
const deckCount       = document.getElementById('deckCount');
const discardPile     = document.getElementById('discardPile');
const discardEmpty    = document.getElementById('discardEmpty');
const statusBar       = document.getElementById('statusBar');
const actionBtns      = document.getElementById('actionBtns');
const knockBtn        = document.getElementById('knockBtn');
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

// ── Avatar selection ──────────────────────────────────────────────────────────
avatarRow.querySelectorAll('.avatar-opt').forEach(el => {
  el.addEventListener('click', () => {
    avatarRow.querySelectorAll('.avatar-opt').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    myAvatar = el.dataset.v;
  });
});

// ── Lobby actions ─────────────────────────────────────────────────────────────
createBtn.addEventListener('click', () => {
  myName = playerNameEl.value.trim() || 'Player';
  socket.emit('create', { name: myName, avatar: myAvatar });
});

joinBtn.addEventListener('click', () => {
  myName = playerNameEl.value.trim() || 'Player';
  const code = joinCode.value.trim().toUpperCase();
  if (!code) { lobbyError.textContent = 'Enter a room code'; return; }
  socket.emit('join', { roomId: code, name: myName, avatar: myAvatar });
});

joinCode.addEventListener('keydown', e => { if (e.key === 'Enter') joinBtn.click(); });
playerNameEl.addEventListener('keydown', e => { if (e.key === 'Enter') joinBtn.click(); });

// Auto uppercase room code
joinCode.addEventListener('input', () => { joinCode.value = joinCode.value.toUpperCase(); });

// ── Socket: joined room ───────────────────────────────────────────────────────
socket.on('joined', ({ roomId: rid }) => {
  myId = socket.id;
  roomId = rid;
  lobbyError.textContent = '';
  switchScreen('game');
  tbRoomId.textContent = `Room: ${rid}`;
  wRoomCode.textContent = rid;
  waitingOverlay.style.display = 'flex';
});

socket.on('err', msg => {
  lobbyError.textContent = msg;
  wError.textContent = msg;
});

// ── Socket: game state ────────────────────────────────────────────────────────
socket.on('state', state => {
  gameState = state;
  myId = socket.id;

  tbRound.textContent = `Round ${state.round || 1}`;

  const me = state.players.find(p => p.isMe);
  isMyTurn = me && me.isTurn;
  currentPhase = state.phase;

  // Update waiting overlay
  updateWaitingOverlay(state);

  if (state.state === 'playing' || state.state === 'roundEnd') {
    waitingOverlay.style.display = 'none';
    renderTable(state);
    updateDeck(state);
    updateDiscard(state);
    updateStatus(state);
    updateActionBtns(state);
  }
});

socket.on('started', () => {
  waitingOverlay.style.display = 'none';
  roundEndOverlay.classList.remove('show');
  selectedCardId = null;
});

socket.on('roundEnd', ({ type, results, scores, knockerName }) => {
  selectedCardId = null;
  let title = '';
  if (type === 'gin') title = `🎉 GIN! ${knockerName} goes out!`;
  else if (type === 'knock') title = `🤜 Knock! ${knockerName} knocks!`;
  else title = `✅ ${knockerName} goes out!`;

  reTitle.textContent = title;
  reResults.innerHTML = '';
  for (const r of results) {
    const row = document.createElement('div');
    row.className = 'result-row';
    row.innerHTML = `
      <span>${r.name}${r.isKnocker ? ' 🤜' : ''}</span>
      <span class="result-deadwood">Deadwood: ${r.deadwood}</span>
      <span style="color:#aed6b0">Score: ${scores[r.id] || 0}</span>
    `;
    reResults.appendChild(row);
  }
  reNext.textContent = 'Next round starting in 6s…';
  roundEndOverlay.classList.add('show');

  let secs = 6;
  const t = setInterval(() => {
    secs--;
    reNext.textContent = `Next round starting in ${secs}s…`;
    if (secs <= 0) clearInterval(t);
  }, 1000);
});

socket.on('gameOver', ({ winnerName, scores }) => {
  roundEndOverlay.classList.remove('show');
  goWinner.textContent = `🏆 Winner: ${winnerName}`;
  goScores.innerHTML = '<tr><th>Player</th><th>Score</th></tr>';
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  for (const [pid, score] of sorted) {
    const player = gameState?.players.find(p => p.id === pid);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${player?.name || pid}</td><td>${score}</td>`;
    goScores.appendChild(tr);
  }
  gameOverOverlay.classList.add('show');
});

socket.on('chat', msg => addChat(msg));

// ── Waiting overlay ───────────────────────────────────────────────────────────
function updateWaitingOverlay(state) {
  if (state.state !== 'waiting') return;
  waitingOverlay.style.display = 'flex';

  wPlayerList.innerHTML = '';
  for (const p of state.players) {
    const div = document.createElement('div');
    div.className = 'player-list-item';
    div.innerHTML = `
      <span class="pli-avatar">${p.avatar}</span>
      <span class="pli-name">${p.name}</span>
      ${state.isHost && p.id === socket.id ? '<span class="pli-host">HOST</span>' : ''}
      ${!state.isHost && p.seatIndex === 0 ? '<span class="pli-host">HOST</span>' : ''}
    `;
    wPlayerList.appendChild(div);
  }

  if (state.isHost) {
    wStartBtn.style.display = 'block';
    wWaitMsg.style.display = 'none';
    wStartBtn.disabled = state.players.length < 2;
    if (state.players.length >= 2) {
      wStartBtn.classList.add('btn-start-pulse');
    } else {
      wStartBtn.classList.remove('btn-start-pulse');
    }
  } else {
    wStartBtn.style.display = 'none';
    wWaitMsg.style.display = 'block';
  }
}

wStartBtn.addEventListener('click', () => socket.emit('start'));

// ── Table rendering ───────────────────────────────────────────────────────────
// Seat layout for N players.
// Index 0 = me (always bottom-center). Others are distributed around table.
//
// For 2p:  me=bottom, opp=top
// For 3p:  me=bottom, left, top
// For 4p:  me=bottom, left, top, right
// For 5p:  me=bottom, left, top-left, top-right, right
// For 6p:  me=bottom, left, top-left, top-center, top-right, right
// For 7p:  me=bottom, bottom-left, left, top-left, top-right, right, bottom-right
// For 8p:  me=bottom, bottom-left, left, top-left, top-center, top-right, right, bottom-right
// For 9p:  above + mid-left
// For 10p: above + mid-left + mid-right

// CSS classes per seat index (0=me, always 'seat-0')
const SEAT_CLASSES = [
  'seat-0',  // 0 = me, bottom center
  'seat-1',  // 1 = left
  'seat-2',  // 2 = top center
  'seat-3',  // 3 = right
  'seat-4',  // 4 = top-left
  'seat-5',  // 5 = top-right
  'seat-6',  // 6 = bottom-left
  'seat-7',  // 7 = bottom-right
  'seat-8',  // 8 = mid-left upper
  'seat-9',  // 9 = mid-right upper
];

// Which CSS seat each logical position maps to, per player count
// Index: logical position from my POV (0=me, 1=next clockwise, etc.)
const SEAT_MAP = {
  2:  [0, 2],
  3:  [0, 1, 2],
  4:  [0, 1, 2, 3],
  5:  [0, 1, 4, 5, 3],
  6:  [0, 1, 4, 2, 5, 3],
  7:  [0, 6, 1, 4, 5, 3, 7],
  8:  [0, 6, 1, 4, 2, 5, 3, 7],
  9:  [0, 6, 8, 1, 4, 2, 5, 3, 7],
  10: [0, 6, 8, 1, 4, 2, 5, 3, 9, 7],
};

// Hand orientation per CSS seat
// 'h' = horizontal spread, 'v' = vertical stack
const SEAT_ORIENTATION = {
  'seat-0': 'h',
  'seat-1': 'v',
  'seat-2': 'h',
  'seat-3': 'v',
  'seat-4': 'h',
  'seat-5': 'h',
  'seat-6': 'h',
  'seat-7': 'h',
  'seat-8': 'v',
  'seat-9': 'v',
};

function renderTable(state) {
  playerZonesEl.innerHTML = '';

  const n = state.players.length;
  const meIdx = state.players.findIndex(p => p.isMe);
  if (meIdx === -1) return;

  const map = SEAT_MAP[n] || SEAT_MAP[10];

  // Reorder players so me is first
  const ordered = [];
  for (let i = 0; i < n; i++) {
    ordered.push(state.players[(meIdx + i) % n]);
  }

  for (let i = 0; i < ordered.length; i++) {
    const player = ordered[i];
    const seatClass = SEAT_CLASSES[map[i]] || `seat-${i}`;
    const orient = SEAT_ORIENTATION[seatClass] || 'h';
    const isMe = player.isMe;

    const zone = document.createElement('div');
    zone.className = `player-zone ${seatClass}${player.isTurn ? ' my-turn' : ''}`;

    // Avatar block
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'player-avatar';
    avatarDiv.innerHTML = `
      <div class="avatar-face">${player.avatar}</div>
      <div class="avatar-name">${player.name}</div>
      <div class="score-badge">${state.scores[player.id] || 0} pts</div>
    `;
    // Dealer badge on first player
    if (player.seatIndex === 0) {
      const badge = document.createElement('div');
      badge.className = 'dealer-badge';
      badge.textContent = 'DEALER';
      avatarDiv.querySelector('.avatar-face').appendChild(badge);
    }

    // Hand
    const handDiv = document.createElement('div');
    handDiv.className = `hand-container hand-${orient}`;

    if (isMe && player.hand) {
      // My cards — face up, clickable
      player.hand.forEach((card, ci) => {
        const cardEl = buildFaceCard(card, true);
        cardEl.classList.add('card-in-hand', 'mine', 'card-dealt');
        cardEl.style.animationDelay = `${ci * 0.04}s`;
        if (selectedCardId === card.id) cardEl.classList.add('selected');
        cardEl.addEventListener('click', () => onMyCardClick(card.id, state));
        handDiv.appendChild(cardEl);
      });
    } else {
      // Other players — face down, stacked
      const count = player.cardCount || 0;
      const show = Math.min(count, orient === 'h' ? 10 : 8);
      for (let c = 0; c < show; c++) {
        const cardEl = buildBackCard();
        cardEl.classList.add('card-in-hand');
        handDiv.appendChild(cardEl);
      }
    }

    // Compose zone (avatar + hand)
    // For top seats: avatar first (above), then hand below
    // For bottom seat: hand first, then avatar below
    // For left/right: avatar first, then hand to side
    if (seatClass === 'seat-0' || seatClass === 'seat-6' || seatClass === 'seat-7') {
      // bottom seats: hand on top, avatar below
      zone.appendChild(handDiv);
      zone.appendChild(avatarDiv);
    } else {
      zone.appendChild(avatarDiv);
      zone.appendChild(handDiv);
    }

    playerZonesEl.appendChild(zone);
  }
}

function onMyCardClick(cardId, state) {
  if (!isMyTurn) return;

  if (currentPhase === 'discard') {
    // Select / confirm discard
    if (selectedCardId === cardId) {
      // Double-click = discard
      socket.emit('discard', { cardId });
      selectedCardId = null;
    } else {
      selectedCardId = cardId;
      renderTable(state);
    }
  }
}

// ── Deck & Discard ─────────────────────────────────────────────────────────────
function updateDeck(state) {
  deckCount.textContent = state.deckCount;
  deckStack.style.opacity = state.deckCount > 0 ? '1' : '0.4';
  deckStack.style.cursor = (isMyTurn && currentPhase === 'draw') ? 'pointer' : 'default';
}

function updateDiscard(state) {
  // Remove old face card if present
  discardPile.querySelectorAll('.card').forEach(c => c.remove());

  if (state.topDiscard) {
    discardEmpty.style.display = 'none';
    const cardEl = buildFaceCard(state.topDiscard, false);
    cardEl.style.position = 'absolute';
    cardEl.style.top = '0'; cardEl.style.left = '0';
    discardPile.appendChild(cardEl);
  } else {
    discardEmpty.style.display = 'flex';
  }

  discardPile.style.cursor = (isMyTurn && currentPhase === 'draw' && state.discardCount > 0) ? 'pointer' : 'default';
}

// ── Status bar ────────────────────────────────────────────────────────────────
function updateStatus(state) {
  const me = state.players.find(p => p.isMe);
  const current = state.players[state.currentTurn];

  if (!current) return;

  if (me && me.isTurn) {
    if (currentPhase === 'draw') {
      statusBar.textContent = "It's your turn. Draw a card from the deck or the discard pile.";
    } else {
      statusBar.textContent = selectedCardId
        ? "Click the same card again to discard it, or select a different card. Use 'Knock/Gin' if your deadwood ≤ 10."
        : "Click a card in your hand to select it, then click again to discard it.";
    }
  } else {
    statusBar.textContent = `Waiting for ${current.name} to ${currentPhase === 'draw' ? 'draw a card' : 'discard'}.`;
  }
}

// ── Action buttons ─────────────────────────────────────────────────────────────
function updateActionBtns(state) {
  sortBtn.disabled = false;
  knockBtn.disabled = !(isMyTurn && currentPhase === 'discard' && selectedCardId);
}

knockBtn.addEventListener('click', () => {
  if (!selectedCardId) return;
  socket.emit('knock', { cardId: selectedCardId });
  selectedCardId = null;
});

sortBtn.addEventListener('click', () => socket.emit('sortHand'));

// ── Deck / Discard clicks ─────────────────────────────────────────────────────
deckStack.addEventListener('click', () => {
  if (!isMyTurn || currentPhase !== 'draw') return;
  socket.emit('drawDeck');
  selectedCardId = null;
});

discardPile.addEventListener('click', () => {
  if (!isMyTurn || currentPhase !== 'draw') return;
  if (!gameState || !gameState.discardCount) return;
  socket.emit('drawDiscard');
  selectedCardId = null;
});

// ── Card builders ─────────────────────────────────────────────────────────────
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLOR  = { S: 'black', H: 'red', D: 'red', C: 'black' };

// Center pip for number cards
function centerPips(rank, suit) {
  const sym = SUIT_SYMBOL[suit];
  const faceSymbols = { J: '🃏', Q: '👑', K: '♔', A: sym };
  if (faceSymbols[rank]) {
    return `<span style="font-size:${rank==='A'?'1.8rem':'1.4rem'}">${faceSymbols[rank]}</span>`;
  }
  return `<span style="font-size:1.1rem">${sym}</span>`;
}

function buildFaceCard(card, interactive) {
  const el = document.createElement('div');
  const color = SUIT_COLOR[card.suit] || 'black';
  const sym = SUIT_SYMBOL[card.suit] || card.suit;
  el.className = `card ${color}`;
  el.innerHTML = `
    <div class="card-face">
      <div class="card-corner-top">
        <span class="card-rank">${card.rank}</span>
        <span class="card-suit-small">${sym}</span>
      </div>
      <div class="card-center">${centerPips(card.rank, card.suit)}</div>
      <div class="card-corner-bottom">
        <span class="card-rank">${card.rank}</span>
        <span class="card-suit-small">${sym}</span>
      </div>
    </div>
  `;
  return el;
}

function buildBackCard() {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `<div class="card-back"><div class="card-back-inner"></div></div>`;
  return el;
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function addChat(msg) {
  const div = document.createElement('div');
  div.className = 'chat-msg' + (msg.system ? ' system' : '');
  if (msg.system) {
    div.textContent = `— ${msg.text} —`;
  } else {
    div.innerHTML = `<span class="chat-name">${msg.avatar || ''} ${msg.name}: </span>${escHtml(msg.text)}`;
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('chat', { text });
  chatInput.value = '';
}

// ── Screen switch ─────────────────────────────────────────────────────────────
function switchScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(name).classList.add('active');
}

// ── Leave ─────────────────────────────────────────────────────────────────────
tbLeave.addEventListener('click', () => {
  if (confirm('Leave this room?')) location.reload();
});

goPlayAgain.addEventListener('click', () => location.reload());
