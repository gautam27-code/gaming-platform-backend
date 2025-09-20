const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const passport = require('passport');

// Protect all routes in this router
router.use(passport.authenticate('jwt', { session: false }));

// Get user profile by ID
router.get('/profile/:id', userController.getProfile);

// Update user stats
router.put('/stats', userController.updateStats);

// Friend requests
router.post('/friends/request', userController.sendFriendRequest);
router.put('/friends/request', userController.handleFriendRequest);

// Get friends list
router.get('/friends', userController.getFriends);

// Get leaderboard
router.get('/leaderboard', userController.getLeaderboard);

module.exports = router;