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
const { query } = require('../db/postgres');

const toDoc = (row, idField, docField) => {
  const doc = row?.[docField] && typeof row[docField] === 'object' ? { ...row[docField] } : {};
  if (!doc.id) doc.id = row?.[idField];
  return doc;
};

const normalizeDonationCertificateApprovalStatus = (donation) => {
  const raw = String(donation?.certificateApprovalStatus || '').trim().toLowerCase();
  if (raw) return raw;
  const certificateId =
    typeof donation?.certificate === 'string'
      ? donation.certificate
      : donation?.certificate && typeof donation.certificate === 'object'
          ? donation.certificate.id
          : '';
  if (certificateId) return 'approved';
  const status = String(donation?.status || '').trim().toLowerCase();
  if (status === 'completed') return 'pending';
  return 'not_requested';
};

const normalizeVolunteerCertificateApprovalStatus = (application) => {
  const raw = String(application?.certificateApprovalStatus || '').trim().toLowerCase();
  if (raw) return raw;
  const certificateId =
    typeof application?.certificate === 'string'
      ? application.certificate
      : application?.certificate && typeof application.certificate === 'object'
          ? application.certificate.id
          : '';
  if (certificateId) return 'approved';
  const status = String(application?.status || '').trim().toLowerCase();
  if (status === 'completed') return 'pending';
  return 'not_requested';
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
};

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

// Admin dashboard snapshot (Postgres-native): campaigns, donations, volunteer registrations
router.get('/dashboard', auth(['admin']), async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 5), 100);
    const days = Math.min(Math.max(Number(req.query.days) || 14, 7), 60);

    const [
      { rows: [statsRow = {}] },
      { rows: donationSeriesRows = [] },
      { rows: volunteerSeriesRows = [] },
      { rows: campaignRows = [] },
      { rows: donationRows = [] },
      { rows: volunteerRows = [] },
      { rows: campaignVolunteerRows = [] },
      { rows: pendingNgoRows = [] },
      { rows: flaggedNgoRows = [] },
      { rows: flaggedCampaignRows = [] }
    ] = await Promise.all([
      query(
        `
        SELECT
          (SELECT COUNT(*) FROM ngos_rel WHERE COALESCE(safe_bool(source_doc->>'verified'), false) = false) AS pending_ngos,
          (SELECT COUNT(*) FROM ngos_rel WHERE COALESCE(safe_bool(source_doc->>'verified'), false) = true) AS verified_ngos,
          (SELECT COUNT(*) FROM ngos_rel) AS ngos_total,
          (SELECT COUNT(*) FROM campaigns_rel) AS campaigns_total,
          (SELECT COUNT(*) FROM campaigns_rel WHERE COALESCE(safe_bool(source_doc->>'flagged'), false) = true) AS flagged_campaigns,
          (SELECT COUNT(*) FROM ngos_rel WHERE COALESCE(safe_bool(source_doc->>'flagged'), false) = true) AS flagged_ngos,
          (SELECT COUNT(*) FROM users_rel WHERE COALESCE(NULLIF(source_doc->>'role', ''), 'user') = 'user') AS users_total,
          (SELECT COUNT(*) FROM users_rel WHERE COALESCE(NULLIF(source_doc->>'role', ''), 'user') = 'admin') AS admins_total,
          (SELECT COUNT(*) FROM help_requests_rel) AS requests_total,
          (SELECT COUNT(*) FROM categories_rel) AS categories_total,
          (SELECT COUNT(*) FROM donations_rel WHERE COALESCE(NULLIF(source_doc->>'status', ''), 'pending') = 'completed') AS donations_completed_count,
          (SELECT COALESCE(SUM(COALESCE(safe_numeric(source_doc->>'amount'), 0)), 0) FROM donations_rel WHERE COALESCE(NULLIF(source_doc->>'status', ''), 'pending') = 'completed') AS donations_completed_total,
          (SELECT COUNT(*) FROM volunteer_applications_rel WHERE COALESCE(NULLIF(source_doc->>'status', ''), 'applied') <> 'withdrawn') AS volunteer_applications_count,
          (SELECT COUNT(*) FROM volunteer_applications_rel WHERE COALESCE(NULLIF(source_doc->>'status', ''), 'applied') = 'completed') AS volunteer_completed_count,
          (SELECT COALESCE(SUM(jsonb_array_length(COALESCE(source_doc->'volunteers', '[]'::jsonb))), 0) FROM campaigns_rel) AS campaign_volunteers_count,
          (SELECT COALESCE(SUM(jsonb_array_length(COALESCE(source_doc->'volunteerRegistrations', '[]'::jsonb))), 0) FROM campaigns_rel) AS campaign_volunteer_registrations_count
        `
      ),
      query(
        `
        WITH days AS (
          SELECT generate_series((CURRENT_DATE - ($1::int - 1))::date, CURRENT_DATE, '1 day')::date AS day
        )
        SELECT
          to_char(days.day, 'YYYY-MM-DD') AS day,
          COALESCE(
            SUM(COALESCE(safe_numeric(d.source_doc->>'amount'), 0)) FILTER (
              WHERE COALESCE(NULLIF(d.source_doc->>'status', ''), 'pending') = 'completed'
            ),
            0
          ) AS total_amount,
          COUNT(d.external_id) FILTER (
            WHERE COALESCE(NULLIF(d.source_doc->>'status', ''), 'pending') = 'completed'
          ) AS donations_count
        FROM days
        LEFT JOIN donations_rel d ON d.created_at::date = days.day
        GROUP BY days.day
        ORDER BY days.day
        `,
        [days]
      ),
      query(
        `
        WITH days AS (
          SELECT generate_series((CURRENT_DATE - ($1::int - 1))::date, CURRENT_DATE, '1 day')::date AS day
        )
        SELECT
          to_char(days.day, 'YYYY-MM-DD') AS day,
          COUNT(va.external_id) FILTER (
            WHERE COALESCE(NULLIF(va.source_doc->>'status', ''), 'applied') <> 'withdrawn'
          ) AS applications_count,
          COUNT(va.external_id) FILTER (
            WHERE COALESCE(NULLIF(va.source_doc->>'status', ''), 'applied') = 'completed'
          ) AS completed_count
        FROM days
        LEFT JOIN volunteer_applications_rel va ON va.created_at::date = days.day
        GROUP BY days.day
        ORDER BY days.day
        `,
        [days]
      ),
      query(
        `
        SELECT
          c.external_id AS campaign_id,
          c.source_doc AS campaign_doc,
          c.created_at AS campaign_created_at,
          ngo.external_id AS ngo_id,
          ngo.source_doc AS ngo_doc,
          COALESCE(safe_numeric(c.source_doc->>'goalAmount'), 0) AS goal_amount,
          COALESCE(safe_numeric(c.source_doc->>'currentAmount'), 0) AS current_amount,
          CASE
            WHEN COALESCE(safe_numeric(c.source_doc->>'goalAmount'), 0) > 0
              THEN LEAST(
                COALESCE(safe_numeric(c.source_doc->>'currentAmount'), 0) / COALESCE(safe_numeric(c.source_doc->>'goalAmount'), 0),
                1
              )
            ELSE 0
          END AS progress
        FROM campaigns_rel c
        LEFT JOIN ngos_rel ngo ON ngo.external_id = (
          CASE
            WHEN jsonb_typeof(c.source_doc->'ngo') = 'string' THEN NULLIF(c.source_doc->>'ngo', '')
            WHEN jsonb_typeof(c.source_doc->'ngo') = 'object' THEN NULLIF(c.source_doc#>>'{ngo,id}', '')
            ELSE NULL
          END
        )
        ORDER BY progress DESC, c.created_at DESC
        LIMIT $1
        `,
        [limit]
      ),
      query(
        `
        SELECT
          d.external_id AS donation_id,
          d.source_doc AS donation_doc,
          d.created_at AS donation_created_at,
          u.external_id AS user_id,
          u.source_doc AS user_doc,
          ngo.external_id AS ngo_id,
          ngo.source_doc AS ngo_doc,
          c.external_id AS campaign_id,
          c.source_doc AS campaign_doc
        FROM donations_rel d
        CROSS JOIN LATERAL (
          SELECT
            CASE
              WHEN jsonb_typeof(d.source_doc->'user') = 'string' THEN NULLIF(d.source_doc->>'user', '')
              WHEN jsonb_typeof(d.source_doc->'user') = 'object' THEN NULLIF(d.source_doc#>>'{user,id}', '')
              ELSE NULL
            END AS user_ref,
            CASE
              WHEN jsonb_typeof(d.source_doc->'ngo') = 'string' THEN NULLIF(d.source_doc->>'ngo', '')
              WHEN jsonb_typeof(d.source_doc->'ngo') = 'object' THEN NULLIF(d.source_doc#>>'{ngo,id}', '')
              ELSE NULL
            END AS ngo_ref,
            CASE
              WHEN jsonb_typeof(d.source_doc->'campaign') = 'string' THEN NULLIF(d.source_doc->>'campaign', '')
              WHEN jsonb_typeof(d.source_doc->'campaign') = 'object' THEN NULLIF(d.source_doc#>>'{campaign,id}', '')
              ELSE NULL
            END AS campaign_ref
        ) refs
        LEFT JOIN users_rel u ON u.external_id = refs.user_ref
        LEFT JOIN ngos_rel ngo ON ngo.external_id = refs.ngo_ref
        LEFT JOIN campaigns_rel c ON c.external_id = refs.campaign_ref
        ORDER BY d.created_at DESC
        LIMIT $1
        `,
        [limit]
      ),
      query(
        `
        SELECT
          va.external_id AS application_id,
          va.source_doc AS application_doc,
          va.created_at AS application_created_at,
          u.external_id AS user_id,
          u.source_doc AS user_doc,
          ngo.external_id AS ngo_id,
          ngo.source_doc AS ngo_doc,
          vo.external_id AS opportunity_id,
          vo.source_doc AS opportunity_doc
        FROM volunteer_applications_rel va
        CROSS JOIN LATERAL (
          SELECT
            CASE
              WHEN jsonb_typeof(va.source_doc->'user') = 'string' THEN NULLIF(va.source_doc->>'user', '')
              WHEN jsonb_typeof(va.source_doc->'user') = 'object' THEN NULLIF(va.source_doc#>>'{user,id}', '')
              ELSE NULL
            END AS user_ref,
            CASE
              WHEN jsonb_typeof(va.source_doc->'ngo') = 'string' THEN NULLIF(va.source_doc->>'ngo', '')
              WHEN jsonb_typeof(va.source_doc->'ngo') = 'object' THEN NULLIF(va.source_doc#>>'{ngo,id}', '')
              ELSE NULL
            END AS ngo_ref,
            CASE
              WHEN jsonb_typeof(va.source_doc->'opportunity') = 'string' THEN NULLIF(va.source_doc->>'opportunity', '')
              WHEN jsonb_typeof(va.source_doc->'opportunity') = 'object' THEN NULLIF(va.source_doc#>>'{opportunity,id}', '')
              ELSE NULL
            END AS opportunity_ref
        ) refs
        LEFT JOIN users_rel u ON u.external_id = refs.user_ref
        LEFT JOIN ngos_rel ngo ON ngo.external_id = refs.ngo_ref
        LEFT JOIN volunteer_opportunities_rel vo ON vo.external_id = refs.opportunity_ref
        WHERE COALESCE(NULLIF(va.source_doc->>'status', ''), 'applied') <> 'withdrawn'
        ORDER BY va.created_at DESC
        LIMIT $1
        `,
        [limit]
      ),
      query(
        `
        SELECT
          c.external_id AS campaign_id,
          c.source_doc AS campaign_doc,
          c.created_at AS campaign_created_at,
          ngo.external_id AS ngo_id,
          ngo.source_doc AS ngo_doc,
          u.external_id AS user_id,
          u.source_doc AS user_doc,
          reg.value AS registration_doc
        FROM campaigns_rel c
        LEFT JOIN ngos_rel ngo ON ngo.external_id = (
          CASE
            WHEN jsonb_typeof(c.source_doc->'ngo') = 'string' THEN NULLIF(c.source_doc->>'ngo', '')
            WHEN jsonb_typeof(c.source_doc->'ngo') = 'object' THEN NULLIF(c.source_doc#>>'{ngo,id}', '')
            ELSE NULL
          END
        )
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.source_doc->'volunteerRegistrations', '[]'::jsonb)) AS reg(value)
        LEFT JOIN users_rel u ON u.external_id = (
          CASE
            WHEN jsonb_typeof(reg.value->'user') = 'string' THEN NULLIF(reg.value->>'user', '')
            WHEN jsonb_typeof(reg.value->'user') = 'object' THEN NULLIF(reg.value#>>'{user,id}', '')
            ELSE NULL
          END
        )
        ORDER BY
          COALESCE(
            safe_timestamptz(reg.value->>'updatedAt'),
            safe_timestamptz(reg.value->>'createdAt'),
            c.created_at
          ) DESC
        LIMIT $1
        `,
        [limit]
      ),
      query(
        `
        SELECT external_id AS ngo_id, source_doc AS ngo_doc, created_at AS ngo_created_at
        FROM ngos_rel
        WHERE COALESCE(safe_bool(source_doc->>'verified'), false) = false
        ORDER BY created_at DESC
        LIMIT $1
        `,
        [Math.min(limit, 10)]
      ),
      query(
        `
        SELECT external_id AS ngo_id, source_doc AS ngo_doc, created_at AS ngo_created_at
        FROM ngos_rel
        WHERE COALESCE(safe_bool(source_doc->>'flagged'), false) = true
        ORDER BY created_at DESC
        LIMIT $1
        `,
        [Math.min(limit, 10)]
      ),
      query(
        `
        SELECT external_id AS campaign_id, source_doc AS campaign_doc, created_at AS campaign_created_at
        FROM campaigns_rel
        WHERE COALESCE(safe_bool(source_doc->>'flagged'), false) = true
        ORDER BY created_at DESC
        LIMIT $1
        `,
        [Math.min(limit, 10)]
      )
    ]);

    const stats = {
      pendingNgos: Number(statsRow.pending_ngos || 0),
      verifiedNgos: Number(statsRow.verified_ngos || 0),
      ngosTotal: Number(statsRow.ngos_total || 0),
      usersTotal: Number(statsRow.users_total || 0),
      adminsTotal: Number(statsRow.admins_total || 0),
      campaignsTotal: Number(statsRow.campaigns_total || 0),
      flaggedNgos: Number(statsRow.flagged_ngos || 0),
      flaggedCampaigns: Number(statsRow.flagged_campaigns || 0),
      requestsTotal: Number(statsRow.requests_total || 0),
      categoriesTotal: Number(statsRow.categories_total || 0),
      donationsCompletedCount: Number(statsRow.donations_completed_count || 0),
      donationsCompletedTotal: Number(statsRow.donations_completed_total || 0),
      volunteerApplicationsCount: Number(statsRow.volunteer_applications_count || 0),
      volunteerCompletedCount: Number(statsRow.volunteer_completed_count || 0),
      campaignVolunteersCount: Number(statsRow.campaign_volunteers_count || 0),
      campaignVolunteerRegistrationsCount: Number(statsRow.campaign_volunteer_registrations_count || 0)
    };

    const campaigns = campaignRows.map((row) => {
      const campaign = toDoc(row, 'campaign_id', 'campaign_doc');
      const ngo = row.ngo_doc ? toDoc(row, 'ngo_id', 'ngo_doc') : null;
      return {
        id: campaign.id,
        title: campaign.title,
        category: campaign.category,
        location: campaign.location,
        area: campaign.area,
        flagged: Boolean(campaign.flagged),
        goalAmount: Number(row.goal_amount || 0),
        currentAmount: Number(row.current_amount || 0),
        progress: Number(row.progress || 0),
        createdAt: campaign.createdAt || row.campaign_created_at,
        ngo: ngo
          ? {
            id: ngo.id,
            name: ngo.name,
            verified: ngo.verified,
            isActive: ngo.isActive
          }
          : null
      };
    });

    const donations = donationRows.map((row) => {
      const donation = toDoc(row, 'donation_id', 'donation_doc');
      donation.certificateApprovalStatus = normalizeDonationCertificateApprovalStatus(donation);
      donation.createdAt = donation.createdAt || row.donation_created_at;

      const user = row.user_doc ? toDoc(row, 'user_id', 'user_doc') : null;
      const ngo = row.ngo_doc ? toDoc(row, 'ngo_id', 'ngo_doc') : null;
      const campaign = row.campaign_doc ? toDoc(row, 'campaign_id', 'campaign_doc') : null;

      return {
        id: donation.id,
        amount: Number(donation.amount || 0),
        status: donation.status,
        paymentMethod: donation.paymentMethod,
        receiptNumber: donation.receiptNumber,
        donorName: donation.donorName,
        donorEmail: donation.donorEmail,
        certificateApprovalStatus: donation.certificateApprovalStatus,
        createdAt: donation.createdAt,
        user: user
          ? {
            id: user.id,
            name: user.name,
            email: user.email,
            mobileNumber: user.mobileNumber
          }
          : null,
        ngo: ngo
          ? {
            id: ngo.id,
            name: ngo.name,
            verified: ngo.verified,
            isActive: ngo.isActive
          }
          : null,
        campaign: campaign
          ? {
            id: campaign.id,
            title: campaign.title,
            category: campaign.category,
            location: campaign.location
          }
          : null
      };
    });

    const volunteerApplications = volunteerRows.map((row) => {
      const application = toDoc(row, 'application_id', 'application_doc');
      application.certificateApprovalStatus = normalizeVolunteerCertificateApprovalStatus(application);
      application.createdAt = application.createdAt || row.application_created_at;

      const user = row.user_doc ? toDoc(row, 'user_id', 'user_doc') : null;
      const ngo = row.ngo_doc ? toDoc(row, 'ngo_id', 'ngo_doc') : null;
      const opportunity = row.opportunity_doc ? toDoc(row, 'opportunity_id', 'opportunity_doc') : null;

      return {
        id: application.id,
        status: application.status,
        assignedTask: application.assignedTask,
        activityHours: Number(application.activityHours || 0),
        certificateApprovalStatus: application.certificateApprovalStatus,
        createdAt: application.createdAt,
        completedAt: application.completedAt || null,
        user: user
          ? {
            id: user.id,
            name: user.name,
            email: user.email,
            mobileNumber: user.mobileNumber
          }
          : null,
        ngo: ngo
          ? {
            id: ngo.id,
            name: ngo.name,
            verified: ngo.verified,
            isActive: ngo.isActive
          }
          : null,
        opportunity: opportunity
          ? {
            id: opportunity.id,
            title: opportunity.title,
            location: opportunity.location,
            commitment: opportunity.commitment
          }
          : null
      };
    });

    const campaignVolunteerRegistrations = campaignVolunteerRows.map((row) => {
      const campaign = toDoc(row, 'campaign_id', 'campaign_doc');
      const ngo = row.ngo_doc ? toDoc(row, 'ngo_id', 'ngo_doc') : null;
      const user = row.user_doc ? toDoc(row, 'user_id', 'user_doc') : null;
      const registration = row.registration_doc && typeof row.registration_doc === 'object' ? { ...row.registration_doc } : {};

      const submittedAt = toDateOrNull(registration.updatedAt) || toDateOrNull(registration.createdAt) || row.campaign_created_at;

      return {
        campaign: {
          id: campaign.id,
          title: campaign.title,
          location: campaign.location,
          area: campaign.area
        },
        ngo: ngo
          ? {
            id: ngo.id,
            name: ngo.name,
            verified: ngo.verified,
            isActive: ngo.isActive
          }
          : null,
        user: user
          ? {
            id: user.id,
            name: user.name,
            email: user.email,
            mobileNumber: user.mobileNumber
          }
          : null,
        registration: {
          fullName: registration.fullName || '',
          email: registration.email || '',
          phone: registration.phone || '',
          preferredActivities: Array.isArray(registration.preferredActivities) ? registration.preferredActivities : [],
          availability: registration.availability || '',
          motivation: registration.motivation || '',
          createdAt: registration.createdAt || null,
          updatedAt: registration.updatedAt || null,
          submittedAt
        }
      };
    });

    res.json({
      generatedAt: new Date().toISOString(),
      days,
      stats: {
        ...stats,
        flaggedTotal: stats.flaggedNgos + stats.flaggedCampaigns
      },
      series: {
        donations: donationSeriesRows.map((row) => ({
          day: row.day,
          totalAmount: Number(row.total_amount || 0),
          count: Number(row.donations_count || 0)
        })),
        volunteerApplications: volunteerSeriesRows.map((row) => ({
          day: row.day,
          count: Number(row.applications_count || 0),
          completedCount: Number(row.completed_count || 0)
        }))
      },
      pendingNgos: pendingNgoRows.map((row) => {
        const ngo = toDoc(row, 'ngo_id', 'ngo_doc');
        return {
          id: ngo.id,
          name: ngo.name,
          email: ngo.email,
          categories: ngo.categories || [],
          registrationId: ngo.registrationId,
          createdAt: ngo.createdAt || row.ngo_created_at
        };
      }),
      flagged: {
        ngos: flaggedNgoRows.map((row) => {
          const ngo = toDoc(row, 'ngo_id', 'ngo_doc');
          return {
            id: ngo.id,
            name: ngo.name,
            email: ngo.email,
            flagReason: ngo.flagReason,
            createdAt: ngo.createdAt || row.ngo_created_at
          };
        }),
        campaigns: flaggedCampaignRows.map((row) => {
          const campaign = toDoc(row, 'campaign_id', 'campaign_doc');
          return {
            id: campaign.id,
            title: campaign.title,
            category: campaign.category,
            location: campaign.location,
            flagReason: campaign.flagReason,
            createdAt: campaign.createdAt || row.campaign_created_at
          };
        })
      },
      campaigns,
      donations,
      volunteerApplications,
      campaignVolunteerRegistrations
    });
  } catch (err) {
    console.error(err);
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
