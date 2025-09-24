const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['tic-tac-toe', 'chess', 'connect4']
  },
  // Game mode: multiplayer or single-player vs AI
  mode: {
    type: String,
    enum: ['multi', 'single'],
    default: 'multi'
  },
  status: {
    type: String,
    enum: ['waiting', 'in-progress', 'completed'],
    default: 'waiting'
  },
  players: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    ai: { type: Boolean, default: false },
    symbol: String, // X or O for tic-tac-toe
    color: String, // white or black for chess
    ready: { type: Boolean, default: false }
  }],
  currentTurn: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  winner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  board: {
    type: mongoose.Schema.Types.Mixed, // Will store game state
    default: null
  },
  moves: [{
    player: { type: mongoose.Schema.Types.Mixed }, // user ObjectId or 'ai'
    position: mongoose.Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now }
  }],
  result: {
    type: String,
    enum: ['win', 'draw', 'abandoned'],
    default: undefined
  },
  roomCode: {
    type: String,
    unique: true,
    sparse: true
  }
}, {
  timestamps: true
});

// Method to check if game is full
gameSchema.methods.isFull = function() {
  return this.players.length >= 2;
};

// Initialize tic-tac-toe board and symbols if needed
function ensureTicTacToeSetup(game) {
  if (game.type !== 'tic-tac-toe') return;
  if (!Array.isArray(game.board) || game.board.length !== 9) {
    game.board = Array(9).fill(null);
    if (typeof game.markModified === 'function') game.markModified('board');
  }
  // Assign symbols to first two players if missing
  if (game.players && game.players.length > 0) {
    let changed = false;
    if (!game.players[0].symbol) { game.players[0].symbol = 'X'; changed = true; }
    if (game.players[1] && !game.players[1].symbol) { game.players[1].symbol = 'O'; changed = true; }
    if (changed && typeof game.markModified === 'function') game.markModified('players');
  }
}

// Helper to get player's symbol in tic-tac-toe
function getPlayerSymbol(game, userId) {
  const p = game.players.find(p => p.user && p.user.equals(userId));
  return p ? p.symbol : null;
}

// Method to make a move
gameSchema.methods.makeMove = function(userId, position) {
  if (this.status !== 'in-progress') return false;
  if (!this.currentTurn || !this.currentTurn.equals(userId)) return false;

  if (this.type === 'tic-tac-toe') {
    ensureTicTacToeSetup(this);

    // Normalize position: can be index 0-8 or {row, col}
    let index = -1;
    if (typeof position === 'number') {
      index = position;
    } else if (position && typeof position === 'object' &&
               Number.isInteger(position.row) && Number.isInteger(position.col)) {
      const { row, col } = position;
      if (row < 0 || row > 2 || col < 0 || col > 2) return false;
      index = row * 3 + col;
    }
    if (index < 0 || index > 8) return false;

    // Cell must be empty
    if (this.board[index] !== null) return false;

    const symbol = getPlayerSymbol(this, userId);
    if (!symbol) return false;

    // Apply move
    this.board[index] = symbol;
    // Mixed type requires explicit markModified for nested changes
    if (typeof this.markModified === 'function') this.markModified('board');
    this.moves.push({ player: userId, position: index });

    return true;
  }

  // TODO: Implement other game types
  return false;
};

// Method to check win condition
gameSchema.methods.checkWin = function() {
  if (this.type === 'tic-tac-toe') {
    ensureTicTacToeSetup(this);
    const b = this.board;
    const lines = [
      [0,1,2],[3,4,5],[6,7,8], // rows
      [0,3,6],[1,4,7],[2,5,8], // cols
      [0,4,8],[2,4,6]          // diags
    ];
    for (const [a,bn,c] of lines) {
      if (b[a] && b[a] === b[bn] && b[a] === b[c]) return true;
    }
    return false;
  }
  // TODO: Implement other game types
  return false;
};

// Helper to check draw in tic-tac-toe
gameSchema.methods.isDraw = function() {
  if (this.type === 'tic-tac-toe') {
    ensureTicTacToeSetup(this);
    return this.board.every(cell => cell !== null) && !this.checkWin();
  }
  return false;
};

module.exports = mongoose.model('Game', gameSchema);
