const express = require('express');
const router = express.Router();
const { query } = require('../db/postgres');
const auth = require('../middleware/auth');
const { dispatchWebhook } = require('../utils/webhookDispatcher');

const nowIso = () => new Date().toISOString();

const mapRowDoc = (row) => {
  const doc = row?.source_doc && typeof row.source_doc === 'object' ? { ...row.source_doc } : {};
  if (!doc.id) doc.id = row?.external_id;
  return doc;
};

const canAccessNotification = (note, role, principalId) => {
  const recipientUserId = String(note.recipientUserId || '').trim();
  const recipientNgoId = String(note.recipientNgoId || '').trim();
  const recipientRole = String(note.recipientRole || '').trim().toLowerCase();
  const isTargeted = Boolean(recipientUserId || recipientNgoId || recipientRole);

  if (!isTargeted) return true;

  if (role === 'user') {
    if (recipientUserId) return recipientUserId === principalId;
    if (recipientNgoId) return false;
    return recipientRole === 'user';
  }

  if (role === 'ngo') {
    if (recipientNgoId) return recipientNgoId === principalId;
    if (recipientUserId) return false;
    return recipientRole === 'ngo';
  }

  if (recipientUserId) return recipientUserId === principalId;
  if (recipientNgoId) return recipientNgoId === principalId;
  return recipientRole === 'admin';
};

// Get notifications for logged-in user/ngo/admin
router.get('/', auth(['user', 'ngo', 'admin']), async (req, res) => {
  try {
    const role = req.user.role;
    let audienceFilter = ['all'];
    if (role === 'user') audienceFilter.push('users');
    if (role === 'ngo') audienceFilter.push('ngos');
    if (role === 'admin') audienceFilter = ['all', 'users', 'ngos', 'admins'];

    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const fetchLimit = Math.min(Math.max(limit * 5, limit), 250);
    const { rows } = await query(
      `
      SELECT external_id, source_doc
      FROM notifications_rel
      WHERE COALESCE(NULLIF(source_doc->>'audience', ''), 'all') = ANY($1::text[])
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [audienceFilter, fetchLimit]
    );

    const principalId = String(req.user.id || '');
    const notifications = rows
      .map((row) => ({
        ...mapRowDoc(row),
        externalId: String(row?.external_id || '')
      }))
      .filter((note) => canAccessNotification(note, role, principalId))
      .slice(0, limit);

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Track notification engagement (open/click)
router.post('/:id/open', auth(['user', 'ngo', 'admin']), async (req, res) => {
  try {
    const notificationId = String(req.params.id || '').trim();
    if (!notificationId) return res.status(400).json({ message: 'Notification id is required.' });

    const actionRaw = String(req.body?.action || 'open').trim().toLowerCase();
    const action = actionRaw === 'click' ? 'click' : 'open';

    const {
      rows: [row]
    } = await query(
      `
      SELECT external_id, source_doc
      FROM notifications_rel
      WHERE external_id = $1
         OR source_doc->>'id' = $1
      ORDER BY CASE WHEN external_id = $1 THEN 0 ELSE 1 END
      LIMIT 1
      `,
      [notificationId]
    );

    if (!row) return res.status(404).json({ message: 'Notification not found.' });

    const note = mapRowDoc(row);
    const resolvedExternalId = String(row.external_id || '').trim() || notificationId;
    const role = String(req.user.role || '').trim().toLowerCase();
    const principalId = String(req.user.id || '').trim();
    if (!canAccessNotification(note, role, principalId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const timestamp = nowIso();
    note.openCount = Number(note.openCount || 0);
    note.clickCount = Number(note.clickCount || 0);

    if (!note.openedAt) note.openedAt = timestamp;
    note.openCount += 1;

    if (action === 'click') {
      note.clickedAt = timestamp;
      note.clickCount += 1;
    }

    note.lastEngagementAt = timestamp;

    await query(
      `
      UPDATE notifications_rel
      SET source_doc = $2::jsonb,
          updated_at = NOW()
      WHERE external_id = $1
      `,
      [resolvedExternalId, JSON.stringify(note)]
    );

    const webhookResult = await dispatchWebhook('notification.engagement', {
      notificationId: note.id || notificationId,
      notificationType: note.notificationType || '',
      campaignId: note.campaignId || null,
      campaignUpdateId: note.campaignUpdateId || null,
      recipientRole: role,
      recipientId: principalId,
      action,
      openedAt: note.openedAt || null,
      clickedAt: note.clickedAt || null,
      openCount: Number(note.openCount || 0),
      clickCount: Number(note.clickCount || 0)
    });

    return res.json({
      id: note.id || resolvedExternalId,
      externalId: resolvedExternalId,
      action,
      openedAt: note.openedAt || null,
      clickedAt: note.clickedAt || null,
      openCount: Number(note.openCount || 0),
      clickCount: Number(note.clickCount || 0),
      webhook: {
        attempted: Boolean(webhookResult?.attempted),
        sent: Boolean(webhookResult?.sent),
        reason: String(webhookResult?.reason || ''),
        logId: webhookResult?.logId || null
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
