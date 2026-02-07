import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getDonationReceipt, getCertificateById } from '../services/api';
import { getUserRole } from '../utils/auth';
import { processDonationWithGateway } from '../utils/paymentGateway';

const paymentOptions = [
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'netbanking', label: 'Net Banking' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'bank-transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' }
];

const netbankingBanks = [
  'State Bank of India',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Canara Bank'
];

const emptyPaymentDetails = {
  upiId: '',
  cardHolderName: '',
  cardNumber: '',
  expiry: '',
  cvv: '',
  netbankingBank: ''
};

const openHtmlWindow = (windowRef, html) => {
  const target = windowRef || window.open('', '_blank');
  if (!target) return false;
  target.document.open();
  target.document.write(html);
  target.document.close();
  return true;
};

const buildReceiptHtml = (receipt) => {
  const lines = receipt?.printable?.lines || [];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Donation Receipt</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; padding: 24px; }
    .sheet { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px; }
    h1 { margin-top: 0; font-size: 28px; }
    p { margin: 10px 0; font-size: 16px; }
    .actions { margin-top: 20px; }
    button { border: none; border-radius: 8px; background: #1d4ed8; color: #fff; padding: 10px 16px; cursor: pointer; font-weight: 600; }
    @media print { .actions { display: none; } body { background: #fff; padding: 0; } .sheet { border: none; } }
  </style>
</head>
<body>
  <main class="sheet">
    <h1>Donation Receipt</h1>
    ${lines.map((line) => `<p>${line}</p>`).join('')}
    <div class="actions"><button type="button" onclick="window.print()">Print Receipt</button></div>
  </main>
</body>
</html>`;
};

export default function Donate() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [location, setLocation] = useState('');
  const [amounts, setAmounts] = useState({});
  const [paymentMethods, setPaymentMethods] = useState({});
  const [paymentDetailsByCampaign, setPaymentDetailsByCampaign] = useState({});
  const [messages, setMessages] = useState({});
  const [status, setStatus] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [actionsLoading, setActionsLoading] = useState({});
  const [latestTransactions, setLatestTransactions] = useState({});
  const isAuthenticated = !!localStorage.getItem('token');
  const role = getUserRole();
  const isUser = role === 'user';

  useEffect(() => {
    setLoading(true);
    api.get('/campaigns')
      .then((res) => setCampaigns(res.data))
      .catch(() => setError('Failed to load campaigns.'))
      .finally(() => setLoading(false));
  }, []);

  const donationCampaigns = useMemo(() => campaigns.filter((c) => (c.goalAmount || 0) > 0), [campaigns]);

  const filtered = useMemo(() => {
    return donationCampaigns.filter((c) => {
      const matchesSearch = c.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLocation = !location || (c.location || '').toLowerCase().includes(location.toLowerCase());
      return matchesSearch && matchesLocation;
    });
  }, [donationCampaigns, searchTerm, location]);

  const handleDonate = async (campaignId) => {
    const rawAmount = amounts[campaignId];
    const amountValue = Number(rawAmount || 0);
    if (!amountValue || amountValue <= 0) {
      setStatus((prev) => ({ ...prev, [campaignId]: 'Enter a valid amount.' }));
      return;
    }

    const paymentMethod = paymentMethods[campaignId] || 'upi';
    const donorMessage = (messages[campaignId] || '').trim();
    const details = paymentDetailsByCampaign[campaignId] || emptyPaymentDetails;
    let paymentDetails = {};

    if (paymentMethod === 'upi') {
      const upiId = String(details.upiId || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{2,}@[a-z]{2,}$/i.test(upiId)) {
        setStatus((prev) => ({ ...prev, [campaignId]: 'Please enter a valid UPI ID.' }));
        return;
      }
      paymentDetails = { upiId };
    }

    if (paymentMethod === 'card') {
      const cardNumber = String(details.cardNumber || '').replace(/\s+/g, '');
      const cardHolderName = String(details.cardHolderName || '').trim();
      const expiry = String(details.expiry || '').trim();
      const cvv = String(details.cvv || '').trim();

      if (cardHolderName.length < 2) {
        setStatus((prev) => ({ ...prev, [campaignId]: 'Please enter the cardholder name.' }));
        return;
      }
      if (!/^\d{13,19}$/.test(cardNumber)) {
        setStatus((prev) => ({ ...prev, [campaignId]: 'Please enter a valid card number.' }));
        return;
      }
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) {
        setStatus((prev) => ({ ...prev, [campaignId]: 'Please enter card expiry in MM/YY format.' }));
        return;
      }
      if (!/^\d{3,4}$/.test(cvv)) {
        setStatus((prev) => ({ ...prev, [campaignId]: 'Please enter a valid CVV.' }));
        return;
      }
      paymentDetails = {
        cardHolderName,
        cardNumber,
        expiry,
        cvv
      };
    }

    if (paymentMethod === 'netbanking') {
      const netbankingBank = String(details.netbankingBank || '').trim();
      if (netbankingBank.length < 2) {
        setStatus((prev) => ({ ...prev, [campaignId]: 'Please select your net banking bank.' }));
        return;
      }
      paymentDetails = { netbankingBank };
    }

    setSubmitting((prev) => ({ ...prev, [campaignId]: true }));
    setStatus((prev) => ({ ...prev, [campaignId]: '' }));
    try {
      const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId);
      const result = await processDonationWithGateway({
        campaignId,
        amount: amountValue,
        paymentMethod,
        paymentDetails,
        preferredMethod: paymentMethod,
        message: donorMessage,
        campaignTitle: selectedCampaign?.title
      });
      const donation = result?.confirmation?.donation;
      const receipt = result?.confirmation?.receipt;
      const approvalStatus = result?.confirmation?.certificateApprovalStatus;
      const certificateId = result?.confirmation?.certificateId;

      setCampaigns((prev) => prev.map((c) => {
        if (c.id !== campaignId) return c;
        const current = Number(c.currentAmount || 0);
        return { ...c, currentAmount: current + amountValue };
      }));

      setLatestTransactions((prev) => ({
        ...prev,
        [campaignId]: {
          donationId: donation?.id,
          receiptNumber: receipt?.receiptNumber,
          certificateId: certificateId || null,
          certificateNumber: '',
          certificateApprovalStatus: approvalStatus || 'pending'
        }
      }));

      setAmounts((prev) => ({ ...prev, [campaignId]: '' }));
      setMessages((prev) => ({ ...prev, [campaignId]: '' }));
      setPaymentDetailsByCampaign((prev) => ({
        ...prev,
        [campaignId]: emptyPaymentDetails
      }));
      setStatus((prev) => ({
        ...prev,
        [campaignId]: approvalStatus === 'approved'
          ? `Donation successful. Receipt: ${receipt?.receiptNumber || 'Generated'}`
          : `Donation successful. Receipt: ${receipt?.receiptNumber || 'Generated'}. Certificate will be issued after NGO approval.`
      }));
    } catch (err) {
      setStatus((prev) => ({
        ...prev,
        [campaignId]: err.response?.data?.message || err.message || 'Donation failed. Please try again.'
      }));
    }
    setSubmitting((prev) => ({ ...prev, [campaignId]: false }));
  };

  const withActionLoading = async (campaignId, fn) => {
    setActionsLoading((prev) => ({ ...prev, [campaignId]: true }));
    try {
      await fn();
    } finally {
      setActionsLoading((prev) => ({ ...prev, [campaignId]: false }));
    }
  };

  const viewReceipt = async (campaignId) => {
    const txn = latestTransactions[campaignId];
    if (!txn?.donationId) return;

    await withActionLoading(campaignId, async () => {
      const viewer = window.open('', '_blank');
      if (!viewer) {
        setStatus((prev) => ({ ...prev, [campaignId]: 'Please allow popups to view receipt.' }));
        return;
      }
      viewer.document.write('<p style="font-family: Arial, sans-serif; padding: 20px;">Loading receipt...</p>');
      const res = await getDonationReceipt(txn.donationId);
      openHtmlWindow(viewer, buildReceiptHtml(res.data));
    });
  };

  const viewCertificate = async (campaignId) => {
    const txn = latestTransactions[campaignId];
    if (!txn?.certificateId) return;

    await withActionLoading(campaignId, async () => {
      const viewer = window.open('', '_blank');
      if (!viewer) {
        setStatus((prev) => ({ ...prev, [campaignId]: 'Please allow popups to view certificate.' }));
        return;
      }
      viewer.document.write('<p style="font-family: Arial, sans-serif; padding: 20px;">Loading certificate...</p>');
      const res = await getCertificateById(txn.certificateId);
      openHtmlWindow(viewer, res?.data?.html || '<p>Unable to load certificate.</p>');
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow p-8 mb-8">
          <h1 className="text-4xl font-extrabold text-gray-900">Donate</h1>
          <p className="text-gray-600 mt-2">Support campaigns, choose a payment method, and receive an instant receipt and certificate.</p>
          {!isAuthenticated && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to="/login" className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700">
                Login to Donate
              </Link>
              <Link to="/register" className="px-4 py-2 rounded-lg border border-red-600 text-red-600 font-semibold hover:bg-red-50">
                Create Account
              </Link>
            </div>
          )}
          {isAuthenticated && !isUser && (
            <div className="mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800">
              Donations are available for user accounts only. Please login as a user to contribute.
            </div>
          )}
        </div>

        {isUser && (
          <div className="bg-white rounded-xl shadow p-6 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by title or description"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Filter by location"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        )}

        {isUser && (
          <>
            {loading ? (
              <div className="text-center py-12">Loading campaigns...</div>
            ) : error ? (
              <div className="text-center text-red-600 py-12">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No fundraising campaigns found.</div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filtered.map((campaign) => {
                  const goal = Number(campaign.goalAmount || 0);
                  const current = Number(campaign.currentAmount || 0);
                  const progress = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
                  const latest = latestTransactions[campaign.id];
                  const processingAction = actionsLoading[campaign.id];
                  return (
                    <div key={campaign.id} className="bg-white rounded-lg shadow p-6 flex flex-col">
                      <h3 className="text-lg font-bold text-gray-900">{campaign.title}</h3>
                      <p className="text-sm text-gray-500 mt-1">{campaign.ngo?.name || 'NGO'}</p>
                      <p className="text-gray-600 mt-3 line-clamp-3">{campaign.description || 'No description available.'}</p>
                      <div className="mt-4">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className="bg-green-500 h-2 rounded-full" style={{ width: `${progress}%` }}></div>
                        </div>
                        <div className="flex justify-between text-sm text-gray-600 mt-1">
                          <span>₹{current.toLocaleString()} raised</span>
                          <span>₹{goal.toLocaleString()} goal</span>
                        </div>
                      </div>
                      <div className="mt-4">
                        {isAuthenticated ? (
                          <div className="space-y-2">
                            <input
                              type="number"
                              min="1"
                              placeholder="Enter amount"
                              value={amounts[campaign.id] || ''}
                              onChange={(e) => setAmounts((prev) => ({ ...prev, [campaign.id]: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                            <select
                              value={paymentMethods[campaign.id] || 'upi'}
                              onChange={(e) => setPaymentMethods((prev) => ({ ...prev, [campaign.id]: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            >
                              {paymentOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                            {(paymentMethods[campaign.id] || 'upi') === 'upi' && (
                              <input
                                type="text"
                                placeholder="Enter UPI ID (example@upi)"
                                value={(paymentDetailsByCampaign[campaign.id] || emptyPaymentDetails).upiId}
                                onChange={(e) => setPaymentDetailsByCampaign((prev) => ({
                                  ...prev,
                                  [campaign.id]: {
                                    ...(prev[campaign.id] || emptyPaymentDetails),
                                    upiId: e.target.value
                                  }
                                }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            )}
                            {(paymentMethods[campaign.id] || 'upi') === 'card' && (
                              <div className="grid grid-cols-1 gap-2">
                                <input
                                  type="text"
                                  placeholder="Cardholder Name"
                                  value={(paymentDetailsByCampaign[campaign.id] || emptyPaymentDetails).cardHolderName}
                                  onChange={(e) => setPaymentDetailsByCampaign((prev) => ({
                                    ...prev,
                                    [campaign.id]: {
                                      ...(prev[campaign.id] || emptyPaymentDetails),
                                      cardHolderName: e.target.value
                                    }
                                  }))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                />
                                <input
                                  type="text"
                                  placeholder="Card Number"
                                  value={(paymentDetailsByCampaign[campaign.id] || emptyPaymentDetails).cardNumber}
                                  onChange={(e) => setPaymentDetailsByCampaign((prev) => ({
                                    ...prev,
                                    [campaign.id]: {
                                      ...(prev[campaign.id] || emptyPaymentDetails),
                                      cardNumber: e.target.value
                                    }
                                  }))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    placeholder="MM/YY"
                                    value={(paymentDetailsByCampaign[campaign.id] || emptyPaymentDetails).expiry}
                                    onChange={(e) => setPaymentDetailsByCampaign((prev) => ({
                                      ...prev,
                                      [campaign.id]: {
                                        ...(prev[campaign.id] || emptyPaymentDetails),
                                        expiry: e.target.value
                                      }
                                    }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                  />
                                  <input
                                    type="password"
                                    placeholder="CVV"
                                    value={(paymentDetailsByCampaign[campaign.id] || emptyPaymentDetails).cvv}
                                    onChange={(e) => setPaymentDetailsByCampaign((prev) => ({
                                      ...prev,
                                      [campaign.id]: {
                                        ...(prev[campaign.id] || emptyPaymentDetails),
                                        cvv: e.target.value
                                      }
                                    }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                  />
                                </div>
                              </div>
                            )}
                            {(paymentMethods[campaign.id] || 'upi') === 'netbanking' && (
                              <select
                                value={(paymentDetailsByCampaign[campaign.id] || emptyPaymentDetails).netbankingBank}
                                onChange={(e) => setPaymentDetailsByCampaign((prev) => ({
                                  ...prev,
                                  [campaign.id]: {
                                    ...(prev[campaign.id] || emptyPaymentDetails),
                                    netbankingBank: e.target.value
                                  }
                                }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              >
                                <option value="">Select Bank</option>
                                {netbankingBanks.map((bank) => (
                                  <option key={bank} value={bank}>{bank}</option>
                                ))}
                              </select>
                            )}
                            <p className="text-xs text-gray-500">
                              Card CVV and full card number are only used for validation and gateway checkout.
                            </p>
                            <textarea
                              rows={2}
                              placeholder="Message to NGO (optional)"
                              value={messages[campaign.id] || ''}
                              onChange={(e) => setMessages((prev) => ({ ...prev, [campaign.id]: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                            <button
                              onClick={() => handleDonate(campaign.id)}
                              disabled={submitting[campaign.id]}
                              className="w-full px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:bg-red-400"
                            >
                              {submitting[campaign.id] ? 'Processing...' : 'Donate Now'}
                            </button>
                            {latest?.receiptNumber && (
                              <div className="p-3 border border-emerald-200 bg-emerald-50 rounded-lg">
                                <p className="text-sm font-semibold text-emerald-800">Receipt: {latest.receiptNumber}</p>
                                {latest.certificateNumber && (
                                  <p className="text-xs text-emerald-700 mt-1">Certificate: {latest.certificateNumber}</p>
                                )}
                                {!latest.certificateId && (
                                  <p className="text-xs text-emerald-700 mt-1">
                                    Certificate status: {latest.certificateApprovalStatus === 'approved' ? 'Approved' : 'Pending NGO approval'}
                                  </p>
                                )}
                                <div className="mt-2 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => viewReceipt(campaign.id)}
                                    disabled={processingAction}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-md bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                  >
                                    View Receipt
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => viewCertificate(campaign.id)}
                                    disabled={processingAction || !latest.certificateId}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-md bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                  >
                                    {latest.certificateId ? 'View Certificate' : 'Certificate Pending'}
                                  </button>
                                </div>
                              </div>
                            )}
                            {status[campaign.id] && (
                              <p className="text-sm text-gray-600 text-center">{status[campaign.id]}</p>
                            )}
                          </div>
                        ) : (
                          <Link
                            to="/login"
                            className="block w-full text-center px-4 py-2 rounded-lg border border-red-600 text-red-600 font-semibold hover:bg-red-50"
                          >
                            Login to Donate
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
