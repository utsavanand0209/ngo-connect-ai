import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import { getUserRole } from '../utils/auth';
import { processDonationWithGateway } from '../utils/paymentGateway';
import { buildDirectionsUrl, getCampaignCoordinates, getCampaignLocationText } from '../utils/location';

const netbankingBanks = [
  'State Bank of India',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Canara Bank'
];

const initialDonationDetails = {
  upiId: '',
  cardHolderName: '',
  cardNumber: '',
  expiry: '',
  cvv: '',
  netbankingBank: ''
};

const initialVolunteerForm = {
  fullName: '',
  email: '',
  phone: '',
  preferredActivities: '',
  availability: '',
  motivation: ''
};

export default function CampaignDetails() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [donationAmount, setDonationAmount] = useState('');
  const [donationMessage, setDonationMessage] = useState('');
  const [donationLoading, setDonationLoading] = useState(false);
  const [donationPaymentMethod, setDonationPaymentMethod] = useState('upi');
  const [donationPaymentDetails, setDonationPaymentDetails] = useState(initialDonationDetails);
  const [donatedAmount, setDonatedAmount] = useState(0);
  const [campaignDone, setCampaignDone] = useState(false);
  const [latestReceiptNumber, setLatestReceiptNumber] = useState('');
  const [volunteerLoading, setVolunteerLoading] = useState(false);
  const [volunteerMessage, setVolunteerMessage] = useState('');
  const [isVolunteered, setIsVolunteered] = useState(false);
  const [volunteerForm, setVolunteerForm] = useState(initialVolunteerForm);
  const [flagReason, setFlagReason] = useState('');
  const [flagMessage, setFlagMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [flagLoading, setFlagLoading] = useState(false);
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [directionsLoading, setDirectionsLoading] = useState(false);

  const role = getUserRole();
  const isAdmin = role === 'admin';
  const isUser = role === 'user';

  useEffect(() => {
    api.get(`/campaigns/${id}`)
      .then((res) => {
        const payload = res.data;
        setCampaign(payload);

        const requiredAmount = payload.requiredDonationAmount ?? payload.goalAmount ?? 0;
        const currentAmount = Number(payload.currentAmount || 0);
        setDonatedAmount(currentAmount);
        setCampaignDone(requiredAmount > 0 && currentAmount >= requiredAmount);

        if (payload.volunteers) {
          const token = localStorage.getItem('token');
          if (token) {
            try {
              const decoded = JSON.parse(atob(token.split('.')[1]));
              const joined = payload.volunteers.some((entry) => String(entry) === String(decoded.id));
              setIsVolunteered(joined);
              setVolunteerForm((prev) => ({
                ...prev,
                fullName: prev.fullName || decoded.name || '',
                email: prev.email || decoded.email || '',
                phone: prev.phone || decoded.mobileNumber || ''
              }));
              api.get(`/campaigns/${id}/volunteer/me`)
                .then((registrationRes) => {
                  const registration = registrationRes.data?.registration;
                  if (!registration) return;
                  setVolunteerForm({
                    fullName: registration.fullName || decoded.name || '',
                    email: registration.email || decoded.email || '',
                    phone: registration.phone || decoded.mobileNumber || '',
                    preferredActivities: Array.isArray(registration.preferredActivities)
                      ? registration.preferredActivities.join(', ')
                      : '',
                    availability: registration.availability || '',
                    motivation: registration.motivation || ''
                  });
                })
                .catch(() => {});
            } catch (e) {
              setIsVolunteered(false);
            }
          }
        }

        setLoading(false);
      })
      .catch(() => {
        setError('Failed to fetch campaign details.');
        setLoading(false);
      });
  }, [id]);

  const requiredDonationAmount = campaign?.requiredDonationAmount ?? campaign?.goalAmount ?? 0;
  const hasFunding = requiredDonationAmount > 0;
  const hasVolunteers = campaign?.volunteersNeeded && campaign.volunteersNeeded.length > 0;
  const percentage = requiredDonationAmount > 0
    ? Math.min((Number(campaign?.currentAmount || 0) / requiredDonationAmount) * 100, 100)
    : 0;

  const campaignCoordinates = getCampaignCoordinates(campaign);
  const locationText = getCampaignLocationText(campaign || {});

  const statCards = useMemo(() => {
    const stats = campaign?.beneficiaryStats || {};
    return [
      { label: 'Target Beneficiaries', value: Number(stats.target || 0) },
      { label: 'Reached So Far', value: Number(stats.reached || 0) },
      { label: 'Households Supported', value: Number(stats.householdsSupported || 0) },
      { label: 'Volunteers Engaged', value: Number(stats.volunteersEngaged || campaign?.volunteers?.length || 0) }
    ];
  }, [campaign]);

  const openDirections = () => {
    if (!campaignCoordinates) {
      setInfoMessage('Coordinates are not available for this campaign yet.');
      return;
    }

    const openRoute = (origin) => {
      const url = buildDirectionsUrl({
        lat: campaignCoordinates.lat,
        lng: campaignCoordinates.lng,
        origin
      });
      if (!url) {
        setInfoMessage('Unable to generate directions link.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    };

    setDirectionsLoading(true);
    setInfoMessage('');

    if (!navigator.geolocation) {
      openRoute();
      setDirectionsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        openRoute({ lat: position.coords.latitude, lng: position.coords.longitude });
        setDirectionsLoading(false);
      },
      () => {
        openRoute();
        setDirectionsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 300000
      }
    );
  };

  const handleDonation = async (e) => {
    e.preventDefault();
    if (!donationAmount || Number(donationAmount) <= 0) {
      setDonationMessage('Please enter a valid amount.');
      return;
    }
    if (campaignDone) {
      setDonationMessage('This campaign is already fully funded.');
      return;
    }

    setDonationLoading(true);
    setDonationMessage('');
    const amountValue = Number(donationAmount);
    let paymentDetails = {};

    if (donationPaymentMethod === 'upi') {
      const upiId = String(donationPaymentDetails.upiId || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{2,}@[a-z]{2,}$/i.test(upiId)) {
        setDonationLoading(false);
        setDonationMessage('Please enter a valid UPI ID.');
        return;
      }
      paymentDetails = { upiId };
    }

    if (donationPaymentMethod === 'card') {
      const cardHolderName = String(donationPaymentDetails.cardHolderName || '').trim();
      const cardNumber = String(donationPaymentDetails.cardNumber || '').replace(/\s+/g, '');
      const expiry = String(donationPaymentDetails.expiry || '').trim();
      const cvv = String(donationPaymentDetails.cvv || '').trim();

      if (cardHolderName.length < 2) {
        setDonationLoading(false);
        setDonationMessage('Please enter the cardholder name.');
        return;
      }
      if (!/^\d{13,19}$/.test(cardNumber)) {
        setDonationLoading(false);
        setDonationMessage('Please enter a valid card number.');
        return;
      }
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) {
        setDonationLoading(false);
        setDonationMessage('Please enter card expiry as MM/YY.');
        return;
      }
      if (!/^\d{3,4}$/.test(cvv)) {
        setDonationLoading(false);
        setDonationMessage('Please enter a valid CVV.');
        return;
      }
      paymentDetails = { cardHolderName, cardNumber, expiry, cvv };
    }

    if (donationPaymentMethod === 'netbanking') {
      const netbankingBank = String(donationPaymentDetails.netbankingBank || '').trim();
      if (netbankingBank.length < 2) {
        setDonationLoading(false);
        setDonationMessage('Please select your bank for net banking.');
        return;
      }
      paymentDetails = { netbankingBank };
    }

    try {
      const result = await processDonationWithGateway({
        campaignId: id,
        amount: amountValue,
        paymentMethod: donationPaymentMethod,
        paymentDetails,
        preferredMethod: donationPaymentMethod,
        campaignTitle: campaign?.title
      });

      const receiptNumber = result?.confirmation?.receipt?.receiptNumber;
      const approvalStatus = result?.confirmation?.certificateApprovalStatus;
      setLatestReceiptNumber(receiptNumber || '');

      setDonationMessage(
        approvalStatus === 'approved'
          ? 'Donation successful. Thank you for your generous contribution.'
          : 'Donation successful. Certificate will be issued after NGO approval.'
      );

      setCampaign((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          currentAmount: Number(prev.currentAmount || 0) + amountValue
        };
      });

      const optimisticTotal = donatedAmount + amountValue;
      setDonatedAmount(optimisticTotal);
      if (requiredDonationAmount > 0 && optimisticTotal >= requiredDonationAmount) {
        setCampaignDone(true);
      }

      const updatedCampaignRes = await api.get(`/campaigns/${id}`);
      const updatedCampaign = updatedCampaignRes.data;
      setCampaign(updatedCampaign);
      const updatedRequiredAmount = updatedCampaign.requiredDonationAmount ?? updatedCampaign.goalAmount ?? 0;
      const updatedCurrentAmount = Number(updatedCampaign.currentAmount || 0);
      setDonatedAmount(updatedCurrentAmount);
      setCampaignDone(updatedRequiredAmount > 0 && updatedCurrentAmount >= updatedRequiredAmount);
      setDonationAmount('');
      setDonationPaymentDetails(initialDonationDetails);
    } catch (err) {
      setDonationMessage(err.response?.data?.message || 'Donation failed. Please try again.');
    }

    setDonationLoading(false);
  };

  const handleVolunteer = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setVolunteerMessage('Please login to volunteer for this campaign.');
      return;
    }
    if (!isUser) {
      setVolunteerMessage('Only user accounts can volunteer. Please login as a user.');
      return;
    }

    const fullName = String(volunteerForm.fullName || '').trim();
    const email = String(volunteerForm.email || '').trim().toLowerCase();
    const phone = String(volunteerForm.phone || '').trim();
    if (fullName.length < 2) {
      setVolunteerMessage('Please enter your full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setVolunteerMessage('Please enter a valid email address.');
      return;
    }
    if (!/^\+?[0-9\s()-]{8,15}$/.test(phone.replace(/\s+/g, ''))) {
      setVolunteerMessage('Please enter a valid phone number.');
      return;
    }

    const preferredActivities = String(volunteerForm.preferredActivities || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    setVolunteerLoading(true);
    setVolunteerMessage('');

    try {
      await api.post(`/campaigns/${id}/volunteer`, {
        fullName,
        email,
        phone,
        preferredActivities,
        availability: String(volunteerForm.availability || '').trim(),
        motivation: String(volunteerForm.motivation || '').trim()
      });
      const refreshed = await api.get(`/campaigns/${id}`);
      setCampaign(refreshed.data);
      setIsVolunteered(true);
      setVolunteerMessage('Volunteer registration submitted. The NGO now has your details for onboarding.');
    } catch (err) {
      setVolunteerMessage(err.response?.data?.message || 'Failed to volunteer. Please try again.');
    }

    setVolunteerLoading(false);
  };

  const handleFlagCampaign = async () => {
    if (!isAdmin && !isUser) {
      setFlagMessage('Please login to submit a request.');
      return;
    }
    if (campaign?.flagged) {
      setFlagMessage('This campaign is already flagged.');
      return;
    }

    setFlagLoading(true);
    setFlagMessage('');

    try {
      if (isAdmin) {
        const res = await api.post(`/campaigns/${id}/flag`, { reason: flagReason });
        setCampaign(res.data.campaign);
        setFlagMessage('Campaign flagged successfully.');
      } else {
        await api.post(`/campaigns/${id}/flag-request`, { reason: flagReason });
        setFlagMessage('Request sent to admin for review.');
      }
      setFlagReason('');
    } catch (err) {
      setFlagMessage('Failed to submit request. Please try again.');
    }

    setFlagLoading(false);
    setFlagModalOpen(false);
  };

  if (loading) return <div className="p-8 text-center">Loading campaign...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!campaign) return <div className="p-8 text-center">This campaign is not available.</div>;

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        {(infoMessage || flagMessage) && (
          <div className="mb-6 space-y-2">
            {infoMessage && <div className="p-3 rounded bg-blue-50 border border-blue-200 text-blue-800">{infoMessage}</div>}
            {flagMessage && <div className="p-3 rounded bg-amber-50 border border-amber-200 text-amber-800">{flagMessage}</div>}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white rounded-lg shadow-xl overflow-hidden">
              <img
                src={campaign.image || 'https://via.placeholder.com/1200x760'}
                alt={campaign.title}
                className="w-full h-96 object-cover"
              />
              <div className="p-8">
                <h1 className="text-4xl font-extrabold text-gray-900">{campaign.title}</h1>
                <p className="mt-4 text-lg text-gray-600">{campaign.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 text-sm font-semibold">{campaign.category || 'Campaign'}</span>
                  <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-sm font-semibold">{locationText}</span>
                  {campaign.area && <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-sm font-semibold">{campaign.area}</span>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openDirections}
                    disabled={directionsLoading}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-indigo-300"
                  >
                    {directionsLoading ? 'Opening Directions...' : 'Get Directions'}
                  </button>
                  {isUser && (campaign.ngo?.id || campaign.ngo) && (
                    <Link
                      to={`/messages?ngo=${campaign.ngo?.id || campaign.ngo}`}
                      className="px-4 py-2 rounded-lg border border-indigo-200 text-indigo-700 font-semibold hover:bg-indigo-50"
                    >
                      Message NGO
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {Array.isArray(campaign.highlights) && campaign.highlights.length > 0 && (
              <div className="bg-white rounded-lg shadow-xl p-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Campaign Highlights</h2>
                <ul className="space-y-3">
                  {campaign.highlights.map((point, index) => (
                    <li key={index} className="flex items-start gap-2 text-gray-700">
                      <span className="text-green-600 mt-0.5">✔</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-xl p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Impact Snapshot</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {statCards.map((stat) => (
                  <div key={stat.label} className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                    <p className="text-xs uppercase tracking-wide text-gray-500">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">{Number(stat.value || 0).toLocaleString('en-IN')}</p>
                  </div>
                ))}
              </div>
            </div>

            {(campaign.gallery?.length > 0 || campaign.videoUrl) && (
              <div className="bg-white rounded-lg shadow-xl p-8 space-y-6">
                <h2 className="text-2xl font-bold text-gray-800">Media</h2>

                {campaign.gallery?.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {campaign.gallery.map((image, index) => (
                      <img
                        key={`${image}-${index}`}
                        src={image}
                        alt={`${campaign.title} gallery ${index + 1}`}
                        className="w-full h-44 object-cover rounded-lg"
                      />
                    ))}
                  </div>
                )}

                {campaign.videoUrl && (
                  <div>
                    <a
                      href={campaign.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 rounded-lg border border-indigo-600 text-indigo-600 font-semibold hover:bg-indigo-50"
                    >
                      Watch Campaign Video
                    </a>
                  </div>
                )}
              </div>
            )}

            {(campaign.testimonials?.length > 0 || campaign.recognitions?.length > 0 || campaign.updates?.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-lg shadow-xl p-8">
                  <h2 className="text-2xl font-bold text-gray-800 mb-4">Testimonials</h2>
                  {campaign.testimonials?.length ? (
                    <div className="space-y-4">
                      {campaign.testimonials.map((item, index) => (
                        <blockquote key={`${item.name}-${index}`} className="border-l-4 border-indigo-300 pl-4">
                          <p className="text-gray-700 italic">"{item.quote}"</p>
                          <footer className="mt-2 text-sm text-gray-500">{item.name} • {item.role}</footer>
                        </blockquote>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-600">No testimonials yet.</p>
                  )}
                </div>

                <div className="bg-white rounded-lg shadow-xl p-8">
                  <h2 className="text-2xl font-bold text-gray-800 mb-4">Recognition & Updates</h2>
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Recognition</h3>
                      {campaign.recognitions?.length ? (
                        <ul className="text-sm text-gray-700 space-y-2">
                          {campaign.recognitions.map((item, index) => <li key={index}>• {item}</li>)}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500">No recognitions listed.</p>
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Latest Updates</h3>
                      {campaign.updates?.length ? (
                        <ul className="text-sm text-gray-700 space-y-2">
                          {campaign.updates.map((item, index) => <li key={index}>• {item}</li>)}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500">No updates listed.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-8">
            {campaignDone && (
              <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="text-xl">✅</div>
                  <div>
                    <p className="font-semibold">Campaign Done</p>
                    <p className="text-sm text-green-700">
                      This campaign has reached its funding goal. Thank you for your support!
                    </p>
                  </div>
                </div>
              </div>
            )}

            {hasFunding && (
              <div className="bg-white rounded-lg shadow-xl p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Campaign Progress</h2>
                <div>
                  <div className="w-full bg-gray-200 rounded-full h-4">
                    <div className="bg-green-500 h-4 rounded-full" style={{ width: `${percentage}%` }}></div>
                  </div>
                  <div className="mt-2 flex justify-between text-lg font-semibold">
                    <span className="text-green-600">₹{Number(campaign.currentAmount || 0).toLocaleString('en-IN')}</span>
                    <span className="text-gray-500">of ₹{requiredDonationAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-gray-600">
                    <span>Total Donated: ₹{donatedAmount.toLocaleString('en-IN')}</span>
                    {campaignDone && <span className="font-semibold text-green-700">Campaign Done</span>}
                  </div>
                </div>
              </div>
            )}

            {hasFunding && !isUser && (
              <div className="bg-white rounded-lg shadow-xl p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Donations</h2>
                <p className="text-gray-600">Donations are available for user accounts only.</p>
              </div>
            )}

            {hasFunding && isUser && (
              <div className="bg-white rounded-lg shadow-xl p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Make a Donation</h2>
                <form onSubmit={handleDonation} className="space-y-4">
                  <div>
                    <label htmlFor="donation" className="block text-sm font-medium text-gray-700">Amount (₹)</label>
                    <input
                      type="number"
                      id="donation"
                      value={donationAmount}
                      onChange={(e) => setDonationAmount(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                      placeholder="e.g., 500"
                      disabled={campaignDone}
                    />
                  </div>
                  <div>
                    <label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-700">Payment Method</label>
                    <select
                      id="paymentMethod"
                      value={donationPaymentMethod}
                      onChange={(e) => setDonationPaymentMethod(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                      disabled={campaignDone}
                    >
                      <option value="upi">UPI</option>
                      <option value="card">Card</option>
                      <option value="netbanking">Net Banking</option>
                      <option value="wallet">Wallet</option>
                      <option value="bank-transfer">Bank Transfer</option>
                      <option value="cash">Cash</option>
                    </select>
                  </div>
                  {donationPaymentMethod === 'upi' && (
                    <div>
                      <label htmlFor="upiId" className="block text-sm font-medium text-gray-700">UPI ID</label>
                      <input
                        type="text"
                        id="upiId"
                        value={donationPaymentDetails.upiId}
                        onChange={(e) => setDonationPaymentDetails((prev) => ({ ...prev, upiId: e.target.value }))}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                        placeholder="example@upi"
                        disabled={campaignDone}
                      />
                    </div>
                  )}
                  {donationPaymentMethod === 'card' && (
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="cardHolderName" className="block text-sm font-medium text-gray-700">Cardholder Name</label>
                        <input
                          type="text"
                          id="cardHolderName"
                          value={donationPaymentDetails.cardHolderName}
                          onChange={(e) => setDonationPaymentDetails((prev) => ({ ...prev, cardHolderName: e.target.value }))}
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                          placeholder="Name on card"
                          disabled={campaignDone}
                        />
                      </div>
                      <div>
                        <label htmlFor="cardNumber" className="block text-sm font-medium text-gray-700">Card Number</label>
                        <input
                          type="text"
                          id="cardNumber"
                          value={donationPaymentDetails.cardNumber}
                          onChange={(e) => setDonationPaymentDetails((prev) => ({ ...prev, cardNumber: e.target.value }))}
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                          placeholder="1234 5678 9012 3456"
                          disabled={campaignDone}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="cardExpiry" className="block text-sm font-medium text-gray-700">Expiry</label>
                          <input
                            type="text"
                            id="cardExpiry"
                            value={donationPaymentDetails.expiry}
                            onChange={(e) => setDonationPaymentDetails((prev) => ({ ...prev, expiry: e.target.value }))}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                            placeholder="MM/YY"
                            disabled={campaignDone}
                          />
                        </div>
                        <div>
                          <label htmlFor="cardCvv" className="block text-sm font-medium text-gray-700">CVV</label>
                          <input
                            type="password"
                            id="cardCvv"
                            value={donationPaymentDetails.cvv}
                            onChange={(e) => setDonationPaymentDetails((prev) => ({ ...prev, cvv: e.target.value }))}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                            placeholder="CVV"
                            disabled={campaignDone}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {donationPaymentMethod === 'netbanking' && (
                    <div>
                      <label htmlFor="netbankingBank" className="block text-sm font-medium text-gray-700">Select Bank</label>
                      <select
                        id="netbankingBank"
                        value={donationPaymentDetails.netbankingBank}
                        onChange={(e) => setDonationPaymentDetails((prev) => ({ ...prev, netbankingBank: e.target.value }))}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                        disabled={campaignDone}
                      >
                        <option value="">Choose bank</option>
                        {netbankingBanks.map((bank) => (
                          <option key={bank} value={bank}>{bank}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    Sensitive payment fields are validated locally and submitted only to secure gateway flow.
                  </p>
                  <button
                    type="submit"
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400"
                    disabled={donationLoading || campaignDone}
                  >
                    {campaignDone ? 'Campaign Done' : donationLoading ? 'Processing...' : 'Donate Now'}
                  </button>
                  {donationMessage && <p className="mt-2 text-sm text-center font-semibold">{donationMessage}</p>}
                  {latestReceiptNumber && <p className="text-xs text-center text-gray-600">Receipt: {latestReceiptNumber}</p>}
                </form>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-2xl font-bold text-gray-800">Report Campaign</h2>
                {campaign.flagged && <span className="text-sm text-red-600 font-semibold">Flagged</span>}
              </div>
              <textarea
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                placeholder="Reason for reporting (optional)"
                className="w-full border border-gray-300 rounded-md p-2 mb-3"
                rows={3}
                disabled={campaign.flagged}
              />
              <button
                type="button"
                onClick={() => setFlagModalOpen(true)}
                disabled={flagLoading || campaign.flagged}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-red-300"
              >
                {campaign.flagged ? 'Already Flagged' : flagLoading ? 'Submitting...' : isAdmin ? 'Flag Campaign' : 'Request Admin Review'}
              </button>
            </div>

            {hasVolunteers && (
              <div className="bg-white rounded-lg shadow-xl p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Volunteer</h2>
                <p className="text-gray-600 mb-4">
                  Join {campaign.volunteers?.length || 0} other volunteers and make a hands-on impact.
                </p>
                {campaign.volunteersNeeded?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {campaign.volunteersNeeded.map((roleName, index) => (
                      <span key={index} className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded">
                        {roleName}
                      </span>
                    ))}
                  </div>
                )}

                {!isUser ? (
                  <div className="w-full text-center py-3 px-4 rounded-md bg-gray-50 text-gray-600 font-semibold border border-gray-200">
                    Volunteering is available for user accounts only.
                  </div>
                ) : isVolunteered ? (
                  <div className="w-full text-center py-3 px-4 rounded-md bg-green-50 text-green-700 font-semibold border border-green-200">
                    ✓ You are already volunteering for this campaign
                  </div>
                ) : (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={volunteerForm.fullName}
                      onChange={(e) => setVolunteerForm((prev) => ({ ...prev, fullName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="Full Name"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="email"
                        value={volunteerForm.email}
                        onChange={(e) => setVolunteerForm((prev) => ({ ...prev, email: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder="Email"
                      />
                      <input
                        type="tel"
                        value={volunteerForm.phone}
                        onChange={(e) => setVolunteerForm((prev) => ({ ...prev, phone: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder="Phone Number"
                      />
                    </div>
                    <input
                      type="text"
                      value={volunteerForm.preferredActivities}
                      onChange={(e) => setVolunteerForm((prev) => ({ ...prev, preferredActivities: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="Preferred Activities (comma separated)"
                    />
                    <input
                      type="text"
                      value={volunteerForm.availability}
                      onChange={(e) => setVolunteerForm((prev) => ({ ...prev, availability: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="Availability (e.g. Weekends, 4 hrs/week)"
                    />
                    <textarea
                      rows={3}
                      value={volunteerForm.motivation}
                      onChange={(e) => setVolunteerForm((prev) => ({ ...prev, motivation: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="Why would you like to volunteer?"
                    />
                    <button
                      type="button"
                      onClick={handleVolunteer}
                      className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400"
                      disabled={volunteerLoading}
                    >
                      {volunteerLoading ? 'Processing...' : 'Volunteer Now'}
                    </button>
                  </div>
                )}

                {volunteerMessage && <p className="mt-2 text-sm text-center font-semibold">{volunteerMessage}</p>}
              </div>
            )}

            {campaign.ngo && (
              <div className="bg-white rounded-lg shadow-xl p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-3">Organized By</h3>
                <Link to={`/ngos/${campaign.ngo.id}`} className="flex items-center gap-4 hover:bg-gray-50 p-2 rounded-lg">
                  <img
                    src={campaign.ngo.logo || 'https://via.placeholder.com/100'}
                    alt={campaign.ngo.name}
                    className="w-16 h-16 rounded-full object-cover"
                  />
                  <div>
                    <p className="font-bold text-lg text-gray-900">{campaign.ngo.name}</p>
                    <p className="text-indigo-600 hover:underline">View Profile</p>
                  </div>
                </Link>
                {campaign.coordinator && (
                  <div className="mt-3 text-sm text-gray-600 border-t pt-3">
                    <p><strong>Coordinator:</strong> {campaign.coordinator.name}</p>
                    <p><strong>Phone:</strong> {campaign.coordinator.phone}</p>
                    <p><strong>Email:</strong> {campaign.coordinator.email}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={flagModalOpen}
        title={isAdmin ? 'Flag Campaign' : 'Request Admin Review'}
        description={
          isAdmin
            ? 'This will mark the campaign as flagged and visible to admins.'
            : 'Your request will be sent to the admin team for review.'
        }
        confirmLabel={isAdmin ? 'Flag Campaign' : 'Send Request'}
        onConfirm={handleFlagCampaign}
        onCancel={() => setFlagModalOpen(false)}
        loading={flagLoading}
      />
    </div>
  );
}
