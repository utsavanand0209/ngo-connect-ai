const express = require('express');
const router = express.Router();
const NGO = require('../models/NGO');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Donation = require('../models/Donation');
const FlagRequest = require('../models/FlagRequest');
const HelpRequest = require('../models/HelpRequest');
const auth = require('../middleware/auth');

// Only admin
router.get('/ngo-registrations', auth(['admin']), async (req, res) => {
  const ngos = await NGO.find({ verified: false });
  res.json(ngos);
});

router.post('/verify-ngo/:id', auth(['admin']), async (req, res) => {
  const ngo = await NGO.findByIdAndUpdate(req.params.id, { verified: true }, { new: true });
  res.json({ message: 'NGO verified', ngo });
});

router.post('/reject-ngo/:id', auth(['admin']), async (req, res) => {
  await NGO.findByIdAndDelete(req.params.id);
  res.json({ message: 'NGO rejected and deleted' });
});

router.delete('/user/:id', auth(['admin']), async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: 'User deleted' });
});

// List all NGOs (admin)
router.get('/ngos', auth(['admin']), async (req, res) => {
  try {
    const ngos = await NGO.find().sort({ createdAt: -1 });
    res.json(ngos);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Enable/disable NGO
router.put('/ngos/:id/active', auth(['admin']), async (req, res) => {
  try {
    const { isActive } = req.body;
    const ngo = await NGO.findByIdAndUpdate(
      req.params.id,
      { isActive: typeof isActive === 'boolean' ? isActive : true },
      { new: true }
    );
    if (!ngo) return res.status(404).json({ message: 'NGO not found' });
    res.json(ngo);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Flagged content (admin)
router.get('/flagged-ngos', auth(['admin']), async (req, res) => {
  try {
    const ngos = await NGO.find({ flagged: true });
    res.json(ngos);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/flagged-campaigns', auth(['admin']), async (req, res) => {
  try {
    const campaigns = await Campaign.find({ flagged: true });
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/resolve-flag/:type/:id', auth(['admin']), async (req, res) => {
  try {
    const { type, id } = req.params;
    if (type === 'ngo') {
      const ngo = await NGO.findByIdAndUpdate(
        id,
        { flagged: false, flagReason: null },
        { new: true }
      );
      if (!ngo) return res.status(404).json({ message: 'NGO not found' });
      return res.json({ message: 'Flag resolved', ngo });
    }
    if (type === 'campaign') {
      const campaign = await Campaign.findByIdAndUpdate(
        id,
        { flagged: false, flagReason: null },
        { new: true }
      );
      if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
      return res.json({ message: 'Flag resolved', campaign });
    }
    return res.status(400).json({ message: 'Invalid flag type' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Flag requests (admin)
router.get('/flag-requests', auth(['admin']), async (req, res) => {
  try {
    const { status, type } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.targetType = type;
    const requests = await FlagRequest.find(filter).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/flag-requests/:id/approve', auth(['admin']), async (req, res) => {
  try {
    const request = await FlagRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Flag request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request already resolved' });
    }

    if (request.targetType === 'ngo') {
      await NGO.findByIdAndUpdate(request.targetId, {
        flagged: true,
        flagReason: request.reason || 'Flagged by admin'
      });
    } else if (request.targetType === 'campaign') {
      await Campaign.findByIdAndUpdate(request.targetId, {
        flagged: true,
        flagReason: request.reason || 'Flagged by admin'
      });
    }

    request.status = 'approved';
    request.resolvedBy = req.user.id;
    request.resolvedAt = new Date();
    await request.save();

    res.json({ message: 'Flag request approved', request });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/flag-requests/:id/reject', auth(['admin']), async (req, res) => {
  try {
    const request = await FlagRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Flag request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request already resolved' });
    }

    request.status = 'rejected';
    request.resolvedBy = req.user.id;
    request.resolvedAt = new Date();
    await request.save();

    res.json({ message: 'Flag request rejected', request });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Notifications (admin)
router.get('/notifications', auth(['admin']), async (req, res) => {
  try {
    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/notifications', auth(['admin']), async (req, res) => {
  try {
    const { title, message, audience } = req.body;
    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }
    const notification = await Notification.create({
      title,
      message,
      audience: audience || 'all',
      createdBy: req.user.id
    });
    res.json(notification);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Help requests (admin)
router.get('/requests', auth(['admin']), async (req, res) => {
  try {
    const requests = await HelpRequest.find()
      .populate('ngo', 'name helplineNumber location')
      .populate('user', 'name email mobileNumber')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Analytics (admin)
router.get('/analytics', auth(['admin']), async (req, res) => {
  try {
    const toYearMonth = (value) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    };

    const [
      usersCount,
      verifiedNgosCount,
      pendingNgosCount,
      campaignsCount,
      flaggedNgosCount,
      flaggedCampaignsCount,
      users,
      donations,
      campaigns
    ] = await Promise.all([
      User.countDocuments({}),
      NGO.countDocuments({ verified: true }),
      NGO.countDocuments({ verified: false }),
      Campaign.countDocuments({}),
      NGO.countDocuments({ flagged: true }),
      Campaign.countDocuments({ flagged: true }),
      User.find({}),
      Donation.find({}),
      Campaign.find({})
    ]);

    const usersByMonthMap = new Map();
    const usersByRole = { admin: 0, ngo: 0, user: 0 };
    for (const user of users) {
      const monthKey = toYearMonth(user.createdAt);
      if (monthKey) {
        usersByMonthMap.set(monthKey, (usersByMonthMap.get(monthKey) || 0) + 1);
      }
      const role = typeof user.role === 'string' ? user.role : 'user';
      usersByRole[role] = (usersByRole[role] || 0) + 1;
    }

    const donationsByMonthMap = new Map();
    let donationsTotal = 0;
    for (const donation of donations) {
      const amount = Number(donation.amount) || 0;
      donationsTotal += amount;
      const monthKey = toYearMonth(donation.createdAt);
      if (!monthKey) continue;
      donationsByMonthMap.set(monthKey, Number(donationsByMonthMap.get(monthKey) || 0) + amount);
    }

    let volunteerTotal = 0;
    const volunteersByCampaign = campaigns
      .map((campaign) => {
        const count = Array.isArray(campaign.volunteers) ? campaign.volunteers.length : 0;
        volunteerTotal += count;
        return { name: campaign.title, count };
      })
      .sort((left, right) => right.count - left.count)
      .slice(0, 5);

    const usersByMonth = Array.from(usersByMonthMap.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([month, count]) => ({ month, count }));

    const donationsByMonth = Array.from(donationsByMonthMap.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([month, total]) => ({ month, total }));

    const flaggedCount = (flaggedNgosCount || 0) + (flaggedCampaignsCount || 0);

    res.json({
      totals: {
        users: usersCount,
        verifiedNgos: verifiedNgosCount,
        pendingNgos: pendingNgosCount,
        campaigns: campaignsCount,
        flagged: flaggedCount,
        donationsTotal,
        volunteerTotal
      },
      usersByMonth,
      usersByRole,
      donationsByMonth,
      volunteersByCampaign
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
