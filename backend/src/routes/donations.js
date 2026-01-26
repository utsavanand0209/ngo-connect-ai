
const express = require('express');
const router = express.Router();
const Donation = require('../models/Donation');
const Campaign = require('../models/Campaign');
const auth = require('../middleware/auth');

// Get all donations for the logged-in user
router.get('/my', auth(['user', 'ngo', 'admin']), async (req, res) => {
  try {
    const donations = await Donation.find({ user: req.user.id });
    res.json(donations);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Dummy donation
router.post('/campaign/:id', auth(['user']), async (req, res) => {
  try {
    const { amount } = req.body;
    const camp = await Campaign.findById(req.params.id);
    if (!camp) return res.status(404).json({ message: 'Campaign not found' });
    const donation = await Donation.create({ user: req.user.id, ngo: camp.ngo, campaign: camp._id, amount });
    camp.currentAmount = (camp.currentAmount || 0) + (amount || 0);
    await camp.save();
    res.json({ message: 'Donation recorded', donation });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
