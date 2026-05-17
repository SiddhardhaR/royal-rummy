# 🃏 Royal Rummy — Multiplayer Online

Real-time multiplayer Gin Rummy for **2–10 players**.

---

## 🚀 Quick Deploy (Railway — Free, ~2 min)

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **"New Project" → "Deploy from GitHub repo"**  
   *(or use "Deploy from template" → Node.js)*
3. Upload/push this folder to a GitHub repo
4. Set **Start Command**: `npm start`
5. Railway auto-detects Node.js, installs deps, and gives you a URL like:
   `https://royal-rummy-production.up.railway.app`
6. Share that URL — done! 🎉

---

## 🚀 Quick Deploy (Render — also free)

1. Push this folder to a GitHub repo
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect repo → Build command: `npm install` → Start command: `node server/index.js`
4. Free tier URL provided instantly

---

## 🖥 Run Locally

```bash
# Install deps
npm install

# Start server
npm start
# → http://localhost:3000
```

---

## 🎮 How to Play (Gin Rummy)

1. **Create** a room → share the room code with friends
2. **Host** clicks "Start Game" when everyone has joined
3. On your turn:
   - **Draw** a card from the Deck or Discard pile
   - **Select** a card from your hand (click once to highlight, click again to discard)
4. **Knock** button: if your unmatched deadwood ≤ 10, discard a card and knock
5. **Gin**: knock with 0 deadwood for +25 bonus points
6. First player to **100 points** wins!

### Card Rules
- 2–4 players: 1 deck, 10 cards each
- 5–7 players: 2 decks, 8 cards each  
- 8–10 players: 3 decks, 7 cards each

---

## Tech Stack
- **Node.js** + **Express** (server)
- **Socket.io** (real-time multiplayer)
- Vanilla HTML/CSS/JS (no framework needed)
