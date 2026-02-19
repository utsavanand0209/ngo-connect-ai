const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { query } = require('../db/postgres');
const { generateId } = require('../db/id');
const Notification = require('../models/Notification');
const Campaign = require('../models/Campaign');
const VolunteerOpportunity = require('../models/VolunteerOpportunity');
const { sendEmail } = require('../utils/mailer');
const { awardPoints, getUserGamificationSummary, getLeaderboard } = require('../utils/gamification');

const nowIso = () => new Date().toISOString();

const parseBool = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  const raw = String(value || '').trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(raw)) return false;
  return fallback;
};

const toSafeText = (value, max = 500) => String(value || '').trim().slice(0, max);
const toEmail = (value) => String(value || '').trim().toLowerCase();
const toSafeInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
};
const toPositiveInt = (value, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};
const toPositiveAmount = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed * 100) / 100;
};
const toTextArray = (value) => {
  if (Array.isArray(value)) return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

const mapDoc = (row, { idField = 'external_id', docField = 'source_doc' } = {}) => {
  const doc = row?.[docField] && typeof row[docField] === 'object' ? { ...row[docField] } : {};
  if (!doc.id) doc.id = row?.[idField];
  return doc;
};

const normalizeLimit = (value, fallback = 20, max = 200) => {
  const parsed = toPositiveInt(value, fallback);
  if (parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const normalizeCircleStatus = (value) => {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'completed' || status === 'closed') return 'completed';
  return 'active';
};

const normalizeWishlistStatus = (value) => {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'fulfilled' || status === 'completed' || status === 'closed') return 'completed';
  return 'open';
};

const ACTIVE_WISHLIST_PLEDGE_STATUSES = ['pledged', 'approved', 'received'];

const getWishlistCommittedQuantity = async (wishlistItemDbId) => {
  const {
    rows: [row]
  } = await query(
    `
    SELECT COALESCE(SUM(quantity_pledged), 0)::int AS quantity_committed
    FROM in_kind_pledges_rel
    WHERE wishlist_item_id = $1
      AND status = ANY($2::text[])
    `,
    [wishlistItemDbId, ACTIVE_WISHLIST_PLEDGE_STATUSES]
  );
  return Number(row?.quantity_committed || 0);
};

const resolveUserRow = async (externalId) => {
  const {
    rows: [row]
  } = await query(
    `
    SELECT id, external_id, source_doc
    FROM users_rel
    WHERE external_id = $1
    LIMIT 1
    `,
    [String(externalId || '').trim()]
  );
  return row || null;
};

const resolveNgoRow = async (externalId) => {
  const {
    rows: [row]
  } = await query(
    `
    SELECT id, external_id, source_doc
    FROM ngos_rel
    WHERE external_id = $1
    LIMIT 1
    `,
    [String(externalId || '').trim()]
  );
  return row || null;
};

const resolveCampaignRow = async (externalId) => {
  const {
    rows: [row]
  } = await query(
    `
    SELECT id, external_id, source_doc
    FROM campaigns_rel
    WHERE external_id = $1
    LIMIT 1
    `,
    [String(externalId || '').trim()]
  );
  return row || null;
};

const resolveDonationRow = async (externalId) => {
  const {
    rows: [row]
  } = await query(
    `
    SELECT id, external_id, source_doc
    FROM donations_rel
    WHERE external_id = $1
    LIMIT 1
    `,
    [String(externalId || '').trim()]
  );
  return row || null;
};

const ensureNgoOwner = async (ngoExternalId, userId) => {
  const ngo = await resolveNgoRow(ngoExternalId);
  if (!ngo) {
    const err = new Error('NGO not found.');
    err.status = 404;
    throw err;
  }
  if (String(ngo.external_id || '') !== String(userId || '')) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  return ngo;
};

const sendSegmentAnnouncement = async ({
  ngoId,
  ngoName,
  segmentName,
  recipientUserIds = [],
  title,
  message
}) => {
  const uniqueRecipients = [...new Set(recipientUserIds.map((entry) => String(entry || '').trim()).filter(Boolean))];
  if (uniqueRecipients.length === 0) return { delivered: 0 };

  const { rows } = await query(
    `
    SELECT external_id, source_doc
    FROM users_rel
    WHERE external_id = ANY($1::text[])
    `,
    [uniqueRecipients]
  );

  let delivered = 0;
  for (const row of rows) {
    const userDoc = mapDoc(row);
    try {
      await Notification.create({
        title,
        message,
        audience: 'users',
        recipientRole: 'user',
        recipientUserId: userDoc.id,
        ngoId,
        notificationType: 'donor_segment_message',
        meta: {
          segmentName,
          target: 'crm-segment'
        }
      });
      delivered += 1;
    } catch (err) {
      // best effort
    }

    const email = toEmail(userDoc.email);
    if (email) {
      await sendEmail({
        to: email,
        subject: `${ngoName}: ${title}`,
        text: `${message}\n\nSegment: ${segmentName}`
      });
    }
  }

  return { delivered };
};

// -----------------------------------------------------------------------------
// Giving Circles (team-based donations)
// -----------------------------------------------------------------------------

router.post('/giving-circles', auth(['user']), async (req, res) => {
  try {
    const campaignId = toSafeText(req.body?.campaignId, 80);
    const name = toSafeText(req.body?.name, 120);
    const description = toSafeText(req.body?.description, 800);
    const goalAmount = toPositiveAmount(req.body?.goalAmount, 0);
    if (!campaignId || !name || goalAmount <= 0) {
      return res.status(400).json({ message: 'campaignId, name, and goalAmount are required.' });
    }

    const [userRow, campaignRow] = await Promise.all([
      resolveUserRow(req.user.id),
      resolveCampaignRow(campaignId)
    ]);
    if (!userRow) return res.status(404).json({ message: 'User not found.' });
    if (!campaignRow) return res.status(404).json({ message: 'Campaign not found.' });

    const id = generateId();
    const now = nowIso();
    const circleDoc = {
      id,
      name,
      description,
      campaignId,
      ownerUserId: req.user.id,
      goalAmount,
      currentAmount: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };

    const { rows } = await query(
      `
      INSERT INTO giving_circles_rel (
        external_id,
        owner_user_id,
        campaign_id,
        goal_amount,
        current_amount,
        status,
        source_doc
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING id
      `,
      [id, userRow.id, campaignRow.id, goalAmount, 0, 'active', JSON.stringify(circleDoc)]
    );

    const membershipDoc = {
      id: generateId(),
      circleId: id,
      userId: req.user.id,
      role: 'owner',
      createdAt: now,
      updatedAt: now
    };
    await query(
      `
      INSERT INTO circle_members_rel (
        external_id,
        circle_id,
        user_id,
        member_role,
        source_doc
      ) VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [membershipDoc.id, rows[0].id, userRow.id, 'owner', JSON.stringify(membershipDoc)]
    );

    await awardPoints(req.user.id, {
      points: 12,
      eventType: 'giving_circle_created',
      badgeKey: 'circle_starter',
      reason: `Created giving circle: ${name}`,
      referenceType: 'giving_circle',
      referenceId: id
    });

    return res.status(201).json(circleDoc);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/giving-circles', auth(['user', 'ngo', 'admin']), async (req, res) => {
  try {
    const limit = normalizeLimit(req.query.limit, 40, 200);
    const campaignId = toSafeText(req.query.campaignId, 80);
    const statuses = toTextArray(req.query.statuses);
    const filters = [];
    const params = [];

    if (campaignId) {
      params.push(campaignId);
      filters.push(`gc.source_doc->>'campaignId' = $${params.length}`);
    }
    if (statuses.length > 0) {
      params.push(statuses.map((entry) => entry.toLowerCase()));
      filters.push(`LOWER(gc.status) = ANY($${params.length}::text[])`);
    }

    params.push(limit);
    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await query(
      `
      SELECT
        gc.external_id,
        gc.source_doc,
        gc.status,
        gc.goal_amount,
        gc.current_amount,
        gc.created_at,
        COALESCE(COUNT(cm.id), 0)::int AS member_count
      FROM giving_circles_rel gc
      LEFT JOIN circle_members_rel cm ON cm.circle_id = gc.id
      ${where}
      GROUP BY gc.id
      ORDER BY gc.created_at DESC
      LIMIT $${params.length}
      `,
      params
    );

    const circles = rows.map((row) => {
      const doc = mapDoc(row);
      const baseStatus = normalizeCircleStatus(row.status || doc.status || 'active');
      doc.goalAmount = Number(row.goal_amount || doc.goalAmount || 0);
      doc.currentAmount = Number(row.current_amount || doc.currentAmount || 0);
      doc.remainingAmount = Math.max(doc.goalAmount - doc.currentAmount, 0);
      doc.needCompleted = doc.goalAmount > 0 && doc.remainingAmount <= 0;
      doc.status = doc.needCompleted ? 'completed' : baseStatus;
      doc.memberCount = Number(row.member_count || 0);
      doc.progress = doc.goalAmount > 0 ? Number((doc.currentAmount / doc.goalAmount).toFixed(3)) : 0;
      if (doc.progress > 1) doc.progress = 1;
      doc.createdAt = doc.createdAt || row.created_at;
      return doc;
    });

    return res.json(circles);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/giving-circles/:id', auth(['user', 'ngo', 'admin']), async (req, res) => {
  try {
    const circleId = toSafeText(req.params.id, 80);
    const {
      rows: [circleRow]
    } = await query(
      `
      SELECT gc.id, gc.external_id, gc.source_doc, gc.status, gc.goal_amount, gc.current_amount
      FROM giving_circles_rel gc
      WHERE gc.external_id = $1
      LIMIT 1
      `,
      [circleId]
    );
    if (!circleRow) return res.status(404).json({ message: 'Giving circle not found.' });

    const [membersRes, contributionsRes] = await Promise.all([
      query(
        `
        SELECT cm.source_doc, u.source_doc AS user_doc
        FROM circle_members_rel cm
        LEFT JOIN users_rel u ON u.id = cm.user_id
        WHERE cm.circle_id = $1
        ORDER BY cm.created_at ASC
        `,
        [circleRow.id]
      ),
      query(
        `
        SELECT cc.source_doc, u.source_doc AS user_doc
        FROM circle_contributions_rel cc
        LEFT JOIN users_rel u ON u.id = cc.user_id
        WHERE cc.circle_id = $1
        ORDER BY cc.created_at DESC
        LIMIT 200
        `,
        [circleRow.id]
      )
    ]);

    const circle = mapDoc(circleRow);
    const baseStatus = normalizeCircleStatus(circleRow.status || circle.status || 'active');
    circle.goalAmount = Number(circleRow.goal_amount || circle.goalAmount || 0);
    circle.currentAmount = Number(circleRow.current_amount || circle.currentAmount || 0);
    circle.remainingAmount = Math.max(circle.goalAmount - circle.currentAmount, 0);
    circle.needCompleted = circle.goalAmount > 0 && circle.remainingAmount <= 0;
    circle.status = circle.needCompleted ? 'completed' : baseStatus;
    circle.progress = circle.goalAmount > 0 ? Number((circle.currentAmount / circle.goalAmount).toFixed(3)) : 0;
    if (circle.progress > 1) circle.progress = 1;
    circle.members = membersRes.rows.map((row) => {
      const member = mapDoc(row, { idField: 'external_id', docField: 'source_doc' });
      const userDoc = row.user_doc && typeof row.user_doc === 'object' ? row.user_doc : {};
      return {
        ...member,
        user: {
          id: userDoc.id || member.userId,
          name: userDoc.name || 'User',
          email: userDoc.email || ''
        }
      };
    });
    circle.contributions = contributionsRes.rows.map((row) => {
      const contribution = mapDoc(row, { idField: 'external_id', docField: 'source_doc' });
      const userDoc = row.user_doc && typeof row.user_doc === 'object' ? row.user_doc : {};
      return {
        ...contribution,
        amount: Number(contribution.amount || 0),
        contributor: {
          id: userDoc.id || contribution.userId,
          name: userDoc.name || 'Contributor'
        }
      };
    });

    return res.json(circle);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/giving-circles/:id/join', auth(['user']), async (req, res) => {
  try {
    const circleId = toSafeText(req.params.id, 80);
    const [userRow, circleRes] = await Promise.all([
      resolveUserRow(req.user.id),
      query(
        `
        SELECT id, external_id, source_doc
        FROM giving_circles_rel
        WHERE external_id = $1
        LIMIT 1
        `,
        [circleId]
      )
    ]);
    if (!userRow) return res.status(404).json({ message: 'User not found.' });
    const circleRow = circleRes.rows[0];
    if (!circleRow) return res.status(404).json({ message: 'Giving circle not found.' });

    const {
      rows: [existing]
    } = await query(
      `
      SELECT id
      FROM circle_members_rel
      WHERE circle_id = $1 AND user_id = $2
      LIMIT 1
      `,
      [circleRow.id, userRow.id]
    );
    if (existing) {
      return res.json({ message: 'Already a member of this giving circle.' });
    }

    const membershipDoc = {
      id: generateId(),
      circleId: circleId,
      userId: req.user.id,
      role: 'member',
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await query(
      `
      INSERT INTO circle_members_rel (
        external_id,
        circle_id,
        user_id,
        member_role,
        source_doc
      ) VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [membershipDoc.id, circleRow.id, userRow.id, 'member', JSON.stringify(membershipDoc)]
    );

    return res.status(201).json({ message: 'Joined giving circle successfully.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/giving-circles/:id/contribute', auth(['user']), async (req, res) => {
  try {
    const circleId = toSafeText(req.params.id, 80);
    const amount = toPositiveAmount(req.body?.amount, 0);
    const note = toSafeText(req.body?.note, 280);
    const paymentMethodRaw = toSafeText(req.body?.paymentMethod, 40).toLowerCase();
    const paymentMethod = ['upi', 'card', 'netbanking'].includes(paymentMethodRaw) ? paymentMethodRaw : '';
    const paymentMetaPayload = req.body?.paymentMeta && typeof req.body.paymentMeta === 'object'
      ? req.body.paymentMeta
      : {};
    const paymentMeta = {};
    const donationId = toSafeText(paymentMetaPayload?.donationId, 120);
    const gatewayOrderId = toSafeText(paymentMetaPayload?.gatewayOrderId, 160);
    const gatewayPaymentId = toSafeText(paymentMetaPayload?.gatewayPaymentId, 160);
    if (donationId) paymentMeta.donationId = donationId;
    if (gatewayOrderId) paymentMeta.gatewayOrderId = gatewayOrderId;
    if (gatewayPaymentId) paymentMeta.gatewayPaymentId = gatewayPaymentId;
    if (amount <= 0) return res.status(400).json({ message: 'Valid contribution amount is required.' });

    const [userRow, circleRes] = await Promise.all([
      resolveUserRow(req.user.id),
      query(
        `
        SELECT id, external_id, source_doc, current_amount, goal_amount, status
        FROM giving_circles_rel
        WHERE external_id = $1
        LIMIT 1
        `,
        [circleId]
      )
    ]);
    const circleRow = circleRes.rows[0];
    if (!userRow) return res.status(404).json({ message: 'User not found.' });
    if (!circleRow) return res.status(404).json({ message: 'Giving circle not found.' });
    const currentAmount = Number(circleRow.current_amount || 0);
    const goalAmount = Number(circleRow.goal_amount || 0);
    const remainingAmount = Math.max(goalAmount - currentAmount, 0);
    const normalizedCircleStatus = normalizeCircleStatus(circleRow.status || circleRow.source_doc?.status || 'active');

    if (normalizedCircleStatus === 'completed' || (goalAmount > 0 && remainingAmount <= 0)) {
      return res.status(400).json({ message: 'This giving circle need is already completed.' });
    }
    if (goalAmount > 0 && amount > remainingAmount) {
      return res.status(400).json({
        message: `Only Rs ${remainingAmount.toLocaleString('en-IN')} is remaining for this giving circle.`
      });
    }

    const contributionId = generateId();
    const contributionDoc = {
      id: contributionId,
      circleId,
      userId: req.user.id,
      amount,
      note,
      paymentMethod: paymentMethod || null,
      paymentMeta,
      status: 'completed',
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await query(
      `
      INSERT INTO circle_contributions_rel (
        external_id,
        circle_id,
        user_id,
        amount,
        contribution_status,
        source_doc
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [contributionId, circleRow.id, userRow.id, amount, 'completed', JSON.stringify(contributionDoc)]
    );

    const existingDoc = circleRow.source_doc && typeof circleRow.source_doc === 'object' ? { ...circleRow.source_doc } : {};
    const updatedCurrent = currentAmount + amount;
    const updatedRemaining = Math.max(goalAmount - updatedCurrent, 0);
    const completed = goalAmount > 0 && updatedRemaining <= 0;
    const updatedStatus = completed ? 'completed' : normalizedCircleStatus;
    const updatedDoc = {
      ...existingDoc,
      currentAmount: updatedCurrent,
      remainingAmount: updatedRemaining,
      status: updatedStatus,
      needCompleted: completed,
      updatedAt: nowIso()
    };
    await query(
      `
      UPDATE giving_circles_rel
      SET current_amount = $2,
          status = $3,
          updated_at = NOW(),
          source_doc = $4::jsonb
      WHERE id = $1
      `,
      [circleRow.id, updatedCurrent, updatedStatus, JSON.stringify(updatedDoc)]
    );

    await awardPoints(req.user.id, {
      points: Math.max(20, Math.round(amount / 250)),
      eventType: 'giving_circle_contribution',
      badgeKey: amount >= 1000 ? 'circle_champion' : '',
      reason: `Contributed to giving circle ${circleId}`,
      referenceType: 'giving_circle',
      referenceId: circleId
    });

    return res.status(201).json({
      message: 'Contribution recorded.',
      contribution: contributionDoc,
      circle: {
        id: circleId,
        currentAmount: updatedCurrent,
        goalAmount: goalAmount,
        remainingAmount: updatedRemaining,
        status: updatedStatus,
        needCompleted: completed
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// -----------------------------------------------------------------------------
// In-kind wishlists and pledges
// -----------------------------------------------------------------------------

router.post('/wishlists/items', auth(['ngo']), async (req, res) => {
  try {
    const ngoRow = await ensureNgoOwner(req.user.id, req.user.id);
    const campaignId = toSafeText(req.body?.campaignId, 80);
    const itemName = toSafeText(req.body?.itemName, 120);
    const description = toSafeText(req.body?.description, 600);
    const unit = toSafeText(req.body?.unit, 40) || 'units';
    const quantityNeeded = toPositiveInt(req.body?.quantityNeeded, 1);
    const priority = toSafeText(req.body?.priority, 20).toLowerCase() || 'medium';
    const emergency = parseBool(req.body?.emergency, false);
    if (!itemName) return res.status(400).json({ message: 'itemName is required.' });

    let campaignDbId = null;
    if (campaignId) {
      const campaign = await resolveCampaignRow(campaignId);
      if (campaign) campaignDbId = campaign.id;
    }

    const id = generateId();
    const doc = {
      id,
      ngoId: req.user.id,
      campaignId: campaignId || null,
      itemName,
      description,
      unit,
      quantityNeeded,
      quantityFulfilled: 0,
      priority,
      emergency,
      status: 'open',
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    await query(
      `
      INSERT INTO wishlist_items_rel (
        external_id,
        ngo_id,
        campaign_id,
        item_name,
        quantity_needed,
        quantity_fulfilled,
        priority,
        emergency,
        status,
        source_doc
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb
      )
      `,
      [id, ngoRow.id, campaignDbId, itemName, quantityNeeded, 0, priority, emergency, 'open', JSON.stringify(doc)]
    );

    return res.status(201).json(doc);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

router.get('/wishlists/items', async (req, res) => {
  try {
    const ngoId = toSafeText(req.query.ngoId, 80);
    const campaignId = toSafeText(req.query.campaignId, 80);
    const emergencyOnly = parseBool(req.query.emergency, false);
    const limit = normalizeLimit(req.query.limit, 100, 500);

    const filters = ['1=1'];
    const params = [];
    if (ngoId) {
      params.push(ngoId);
      filters.push(`wi.source_doc->>'ngoId' = $${params.length}`);
    }
    if (campaignId) {
      params.push(campaignId);
      filters.push(`wi.source_doc->>'campaignId' = $${params.length}`);
    }
    if (emergencyOnly) {
      filters.push(`wi.emergency = true`);
    }
    params.push(limit);
    const { rows } = await query(
      `
      SELECT
        wi.external_id,
        wi.source_doc,
        wi.quantity_needed,
        wi.quantity_fulfilled,
        COALESCE(pledges.quantity_committed, 0)::int AS quantity_committed,
        wi.priority,
        wi.emergency,
        wi.status,
        wi.created_at,
        ngo.source_doc AS ngo_doc
      FROM wishlist_items_rel wi
      LEFT JOIN (
        SELECT wishlist_item_id, COALESCE(SUM(quantity_pledged), 0)::int AS quantity_committed
        FROM in_kind_pledges_rel
        WHERE status IN ('pledged', 'approved', 'received')
        GROUP BY wishlist_item_id
      ) pledges ON pledges.wishlist_item_id = wi.id
      LEFT JOIN ngos_rel ngo ON ngo.id = wi.ngo_id
      WHERE ${filters.join(' AND ')}
      ORDER BY wi.emergency DESC, wi.created_at DESC
      LIMIT $${params.length}
      `,
      params
    );

    const items = rows.map((row) => {
      const doc = mapDoc(row);
      doc.quantityNeeded = Number(row.quantity_needed || doc.quantityNeeded || 0);
      doc.quantityFulfilled = Number(row.quantity_fulfilled || doc.quantityFulfilled || 0);
      doc.quantityCommitted = Math.max(
        Number(row.quantity_committed || 0),
        Number(doc.quantityCommitted || 0),
        doc.quantityFulfilled
      );
      doc.quantityRemaining = Math.max(doc.quantityNeeded - doc.quantityCommitted, 0);
      doc.priority = row.priority || doc.priority || 'medium';
      doc.emergency = Boolean(row.emergency ?? doc.emergency);
      doc.needCompleted = doc.quantityRemaining <= 0;
      doc.status = doc.needCompleted ? 'completed' : 'open';
      doc.createdAt = doc.createdAt || row.created_at;
      const ngoDoc = row.ngo_doc && typeof row.ngo_doc === 'object' ? row.ngo_doc : {};
      doc.ngo = {
        id: ngoDoc.id || doc.ngoId || '',
        name: ngoDoc.name || 'NGO',
        verified: Boolean(ngoDoc.verified)
      };
      return doc;
    });

    return res.json(items);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/wishlists/ngo', auth(['ngo']), async (req, res) => {
  try {
    const ngoId = req.user.id;
    const ngoRow = await resolveNgoRow(ngoId);
    if (!ngoRow) return res.status(404).json({ message: 'NGO not found.' });

    const [itemsRes, pledgesRes] = await Promise.all([
      query(
        `
        SELECT
          wi.id,
          wi.external_id,
          wi.source_doc,
          wi.quantity_needed,
          wi.quantity_fulfilled,
          COALESCE(pledges.quantity_committed, 0)::int AS quantity_committed,
          wi.priority,
          wi.emergency,
          wi.status,
          wi.created_at
        FROM wishlist_items_rel wi
        LEFT JOIN (
          SELECT wishlist_item_id, COALESCE(SUM(quantity_pledged), 0)::int AS quantity_committed
          FROM in_kind_pledges_rel
          WHERE status IN ('pledged', 'approved', 'received')
          GROUP BY wishlist_item_id
        ) pledges ON pledges.wishlist_item_id = wi.id
        WHERE ngo_id = $1
        ORDER BY wi.created_at DESC
        `,
        [ngoRow.id]
      ),
      query(
        `
        SELECT
          p.external_id,
          p.source_doc,
          p.wishlist_item_id,
          p.status,
          p.quantity_pledged,
          p.created_at,
          u.source_doc AS user_doc
        FROM in_kind_pledges_rel p
        LEFT JOIN users_rel u ON u.id = p.user_id
        WHERE p.wishlist_item_id IN (
          SELECT id FROM wishlist_items_rel WHERE ngo_id = $1
        )
        ORDER BY p.created_at DESC
        `,
        [ngoRow.id]
      )
    ]);

    const pledgesByItem = new Map();
    pledgesRes.rows.forEach((row) => {
      const pledge = mapDoc(row);
      pledge.status = row.status || pledge.status || 'pledged';
      pledge.quantityPledged = Number(row.quantity_pledged || pledge.quantityPledged || 0);
      pledge.createdAt = pledge.createdAt || row.created_at;
      const userDoc = row.user_doc && typeof row.user_doc === 'object' ? row.user_doc : {};
      pledge.user = {
        id: userDoc.id || pledge.userId || '',
        name: userDoc.name || 'Supporter',
        email: userDoc.email || ''
      };
      const key = String(row.wishlist_item_id);
      if (!pledgesByItem.has(key)) pledgesByItem.set(key, []);
      pledgesByItem.get(key).push(pledge);
    });

    const rows = itemsRes.rows.map((row) => {
      const item = mapDoc(row);
      item.quantityNeeded = Number(row.quantity_needed || item.quantityNeeded || 0);
      item.quantityFulfilled = Number(row.quantity_fulfilled || item.quantityFulfilled || 0);
      item.quantityCommitted = Math.max(
        Number(row.quantity_committed || 0),
        Number(item.quantityCommitted || 0),
        item.quantityFulfilled
      );
      item.quantityRemaining = Math.max(item.quantityNeeded - item.quantityCommitted, 0);
      item.priority = row.priority || item.priority || 'medium';
      item.emergency = Boolean(row.emergency ?? item.emergency);
      item.needCompleted = item.quantityRemaining <= 0;
      item.status = item.needCompleted ? 'completed' : 'open';
      item.createdAt = item.createdAt || row.created_at;
      item.pledges = pledgesByItem.get(String(row.id)) || [];
      return item;
    });

    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/wishlists/items/:id/pledge', auth(['user']), async (req, res) => {
  try {
    const itemId = toSafeText(req.params.id, 80);
    const quantityPledged = toPositiveInt(req.body?.quantityPledged, 1);
    const note = toSafeText(req.body?.note, 400);
    const userRow = await resolveUserRow(req.user.id);
    if (!userRow) return res.status(404).json({ message: 'User not found.' });

    const {
      rows: [itemRow]
    } = await query(
      `
      SELECT id, external_id, source_doc, quantity_needed, quantity_fulfilled, status
      FROM wishlist_items_rel
      WHERE external_id = $1
      LIMIT 1
      `,
      [itemId]
    );
    if (!itemRow) return res.status(404).json({ message: 'Wishlist item not found.' });
    const itemDoc = itemRow.source_doc && typeof itemRow.source_doc === 'object' ? { ...itemRow.source_doc } : {};
    const normalizedItemStatus = normalizeWishlistStatus(itemRow.status || itemDoc.status || 'open');
    if (normalizedItemStatus !== 'open') {
      return res.status(400).json({ message: 'Wishlist item is not open for pledges.' });
    }

    const quantityNeeded = Number(itemRow.quantity_needed || itemDoc.quantityNeeded || 0);
    const quantityFulfilled = Number(itemRow.quantity_fulfilled || itemDoc.quantityFulfilled || 0);
    const quantityCommittedBefore = Math.max(await getWishlistCommittedQuantity(itemRow.id), quantityFulfilled);
    const quantityRemainingBefore = Math.max(quantityNeeded - quantityCommittedBefore, 0);

    if (quantityRemainingBefore <= 0) {
      const completedDoc = {
        ...itemDoc,
        quantityNeeded,
        quantityFulfilled,
        quantityCommitted: quantityCommittedBefore,
        quantityRemaining: 0,
        needCompleted: true,
        status: 'completed',
        updatedAt: nowIso()
      };
      await query(
        `
        UPDATE wishlist_items_rel
        SET status = 'completed',
            updated_at = NOW(),
            source_doc = $2::jsonb
        WHERE id = $1
        `,
        [itemRow.id, JSON.stringify(completedDoc)]
      );
      return res.status(400).json({ message: 'This wishlist need is already completed.' });
    }

    if (quantityPledged > quantityRemainingBefore) {
      return res.status(400).json({
        message: `Only ${quantityRemainingBefore} quantity is remaining for this wishlist item.`
      });
    }

    const pledgeId = generateId();
    const pledgeDoc = {
      id: pledgeId,
      wishlistItemId: itemId,
      userId: req.user.id,
      quantityPledged,
      note,
      status: 'pledged',
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await query(
      `
      INSERT INTO in_kind_pledges_rel (
        external_id,
        wishlist_item_id,
        user_id,
        quantity_pledged,
        status,
        source_doc
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [pledgeId, itemRow.id, userRow.id, quantityPledged, 'pledged', JSON.stringify(pledgeDoc)]
    );

    const quantityCommittedAfter = quantityCommittedBefore + quantityPledged;
    const quantityRemainingAfter = Math.max(quantityNeeded - quantityCommittedAfter, 0);
    const itemCompleted = quantityRemainingAfter <= 0;
    const updatedItemDoc = {
      ...itemDoc,
      quantityNeeded,
      quantityFulfilled,
      quantityCommitted: quantityCommittedAfter,
      quantityRemaining: quantityRemainingAfter,
      needCompleted: itemCompleted,
      status: itemCompleted ? 'completed' : 'open',
      updatedAt: nowIso()
    };
    await query(
      `
      UPDATE wishlist_items_rel
      SET status = $2,
          updated_at = NOW(),
          source_doc = $3::jsonb
      WHERE id = $1
      `,
      [itemRow.id, itemCompleted ? 'completed' : 'open', JSON.stringify(updatedItemDoc)]
    );

    await awardPoints(req.user.id, {
      points: 10,
      eventType: 'in_kind_pledged',
      badgeKey: 'kindness_starter',
      reason: `Pledged in-kind donation for wishlist item ${itemId}`,
      referenceType: 'wishlist_item',
      referenceId: itemId
    });

    return res.status(201).json({
      ...pledgeDoc,
      item: {
        id: itemId,
        quantityNeeded,
        quantityFulfilled,
        quantityCommitted: quantityCommittedAfter,
        quantityRemaining: quantityRemainingAfter,
        status: itemCompleted ? 'completed' : 'open',
        needCompleted: itemCompleted
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/wishlists/pledges/:id/status', auth(['ngo']), async (req, res) => {
  try {
    const pledgeId = toSafeText(req.params.id, 80);
    const status = toSafeText(req.body?.status, 30).toLowerCase();
    if (!['approved', 'received', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved, received, or rejected.' });
    }

    const ngoRow = await ensureNgoOwner(req.user.id, req.user.id);
    const {
      rows: [pledgeRow]
    } = await query(
      `
      SELECT
        p.id,
        p.external_id,
        p.wishlist_item_id,
        p.user_id,
        p.status AS pledge_status,
        p.quantity_pledged,
        p.source_doc,
        wi.id AS item_id,
        wi.ngo_id,
        wi.quantity_needed,
        wi.quantity_fulfilled,
        wi.status AS item_status,
        wi.source_doc AS item_doc
      FROM in_kind_pledges_rel p
      LEFT JOIN wishlist_items_rel wi ON wi.id = p.wishlist_item_id
      WHERE p.external_id = $1
      LIMIT 1
      `,
      [pledgeId]
    );
    if (!pledgeRow) return res.status(404).json({ message: 'Pledge not found.' });
    if (Number(pledgeRow.ngo_id || 0) !== Number(ngoRow.id || 0)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const pledgeDoc = pledgeRow.source_doc && typeof pledgeRow.source_doc === 'object' ? { ...pledgeRow.source_doc } : {};
    const previousStatus = String(pledgeRow.pledge_status || pledgeDoc.status || 'pledged').toLowerCase();
    pledgeDoc.status = status;
    pledgeDoc.updatedAt = nowIso();
    await query(
      `
      UPDATE in_kind_pledges_rel
      SET status = $2,
          updated_at = NOW(),
          source_doc = $3::jsonb
      WHERE id = $1
      `,
      [pledgeRow.id, status, JSON.stringify(pledgeDoc)]
    );

    const quantityPledged = Number(pledgeRow.quantity_pledged || 0);
    let quantityFulfilled = Number(pledgeRow.quantity_fulfilled || 0);
    if (previousStatus !== 'received' && status === 'received') {
      quantityFulfilled += quantityPledged;
    } else if (previousStatus === 'received' && status !== 'received') {
      quantityFulfilled = Math.max(0, quantityFulfilled - quantityPledged);
    }

    const quantityCommitted = Math.max(await getWishlistCommittedQuantity(pledgeRow.item_id), quantityFulfilled);
    const quantityNeeded = Number(pledgeRow.quantity_needed || 0);
    const quantityRemaining = Math.max(quantityNeeded - quantityCommitted, 0);
    const itemCompleted = quantityRemaining <= 0;
    const itemDoc = pledgeRow.item_doc && typeof pledgeRow.item_doc === 'object' ? { ...pledgeRow.item_doc } : {};
    itemDoc.quantityFulfilled = quantityFulfilled;
    itemDoc.quantityCommitted = quantityCommitted;
    itemDoc.quantityRemaining = quantityRemaining;
    itemDoc.needCompleted = itemCompleted;
    itemDoc.status = itemCompleted ? 'completed' : 'open';
    itemDoc.updatedAt = nowIso();
    await query(
      `
      UPDATE wishlist_items_rel
      SET quantity_fulfilled = $2,
          status = $3,
          updated_at = NOW(),
          source_doc = $4::jsonb
      WHERE id = $1
      `,
      [pledgeRow.item_id, quantityFulfilled, itemCompleted ? 'completed' : 'open', JSON.stringify(itemDoc)]
    );

    if (status === 'received' && previousStatus !== 'received' && pledgeRow.user_id) {
      const {
        rows: [donorRow]
      } = await query(`SELECT external_id FROM users_rel WHERE id = $1 LIMIT 1`, [pledgeRow.user_id]);
      if (donorRow?.external_id) {
        await awardPoints(donorRow.external_id, {
          points: 25,
          eventType: 'in_kind_received',
          badgeKey: 'kindness_hero',
          reason: `In-kind pledge marked as received (${pledgeId})`,
          referenceType: 'in_kind_pledge',
          referenceId: pledgeId
        });
      }
    }

    return res.json({
      message: 'Pledge status updated.',
      pledge: pledgeDoc,
      item: {
        id: String(itemDoc.id || pledgeDoc.wishlistItemId || ''),
        quantityNeeded,
        quantityFulfilled,
        quantityCommitted,
        quantityRemaining,
        status: itemCompleted ? 'completed' : 'open',
        needCompleted: itemCompleted
      }
    });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

// -----------------------------------------------------------------------------
// Volunteer management suite (shifts, reminders, logs, exports)
// -----------------------------------------------------------------------------

router.post('/volunteer/shifts', auth(['ngo']), async (req, res) => {
  try {
    const ngoRow = await ensureNgoOwner(req.user.id, req.user.id);
    const title = toSafeText(req.body?.title, 140);
    const opportunityId = toSafeText(req.body?.opportunityId, 80);
    const campaignId = toSafeText(req.body?.campaignId, 80);
    const location = toSafeText(req.body?.location, 180);
    const note = toSafeText(req.body?.note, 800);
    const startAt = toSafeText(req.body?.startAt, 80);
    const endAt = toSafeText(req.body?.endAt, 80);
    const slots = toPositiveInt(req.body?.slots, 1);
    const reminderBeforeHours = Math.min(Math.max(toPositiveInt(req.body?.reminderBeforeHours, 24), 1), 168);
    const emergency = parseBool(req.body?.emergency, false);
    if (!title || !startAt || !endAt) {
      return res.status(400).json({ message: 'title, startAt, and endAt are required.' });
    }
    const startTs = Date.parse(startAt);
    const endTs = Date.parse(endAt);
    if (Number.isNaN(startTs) || Number.isNaN(endTs) || endTs <= startTs) {
      return res.status(400).json({ message: 'Invalid shift time range.' });
    }

    let opportunityDbId = null;
    if (opportunityId) {
      const {
        rows: [opRow]
      } = await query(`SELECT id FROM volunteer_opportunities_rel WHERE external_id = $1 LIMIT 1`, [opportunityId]);
      if (opRow) opportunityDbId = opRow.id;
    }
    let campaignDbId = null;
    if (campaignId) {
      const {
        rows: [campaignRow]
      } = await query(`SELECT id FROM campaigns_rel WHERE external_id = $1 LIMIT 1`, [campaignId]);
      if (campaignRow) campaignDbId = campaignRow.id;
    }

    const id = generateId();
    const doc = {
      id,
      ngoId: req.user.id,
      opportunityId: opportunityId || null,
      campaignId: campaignId || null,
      title,
      location,
      note,
      startAt: new Date(startTs).toISOString(),
      endAt: new Date(endTs).toISOString(),
      slots,
      reminderBeforeHours,
      emergency,
      status: 'scheduled',
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    await query(
      `
      INSERT INTO volunteer_shifts_rel (
        external_id,
        ngo_id,
        opportunity_id,
        campaign_id,
        title,
        start_at,
        end_at,
        slots,
        reminder_before_hours,
        emergency,
        status,
        source_doc
      ) VALUES (
        $1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, $9, $10, $11, $12::jsonb
      )
      `,
      [
        id,
        ngoRow.id,
        opportunityDbId,
        campaignDbId,
        title,
        doc.startAt,
        doc.endAt,
        slots,
        reminderBeforeHours,
        emergency,
        'scheduled',
        JSON.stringify(doc)
      ]
    );

    return res.status(201).json(doc);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

router.get('/volunteer/shifts', auth(['user', 'ngo', 'admin']), async (req, res) => {
  try {
    const role = req.user.role;
    const limit = normalizeLimit(req.query.limit, 100, 400);
    const upcomingOnly = parseBool(req.query.upcoming, true);
    const emergencyOnly = parseBool(req.query.emergency, false);
    const filters = ['1=1'];
    const params = [];

    if (role === 'ngo') {
      params.push(req.user.id);
      filters.push(`vs.source_doc->>'ngoId' = $${params.length}`);
    }
    if (upcomingOnly) {
      filters.push(`vs.start_at >= NOW() - INTERVAL '2 hours'`);
    }
    if (emergencyOnly) {
      filters.push(`vs.emergency = true`);
    }
    params.push(limit);
    const { rows } = await query(
      `
      SELECT
        vs.id,
        vs.external_id,
        vs.source_doc,
        vs.start_at,
        vs.end_at,
        vs.slots,
        vs.emergency,
        vs.status,
        COALESCE(COUNT(ss.id), 0)::int AS signup_count
      FROM volunteer_shifts_rel vs
      LEFT JOIN volunteer_shift_signups_rel ss ON ss.shift_id = vs.id
      WHERE ${filters.join(' AND ')}
      GROUP BY vs.id
      ORDER BY vs.start_at ASC
      LIMIT $${params.length}
      `,
      params
    );

    const shifts = rows.map((row) => {
      const doc = mapDoc(row);
      doc.startAt = doc.startAt || (row.start_at ? new Date(row.start_at).toISOString() : null);
      doc.endAt = doc.endAt || (row.end_at ? new Date(row.end_at).toISOString() : null);
      doc.slots = Number(row.slots || doc.slots || 0);
      doc.signupCount = Number(row.signup_count || 0);
      doc.remainingSlots = Math.max(doc.slots - doc.signupCount, 0);
      doc.emergency = Boolean(row.emergency ?? doc.emergency);
      doc.status = row.status || doc.status || 'scheduled';
      return doc;
    });

    return res.json(shifts);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/volunteer/shifts/my', auth(['user']), async (req, res) => {
  try {
    const { rows } = await query(
      `
      SELECT
        ss.external_id,
        ss.source_doc,
        ss.status,
        ss.reminder_sent_at,
        ss.created_at,
        vs.source_doc AS shift_doc,
        ngo.source_doc AS ngo_doc
      FROM volunteer_shift_signups_rel ss
      LEFT JOIN volunteer_shifts_rel vs ON vs.id = ss.shift_id
      LEFT JOIN ngos_rel ngo ON ngo.id = vs.ngo_id
      WHERE ss.user_id = (
        SELECT id FROM users_rel WHERE external_id = $1
      )
      ORDER BY ss.created_at DESC
      `,
      [req.user.id]
    );
    const list = rows.map((row) => {
      const signup = mapDoc(row);
      signup.status = row.status || signup.status || 'signed_up';
      signup.reminderSentAt = signup.reminderSentAt || row.reminder_sent_at || null;
      signup.createdAt = signup.createdAt || row.created_at || null;
      signup.shift = row.shift_doc && typeof row.shift_doc === 'object' ? row.shift_doc : null;
      const ngoDoc = row.ngo_doc && typeof row.ngo_doc === 'object' ? row.ngo_doc : {};
      signup.ngo = ngoDoc.id ? { id: ngoDoc.id, name: ngoDoc.name } : null;
      return signup;
    });
    return res.json(list);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/volunteer/shifts/:id/signup', auth(['user']), async (req, res) => {
  try {
    const shiftId = toSafeText(req.params.id, 80);
    const userRow = await resolveUserRow(req.user.id);
    if (!userRow) return res.status(404).json({ message: 'User not found.' });

    const {
      rows: [shiftRow]
    } = await query(
      `
      SELECT id, external_id, source_doc, slots
      FROM volunteer_shifts_rel
      WHERE external_id = $1
      LIMIT 1
      `,
      [shiftId]
    );
    if (!shiftRow) return res.status(404).json({ message: 'Shift not found.' });

    const {
      rows: [existing]
    } = await query(
      `
      SELECT id
      FROM volunteer_shift_signups_rel
      WHERE shift_id = $1 AND user_id = $2
      LIMIT 1
      `,
      [shiftRow.id, userRow.id]
    );
    if (existing) return res.status(400).json({ message: 'You have already signed up for this shift.' });

    const {
      rows: [countRow = {}]
    } = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM volunteer_shift_signups_rel
      WHERE shift_id = $1
      `,
      [shiftRow.id]
    );
    const currentCount = Number(countRow.count || 0);
    if (currentCount >= Number(shiftRow.slots || 0)) {
      return res.status(400).json({ message: 'No slots left for this shift.' });
    }

    const signupId = generateId();
    const signupDoc = {
      id: signupId,
      shiftId,
      userId: req.user.id,
      status: 'signed_up',
      reminderSentAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await query(
      `
      INSERT INTO volunteer_shift_signups_rel (
        external_id,
        shift_id,
        user_id,
        status,
        source_doc
      ) VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [signupId, shiftRow.id, userRow.id, 'signed_up', JSON.stringify(signupDoc)]
    );

    return res.status(201).json(signupDoc);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/volunteer/shifts/reminders/run', auth(['ngo', 'admin']), async (req, res) => {
  try {
    const hoursWindow = Math.min(Math.max(toPositiveInt(req.body?.hoursWindow, 24), 1), 168);
    const filters = [
      `ss.reminder_sent_at IS NULL`,
      `ss.status IN ('signed_up', 'confirmed')`,
      `vs.start_at >= NOW()`,
      `vs.start_at <= NOW() + make_interval(hours => $1::int)`
    ];
    const params = [hoursWindow];
    if (req.user.role === 'ngo') {
      params.push(req.user.id);
      filters.push(`vs.source_doc->>'ngoId' = $${params.length}`);
    }

    const { rows } = await query(
      `
      SELECT
        ss.id AS signup_db_id,
        ss.external_id AS signup_id,
        ss.source_doc AS signup_doc,
        u.source_doc AS user_doc,
        vs.source_doc AS shift_doc
      FROM volunteer_shift_signups_rel ss
      LEFT JOIN users_rel u ON u.id = ss.user_id
      LEFT JOIN volunteer_shifts_rel vs ON vs.id = ss.shift_id
      WHERE ${filters.join(' AND ')}
      ORDER BY vs.start_at ASC
      LIMIT 200
      `,
      params
    );

    let attempted = 0;
    let sent = 0;
    for (const row of rows) {
      const userDoc = row.user_doc && typeof row.user_doc === 'object' ? row.user_doc : {};
      const shiftDoc = row.shift_doc && typeof row.shift_doc === 'object' ? row.shift_doc : {};
      const email = toEmail(userDoc.email);
      attempted += 1;

      if (email) {
        const result = await sendEmail({
          to: email,
          subject: `Reminder: Volunteer shift "${shiftDoc.title || 'Volunteer Shift'}"`,
          text: [
            `Hello ${userDoc.name || 'Volunteer'},`,
            '',
            `This is a reminder for your upcoming shift.`,
            `Shift: ${shiftDoc.title || 'Volunteer Shift'}`,
            `Start: ${shiftDoc.startAt || 'TBD'}`,
            `Location: ${shiftDoc.location || 'TBD'}`,
            '',
            `Thank you for supporting this cause.`
          ].join('\n')
        });
        if (result?.sent) sent += 1;
      }

      const signupDoc = row.signup_doc && typeof row.signup_doc === 'object' ? { ...row.signup_doc } : {};
      signupDoc.reminderSentAt = nowIso();
      signupDoc.updatedAt = nowIso();
      await query(
        `
        UPDATE volunteer_shift_signups_rel
        SET reminder_sent_at = NOW(),
            updated_at = NOW(),
            source_doc = $2::jsonb
        WHERE id = $1
        `,
        [row.signup_db_id, JSON.stringify(signupDoc)]
      );
    }

    return res.json({
      message: 'Reminder job executed.',
      attempted,
      sent
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/volunteer/logs/:signupId', auth(['user']), async (req, res) => {
  try {
    const signupId = toSafeText(req.params.signupId, 80);
    const hours = toPositiveAmount(req.body?.hours, 0);
    const summary = toSafeText(req.body?.summary, 600);
    if (hours <= 0) return res.status(400).json({ message: 'hours must be greater than 0.' });

    const userRow = await resolveUserRow(req.user.id);
    if (!userRow) return res.status(404).json({ message: 'User not found.' });

    const {
      rows: [signupRow]
    } = await query(
      `
      SELECT
        ss.id,
        ss.external_id,
        ss.user_id,
        ss.shift_id,
        vs.source_doc AS shift_doc,
        vs.ngo_id
      FROM volunteer_shift_signups_rel ss
      LEFT JOIN volunteer_shifts_rel vs ON vs.id = ss.shift_id
      WHERE ss.external_id = $1
      LIMIT 1
      `,
      [signupId]
    );
    if (!signupRow) return res.status(404).json({ message: 'Signup not found.' });
    if (Number(signupRow.user_id || 0) !== Number(userRow.id || 0)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const id = generateId();
    const shiftDoc = signupRow.shift_doc && typeof signupRow.shift_doc === 'object' ? signupRow.shift_doc : {};
    const doc = {
      id,
      signupId,
      shiftId: shiftDoc.id || null,
      userId: req.user.id,
      ngoId: shiftDoc.ngoId || null,
      hours,
      summary,
      approvalStatus: 'pending',
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    await query(
      `
      INSERT INTO volunteer_logs_rel (
        external_id,
        shift_signup_id,
        shift_id,
        user_id,
        ngo_id,
        hours,
        approval_status,
        source_doc
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb
      )
      `,
      [id, signupRow.id, signupRow.shift_id, userRow.id, signupRow.ngo_id, hours, 'pending', JSON.stringify(doc)]
    );

    return res.status(201).json(doc);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/volunteer/logs/ngo', auth(['ngo']), async (req, res) => {
  try {
    const ngoRow = await ensureNgoOwner(req.user.id, req.user.id);
    const status = toSafeText(req.query.status, 30).toLowerCase();
    const filters = ['vl.ngo_id = $1'];
    const params = [ngoRow.id];
    if (status) {
      params.push(status);
      filters.push(`LOWER(vl.approval_status) = $${params.length}`);
    }
    const { rows } = await query(
      `
      SELECT
        vl.external_id,
        vl.source_doc,
        vl.approval_status,
        vl.hours,
        vl.created_at,
        u.source_doc AS user_doc
      FROM volunteer_logs_rel vl
      LEFT JOIN users_rel u ON u.id = vl.user_id
      WHERE ${filters.join(' AND ')}
      ORDER BY vl.created_at DESC
      LIMIT 500
      `,
      params
    );
    const data = rows.map((row) => {
      const doc = mapDoc(row);
      doc.approvalStatus = row.approval_status || doc.approvalStatus || 'pending';
      doc.hours = Number(row.hours || doc.hours || 0);
      doc.createdAt = doc.createdAt || row.created_at || null;
      const userDoc = row.user_doc && typeof row.user_doc === 'object' ? row.user_doc : {};
      doc.user = userDoc.id
        ? { id: userDoc.id, name: userDoc.name, email: userDoc.email }
        : { id: doc.userId || '', name: 'User', email: '' };
      return doc;
    });
    return res.json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

router.post('/volunteer/logs/:id/approve', auth(['ngo']), async (req, res) => {
  try {
    const logId = toSafeText(req.params.id, 80);
    const decision = toSafeText(req.body?.decision, 20).toLowerCase();
    const note = toSafeText(req.body?.note, 400);
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ message: 'decision must be approve or reject.' });
    }
    const ngoRow = await ensureNgoOwner(req.user.id, req.user.id);

    const {
      rows: [logRow]
    } = await query(
      `
      SELECT
        vl.id,
        vl.external_id,
        vl.user_id,
        vl.ngo_id,
        vl.hours,
        vl.source_doc
      FROM volunteer_logs_rel vl
      WHERE vl.external_id = $1
      LIMIT 1
      `,
      [logId]
    );
    if (!logRow) return res.status(404).json({ message: 'Volunteer log not found.' });
    if (Number(logRow.ngo_id || 0) !== Number(ngoRow.id || 0)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const newStatus = decision === 'approve' ? 'approved' : 'rejected';
    const doc = logRow.source_doc && typeof logRow.source_doc === 'object' ? { ...logRow.source_doc } : {};
    doc.approvalStatus = newStatus;
    doc.reviewNote = note || '';
    doc.reviewedAt = nowIso();
    doc.updatedAt = nowIso();
    await query(
      `
      UPDATE volunteer_logs_rel
      SET approval_status = $2,
          approved_by_ngo_id = $3,
          approved_at = NOW(),
          updated_at = NOW(),
          source_doc = $4::jsonb
      WHERE id = $1
      `,
      [logRow.id, newStatus, ngoRow.id, JSON.stringify(doc)]
    );

    if (newStatus === 'approved' && logRow.user_id) {
      const {
        rows: [userRow]
      } = await query(`SELECT external_id FROM users_rel WHERE id = $1 LIMIT 1`, [logRow.user_id]);
      if (userRow?.external_id) {
        await awardPoints(userRow.external_id, {
          points: Math.max(20, Math.round(Number(logRow.hours || 0) * 5)),
          eventType: 'volunteer_hours_approved',
          badgeKey: Number(logRow.hours || 0) >= 8 ? 'service_marathoner' : 'service_starter',
          reason: `Volunteer hours approved (${Number(logRow.hours || 0)}h)`,
          referenceType: 'volunteer_log',
          referenceId: logId
        });
      }
    }

    return res.json({ message: `Volunteer log ${newStatus}.`, log: doc });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

router.get('/volunteer/logs/ngo/export', auth(['ngo']), async (req, res) => {
  try {
    const ngoRow = await ensureNgoOwner(req.user.id, req.user.id);
    const { rows } = await query(
      `
      SELECT
        vl.external_id,
        vl.hours,
        vl.approval_status,
        vl.created_at,
        vl.source_doc,
        u.source_doc AS user_doc
      FROM volunteer_logs_rel vl
      LEFT JOIN users_rel u ON u.id = vl.user_id
      WHERE vl.ngo_id = $1
      ORDER BY vl.created_at DESC
      LIMIT 2000
      `,
      [ngoRow.id]
    );
    const headers = ['logId', 'userId', 'userName', 'hours', 'approvalStatus', 'summary', 'createdAt', 'reviewedAt'];
    const csvRows = [headers.join(',')];
    rows.forEach((row) => {
      const doc = row.source_doc && typeof row.source_doc === 'object' ? row.source_doc : {};
      const userDoc = row.user_doc && typeof row.user_doc === 'object' ? row.user_doc : {};
      const values = [
        row.external_id,
        userDoc.id || doc.userId || '',
        (userDoc.name || '').replace(/,/g, ' '),
        Number(row.hours || 0),
        row.approval_status || '',
        String(doc.summary || '').replace(/,/g, ' '),
        doc.createdAt || row.created_at || '',
        doc.reviewedAt || ''
      ];
      csvRows.push(values.join(','));
    });
    const filename = `volunteer_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=\"${filename}\"`);
    return res.send(csvRows.join('\n'));
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

// -----------------------------------------------------------------------------
// Donor Relationship Management (CRM-lite)
// -----------------------------------------------------------------------------

router.get('/crm/donors', auth(['ngo']), async (req, res) => {
  try {
    const ngoId = req.user.id;
    const limit = normalizeLimit(req.query.limit, 500, 2000);
    const { rows } = await query(
      `
      SELECT
        refs.user_ref AS donor_user_id,
        MAX(d.created_at) AS latest_donation_at,
        COUNT(*)::int AS donation_count,
        COALESCE(SUM(COALESCE(safe_numeric(d.source_doc->>'amount'), 0)), 0) AS total_amount,
        MAX(COALESCE(NULLIF(d.source_doc->>'donorName', ''), u.source_doc->>'name')) AS donor_name,
        MAX(COALESCE(NULLIF(LOWER(d.source_doc->>'donorEmail'), ''), LOWER(u.source_doc->>'email'))) AS donor_email
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
          END AS ngo_ref
      ) refs
      LEFT JOIN users_rel u ON u.external_id = refs.user_ref
      WHERE refs.ngo_ref = $1
        AND refs.user_ref IS NOT NULL
        AND COALESCE(NULLIF(d.source_doc->>'status', ''), 'pending') = 'completed'
      GROUP BY refs.user_ref
      ORDER BY MAX(d.created_at) DESC
      LIMIT $2
      `,
      [ngoId, limit]
    );

    return res.json(rows.map((row) => ({
      donorUserId: row.donor_user_id,
      donorName: row.donor_name || 'Donor',
      donorEmail: row.donor_email || '',
      donationCount: Number(row.donation_count || 0),
      totalAmount: Number(row.total_amount || 0),
      latestDonationAt: row.latest_donation_at
    })));
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/crm/donors/:donorUserId/notes', auth(['ngo']), async (req, res) => {
  try {
    const ngoRow = await ensureNgoOwner(req.user.id, req.user.id);
    const donorUserId = toSafeText(req.params.donorUserId, 80);
    const noteText = toSafeText(req.body?.noteText, 1200);
    if (!donorUserId || noteText.length < 3) {
      return res.status(400).json({ message: 'donorUserId and noteText are required.' });
    }
    const donorRow = await resolveUserRow(donorUserId);
    if (!donorRow) return res.status(404).json({ message: 'Donor not found.' });

    const doc = {
      id: generateId(),
      ngoId: req.user.id,
      donorUserId,
      noteText,
      createdByNgoId: req.user.id,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await query(
      `
      INSERT INTO donor_notes_rel (
        external_id,
        ngo_id,
        donor_user_id,
        note_text,
        created_by_ngo_id,
        source_doc
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [doc.id, ngoRow.id, donorRow.id, noteText, ngoRow.id, JSON.stringify(doc)]
    );

    return res.status(201).json(doc);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

router.get('/crm/donors/:donorUserId/notes', auth(['ngo']), async (req, res) => {
  try {
    const ngoRow = await ensureNgoOwner(req.user.id, req.user.id);
    const donorUserId = toSafeText(req.params.donorUserId, 80);
    const donorRow = await resolveUserRow(donorUserId);
    if (!donorRow) return res.status(404).json({ message: 'Donor not found.' });

    const { rows } = await query(
      `
      SELECT source_doc
      FROM donor_notes_rel
      WHERE ngo_id = $1 AND donor_user_id = $2
      ORDER BY created_at DESC
      LIMIT 200
      `,
      [ngoRow.id, donorRow.id]
    );
    return res.json(rows.map((row) => (row.source_doc && typeof row.source_doc === 'object' ? row.source_doc : {})));
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

router.post('/crm/segments', auth(['ngo']), async (req, res) => {
  try {
    const ngoRow = await ensureNgoOwner(req.user.id, req.user.id);
    const segmentName = toSafeText(req.body?.segmentName, 100);
    const segmentDescription = toSafeText(req.body?.segmentDescription, 500);
    const donorUserIds = toTextArray(req.body?.donorUserIds);
    if (!segmentName) return res.status(400).json({ message: 'segmentName is required.' });

    const doc = {
      id: generateId(),
      ngoId: req.user.id,
      segmentName,
      segmentDescription,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    const {
      rows: [segmentRow]
    } = await query(
      `
      INSERT INTO donor_segments_rel (
        external_id,
        ngo_id,
        segment_name,
        segment_description,
        source_doc
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id
      `,
      [doc.id, ngoRow.id, segmentName, segmentDescription || null, JSON.stringify(doc)]
    );

    if (donorUserIds.length > 0) {
      const donorRows = await query(`SELECT id, external_id FROM users_rel WHERE external_id = ANY($1::text[])`, [donorUserIds]);
      for (const donorRow of donorRows.rows) {
        const memberDoc = {
          id: generateId(),
          segmentId: doc.id,
          donorUserId: donorRow.external_id,
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        await query(
          `
          INSERT INTO donor_segment_members_rel (
            external_id,
            segment_id,
            donor_user_id,
            source_doc
          )
          VALUES ($1, $2, $3, $4::jsonb)
          ON CONFLICT (segment_id, donor_user_id) DO NOTHING
          `,
          [memberDoc.id, segmentRow.id, donorRow.id, JSON.stringify(memberDoc)]
        );
      }
    }

    return res.status(201).json(doc);
  } catch (err) {
    if (String(err?.message || '').toLowerCase().includes('duplicate')) {
      return res.status(400).json({ message: 'Segment name already exists.' });
    }
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

router.get('/crm/segments', auth(['ngo']), async (req, res) => {
  try {
    const ngoRow = await ensureNgoOwner(req.user.id, req.user.id);
    const { rows } = await query(
      `
      SELECT
        ds.id,
        ds.external_id,
        ds.source_doc,
        COALESCE(COUNT(dsm.id), 0)::int AS member_count
      FROM donor_segments_rel ds
      LEFT JOIN donor_segment_members_rel dsm ON dsm.segment_id = ds.id
      WHERE ds.ngo_id = $1
      GROUP BY ds.id
      ORDER BY ds.created_at DESC
      `,
      [ngoRow.id]
    );

    const segments = rows.map((row) => {
      const doc = mapDoc(row);
      doc.memberCount = Number(row.member_count || 0);
      return doc;
    });
    return res.json(segments);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

router.post('/crm/segments/:id/members', auth(['ngo']), async (req, res) => {
  try {
    const ngoRow = await ensureNgoOwner(req.user.id, req.user.id);
    const segmentId = toSafeText(req.params.id, 80);
    const donorUserIds = toTextArray(req.body?.donorUserIds);
    if (donorUserIds.length === 0) {
      return res.status(400).json({ message: 'donorUserIds are required.' });
    }

    const {
      rows: [segmentRow]
    } = await query(
      `
      SELECT id, external_id
      FROM donor_segments_rel
      WHERE external_id = $1 AND ngo_id = $2
      LIMIT 1
      `,
      [segmentId, ngoRow.id]
    );
    if (!segmentRow) return res.status(404).json({ message: 'Segment not found.' });

    const donorRows = await query(`SELECT id, external_id FROM users_rel WHERE external_id = ANY($1::text[])`, [donorUserIds]);
    let added = 0;
    for (const donorRow of donorRows.rows) {
      const memberDoc = {
        id: generateId(),
        segmentId,
        donorUserId: donorRow.external_id,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      const result = await query(
        `
        INSERT INTO donor_segment_members_rel (
          external_id,
          segment_id,
          donor_user_id,
          source_doc
        )
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (segment_id, donor_user_id) DO NOTHING
        RETURNING id
        `,
        [memberDoc.id, segmentRow.id, donorRow.id, JSON.stringify(memberDoc)]
      );
      if (result.rowCount > 0) added += 1;
    }

    return res.json({ message: 'Members updated.', added });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

router.post('/crm/segments/:id/campaign-message', auth(['ngo']), async (req, res) => {
  try {
    const ngoRow = await ensureNgoOwner(req.user.id, req.user.id);
    const segmentId = toSafeText(req.params.id, 80);
    const title = toSafeText(req.body?.title, 140);
    const message = toSafeText(req.body?.message, 1200);
    if (!title || !message) {
      return res.status(400).json({ message: 'title and message are required.' });
    }

    const {
      rows: [segmentRow]
    } = await query(
      `
      SELECT id, external_id, source_doc
      FROM donor_segments_rel
      WHERE external_id = $1 AND ngo_id = $2
      LIMIT 1
      `,
      [segmentId, ngoRow.id]
    );
    if (!segmentRow) return res.status(404).json({ message: 'Segment not found.' });

    const membersRes = await query(
      `
      SELECT u.external_id
      FROM donor_segment_members_rel dsm
      LEFT JOIN users_rel u ON u.id = dsm.donor_user_id
      WHERE dsm.segment_id = $1
      `,
      [segmentRow.id]
    );
    const memberIds = membersRes.rows.map((row) => row.external_id).filter(Boolean);
    const ngoDoc = ngoRow.source_doc && typeof ngoRow.source_doc === 'object' ? ngoRow.source_doc : {};
    const delivered = await sendSegmentAnnouncement({
      ngoId: req.user.id,
      ngoName: ngoDoc.name || 'NGO',
      segmentName: segmentRow.source_doc?.segmentName || 'Donor Segment',
      recipientUserIds: memberIds,
      title,
      message
    });

    return res.json({
      message: 'Segment campaign message dispatched.',
      recipients: memberIds.length,
      delivered: delivered.delivered || 0
    });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

// -----------------------------------------------------------------------------
// Impact tracking
// -----------------------------------------------------------------------------

router.post('/impact-updates', auth(['ngo']), async (req, res) => {
  try {
    const ngoRow = await ensureNgoOwner(req.user.id, req.user.id);
    const campaignId = toSafeText(req.body?.campaignId, 80);
    const donationId = toSafeText(req.body?.donationId, 80);
    const title = toSafeText(req.body?.title, 140);
    const details = toSafeText(req.body?.details, 2000);
    const amountUtilized = toPositiveAmount(req.body?.amountUtilized, 0);
    const beneficiariesReached = toSafeInt(req.body?.beneficiariesReached, 0);
    const evidence = toTextArray(req.body?.evidence);
    if (!campaignId || !title || details.length < 10) {
      return res.status(400).json({ message: 'campaignId, title, and detailed update are required.' });
    }

    const campaignRow = await resolveCampaignRow(campaignId);
    if (!campaignRow) return res.status(404).json({ message: 'Campaign not found.' });
    const campaignDoc = campaignRow.source_doc && typeof campaignRow.source_doc === 'object' ? campaignRow.source_doc : {};
    const campaignNgoId = String(campaignDoc.ngo?.id || campaignDoc.ngo || '');
    if (campaignNgoId !== String(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    let donationDbId = null;
    if (donationId) {
      const donationRow = await resolveDonationRow(donationId);
      if (donationRow) donationDbId = donationRow.id;
    }

    const id = generateId();
    const doc = {
      id,
      ngoId: req.user.id,
      campaignId,
      donationId: donationId || null,
      title,
      details,
      amountUtilized,
      beneficiariesReached,
      evidence,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    await query(
      `
      INSERT INTO impact_updates_rel (
        external_id,
        ngo_id,
        campaign_id,
        donation_id,
        title,
        details,
        amount_utilized,
        beneficiaries_reached,
        source_doc
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
      )
      `,
      [id, ngoRow.id, campaignRow.id, donationDbId, title, details, amountUtilized, beneficiariesReached, JSON.stringify(doc)]
    );

    await awardPoints(req.user.id, {
      points: 15,
      eventType: 'impact_update_posted',
      badgeKey: 'impact_storyteller',
      reason: `Posted impact update for campaign ${campaignId}`,
      referenceType: 'impact_update',
      referenceId: id
    });

    return res.status(201).json(doc);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

router.get('/impact-updates/campaign/:campaignId', async (req, res) => {
  try {
    const campaignId = toSafeText(req.params.campaignId, 80);
    const limit = normalizeLimit(req.query.limit, 100, 500);
    const { rows } = await query(
      `
      SELECT iu.external_id, iu.source_doc, iu.created_at, ngo.source_doc AS ngo_doc
      FROM impact_updates_rel iu
      LEFT JOIN campaigns_rel c ON c.id = iu.campaign_id
      LEFT JOIN ngos_rel ngo ON ngo.id = iu.ngo_id
      WHERE c.external_id = $1
      ORDER BY iu.created_at DESC
      LIMIT $2
      `,
      [campaignId, limit]
    );
    const updates = rows.map((row) => {
      const doc = mapDoc(row);
      doc.createdAt = doc.createdAt || row.created_at || null;
      const ngoDoc = row.ngo_doc && typeof row.ngo_doc === 'object' ? row.ngo_doc : {};
      doc.ngo = ngoDoc.id
        ? { id: ngoDoc.id, name: ngoDoc.name, verified: ngoDoc.verified }
        : null;
      return doc;
    });
    return res.json(updates);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/impact-updates/ngo', auth(['ngo']), async (req, res) => {
  try {
    const ngoRow = await ensureNgoOwner(req.user.id, req.user.id);
    const limit = normalizeLimit(req.query.limit, 200, 500);
    const { rows } = await query(
      `
      SELECT external_id, source_doc, created_at
      FROM impact_updates_rel
      WHERE ngo_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [ngoRow.id, limit]
    );
    return res.json(rows.map((row) => {
      const doc = mapDoc(row);
      doc.createdAt = doc.createdAt || row.created_at || null;
      return doc;
    }));
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

// -----------------------------------------------------------------------------
// Corporate matching
// -----------------------------------------------------------------------------

router.post('/corporate/profiles', auth(['user', 'admin']), async (req, res) => {
  try {
    const userRow = await resolveUserRow(req.user.id);
    if (!userRow) return res.status(404).json({ message: 'User not found.' });

    const companyName = toSafeText(req.body?.companyName, 140);
    const matchRatio = Math.min(Math.max(Number(req.body?.matchRatio || 1), 0.1), 5);
    const capPerEmployee = Math.max(Number(req.body?.capPerEmployee || 0), 0);
    const policyNote = toSafeText(req.body?.policyNote, 1200);
    if (!companyName) return res.status(400).json({ message: 'companyName is required.' });

    const id = generateId();
    const doc = {
      id,
      ownerUserId: req.user.id,
      companyName,
      matchRatio,
      capPerEmployee,
      policyNote,
      active: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    await query(
      `
      INSERT INTO corporate_profiles_rel (
        external_id,
        owner_user_id,
        company_name,
        match_ratio,
        cap_per_employee,
        active,
        source_doc
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7::jsonb
      )
      `,
      [id, userRow.id, companyName, matchRatio, capPerEmployee, true, JSON.stringify(doc)]
    );

    return res.status(201).json(doc);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/corporate/profiles/my', auth(['user', 'admin']), async (req, res) => {
  try {
    const userRow = await resolveUserRow(req.user.id);
    if (!userRow) return res.status(404).json({ message: 'User not found.' });

    const [ownedRes, linksRes] = await Promise.all([
      query(
        `
        SELECT external_id, source_doc, created_at
        FROM corporate_profiles_rel
        WHERE owner_user_id = $1
        ORDER BY created_at DESC
        `,
        [userRow.id]
      ),
      query(
        `
        SELECT cel.source_doc, cp.source_doc AS profile_doc
        FROM corporate_employee_links_rel cel
        LEFT JOIN corporate_profiles_rel cp ON cp.id = cel.corporate_profile_id
        WHERE cel.user_id = $1
        ORDER BY cel.created_at DESC
        `,
        [userRow.id]
      )
    ]);

    return res.json({
      ownedProfiles: ownedRes.rows.map((row) => mapDoc(row)),
      linkedProfiles: linksRes.rows.map((row) => {
        const link = row.source_doc && typeof row.source_doc === 'object' ? row.source_doc : {};
        const profileDoc = row.profile_doc && typeof row.profile_doc === 'object' ? row.profile_doc : {};
        return {
          ...link,
          corporateProfile: {
            id: profileDoc.id || link.corporateProfileId || '',
            companyName: profileDoc.companyName || '',
            matchRatio: profileDoc.matchRatio || 1,
            capPerEmployee: profileDoc.capPerEmployee || 0
          }
        };
      })
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/corporate/profiles/:id/link', auth(['user', 'admin']), async (req, res) => {
  try {
    const profileId = toSafeText(req.params.id, 80);
    const employeeCode = toSafeText(req.body?.employeeCode, 60);
    const userRow = await resolveUserRow(req.user.id);
    if (!userRow) return res.status(404).json({ message: 'User not found.' });

    const {
      rows: [profileRow]
    } = await query(
      `
      SELECT id, owner_user_id, source_doc
      FROM corporate_profiles_rel
      WHERE external_id = $1
      LIMIT 1
      `,
      [profileId]
    );
    if (!profileRow) return res.status(404).json({ message: 'Corporate profile not found.' });
    const autoApproved = Number(profileRow.owner_user_id || 0) === Number(userRow.id || 0);
    const linkStatus = autoApproved ? 'approved' : 'pending';
    const id = generateId();
    const doc = {
      id,
      corporateProfileId: profileId,
      userId: req.user.id,
      employeeCode,
      status: linkStatus,
      approvedAt: autoApproved ? nowIso() : null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    const result = await query(
      `
      INSERT INTO corporate_employee_links_rel (
        external_id,
        corporate_profile_id,
        user_id,
        employee_code,
        status,
        approved_by_user_id,
        approved_at,
        source_doc
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (corporate_profile_id, user_id)
      DO UPDATE SET
        employee_code = EXCLUDED.employee_code,
        status = EXCLUDED.status,
        approved_by_user_id = EXCLUDED.approved_by_user_id,
        approved_at = EXCLUDED.approved_at,
        updated_at = NOW(),
        source_doc = EXCLUDED.source_doc
      RETURNING id
      `,
      [id, profileRow.id, userRow.id, employeeCode || null, linkStatus, autoApproved ? userRow.id : null, autoApproved ? nowIso() : null, JSON.stringify(doc)]
    );

    return res.status(201).json({
      ...doc,
      dbId: result.rows[0].id
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/corporate/profiles/:id/employees', auth(['user', 'admin']), async (req, res) => {
  try {
    const profileId = toSafeText(req.params.id, 80);
    const userRow = await resolveUserRow(req.user.id);
    if (!userRow) return res.status(404).json({ message: 'User not found.' });

    const {
      rows: [profileRow]
    } = await query(
      `
      SELECT id, owner_user_id
      FROM corporate_profiles_rel
      WHERE external_id = $1
      LIMIT 1
      `,
      [profileId]
    );
    if (!profileRow) return res.status(404).json({ message: 'Corporate profile not found.' });
    if (req.user.role !== 'admin' && Number(profileRow.owner_user_id || 0) !== Number(userRow.id || 0)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { rows } = await query(
      `
      SELECT cel.external_id, cel.source_doc, u.source_doc AS user_doc
      FROM corporate_employee_links_rel cel
      LEFT JOIN users_rel u ON u.id = cel.user_id
      WHERE cel.corporate_profile_id = $1
      ORDER BY cel.created_at DESC
      `,
      [profileRow.id]
    );
    const employees = rows.map((row) => {
      const doc = mapDoc(row);
      const userDoc = row.user_doc && typeof row.user_doc === 'object' ? row.user_doc : {};
      doc.user = {
        id: userDoc.id || doc.userId || '',
        name: userDoc.name || 'User',
        email: userDoc.email || ''
      };
      return doc;
    });
    return res.json(employees);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/corporate/profiles/:id/employees/:linkId/approve', auth(['user', 'admin']), async (req, res) => {
  try {
    const profileId = toSafeText(req.params.id, 80);
    const linkId = toSafeText(req.params.linkId, 80);
    const approverRow = await resolveUserRow(req.user.id);
    if (!approverRow) return res.status(404).json({ message: 'User not found.' });

    const {
      rows: [profileRow]
    } = await query(
      `
      SELECT id, owner_user_id
      FROM corporate_profiles_rel
      WHERE external_id = $1
      LIMIT 1
      `,
      [profileId]
    );
    if (!profileRow) return res.status(404).json({ message: 'Corporate profile not found.' });
    if (req.user.role !== 'admin' && Number(profileRow.owner_user_id || 0) !== Number(approverRow.id || 0)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const {
      rows: [linkRow]
    } = await query(
      `
      SELECT id, source_doc
      FROM corporate_employee_links_rel
      WHERE external_id = $1 AND corporate_profile_id = $2
      LIMIT 1
      `,
      [linkId, profileRow.id]
    );
    if (!linkRow) return res.status(404).json({ message: 'Employee link not found.' });

    const doc = linkRow.source_doc && typeof linkRow.source_doc === 'object' ? { ...linkRow.source_doc } : {};
    doc.status = 'approved';
    doc.approvedAt = nowIso();
    doc.updatedAt = nowIso();
    await query(
      `
      UPDATE corporate_employee_links_rel
      SET status = 'approved',
          approved_by_user_id = $2,
          approved_at = NOW(),
          updated_at = NOW(),
          source_doc = $3::jsonb
      WHERE id = $1
      `,
      [linkRow.id, approverRow.id, JSON.stringify(doc)]
    );

    return res.json({ message: 'Employee link approved.', link: doc });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/corporate/matches/evaluate', auth(['user']), async (req, res) => {
  try {
    const donationId = toSafeText(req.body?.donationId, 80);
    if (!donationId) return res.status(400).json({ message: 'donationId is required.' });
    const userRow = await resolveUserRow(req.user.id);
    if (!userRow) return res.status(404).json({ message: 'User not found.' });

    const donationRow = await resolveDonationRow(donationId);
    if (!donationRow) return res.status(404).json({ message: 'Donation not found.' });
    const donationDoc = donationRow.source_doc && typeof donationRow.source_doc === 'object' ? donationRow.source_doc : {};
    const donationUserId = String(donationDoc.user?.id || donationDoc.user || '');
    const donationStatus = String(donationDoc.status || '').trim().toLowerCase();
    if (donationUserId !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only match your own donations.' });
    }
    if (donationStatus !== 'completed') {
      return res.status(400).json({ message: 'Donation must be completed before match evaluation.' });
    }

    const {
      rows: [linkRow]
    } = await query(
      `
      SELECT
        cel.id AS link_id,
        cel.external_id AS link_external_id,
        cel.status AS link_status,
        cp.id AS profile_id,
        cp.external_id AS profile_external_id,
        cp.source_doc AS profile_doc
      FROM corporate_employee_links_rel cel
      LEFT JOIN corporate_profiles_rel cp ON cp.id = cel.corporate_profile_id
      WHERE cel.user_id = $1
        AND cel.status = 'approved'
        AND cp.active = true
      ORDER BY cel.created_at DESC
      LIMIT 1
      `,
      [userRow.id]
    );
    if (!linkRow) {
      return res.status(404).json({ message: 'No approved corporate link found for this user.' });
    }

    const profileDoc = linkRow.profile_doc && typeof linkRow.profile_doc === 'object' ? linkRow.profile_doc : {};
    const amount = Number(donationDoc.amount || 0);
    const ratio = Number(profileDoc.matchRatio || 1);
    const cap = Number(profileDoc.capPerEmployee || 0);
    let matchedAmount = amount * ratio;
    if (cap > 0) matchedAmount = Math.min(matchedAmount, cap);
    matchedAmount = Math.max(0, Math.round(matchedAmount * 100) / 100);

    const id = generateId();
    const doc = {
      id,
      corporateProfileId: linkRow.profile_external_id,
      donationId,
      employeeUserId: req.user.id,
      matchedAmount,
      status: 'pending_approval',
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await query(
      `
      INSERT INTO corporate_matches_rel (
        external_id,
        corporate_profile_id,
        donation_id,
        employee_user_id,
        matched_amount,
        status,
        source_doc
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7::jsonb
      )
      `,
      [id, linkRow.profile_id, donationRow.id, userRow.id, matchedAmount, 'pending_approval', JSON.stringify(doc)]
    );

    return res.status(201).json(doc);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/corporate/matches/:id/approve', auth(['user', 'admin']), async (req, res) => {
  try {
    const matchId = toSafeText(req.params.id, 80);
    const approverRow = await resolveUserRow(req.user.id);
    if (!approverRow) return res.status(404).json({ message: 'User not found.' });

    const {
      rows: [matchRow]
    } = await query(
      `
      SELECT
        cm.id,
        cm.external_id,
        cm.employee_user_id,
        cm.corporate_profile_id,
        cm.status,
        cm.source_doc,
        cp.owner_user_id
      FROM corporate_matches_rel cm
      LEFT JOIN corporate_profiles_rel cp ON cp.id = cm.corporate_profile_id
      WHERE cm.external_id = $1
      LIMIT 1
      `,
      [matchId]
    );
    if (!matchRow) return res.status(404).json({ message: 'Corporate match not found.' });

    const isOwner = Number(matchRow.owner_user_id || 0) === Number(approverRow.id || 0);
    if (req.user.role !== 'admin' && !isOwner) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (String(matchRow.status || '').toLowerCase() === 'approved') {
      return res.json({ message: 'Corporate match already approved.' });
    }

    const doc = matchRow.source_doc && typeof matchRow.source_doc === 'object' ? { ...matchRow.source_doc } : {};
    doc.status = 'approved';
    doc.approvedAt = nowIso();
    doc.updatedAt = nowIso();
    await query(
      `
      UPDATE corporate_matches_rel
      SET status = 'approved',
          approved_by_user_id = $2,
          approved_at = NOW(),
          updated_at = NOW(),
          source_doc = $3::jsonb
      WHERE id = $1
      `,
      [matchRow.id, approverRow.id, JSON.stringify(doc)]
    );

    if (matchRow.employee_user_id) {
      const {
        rows: [employeeRow]
      } = await query(`SELECT external_id FROM users_rel WHERE id = $1 LIMIT 1`, [matchRow.employee_user_id]);
      if (employeeRow?.external_id) {
        await awardPoints(employeeRow.external_id, {
          points: 35,
          eventType: 'corporate_match_approved',
          badgeKey: 'match_maker',
          reason: `Corporate donation match approved (${matchId})`,
          referenceType: 'corporate_match',
          referenceId: matchId
        });
      }
    }

    return res.json({ message: 'Corporate match approved.', match: doc });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/corporate/matches/my', auth(['user', 'admin']), async (req, res) => {
  try {
    const userRow = await resolveUserRow(req.user.id);
    if (!userRow) return res.status(404).json({ message: 'User not found.' });
    const { rows } = await query(
      `
      SELECT
        cm.external_id,
        cm.source_doc,
        cm.status,
        cm.matched_amount,
        cm.created_at,
        cp.source_doc AS profile_doc
      FROM corporate_matches_rel cm
      LEFT JOIN corporate_profiles_rel cp ON cp.id = cm.corporate_profile_id
      WHERE cm.employee_user_id = $1
      ORDER BY cm.created_at DESC
      `,
      [userRow.id]
    );
    return res.json(rows.map((row) => {
      const doc = mapDoc(row);
      doc.status = row.status || doc.status || 'pending_approval';
      doc.matchedAmount = Number(row.matched_amount || doc.matchedAmount || 0);
      doc.createdAt = doc.createdAt || row.created_at || null;
      const profileDoc = row.profile_doc && typeof row.profile_doc === 'object' ? row.profile_doc : {};
      doc.corporateProfile = {
        id: profileDoc.id || doc.corporateProfileId || '',
        companyName: profileDoc.companyName || ''
      };
      return doc;
    }));
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// -----------------------------------------------------------------------------
// Emergency response hub
// -----------------------------------------------------------------------------

router.post('/emergency/campaigns/:id', auth(['ngo', 'admin']), async (req, res) => {
  try {
    const campaignId = toSafeText(req.params.id, 80);
    const emergency = parseBool(req.body?.emergency, true);
    const emergencyNote = toSafeText(req.body?.emergencyNote, 500);
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return res.status(404).json({ message: 'Campaign not found.' });

    const campaignDoc = campaign && typeof campaign.toObject === 'function' ? campaign.toObject() : campaign;
    const ownerNgoId = String(campaignDoc?.ngo?.id || campaignDoc?.ngo || '');
    if (req.user.role === 'ngo' && ownerNgoId !== String(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    campaign.emergency = emergency;
    campaign.emergencyNote = emergency ? emergencyNote : '';
    campaign.emergencyUpdatedAt = nowIso();
    await campaign.save();
    return res.json({
      message: 'Campaign emergency status updated.',
      campaign: {
        id: campaign.id,
        emergency: campaign.emergency,
        emergencyNote: campaign.emergencyNote,
        emergencyUpdatedAt: campaign.emergencyUpdatedAt
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/emergency/opportunities/:id', auth(['ngo', 'admin']), async (req, res) => {
  try {
    const opportunityId = toSafeText(req.params.id, 80);
    const emergency = parseBool(req.body?.emergency, true);
    const emergencyNote = toSafeText(req.body?.emergencyNote, 500);
    const opportunity = await VolunteerOpportunity.findById(opportunityId);
    if (!opportunity) return res.status(404).json({ message: 'Volunteer opportunity not found.' });
    const opDoc = opportunity && typeof opportunity.toObject === 'function' ? opportunity.toObject() : opportunity;
    const ownerNgoId = String(opDoc?.ngo?.id || opDoc?.ngo || '');
    if (req.user.role === 'ngo' && ownerNgoId !== String(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    opportunity.emergency = emergency;
    opportunity.emergencyNote = emergency ? emergencyNote : '';
    opportunity.emergencyUpdatedAt = nowIso();
    await opportunity.save();
    return res.json({
      message: 'Volunteer opportunity emergency status updated.',
      opportunity: {
        id: opportunity.id,
        emergency: opportunity.emergency,
        emergencyNote: opportunity.emergencyNote,
        emergencyUpdatedAt: opportunity.emergencyUpdatedAt
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/emergency/feed', async (req, res) => {
  try {
    const [campaigns, opportunities, wishlistItems] = await Promise.all([
      query(
        `
        SELECT external_id, source_doc
        FROM campaigns_rel
        WHERE LOWER(COALESCE(source_doc->>'emergency', 'false')) = 'true'
        ORDER BY created_at DESC
        LIMIT 100
        `
      ),
      query(
        `
        SELECT external_id, source_doc
        FROM volunteer_opportunities_rel
        WHERE LOWER(COALESCE(source_doc->>'emergency', 'false')) = 'true'
        ORDER BY created_at DESC
        LIMIT 100
        `
      ),
      query(
        `
        SELECT
          wi.external_id,
          wi.source_doc,
          wi.quantity_needed,
          wi.quantity_fulfilled,
          COALESCE(pledges.quantity_committed, 0)::int AS quantity_committed,
          wi.status
        FROM wishlist_items_rel wi
        LEFT JOIN (
          SELECT wishlist_item_id, COALESCE(SUM(quantity_pledged), 0)::int AS quantity_committed
          FROM in_kind_pledges_rel
          WHERE status IN ('pledged', 'approved', 'received')
          GROUP BY wishlist_item_id
        ) pledges ON pledges.wishlist_item_id = wi.id
        WHERE wi.emergency = true
          AND wi.status <> 'completed'
        ORDER BY wi.created_at DESC
        LIMIT 100
        `
      )
    ]);

    return res.json({
      campaigns: campaigns.rows.map((row) => mapDoc(row)),
      volunteerOpportunities: opportunities.rows.map((row) => mapDoc(row)),
      wishlistItems: wishlistItems.rows
        .map((row) => {
          const doc = mapDoc(row);
          doc.quantityNeeded = Number(row.quantity_needed || doc.quantityNeeded || 0);
          doc.quantityFulfilled = Number(row.quantity_fulfilled || doc.quantityFulfilled || 0);
          doc.quantityCommitted = Math.max(
            Number(row.quantity_committed || 0),
            Number(doc.quantityCommitted || 0),
            doc.quantityFulfilled
          );
          doc.quantityRemaining = Math.max(doc.quantityNeeded - doc.quantityCommitted, 0);
          doc.needCompleted = doc.quantityRemaining <= 0;
          doc.status = doc.needCompleted ? 'completed' : normalizeWishlistStatus(row.status || doc.status || 'open');
          return doc;
        })
        .filter((item) => !item.needCompleted)
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// -----------------------------------------------------------------------------
// Volunteer endorsements
// -----------------------------------------------------------------------------

router.post('/endorsements', auth(['ngo']), async (req, res) => {
  try {
    const ngoRow = await ensureNgoOwner(req.user.id, req.user.id);
    const userId = toSafeText(req.body?.userId, 80);
    const applicationId = toSafeText(req.body?.applicationId, 80);
    const skills = toTextArray(req.body?.skills);
    const note = toSafeText(req.body?.note, 600);
    if (!userId || skills.length === 0) {
      return res.status(400).json({ message: 'userId and at least one skill are required.' });
    }

    const userRow = await resolveUserRow(userId);
    if (!userRow) return res.status(404).json({ message: 'User not found.' });

    // Validate volunteer completion relationship.
    const completionRes = await query(
      `
      SELECT va.id
      FROM volunteer_applications_rel va
      WHERE (
          va.user_id = $1
          OR va.source_doc->>'user' = $3
          OR va.source_doc#>>'{user,id}' = $3
        )
        AND (
          va.ngo_id = $2
          OR va.source_doc->>'ngo' = $4
          OR va.source_doc#>>'{ngo,id}' = $4
        )
        AND COALESCE(NULLIF(va.source_doc->>'status', ''), 'applied') = 'completed'
        AND ($5::text = '' OR va.external_id = $5)
      ORDER BY va.created_at DESC
      LIMIT 1
      `,
      [userRow.id, ngoRow.id, userId, req.user.id, applicationId || '']
    );
    const completionRow = completionRes.rows[0];
    if (!completionRow) {
      return res.status(400).json({ message: 'No completed volunteer application found for endorsement.' });
    }

    const id = generateId();
    const doc = {
      id,
      ngoId: req.user.id,
      userId,
      applicationId: applicationId || null,
      skills,
      note,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await query(
      `
      INSERT INTO volunteer_endorsements_rel (
        external_id,
        ngo_id,
        user_id,
        application_id,
        source_doc
      ) VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [id, ngoRow.id, userRow.id, completionRow.id, JSON.stringify(doc)]
    );

    await awardPoints(userId, {
      points: 18,
      eventType: 'volunteer_endorsed',
      badgeKey: 'skill_endorsed',
      reason: `Received NGO skill endorsement`,
      referenceType: 'volunteer_endorsement',
      referenceId: id
    });

    return res.status(201).json(doc);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

router.get('/endorsements/my', auth(['user']), async (req, res) => {
  try {
    const userRow = await resolveUserRow(req.user.id);
    if (!userRow) return res.status(404).json({ message: 'User not found.' });
    const { rows } = await query(
      `
      SELECT ve.external_id, ve.source_doc, ngo.source_doc AS ngo_doc
      FROM volunteer_endorsements_rel ve
      LEFT JOIN ngos_rel ngo ON ngo.id = ve.ngo_id
      WHERE ve.user_id = $1
      ORDER BY ve.created_at DESC
      LIMIT 300
      `,
      [userRow.id]
    );
    return res.json(rows.map((row) => {
      const doc = mapDoc(row);
      const ngoDoc = row.ngo_doc && typeof row.ngo_doc === 'object' ? row.ngo_doc : {};
      doc.ngo = ngoDoc.id ? { id: ngoDoc.id, name: ngoDoc.name, verified: ngoDoc.verified } : null;
      return doc;
    }));
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// -----------------------------------------------------------------------------
// Gamification
// -----------------------------------------------------------------------------

router.get('/gamification/me', auth(['user']), async (req, res) => {
  try {
    const summary = await getUserGamificationSummary(req.user.id);
    return res.json(summary);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/gamification/leaderboard', async (req, res) => {
  try {
    const limit = normalizeLimit(req.query.limit, 20, 100);
    const leaderboard = await getLeaderboard(limit);
    return res.json(leaderboard);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
