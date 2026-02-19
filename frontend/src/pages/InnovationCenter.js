import React, { useEffect, useMemo, useState } from 'react';
import { getTokenPayload, getUserRole } from '../utils/auth';
import api, {
  approveCorporateMatch,
  approveVolunteerLog,
  createCrmSegment,
  createCorporateProfile,
  createGivingCircle,
  createImpactUpdate,
  createVolunteerEndorsement,
  createVolunteerShift,
  createWishlistItem,
  contributeGivingCircle,
  evaluateCorporateMatch,
  getCrmDonors,
  getEmergencyFeed,
  getGamificationLeaderboard,
  getGamificationSummary,
  getMyCorporateMatches,
  getMyCorporateProfiles,
  getMyDonations,
  getMyVolunteerEndorsements,
  getNgoImpactUpdates,
  getNgoVolunteerLogs,
  getNgoWishlistItems,
  listCrmSegments,
  listGivingCircles,
  listWishlistItems,
  pledgeWishlistItem,
  sendCrmSegmentMessage
} from '../services/api';
import { processDonationWithGateway } from '../utils/paymentGateway';

const currency = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const emptyPaymentDetails = {
  upiId: '',
  cardHolderName: '',
  cardNumber: '',
  expiry: '',
  cvv: '',
  netbankingBank: ''
};
const emergencyPaymentOptions = [
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'netbanking', label: 'Net Banking' }
];
const circlePaymentOptions = [
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' }
];
const netbankingBanks = ['HDFC', 'ICICI', 'SBI', 'Axis', 'Kotak', 'Yes Bank'];

export default function InnovationCenter() {
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [campaigns, setCampaigns] = useState([]);
  const [givingCircles, setGivingCircles] = useState([]);
  const [wishlistItems, setWishlistItems] = useState([]);
  const [ngoWishlistItems, setNgoWishlistItems] = useState([]);
  const [emergencyFeed, setEmergencyFeed] = useState({ campaigns: [], volunteerOpportunities: [], wishlistItems: [] });
  const [gamificationSummary, setGamificationSummary] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [endorsements, setEndorsements] = useState([]);
  const [corporateProfiles, setCorporateProfiles] = useState({ ownedProfiles: [], linkedProfiles: [] });
  const [corporateMatches, setCorporateMatches] = useState([]);
  const [myDonations, setMyDonations] = useState([]);

  const [crmDonors, setCrmDonors] = useState([]);
  const [crmSegments, setCrmSegments] = useState([]);
  const [ngoImpactUpdates, setNgoImpactUpdates] = useState([]);
  const [ngoVolunteerLogs, setNgoVolunteerLogs] = useState([]);

  const [circleForm, setCircleForm] = useState({
    campaignId: '',
    name: '',
    description: '',
    goalAmount: ''
  });
  const [circleContribution, setCircleContribution] = useState({});
  const [circlePaymentMethods, setCirclePaymentMethods] = useState({});
  const [circlePaymentDetails, setCirclePaymentDetails] = useState({});
  const [wishlistPledge, setWishlistPledge] = useState({});
  const [emergencyContributionAmount, setEmergencyContributionAmount] = useState({});
  const [emergencyPaymentMethods, setEmergencyPaymentMethods] = useState({});
  const [emergencyPaymentDetails, setEmergencyPaymentDetails] = useState({});

  const [wishlistForm, setWishlistForm] = useState({
    campaignId: '',
    itemName: '',
    description: '',
    quantityNeeded: '',
    unit: 'units',
    priority: 'medium',
    emergency: false
  });
  const [impactForm, setImpactForm] = useState({
    campaignId: '',
    title: '',
    details: '',
    amountUtilized: '',
    beneficiariesReached: ''
  });
  const [segmentForm, setSegmentForm] = useState({
    segmentName: '',
    segmentDescription: ''
  });
  const [segmentMessage, setSegmentMessage] = useState({});
  const [corporateForm, setCorporateForm] = useState({
    companyName: '',
    matchRatio: '1',
    capPerEmployee: '0',
    donationId: ''
  });
  const [shiftForm, setShiftForm] = useState({
    campaignId: '',
    title: '',
    location: '',
    startAt: '',
    endAt: '',
    slots: '10'
  });
  const [endorsementForm, setEndorsementForm] = useState({
    userId: '',
    applicationId: '',
    skills: '',
    note: ''
  });
  const [busy, setBusy] = useState(false);

  const isUser = role === 'user';
  const isNgo = role === 'ngo';

  const ownedCampaigns = useMemo(() => {
    if (!isNgo) return [];
    const payload = getTokenPayload();
    if (!payload) return [];
    return campaigns.filter((campaign) => String(campaign?.ngo?.id || campaign?.ngo || '') === String(payload.id || ''));
  }, [campaigns, isNgo]);

  const setStatus = ({ ok = '', fail = '' } = {}) => {
    setMessage(ok);
    setError(fail);
  };

  const loadData = async () => {
    setLoading(true);
    setStatus({});
    const resolvedRole = getUserRole() || '';
    setRole(resolvedRole);

    try {
      const requests = [
        api.get('/campaigns'),
        listGivingCircles({ limit: 30 }),
        listWishlistItems({ limit: 50 }),
        getEmergencyFeed(),
        getGamificationLeaderboard({ limit: 10 })
      ];
      if (resolvedRole === 'user') {
        requests.push(
          getGamificationSummary(),
          getMyVolunteerEndorsements(),
          getMyCorporateProfiles(),
          getMyCorporateMatches(),
          getMyDonations()
        );
      }
      if (resolvedRole === 'ngo') {
        requests.push(
          getNgoWishlistItems(),
          getCrmDonors({ limit: 200 }),
          listCrmSegments(),
          getNgoImpactUpdates({ limit: 40 }),
          getNgoVolunteerLogs({ status: 'pending' })
        );
      }

      const responses = await Promise.allSettled(requests);
      let index = 0;
      const campaignRes = responses[index++];
      const circlesRes = responses[index++];
      const wishlistRes = responses[index++];
      const emergencyRes = responses[index++];
      const leaderboardRes = responses[index++];

      setCampaigns(campaignRes.status === 'fulfilled' ? campaignRes.value.data || [] : []);
      setGivingCircles(circlesRes.status === 'fulfilled' ? circlesRes.value.data || [] : []);
      setWishlistItems(wishlistRes.status === 'fulfilled' ? wishlistRes.value.data || [] : []);
      setEmergencyFeed(emergencyRes.status === 'fulfilled'
        ? emergencyRes.value.data || { campaigns: [], volunteerOpportunities: [], wishlistItems: [] }
        : { campaigns: [], volunteerOpportunities: [], wishlistItems: [] });
      setLeaderboard(leaderboardRes.status === 'fulfilled' ? leaderboardRes.value.data || [] : []);

      if (resolvedRole === 'user') {
        const summaryRes = responses[index++];
        const endorsementsRes = responses[index++];
        const corporateProfilesRes = responses[index++];
        const corporateMatchesRes = responses[index++];
        const myDonationsRes = responses[index++];
        setGamificationSummary(summaryRes.status === 'fulfilled' ? summaryRes.value.data || null : null);
        setEndorsements(endorsementsRes.status === 'fulfilled' ? endorsementsRes.value.data || [] : []);
        setCorporateProfiles(
          corporateProfilesRes.status === 'fulfilled'
            ? corporateProfilesRes.value.data || { ownedProfiles: [], linkedProfiles: [] }
            : { ownedProfiles: [], linkedProfiles: [] }
        );
        setCorporateMatches(corporateMatchesRes.status === 'fulfilled' ? corporateMatchesRes.value.data || [] : []);
        setMyDonations(myDonationsRes.status === 'fulfilled' ? myDonationsRes.value.data || [] : []);
      } else {
        setGamificationSummary(null);
        setEndorsements([]);
        setCorporateProfiles({ ownedProfiles: [], linkedProfiles: [] });
        setCorporateMatches([]);
        setMyDonations([]);
      }

      if (resolvedRole === 'ngo') {
        const ngoWishlistRes = responses[index++];
        const crmDonorRes = responses[index++];
        const crmSegmentRes = responses[index++];
        const impactRes = responses[index++];
        const volunteerLogsRes = responses[index++];
        setNgoWishlistItems(ngoWishlistRes.status === 'fulfilled' ? ngoWishlistRes.value.data || [] : []);
        setCrmDonors(crmDonorRes.status === 'fulfilled' ? crmDonorRes.value.data || [] : []);
        setCrmSegments(crmSegmentRes.status === 'fulfilled' ? crmSegmentRes.value.data || [] : []);
        setNgoImpactUpdates(impactRes.status === 'fulfilled' ? impactRes.value.data || [] : []);
        setNgoVolunteerLogs(volunteerLogsRes.status === 'fulfilled' ? volunteerLogsRes.value.data || [] : []);
      } else {
        setNgoWishlistItems([]);
        setCrmDonors([]);
        setCrmSegments([]);
        setNgoImpactUpdates([]);
        setNgoVolunteerLogs([]);
      }
    } catch (err) {
      setStatus({ fail: 'Unable to load innovation data right now.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateCircle = async (e) => {
    e.preventDefault();
    if (!circleForm.campaignId || !circleForm.name || Number(circleForm.goalAmount || 0) <= 0) {
      setStatus({ fail: 'Campaign, circle name, and valid goal amount are required.' });
      return;
    }

    setBusy(true);
    try {
      await createGivingCircle({
        campaignId: circleForm.campaignId,
        name: circleForm.name,
        description: circleForm.description,
        goalAmount: Number(circleForm.goalAmount)
      });
      setCircleForm({ campaignId: '', name: '', description: '', goalAmount: '' });
      setStatus({ ok: 'Giving circle created successfully.' });
      await loadData();
    } catch (err) {
      setStatus({ fail: err.response?.data?.message || 'Failed to create giving circle.' });
    } finally {
      setBusy(false);
    }
  };

  const getCircleState = (circle) => {
    const goalAmount = Number(circle?.goalAmount || 0);
    const currentAmount = Number(circle?.currentAmount || 0);
    const remainingAmount = Math.max(Number(circle?.remainingAmount ?? (goalAmount - currentAmount)) || 0, 0);
    const status = String(circle?.status || '').toLowerCase();
    const needCompleted = Boolean(circle?.needCompleted) || status === 'completed' || (goalAmount > 0 && remainingAmount <= 0);
    return { goalAmount, currentAmount, remainingAmount, needCompleted };
  };

  const getWishlistState = (item) => {
    const quantityNeeded = Number(item?.quantityNeeded || 0);
    const quantityFulfilled = Number(item?.quantityFulfilled || 0);
    const quantityCommitted = Math.max(Number(item?.quantityCommitted || 0), quantityFulfilled);
    const quantityRemaining = Math.max(
      Number(item?.quantityRemaining ?? (quantityNeeded - quantityCommitted)) || 0,
      0
    );
    const status = String(item?.status || '').toLowerCase();
    const needCompleted = Boolean(item?.needCompleted) || status === 'completed' || quantityRemaining <= 0;
    return { quantityNeeded, quantityFulfilled, quantityCommitted, quantityRemaining, needCompleted };
  };

  const resolvePaymentDetails = (paymentMethod, details, options = {}) => {
    const { allowNetbanking = true, requireUpiOrCard = false } = options;
    if (paymentMethod === 'upi') {
      const upiId = String(details?.upiId || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{2,}@[a-z]{2,}$/i.test(upiId)) {
        return { error: 'Please enter a valid UPI ID.' };
      }
      return { paymentDetails: { upiId } };
    }

    if (paymentMethod === 'card') {
      const cardHolderName = String(details?.cardHolderName || '').trim();
      const cardNumber = String(details?.cardNumber || '').replace(/\s+/g, '');
      const expiry = String(details?.expiry || '').trim();
      const cvv = String(details?.cvv || '').trim();

      if (cardHolderName.length < 2) {
        return { error: 'Please enter the cardholder name.' };
      }
      if (!/^\d{13,19}$/.test(cardNumber)) {
        return { error: 'Please enter a valid card number.' };
      }
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) {
        return { error: 'Please enter card expiry in MM/YY format.' };
      }
      if (!/^\d{3,4}$/.test(cvv)) {
        return { error: 'Please enter a valid CVV.' };
      }
      return { paymentDetails: { cardHolderName, cardNumber, expiry, cvv } };
    }

    if (paymentMethod === 'netbanking' && allowNetbanking) {
      const netbankingBank = String(details?.netbankingBank || '').trim();
      if (netbankingBank.length < 2) {
        return { error: 'Please select your net banking bank.' };
      }
      return { paymentDetails: { netbankingBank } };
    }

    if (requireUpiOrCard) {
      return { error: 'Please select UPI or Card for this contribution.' };
    }
    return { error: 'Please select a valid payment method.' };
  };

  const updateCirclePaymentDetail = (circleId, field, value) => {
    setCirclePaymentDetails((prev) => ({
      ...prev,
      [circleId]: {
        ...(prev[circleId] || emptyPaymentDetails),
        [field]: value
      }
    }));
  };

  const handleContributeCircle = async (circle) => {
    const circleId = circle?.id;
    if (!circleId) {
      setStatus({ fail: 'Invalid giving circle.' });
      return;
    }
    const { remainingAmount, needCompleted } = getCircleState(circle);
    if (needCompleted) {
      setStatus({ fail: 'Need is completed for this giving circle.' });
      return;
    }
    const amount = Number(circleContribution[circleId] || 0);
    if (amount <= 0) {
      setStatus({ fail: 'Enter a contribution amount greater than 0.' });
      return;
    }
    if (remainingAmount > 0 && amount > remainingAmount) {
      setStatus({ fail: `Only ${currency(remainingAmount)} is remaining for this giving circle.` });
      return;
    }
    const campaignId = String(circle?.campaignId || '').trim();
    if (!campaignId) {
      setStatus({ fail: 'This giving circle is not linked to a valid campaign for payment.' });
      return;
    }
    const paymentMethod = circlePaymentMethods[circleId] || 'upi';
    const details = circlePaymentDetails[circleId] || emptyPaymentDetails;
    const paymentResolution = resolvePaymentDetails(paymentMethod, details, {
      allowNetbanking: false,
      requireUpiOrCard: true
    });
    if (paymentResolution.error) {
      setStatus({ fail: paymentResolution.error });
      return;
    }

    setBusy(true);
    try {
      const donationFlow = await processDonationWithGateway({
        campaignId,
        amount,
        paymentMethod,
        paymentDetails: paymentResolution.paymentDetails,
        preferredMethod: paymentMethod,
        message: `Giving circle contribution: ${circle?.name || circleId}`,
        campaignTitle: circle?.name || 'Giving Circle Contribution'
      });
      await contributeGivingCircle(circleId, {
        amount,
        paymentMethod,
        paymentMeta: {
          donationId: donationFlow?.confirmation?.donation?.id || '',
          gatewayOrderId: donationFlow?.initiation?.gatewayOrder?.orderId || '',
          gatewayPaymentId: donationFlow?.confirmation?.donation?.gatewayPaymentId || ''
        }
      });
      setCircleContribution((prev) => ({ ...prev, [circleId]: '' }));
      setCirclePaymentDetails((prev) => ({ ...prev, [circleId]: emptyPaymentDetails }));
      setStatus({ ok: 'Contribution successful and recorded in giving circle.' });
      await loadData();
    } catch (err) {
      setStatus({ fail: err.response?.data?.message || err.message || 'Failed to contribute to giving circle.' });
    } finally {
      setBusy(false);
    }
  };

  const handlePledgeItem = async (item) => {
    const itemId = item?.id;
    if (!itemId) {
      setStatus({ fail: 'Invalid wishlist item.' });
      return;
    }
    const { quantityRemaining, needCompleted } = getWishlistState(item);
    if (needCompleted) {
      setStatus({ fail: 'Need is completed for this wishlist item.' });
      return;
    }
    const quantity = Number(wishlistPledge[itemId] || 0);
    if (quantity <= 0) {
      setStatus({ fail: 'Enter a valid pledge quantity.' });
      return;
    }
    if (quantityRemaining > 0 && quantity > quantityRemaining) {
      setStatus({ fail: `Only ${quantityRemaining} quantity is remaining for this item.` });
      return;
    }
    setBusy(true);
    try {
      const response = await pledgeWishlistItem(itemId, { quantityPledged: quantity });
      setWishlistPledge((prev) => ({ ...prev, [itemId]: '' }));
      const completedNow = Boolean(response?.data?.item?.needCompleted);
      setStatus({ ok: completedNow ? 'Wishlist pledge submitted. Need is completed.' : 'Wishlist pledge submitted.' });
      await loadData();
    } catch (err) {
      setStatus({ fail: err.response?.data?.message || 'Failed to submit wishlist pledge.' });
    } finally {
      setBusy(false);
    }
  };

  const updateEmergencyPaymentDetail = (campaignId, field, value) => {
    setEmergencyPaymentDetails((prev) => ({
      ...prev,
      [campaignId]: {
        ...(prev[campaignId] || emptyPaymentDetails),
        [field]: value
      }
    }));
  };

  const handleEmergencyContribute = async (campaign) => {
    const campaignId = String(campaign?.id || '').trim();
    if (!campaignId) {
      setStatus({ fail: 'Invalid emergency campaign.' });
      return;
    }

    const goalAmount = Number(campaign?.goalAmount || 0);
    const currentAmount = Number(campaign?.currentAmount || 0);
    const remainingAmount = Math.max(goalAmount - currentAmount, 0);
    const campaignCompleted = goalAmount > 0 && currentAmount >= goalAmount;
    if (campaignCompleted) {
      setStatus({ fail: 'Need is completed for this emergency campaign.' });
      return;
    }

    const amount = Number(emergencyContributionAmount[campaignId] || 0);
    if (!amount || amount <= 0) {
      setStatus({ fail: 'Enter a valid emergency contribution amount.' });
      return;
    }
    if (goalAmount > 0 && amount > remainingAmount) {
      setStatus({ fail: `Only ${currency(remainingAmount)} is remaining for this emergency campaign.` });
      return;
    }

    const paymentMethod = emergencyPaymentMethods[campaignId] || 'upi';
    const details = emergencyPaymentDetails[campaignId] || emptyPaymentDetails;
    const paymentResolution = resolvePaymentDetails(paymentMethod, details, { allowNetbanking: true });
    if (paymentResolution.error) {
      setStatus({ fail: paymentResolution.error });
      return;
    }

    setBusy(true);
    try {
      await processDonationWithGateway({
        campaignId,
        amount,
        paymentMethod,
        paymentDetails: paymentResolution.paymentDetails,
        preferredMethod: paymentMethod,
        message: 'Emergency contribution from Innovation Center',
        campaignTitle: campaign?.title
      });
      setEmergencyContributionAmount((prev) => ({ ...prev, [campaignId]: '' }));
      setEmergencyPaymentDetails((prev) => ({ ...prev, [campaignId]: emptyPaymentDetails }));
      setStatus({ ok: 'Emergency contribution successful.' });
      await loadData();
    } catch (err) {
      setStatus({ fail: err.response?.data?.message || err.message || 'Emergency contribution failed.' });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateWishlist = async (e) => {
    e.preventDefault();
    if (!wishlistForm.itemName || Number(wishlistForm.quantityNeeded || 0) <= 0) {
      setStatus({ fail: 'Item name and quantity are required.' });
      return;
    }
    setBusy(true);
    try {
      await createWishlistItem({
        ...wishlistForm,
        quantityNeeded: Number(wishlistForm.quantityNeeded || 0),
        emergency: Boolean(wishlistForm.emergency)
      });
      setWishlistForm({
        campaignId: '',
        itemName: '',
        description: '',
        quantityNeeded: '',
        unit: 'units',
        priority: 'medium',
        emergency: false
      });
      setStatus({ ok: 'Wishlist item created.' });
      await loadData();
    } catch (err) {
      setStatus({ fail: err.response?.data?.message || 'Failed to create wishlist item.' });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateImpactUpdate = async (e) => {
    e.preventDefault();
    if (!impactForm.campaignId || !impactForm.title || impactForm.details.trim().length < 10) {
      setStatus({ fail: 'Campaign, title, and detailed notes are required for impact updates.' });
      return;
    }
    setBusy(true);
    try {
      await createImpactUpdate({
        ...impactForm,
        amountUtilized: Number(impactForm.amountUtilized || 0),
        beneficiariesReached: Number(impactForm.beneficiariesReached || 0)
      });
      setImpactForm({
        campaignId: '',
        title: '',
        details: '',
        amountUtilized: '',
        beneficiariesReached: ''
      });
      setStatus({ ok: 'Impact update posted.' });
      await loadData();
    } catch (err) {
      setStatus({ fail: err.response?.data?.message || 'Failed to post impact update.' });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSegment = async (e) => {
    e.preventDefault();
    if (!segmentForm.segmentName.trim()) {
      setStatus({ fail: 'Segment name is required.' });
      return;
    }
    setBusy(true);
    try {
      await createCrmSegment({
        segmentName: segmentForm.segmentName.trim(),
        segmentDescription: segmentForm.segmentDescription.trim(),
        donorUserIds: crmDonors.slice(0, 3).map((entry) => entry.donorUserId).filter(Boolean)
      });
      setSegmentForm({ segmentName: '', segmentDescription: '' });
      setStatus({ ok: 'Donor segment created.' });
      await loadData();
    } catch (err) {
      setStatus({ fail: err.response?.data?.message || 'Failed to create segment.' });
    } finally {
      setBusy(false);
    }
  };

  const handleSendSegmentMessage = async (segmentId) => {
    const payload = segmentMessage[segmentId] || { title: '', message: '' };
    if (!payload.title || !payload.message) {
      setStatus({ fail: 'Segment message title and body are required.' });
      return;
    }
    setBusy(true);
    try {
      await sendCrmSegmentMessage(segmentId, payload);
      setSegmentMessage((prev) => ({ ...prev, [segmentId]: { title: '', message: '' } }));
      setStatus({ ok: 'Segment message dispatched.' });
    } catch (err) {
      setStatus({ fail: err.response?.data?.message || 'Failed to send segment message.' });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateCorporateProfile = async (e) => {
    e.preventDefault();
    if (!corporateForm.companyName.trim()) {
      setStatus({ fail: 'Company name is required.' });
      return;
    }
    setBusy(true);
    try {
      await createCorporateProfile({
        companyName: corporateForm.companyName.trim(),
        matchRatio: Number(corporateForm.matchRatio || 1),
        capPerEmployee: Number(corporateForm.capPerEmployee || 0)
      });
      setCorporateForm((prev) => ({ ...prev, companyName: '', matchRatio: '1', capPerEmployee: '0' }));
      setStatus({ ok: 'Corporate profile created.' });
      await loadData();
    } catch (err) {
      setStatus({ fail: err.response?.data?.message || 'Failed to create corporate profile.' });
    } finally {
      setBusy(false);
    }
  };

  const handleEvaluateCorporateMatch = async (e) => {
    e.preventDefault();
    if (!corporateForm.donationId) {
      setStatus({ fail: 'Select a donation to evaluate corporate match.' });
      return;
    }
    setBusy(true);
    try {
      await evaluateCorporateMatch({ donationId: corporateForm.donationId });
      setStatus({ ok: 'Corporate match request submitted.' });
      await loadData();
    } catch (err) {
      setStatus({ fail: err.response?.data?.message || 'Failed to evaluate corporate match.' });
    } finally {
      setBusy(false);
    }
  };

  const handleApproveCorporateMatch = async (matchId) => {
    setBusy(true);
    try {
      await approveCorporateMatch(matchId);
      setStatus({ ok: 'Corporate match approved.' });
      await loadData();
    } catch (err) {
      setStatus({ fail: err.response?.data?.message || 'Failed to approve corporate match.' });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateShift = async (e) => {
    e.preventDefault();
    if (!shiftForm.title || !shiftForm.startAt || !shiftForm.endAt) {
      setStatus({ fail: 'Shift title, start time, and end time are required.' });
      return;
    }
    setBusy(true);
    try {
      await createVolunteerShift({
        campaignId: shiftForm.campaignId || undefined,
        title: shiftForm.title,
        location: shiftForm.location,
        startAt: shiftForm.startAt,
        endAt: shiftForm.endAt,
        slots: Number(shiftForm.slots || 1)
      });
      setShiftForm({
        campaignId: '',
        title: '',
        location: '',
        startAt: '',
        endAt: '',
        slots: '10'
      });
      setStatus({ ok: 'Volunteer shift created.' });
      await loadData();
    } catch (err) {
      setStatus({ fail: err.response?.data?.message || 'Failed to create volunteer shift.' });
    } finally {
      setBusy(false);
    }
  };

  const handleApproveNgoVolunteerLog = async (logId) => {
    setBusy(true);
    try {
      await approveVolunteerLog(logId, { decision: 'approve', note: 'Approved from Innovation Center' });
      setStatus({ ok: 'Volunteer log approved.' });
      await loadData();
    } catch (err) {
      setStatus({ fail: err.response?.data?.message || 'Failed to approve volunteer log.' });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateEndorsement = async (e) => {
    e.preventDefault();
    const skills = String(endorsementForm.skills || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!endorsementForm.userId || skills.length === 0) {
      setStatus({ fail: 'Volunteer user ID and at least one skill are required.' });
      return;
    }
    setBusy(true);
    try {
      await createVolunteerEndorsement({
        userId: endorsementForm.userId,
        applicationId: endorsementForm.applicationId || undefined,
        skills,
        note: endorsementForm.note
      });
      setEndorsementForm({ userId: '', applicationId: '', skills: '', note: '' });
      setStatus({ ok: 'Volunteer endorsement created.' });
    } catch (err) {
      setStatus({ fail: err.response?.data?.message || 'Failed to create volunteer endorsement.' });
    } finally {
      setBusy(false);
    }
  };

  if (!localStorage.getItem('token')) {
    return <div className="p-6 text-center">Please login to access Innovation Center.</div>;
  }

  if (loading) {
    return <div className="p-6 text-center">Loading innovation center...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Innovation Center</h1>
        <p className="text-sm text-gray-600 mt-1">
          Unified controls for giving circles, in-kind support, emergency response, gamification, and NGO operations.
        </p>
      </header>

      {message && <div className="p-3 rounded border border-emerald-200 bg-emerald-50 text-emerald-700">{message}</div>}
      {error && <div className="p-3 rounded border border-red-200 bg-red-50 text-red-700">{error}</div>}

      <section className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">Emergency Response Feed</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="rounded border p-3">
            <p className="font-semibold text-gray-800">Emergency Campaigns</p>
            <p className="text-2xl font-bold mt-1">{(emergencyFeed.campaigns || []).length}</p>
          </div>
          <div className="rounded border p-3">
            <p className="font-semibold text-gray-800">Emergency Volunteer Needs</p>
            <p className="text-2xl font-bold mt-1">{(emergencyFeed.volunteerOpportunities || []).length}</p>
          </div>
          <div className="rounded border p-3">
            <p className="font-semibold text-gray-800">Emergency Wishlist Items</p>
            <p className="text-2xl font-bold mt-1">{(emergencyFeed.wishlistItems || []).length}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
          <div className="rounded border p-3">
            <p className="font-semibold text-gray-900 mb-3">Emergency Campaign Contributions</p>
            {(emergencyFeed.campaigns || []).length === 0 ? (
              <p className="text-gray-500">No emergency campaigns right now.</p>
            ) : (
              <div className="space-y-4">
                {(emergencyFeed.campaigns || []).slice(0, 5).map((campaign) => {
                  const goalAmount = Number(campaign?.goalAmount || 0);
                  const currentAmount = Number(campaign?.currentAmount || 0);
                  const remainingAmount = Math.max(goalAmount - currentAmount, 0);
                  const completed = goalAmount > 0 && remainingAmount <= 0;
                  const paymentMethod = emergencyPaymentMethods[campaign.id] || 'upi';
                  const details = emergencyPaymentDetails[campaign.id] || emptyPaymentDetails;

                  return (
                    <div key={campaign.id} className="border rounded p-3 bg-gray-50">
                      <p className="font-semibold text-gray-800">{campaign.title || 'Emergency Campaign'}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        Raised: {currency(currentAmount)} / Goal: {currency(goalAmount)} / Remaining: {currency(remainingAmount)}
                      </p>
                      {completed && (
                        <p className="text-xs font-semibold text-emerald-700 mt-1">Need Completed</p>
                      )}

                      {isUser && (
                        <div className="mt-3 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="number"
                              min="1"
                              className="p-2 border rounded"
                              placeholder="Amount"
                              value={emergencyContributionAmount[campaign.id] || ''}
                              onChange={(e) => setEmergencyContributionAmount((prev) => ({ ...prev, [campaign.id]: e.target.value }))}
                              disabled={busy || completed}
                            />
                            <select
                              value={paymentMethod}
                              onChange={(e) => setEmergencyPaymentMethods((prev) => ({ ...prev, [campaign.id]: e.target.value }))}
                              className="p-2 border rounded"
                              disabled={busy || completed}
                            >
                              {emergencyPaymentOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={busy || completed}
                              onClick={() => handleEmergencyContribute(campaign)}
                              className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                            >
                              {completed ? 'Need Completed' : 'Contribute'}
                            </button>
                          </div>

                          {paymentMethod === 'upi' && (
                            <input
                              className="w-full p-2 border rounded"
                              placeholder="yourname@bank"
                              value={details.upiId || ''}
                              onChange={(e) => updateEmergencyPaymentDetail(campaign.id, 'upiId', e.target.value)}
                              disabled={busy || completed}
                            />
                          )}

                          {paymentMethod === 'card' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                className="p-2 border rounded sm:col-span-2"
                                placeholder="Cardholder name"
                                value={details.cardHolderName || ''}
                                onChange={(e) => updateEmergencyPaymentDetail(campaign.id, 'cardHolderName', e.target.value)}
                                disabled={busy || completed}
                              />
                              <input
                                className="p-2 border rounded sm:col-span-2"
                                placeholder="Card number"
                                value={details.cardNumber || ''}
                                onChange={(e) => updateEmergencyPaymentDetail(campaign.id, 'cardNumber', e.target.value)}
                                disabled={busy || completed}
                              />
                              <input
                                className="p-2 border rounded"
                                placeholder="MM/YY"
                                value={details.expiry || ''}
                                onChange={(e) => updateEmergencyPaymentDetail(campaign.id, 'expiry', e.target.value)}
                                disabled={busy || completed}
                              />
                              <input
                                className="p-2 border rounded"
                                placeholder="CVV"
                                value={details.cvv || ''}
                                onChange={(e) => updateEmergencyPaymentDetail(campaign.id, 'cvv', e.target.value)}
                                disabled={busy || completed}
                              />
                            </div>
                          )}

                          {paymentMethod === 'netbanking' && (
                            <select
                              className="w-full p-2 border rounded"
                              value={details.netbankingBank || ''}
                              onChange={(e) => updateEmergencyPaymentDetail(campaign.id, 'netbankingBank', e.target.value)}
                              disabled={busy || completed}
                            >
                              <option value="">Select bank</option>
                              {netbankingBanks.map((bank) => (
                                <option key={bank} value={bank}>{bank}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded border p-3">
            <p className="font-semibold text-gray-900 mb-3">Emergency Wishlist Snapshot</p>
            {(emergencyFeed.wishlistItems || []).length === 0 ? (
              <p className="text-gray-500">No emergency wishlist needs pending.</p>
            ) : (
              <div className="space-y-2">
                {(emergencyFeed.wishlistItems || []).slice(0, 8).map((item) => {
                  const quantityNeeded = Number(item?.quantityNeeded || 0);
                  const quantityCommitted = Math.max(Number(item?.quantityCommitted || 0), Number(item?.quantityFulfilled || 0));
                  const quantityRemaining = Math.max(
                    Number(item?.quantityRemaining ?? (quantityNeeded - quantityCommitted)) || 0,
                    0
                  );
                  const completed = quantityRemaining <= 0 || String(item?.status || '').toLowerCase() === 'completed';
                  return (
                    <div key={item.id} className="border rounded p-2 bg-gray-50">
                      <p className="font-medium text-gray-800">{item.itemName}</p>
                      <p className="text-xs text-gray-600">
                        Needed: {quantityNeeded} | Committed: {quantityCommitted} | Remaining: {quantityRemaining}
                      </p>
                      {completed && <p className="text-xs font-semibold text-emerald-700 mt-1">Need Completed</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">Giving Circles</h2>
        {isUser && (
          <form onSubmit={handleCreateCircle} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <select
              value={circleForm.campaignId}
              onChange={(e) => setCircleForm((prev) => ({ ...prev, campaignId: e.target.value }))}
              className="p-2 border rounded"
            >
              <option value="">Select campaign</option>
              {(campaigns || []).map((campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.title}</option>
              ))}
            </select>
            <input
              className="p-2 border rounded"
              placeholder="Circle name"
              value={circleForm.name}
              onChange={(e) => setCircleForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <input
              className="p-2 border rounded"
              placeholder="Goal amount"
              type="number"
              min="1"
              value={circleForm.goalAmount}
              onChange={(e) => setCircleForm((prev) => ({ ...prev, goalAmount: e.target.value }))}
            />
            <button disabled={busy} className="px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
              Create Circle
            </button>
            <input
              className="md:col-span-4 p-2 border rounded"
              placeholder="Description (optional)"
              value={circleForm.description}
              onChange={(e) => setCircleForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </form>
        )}

        <div className="space-y-3">
          {(givingCircles || []).slice(0, 10).map((circle) => {
            const { remainingAmount, needCompleted } = getCircleState(circle);
            const paymentMethod = circlePaymentMethods[circle.id] || 'upi';
            const details = circlePaymentDetails[circle.id] || emptyPaymentDetails;
            return (
              <div key={circle.id} className="border rounded p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{circle.name}</p>
                  <p className="text-xs text-gray-600">
                    {currency(circle.currentAmount)} raised of {currency(circle.goalAmount)} | Remaining: {currency(remainingAmount)} | Members: {circle.memberCount || 0}
                  </p>
                  {needCompleted && <p className="text-xs font-semibold text-emerald-700 mt-1">Need Completed</p>}
                </div>
                {isUser && (
                  <div className="w-full md:w-auto space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:min-w-[420px]">
                      <input
                        type="number"
                        min="1"
                        className="p-2 border rounded"
                        placeholder="Amount"
                        value={circleContribution[circle.id] || ''}
                        onChange={(e) => setCircleContribution((prev) => ({ ...prev, [circle.id]: e.target.value }))}
                        disabled={busy || needCompleted}
                      />
                      <select
                        value={paymentMethod}
                        onChange={(e) => setCirclePaymentMethods((prev) => ({ ...prev, [circle.id]: e.target.value }))}
                        className="p-2 border rounded"
                        disabled={busy || needCompleted}
                      >
                        {circlePaymentOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy || needCompleted}
                        onClick={() => handleContributeCircle(circle)}
                        className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {needCompleted ? 'Need Completed' : 'Contribute'}
                      </button>
                    </div>

                    {paymentMethod === 'upi' && (
                      <input
                        className="w-full p-2 border rounded"
                        placeholder="yourname@bank"
                        value={details.upiId || ''}
                        onChange={(e) => updateCirclePaymentDetail(circle.id, 'upiId', e.target.value)}
                        disabled={busy || needCompleted}
                      />
                    )}

                    {paymentMethod === 'card' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          className="p-2 border rounded sm:col-span-2"
                          placeholder="Cardholder name"
                          value={details.cardHolderName || ''}
                          onChange={(e) => updateCirclePaymentDetail(circle.id, 'cardHolderName', e.target.value)}
                          disabled={busy || needCompleted}
                        />
                        <input
                          className="p-2 border rounded sm:col-span-2"
                          placeholder="Card number"
                          value={details.cardNumber || ''}
                          onChange={(e) => updateCirclePaymentDetail(circle.id, 'cardNumber', e.target.value)}
                          disabled={busy || needCompleted}
                        />
                        <input
                          className="p-2 border rounded"
                          placeholder="MM/YY"
                          value={details.expiry || ''}
                          onChange={(e) => updateCirclePaymentDetail(circle.id, 'expiry', e.target.value)}
                          disabled={busy || needCompleted}
                        />
                        <input
                          className="p-2 border rounded"
                          placeholder="CVV"
                          value={details.cvv || ''}
                          onChange={(e) => updateCirclePaymentDetail(circle.id, 'cvv', e.target.value)}
                          disabled={busy || needCompleted}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">In-Kind Wishlist</h2>
        <div className="space-y-3">
          {(wishlistItems || []).slice(0, 12).map((item) => {
            const { quantityNeeded, quantityFulfilled, quantityCommitted, quantityRemaining, needCompleted } = getWishlistState(item);
            return (
              <div key={item.id} className="border rounded p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{item.itemName}</p>
                  <p className="text-xs text-gray-600">
                    Needed: {quantityNeeded} | Committed: {quantityCommitted} | Fulfilled: {quantityFulfilled} | Remaining: {quantityRemaining}
                    {item.emergency ? ' | Emergency' : ''}
                  </p>
                  {needCompleted && <p className="text-xs font-semibold text-emerald-700 mt-1">Need Completed</p>}
                </div>
                {isUser && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      className="p-2 border rounded w-24"
                      placeholder="Qty"
                      value={wishlistPledge[item.id] || ''}
                      onChange={(e) => setWishlistPledge((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      disabled={busy || needCompleted}
                    />
                    <button
                      type="button"
                      disabled={busy || needCompleted}
                      onClick={() => handlePledgeItem(item)}
                      className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {needCompleted ? 'Need Completed' : 'Pledge'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {isUser && (
        <section className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Gamification and Endorsements</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="border rounded p-3">
              <p className="text-sm text-gray-600">Your Points</p>
              <p className="text-3xl font-bold">{Number(gamificationSummary?.points || 0)}</p>
              <p className="text-xs text-gray-600 mt-2">Badges: {(gamificationSummary?.badges || []).join(', ') || 'None yet'}</p>
            </div>
            <div className="border rounded p-3">
              <p className="text-sm text-gray-600 mb-2">Top Contributors</p>
              <ul className="space-y-1 text-sm">
                {(leaderboard || []).map((row) => (
                  <li key={row.userId} className="flex justify-between">
                    <span>#{row.rank} {row.name}</span>
                    <span className="font-semibold">{row.points}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-4 border rounded p-3">
            <p className="text-sm text-gray-600 mb-2">Your Volunteer Endorsements</p>
            {(endorsements || []).length === 0 ? (
              <p className="text-sm text-gray-500">No endorsements yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {endorsements.slice(0, 8).map((entry) => (
                  <li key={entry.id} className="border rounded p-2">
                    <p className="font-semibold text-gray-800">{entry.ngo?.name || 'NGO'}</p>
                    <p className="text-gray-600">{(entry.skills || []).join(', ')}</p>
                    {entry.note && <p className="text-gray-500 text-xs mt-1">{entry.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {isUser && (
        <section className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Corporate Matching</h2>
          <form onSubmit={handleCreateCorporateProfile} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <input
              className="p-2 border rounded"
              placeholder="Company name"
              value={corporateForm.companyName}
              onChange={(e) => setCorporateForm((prev) => ({ ...prev, companyName: e.target.value }))}
            />
            <input
              className="p-2 border rounded"
              type="number"
              min="0.1"
              step="0.1"
              placeholder="Match ratio"
              value={corporateForm.matchRatio}
              onChange={(e) => setCorporateForm((prev) => ({ ...prev, matchRatio: e.target.value }))}
            />
            <input
              className="p-2 border rounded"
              type="number"
              min="0"
              placeholder="Cap per employee"
              value={corporateForm.capPerEmployee}
              onChange={(e) => setCorporateForm((prev) => ({ ...prev, capPerEmployee: e.target.value }))}
            />
            <button disabled={busy} className="px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
              Create Profile
            </button>
          </form>

          <form onSubmit={handleEvaluateCorporateMatch} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <select
              className="p-2 border rounded"
              value={corporateForm.donationId}
              onChange={(e) => setCorporateForm((prev) => ({ ...prev, donationId: e.target.value }))}
            >
              <option value="">Select completed donation</option>
              {(myDonations || [])
                .filter((entry) => String(entry?.status || '').toLowerCase() === 'completed')
                .slice(0, 25)
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.id} | {currency(entry.amount)}
                  </option>
                ))}
            </select>
            <button disabled={busy} className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
              Evaluate Match
            </button>
            <div className="text-xs text-gray-500 flex items-center">
              Requires at least one approved/linked corporate profile.
            </div>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="border rounded p-3">
              <p className="font-semibold text-gray-900 mb-2">Your Corporate Profiles</p>
              {(corporateProfiles.ownedProfiles || []).length === 0 ? (
                <p className="text-gray-500">No profiles created yet.</p>
              ) : (
                (corporateProfiles.ownedProfiles || []).map((profile) => (
                  <p key={profile.id} className="text-gray-600">
                    {profile.companyName} | Ratio {profile.matchRatio} | Cap {currency(profile.capPerEmployee)}
                  </p>
                ))
              )}
            </div>
            <div className="border rounded p-3">
              <p className="font-semibold text-gray-900 mb-2">Your Corporate Match Requests</p>
              {(corporateMatches || []).length === 0 ? (
                <p className="text-gray-500">No match requests yet.</p>
              ) : (
                (corporateMatches || []).slice(0, 10).map((match) => (
                  <div key={match.id} className="mb-2">
                    <p className="text-gray-700">
                      {match.corporateProfile?.companyName || 'Corporate'} | {currency(match.matchedAmount)} | {match.status}
                    </p>
                    {String(match.status || '').toLowerCase() !== 'approved' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleApproveCorporateMatch(match.id)}
                        className="mt-1 px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        Approve (Owner/Admin)
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {isNgo && (
        <>
          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">NGO Wishlist and Impact Operations</h2>
            <form onSubmit={handleCreateWishlist} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <select
                value={wishlistForm.campaignId}
                onChange={(e) => setWishlistForm((prev) => ({ ...prev, campaignId: e.target.value }))}
                className="p-2 border rounded"
              >
                <option value="">Campaign (optional)</option>
                {(ownedCampaigns || []).map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.title}</option>
                ))}
              </select>
              <input
                className="p-2 border rounded"
                placeholder="Item name"
                value={wishlistForm.itemName}
                onChange={(e) => setWishlistForm((prev) => ({ ...prev, itemName: e.target.value }))}
              />
              <input
                className="p-2 border rounded"
                placeholder="Quantity needed"
                type="number"
                min="1"
                value={wishlistForm.quantityNeeded}
                onChange={(e) => setWishlistForm((prev) => ({ ...prev, quantityNeeded: e.target.value }))}
              />
              <button disabled={busy} className="px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
                Add Wishlist Item
              </button>
              <input
                className="md:col-span-2 p-2 border rounded"
                placeholder="Description"
                value={wishlistForm.description}
                onChange={(e) => setWishlistForm((prev) => ({ ...prev, description: e.target.value }))}
              />
              <input
                className="p-2 border rounded"
                placeholder="Unit (books, kits, etc.)"
                value={wishlistForm.unit}
                onChange={(e) => setWishlistForm((prev) => ({ ...prev, unit: e.target.value }))}
              />
              <label className="flex items-center gap-2 p-2 border rounded text-sm">
                <input
                  type="checkbox"
                  checked={wishlistForm.emergency}
                  onChange={(e) => setWishlistForm((prev) => ({ ...prev, emergency: e.target.checked }))}
                />
                Emergency item
              </label>
            </form>

            <form onSubmit={handleCreateImpactUpdate} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                value={impactForm.campaignId}
                onChange={(e) => setImpactForm((prev) => ({ ...prev, campaignId: e.target.value }))}
                className="p-2 border rounded"
              >
                <option value="">Select campaign</option>
                {(ownedCampaigns || []).map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.title}</option>
                ))}
              </select>
              <input
                className="p-2 border rounded"
                placeholder="Impact update title"
                value={impactForm.title}
                onChange={(e) => setImpactForm((prev) => ({ ...prev, title: e.target.value }))}
              />
              <input
                className="p-2 border rounded"
                placeholder="Amount utilized"
                type="number"
                min="0"
                value={impactForm.amountUtilized}
                onChange={(e) => setImpactForm((prev) => ({ ...prev, amountUtilized: e.target.value }))}
              />
              <input
                className="p-2 border rounded"
                placeholder="Beneficiaries reached"
                type="number"
                min="0"
                value={impactForm.beneficiariesReached}
                onChange={(e) => setImpactForm((prev) => ({ ...prev, beneficiariesReached: e.target.value }))}
              />
              <textarea
                className="md:col-span-4 p-2 border rounded"
                rows={3}
                placeholder="Detailed progress note"
                value={impactForm.details}
                onChange={(e) => setImpactForm((prev) => ({ ...prev, details: e.target.value }))}
              />
              <button disabled={busy} className="md:col-span-4 px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">
                Post Impact Update
              </button>
            </form>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="border rounded p-3">
                <p className="font-semibold text-gray-900 mb-2">Your Wishlist Items</p>
                {(ngoWishlistItems || []).slice(0, 6).map((item) => {
                  const quantityCommitted = Math.max(Number(item?.quantityCommitted || 0), Number(item?.quantityFulfilled || 0));
                  const quantityNeeded = Number(item?.quantityNeeded || 0);
                  const quantityRemaining = Math.max(
                    Number(item?.quantityRemaining ?? (quantityNeeded - quantityCommitted)) || 0,
                    0
                  );
                  const needCompleted = quantityRemaining <= 0 || String(item?.status || '').toLowerCase() === 'completed';
                  return (
                    <p key={item.id} className="text-gray-600">
                      {item.itemName}: {quantityCommitted}/{quantityNeeded} {needCompleted ? '(Need Completed)' : ''}
                    </p>
                  );
                })}
              </div>
              <div className="border rounded p-3">
                <p className="font-semibold text-gray-900 mb-2">Recent Impact Updates</p>
                {(ngoImpactUpdates || []).slice(0, 6).map((entry) => (
                  <p key={entry.id} className="text-gray-600">{entry.title}</p>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Donor CRM</h2>
            <form onSubmit={handleCreateSegment} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <input
                className="p-2 border rounded"
                placeholder="Segment name"
                value={segmentForm.segmentName}
                onChange={(e) => setSegmentForm((prev) => ({ ...prev, segmentName: e.target.value }))}
              />
              <input
                className="p-2 border rounded"
                placeholder="Segment description"
                value={segmentForm.segmentDescription}
                onChange={(e) => setSegmentForm((prev) => ({ ...prev, segmentDescription: e.target.value }))}
              />
              <button disabled={busy} className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
                Create Segment
              </button>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="border rounded p-3">
                <p className="font-semibold text-gray-900 mb-2">Top Donors</p>
                {(crmDonors || []).slice(0, 8).map((donor) => (
                  <p key={donor.donorUserId} className="text-gray-600">
                    {donor.donorName} - {currency(donor.totalAmount)} ({donor.donationCount} donations)
                  </p>
                ))}
              </div>
              <div className="border rounded p-3 space-y-3">
                <p className="font-semibold text-gray-900">Segments</p>
                {(crmSegments || []).slice(0, 6).map((segment) => {
                  const payload = segmentMessage[segment.id] || { title: '', message: '' };
                  return (
                    <div key={segment.id} className="border rounded p-2">
                      <p className="font-medium text-gray-800">{segment.segmentName}</p>
                      <p className="text-xs text-gray-500 mb-2">Members: {segment.memberCount || 0}</p>
                      <input
                        className="w-full p-2 border rounded mb-2"
                        placeholder="Message title"
                        value={payload.title}
                        onChange={(e) => setSegmentMessage((prev) => ({
                          ...prev,
                          [segment.id]: { ...(prev[segment.id] || {}), title: e.target.value }
                        }))}
                      />
                      <textarea
                        className="w-full p-2 border rounded mb-2"
                        rows={2}
                        placeholder="Message body"
                        value={payload.message}
                        onChange={(e) => setSegmentMessage((prev) => ({
                          ...prev,
                          [segment.id]: { ...(prev[segment.id] || {}), message: e.target.value }
                        }))}
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleSendSegmentMessage(segment.id)}
                        className="px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        Send Message
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Volunteer Shift Operations</h2>
            <form onSubmit={handleCreateShift} className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
              <select
                value={shiftForm.campaignId}
                onChange={(e) => setShiftForm((prev) => ({ ...prev, campaignId: e.target.value }))}
                className="p-2 border rounded"
              >
                <option value="">Campaign (optional)</option>
                {(ownedCampaigns || []).map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.title}</option>
                ))}
              </select>
              <input
                className="p-2 border rounded"
                placeholder="Shift title"
                value={shiftForm.title}
                onChange={(e) => setShiftForm((prev) => ({ ...prev, title: e.target.value }))}
              />
              <input
                className="p-2 border rounded"
                placeholder="Location"
                value={shiftForm.location}
                onChange={(e) => setShiftForm((prev) => ({ ...prev, location: e.target.value }))}
              />
              <input
                className="p-2 border rounded"
                type="datetime-local"
                value={shiftForm.startAt}
                onChange={(e) => setShiftForm((prev) => ({ ...prev, startAt: e.target.value }))}
              />
              <input
                className="p-2 border rounded"
                type="datetime-local"
                value={shiftForm.endAt}
                onChange={(e) => setShiftForm((prev) => ({ ...prev, endAt: e.target.value }))}
              />
              <button disabled={busy} className="px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
                Create Shift
              </button>
            </form>

            <div className="border rounded p-3 text-sm">
              <p className="font-semibold text-gray-900 mb-2">Pending Volunteer Logs</p>
              {(ngoVolunteerLogs || []).length === 0 ? (
                <p className="text-gray-500">No pending volunteer logs.</p>
              ) : (
                (ngoVolunteerLogs || []).slice(0, 10).map((log) => (
                  <div key={log.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border-b py-2 last:border-b-0">
                    <div>
                      <p className="text-gray-700">{log.user?.name || log.userId} | {Number(log.hours || 0)}h</p>
                      <p className="text-xs text-gray-500">{log.summary || 'No summary provided'}</p>
                    </div>
                    {String(log.approvalStatus || '').toLowerCase() !== 'approved' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleApproveNgoVolunteerLog(log.id)}
                        className="px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        Approve
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Volunteer Endorsements</h2>
            <form onSubmit={handleCreateEndorsement} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                className="p-2 border rounded"
                placeholder="Volunteer user ID"
                value={endorsementForm.userId}
                onChange={(e) => setEndorsementForm((prev) => ({ ...prev, userId: e.target.value }))}
              />
              <input
                className="p-2 border rounded"
                placeholder="Application ID (optional)"
                value={endorsementForm.applicationId}
                onChange={(e) => setEndorsementForm((prev) => ({ ...prev, applicationId: e.target.value }))}
              />
              <input
                className="p-2 border rounded"
                placeholder="Skills (comma separated)"
                value={endorsementForm.skills}
                onChange={(e) => setEndorsementForm((prev) => ({ ...prev, skills: e.target.value }))}
              />
              <button disabled={busy} className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
                Submit Endorsement
              </button>
              <textarea
                className="md:col-span-4 p-2 border rounded"
                rows={2}
                placeholder="Optional endorsement note"
                value={endorsementForm.note}
                onChange={(e) => setEndorsementForm((prev) => ({ ...prev, note: e.target.value }))}
              />
            </form>
          </section>
        </>
      )}
    </div>
  );
}
