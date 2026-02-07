const express = require('express');
const router = express.Router();
const VolunteerOpportunity = require('../models/VolunteerOpportunity');
const VolunteerApplication = require('../models/VolunteerApplication');
const User = require('../models/User');
const Certificate = require('../models/Certificate');
const auth = require('../middleware/auth');
const { query } = require('../db/postgres');
const { generateCertificateNumber } = require('../utils/certificateTemplates');

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

const chooseAssignedTask = (opportunity, preferredActivities = []) => {
  const normalizedPreferred = preferredActivities.map((entry) => entry.toLowerCase());
  const opportunitySkills = (opportunity.skills || []).map((entry) => String(entry).trim()).filter(Boolean);
  const matchedSkill = opportunitySkills.find((skill) => {
    const lowered = skill.toLowerCase();
    return normalizedPreferred.some((pref) => pref.includes(lowered) || lowered.includes(pref));
  });
  if (matchedSkill) return matchedSkill;
  if (preferredActivities[0]) return preferredActivities[0];
  if (opportunitySkills[0]) return opportunitySkills[0];
  return 'General Volunteer Support';
};

const toDoc = (row, idField, docField) => {
  const doc = row?.[docField] && typeof row[docField] === 'object' ? { ...row[docField] } : {};
  if (!doc.id) doc.id = row?.[idField];
  return doc;
};

const issueVolunteerCertificate = async (applicationId) => {
  const application = await VolunteerApplication.findById(applicationId)
    .populate('opportunity', 'title')
    .populate('ngo', 'name')
    .populate('user', 'name email');
  if (!application) throw new Error('Volunteer application not found');

  if (application.certificate) {
    const existing = await Certificate.findById(application.certificate);
    return existing;
  }

  const certificate = await Certificate.create({
    user: application.user?.id || application.user,
    ngo: application.ngo?.id || application.ngo,
    volunteerApplication: application.id,
    type: 'volunteer',
    title: 'Volunteer Completion Certificate',
    certificateNumber: generateCertificateNumber('volunteer'),
    metadata: {
      recipientName: application.fullName || application.user?.name,
      recipientEmail: application.email || application.user?.email,
      ngoName: application.ngo?.name || 'Partner NGO',
      activityTitle: application.opportunity?.title || 'Volunteer Service',
      assignedTask: application.assignedTask || 'Volunteer Service',
      completionDate: application.completedAt || new Date(),
      activityHours: application.activityHours || 0
    }
  });

  application.certificate = certificate.id;
  await application.save();
  return certificate;
};

// Get all volunteer opportunities
router.get('/', async (req, res) => {
  try {
    const { location, skills } = req.query;
    const conditions = ['1=1'];
    const values = [];
    const normalizedSkills = cleanArray(skills).map((entry) => entry.toLowerCase());

    if (location) {
      values.push(`%${String(location).trim()}%`);
      const valueIndex = values.length;
      conditions.push(`COALESCE(vo.source_doc->>'location', '') ILIKE $${valueIndex}`);
    }

    if (normalizedSkills.length > 0) {
      values.push(normalizedSkills);
      const valueIndex = values.length;
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(vo.source_doc->'skills', '[]'::jsonb)) AS s(value)
          WHERE LOWER(s.value) = ANY($${valueIndex}::text[])
        )
      `);
    }

    const { rows } = await query(
      `
      SELECT
        vo.external_id AS opportunity_id,
        vo.source_doc AS opportunity_doc,
        ngo.external_id AS ngo_id,
        ngo.source_doc AS ngo_doc
      FROM volunteer_opportunities_rel vo
      LEFT JOIN ngos_rel ngo ON ngo.external_id = NULLIF(vo.source_doc->>'ngo', '')
      WHERE ${conditions.join(' AND ')}
      ORDER BY vo.created_at DESC
      `
      ,
      values
    );

    const opportunities = rows.map((row) => {
      const opportunity = toDoc(row, 'opportunity_id', 'opportunity_doc');
      if (row.ngo_doc) {
        const ngo = toDoc(row, 'ngo_id', 'ngo_doc');
        opportunity.ngo = {
          id: ngo.id,
          name: ngo.name,
          logo: ngo.logo,
          location: ngo.location,
          verified: ngo.verified
        };
      } else {
        opportunity.ngo = null;
      }
      return opportunity;
    });
    res.json(opportunities);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get opportunities where user has volunteered
router.get('/my', auth(['user', 'ngo', 'admin']), async (req, res) => {
  try {
    const opportunities = await VolunteerOpportunity.find({ applicants: req.user.id })
      .populate('ngo', 'name logo verified');
    res.json(opportunities);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get detailed applications for logged-in user
router.get('/my/applications', auth(['user']), async (req, res) => {
  try {
    const { rows } = await query(
      `
      SELECT
        va.external_id AS application_id,
        va.source_doc AS application_doc,
        vo.external_id AS opportunity_id,
        vo.source_doc AS opportunity_doc,
        ngo.external_id AS ngo_id,
        ngo.source_doc AS ngo_doc,
        cert.external_id AS certificate_id,
        cert.source_doc AS certificate_doc
      FROM volunteer_applications_rel va
      LEFT JOIN volunteer_opportunities_rel vo ON vo.external_id = NULLIF(va.source_doc->>'opportunity', '')
      LEFT JOIN ngos_rel ngo ON ngo.external_id = NULLIF(vo.source_doc->>'ngo', '')
      LEFT JOIN certificates_rel cert ON cert.external_id = NULLIF(va.source_doc->>'certificate', '')
      WHERE va.source_doc->>'user' = $1
        AND COALESCE(NULLIF(va.source_doc->>'status', ''), 'applied') <> 'withdrawn'
      ORDER BY va.created_at DESC
      `,
      [req.user.id]
    );

    const applications = rows.map((row) => {
      const application = toDoc(row, 'application_id', 'application_doc');

      if (row.opportunity_doc) {
        const opportunity = toDoc(row, 'opportunity_id', 'opportunity_doc');
        if (row.ngo_doc) {
          const ngo = toDoc(row, 'ngo_id', 'ngo_doc');
          opportunity.ngo = {
            id: ngo.id,
            name: ngo.name,
            logo: ngo.logo,
            location: ngo.location,
            verified: ngo.verified
          };
        } else {
          opportunity.ngo = null;
        }
        application.opportunity = opportunity;
      }

      if (row.certificate_doc) {
        const certificate = toDoc(row, 'certificate_id', 'certificate_doc');
        application.certificate = {
          id: certificate.id,
          certificateNumber: certificate.certificateNumber,
          issuedAt: certificate.issuedAt,
          type: certificate.type
        };
      } else {
        application.certificate = null;
      }

      return application;
    });
    res.json(applications);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// NGO queue: volunteer certificate approvals
router.get('/approvals/ngo/pending', auth(['ngo']), async (req, res) => {
  try {
    const applications = await VolunteerApplication.find({
      ngo: req.user.id,
      status: 'completed',
      certificateApprovalStatus: 'pending'
    })
      .populate('user', 'name email mobileNumber')
      .populate('opportunity', 'title location commitment')
      .sort({ certificateApprovalRequestedAt: 1, completedAt: 1 });
    res.json(applications);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// NGO volunteer requests + summary
router.get('/ngo/requests', auth(['ngo']), async (req, res) => {
  try {
    const ngoId = req.user.id;
    const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 150);

    const {
      rows: [summaryRow = {}]
    } = await query(
      `
      SELECT
        COUNT(*) AS total_count,
        COUNT(*) FILTER (
          WHERE COALESCE(NULLIF(source_doc->>'status', ''), 'applied') = 'applied'
        ) AS applied_count,
        COUNT(*) FILTER (
          WHERE COALESCE(NULLIF(source_doc->>'status', ''), 'applied') = 'assigned'
        ) AS assigned_count,
        COUNT(*) FILTER (
          WHERE COALESCE(NULLIF(source_doc->>'status', ''), 'applied') = 'completed'
        ) AS completed_count,
        COUNT(*) FILTER (
          WHERE COALESCE(NULLIF(source_doc->>'status', ''), 'applied') = 'withdrawn'
        ) AS withdrawn_count,
        COUNT(*) FILTER (
          WHERE COALESCE(NULLIF(source_doc->>'status', ''), 'applied') = 'completed'
            AND COALESCE(NULLIF(source_doc->>'certificateApprovalStatus', ''), 'not_requested') = 'pending'
        ) AS pending_certificate_count
      FROM volunteer_applications_rel
      WHERE source_doc->>'ngo' = $1
      `,
      [ngoId]
    );

    const { rows } = await query(
      `
      SELECT
        va.external_id AS application_id,
        va.source_doc AS application_doc,
        u.external_id AS user_id,
        u.source_doc AS user_doc,
        vo.external_id AS opportunity_id,
        vo.source_doc AS opportunity_doc
      FROM volunteer_applications_rel va
      LEFT JOIN users_rel u ON u.external_id = NULLIF(va.source_doc->>'user', '')
      LEFT JOIN volunteer_opportunities_rel vo ON vo.external_id = NULLIF(va.source_doc->>'opportunity', '')
      WHERE va.source_doc->>'ngo' = $1
      ORDER BY va.created_at DESC
      LIMIT $2
      `,
      [ngoId, limit]
    );

    const requests = rows.map((row) => {
      const application = toDoc(row, 'application_id', 'application_doc');

      if (row.user_doc) {
        const user = toDoc(row, 'user_id', 'user_doc');
        application.user = {
          id: user.id,
          name: user.name,
          email: user.email,
          mobileNumber: user.mobileNumber
        };
      } else {
        application.user = null;
      }

      if (row.opportunity_doc) {
        const opportunity = toDoc(row, 'opportunity_id', 'opportunity_doc');
        application.opportunity = {
          id: opportunity.id,
          title: opportunity.title,
          location: opportunity.location,
          commitment: opportunity.commitment
        };
      } else {
        application.opportunity = null;
      }

      return application;
    });

    res.json({
      summary: {
        totalRequests: Number(summaryRow.total_count || 0),
        appliedCount: Number(summaryRow.applied_count || 0),
        assignedCount: Number(summaryRow.assigned_count || 0),
        completedCount: Number(summaryRow.completed_count || 0),
        withdrawnCount: Number(summaryRow.withdrawn_count || 0),
        pendingCertificateCount: Number(summaryRow.pending_certificate_count || 0)
      },
      requests
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get opportunities posted by an NGO
router.get('/ngo/:id', async (req, res) => {
  try {
    const opportunities = await VolunteerOpportunity.find({ ngo: req.params.id })
      .sort({ createdAt: -1 });
    res.json(opportunities);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create volunteer opportunity (NGO only)
router.post('/', auth(['ngo']), async (req, res) => {
  try {
    const data = req.body;
    data.ngo = req.user.id;
    const opportunity = await VolunteerOpportunity.create(data);
    res.json(opportunity);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Apply to volunteer (User only)
router.post('/:id/apply', auth(['user']), async (req, res) => {
  try {
    const opportunity = await VolunteerOpportunity.findById(req.params.id).populate('ngo', 'name');
    if (!opportunity) return res.status(404).json({ message: 'Opportunity not found' });

    const user = await User.findById(req.user.id).select('name email mobileNumber');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const {
      fullName,
      email,
      phone,
      preferredActivities,
      availability,
      motivation
    } = req.body || {};

    const chosenName = (fullName || user.name || '').trim();
    const chosenEmail = (email || user.email || '').trim().toLowerCase();
    if (!chosenName || !chosenEmail) {
      return res.status(400).json({ message: 'Name and email are required to apply.' });
    }

    const preferred = cleanArray(preferredActivities);
    const assignedTask = chooseAssignedTask(opportunity, preferred);

    let application = await VolunteerApplication.findOne({
      opportunity: opportunity.id,
      user: req.user.id
    });

    if (application && application.status === 'completed') {
      return res.status(400).json({ message: 'This opportunity is already completed for your profile.' });
    }

    if (application && application.status !== 'withdrawn') {
      return res.status(400).json({ message: 'You already applied for this opportunity.' });
    }

    if (application && application.status === 'withdrawn') {
      application.fullName = chosenName;
      application.email = chosenEmail;
      application.phone = phone || user.mobileNumber || '';
      application.preferredActivities = preferred;
      application.availability = availability || '';
      application.motivation = motivation || '';
      application.assignedTask = assignedTask;
      application.status = 'assigned';
      application.appliedAt = new Date();
      await application.save();
    } else {
      application = await VolunteerApplication.create({
        user: req.user.id,
        ngo: opportunity.ngo?.id || opportunity.ngo,
        opportunity: opportunity.id,
        fullName: chosenName,
        email: chosenEmail,
        phone: phone || user.mobileNumber || '',
        preferredActivities: preferred,
        availability: availability || '',
        motivation: motivation || '',
        assignedTask,
        status: 'assigned'
      });
    }

    const alreadyApplied = opportunity.applicants.some((id) => id.toString() === req.user.id);
    if (!alreadyApplied) {
      opportunity.applicants.push(req.user.id);
      await opportunity.save();
    }

    res.json({
      message: 'Volunteer application submitted successfully.',
      application
    });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(400).json({ message: 'You already applied for this opportunity.' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Withdraw volunteer application
router.delete('/:id/withdraw', auth(['user']), async (req, res) => {
  try {
    const opportunity = await VolunteerOpportunity.findById(req.params.id);
    if (!opportunity) return res.status(404).json({ message: 'Opportunity not found' });
    
    opportunity.applicants = opportunity.applicants.filter(
      id => id.toString() !== req.user.id
    );
    await opportunity.save();

    await query(
      `
      UPDATE volunteer_applications_rel
      SET source_doc = jsonb_set(source_doc, '{status}', to_jsonb('withdrawn'::text), true),
          updated_at = NOW()
      WHERE source_doc->>'opportunity' = $1
        AND source_doc->>'user' = $2
        AND COALESCE(NULLIF(source_doc->>'status', ''), 'applied') <> 'completed'
      `,
      [req.params.id, req.user.id]
    );

    res.json({ message: 'Application withdrawn' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark volunteer activity as completed and request NGO approval
router.post('/:id/complete', auth(['user']), async (req, res) => {
  try {
    const opportunity = await VolunteerOpportunity.findById(req.params.id).populate('ngo', 'name');
    if (!opportunity) return res.status(404).json({ message: 'Opportunity not found' });

    const { rows: [applicationRow] } = await query(
      `
      SELECT external_id
      FROM volunteer_applications_rel
      WHERE source_doc->>'opportunity' = $1
        AND source_doc->>'user' = $2
        AND COALESCE(NULLIF(source_doc->>'status', ''), 'applied') = ANY($3::text[])
      LIMIT 1
      `,
      [req.params.id, req.user.id, ['applied', 'assigned', 'completed']]
    );

    const application = applicationRow
      ? await VolunteerApplication.findById(applicationRow.external_id)
      : null;

    if (!application) {
      return res.status(400).json({ message: 'No active application found for this opportunity.' });
    }

    if (application.status === 'completed' && application.certificateApprovalStatus === 'approved') {
      const existingCertificate = application.certificate
        ? await Certificate.findById(application.certificate).select('certificateNumber')
        : null;
      return res.json({
        message: 'Volunteer activity already completed and approved.',
        certificate: existingCertificate
      });
    }

    const hours = Number(req.body?.activityHours || 0);
    application.status = 'completed';
    application.completedAt = new Date();
    application.activityHours = Number.isFinite(hours) && hours > 0 ? Math.round(hours * 10) / 10 : 0;
    application.certificateApprovalStatus = 'pending';
    application.certificateApprovalRequestedAt = new Date();
    await application.save();

    res.json({
      message: 'Volunteer completion recorded. Waiting for NGO approval before certificate issuance.',
      application
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// NGO decision on volunteer certificate request
router.post('/applications/:applicationId/certificate/decision', auth(['ngo']), async (req, res) => {
  try {
    const { decision, note } = req.body || {};
    const normalizedDecision = String(decision || '').toLowerCase();
    if (!['approve', 'reject'].includes(normalizedDecision)) {
      return res.status(400).json({ message: 'Decision must be either approve or reject.' });
    }

    const application = await VolunteerApplication.findOne({
      id: req.params.applicationId,
      ngo: req.user.id,
      status: 'completed'
    });
    if (!application) return res.status(404).json({ message: 'Volunteer application not found' });
    if (application.certificateApprovalStatus === 'approved' && normalizedDecision === 'reject') {
      return res.status(400).json({ message: 'Certificate already issued and cannot be rejected.' });
    }

    if (normalizedDecision === 'reject') {
      application.certificateApprovalStatus = 'rejected';
      application.certificateApprovalReviewedAt = new Date();
      application.certificateApprovalNote = note || '';
      application.certificateApprovedBy = req.user.id;
      await application.save();
      return res.json({ message: 'Certificate request rejected.', application });
    }

    if (application.certificateApprovalStatus !== 'approved') {
      application.certificateApprovalStatus = 'approved';
      application.certificateApprovalReviewedAt = new Date();
      application.certificateApprovalNote = note || '';
      application.certificateApprovedBy = req.user.id;
      await application.save();
    }

    const certificate = await issueVolunteerCertificate(application.id);
    res.json({
      message: 'Certificate approved and issued.',
      application,
      certificate
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete opportunity (NGO only)
router.delete('/:id', auth(['ngo']), async (req, res) => {
  try {
    const opportunity = await VolunteerOpportunity.findById(req.params.id);
    if (!opportunity) return res.status(404).json({ message: 'Opportunity not found' });
    
    if (opportunity.ngo.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    await VolunteerOpportunity.findByIdAndDelete(req.params.id);
    await VolunteerApplication.deleteMany({ opportunity: req.params.id });
    res.json({ message: 'Opportunity deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
