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

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

require('./config/passport');

const app = express();

connectDB();

app.use(cors({
  origin: (origin, callback) => callback(null, true), // allow all origins in dev
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(morgan('dev'));
app.use(passport.initialize());

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/games', require('./routes/game.routes'));

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

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
  } catch (error) {
    console.error('Error recalculating win rate:', error);
  }
}

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
    console.error('Socket auth error:', error);
    next(new Error('Authentication error'));
  }
});

function idsEqual(a, b) {
  if (!a || !b) return false;
  try {
    if (typeof a.equals === 'function') return a.equals(b);
    if (typeof b.equals === 'function') return b.equals(a);
  } catch (_) {}
  return a.toString() === b.toString();
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.user.username);

  User.findByIdAndUpdate(socket.user._id, { isOnline: true });

  socket.on('join-game', (gameId) => {
    socket.join(gameId);
  });

  socket.on('leave-game', async (gameId) => {
    try {
      socket.leave(gameId);
      const game = await Game.findById(gameId);
      if (!game) return;
      game.players = game.players.filter(p => !(p.user && p.user.equals(socket.user._id)));
      if (game.players.length === 0) {
        await game.deleteOne();
        return;
      }
      if (game.status === 'in-progress') {
        game.status = 'completed';
        game.result = 'abandoned';
      }
      await game.save();
      io.to(gameId).emit('game-update', game);
    } catch (e) {
      console.error('Error leaving game:', e);
    }
  });

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

      const moveSuccess = game.makeMove(socket.user._id, position);
      if (!moveSuccess) {
        return socket.emit('error', { message: 'Invalid move' });
      }

      if (game.checkWin()) {
        game.status = 'completed';
        game.winner = socket.user._id;
        game.result = 'win';

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
        const nextPlayer = game.players.find(p => p.user && !p.user.equals(socket.user._id));
        if (nextPlayer) {
          game.currentTurn = nextPlayer.user;
        }
      }

      await game.save();

      io.to(gameId).emit('game-update', game);

      if (game.status === 'completed') {
        io.to(gameId).emit('game-over', { winner: game.winner, game });
      }
    } catch (error) {
      console.error('Error making move:', error);
      socket.emit('error', { message: 'Server error' });
    }
  });

  socket.on('player-ready', async (gameId) => {
    try {
      const game = await Game.findById(gameId);
      if (!game) {
        return socket.emit('error', { message: 'Game not found' });
      }

      const player = game.players.find(p => p.user && idsEqual(p.user, socket.user._id));
      if (player) {
        player.ready = true;
        const hostUserId = game.players[0]?.user;
        const isHost = !!hostUserId && idsEqual(hostUserId, socket.user._id);

        if (game.type === 'tic-tac-toe' && (!Array.isArray(game.board) || game.board.length !== 9)) {
          game.board = Array(9).fill(null);
          if (typeof game.markModified === 'function') game.markModified('board');
        }

        if (isHost && game.players.length > 1) {
          game.status = 'in-progress';
          game.currentTurn = game.players[0].user; // host starts
          await game.save();

          io.to(gameId).emit('game-start', game);
          io.to(gameId).emit('game-update', game);
        } else {
          await game.save();
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
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.user.username);
    
    await User.findByIdAndUpdate(socket.user._id, {
      isOnline: false,
      lastActive: new Date()
    });

    const games = await Game.find({ 'players.user': socket.user._id });
    for (const game of games) {
      if (game.status === 'in-progress') {
        game.status = 'completed';
        game.result = 'abandoned';
        await game.save();
        io.to(game._id.toString()).emit('player-disconnected', { playerId: socket.user._id, game });
      } else if (game.status === 'waiting') {

        game.players = game.players.filter(p => !(p.user && p.user.equals(socket.user._id)));
        if (game.players.length === 0) {
          await game.deleteOne();
        } else {
          await game.save();
          io.to(game._id.toString()).emit('game-update', game);
        }
      }
    }
  });

module.exports = app;