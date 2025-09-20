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
  status: {
    type: String,
    enum: ['waiting', 'in-progress', 'completed'],
    default: 'waiting'
  },
  players: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    position: mongoose.Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now }
  }],
  result: {
    type: String,
    enum: ['win', 'draw', 'abandoned'],
    default: null
  },
  roomCode: {
    type: String,
    unique: true
  }
}, {
  timestamps: true
});

// Method to check if game is full
gameSchema.methods.isFull = function() {
  return this.players.length >= 2;
};

// Method to make a move
gameSchema.methods.makeMove = function(userId, position) {
  if (this.status !== 'in-progress') return false;
  if (!this.currentTurn.equals(userId)) return false;
  
  // Add move to history
  this.moves.push({ player: userId, position });
  
  // Update board state - implement game specific logic here
  // This is a placeholder - actual implementation will depend on game type
  return true;
};

// Method to check win condition
gameSchema.methods.checkWin = function() {
  // Implement game specific win checking logic
  // This is a placeholder - actual implementation will depend on game type
  return false;
};

module.exports = mongoose.model('Game', gameSchema);