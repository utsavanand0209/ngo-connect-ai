const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const FlagRequest = require('../models/FlagRequest');
const auth = require('../middleware/auth');
const AILog = require('../models/AILog');

const cleanArray = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeVolunteerPayload = (payload = {}, user = null) => {
  const fullName = String(payload.fullName || user?.name || '').trim();
  const email = String(payload.email || user?.email || '').trim().toLowerCase();
  const phone = String(payload.phone || user?.mobileNumber || '').trim();
  const preferredActivities = cleanArray(payload.preferredActivities);
  const availability = String(payload.availability || '').trim();
  const motivation = String(payload.motivation || '').trim();

  if (fullName.length < 2) {
    const error = new Error('Please provide your full name.');
    error.status = 400;
    throw error;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error('Please provide a valid email address.');
    error.status = 400;
    throw error;
  }
  if (!/^\+?[0-9\s()-]{8,15}$/.test(phone.replace(/\s+/g, ''))) {
    const error = new Error('Please provide a valid phone number.');
    error.status = 400;
    throw error;
  }

  return {
    fullName,
    email,
    phone,
    preferredActivities,
    availability,
    motivation
  };
};

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
    const camps = await Campaign.find(filter).populate('ngo', 'name location verified isActive');
    const visible = camps.filter(c => c.ngo && c.ngo.verified !== false && c.ngo.isActive !== false);
    res.json(visible);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get campaign
router.get('/:id', async (req, res) => {
  try {
    const camp = await Campaign.findById(req.params.id).populate('ngo');
    if (!camp) return res.status(404).json({ message: 'Not found' });
    if (camp.ngo && (camp.ngo.verified === false || camp.ngo.isActive === false)) {
      return res.status(403).json({ message: 'Campaign not available' });
    }
    const campData = camp.toObject();
    delete campData.volunteerRegistrations;
    res.json(campData);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Logged-in user volunteer registration for campaign
router.get('/:id/volunteer/me', auth(['user']), async (req, res) => {
  try {
    const camp = await Campaign.findById(req.params.id).select('volunteers volunteerRegistrations');
    if (!camp) return res.status(404).json({ message: 'Not found' });

    const joined = camp.volunteers.some((id) => String(id) === String(req.user.id));
    const registration = (camp.volunteerRegistrations || []).find(
      (entry) => String(entry.user) === String(req.user.id)
    );

    res.json({
      joined,
      registration: registration || null
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Volunteer join (user)
router.post('/:id/volunteer', auth(['user']), async (req, res) => {
  try {
    const camp = await Campaign.findById(req.params.id);
    if (!camp) return res.status(404).json({ message: 'Not found' });

    const user = await User.findById(req.user.id).select('name email mobileNumber');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Campaign documents created via the API may not include these arrays yet.
    // Ensure they exist before we use .push/.some against them.
    if (!Array.isArray(camp.volunteerRegistrations)) camp.volunteerRegistrations = [];
    if (!Array.isArray(camp.volunteers)) camp.volunteers = [];

    const volunteerData = normalizeVolunteerPayload(req.body || {}, user);
    const existingIndex = (camp.volunteerRegistrations || []).findIndex(
      (entry) => String(entry.user) === String(req.user.id)
    );

    if (existingIndex >= 0) {
      const existingRegistration = camp.volunteerRegistrations[existingIndex];
      const existingObject =
        existingRegistration && typeof existingRegistration.toObject === 'function'
          ? existingRegistration.toObject()
          : existingRegistration;
      camp.volunteerRegistrations[existingIndex] = {
        ...existingObject,
        ...volunteerData,
        updatedAt: new Date()
      };
    } else {
      camp.volunteerRegistrations.push({
        user: req.user.id,
        ...volunteerData,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    const alreadyJoined = camp.volunteers.some((id) => String(id) === String(req.user.id));
    if (!alreadyJoined) {
      camp.volunteers.push(req.user.id);
    }

    const currentEngaged = Number(camp.beneficiaryStats?.volunteersEngaged || 0);
    const joinedCount = camp.volunteers.length;
    camp.beneficiaryStats = {
      ...(camp.beneficiaryStats || {}),
      volunteersEngaged: Math.max(currentEngaged, joinedCount)
    };

    await camp.save();

    const registration = camp.volunteerRegistrations.find((entry) => String(entry.user) === String(req.user.id));
    res.json({
      message: 'Volunteer registration submitted successfully.',
      registration
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

// Flag campaign (user/ngo/admin)
router.post('/:id/flag', auth(['admin']), async (req, res) => {
  try {
    const { reason } = req.body;
    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      { flagged: true, flagReason: reason || 'Flagged by user' },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
    res.json({ message: 'Campaign flagged', campaign });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// User requests admin to flag campaign
router.post('/:id/flag-request', auth(['user']), async (req, res) => {
  try {
    const { reason } = req.body;
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
    if (campaign.flagged) return res.status(400).json({ message: 'Campaign already flagged' });

    const existing = await FlagRequest.findOne({
      targetType: 'campaign',
      targetId: campaign.id,
      requestedBy: req.user.id,
      status: 'pending'
    });
    if (existing) {
      return res.status(400).json({ message: 'You already have a pending request for this campaign' });
    }

    const request = await FlagRequest.create({
      targetType: 'campaign',
      targetId: campaign.id,
      targetName: campaign.title,
      reason: reason || 'Reported by user',
      requestedBy: req.user.id
    });
    res.json({ message: 'Flag request submitted', request });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
