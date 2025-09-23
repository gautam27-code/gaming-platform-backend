const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/database');
const { errorHandler } = require('./middleware/error.middleware');
const User = require('./models/user.model');
const Game = require('./models/game.model');

// Load environment variables
dotenv.config();

// Ensure passport strategies are registered
require('./config/passport');

// Create Express app
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: (origin, callback) => callback(null, true), // allow all origins in dev
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(morgan('dev'));
app.use(passport.initialize());

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/games', require('./routes/game.routes'));

// Error handling
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Socket.io setup
const io = require('socket.io')(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ['GET', 'POST']
  }
});

async function recalcWinRate(userId) {
  try {
    const u = await User.findById(userId);
    if (u) {
      u.calculateWinRate();
      await u.save();
    }
  } catch (_) {}
}

// Socket.io middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return next(new Error('Authentication error'));
    }

    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

// Socket.io event handlers
io.on('connection', (socket) => {
  console.log('User connected:', socket.user.username);

  // Update user's online status
  User.findByIdAndUpdate(socket.user._id, { isOnline: true });

  // Join game room
  socket.on('join-game', (gameId) => {
    socket.join(gameId);
  });

  // Handle game moves
  socket.on('make-move', async (data) => {
    try {
      const { gameId, position } = data;
      const game = await Game.findById(gameId);

      if (!game) {
        return socket.emit('error', { message: 'Game not found' });
      }

      if (game.status !== 'in-progress') {
        return socket.emit('error', { message: 'Game is not in progress' });
      }

      if (!game.currentTurn || !game.currentTurn.equals(socket.user._id)) {
        return socket.emit('error', { message: 'Not your turn' });
      }

      // Apply move
      const moveSuccess = game.makeMove(socket.user._id, position);
      if (!moveSuccess) {
        return socket.emit('error', { message: 'Invalid move' });
      }

      // After move, check outcome
      if (game.checkWin()) {
        game.status = 'completed';
        game.winner = socket.user._id;
        game.result = 'win';

        // Update stats for multiplayer winner/loser
        await User.findByIdAndUpdate(socket.user._id, {
          $inc: { 'stats.wins': 1, 'stats.matchesPlayed': 1 },
          currentGame: null
        });
        await recalcWinRate(socket.user._id);

        const opp = game.players.find(p => p.user && !p.user.equals(socket.user._id));
        if (opp && opp.user) {
          await User.findByIdAndUpdate(opp.user, {
            $inc: { 'stats.losses': 1, 'stats.matchesPlayed': 1 },
            currentGame: null
          });
          await recalcWinRate(opp.user);
        }
      } else if (typeof game.isDraw === 'function' && game.isDraw()) {
        game.status = 'completed';
        game.result = 'draw';
        const playerIds = game.players.map(p => p.user).filter(Boolean);
        await User.updateMany(
          { _id: { $in: playerIds } },
          { $inc: { 'stats.ties': 1, 'stats.matchesPlayed': 1 }, $set: { currentGame: null } }
        );
        await Promise.all(playerIds.map(id => recalcWinRate(id)));
      } else {
        // Switch turns to opponent
        const nextPlayer = game.players.find(p => p.user && !p.user.equals(socket.user._id));
        if (nextPlayer) {
          game.currentTurn = nextPlayer.user;
        }
      }

      await game.save();

      // Broadcast updated game state to all players in the room
      io.to(gameId).emit('game-update', game);

      if (game.status === 'completed') {
        io.to(gameId).emit('game-over', { winner: game.winner, game });
      }
    } catch (error) {
      socket.emit('error', { message: 'Server error' });
    }
  });

  // Handle player ready status
  socket.on('player-ready', async (gameId) => {
    try {
      const game = await Game.findById(gameId);
      if (!game) {
        return socket.emit('error', { message: 'Game not found' });
      }

      const player = game.players.find(p => p.user.equals(socket.user._id));
      if (player) {
        player.ready = true;
        await game.save();

        // If all players are ready, start the game
        if (game.players.length > 1 && game.players.every(p => p.ready)) {
          game.status = 'in-progress';
          game.currentTurn = game.players[0].user;
          await game.save();
          io.to(gameId).emit('game-start', game);
        } else {
          io.to(gameId).emit('player-ready-update', {
            playerId: socket.user._id,
            game
          });
        }
      }
    } catch (error) {
      socket.emit('error', { message: 'Server error' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.user.username);
    
    // Update user's online status and last active time
    await User.findByIdAndUpdate(socket.user._id, {
      isOnline: false,
      lastActive: new Date()
    });

    // Handle any active games
    const game = await Game.findOne({
      'players.user': socket.user._id,
      status: 'in-progress'
    });

    if (game) {
      game.status = 'completed';
      game.result = 'abandoned';
      await game.save();

      // Notify other players
      io.to(game._id.toString()).emit('player-disconnected', {
        playerId: socket.user._id,
        game
      });
    }
  });
});

module.exports = app;