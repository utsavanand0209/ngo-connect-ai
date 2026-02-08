const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const NGO = require('../models/NGO');
const Certificate = require('../models/Certificate');
const Message = require('../models/Message');
const FlagRequest = require('../models/FlagRequest');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const AILog = require('../models/AILog');
const { query } = require('../db/postgres');
const { normalizeIdValue } = require('../db/utils');
const { generateCertificateNumber } = require('../utils/certificateTemplates');

const buildThreadKey = (userId, ngoId) => `user:${String(userId)}|ngo:${String(ngoId)}`;
const nowIso = () => new Date().toISOString();

const normalizeDecision = (value) => String(value || '').trim().toLowerCase();

const normalizeCampaignVolunteerApproval = (registration = {}, { reset = false } = {}) => {
  const existing = registration && typeof registration === 'object' ? { ...registration } : {};
  const statusRaw = String(existing.certificateApprovalStatus || '').trim().toLowerCase();
  const status = statusRaw || 'pending';

  if (reset) {
    return {
      certificateApprovalStatus: 'pending',
      certificateApprovalRequestedAt: nowIso(),
      certificateApprovalReviewedAt: null,
      certificateApprovalNote: '',
      certificateApprovedBy: null,
      certificate: null
    };
  }

  return {
    certificateApprovalStatus: status,
    certificateApprovalRequestedAt: existing.certificateApprovalRequestedAt || existing.updatedAt || existing.createdAt || nowIso(),
    certificateApprovalReviewedAt: existing.certificateApprovalReviewedAt || null,
    certificateApprovalNote: existing.certificateApprovalNote || '',
    certificateApprovedBy: existing.certificateApprovedBy || null,
    certificate: existing.certificate || null
  };
};

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

const parseTimestamp = (value) => {
  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? 0 : parsed;
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

// Logged-in user: campaign volunteer registrations (sanitized, per-user)
router.get('/my/volunteer-registrations', auth(['user']), async (req, res) => {
  try {
    const userId = String(req.user.id || '');
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const campaigns = await Campaign.find({ volunteers: userId }).populate('ngo', 'name logo verified isActive');
    const campaignDocs = (campaigns || []).map((campaign) =>
      (campaign && typeof campaign.toObject === 'function' ? campaign.toObject() : campaign)
    );

    const rows = campaignDocs.map((campaign) => {
      const volunteers = Array.isArray(campaign?.volunteers) ? campaign.volunteers : [];
      const joined = volunteers.some((entry) => String(normalizeIdValue(entry)) === userId);
      const registrations = Array.isArray(campaign?.volunteerRegistrations) ? campaign.volunteerRegistrations : [];
      const rawRegistration = registrations.find((entry) => String(normalizeIdValue(entry?.user)) === userId) || null;
      const registration = rawRegistration
        ? {
          fullName: rawRegistration.fullName,
          email: rawRegistration.email,
          phone: rawRegistration.phone,
          preferredActivities: rawRegistration.preferredActivities || [],
          availability: rawRegistration.availability || '',
          motivation: rawRegistration.motivation || '',
          activityHours: Number(rawRegistration.activityHours || 0),
          completedAt: rawRegistration.completedAt || null,
          createdAt: rawRegistration.createdAt || null,
          updatedAt: rawRegistration.updatedAt || null,
          ...normalizeCampaignVolunteerApproval(rawRegistration),
          certificate: rawRegistration.certificate || null
        }
        : null;

      return {
        campaign: {
          id: campaign.id,
          title: campaign.title,
          location: campaign.location,
          area: campaign.area,
          image: campaign.image,
          ngo: campaign.ngo
            ? {
              id: campaign.ngo.id,
              name: campaign.ngo.name,
              logo: campaign.ngo.logo,
              verified: campaign.ngo.verified
            }
            : null
        },
        joined,
        registration
      };
    });

    rows.sort((left, right) => {
      const leftTime = parseTimestamp(left.registration?.updatedAt || left.registration?.createdAt);
      const rightTime = parseTimestamp(right.registration?.updatedAt || right.registration?.createdAt);
      return rightTime - leftTime;
    });

    res.json(rows);
  } catch (err) {
    console.error(err);
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

// NGO view volunteer registrations across their campaigns (campaign volunteer feature)
router.get('/ngo/volunteers', auth(['ngo']), async (req, res) => {
  try {
    const campaigns = await Campaign.find({ ngo: req.user.id }).sort({ createdAt: -1 });
    const campaignDocs = campaigns.map((campaign) =>
      (campaign && typeof campaign.toObject === 'function' ? campaign.toObject() : campaign)
    );

    const userIds = new Set();
    const rows = [];

    for (const campaign of campaignDocs) {
      const campaignInfo = {
        id: campaign.id,
        title: campaign.title,
        location: campaign.location,
        area: campaign.area
      };

      const volunteerIds = Array.isArray(campaign.volunteers) ? campaign.volunteers : [];
      const registrations = Array.isArray(campaign.volunteerRegistrations) ? campaign.volunteerRegistrations : [];

      const byUserId = new Map();

      for (const registration of registrations) {
        const userId = normalizeIdValue(registration?.user);
        if (!userId) continue;
        userIds.add(userId);
        byUserId.set(userId, { ...(registration || {}), user: userId });
      }

      for (const entry of volunteerIds) {
        const userId = normalizeIdValue(entry);
        if (!userId) continue;
        userIds.add(userId);
        if (!byUserId.has(userId)) byUserId.set(userId, null);
      }

      for (const [userId, registration] of byUserId.entries()) {
        rows.push({
          campaign: campaignInfo,
          userId,
          registration
        });
      }
    }

    const ids = Array.from(userIds);
    const userMap = new Map();
    if (ids.length > 0) {
      const { rows: userRows } = await query(
        `
        SELECT external_id, source_doc
        FROM users_rel
        WHERE external_id = ANY($1::text[])
        `,
        [ids]
      );

      for (const row of userRows) {
        const doc = row?.source_doc && typeof row.source_doc === 'object' ? { ...row.source_doc } : {};
        if (!doc.id) doc.id = row.external_id;
        userMap.set(String(row.external_id), doc);
      }
    }

    const volunteers = rows
      .map((row) => {
        const userDoc = userMap.get(String(row.userId));
        const registration = row.registration || null;
        const fallbackName = registration?.fullName || userDoc?.name || 'Volunteer';
        const fallbackEmail = registration?.email || userDoc?.email || '';
        const fallbackPhone = registration?.phone || userDoc?.mobileNumber || '';

      return {
        campaign: row.campaign,
        user: {
          id: userDoc?.id || String(row.userId),
          name: fallbackName,
          email: fallbackEmail,
          mobileNumber: fallbackPhone
        },
        registration: registration
          ? {
            fullName: registration.fullName,
            email: registration.email,
            phone: registration.phone,
            preferredActivities: registration.preferredActivities || [],
            availability: registration.availability || '',
            motivation: registration.motivation || '',
            activityHours: Number(registration.activityHours || 0),
            completedAt: registration.completedAt || null,
            createdAt: registration.createdAt || null,
            updatedAt: registration.updatedAt || null,
            ...normalizeCampaignVolunteerApproval(registration),
            certificate: registration.certificate || null
          }
          : null
      };
    })
      .sort((left, right) => {
        const leftTime = parseTimestamp(left.registration?.updatedAt || left.registration?.createdAt);
        const rightTime = parseTimestamp(right.registration?.updatedAt || right.registration?.createdAt);
        return rightTime - leftTime;
      });

    const pendingCertificateCount = volunteers.filter((entry) => (
      String(entry.registration?.certificateApprovalStatus || '').trim().toLowerCase() === 'pending'
    )).length;

    res.json({
      summary: {
        campaignsCount: campaignDocs.length,
        totalVolunteers: userIds.size,
        totalRegistrations: volunteers.filter((entry) => Boolean(entry.registration)).length,
        pendingCertificateCount
      },
      volunteers
    });
  } catch (err) {
    console.error(err);
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

    const volunteers = Array.isArray(camp.volunteers) ? camp.volunteers : [];
    const joined = volunteers.some((id) => String(normalizeIdValue(id)) === String(req.user.id));
    const rawRegistration = (camp.volunteerRegistrations || []).find(
      (entry) => String(normalizeIdValue(entry?.user)) === String(req.user.id)
    );

    const registration = rawRegistration
      ? {
        ...(rawRegistration && typeof rawRegistration.toObject === 'function' ? rawRegistration.toObject() : rawRegistration),
        ...normalizeCampaignVolunteerApproval(rawRegistration),
        certificate: rawRegistration.certificate || null
      }
      : null;

    res.json({
      joined,
      registration
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// NGO decision: approve/reject campaign volunteer registration (and issue certificate on approval)
router.post('/:id/volunteer/decision', auth(['ngo']), async (req, res) => {
  try {
    const campaignId = req.params.id;
    const userId = String(req.body?.userId || '').trim();
    const decision = normalizeDecision(req.body?.decision);
    const note = String(req.body?.note || '').trim();
    const hoursRaw = req.body?.activityHours;

    if (!userId) return res.status(400).json({ message: 'userId is required.' });
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ message: 'Decision must be either approve or reject.' });
    }

    let normalizedHours = null;
    if (hoursRaw !== undefined && hoursRaw !== null && String(hoursRaw).trim() !== '') {
      const parsed = Number(hoursRaw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return res.status(400).json({ message: 'activityHours must be a non-negative number.' });
      }
      normalizedHours = Math.round(parsed * 10) / 10;
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });

    const campaignNgoId = normalizeIdValue(campaign.ngo);
    if (!campaignNgoId || String(campaignNgoId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (!Array.isArray(campaign.volunteerRegistrations)) campaign.volunteerRegistrations = [];
    const registrationIndex = campaign.volunteerRegistrations.findIndex(
      (entry) => String(normalizeIdValue(entry?.user)) === userId
    );
    if (registrationIndex < 0) {
      return res.status(404).json({ message: 'Volunteer registration not found' });
    }

    const existingRegistration = campaign.volunteerRegistrations[registrationIndex];
    const existingObject =
      existingRegistration && typeof existingRegistration.toObject === 'function'
        ? existingRegistration.toObject()
        : existingRegistration;

    const base = {
      ...(existingObject || {}),
      user: userId
    };

    const previousStatus = String(base.certificateApprovalStatus || '').trim().toLowerCase();
    const wasApproved = previousStatus === 'approved';
    const resolvedNote = note || String(base.certificateApprovalNote || '').trim();
    const reviewedAt = base.certificateApprovalReviewedAt || nowIso();

    if (decision === 'reject') {
      if (wasApproved) {
        return res.status(400).json({ message: 'Certificate already issued and cannot be rejected.' });
      }
      const updated = {
        ...base,
        certificateApprovalStatus: 'rejected',
        certificateApprovalReviewedAt: reviewedAt,
        certificateApprovalNote: resolvedNote,
        certificateApprovedBy: req.user.id,
        certificate: null,
        updatedAt: new Date()
      };
      campaign.volunteerRegistrations[registrationIndex] = updated;
      await campaign.save();

      await Message.create({
        fromNGO: req.user.id,
        toUser: userId,
        body: `Your volunteer registration for \"${campaign.title || 'this campaign'}\" was rejected.${note ? ` Note: ${note}` : ''}`,
        read: false,
        threadKey: buildThreadKey(userId, req.user.id),
        meta: { event: 'campaign-volunteer-rejected', campaignId: campaign.id }
      });

      return res.json({ message: 'Volunteer registration rejected.', registration: updated });
    }

    const currentCertificateId = normalizeIdValue(base.certificate);
    let certificate = null;
    if (currentCertificateId) {
      certificate = await Certificate.findById(currentCertificateId);
    }

    if (!certificate) {
      const [userDoc, ngoDoc] = await Promise.all([
        User.findById(userId).select('name email'),
        NGO.findById(req.user.id).select('name')
      ]);
      const preferred = Array.isArray(base.preferredActivities) ? base.preferredActivities.filter(Boolean) : [];
      const assignedTask = preferred[0] || 'Campaign Volunteer Service';
      const completionDate = base.completedAt || nowIso();

      certificate = await Certificate.create({
        user: userId,
        ngo: req.user.id,
        campaign: campaign.id,
        type: 'volunteer',
        title: 'Volunteer Participation Certificate',
        certificateNumber: generateCertificateNumber('volunteer'),
        status: 'active',
        issuedAt: new Date(),
        metadata: {
          recipientName: base.fullName || userDoc?.name || 'Volunteer',
          recipientEmail: base.email || userDoc?.email || '',
          ngoName: ngoDoc?.name || 'Partner NGO',
          campaignTitle: campaign.title || 'Community Initiative',
          assignedTask,
          completionDate,
          activityHours: normalizedHours !== null ? normalizedHours : Number(base.activityHours || 0)
        }
      });
    } else if (certificate && normalizedHours !== null) {
      certificate.metadata = {
        ...(certificate.metadata || {}),
        activityHours: normalizedHours,
        completionDate: base.completedAt || certificate.metadata?.completionDate || nowIso()
      };
      await certificate.save();
    }

    const updated = {
      ...base,
      certificateApprovalStatus: 'approved',
      certificateApprovalReviewedAt: reviewedAt,
      certificateApprovalNote: resolvedNote,
      certificateApprovedBy: req.user.id,
      certificate: certificate?.id || base.certificate || null,
      ...(normalizedHours !== null ? { activityHours: normalizedHours } : {}),
      completedAt: base.completedAt || nowIso(),
      updatedAt: new Date()
    };
    campaign.volunteerRegistrations[registrationIndex] = updated;
    await campaign.save();

    if (!wasApproved) {
      await Message.create({
        fromNGO: req.user.id,
        toUser: userId,
        body: `Your volunteer registration for \"${campaign.title || 'this campaign'}\" was approved. Your certificate is now available in your dashboard.`,
        read: false,
        threadKey: buildThreadKey(userId, req.user.id),
        meta: { event: 'campaign-volunteer-approved', campaignId: campaign.id, certificateId: certificate?.id }
      });
    }

    res.json({
      message: wasApproved ? 'Campaign volunteer updated successfully.' : 'Volunteer registration approved and certificate issued.',
      registration: updated,
      certificate
    });
  } catch (err) {
    console.error(err);
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

    const now = new Date();
    const shouldResetApproval =
      existingIndex >= 0 &&
      String(camp.volunteerRegistrations?.[existingIndex]?.certificateApprovalStatus || '').trim().toLowerCase() === 'rejected';

    if (existingIndex >= 0) {
      const existingRegistration = camp.volunteerRegistrations[existingIndex];
      const existingObject =
        existingRegistration && typeof existingRegistration.toObject === 'function'
          ? existingRegistration.toObject()
          : existingRegistration;
      camp.volunteerRegistrations[existingIndex] = {
        ...existingObject,
        ...volunteerData,
        ...normalizeCampaignVolunteerApproval(existingObject, { reset: shouldResetApproval }),
        updatedAt: now
      };
    } else {
      camp.volunteerRegistrations.push({
        user: req.user.id,
        ...volunteerData,
        createdAt: now,
        updatedAt: now,
        ...normalizeCampaignVolunteerApproval({}, { reset: true })
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

    const ngoId = normalizeIdValue(camp.ngo);
    const notifyNgo = Boolean(ngoId) && (existingIndex < 0 || shouldResetApproval);
    if (notifyNgo) {
      try {
        await Message.create({
          fromUser: req.user.id,
          toNGO: ngoId,
          body: `New campaign volunteer registration for \"${camp.title || 'a campaign'}\".\n\nName: ${volunteerData.fullName}\nEmail: ${volunteerData.email}\nPhone: ${volunteerData.phone}\n\nReview this in NGO Dashboard -> Campaign Volunteer Registrations.`,
          read: false,
          threadKey: buildThreadKey(req.user.id, ngoId),
          meta: { event: 'campaign-volunteer-submitted', campaignId: camp.id }
        });
      } catch (messageErr) {
        // Non-blocking notification
      }
    }

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
      requestedBy: req.user.id
    });
    if (existing) {
      const existingStatus = String(existing.status || 'pending').trim().toLowerCase();
      if (existingStatus === 'pending') {
        return res.status(400).json({ message: 'You already have a pending request for this campaign' });
      }
    }

    const request = await FlagRequest.create({
      targetType: 'campaign',
      targetId: campaign.id,
      targetName: campaign.title,
      reason: reason || 'Reported by user',
      requestedBy: req.user.id,
      status: 'pending'
    });

    try {
      await Notification.create({
        title: 'New campaign flag request',
        message: `A user requested admin review for campaign "${campaign.title || campaign.id}".${reason ? `\nReason: ${reason}` : ''}`,
        audience: 'admins',
        createdBy: req.user.id,
        meta: {
          event: 'flag-request-submitted',
          targetType: 'campaign',
          targetId: campaign.id,
          flagRequestId: request.id,
          requestedByEmail: req.user.email || null
        }
      });
    } catch (notifyErr) {
      // Non-blocking notification
    }

    res.json({ message: 'Flag request submitted', request });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
