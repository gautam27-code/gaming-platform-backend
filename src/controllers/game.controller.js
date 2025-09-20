const Game = require('../models/game.model');
const User = require('../models/user.model');

// Create a new game room
exports.createRoom = async (req, res) => {
  try {
    const { name, type } = req.body;

    const game = new Game({
      name,
      type,
      players: [{
        user: req.user._id,
        ready: false
      }],
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
      ready: false
    });

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

    if (!game.currentTurn.equals(req.user._id)) {
      return res.status(400).json({ message: 'Not your turn' });
    }

    // Make the move
    const moveSuccess = game.makeMove(req.user._id, position);
    if (!moveSuccess) {
      return res.status(400).json({ message: 'Invalid move' });
    }

    // Check for win condition
    if (game.checkWin()) {
      game.status = 'completed';
      game.winner = req.user._id;
      game.result = 'win';

      // Update player stats
      await User.findByIdAndUpdate(req.user._id, {
        $inc: {
          'stats.wins': 1,
          'stats.matchesPlayed': 1
        },
        currentGame: null
      });

      // Update opponent stats
      const opponent = game.players.find(
        player => !player.user.equals(req.user._id)
      );
      await User.findByIdAndUpdate(opponent.user, {
        $inc: {
          'stats.losses': 1,
          'stats.matchesPlayed': 1
        },
        currentGame: null
      });
    } else {
      // Switch turns
      const nextPlayer = game.players.find(
        player => !player.user.equals(req.user._id)
      );
      game.currentTurn = nextPlayer.user;
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
      p => p.user.equals(req.user._id)
    );

    if (!player) {
      return res.status(400).json({ message: 'Player not in game' });
    }

    player.ready = true;

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