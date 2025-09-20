const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

exports.verifyToken = async (req, res, next) => {
  try {
    // Check for Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ 
        message: 'Authorization header missing' 
      });
    }

    // Check for Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Invalid token format. Use Bearer token' 
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        message: 'No token provided' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ 
        message: 'Invalid token' 
      });
    }

    // Check if user exists and is active
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ 
        message: 'User not found' 
      });
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Invalid token' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token expired' 
      });
    }
    return res.status(500).json({ 
      message: 'Authentication failed',
      error: error.message 
    });
  }
};

exports.isInGame = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user.currentGame) {
      return res.status(400).json({ message: 'User is not in a game' });
    }
    
    next();
  } catch (error) {
    res.status(500).json({ message: 'Error checking game status' });
  }
};