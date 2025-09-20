const User = require('../models/user.model');

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('friends.user', 'username isOnline lastActive stats');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ 
      message: 'Error fetching user profile', 
      error: error.message 
    });
  }
};

// Update user stats
exports.updateStats = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const { result } = req.body; // 'win', 'loss', or 'tie'

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update stats based on game result
    user.stats.matchesPlayed += 1;
    if (result === 'win') {
      user.stats.wins += 1;
    } else if (result === 'loss') {
      user.stats.losses += 1;
    } else if (result === 'tie') {
      user.stats.ties += 1;
    }

    // Calculate new win rate
    user.calculateWinRate();
    await user.save();

    res.json({ 
      message: 'Stats updated successfully', 
      stats: user.stats 
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error updating stats', 
      error: error.message 
    });
  }
};

// Send friend request
exports.sendFriendRequest = async (req, res) => {
  try {
    const { friendId } = req.body;
    const user = await User.findById(req.user._id);
    const friend = await User.findById(friendId);

    if (!friend) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if friend request already exists
    const existingRequest = friend.friendRequests.find(
      request => request.from.toString() === user._id.toString()
    );

    if (existingRequest) {
      return res.status(400).json({ message: 'Friend request already sent' });
    }

    // Add friend request
    friend.friendRequests.push({
      from: user._id,
      status: 'pending'
    });

    await friend.save();
    res.json({ message: 'Friend request sent successfully' });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error sending friend request', 
      error: error.message 
    });
  }
};

// Handle friend request
exports.handleFriendRequest = async (req, res) => {
  try {
    const { requestId, action } = req.body; // action: 'accept' or 'reject'
    const user = await User.findById(req.user._id);

    const request = user.friendRequests.id(requestId);
    if (!request) {
      return res.status(404).json({ message: 'Friend request not found' });
    }

    if (action === 'accept') {
      // Add to friends list for both users
      user.friends.push({
        user: request.from,
        status: 'accepted'
      });

      const friend = await User.findById(request.from);
      friend.friends.push({
        user: user._id,
        status: 'accepted'
      });

      await friend.save();
    }

    // Remove the request
    request.remove();
    await user.save();

    res.json({ 
      message: `Friend request ${action}ed successfully` 
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error handling friend request', 
      error: error.message 
    });
  }
};

// Get friend list
exports.getFriends = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('friends.user', 'username isOnline lastActive stats');

    res.json(user.friends);
  } catch (error) {
    res.status(500).json({ 
      message: 'Error fetching friends list', 
      error: error.message 
    });
  }
};

// Get leaderboard
exports.getLeaderboard = async (req, res) => {
  try {
    const leaderboard = await User.find()
      .select('username stats')
      .sort({ 'stats.winRate': -1, 'stats.matchesPlayed': -1 })
      .limit(100);

    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ 
      message: 'Error fetching leaderboard', 
      error: error.message 
    });
  }
};