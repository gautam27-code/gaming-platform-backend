const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const passport = require('passport');

// Register new user
router.post('/register', authController.register);

// Login user
router.post('/login', authController.login);

// Get current user profile (protected route)
router.get(
  '/profile',
  passport.authenticate('jwt', { session: false }),
  authController.getProfile
);

// Update online status (protected route)
router.put(
  '/status',
  passport.authenticate('jwt', { session: false }),
  authController.updateOnlineStatus
);

module.exports = router;