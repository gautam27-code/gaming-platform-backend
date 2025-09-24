const express = require('express');
const router = express.Router();
const gameController = require('../controllers/game.controller');
const passport = require('passport');

// Protect all routes in this router
router.use(passport.authenticate('jwt', { session: false }));

// Create a new multiplayer game room
router.post('/rooms', gameController.createRoom);

// Create a single-player game vs AI
router.post('/single-player', gameController.createSinglePlayer);

// Get list of available rooms
router.get('/rooms', gameController.getAvailableRooms);

// Join a game room
router.post('/rooms/:roomCode/join', gameController.joinRoom);

// Leave a game room
router.delete('/:gameId/leave', gameController.leaveRoom);

// Get game state
router.get('/:gameId', gameController.getGameState);

// Make a move
router.post('/:gameId/move', gameController.makeMove);

// Set player ready status
router.put('/:gameId/ready', gameController.setPlayerReady);

module.exports = router;
