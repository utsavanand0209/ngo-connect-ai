
const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const auth = require('../middleware/auth');
const AILog = require('../models/AILog');

// Get all campaigns where the user is a volunteer
router.get('/my/volunteered', auth(['user', 'ngo', 'admin']), async (req, res) => {
  try {
    const campaigns = await Campaign.find({ volunteers: req.user.id });
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create campaign (ngo only) - auto-classify category via AI route
router.post('/', auth(['ngo']), async (req, res) => {
  try {
    const data = req.body;
    data.ngo = req.user.id;
    const campaign = await Campaign.create(data);
    // log AI request for classification (handled separately)
    await AILog.create({ type: 'campaign-create', payload: data });
    res.json(campaign);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// List campaigns
router.get('/', async (req, res) => {
  try {
    const { category, location } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (location) filter.location = new RegExp(location, 'i');
    const camps = await Campaign.find(filter).populate('ngo', 'name location verified');
    res.json(camps);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get campaign
router.get('/:id', async (req, res) => {
  try {
    const camp = await Campaign.findById(req.params.id).populate('ngo');
    if (!camp) return res.status(404).json({ message: 'Not found' });
    res.json(camp);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Volunteer join (user)
router.post('/:id/volunteer', auth(['user']), async (req, res) => {
  try {
    const camp = await Campaign.findById(req.params.id);
    if (!camp) return res.status(404).json({ message: 'Not found' });
    if (!camp.volunteers.includes(req.user.id)) {
      camp.volunteers.push(req.user.id);
      await camp.save();
    }
    res.json({ message: 'Joined as volunteer' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
