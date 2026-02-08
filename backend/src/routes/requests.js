const express = require('express');
const router = express.Router();
const HelpRequest = require('../models/HelpRequest');
const NGO = require('../models/NGO');
const User = require('../models/User');
const auth = require('../middleware/auth');

// User creates a request
router.post('/', auth(['user']), async (req, res) => {
  try {
    const { ngoId, name, age, location, helpType, description } = req.body;
    if (!ngoId || !helpType) {
      return res.status(400).json({ message: 'NGO and help type are required' });
    }
    const ngo = await NGO.findById(ngoId);
    if (!ngo || !ngo.verified || ngo.isActive === false) {
      return res.status(404).json({ message: 'NGO not available' });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.mobileNumber) {
      return res.status(400).json({ message: 'Please add a mobile number to your profile first.' });
    }

    const request = await HelpRequest.create({
      user: user.id,
      ngo: ngo.id,
      name: name || user.name,
      age: age ? Number(age) : undefined,
      location,
      helpType,
      description,
      mobileNumber: user.mobileNumber,
      status: 'Pending'
    });
    const populated = await request.populate('ngo', 'name helplineNumber location category categories');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// User views their requests
router.get('/my', auth(['user']), async (req, res) => {
  try {
    const requests = await HelpRequest.find({ user: req.user.id })
      .populate('ngo', 'name helplineNumber location category categories')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// NGO views incoming requests
router.get('/ngo', auth(['ngo']), async (req, res) => {
  try {
    const requests = await HelpRequest.find({ ngo: req.user.id })
      .populate('user', 'name email mobileNumber')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// NGO updates request status
router.put('/:id/status', auth(['ngo']), async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['Pending', 'Approved', 'In Progress', 'Completed', 'Rejected'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const request = await HelpRequest.findOne({ id: req.params.id, ngo: req.user.id });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    request.status = status;
    await request.save();
    res.json(request);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
