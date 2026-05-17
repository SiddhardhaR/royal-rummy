# Royal Rummy - Multiplayer Online

Real-time multiplayer 13-card Indian Rummy for 2-6 players.

## Quick Deploy

### Railway

1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. Create a new project from this GitHub repo.
3. Set the start command to `npm start`.
4. Railway installs dependencies and gives you a public URL.

### Render

1. Go to [render.com](https://render.com) and create a new Web Service.
2. Connect this repo.
3. Use `npm install` as the build command.
4. Use `node server/index.js` as the start command.

## Run Locally

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

## How to Play

- Each player gets 13 cards.
- The game uses 2 decks with printed jokers.
- One random rank is selected as the wild joker for the hand.
- Draw from the stock or discard pile to start your turn.
- Select 3 or more cards and create a group:
  - Pure sequence: 3 or more consecutive cards of the same suit without printed or wild jokers.
  - Impure sequence: 3 or more consecutive cards of the same suit with printed or wild jokers filling gaps.
  - Set: 3 or more cards of the same rank and different suits, with jokers allowed.
- A valid declaration requires all 13 cards to be grouped, at least 2 sequences, and at least 1 pure sequence.
- Discard one card to end your turn.
- If you drew from discard, you cannot discard that exact card in the same turn.
- Empty your hand with a valid declaration to win the hand.

## Scoring

The winner receives the total penalty points from opponents.

- Aces: 10 points
- Number cards: rank value
- Face cards: 10 points
- Printed and wild jokers: 0 points
- If a losing player does not have 2 sequences including 1 pure sequence, all their cards count, capped at 80.
- If a losing player has the required sequences, only ungrouped cards count, capped at 80.
- Target score is 101 points.

## Card Handling

Your cards are draggable on your personal play surface. You can overlap, swap, and sort them visually without changing server ownership. Table melds remain server-validated so multiplayer rules stay fair.

## Tech Stack

- Node.js and Express
- Socket.io
- Vanilla HTML, CSS, and JavaScript
