const express = require('express');
const router = express.Router();
const Donation = require('../models/Donation');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const Certificate = require('../models/Certificate');
const auth = require('../middleware/auth');
const {
  PAYMENT_METHOD_LABELS,
  generateCertificateNumber,
  formatDate
} = require('../utils/certificateTemplates');
const {
  getActiveProvider,
  createPaymentOrder,
  verifyPayment
} = require('../services/paymentGateway');
const { query } = require('../db/postgres');

const RECEIPT_PREFIX = 'RCP';

const makeReceiptNumber = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${RECEIPT_PREFIX}-${datePart}-${randomPart}`;
};

const normalizeAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
};

const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();

const normalizePaymentDetails = (paymentMethod, payload = {}) => {
  const details = payload || {};

  if (paymentMethod === 'upi') {
    const upiId = String(details.upiId || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,}@[a-z]{2,}$/i.test(upiId)) {
      const error = new Error('Please provide a valid UPI ID.');
      error.status = 400;
      throw error;
    }
    const [handle, domain] = upiId.split('@');
    const maskedHandle = handle.length <= 2
      ? `${handle[0] || ''}*`
      : `${handle.slice(0, 2)}${'*'.repeat(Math.max(handle.length - 2, 1))}`;
    return {
      upiIdMasked: `${maskedHandle}@${domain}`
    };
  }

  if (paymentMethod === 'card') {
    const cardNumber = String(details.cardNumber || '').replace(/\s+/g, '');
    const cardHolderName = String(details.cardHolderName || '').trim();
    const expiry = String(details.expiry || '').trim();
    const cvv = String(details.cvv || '').trim();

    if (!/^\d{13,19}$/.test(cardNumber)) {
      const error = new Error('Please provide a valid card number.');
      error.status = 400;
      throw error;
    }
    if (cardHolderName.length < 2) {
      const error = new Error('Please provide the cardholder name.');
      error.status = 400;
      throw error;
    }
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) {
      const error = new Error('Please provide card expiry in MM/YY format.');
      error.status = 400;
      throw error;
    }
    if (!/^\d{3,4}$/.test(cvv)) {
      const error = new Error('Please provide a valid card CVV.');
      error.status = 400;
      throw error;
    }

    return {
      cardHolderName,
      cardLast4: cardNumber.slice(-4),
      cardBrand: String(details.cardBrand || '').trim() || 'Card'
    };
  }

  if (paymentMethod === 'netbanking') {
    const netbankingBank = String(details.netbankingBank || '').trim();
    if (netbankingBank.length < 2) {
      const error = new Error('Please select a valid bank for net banking.');
      error.status = 400;
      throw error;
    }
    return { netbankingBank };
  }

  return {};
};

const createPendingDonationWithOrder = async ({
  campaignId,
  userId,
  amount,
  paymentMethod,
  donorName,
  donorEmail,
  donorPhone,
  message,
  paymentMeta,
  metadata = {}
}) => {
  const camp = await Campaign.findById(campaignId).populate('ngo', 'name');
  if (!camp) {
    const error = new Error('Campaign not found');
    error.status = 404;
    throw error;
  }

  const user = await User.findById(userId).select('name email mobileNumber');
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  const receiptRef = makeReceiptNumber();
  const gatewayOrder = await createPaymentOrder({
    amount,
    currency: 'INR',
    receipt: receiptRef,
    metadata: {
      campaignId: String(camp.id),
      campaignTitle: camp.title,
      userId: String(userId),
      ...metadata
    }
  });

  const donation = await Donation.create({
    user: userId,
    ngo: camp.ngo?.id || camp.ngo,
    campaign: camp.id,
    amount,
    paymentMethod,
    donorName: donorName || user.name,
    donorEmail: normalizeEmail(donorEmail) || user.email,
    donorPhone: donorPhone || user.mobileNumber,
    message: message || '',
    paymentMeta: paymentMeta || {},
    gatewayProvider: gatewayOrder.provider,
    gatewayOrderId: gatewayOrder.orderId,
    status: 'pending'
  });

  return {
    donation,
    campaign: camp,
    user,
    gatewayOrder
  };
};

const finalizeCompletedDonation = async ({
  donation,
  paymentId,
  signature,
  orderId
}) => {
  if (donation.status === 'completed') return donation;

  const verifyResult = verifyPayment({
    provider: donation.gatewayProvider,
    orderId: orderId || donation.gatewayOrderId,
    paymentId,
    signature
  });

  if (!verifyResult.verified) {
    donation.status = 'failed';
    donation.gatewayPaymentId = paymentId || donation.gatewayPaymentId;
    donation.gatewaySignature = signature || donation.gatewaySignature;
    await donation.save();
    const error = new Error(verifyResult.reason || 'Payment verification failed.');
    error.status = 400;
    throw error;
  }

  const campaignId = donation.campaign?.id || donation.campaign;
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) {
    const error = new Error('Campaign not found');
    error.status = 404;
    throw error;
  }

  donation.status = 'completed';
  donation.transactionId = paymentId || donation.transactionId;
  donation.gatewayPaymentId = paymentId || donation.gatewayPaymentId;
  donation.gatewaySignature = signature || donation.gatewaySignature;
  donation.paymentVerifiedAt = new Date();
  donation.receiptNumber = donation.receiptNumber || makeReceiptNumber();
  donation.receiptIssuedAt = donation.receiptIssuedAt || new Date();
  if (donation.certificateApprovalStatus === 'not_requested') {
    donation.certificateApprovalStatus = 'pending';
    donation.certificateApprovalRequestedAt = new Date();
  }
  await donation.save();

  const currentAmount = Number(campaign.currentAmount || 0);
  campaign.currentAmount = currentAmount + Number(donation.amount || 0);
  await campaign.save();

  return donation;
};

const issueDonationCertificate = async (donationDoc) => {
  const donation = await Donation.findById(donationDoc.id)
    .populate('campaign', 'title')
    .populate('ngo', 'name')
    .populate('user', 'name email');
  if (!donation) throw new Error('Donation not found');

  if (donation.certificate) {
    const existing = await Certificate.findById(donation.certificate);
    return existing;
  }

  const certificate = await Certificate.create({
    user: donation.user?.id || donation.user,
    ngo: donation.ngo?.id || donation.ngo,
    campaign: donation.campaign?.id || donation.campaign,
    donation: donation.id,
    type: 'donation',
    title: 'Certificate of Generous Contribution',
    certificateNumber: generateCertificateNumber('donation'),
    metadata: {
      recipientName: donation.donorName || donation.user?.name,
      recipientEmail: donation.donorEmail || donation.user?.email,
      ngoName: donation.ngo?.name || 'Partner NGO',
      campaignTitle: donation.campaign?.title || 'Campaign',
      contributionAmount: donation.amount,
      paymentMethod: donation.paymentMethod
    }
  });

  donation.certificate = certificate.id;
  await donation.save();
  return certificate;
};

const mapReceiptPayload = (donation) => ({
  donationId: donation.id,
  receiptNumber: donation.receiptNumber,
  issuedAt: donation.receiptIssuedAt || donation.createdAt,
  amount: donation.amount,
  paymentMethod: PAYMENT_METHOD_LABELS[donation.paymentMethod] || donation.paymentMethod,
  paymentMeta: donation.paymentMeta || {},
  donorName: donation.donorName,
  donorEmail: donation.donorEmail,
  donorPhone: donation.donorPhone,
  campaignTitle: donation.campaign?.title || 'Campaign',
  ngoName: donation.ngo?.name || 'NGO',
  message: donation.message,
  printable: {
    title: 'Donation Receipt',
    lines: [
      `Receipt Number: ${donation.receiptNumber || '-'}`,
      `Date: ${formatDate(donation.receiptIssuedAt || donation.createdAt)}`,
      `Donor: ${donation.donorName || '-'}`,
      `Email: ${donation.donorEmail || '-'}`,
      `Campaign: ${donation.campaign?.title || '-'}`,
      `NGO: ${donation.ngo?.name || '-'}`,
      `Amount: Rs ${Number(donation.amount || 0).toLocaleString('en-IN')}`,
      `Payment Method: ${PAYMENT_METHOD_LABELS[donation.paymentMethod] || donation.paymentMethod || '-'}`,
      donation.paymentMeta?.upiIdMasked ? `UPI ID: ${donation.paymentMeta.upiIdMasked}` : null,
      donation.paymentMeta?.cardLast4 ? `Card: **** **** **** ${donation.paymentMeta.cardLast4}` : null,
      donation.paymentMeta?.netbankingBank ? `Bank: ${donation.paymentMeta.netbankingBank}` : null,
      donation.message ? `Message: ${donation.message}` : null
    ].filter(Boolean)
  }
});

const mapRowDoc = (row, idField, docField) => {
  const doc = row?.[docField] && typeof row[docField] === 'object' ? { ...row[docField] } : {};
  if (!doc.id) doc.id = row?.[idField];
  return doc;
};

// NGO donation transactions + summary
router.get('/ngo/transactions', auth(['ngo']), async (req, res) => {
  try {
    const ngoId = req.user.id;
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);

    const {
      rows: [summaryRow = {}]
    } = await query(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE COALESCE(NULLIF(source_doc->>'status', ''), 'pending') = 'completed'
        ) AS completed_count,
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(NULLIF(source_doc->>'status', ''), 'pending') = 'completed'
                THEN COALESCE(safe_numeric(source_doc->>'amount'), 0)
              ELSE 0
            END
          ),
          0
        ) AS total_completed_amount,
        COUNT(*) FILTER (
          WHERE COALESCE(NULLIF(source_doc->>'status', ''), 'pending') = 'completed'
            AND COALESCE(NULLIF(source_doc->>'certificateApprovalStatus', ''), 'not_requested') = 'pending'
        ) AS pending_certificate_count
      FROM donations_rel
      WHERE source_doc->>'ngo' = $1
      `,
      [ngoId]
    );

    const { rows } = await query(
      `
      SELECT
        d.external_id AS donation_id,
        d.source_doc AS donation_doc,
        u.external_id AS user_id,
        u.source_doc AS user_doc,
        c.external_id AS campaign_id,
        c.source_doc AS campaign_doc
      FROM donations_rel d
      LEFT JOIN users_rel u ON u.external_id = NULLIF(d.source_doc->>'user', '')
      LEFT JOIN campaigns_rel c ON c.external_id = NULLIF(d.source_doc->>'campaign', '')
      WHERE d.source_doc->>'ngo' = $1
      ORDER BY d.created_at DESC
      LIMIT $2
      `,
      [ngoId, limit]
    );

    const transactions = rows.map((row) => {
      const donation = mapRowDoc(row, 'donation_id', 'donation_doc');
      if (row.user_doc) {
        const user = mapRowDoc(row, 'user_id', 'user_doc');
        donation.user = {
          id: user.id,
          name: user.name,
          email: user.email,
          mobileNumber: user.mobileNumber
        };
      } else {
        donation.user = null;
      }

      if (row.campaign_doc) {
        const campaign = mapRowDoc(row, 'campaign_id', 'campaign_doc');
        donation.campaign = {
          id: campaign.id,
          title: campaign.title,
          category: campaign.category,
          location: campaign.location
        };
      } else {
        donation.campaign = null;
      }

      return donation;
    });

    res.json({
      summary: {
        completedCount: Number(summaryRow.completed_count || 0),
        totalCompletedAmount: Number(summaryRow.total_completed_amount || 0),
        pendingCertificateCount: Number(summaryRow.pending_certificate_count || 0)
      },
      transactions
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all donations for logged-in user
router.get('/my', auth(['user', 'ngo', 'admin']), async (req, res) => {
  try {
    const donations = await Donation.find({ user: req.user.id })
      .populate('ngo', 'name')
      .populate('campaign', 'title')
      .populate('certificate', 'certificateNumber type issuedAt')
      .sort({ createdAt: -1 });
    res.json(donations);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// NGO queue: certificate approvals for donations
router.get('/ngo/pending-approvals', auth(['ngo']), async (req, res) => {
  try {
    const donations = await Donation.find({
      ngo: req.user.id,
      status: 'completed',
      certificateApprovalStatus: 'pending'
    })
      .populate('user', 'name email mobileNumber')
      .populate('campaign', 'title')
      .sort({ certificateApprovalRequestedAt: 1, createdAt: 1 });
    res.json(donations);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// NGO decision on certificate request
router.post('/:id/certificate/decision', auth(['ngo']), async (req, res) => {
  try {
    const { decision, note } = req.body || {};
    const normalizedDecision = String(decision || '').toLowerCase();
    if (!['approve', 'reject'].includes(normalizedDecision)) {
      return res.status(400).json({ message: 'Decision must be either approve or reject.' });
    }

    const donation = await Donation.findOne({
      id: req.params.id,
      ngo: req.user.id,
      status: 'completed'
    });

    if (!donation) return res.status(404).json({ message: 'Donation not found' });
    if (donation.certificateApprovalStatus === 'approved' && normalizedDecision === 'approve') {
      const existing = donation.certificate ? await Certificate.findById(donation.certificate) : null;
      return res.json({
        message: 'Certificate already approved.',
        donation,
        certificate: existing
      });
    }
    if (donation.certificateApprovalStatus === 'approved' && normalizedDecision === 'reject') {
      return res.status(400).json({ message: 'Certificate already issued and cannot be rejected.' });
    }

    if (normalizedDecision === 'reject') {
      donation.certificateApprovalStatus = 'rejected';
      donation.certificateApprovalReviewedAt = new Date();
      donation.certificateApprovalNote = note || '';
      donation.certificateApprovedBy = req.user.id;
      await donation.save();
      return res.json({ message: 'Certificate request rejected.', donation });
    }

    donation.certificateApprovalStatus = 'approved';
    donation.certificateApprovalReviewedAt = new Date();
    donation.certificateApprovalNote = note || '';
    donation.certificateApprovedBy = req.user.id;
    await donation.save();

    const certificate = await issueDonationCertificate(donation);

    res.json({
      message: 'Certificate request approved and certificate issued.',
      donation,
      certificate
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Initiate donation payment order
router.post('/campaign/:id/initiate', auth(['user']), async (req, res) => {
  try {
    const {
      amount,
      paymentMethod,
      donorName,
      donorEmail,
      donorPhone,
      message,
      paymentDetails
    } = req.body || {};

    const amountValue = normalizeAmount(amount);
    if (!amountValue) {
      return res.status(400).json({ message: 'Please enter a valid donation amount.' });
    }

    const selectedMethod = paymentMethod || 'upi';
    if (!PAYMENT_METHOD_LABELS[selectedMethod]) {
      return res.status(400).json({ message: 'Invalid payment method.' });
    }
    const paymentMeta = normalizePaymentDetails(selectedMethod, paymentDetails);

    const { donation, gatewayOrder } = await createPendingDonationWithOrder({
      campaignId: req.params.id,
      userId: req.user.id,
      amount: amountValue,
      paymentMethod: selectedMethod,
      donorName,
      donorEmail,
      donorPhone,
      message,
      paymentMeta,
      metadata: {
        paymentMethod: selectedMethod
      }
    });

    res.json({
      message: 'Payment order created.',
      donation: {
        id: donation.id,
        amount: donation.amount,
        status: donation.status,
        paymentMethod: donation.paymentMethod
      },
      gatewayOrder
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

// Confirm payment and finalize donation
router.post('/:id/confirm', auth(['user']), async (req, res) => {
  try {
    const {
      orderId,
      paymentId,
      signature
    } = req.body || {};

    const donation = await Donation.findOne({ id: req.params.id, user: req.user.id })
      .populate('ngo', 'name')
      .populate('campaign', 'title');
    if (!donation) return res.status(404).json({ message: 'Donation not found' });

    if (donation.status === 'completed') {
      return res.json({
        message: 'Donation already confirmed.',
        donation,
        receipt: mapReceiptPayload(donation),
        certificateApprovalStatus: donation.certificateApprovalStatus,
        certificateId: donation.certificate || null
      });
    }

    await finalizeCompletedDonation({
      donation,
      orderId,
      paymentId: paymentId || `mock_payment_${Date.now().toString(36)}`,
      signature
    });

    const updated = await Donation.findById(donation.id)
      .populate('ngo', 'name')
      .populate('campaign', 'title');

    res.json({
      message: 'Payment verified and donation completed.',
      donation: updated,
      receipt: mapReceiptPayload(updated),
      certificateApprovalStatus: updated.certificateApprovalStatus,
      certificateId: updated.certificate || null
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

// Legacy one-step donation (mock fallback for compatibility)
router.post('/campaign/:id', auth(['user']), async (req, res) => {
  try {
    if (getActiveProvider() !== 'mock') {
      return res.status(409).json({
        message: 'Gateway checkout required for this payment provider.',
        next: 'Use /donations/campaign/:id/initiate then /donations/:id/confirm'
      });
    }

    const {
      amount,
      paymentMethod,
      donorName,
      donorEmail,
      donorPhone,
      message,
      paymentDetails
    } = req.body || {};
    const amountValue = normalizeAmount(amount);
    if (!amountValue) {
      return res.status(400).json({ message: 'Please enter a valid donation amount.' });
    }

    const selectedMethod = paymentMethod || 'upi';
    if (!PAYMENT_METHOD_LABELS[selectedMethod]) {
      return res.status(400).json({ message: 'Invalid payment method.' });
    }
    const paymentMeta = normalizePaymentDetails(selectedMethod, paymentDetails);

    const { donation } = await createPendingDonationWithOrder({
      campaignId: req.params.id,
      userId: req.user.id,
      amount: amountValue,
      paymentMethod: selectedMethod,
      donorName,
      donorEmail,
      donorPhone,
      message,
      paymentMeta
    });

    await finalizeCompletedDonation({
      donation,
      orderId: donation.gatewayOrderId,
      paymentId: `mock_payment_${Date.now().toString(36)}`,
      signature: 'mock_signature'
    });

    const updated = await Donation.findById(donation.id)
      .populate('ngo', 'name')
      .populate('campaign', 'title');

    res.json({
      message: 'Donation recorded successfully.',
      donation: updated,
      receipt: mapReceiptPayload(updated),
      certificateApprovalStatus: updated.certificateApprovalStatus
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

// Donation receipt
router.get('/:id/receipt', auth(['user']), async (req, res) => {
  try {
    const donation = await Donation.findOne({ id: req.params.id, user: req.user.id, status: 'completed' })
      .populate('campaign', 'title')
      .populate('ngo', 'name');
    if (!donation) return res.status(404).json({ message: 'Donation not found' });

    res.json(mapReceiptPayload(donation));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
