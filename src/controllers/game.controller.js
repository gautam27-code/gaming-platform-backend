const Game = require('../models/game.model');
const User = require('../models/user.model');
const mongoose = require('mongoose');

// Helper function to check for a win in tic-tac-toe
function checkWin(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  return lines.some(([a,b,c]) => 
    board[a] && board[a] === board[b] && board[a] === board[c]
  );
}

// Helper function to check for a draw
function checkDraw(board) {
  return board.every(cell => cell !== null);
}

// Helper function to recalculate win rate
async function recalcWinRate(userId) {
  try {
    const u = await User.findById(userId);
    if (u) {
      u.calculateWinRate();
      await u.save();
    }
  } catch (_) {}
}

// Utility: compute AI move for tic-tac-toe
function computeAIMove(board, aiSymbol = 'O', humanSymbol = 'X') {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  // Helper to check if a line has potential
  const checkLine = (line, symbol, empty = 1) => {
    const counts = line.reduce((acc, val) => {
      if (val === symbol) acc.symbol++;
      if (val === null) acc.empty++;
      return acc;
    }, { symbol: 0, empty: 0 });
    return counts.symbol === (3 - empty) && counts.empty === empty;
  };

  // 1) Win if possible
  for (const [a,b,c] of lines) {
    const lineVals = [board[a], board[b], board[c]];
    if (checkLine(lineVals, aiSymbol)) {
      if (board[a] === null) return a;
      if (board[b] === null) return b;
      if (board[c] === null) return c;
    }
  }

  // 2) Block human win
  for (const [a,b,c] of lines) {
    const lineVals = [board[a], board[b], board[c]];
    if (checkLine(lineVals, humanSymbol)) {
      if (board[a] === null) return a;
      if (board[b] === null) return b;
      if (board[c] === null) return c;
    }
  }

  // 3) Create fork opportunity or block opponent's fork
  for (const [a,b,c] of lines) {
    const lineVals = [board[a], board[b], board[c]];
    if (checkLine(lineVals, aiSymbol, 2)) {
      if (board[a] === null) return a;
      if (board[b] === null) return b;
      if (board[c] === null) return c;
    }
  }

  // 4) Center
  if (board[4] === null) return 4;

  // 5) Opposite corner of human
  const oppositeCorners = [[0,8], [2,6]];
  for (const [a,b] of oppositeCorners) {
    if (board[a] === humanSymbol && board[b] === null) return b;
    if (board[b] === humanSymbol && board[a] === null) return a;
  }

  // 6) Empty corner
  const corners = [0,2,6,8].filter(i => board[i] === null);
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];

  // 7) Empty side
  const sides = [1,3,5,7].filter(i => board[i] === null);
  if (sides.length) return sides[Math.floor(Math.random() * sides.length)];

  return -1; // No moves available
}

// Create a new game room
exports.createRoom = async (req, res) => {
  try {
    const { name, type } = req.body;

    const game = new Game({
      name,
      type,
      mode: 'multi',
      players: [{
        user: req.user._id,
        symbol: type === 'tic-tac-toe' ? 'X' : undefined,
        ready: false
      }],
      board: type === 'tic-tac-toe' ? Array(9).fill(null) : null,
      roomCode: Math.random().toString(36).substring(2, 8).toUpperCase()
    });

    await game.save();

    // Update user's current game
    await User.findByIdAndUpdate(req.user._id, {
      currentGame: game._id
    });

    res.status(201).json({
      message: 'Game room created successfully',
      game
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error creating game room', 
      error: error.message 
    });
  }
};

// Create a single-player game (vs AI)
exports.createSinglePlayer = async (req, res) => {
  try {
    const { type = 'tic-tac-toe', name = 'Single Player' } = req.body || {};

    if (type !== 'tic-tac-toe') {
      return res.status(400).json({ message: 'Only tic-tac-toe is supported for single player right now' });
    }

    const game = new Game({
      name,
      type,
      mode: 'single',
      status: 'in-progress',
      players: [
        { user: req.user._id, ai: false, symbol: 'X', ready: true },
        { user: undefined, ai: true, symbol: 'O', ready: true },
      ],
      board: Array(9).fill(null),
      currentTurn: req.user._id,
      // give single-player games a unique roomCode to avoid unique index collisions
      roomCode: `SP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    });

    await game.save();

    // Update user's current game
    await User.findByIdAndUpdate(req.user._id, { currentGame: game._id });

    res.status(201).json({ message: 'Single player game created', game });
  } catch (error) {
    res.status(500).json({ message: 'Error creating single player game', error: error.message });
  }
};

// Join a game room
exports.joinRoom = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const game = await Game.findOne({ roomCode });

    if (!game) {
      return res.status(404).json({ message: 'Game room not found' });
    }

    if (game.status !== 'waiting') {
      return res.status(400).json({ message: 'Game already in progress' });
    }

    // If user already in players, don't add again
    const already = game.players.find(p => p.user && p.user.equals(req.user._id));
    if (already) {
      // Ensure symbol assignment is consistent
      if (!already.symbol && game.type === 'tic-tac-toe') {
        already.symbol = game.players[0]?.symbol === 'X' ? 'O' : 'X' || 'X';
      }
    } else {
      if (game.isFull()) {
        return res.status(400).json({ message: 'Game room is full' });
      }
      // Add player to game
      game.players.push({
        user: req.user._id,
        symbol: game.type === 'tic-tac-toe' ? (game.players[0]?.symbol === 'X' ? 'O' : 'X') : undefined,
        ready: false
      });
    }

    // Initialize board for tic-tac-toe
    if (game.type === 'tic-tac-toe' && (!Array.isArray(game.board) || game.board.length !== 9)) {
      game.board = Array(9).fill(null);
      if (typeof game.markModified === 'function') game.markModified('board');
    }

    // Update user's current game
    await User.findByIdAndUpdate(req.user._id, {
      currentGame: game._id
    });

    await game.save();

    res.json({
      message: already ? 'Rejoined game room' : 'Joined game room successfully',
      game
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error joining game room', 
      error: error.message 
    });
  }
};

// Leave a game room (remove player while waiting)
exports.leaveRoom = async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await Game.findById(gameId);
    if (!game) return res.status(404).json({ message: 'Game not found' });

    // Remove player entry
    const before = game.players.length;
    game.players = game.players.filter(p => !(p.user && p.user.equals(req.user._id)));

    // Clear current game for user
    await User.findByIdAndUpdate(req.user._id, { currentGame: null });

    if (game.players.length === 0) {
      await game.deleteOne();
      return res.json({ message: 'Left room and room removed (empty)' });
    }

    // If game was waiting, keep waiting. If in-progress and a player leaves, mark abandoned.
    if (game.status === 'in-progress') {
      game.status = 'completed';
      game.result = 'abandoned';
      await game.save();
      return res.json({ message: 'Left game (abandoned)', game });
    }

    await game.save();
    return res.json({ message: before !== game.players.length ? 'Left room' : 'Not in room', game });
  } catch (error) {
    res.status(500).json({ message: 'Error leaving room', error: error.message });
  }
};

// Make a move in the game
exports.makeMove = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { row, col } = req.body;
    
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    if (game.status !== 'in-progress') {
      return res.status(400).json({ message: 'Game is not in progress' });
    }

    if (!game.currentTurn || !game.currentTurn.equals(req.user._id)) {
      return res.status(400).json({ message: 'Not your turn' });
    }
    
    // Validate row/col inputs
    if (typeof row !== 'number' || typeof col !== 'number' ||
        row < 0 || row >= 3 || col < 0 || col >= 3) {
      return res.status(400).json({ message: 'Invalid row or column' });
    }

    // Convert row/col to position for tic-tac-toe
    const position = row * 3 + col;

    // Check if position is already taken
    if (game.board[position] !== null) {
      return res.status(400).json({ message: 'Position already taken' });
    }

    // Make human move
    game.board[position] = 'X';
    if (typeof game.markModified === 'function') game.markModified('board');
    game.moves.push({ player: req.user._id, position });

    // Check if human won
    if (checkWin(game.board)) {
      game.status = 'completed';
      game.winner = req.user._id;
      game.result = 'win';
      game.currentTurn = null;

      // Update stats for human win
      await User.findByIdAndUpdate(req.user._id, {
        $inc: {
          'stats.wins': 1,
          'stats.matchesPlayed': 1
        },
        $set: { currentGame: null }
      });
      await recalcWinRate(req.user._id);
    }
    // Check for draw after human move
    else if (checkDraw(game.board)) {
      game.status = 'completed';
      game.result = 'draw';
      game.currentTurn = null;

      // Update stats for draw
      await User.findByIdAndUpdate(req.user._id, {
        $inc: {
          'stats.ties': 1,
          'stats.matchesPlayed': 1
        },
        $set: { currentGame: null }
      });
      await recalcWinRate(req.user._id);
    }
    // If game continues, handle AI move in single-player mode
    else if (game.mode === 'single') {
      const aiIndex = computeAIMove(game.board);
      if (aiIndex >= 0) {
        game.board[aiIndex] = 'O';
        if (typeof game.markModified === 'function') game.markModified('board');
        game.moves.push({ player: 'ai', position: aiIndex });

        // Check if AI won
        if (checkWin(game.board)) {
          game.status = 'completed';
          game.winner = null; // AI win
          game.result = 'win';
          game.currentTurn = null;

          // Update stats for AI win
          await User.findByIdAndUpdate(req.user._id, {
            $inc: {
              'stats.losses': 1,
              'stats.matchesPlayed': 1
            },
            $set: { currentGame: null }
          });
          await recalcWinRate(req.user._id);
        }
        // Check for draw after AI move
        else if (checkDraw(game.board)) {
          game.status = 'completed';
          game.result = 'draw';
          game.currentTurn = null;

          // Update stats for draw
          await User.findByIdAndUpdate(req.user._id, {
            $inc: {
              'stats.ties': 1,
              'stats.matchesPlayed': 1
            },
            $set: { currentGame: null }
          });
          await recalcWinRate(req.user._id);
        }
        // Game continues
        else {
          game.currentTurn = req.user._id;
        }
      }
    }
    // In multiplayer, switch turn to the other player
    else {
      const opponent = game.players.find(p => !p.user.equals(req.user._id));
      if (opponent) {
        game.currentTurn = opponent.user;
      }
    }

    await game.save();

    res.json({
      message: 'Move made successfully',
      game
    });
  } catch (error) {
    console.error('Error making move:', error);
    res.status(500).json({
      message: 'Error making move',
      error: error.message
    });
  }
};

// Get game state
exports.getGameState = async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await Game.findById(gameId)
      .populate('players.user', 'username')
      .populate('currentTurn', 'username')
      .populate('winner', 'username');

    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    res.json(game);
  } catch (error) {
    res.status(500).json({ 
      message: 'Error fetching game state', 
      error: error.message 
    });
  }
};

// Get list of available rooms
exports.getAvailableRooms = async (req, res) => {
  try {
    // Return all multiplayer rooms that are waiting or already in-progress (for visibility)
    const rooms = await Game.find({ 
      mode: 'multi',
      status: { $in: ['waiting', 'in-progress'] }
    })
    .sort({ createdAt: -1 })
    .populate('players.user', 'username')
    .select('name type roomCode players createdAt status');

    res.json(rooms);
  } catch (error) {
    res.status(500).json({ 
      message: 'Error fetching available rooms', 
      error: error.message 
    });
  }
};

// Mark player as ready
exports.setPlayerReady = async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await Game.findById(gameId);

    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    const player = game.players.find(
      p => p.user && p.user.equals(req.user._id)
    );

    if (!player) {
      return res.status(400).json({ message: 'Player not in game' });
    }

    player.ready = true;

    // Initialize board/symbols for tic-tac-toe
    if (game.type === 'tic-tac-toe' && (!Array.isArray(game.board) || game.board.length !== 9)) {
      game.board = Array(9).fill(null);
      if (typeof game.markModified === 'function') game.markModified('board');
    }

    // Check if all players are ready
    if (game.players.length > 1 && game.players.every(p => p.ready)) {
      game.status = 'in-progress';
      game.currentTurn = game.players[0].user; // First player starts
    }

    await game.save();

    res.json({
      message: 'Player ready status updated',
      game
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error updating ready status', 
      error: error.message 
    });
  }
};
