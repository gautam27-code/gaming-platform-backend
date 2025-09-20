const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const passport = require('passport');
require('../config/passport');

// Helper: generate JWT
const generateToken = (user) => {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
};

// Register new user
exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Please provide username, email and password' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Check for existing user case-insensitive
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: { $regex: new RegExp('^' + username + '$', 'i') } }
      ]
    });
    
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email or username already exists' });
    }

    // Initialize user with default stats
    const user = new User({
      username,
      email: email.toLowerCase(),
      password,
      stats: {
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        globalRank: await User.countDocuments() + 1
      },
      isOnline: true,
      lastActive: new Date()
    });

    await user.save();

    const token = generateToken(user);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        stats: user.stats
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error registering user', error: error.message });
  }
};

// Login user
exports.login = (req, res, next) => {
  passport.authenticate('local', { session: false }, async (err, user, info) => {
    try {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || 'Invalid email or password' });

      // Generate JWT
      const token = generateToken(user);

      // Update online status
      user.isOnline = true;
      user.lastActive = new Date();
      await user.save();

      return res.json({
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          stats: user.stats
        }
      });
    } catch (error) {
      return next(error);
    }
  })(req, res, next);
};

// Get current user profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('friends.user', 'username isOnline lastActive');

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching profile', error: error.message });
  }
};

// Update online status
exports.updateOnlineStatus = async (req, res) => {
  try {
    const { isOnline } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isOnline = isOnline;
    user.lastActive = new Date();
    await user.save();

    res.json({ message: 'Online status updated', isOnline });
  } catch (error) {
    res.status(500).json({ message: 'Error updating online status', error: error.message });
  }
};
