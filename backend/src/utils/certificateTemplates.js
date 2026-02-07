const PAYMENT_METHOD_LABELS = {
  card: 'Card',
  upi: 'UPI',
  netbanking: 'Net Banking',
  wallet: 'Wallet',
  'bank-transfer': 'Bank Transfer',
  cash: 'Cash'
};

const formatDate = (value) => {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
};

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toCertificateSlug = (certificate) => {
  const title = String(certificate.title || 'certificate')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${title || 'certificate'}-${certificate.certificateNumber || 'document'}.html`;
};

const makeCertificateNumber = (prefix) => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${datePart}-${randomPart}`;
};

const generateCertificateNumber = (type = 'generic') => {
  if (type === 'donation') return makeCertificateNumber('DON');
  if (type === 'volunteer') return makeCertificateNumber('VOL');
  return makeCertificateNumber('CERT');
};

const renderCertificateHtml = (certificate) => {
  const metadata = certificate?.metadata || {};
  const recipientName = escapeHtml(metadata.recipientName || 'Supporter');
  const ngoName = escapeHtml(metadata.ngoName || 'NGO Connect Partner');
  const campaignTitle = escapeHtml(metadata.campaignTitle || metadata.activityTitle || 'Community Initiative');
  const certificateNumber = escapeHtml(certificate.certificateNumber || 'N/A');
  const issueDate = escapeHtml(formatDate(certificate.issuedAt));
  const title = escapeHtml(certificate.title || 'Certificate');
  const paymentMethod = escapeHtml(
    PAYMENT_METHOD_LABELS[metadata.paymentMethod] || metadata.paymentMethod || 'Online'
  );
  const contributionAmount = Number(metadata.contributionAmount || 0);
  const contributionText = contributionAmount > 0
    ? `₹${contributionAmount.toLocaleString('en-IN')}`
    : '';
  const assignedTask = escapeHtml(metadata.assignedTask || 'Volunteer Service');
  const completionDate = metadata.completionDate ? escapeHtml(formatDate(metadata.completionDate)) : '';
  const hours = Number(metadata.activityHours || 0);
  const isDonation = certificate.type === 'donation';

  const bodyCopy = isDonation
    ? `In recognition of your generous contribution of <strong>${contributionText}</strong> to <strong>${campaignTitle}</strong> led by <strong>${ngoName}</strong>.`
    : `In recognition of your committed volunteer service for <strong>${campaignTitle}</strong> with <strong>${ngoName}</strong>, successfully completing the task: <strong>${assignedTask}</strong>.`;

  const secondaryCopy = isDonation
    ? `Payment Method: <strong>${paymentMethod}</strong>`
    : `Completion Date: <strong>${completionDate || issueDate}</strong>${hours > 0 ? ` | Hours Served: <strong>${hours}</strong>` : ''}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      background: linear-gradient(145deg, #f7f9ff, #fefaf2);
      font-family: Georgia, "Times New Roman", serif;
      color: #1f2937;
    }
    .sheet {
      max-width: 980px;
      margin: 0 auto;
      background: #ffffff;
      border: 12px solid #0f766e;
      border-radius: 20px;
      padding: 48px 52px;
      box-shadow: 0 16px 48px rgba(15, 118, 110, 0.2);
      position: relative;
      overflow: hidden;
    }
    .sheet::before {
      content: "";
      position: absolute;
      top: -120px;
      right: -120px;
      width: 260px;
      height: 260px;
      border-radius: 50%;
      background: rgba(13, 148, 136, 0.08);
    }
    .brand {
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: #0f766e;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 12px;
      position: relative;
      z-index: 1;
    }
    h1 {
      margin: 0;
      font-size: 42px;
      line-height: 1.1;
      color: #0f172a;
      position: relative;
      z-index: 1;
    }
    .subtitle {
      margin: 10px 0 30px;
      font-size: 18px;
      color: #475569;
      position: relative;
      z-index: 1;
    }
    .recipient {
      margin: 0 0 20px;
      font-size: 34px;
      font-weight: 700;
      color: #0b3d36;
      border-bottom: 2px solid #d1fae5;
      display: inline-block;
      padding-bottom: 8px;
      position: relative;
      z-index: 1;
    }
    .copy {
      margin: 0 0 14px;
      font-size: 20px;
      line-height: 1.6;
      color: #1f2937;
      position: relative;
      z-index: 1;
    }
    .meta {
      margin-top: 28px;
      padding-top: 18px;
      border-top: 1px solid #cbd5e1;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
      font-size: 15px;
      color: #334155;
      position: relative;
      z-index: 1;
    }
    .value { font-weight: 700; color: #0f172a; }
    .actions {
      margin-top: 24px;
      text-align: center;
      font-family: "Segoe UI", Arial, sans-serif;
    }
    .actions button {
      border: none;
      border-radius: 10px;
      background: #0f766e;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      padding: 10px 18px;
      cursor: pointer;
    }
    @media print {
      body { padding: 0; background: #fff; }
      .sheet { box-shadow: none; border-width: 8px; min-height: 100vh; }
      .actions { display: none; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <p class="brand">NGO Connect</p>
    <h1>${title}</h1>
    <p class="subtitle">This document certifies the impact made through NGO Connect.</p>
    <p class="recipient">${recipientName}</p>
    <p class="copy">${bodyCopy}</p>
    <p class="copy">${secondaryCopy}</p>
    <section class="meta">
      <div>Certificate Number<br /><span class="value">${certificateNumber}</span></div>
      <div>Issued On<br /><span class="value">${issueDate}</span></div>
      <div>Organization<br /><span class="value">${ngoName}</span></div>
      <div>Activity<br /><span class="value">${campaignTitle}</span></div>
    </section>
    <div class="actions"><button type="button" onclick="window.print()">Print Certificate</button></div>
  </main>
</body>
</html>`;
};

module.exports = {
  PAYMENT_METHOD_LABELS,
  formatDate,
  toCertificateSlug,
  generateCertificateNumber,
  renderCertificateHtml
};
