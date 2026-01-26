const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const NGO = require('../models/NGO');
const auth = require('../middleware/auth');

// Register (users and NGOs)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Missing fields' });
    
    const hashed = await bcrypt.hash(password, 10);
    
    if (role === 'ngo') {
      try {
        const ngo = await NGO.create({ name, email, password: hashed, role: 'ngo' });
        return res.json({ message: 'NGO registered', ngoId: ngo._id });
      } catch (err) {
        if (err.code === 11000) {
          return res.status(400).json({ message: 'Email already registered' });
        }
        throw err;
      }
    }
    
    try {
      const user = await User.create({ name, email, password: hashed, role: role || 'user' });
      return res.json({ message: 'User registered', userId: user._id });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({ message: 'Email already registered' });
      }
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    let account = await User.findOne({ email });
    let role = 'user';
    if (!account) {
      account = await NGO.findOne({ email });
      role = 'ngo';
    }
    if (!account) return res.status(400).json({ message: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, account.password);
    if (!valid) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: account._id, role: account.role || role, email: account.email }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/me', auth('user'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/me', auth('user'), async (req, res) => {
  try {
    const { name, email, interests, skills } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, email, interests, skills },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
