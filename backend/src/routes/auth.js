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
    const {
      name,
      email,
      password,
      role,
      mobileNumber,
      registrationId,
      helplineNumber,
      categories,
      addressDetails
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if a user or NGO with this email already exists using the new model factory
    const existingUser = await User.findOne({ email });
    const existingNgo = await NGO.findOne({ email });

    if (existingUser || existingNgo) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);

    if (role === 'ngo') {
      // Create an NGO using the new model factory
      const categoryList = Array.isArray(categories) ? categories.filter(Boolean) : [];
      const address = addressDetails
        ? [addressDetails.houseNumber, addressDetails.landmark, addressDetails.district, addressDetails.state, addressDetails.pincode]
            .filter(Boolean)
            .join(', ')
        : undefined;

      const ngo = await NGO.create({
        name,
        email,
        password: hashed,
        role: 'ngo',
        registrationId,
        helplineNumber,
        categories: categoryList,
        category: categoryList[0] || undefined,
        address,
        addressDetails
      });
      return res.status(201).json({ message: 'NGO registered', ngoId: ngo.id });
    } else {
      // Create a user using the new model factory
      const user = await User.create({
        name,
        email,
        password: hashed,
        role: role || 'user',
        mobileNumber
      });
      return res.status(201).json({ message: 'User registered', userId: user.id });
    }
  } catch (err) {
    console.error('Registration Error:', err);
    // The custom model factory maps DB errors, so we can check for the emulated code
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    res.status(500).json({ message: 'Server error during registration' });
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
    if (role === 'ngo' && account.isActive === false) {
      return res.status(403).json({ message: 'NGO account is disabled. Please contact support.' });
    }
    const valid = await bcrypt.compare(password, account.password);
    if (!valid) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: account.id, role: account.role || role, email: account.email }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
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
    const { name, email, interests, skills, mobileNumber } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, email, interests, skills, mobileNumber },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
