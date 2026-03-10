const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const NGO = require('../models/NGO');
const Certificate = require('../models/Certificate');
const Message = require('../models/Message');
const FlagRequest = require('../models/FlagRequest');
const Notification = require('../models/Notification');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const auth = require('../middleware/auth');
const AILog = require('../models/AILog');
const { query } = require('../db/postgres');
const { normalizeIdValue } = require('../db/utils');
const { generateCertificateNumber } = require('../utils/certificateTemplates');
const { sendEmail } = require('../utils/mailer');
const { dispatchWebhook } = require('../utils/webhookDispatcher');
const { awardPoints } = require('../utils/gamification');

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

const toFirstName = (value) => {
  const text = String(value || '').trim();
  if (!text) return 'Supporter';
  return text.split(/\s+/)[0];
};

const truncateText = (value, max = 180) => {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
};

const isValidEmail = (value) => {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const getFrontendBaseUrl = () => {
  const candidate = String(process.env.FRONTEND_URL || process.env.CLIENT_URL || process.env.APP_URL || '').trim();
  return candidate ? candidate.replace(/\/+$/, '') : '';
};

const buildCampaignUrl = (campaignId) => {
  const base = getFrontendBaseUrl();
  if (!base) return `/campaigns/${campaignId}`;
  return `${base}/campaigns/${campaignId}`;
};

const toRate = (count, total) => {
  const numerator = Number(count || 0);
  const denominator = Number(total || 0);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
};

const emptyUpdateTotals = () => ({
  updatesCount: 0,
  targetDonors: 0,
  sentCount: 0,
  openedCount: 0,
  clickedCount: 0,
  emailAttemptedCount: 0,
  emailSentCount: 0,
  emailFailedCount: 0,
  openRate: 0,
  clickRate: 0,
  emailDeliveryRate: 0,
  completedDonorsCount: 0,
  legacyUndeliveredUpdatesCount: 0
});

const loadCompletedDonorCountsByCampaign = async (campaignIds = []) => {
  const normalizedIds = Array.from(
    new Set((Array.isArray(campaignIds) ? campaignIds : []).map((id) => String(id || '').trim()).filter(Boolean))
  );
  const counts = new Map();
  if (normalizedIds.length === 0) return counts;

  const { rows } = await query(
    `
    SELECT
      refs.campaign_ref AS campaign_id,
      COUNT(DISTINCT refs.user_ref)::int AS completed_donors_count
    FROM donations_rel d
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN jsonb_typeof(d.source_doc->'campaign') = 'string' THEN NULLIF(d.source_doc->>'campaign', '')
          WHEN jsonb_typeof(d.source_doc->'campaign') = 'object' THEN NULLIF(d.source_doc#>>'{campaign,id}', '')
          ELSE NULL
        END AS campaign_ref,
        CASE
          WHEN jsonb_typeof(d.source_doc->'user') = 'string' THEN NULLIF(d.source_doc->>'user', '')
          WHEN jsonb_typeof(d.source_doc->'user') = 'object' THEN NULLIF(d.source_doc#>>'{user,id}', '')
          ELSE NULL
        END AS user_ref
    ) refs
    WHERE refs.campaign_ref = ANY($1::text[])
      AND refs.user_ref IS NOT NULL
      AND COALESCE(NULLIF(d.source_doc->>'status', ''), 'pending') = 'completed'
    GROUP BY refs.campaign_ref
    `,
    [normalizedIds]
  );

  rows.forEach((row) => {
    const campaignId = String(row?.campaign_id || '').trim();
    if (!campaignId) return;
    counts.set(campaignId, Number(row?.completed_donors_count || 0));
  });

  return counts;
};

const buildLegacyUpdateId = (entry, index = 0) => {
  const safeIndex = Number.isFinite(Number(index)) ? Number(index) + 1 : 1;
  const raw =
    typeof entry === 'string'
      ? entry
      : (entry && typeof entry === 'object' ? JSON.stringify(entry) : '');
  const compact = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
  return `legacy_update_${safeIndex}_${compact || 'item'}`;
};

const normalizeCampaignUpdateEntry = (entry = {}, index = 0) => {
  if (typeof entry === 'string') {
    return {
      id: buildLegacyUpdateId(entry, index),
      headline: 'Campaign Update',
      message: entry,
      impactSummary: '',
      createdAt: '',
      delivery: null
    };
  }
  const obj = entry && typeof entry === 'object' ? entry : {};
  return {
    id: String(obj.id || '').trim() || buildLegacyUpdateId(obj, index),
    headline: String(obj.headline || obj.title || 'Campaign Update').trim(),
    message: String(obj.message || obj.text || '').trim(),
    impactSummary: String(obj.impactSummary || '').trim(),
    createdAt: obj.createdAt || obj.date || '',
    delivery: obj.delivery && typeof obj.delivery === 'object' ? { ...obj.delivery } : null
  };
};

let genAI = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_API_KEY_HERE') {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

const buildCampaignUpdateSnippet = async ({ ngoName, campaignTitle, headline, message, impactSummary }) => {
  const fallback = truncateText([headline, message, impactSummary ? `Impact: ${impactSummary}` : ''].filter(Boolean).join(' '), 150);
  if (!genAI) {
    return { text: fallback, mode: 'template' };
  }

  try {
    const model = genAI.getGenerativeModel(
      { model: 'gemini-2.5-flash' },
      { apiVersion: 'v1beta' }
    );

    const prompt = `
You are writing a short donor update snippet.
Return exactly one concise paragraph under 45 words.
Tone: specific, factual, grateful, no hype.

NGO: ${ngoName}
Campaign: ${campaignTitle}
Headline: ${headline}
Update details: ${message}
Impact note: ${impactSummary || 'Not provided'}
`.trim();

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = truncateText(String(response.text() || '').replace(/\s+/g, ' ').trim(), 180);
    if (!text) return { text: fallback, mode: 'template' };
    return { text, mode: 'gemini' };
  } catch (err) {
    return { text: fallback, mode: 'template' };
  }
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

// NGO posts campaign update and notifies donors with personalized messages
router.post('/:id/updates', auth(['ngo']), async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id).populate('ngo', 'name');
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });

    const campaignNgoId = normalizeIdValue(campaign.ngo?.id || campaign.ngo);
    if (!campaignNgoId || String(campaignNgoId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const headline = String(req.body?.headline || req.body?.title || '').trim();
    const message = String(req.body?.message || req.body?.text || '').trim();
    const impactSummary = String(req.body?.impactSummary || '').trim();

    if (message.length < 8) {
      return res.status(400).json({ message: 'Please provide a meaningful update message.' });
    }

    const updateEntry = {
      id: `upd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      headline: headline || 'Campaign Progress Update',
      message,
      impactSummary,
      createdAt: nowIso(),
      createdByNgoId: req.user.id,
      delivery: {
        targetDonors: 0,
        inAppDelivered: 0,
        inAppFailed: 0,
        emailAttempted: 0,
        emailSent: 0,
        emailFailed: 0,
        lastDeliveryAt: null
      }
    };

    if (!Array.isArray(campaign.updates)) campaign.updates = [];
    campaign.updates = [updateEntry, ...campaign.updates].slice(0, 80);
    await campaign.save();

    const { rows } = await query(
      `
      SELECT
        refs.user_ref AS user_ref,
        MAX(
          COALESCE(
          NULLIF(d.source_doc->>'donorName', ''),
          NULLIF(u.source_doc->>'name', ''),
          'Supporter'
          )
        ) AS donor_name,
        MAX(
          COALESCE(
          NULLIF(LOWER(d.source_doc->>'donorEmail'), ''),
          NULLIF(LOWER(u.source_doc->>'email'), '')
          )
        ) AS donor_email,
        COUNT(*)::int AS donation_count,
        COALESCE(SUM(COALESCE(safe_numeric(d.source_doc->>'amount'), 0)), 0) AS total_donated
      FROM donations_rel d
      CROSS JOIN LATERAL (
        SELECT
          CASE
            WHEN jsonb_typeof(d.source_doc->'user') = 'string' THEN NULLIF(d.source_doc->>'user', '')
            WHEN jsonb_typeof(d.source_doc->'user') = 'object' THEN NULLIF(d.source_doc#>>'{user,id}', '')
            ELSE NULL
          END AS user_ref,
          CASE
            WHEN jsonb_typeof(d.source_doc->'campaign') = 'string' THEN NULLIF(d.source_doc->>'campaign', '')
            WHEN jsonb_typeof(d.source_doc->'campaign') = 'object' THEN NULLIF(d.source_doc#>>'{campaign,id}', '')
            ELSE NULL
          END AS campaign_ref
      ) refs
      LEFT JOIN users_rel u ON u.external_id = refs.user_ref
      WHERE refs.campaign_ref = $1
        AND refs.user_ref IS NOT NULL
        AND COALESCE(NULLIF(d.source_doc->>'status', ''), 'pending') = 'completed'
      GROUP BY refs.user_ref
      `,
      [campaign.id]
    );

    const donorRecipients = rows
      .map((row) => ({
        userId: String(row.user_ref || '').trim(),
        donorName: String(row.donor_name || '').trim() || 'Supporter',
        donorEmail: String(row.donor_email || '').trim().toLowerCase(),
        donationCount: Number(row.donation_count || 0),
        totalDonated: Number(row.total_donated || 0)
      }))
      .filter((row) => row.userId);

    const ngoName = String(campaign.ngo?.name || 'The NGO').trim();
    const safeHeadline = updateEntry.headline || 'Campaign Progress Update';
    const snippetResult = await buildCampaignUpdateSnippet({
      ngoName,
      campaignTitle: campaign.title,
      headline: safeHeadline,
      message: updateEntry.message,
      impactSummary
    });
    const previewMessage = snippetResult.text;
    const campaignUrl = buildCampaignUrl(campaign.id);

    const deliveryResults = await Promise.all(
      donorRecipients.map(async (recipient) => {
        const deliveredAt = nowIso();
        let inAppDelivered = false;
        let emailAttempted = false;
        let emailSent = false;
        const donorSummary =
          recipient.donationCount > 1
            ? `You have contributed ${recipient.donationCount} times (Rs ${Math.round(recipient.totalDonated).toLocaleString('en-IN')}).`
            : recipient.totalDonated > 0
              ? `Thanks for your contribution of Rs ${Math.round(recipient.totalDonated).toLocaleString('en-IN')}.`
              : '';

        try {
          await Notification.create({
            title: `${campaign.title}: ${safeHeadline}`,
            message: `Hi ${toFirstName(recipient.donorName)}, ${previewMessage}${donorSummary ? ` ${donorSummary}` : ''}`,
            audience: 'users',
            recipientRole: 'user',
            recipientUserId: recipient.userId,
            campaignId: campaign.id,
            ngoId: req.user.id,
            campaignUpdateId: updateEntry.id,
            notificationType: 'campaign_update',
            actionUrl: `/campaigns/${campaign.id}`,
            deliveryStatus: 'delivered',
            deliveredAt,
            openedAt: null,
            clickedAt: null,
            openCount: 0,
            clickCount: 0,
            aiSummaryMode: snippetResult.mode,
            donorDonationCount: recipient.donationCount,
            donorTotalDonated: recipient.totalDonated,
            createdBy: req.user.id
          });
          inAppDelivered = true;
        } catch (notificationErr) {
          inAppDelivered = false;
        }

        if (isValidEmail(recipient.donorEmail)) {
          emailAttempted = true;
          const textLines = [
            `Hi ${toFirstName(recipient.donorName)},`,
            '',
            `${ngoName} posted a new update for "${campaign.title}":`,
            `${safeHeadline}`,
            '',
            previewMessage
          ];
          if (donorSummary) {
            textLines.push('', donorSummary);
          }
          if (impactSummary) {
            textLines.push('', `Impact: ${impactSummary}`);
          }
          textLines.push('', `View campaign: ${campaignUrl}`);

          const emailRes = await sendEmail({
            to: recipient.donorEmail,
            subject: `${campaign.title}: ${safeHeadline}`,
            text: textLines.join('\n')
          });
          emailSent = Boolean(emailRes?.sent);
        }

        return {
          inAppDelivered,
          emailAttempted,
          emailSent
        };
      })
    );

    const deliverySummary = deliveryResults.reduce(
      (summary, item) => {
        summary.targetDonors += 1;
        if (item.inAppDelivered) summary.inAppDelivered += 1;
        else summary.inAppFailed += 1;
        if (item.emailAttempted) summary.emailAttempted += 1;
        if (item.emailSent) summary.emailSent += 1;
        return summary;
      },
      {
        targetDonors: 0,
        inAppDelivered: 0,
        inAppFailed: 0,
        emailAttempted: 0,
        emailSent: 0,
        emailFailed: 0,
        lastDeliveryAt: nowIso()
      }
    );
    deliverySummary.emailFailed = Math.max(deliverySummary.emailAttempted - deliverySummary.emailSent, 0);

    const updateIndex = campaign.updates.findIndex((entry) => String(entry?.id || '') === updateEntry.id);
    if (updateIndex >= 0) {
      const currentEntry =
        campaign.updates[updateIndex] && typeof campaign.updates[updateIndex].toObject === 'function'
          ? campaign.updates[updateIndex].toObject()
          : campaign.updates[updateIndex];
      campaign.updates[updateIndex] = {
        ...(currentEntry || {}),
        delivery: deliverySummary
      };
      await campaign.save();
    }

    const webhookResult = await dispatchWebhook('campaign.update.created', {
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      ngoId: req.user.id,
      ngoName,
      update: normalizeCampaignUpdateEntry({
        ...updateEntry,
        delivery: deliverySummary
      }),
      notifiedDonors: donorRecipients.length,
      delivery: deliverySummary
    });

    await AILog.create({
      type: 'campaign-update',
      payload: {
        campaignId: campaign.id,
        ngoId: req.user.id,
        headline: updateEntry.headline,
        messagePreview: truncateText(updateEntry.message, 220)
      },
      result: {
        notifiedDonorCount: donorRecipients.length,
        delivery: deliverySummary,
        webhook: webhookResult,
        aiSummaryMode: snippetResult.mode
      }
    });

    return res.json({
      message: 'Campaign update posted and donor notifications sent.',
      update: normalizeCampaignUpdateEntry({
        ...updateEntry,
        delivery: deliverySummary
      }),
      notifiedDonors: donorRecipients.length,
      delivery: deliverySummary,
      aiSummaryMode: snippetResult.mode,
      webhook: {
        attempted: Boolean(webhookResult?.attempted),
        sent: Boolean(webhookResult?.sent),
        reason: String(webhookResult?.reason || ''),
        logId: webhookResult?.logId || null
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Campaign update analytics for NGO/Admin
router.get('/:id/updates/analytics', auth(['ngo', 'admin']), async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id).select('title ngo updates');
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });

    const campaignNgoId = normalizeIdValue(campaign.ngo);
    if (req.user.role === 'ngo' && String(campaignNgoId || '') !== String(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const rawUpdates = Array.isArray(campaign.updates) ? campaign.updates : [];
    const normalizedUpdates = rawUpdates
      .map((entry, index) => normalizeCampaignUpdateEntry(entry, index))
      .filter((entry) => entry && entry.id);
    const completedDonorCountsByCampaign = await loadCompletedDonorCountsByCampaign([campaign.id]);
    const completedDonorsCount = Number(completedDonorCountsByCampaign.get(String(campaign.id)) || 0);

    const { rows } = await query(
      `
      SELECT source_doc
      FROM notifications_rel
      WHERE source_doc->>'notificationType' = 'campaign_update'
        AND source_doc->>'campaignId' = $1
      ORDER BY created_at DESC
      LIMIT 5000
      `,
      [campaign.id]
    );

    const statsByUpdate = new Map();
    normalizedUpdates.forEach((update) => {
      statsByUpdate.set(update.id, {
        sentCount: 0,
        openedCount: 0,
        clickedCount: 0,
        lastInteractionAt: null
      });
    });

    rows.forEach((row) => {
      const doc = row?.source_doc && typeof row.source_doc === 'object' ? row.source_doc : {};
      const updateId = String(doc.campaignUpdateId || '').trim();
      if (!updateId) return;

      if (!statsByUpdate.has(updateId)) {
        statsByUpdate.set(updateId, {
          sentCount: 0,
          openedCount: 0,
          clickedCount: 0,
          lastInteractionAt: null
        });
      }

      const bucket = statsByUpdate.get(updateId);
      bucket.sentCount += 1;

      const openedAt = String(doc.openedAt || '').trim();
      const clickedAt = String(doc.clickedAt || '').trim();
      const openCount = Number(doc.openCount || 0);
      const clickCount = Number(doc.clickCount || 0);

      if (openedAt || openCount > 0) bucket.openedCount += 1;
      if (clickedAt || clickCount > 0) bucket.clickedCount += 1;

      const interactionCandidates = [
        clickedAt,
        openedAt,
        String(doc.lastEngagementAt || '').trim(),
        String(doc.updatedAt || '').trim(),
        String(doc.createdAt || '').trim()
      ]
        .map((value) => parseTimestamp(value))
        .filter((value) => value > 0);
      if (interactionCandidates.length > 0) {
        const maxInteraction = Math.max(...interactionCandidates);
        const current = parseTimestamp(bucket.lastInteractionAt);
        if (maxInteraction > current) {
          bucket.lastInteractionAt = new Date(maxInteraction).toISOString();
        }
      }
    });

    const updates = normalizedUpdates
      .map((update) => {
        const delivery = update.delivery && typeof update.delivery === 'object' ? update.delivery : {};
        const fromNotifications = statsByUpdate.get(update.id) || {
          sentCount: 0,
          openedCount: 0,
          clickedCount: 0,
          lastInteractionAt: null
        };

        const sentCount = Number(fromNotifications.sentCount || delivery.inAppDelivered || 0);
        const openedCount = Number(fromNotifications.openedCount || 0);
        const clickedCount = Number(fromNotifications.clickedCount || 0);
        const emailAttemptedCount = Number(delivery.emailAttempted || 0);
        const emailSentCount = Number(delivery.emailSent || 0);
        const emailFailedCount = Math.max(Number(delivery.emailFailed || emailAttemptedCount - emailSentCount), 0);
        const targetDonors = Number(delivery.targetDonors || sentCount || 0);
        const hasTrackedDelivery = (
          sentCount > 0
          || targetDonors > 0
          || Number(delivery.inAppDelivered || 0) > 0
          || emailAttemptedCount > 0
          || emailSentCount > 0
        );
        const legacyUndelivered = String(update.id || '').startsWith('legacy_update_') && !hasTrackedDelivery;

        return {
          updateId: update.id,
          headline: update.headline,
          createdAt: update.createdAt || null,
          targetDonors,
          sentCount,
          openedCount,
          clickedCount,
          openRate: toRate(openedCount, sentCount),
          clickRate: toRate(clickedCount, sentCount),
          emailAttemptedCount,
          emailSentCount,
          emailFailedCount,
          emailDeliveryRate: toRate(emailSentCount, emailAttemptedCount),
          lastInteractionAt: fromNotifications.lastInteractionAt || null,
          legacyUndelivered
        };
      })
      .sort((left, right) => parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt));

    const totals = updates.reduce(
      (acc, row) => {
        acc.updatesCount += 1;
        acc.targetDonors += Number(row.targetDonors || 0);
        acc.sentCount += Number(row.sentCount || 0);
        acc.openedCount += Number(row.openedCount || 0);
        acc.clickedCount += Number(row.clickedCount || 0);
        acc.emailAttemptedCount += Number(row.emailAttemptedCount || 0);
        acc.emailSentCount += Number(row.emailSentCount || 0);
        acc.emailFailedCount += Number(row.emailFailedCount || 0);
        if (row.legacyUndelivered) acc.legacyUndeliveredUpdatesCount += 1;
        return acc;
      },
      emptyUpdateTotals()
    );

    totals.openRate = toRate(totals.openedCount, totals.sentCount);
    totals.clickRate = toRate(totals.clickedCount, totals.sentCount);
    totals.emailDeliveryRate = toRate(totals.emailSentCount, totals.emailAttemptedCount);
    totals.completedDonorsCount = completedDonorsCount;

    return res.json({
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      generatedAt: nowIso(),
      totals,
      updates
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
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

// NGO aggregate analytics for campaign updates (all NGO campaigns)
router.get('/ngo/campaign-updates/analytics', auth(['ngo']), async (req, res) => {
  try {
    const campaigns = await Campaign.find({ ngo: req.user.id })
      .select('title updates createdAt')
      .sort({ createdAt: -1 });
    const campaignDocs = campaigns.map((campaign) =>
      (campaign && typeof campaign.toObject === 'function' ? campaign.toObject() : campaign)
    );

    if (campaignDocs.length === 0) {
      return res.json({
        generatedAt: nowIso(),
        ngoId: req.user.id,
        totals: emptyUpdateTotals(),
        campaigns: []
      });
    }

    const campaignIds = campaignDocs.map((campaign) => String(campaign.id)).filter(Boolean);
    const completedDonorCountsByCampaign = await loadCompletedDonorCountsByCampaign(campaignIds);
    const { rows } = await query(
      `
      SELECT source_doc
      FROM notifications_rel
      WHERE source_doc->>'notificationType' = 'campaign_update'
        AND source_doc->>'campaignId' = ANY($1::text[])
      ORDER BY created_at DESC
      LIMIT 20000
      `,
      [campaignIds]
    );

    const notificationsByCampaign = new Map();
    rows.forEach((row) => {
      const doc = row?.source_doc && typeof row.source_doc === 'object' ? row.source_doc : {};
      const campaignId = String(doc.campaignId || '').trim();
      if (!campaignId) return;
      if (!notificationsByCampaign.has(campaignId)) notificationsByCampaign.set(campaignId, []);
      notificationsByCampaign.get(campaignId).push(doc);
    });

    const campaignAnalytics = campaignDocs.map((campaign) => {
      const campaignId = String(campaign.id || '').trim();
      const completedDonorsCount = Number(completedDonorCountsByCampaign.get(campaignId) || 0);
      const normalizedUpdates = (Array.isArray(campaign.updates) ? campaign.updates : [])
        .map((entry, index) => normalizeCampaignUpdateEntry(entry, index))
        .filter((entry) => entry && entry.id);

      const statsByUpdate = new Map();
      normalizedUpdates.forEach((update) => {
        statsByUpdate.set(update.id, {
          sentCount: 0,
          openedCount: 0,
          clickedCount: 0,
          lastInteractionAt: null
        });
      });

      const campaignNotifications = notificationsByCampaign.get(campaignId) || [];
      campaignNotifications.forEach((doc) => {
        const updateId = String(doc.campaignUpdateId || '').trim();
        if (!updateId || !statsByUpdate.has(updateId)) return;

        const bucket = statsByUpdate.get(updateId);
        bucket.sentCount += 1;

        const openedAt = String(doc.openedAt || '').trim();
        const clickedAt = String(doc.clickedAt || '').trim();
        const openCount = Number(doc.openCount || 0);
        const clickCount = Number(doc.clickCount || 0);

        if (openedAt || openCount > 0) bucket.openedCount += 1;
        if (clickedAt || clickCount > 0) bucket.clickedCount += 1;

        const interactionCandidates = [
          clickedAt,
          openedAt,
          String(doc.lastEngagementAt || '').trim(),
          String(doc.updatedAt || '').trim(),
          String(doc.createdAt || '').trim()
        ]
          .map((value) => parseTimestamp(value))
          .filter((value) => value > 0);
        if (interactionCandidates.length > 0) {
          const maxInteraction = Math.max(...interactionCandidates);
          const current = parseTimestamp(bucket.lastInteractionAt);
          if (maxInteraction > current) {
            bucket.lastInteractionAt = new Date(maxInteraction).toISOString();
          }
        }
      });

      const updates = normalizedUpdates
        .map((update) => {
          const delivery = update.delivery && typeof update.delivery === 'object' ? update.delivery : {};
          const fromNotifications = statsByUpdate.get(update.id) || {
            sentCount: 0,
            openedCount: 0,
            clickedCount: 0,
            lastInteractionAt: null
          };

          const sentCount = Number(fromNotifications.sentCount || delivery.inAppDelivered || 0);
          const openedCount = Number(fromNotifications.openedCount || 0);
          const clickedCount = Number(fromNotifications.clickedCount || 0);
          const emailAttemptedCount = Number(delivery.emailAttempted || 0);
          const emailSentCount = Number(delivery.emailSent || 0);
          const emailFailedCount = Math.max(Number(delivery.emailFailed || emailAttemptedCount - emailSentCount), 0);
          const targetDonors = Number(delivery.targetDonors || sentCount || 0);
          const hasTrackedDelivery = (
            sentCount > 0
            || targetDonors > 0
            || Number(delivery.inAppDelivered || 0) > 0
            || emailAttemptedCount > 0
            || emailSentCount > 0
          );
          const legacyUndelivered = String(update.id || '').startsWith('legacy_update_') && !hasTrackedDelivery;

          return {
            updateId: update.id,
            headline: update.headline,
            createdAt: update.createdAt || null,
            targetDonors,
            sentCount,
            openedCount,
            clickedCount,
            openRate: toRate(openedCount, sentCount),
            clickRate: toRate(clickedCount, sentCount),
            emailAttemptedCount,
            emailSentCount,
            emailFailedCount,
            emailDeliveryRate: toRate(emailSentCount, emailAttemptedCount),
            lastInteractionAt: fromNotifications.lastInteractionAt || null,
            legacyUndelivered
          };
        })
        .sort((left, right) => parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt));

      const totals = updates.reduce(
        (acc, row) => {
          acc.updatesCount += 1;
          acc.targetDonors += Number(row.targetDonors || 0);
          acc.sentCount += Number(row.sentCount || 0);
          acc.openedCount += Number(row.openedCount || 0);
          acc.clickedCount += Number(row.clickedCount || 0);
          acc.emailAttemptedCount += Number(row.emailAttemptedCount || 0);
          acc.emailSentCount += Number(row.emailSentCount || 0);
          acc.emailFailedCount += Number(row.emailFailedCount || 0);
          if (row.legacyUndelivered) acc.legacyUndeliveredUpdatesCount += 1;
          return acc;
        },
        emptyUpdateTotals()
      );
      totals.openRate = toRate(totals.openedCount, totals.sentCount);
      totals.clickRate = toRate(totals.clickedCount, totals.sentCount);
      totals.emailDeliveryRate = toRate(totals.emailSentCount, totals.emailAttemptedCount);
      totals.completedDonorsCount = completedDonorsCount;

      const lastUpdateAt = updates.length > 0 ? updates[0].createdAt : (campaign.createdAt || null);
      const lastInteractionAt = updates.reduce((value, row) => {
        if (!row.lastInteractionAt) return value;
        const candidate = parseTimestamp(row.lastInteractionAt);
        const current = parseTimestamp(value);
        return candidate > current ? row.lastInteractionAt : value;
      }, null);

      return {
        campaignId: campaign.id,
        campaignTitle: campaign.title || 'Campaign',
        totals,
        lastUpdateAt,
        lastInteractionAt,
        recentUpdates: updates.slice(0, 5)
      };
    });

    campaignAnalytics.sort((left, right) => parseTimestamp(right.lastUpdateAt) - parseTimestamp(left.lastUpdateAt));

    const totals = campaignAnalytics.reduce(
      (acc, campaign) => {
        const source = campaign.totals || {};
        acc.updatesCount += Number(source.updatesCount || 0);
        acc.targetDonors += Number(source.targetDonors || 0);
        acc.sentCount += Number(source.sentCount || 0);
        acc.openedCount += Number(source.openedCount || 0);
        acc.clickedCount += Number(source.clickedCount || 0);
        acc.emailAttemptedCount += Number(source.emailAttemptedCount || 0);
        acc.emailSentCount += Number(source.emailSentCount || 0);
        acc.emailFailedCount += Number(source.emailFailedCount || 0);
        acc.completedDonorsCount += Number(source.completedDonorsCount || 0);
        acc.legacyUndeliveredUpdatesCount += Number(source.legacyUndeliveredUpdatesCount || 0);
        return acc;
      },
      emptyUpdateTotals()
    );
    totals.openRate = toRate(totals.openedCount, totals.sentCount);
    totals.clickRate = toRate(totals.clickedCount, totals.sentCount);
    totals.emailDeliveryRate = toRate(totals.emailSentCount, totals.emailAttemptedCount);

    return res.json({
      generatedAt: nowIso(),
      ngoId: req.user.id,
      totals,
      campaigns: campaignAnalytics
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
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
      try {
        await awardPoints(userId, {
          points: Math.max(16, Math.round(Number(updated.activityHours || 0) * 4)),
          eventType: 'campaign_volunteer_approved',
          badgeKey: Number(updated.activityHours || 0) >= 6 ? 'field_impact_lead' : 'field_impact_supporter',
          reason: `Campaign volunteer registration approved for ${campaign.title || 'campaign'}`.trim(),
          referenceType: 'campaign_volunteer_certificate',
          referenceId: `${campaign.id}:${userId}`
        });
      } catch (rewardErr) {
        // best effort reward awarding
      }
    }

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

    try {
      await awardPoints(req.user.id, {
        points: 4,
        eventType: 'campaign_volunteer_registered',
        badgeKey: '',
        reason: `Registered as volunteer for campaign ${camp.title || 'campaign'}`.trim(),
        referenceType: 'campaign_volunteer_registration',
        referenceId: `${camp.id}:${req.user.id}`
      });
    } catch (rewardErr) {
      // best effort reward awarding
    }

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
