const Game = require('../models/game.model');
const User = require('../models/user.model');
const mongoose = require('mongoose');

async function recalcWinRate(userId) {
  try {
    const u = await User.findById(userId);
    if (u) {
      u.calculateWinRate();
      await u.save();
    }
  } catch (_) {}
}

// Utility: compute AI move for tic-tac-toe (simple strategy)
function computeAIMove(board, aiSymbol, humanSymbol) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  // 1) Win if possible
  for (const [a,b,c] of lines) {
    const line = [board[a], board[b], board[c]];
    if (line.filter(v => v === aiSymbol).length === 2 && line.includes(null)) {
      if (board[a] === null) return a;
      if (board[b] === null) return b;
      if (board[c] === null) return c;
    }
  }
  // 2) Block human win
  for (const [a,b,c] of lines) {
    const line = [board[a], board[b], board[c]];
    if (line.filter(v => v === humanSymbol).length === 2 && line.includes(null)) {
      if (board[a] === null) return a;
      if (board[b] === null) return b;
      if (board[c] === null) return c;
    }
  }
  // 3) Center
  if (board[4] === null) return 4;
  // 4) Corners
  const corners = [0,2,6,8].filter(i => board[i] === null);
  if (corners.length) return corners[0];
  // 5) Sides
  const sides = [1,3,5,7].filter(i => board[i] === null);
  if (sides.length) return sides[0];
  return -1;
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

    if (game.isFull()) {
      return res.status(400).json({ message: 'Game room is full' });
    }

    // Add player to game
    game.players.push({
      user: req.user._id,
      symbol: game.type === 'tic-tac-toe' ? 'O' : undefined,
      ready: false
    });

    // Initialize board for tic-tac-toe
    if (game.type === 'tic-tac-toe' && (!Array.isArray(game.board) || game.board.length !== 9)) {
      game.board = Array(9).fill(null);
    }

    // Update user's current game
    await User.findByIdAndUpdate(req.user._id, {
      currentGame: game._id
    });

    await game.save();

    res.json({
      message: 'Joined game room successfully',
      game
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error joining game room', 
      error: error.message 
    });
  }
};

// Make a move in the game
exports.makeMove = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { position } = req.body;
    
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

    // Make the human move
    const moveSuccess = game.makeMove(req.user._id, position);
    if (!moveSuccess) {
      return res.status(400).json({ message: 'Invalid move' });
    }

    // After human move, check for outcome
    if (game.checkWin()) {
      game.status = 'completed';
      game.winner = req.user._id;
      game.result = 'win';

      await User.findByIdAndUpdate(req.user._id, {
        $inc: {
          'stats.wins': 1,
          'stats.matchesPlayed': 1
        },
        currentGame: null
      });
      await recalcWinRate(req.user._id);

      // In multiplayer, update opponent as well
      if (game.mode === 'multi') {
        const opp = game.players.find(p => p.user && !p.user.equals(req.user._id));
        if (opp && opp.user) {
          await User.findByIdAndUpdate(opp.user, {
            $inc: {
              'stats.losses': 1,
              'stats.matchesPlayed': 1
            },
            currentGame: null
          });
          await recalcWinRate(opp.user);
        }
      }
    } else if (typeof game.isDraw === 'function' && game.isDraw()) {
      game.status = 'completed';
      game.result = 'draw';

      if (game.mode === 'multi') {
        const playerIds = game.players.map(p => p.user).filter(Boolean);
        await User.updateMany(
          { _id: { $in: playerIds } },
          {
            $inc: {
              'stats.ties': 1,
              'stats.matchesPlayed': 1
            },
            $set: { currentGame: null }
          }
        );
        await Promise.all(playerIds.map((id) => recalcWinRate(id)));
      } else {
        // In single-player, only update human stats
        await User.findByIdAndUpdate(req.user._id, {
          $inc: {
            'stats.ties': 1,
            'stats.matchesPlayed': 1
          },
          currentGame: null
        });
        await recalcWinRate(req.user._id);
      }
    } else {
      // Determine next player
      const opponent = game.players.find(
        p => !p.user || (p.user && !p.user.equals(req.user._id))
      );

      if (game.mode === 'single' && opponent && opponent.ai) {
        // AI turn for tic-tac-toe
        if (game.type === 'tic-tac-toe') {
          // Compute AI move
          const aiIndex = computeAIMove(game.board, opponent.symbol || 'O', 'X');
          if (aiIndex >= 0 && game.board[aiIndex] === null) {
            game.board[aiIndex] = opponent.symbol || 'O';
            game.moves.push({ player: 'ai', position: aiIndex });
          }

          // Check outcome after AI move
          if (game.checkWin()) {
            game.status = 'completed';
            game.winner = undefined; // AI winner (no user)
            game.result = 'win';

            // Human lost
            await User.findByIdAndUpdate(req.user._id, {
              $inc: {
                'stats.losses': 1,
                'stats.matchesPlayed': 1
              },
              currentGame: null
            });
            await recalcWinRate(req.user._id);
          } else if (typeof game.isDraw === 'function' && game.isDraw()) {
            game.status = 'completed';
            game.result = 'draw';

            await User.findByIdAndUpdate(req.user._id, {
              $inc: {
                'stats.ties': 1,
                'stats.matchesPlayed': 1
              },
              currentGame: null
            });
          } else {
            // Switch back to human
            game.currentTurn = req.user._id;
          }
        }
      } else {
        // Multiplayer: switch to the other user
        if (opponent && opponent.user) {
          game.currentTurn = opponent.user;
        }
      }
    }

    await game.save();

    res.json({
      message: 'Move made successfully',
      game
    });
  } catch (error) {
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
    const rooms = await Game.find({ 
      mode: 'multi',
      status: 'waiting',
      'players.1': { $exists: false } // Only rooms with 1 player
    })
    .populate('players.user', 'username')
    .select('name type roomCode players createdAt');

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
