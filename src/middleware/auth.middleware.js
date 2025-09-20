const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

exports.verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
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