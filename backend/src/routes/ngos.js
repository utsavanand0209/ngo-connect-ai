const express = require('express');
const router = express.Router();
const NGO = require('../models/NGO');
const FlagRequest = require('../models/FlagRequest');
const Notification = require('../models/Notification');
const { query } = require('../db/postgres');
const auth = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const mapRowDoc = (row) => {
  const doc = row?.source_doc && typeof row.source_doc === 'object' ? { ...row.source_doc } : {};
  if (!doc.id) doc.id = row?.external_id;
  return doc;
};

const sanitizeNgo = (ngo) => {
  if (!ngo) return ngo;
  const doc = ngo && typeof ngo.toObject === 'function' ? ngo.toObject() : { ...(ngo || {}) };
  delete doc.password;
  return doc;
};

// Public list verified NGOs + search by category/location
router.get('/', async (req, res) => {
  try {
    const { category, location, q } = req.query;
    const conditions = [
      `LOWER(COALESCE(NULLIF(source_doc->>'verified', ''), 'false')) = 'true'`,
      `LOWER(COALESCE(NULLIF(source_doc->>'isActive', ''), 'true')) = 'true'`
    ];
    const values = [];

    if (category) {
      values.push(String(category).trim());
      const valueIndex = values.length;
      conditions.push(`
        (
          LOWER(COALESCE(source_doc->>'category', '')) = LOWER($${valueIndex})
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(source_doc->'categories', '[]'::jsonb)) AS c(value)
            WHERE LOWER(c.value) = LOWER($${valueIndex})
          )
        )
      `);
    }

    if (q) {
      values.push(`%${String(q).trim()}%`);
      const valueIndex = values.length;
      conditions.push(`
        (
          COALESCE(source_doc->>'name', '') ILIKE $${valueIndex}
          OR COALESCE(source_doc->>'description', '') ILIKE $${valueIndex}
          OR COALESCE(source_doc->>'mission', '') ILIKE $${valueIndex}
          OR COALESCE(source_doc->>'about', '') ILIKE $${valueIndex}
          OR COALESCE(source_doc->>'address', '') ILIKE $${valueIndex}
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(source_doc->'categories', '[]'::jsonb)) AS c(value)
            WHERE c.value ILIKE $${valueIndex}
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(source_doc->'geographies', '[]'::jsonb)) AS g(value)
            WHERE g.value ILIKE $${valueIndex}
          )
        )
      `);
    }

    if (location) {
      values.push(`%${String(location).trim()}%`);
      const valueIndex = values.length;
      conditions.push(`
        (
          COALESCE(source_doc->>'address', '') ILIKE $${valueIndex}
          OR COALESCE(source_doc->>'category', '') ILIKE $${valueIndex}
          OR COALESCE(source_doc #>> '{addressDetails,district}', '') ILIKE $${valueIndex}
          OR COALESCE(source_doc #>> '{addressDetails,state}', '') ILIKE $${valueIndex}
          OR COALESCE(source_doc #>> '{addressDetails,landmark}', '') ILIKE $${valueIndex}
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(source_doc->'geographies', '[]'::jsonb)) AS g(value)
            WHERE g.value ILIKE $${valueIndex}
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(source_doc->'offices', '[]'::jsonb)) AS o(value)
            WHERE o.value ILIKE $${valueIndex}
          )
        )
      `);
    }

    const { rows } = await query(
      `
      SELECT external_id, source_doc
      FROM ngos_rel
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      `,
      values
    );

    const ngos = rows.map((row) => sanitizeNgo(mapRowDoc(row)));
    res.json(ngos);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// NGO get their own profile
router.get('/me', auth(['ngo']), async (req, res) => {
  try {
    const ngo = await NGO.findById(req.user.id).select('-password');
    if (!ngo) return res.status(404).json({ message: 'NGO not found' });
    res.json(ngo);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Flag NGO (user/ngo/admin)
router.post('/:id/flag', auth(['admin']), async (req, res) => {
  try {
    const { reason } = req.body;
    const ngo = await NGO.findByIdAndUpdate(
      req.params.id,
      { flagged: true, flagReason: reason || 'Flagged by user' },
      { new: true }
    );
    if (!ngo) return res.status(404).json({ message: 'NGO not found' });
    res.json({ message: 'NGO flagged', ngo: sanitizeNgo(ngo) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// User requests admin to flag NGO
router.post('/:id/flag-request', auth(['user']), async (req, res) => {
  try {
    const { reason } = req.body;
    const ngo = await NGO.findById(req.params.id);
    if (!ngo) return res.status(404).json({ message: 'NGO not found' });
    if (ngo.flagged) return res.status(400).json({ message: 'NGO already flagged' });

    const existing = await FlagRequest.findOne({
      targetType: 'ngo',
      targetId: ngo.id,
      requestedBy: req.user.id
    });
    if (existing) {
      const existingStatus = String(existing.status || 'pending').trim().toLowerCase();
      if (existingStatus === 'pending') {
        return res.status(400).json({ message: 'You already have a pending request for this NGO' });
      }
    }

    const request = await FlagRequest.create({
      targetType: 'ngo',
      targetId: ngo.id,
      targetName: ngo.name,
      reason: reason || 'Reported by user',
      requestedBy: req.user.id,
      status: 'pending'
    });

    try {
      await Notification.create({
        title: 'New NGO flag request',
        message: `A user requested admin review for NGO "${ngo.name || ngo.id}".${reason ? `\nReason: ${reason}` : ''}`,
        audience: 'admins',
        createdBy: req.user.id,
        meta: {
          event: 'flag-request-submitted',
          targetType: 'ngo',
          targetId: ngo.id,
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

// NGO updates (only ngo role)
router.put('/me', auth(['ngo']), async (req, res) => {
  try {
    const payload = { ...req.body };
    if (Array.isArray(payload.categories)) {
      payload.category = payload.categories[0] || payload.category;
    }
    if (payload.addressDetails) {
      const { houseNumber, landmark, district, state, pincode } = payload.addressDetails;
      const address = [houseNumber, landmark, district, state, pincode].filter(Boolean).join(', ');
      payload.address = address || payload.address;
    }
    const ngo = await NGO.findByIdAndUpdate(req.user.id, payload, { new: true });
    res.json(sanitizeNgo(ngo));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload verification docs
router.post('/me/verify', auth(['ngo']), upload.array('docs', 5), async (req, res) => {
  try {
    const paths = req.files.map(f => f.path);
    const ngo = await NGO.findById(req.user.id);
    if (!ngo) return res.status(404).json({ message: 'NGO not found' });

    const existingDocs = Array.isArray(ngo.verificationDocs) ? ngo.verificationDocs : [];
    ngo.verificationDocs = [...existingDocs, ...paths];
    await ngo.save();

    res.json({ message: 'Documents uploaded', ngo: sanitizeNgo(ngo) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// NGO profile (public if verified)
router.get('/:id', async (req, res) => {
  try {
    const ngo = await NGO.findById(req.params.id).select('-password');
    if (!ngo) return res.status(404).json({ message: 'Not found' });
    if (!ngo.verified) return res.status(403).json({ message: 'NGO not verified' });
    if (ngo.isActive === false) return res.status(403).json({ message: 'NGO not active' });
    res.json(ngo);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
