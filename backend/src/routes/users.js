const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// List all users (admin only, or for messaging contact list)
router.get('/', auth(['admin', 'user', 'ngo']), async (req, res) => {
  try {
    const users = await User.find({}, 'name email role');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
