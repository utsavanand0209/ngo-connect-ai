const express = require('express');
const router = express.Router();
const { query } = require('../db/postgres');
const auth = require('../middleware/auth');

const mapRowDoc = (row) => {
  const doc = row?.source_doc && typeof row.source_doc === 'object' ? { ...row.source_doc } : {};
  if (!doc.id) doc.id = row?.external_id;
  return doc;
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
    const { rows } = await query(
      `
      SELECT external_id, source_doc
      FROM notifications_rel
      WHERE COALESCE(NULLIF(source_doc->>'audience', ''), 'all') = ANY($1::text[])
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [audienceFilter, limit]
    );

    const notifications = rows.map((row) => mapRowDoc(row));
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
