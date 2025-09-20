const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const passport = require('passport');
const connectDB = require('./config/database');
const { errorHandler } = require('./middleware/error.middleware');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
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
    origin: process.env.CLIENT_URL,
    methods: ['GET', 'POST']
  }
});

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

      // Update game state (implementation depends on game type)
      const moveSuccess = game.makeMove(socket.user._id, position);
      if (!moveSuccess) {
        return socket.emit('error', { message: 'Invalid move' });
      }

      // Broadcast updated game state to all players in the room
      io.to(gameId).emit('game-update', game);

      // Check for game end conditions
      if (game.checkWin()) {
        io.to(gameId).emit('game-over', {
          winner: socket.user._id,
          game
        });
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