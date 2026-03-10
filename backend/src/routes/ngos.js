const express = require('express');
const router = express.Router();
const NGO = require('../models/NGO');
const FlagRequest = require('../models/FlagRequest');
const Notification = require('../models/Notification');
const { query } = require('../db/postgres');
const { generateId } = require('../db/id');
const auth = require('../middleware/auth');
const multer = require('multer');
const {
  calculateTransparencyScoreForNgo,
  calculateTransparencyScoresForNgoExternalIds
} = require('../utils/transparencyScore');
const upload = multer({ dest: 'uploads/' });

const mapRowDoc = (row) => {
  const doc = row?.source_doc && typeof row.source_doc === 'object' ? { ...row.source_doc } : {};
  if (!doc.id) doc.id = row?.external_id;
  return doc;
};

const normalizeIsoDate = (value) => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString();
};

const normalizeTasksCompleted = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
};

const normalizeStringList = (value) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
};

const normalizeCampaignAssignment = (assignment) => {
  if (!assignment || typeof assignment !== 'object') return null;
  const campaignId = String(assignment.campaignId || '').trim();
  const campaignTitle = String(assignment.campaignTitle || assignment.campaign || '').trim();
  const task = String(assignment.task || '').trim();
  const contribution = String(assignment.contribution || '').trim();
  if (!campaignId && !campaignTitle && !task && !contribution) return null;
  return {
    campaignId,
    campaignTitle,
    task,
    contribution
  };
};

const normalizeCampaignAssignments = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((assignment) => normalizeCampaignAssignment(assignment)).filter(Boolean);
};

const normalizeTeamCount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
};

const normalizeTeamStrengthEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const role = String(entry.role || '').trim();
  const count = normalizeTeamCount(entry.count);
  if (!role || count <= 0) return null;
  const contribution = String(entry.contribution || '').trim();
  return {
    role,
    count,
    contribution
  };
};

const normalizeTeamStrengthList = (list) => {
  if (!Array.isArray(list)) return [];
  return list.map((entry) => normalizeTeamStrengthEntry(entry)).filter(Boolean);
};

const normalizeMember = (member, options = {}) => {
  if (!member || typeof member !== 'object') return null;
  const forceNew = Boolean(options.forceNew);
  const name = String(member.name || '').trim();
  if (!name) return null;

  const role = String(member.role || '').trim();
  const contributions = String(member.contributions || '').trim();
  const badges = normalizeStringList(member.badges);
  const tasks = normalizeStringList(member.tasks);
  const campaignAssignments = normalizeCampaignAssignments(member.campaignAssignments);
  const joinedAt = normalizeIsoDate(member.joinedAt);
  const now = new Date().toISOString();
  const createdAt = forceNew ? now : normalizeIsoDate(member.createdAt) || now;
  const updatedAt = forceNew ? now : normalizeIsoDate(member.updatedAt) || createdAt;

  return {
    id: forceNew ? generateId() : String(member.id || generateId()),
    name,
    role,
    tasksCompleted: normalizeTasksCompleted(member.tasksCompleted),
    contributions,
    badges,
    tasks,
    campaignAssignments,
    joinedAt,
    createdAt,
    updatedAt
  };
};

const normalizeMembers = (members) => {
  if (!Array.isArray(members)) return [];
  return members.map((member) => normalizeMember(member)).filter(Boolean);
};

const sanitizeNgo = (ngo) => {
  if (!ngo) return ngo;
  const doc = ngo && typeof ngo.toObject === 'function' ? ngo.toObject() : { ...(ngo || {}) };
  delete doc.password;
  doc.members = normalizeMembers(doc.members);
  doc.teamStrengthList = normalizeTeamStrengthList(doc.teamStrengthList);
  return doc;
};

const enrichNgoWithTransparency = (ngo, score) => {
  const clean = sanitizeNgo(ngo);
  if (!clean) return clean;
  return {
    ...clean,
    transparencyScore: score || null
  };
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
    const scoreMap = await calculateTransparencyScoresForNgoExternalIds(
      ngos.map((ngo) => ngo?.id).filter(Boolean)
    );
    const enriched = ngos.map((ngo) => enrichNgoWithTransparency(ngo, scoreMap[ngo.id] || null));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// NGO get their own profile
router.get('/me', auth(['ngo']), async (req, res) => {
  try {
    const ngo = await NGO.findById(req.user.id).select('-password');
    if (!ngo) return res.status(404).json({ message: 'NGO not found' });
    const transparencyScore = await calculateTransparencyScoreForNgo(req.user.id);
    res.json(enrichNgoWithTransparency(ngo, transparencyScore));
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
    if (Array.isArray(payload.members)) {
      payload.members = normalizeMembers(payload.members);
    }
    if (Array.isArray(payload.teamStrengthList)) {
      payload.teamStrengthList = normalizeTeamStrengthList(payload.teamStrengthList);
    }
    const ngo = await NGO.findByIdAndUpdate(req.user.id, payload, { new: true });
    res.json(sanitizeNgo(ngo));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/me/members', auth(['ngo']), async (req, res) => {
  try {
    const ngo = await NGO.findById(req.user.id).select('-password');
    if (!ngo) return res.status(404).json({ message: 'NGO not found' });
    return res.json({ members: normalizeMembers(ngo.members) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/me/members', auth(['ngo']), async (req, res) => {
  try {
    const member = normalizeMember(req.body, { forceNew: true });
    if (!member) {
      return res.status(400).json({ message: 'Member name is required' });
    }

    const ngo = await NGO.findById(req.user.id);
    if (!ngo) return res.status(404).json({ message: 'NGO not found' });

    const existingMembers = normalizeMembers(ngo.members);
    ngo.members = [...existingMembers, member];

    const existingTeamStrength = normalizeTeamStrengthList(ngo.teamStrengthList);
    if (member.role) {
      const memberContribution = member.contributions || member.campaignAssignments?.[0]?.contribution || '';
      const index = existingTeamStrength.findIndex(
        (entry) => String(entry.role || '').toLowerCase() === String(member.role || '').toLowerCase()
      );
      if (index >= 0) {
        existingTeamStrength[index] = {
          ...existingTeamStrength[index],
          count: normalizeTeamCount(existingTeamStrength[index].count) + 1,
          contribution: existingTeamStrength[index].contribution || memberContribution
        };
      } else {
        existingTeamStrength.push({
          role: member.role,
          count: 1,
          contribution: memberContribution
        });
      }
      ngo.teamStrengthList = existingTeamStrength;
    }
    await ngo.save();

    return res.status(201).json({
      message: 'Member added',
      member,
      members: normalizeMembers(ngo.members),
      teamStrengthList: normalizeTeamStrengthList(ngo.teamStrengthList)
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// Upload verification docs
router.post('/me/verify', auth(['ngo']), upload.array('docs', 5), async (req, res) => {
  try {
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];
    if (uploadedFiles.length === 0) {
      return res.status(400).json({ message: 'Upload at least one verification document.' });
    }

    const paths = uploadedFiles.map((file) => file.path).filter(Boolean);
    const ngo = await NGO.findById(req.user.id);
    if (!ngo) return res.status(404).json({ message: 'NGO not found' });

    const existingDocs = Array.isArray(ngo.verificationDocs) ? ngo.verificationDocs : [];
    ngo.verificationDocs = [...existingDocs, ...paths];
    ngo.verified = false;
    ngo.verificationStatus = 'pending';
    ngo.verificationReviewedAt = null;
    ngo.verificationReviewedBy = null;
    ngo.verificationRejectionReason = null;
    ngo.verificationRejectionSuggestions = null;

    const history = Array.isArray(ngo.verificationHistory) ? ngo.verificationHistory : [];
    history.unshift({
      id: generateId(),
      action: 'resubmitted',
      decidedAt: new Date().toISOString(),
      decidedBy: req.user.id,
      note: `NGO uploaded ${paths.length} verification document(s).`
    });
    ngo.verificationHistory = history.slice(0, 50);

    await ngo.save();

    res.json({ message: 'Documents uploaded. Verification status moved to pending review.', ngo: sanitizeNgo(ngo) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Public transparency score detail for NGO
router.get('/:id/transparency', async (req, res) => {
  try {
    const ngo = await NGO.findById(req.params.id).select('-password');
    if (!ngo) return res.status(404).json({ message: 'Not found' });
    if (!ngo.verified) return res.status(403).json({ message: 'NGO not verified' });
    if (ngo.isActive === false) return res.status(403).json({ message: 'NGO not active' });

    const transparencyScore = await calculateTransparencyScoreForNgo(req.params.id);
    return res.json({
      ngoId: req.params.id,
      transparencyScore
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// NGO profile (public if verified)
router.get('/:id', async (req, res) => {
  try {
    const ngo = await NGO.findById(req.params.id).select('-password');
    if (!ngo) return res.status(404).json({ message: 'Not found' });
    if (!ngo.verified) return res.status(403).json({ message: 'NGO not verified' });
    if (ngo.isActive === false) return res.status(403).json({ message: 'NGO not active' });
    const transparencyScore = await calculateTransparencyScoreForNgo(req.params.id);
    res.json(enrichNgoWithTransparency(ngo, transparencyScore));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
