import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import api from '../services/api';
import RecommendedNgos from '../components/RecommendedNgos';
import PreferencesModal from '../components/PreferencesModal';
import {
  createHelpRequest,
  getCertificateById,
  getDonationReceipt,
  getMyDonations,
  getMyCampaignVolunteerRegistrations,
  getMyHelpRequests,
  getMyVolunteerApplications,
  getUserPreferences
} from '../services/api';

const getCertificateId = (entity) => {
  const certificate = entity?.certificate;
  if (!certificate) return '';
  if (typeof certificate === 'string') return certificate;
  return certificate?.id || '';
};

const openHtmlDocument = (html) => {
  const viewer = window.open('', '_blank');
  if (!viewer) return false;
  viewer.document.open();
  viewer.document.write(html);
  viewer.document.close();
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

const monthLabel = (value) => new Date(value).toLocaleString('en-US', { month: 'short', year: '2-digit' });

export default function UserDashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [ngoCount, setNgoCount] = useState(0);
  const [campaignCount, setCampaignCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [availableNgos, setAvailableNgos] = useState([]);

  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [hasPreferences, setHasPreferences] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);

  const [helpRequests, setHelpRequests] = useState([]);
  const [helpForm, setHelpForm] = useState({
    ngoId: '',
    age: '',
    location: '',
    helpType: '',
    description: ''
  });
  const [helpMessage, setHelpMessage] = useState('');
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpRefreshing, setHelpRefreshing] = useState(false);
  const [helpQuery, setHelpQuery] = useState('');
  const [helpStatusFilter, setHelpStatusFilter] = useState('all');

  const [donationsHistory, setDonationsHistory] = useState([]);
  const [donationsLoading, setDonationsLoading] = useState(true);
  const [volunteerHistory, setVolunteerHistory] = useState([]);
  const [volunteerHistoryLoading, setVolunteerHistoryLoading] = useState(true);
  const [campaignVolunteerRegistrations, setCampaignVolunteerRegistrations] = useState([]);
  const [campaignVolunteerRegistrationsLoading, setCampaignVolunteerRegistrationsLoading] = useState(true);
  const [historyMessage, setHistoryMessage] = useState('');

  const [donationSearch, setDonationSearch] = useState('');
  const [donationSort, setDonationSort] = useState('latest');
  const [donationStatusFilter, setDonationStatusFilter] = useState('all');

  const [volunteerSearch, setVolunteerSearch] = useState('');
  const [volunteerSort, setVolunteerSort] = useState('latest');
  const [volunteerStatusFilter, setVolunteerStatusFilter] = useState('all');

  const [selectedDonation, setSelectedDonation] = useState(null);
  const [selectedVolunteer, setSelectedVolunteer] = useState(null);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [historyModalLoading, setHistoryModalLoading] = useState(false);
  const [historyDetailError, setHistoryDetailError] = useState('');

  const closeHistoryModal = () => {
    setSelectedDonation(null);
    setSelectedVolunteer(null);
    setSelectedReceipt(null);
    setHistoryModalLoading(false);
    setHistoryDetailError('');
  };

  const loadContributionHistory = useCallback(async () => {
    setDonationsLoading(true);
    setVolunteerHistoryLoading(true);
    setCampaignVolunteerRegistrationsLoading(true);
    setHistoryMessage('');

    const [donationsResult, volunteerResult, campaignVolunteerResult] = await Promise.allSettled([
      getMyDonations(),
      getMyVolunteerApplications(),
      getMyCampaignVolunteerRegistrations()
    ]);

    if (donationsResult.status === 'fulfilled') {
      setDonationsHistory(donationsResult.value.data || []);
    } else {
      setDonationsHistory([]);
      setHistoryMessage('Unable to load donation history right now.');
    }

    if (volunteerResult.status === 'fulfilled') {
      setVolunteerHistory(volunteerResult.value.data || []);
    } else {
      setVolunteerHistory([]);
      setHistoryMessage((prev) => prev || 'Unable to load volunteer history right now.');
    }

    if (campaignVolunteerResult.status === 'fulfilled') {
      setCampaignVolunteerRegistrations(campaignVolunteerResult.value.data || []);
    } else {
      setCampaignVolunteerRegistrations([]);
      setHistoryMessage((prev) => prev || 'Unable to load campaign volunteer registrations right now.');
    }

    setDonationsLoading(false);
    setVolunteerHistoryLoading(false);
    setCampaignVolunteerRegistrationsLoading(false);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser(payload);
      } catch (err) {
        setUser(null);
      }
    }

    api.get('/campaigns')
      .then((res) => {
        setCampaignCount((res.data || []).length);
      })
      .catch(() => {
        setCampaignCount(0);
      })
      .finally(() => setLoading(false));

    api.get('/ngos')
      .then((res) => {
        setAvailableNgos(res.data || []);
        setNgoCount((res.data || []).length);
      })
      .catch(() => {
        setAvailableNgos([]);
        setNgoCount(0);
      });

    const checkPreferences = async () => {
      try {
        const res = await getUserPreferences();
        const prefs = res.data || {};
        const hasPrefs = prefs.location ||
          (prefs.interests && prefs.interests.length > 0) ||
          (prefs.causes && prefs.causes.length > 0) ||
          (prefs.skills && prefs.skills.length > 0);
        setHasPreferences(!!hasPrefs);
      } catch (err) {
        setHasPreferences(false);
      }
    };

    checkPreferences();

    getMyHelpRequests()
      .then((res) => setHelpRequests(res.data || []))
      .catch(() => setHelpRequests([]));

    api.get('/notifications')
      .then((res) => setNotifications(res.data || []))
      .catch(() => setNotifications([]))
      .finally(() => setNotificationsLoading(false));

    loadContributionHistory();
  }, [loadContributionHistory]);

  const submitHelpRequest = async (e) => {
    e.preventDefault();
    if (!helpForm.ngoId || !helpForm.helpType) {
      setHelpMessage('Please select an NGO and specify the help type.');
      return;
    }

    setHelpLoading(true);
    setHelpMessage('');
    try {
      const res = await createHelpRequest(helpForm);
      setHelpRequests((prev) => [res.data, ...prev]);
      setHelpForm({ ngoId: '', age: '', location: '', helpType: '', description: '' });
      setHelpMessage('Request submitted successfully.');
    } catch (err) {
      setHelpMessage(err.response?.data?.message || 'Failed to submit request.');
    }
    setHelpLoading(false);
  };

  const refreshHelpRequests = async () => {
    setHelpRefreshing(true);
    setHelpMessage('');
    try {
      const res = await getMyHelpRequests();
      setHelpRequests(res.data || []);
    } catch (err) {
      setHelpRequests([]);
      setHelpMessage('Unable to load support requests right now.');
    } finally {
      setHelpRefreshing(false);
    }
  };

  const handleGetRecommendations = () => {
    if (hasPreferences) {
      navigate('/recommendations');
      return;
    }
    setShowPreferencesModal(true);
  };

  const handlePreferencesComplete = () => {
    setHasPreferences(true);
    navigate('/recommendations');
  };

  const filteredDonations = useMemo(() => {
    const searchText = donationSearch.trim().toLowerCase();
    let items = donationsHistory.filter((donation) => {
      const searchable = [
        donation?.campaign?.title,
        donation?.ngo?.name,
        donation?.receiptNumber,
        donation?.paymentMethod,
        donation?.status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (searchText && !searchable.includes(searchText)) return false;
      if (donationStatusFilter !== 'all' && donation?.status !== donationStatusFilter) return false;
      return true;
    });

    items = [...items].sort((a, b) => {
      if (donationSort === 'amount_high') return Number(b?.amount || 0) - Number(a?.amount || 0);
      if (donationSort === 'amount_low') return Number(a?.amount || 0) - Number(b?.amount || 0);
      if (donationSort === 'oldest') return new Date(a?.createdAt || 0) - new Date(b?.createdAt || 0);
      return new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0);
    });

    return items;
  }, [donationsHistory, donationSearch, donationStatusFilter, donationSort]);

  const filteredVolunteerHistory = useMemo(() => {
    const searchText = volunteerSearch.trim().toLowerCase();
    let items = volunteerHistory.filter((application) => {
      const searchable = [
        application?.opportunity?.title,
        application?.opportunity?.ngo?.name,
        application?.assignedTask,
        application?.status,
        application?.certificateApprovalStatus
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (searchText && !searchable.includes(searchText)) return false;
      if (volunteerStatusFilter !== 'all' && application?.status !== volunteerStatusFilter) return false;
      return true;
    });

    items = [...items].sort((a, b) => {
      if (volunteerSort === 'oldest') return new Date(a?.createdAt || 0) - new Date(b?.createdAt || 0);
      if (volunteerSort === 'status') return String(a?.status || '').localeCompare(String(b?.status || ''));
      return new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0);
    });

    return items;
  }, [volunteerHistory, volunteerSearch, volunteerSort, volunteerStatusFilter]);

  const filteredHelpRequests = useMemo(() => {
    const q = helpQuery.trim().toLowerCase();
    const status = String(helpStatusFilter || 'all').trim().toLowerCase();

    const rows = (helpRequests || []).filter((request) => {
      const rawStatus = String(request?.status || 'Pending').trim().toLowerCase();
      if (status !== 'all' && rawStatus !== status) return false;
      if (!q) return true;
      const hay = [
        request?.ngo?.name,
        request?.helpType,
        request?.location,
        request?.description,
        request?.status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    return [...rows].sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0));
  }, [helpRequests, helpQuery, helpStatusFilter]);

  const historyTrendData = useMemo(() => {
    const buckets = new Map();

    donationsHistory
      .filter((donation) => donation?.status === 'completed')
      .forEach((donation) => {
        const createdAt = donation?.createdAt ? new Date(donation.createdAt) : null;
        if (!createdAt || Number.isNaN(createdAt.getTime())) return;
        const key = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
        if (!buckets.has(key)) {
          buckets.set(key, { key, month: monthLabel(createdAt), donatedAmount: 0, volunteerActivities: 0 });
        }
        const current = buckets.get(key);
        current.donatedAmount += Number(donation?.amount || 0);
      });

    volunteerHistory
      .filter((application) => application?.status === 'completed')
      .forEach((application) => {
        const completedAtValue = application?.completedAt || application?.createdAt;
        const completedAt = completedAtValue ? new Date(completedAtValue) : null;
        if (!completedAt || Number.isNaN(completedAt.getTime())) return;
        const key = `${completedAt.getFullYear()}-${String(completedAt.getMonth() + 1).padStart(2, '0')}`;
        if (!buckets.has(key)) {
          buckets.set(key, { key, month: monthLabel(completedAt), donatedAmount: 0, volunteerActivities: 0 });
        }
        const current = buckets.get(key);
        current.volunteerActivities += 1;
      });

    campaignVolunteerRegistrations
      .filter((row) => {
        const status = String(row?.registration?.certificateApprovalStatus || '').trim().toLowerCase();
        return Boolean(row?.registration) && status === 'approved';
      })
      .forEach((row) => {
        const registration = row?.registration || {};
        const approvedAtValue = registration?.certificateApprovalReviewedAt || registration?.completedAt || registration?.updatedAt || registration?.createdAt;
        const approvedAt = approvedAtValue ? new Date(approvedAtValue) : null;
        if (!approvedAt || Number.isNaN(approvedAt.getTime())) return;

        const key = `${approvedAt.getFullYear()}-${String(approvedAt.getMonth() + 1).padStart(2, '0')}`;
        if (!buckets.has(key)) {
          buckets.set(key, { key, month: monthLabel(approvedAt), donatedAmount: 0, volunteerActivities: 0 });
        }
        const current = buckets.get(key);
        current.volunteerActivities += 1;
      });

    return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [donationsHistory, volunteerHistory, campaignVolunteerRegistrations]);

  const totalDonated = useMemo(
    () => donationsHistory
      .filter((donation) => donation?.status === 'completed')
      .reduce((sum, donation) => sum + Number(donation?.amount || 0), 0),
    [donationsHistory]
  );

  const completedVolunteerActivities = useMemo(() => {
    const opportunityCount = volunteerHistory.filter((application) => application?.status === 'completed').length;
    const campaignCount = campaignVolunteerRegistrations.filter((row) => {
      const status = String(row?.registration?.certificateApprovalStatus || '').trim().toLowerCase();
      return Boolean(row?.registration) && status === 'approved';
    }).length;
    return opportunityCount + campaignCount;
  }, [volunteerHistory, campaignVolunteerRegistrations]);

  const totalVolunteerHours = useMemo(() => {
    const opportunityHours = volunteerHistory
      .filter((application) => application?.status === 'completed')
      .reduce((sum, application) => sum + Number(application?.activityHours || 0), 0);

    const campaignHours = campaignVolunteerRegistrations
      .filter((row) => {
        const status = String(row?.registration?.certificateApprovalStatus || '').trim().toLowerCase();
        return Boolean(row?.registration) && status === 'approved';
      })
      .reduce((sum, row) => sum + Number(row?.registration?.activityHours || 0), 0);

    return opportunityHours + campaignHours;
  }, [volunteerHistory, campaignVolunteerRegistrations]);

  const openDonationDetails = async (donation) => {
    setSelectedVolunteer(null);
    setSelectedDonation(donation);
    setSelectedReceipt(null);
    setHistoryDetailError('');

    if (donation?.status !== 'completed') {
      setHistoryModalLoading(false);
      return;
    }

    setHistoryModalLoading(true);
    try {
      const receiptRes = await getDonationReceipt(donation.id);
      setSelectedReceipt(receiptRes.data || null);
    } catch (err) {
      setHistoryDetailError('Unable to load receipt details for this donation.');
    }
    setHistoryModalLoading(false);
  };

  const openVolunteerDetails = (application) => {
    setSelectedDonation(null);
    setSelectedVolunteer(application);
    setSelectedReceipt(null);
    setHistoryModalLoading(false);
    setHistoryDetailError('');
  };

  const handleViewCertificate = async (entity) => {
    const certificateId = getCertificateId(entity);
    if (!certificateId) {
      const approvalStatus = String(entity?.certificateApprovalStatus || '').trim().toLowerCase();
      if (approvalStatus === 'pending') {
        setHistoryDetailError('Certificate is pending NGO approval. Please check back after the NGO approves it.');
        return;
      }
      if (approvalStatus === 'rejected') {
        const note = entity?.certificateApprovalNote ? ` Note: ${entity.certificateApprovalNote}` : '';
        setHistoryDetailError(`Certificate request was rejected by the NGO.${note}`);
        return;
      }
      setHistoryDetailError('Certificate is not available yet.');
      return;
    }

    try {
      const certificateRes = await getCertificateById(certificateId);
      const opened = openHtmlDocument(certificateRes?.data?.html || '<p>Unable to load certificate.</p>');
      if (!opened) setHistoryDetailError('Please allow popups to view the certificate.');
    } catch (err) {
      setHistoryDetailError('Failed to open certificate.');
    }
  };

  const handlePrintReceipt = () => {
    if (!selectedReceipt) {
      setHistoryDetailError('Receipt is not available for this donation.');
      return;
    }

    const opened = openHtmlDocument(buildReceiptHtml(selectedReceipt));
    if (!opened) setHistoryDetailError('Please allow popups to view the receipt.');
  };

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800">Welcome, {user?.name || 'User'}!</h1>
          <p className="text-gray-600 mt-1">Track your impact, manage requests, and continue supporting verified NGOs.</p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6 border border-gray-200 hover:shadow-md transition cursor-pointer" onClick={() => navigate('/ngos')}>
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Verified NGOs</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">{ngoCount}</p>
            <p className="text-sm text-gray-600 mt-2">Browse trusted organizations by cause and location.</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border border-gray-200 hover:shadow-md transition cursor-pointer" onClick={() => navigate('/campaigns')}>
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Active Campaigns</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">{campaignCount}</p>
            <p className="text-sm text-gray-600 mt-2">See live campaigns and latest impact updates.</p>
          </div>
        </section>

        <section className="bg-white rounded-lg shadow p-6 mb-8 border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Contribution Actions</h2>
          <p className="text-sm text-gray-600 mb-5">Use dedicated workflows for secure donations and volunteering.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link to="/donate" className="rounded-lg border border-gray-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/40 transition">
              <p className="font-semibold text-gray-900">Donate to Campaigns</p>
              <p className="text-sm text-gray-600 mt-1">Open full payment flow with receipts and approval tracking.</p>
            </Link>
            <Link to="/volunteer-opportunities" className="rounded-lg border border-gray-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/40 transition">
              <p className="font-semibold text-gray-900">Volunteer Opportunities</p>
              <p className="text-sm text-gray-600 mt-1">Apply with your details and track assignment status.</p>
            </Link>
            <Link to="/campaigns" className="rounded-lg border border-gray-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/40 transition">
              <p className="font-semibold text-gray-900">Browse Campaigns</p>
              <p className="text-sm text-gray-600 mt-1">Review campaign updates, impact, and organizer details.</p>
            </Link>
          </div>
        </section>

        <section className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Your Donation & Volunteer History</h2>
              <p className="text-sm text-gray-600 mt-1">Track your contributions, volunteer activities, and related details.</p>
            </div>
            <button
              type="button"
              onClick={loadContributionHistory}
              className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Refresh History
            </button>
          </div>

          {historyMessage && (
            <div className="mb-4 p-3 rounded bg-yellow-50 border border-yellow-200 text-yellow-800">
              {historyMessage}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Donated</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">₹{totalDonated.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-gray-50 rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Donations</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{donationsHistory.length}</p>
            </div>
            <div className="bg-gray-50 rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Volunteer Activities</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{completedVolunteerActivities}</p>
            </div>
            <div className="bg-gray-50 rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Volunteer Hours</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totalVolunteerHours.toLocaleString('en-IN')}</p>
            </div>
          </div>

          <div className="bg-gray-50 border rounded-lg p-4 mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Contribution Trend</h3>
            {historyTrendData.length === 0 ? (
              <p className="text-sm text-gray-500">No trend data available yet.</p>
            ) : (
              <div className="w-full h-64">
                <ResponsiveContainer>
                  <LineChart data={historyTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="donatedAmount" stroke="#2563eb" strokeWidth={2} name="Donated Amount (₹)" />
                    <Line yAxisId="right" type="monotone" dataKey="volunteerActivities" stroke="#059669" strokeWidth={2} name="Volunteer Activities" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Donation History</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <input
                  type="text"
                  value={donationSearch}
                  onChange={(e) => setDonationSearch(e.target.value)}
                  placeholder="Search campaign, NGO, receipt"
                  className="md:col-span-2 p-2 border border-gray-300 rounded-md"
                />
                <select
                  value={donationStatusFilter}
                  onChange={(e) => setDonationStatusFilter(e.target.value)}
                  className="p-2 border border-gray-300 rounded-md"
                  title="Filter donations by status"
                >
                  <option value="all">All statuses</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              <div className="mb-3">
                <select
                  value={donationSort}
                  onChange={(e) => setDonationSort(e.target.value)}
                  className="p-2 border border-gray-300 rounded-md w-full md:w-auto"
                  title="Sort donations"
                >
                  <option value="latest">Sort: Latest first</option>
                  <option value="oldest">Sort: Oldest first</option>
                  <option value="amount_high">Sort: Highest amount</option>
                  <option value="amount_low">Sort: Lowest amount</option>
                </select>
              </div>

              <div className="border rounded-lg overflow-hidden">
                {donationsLoading ? (
                  <p className="p-4 text-gray-600">Loading donation history...</p>
                ) : filteredDonations.length === 0 ? (
                  <p className="p-4 text-gray-500">No donations found for this filter.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="text-left px-3 py-2">Date</th>
                          <th className="text-left px-3 py-2">Campaign / NGO</th>
                          <th className="text-left px-3 py-2">Amount</th>
                          <th className="text-left px-3 py-2">Status</th>
                          <th className="text-left px-3 py-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDonations.map((donation) => (
                          <tr key={donation.id} className="border-t">
                            <td className="px-3 py-2">{new Date(donation.createdAt).toLocaleDateString()}</td>
                            <td className="px-3 py-2">
                              <p className="font-medium text-gray-800">{donation.campaign?.title || 'Campaign'}</p>
                              <p className="text-xs text-gray-500">{donation.ngo?.name || 'NGO'}</p>
                            </td>
                            <td className="px-3 py-2 font-semibold text-gray-900">₹{Number(donation.amount || 0).toLocaleString('en-IN')}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                donation.status === 'completed'
                                  ? 'bg-green-100 text-green-700'
                                  : donation.status === 'pending'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-red-100 text-red-700'
                              }`}>
                                {donation.status}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => openDonationDetails(donation)}
                                className="text-indigo-600 font-semibold hover:underline"
                              >
                                View details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Volunteer History</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <input
                  type="text"
                  value={volunteerSearch}
                  onChange={(e) => setVolunteerSearch(e.target.value)}
                  placeholder="Search activity, NGO, task"
                  className="md:col-span-2 p-2 border border-gray-300 rounded-md"
                />
                <select
                  value={volunteerStatusFilter}
                  onChange={(e) => setVolunteerStatusFilter(e.target.value)}
                  className="p-2 border border-gray-300 rounded-md"
                  title="Filter volunteer entries by status"
                >
                  <option value="all">All statuses</option>
                  <option value="assigned">Assigned</option>
                  <option value="completed">Completed</option>
                  <option value="applied">Applied</option>
                </select>
              </div>

              <div className="mb-3">
                <select
                  value={volunteerSort}
                  onChange={(e) => setVolunteerSort(e.target.value)}
                  className="p-2 border border-gray-300 rounded-md w-full md:w-auto"
                  title="Sort volunteer entries"
                >
                  <option value="latest">Sort: Latest first</option>
                  <option value="oldest">Sort: Oldest first</option>
                  <option value="status">Sort: Status</option>
                </select>
              </div>

              <div className="border rounded-lg overflow-hidden">
                {volunteerHistoryLoading ? (
                  <p className="p-4 text-gray-600">Loading volunteer history...</p>
                ) : filteredVolunteerHistory.length === 0 ? (
                  <p className="p-4 text-gray-500">No volunteer entries found for this filter.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="text-left px-3 py-2">Date</th>
                          <th className="text-left px-3 py-2">Activity / NGO</th>
                          <th className="text-left px-3 py-2">Status</th>
                          <th className="text-left px-3 py-2">Certificate</th>
                          <th className="text-left px-3 py-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredVolunteerHistory.map((application) => {
                          const hasCertificate = !!getCertificateId(application);
                          return (
                            <tr key={application.id} className="border-t">
                              <td className="px-3 py-2">{new Date(application.createdAt).toLocaleDateString()}</td>
                              <td className="px-3 py-2">
                                <p className="font-medium text-gray-800">{application.opportunity?.title || 'Volunteer Activity'}</p>
                                <p className="text-xs text-gray-500">{application.opportunity?.ngo?.name || 'NGO'}</p>
                              </td>
                              <td className="px-3 py-2">
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                  application.status === 'completed'
                                    ? 'bg-green-100 text-green-700'
                                    : application.status === 'assigned'
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {application.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {hasCertificate ? (
                                  <span className="text-green-700 font-semibold">Issued</span>
                                ) : (
                                  <span className="text-gray-500">Pending</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => openVolunteerDetails(application)}
                                  className="text-indigo-600 font-semibold hover:underline"
                                >
                                  View details
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="mt-8">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">Campaign Volunteer Registrations</h3>
                <div className="border rounded-lg overflow-hidden">
                  {campaignVolunteerRegistrationsLoading ? (
                    <p className="p-4 text-gray-600">Loading campaign volunteer registrations...</p>
                  ) : campaignVolunteerRegistrations.length === 0 ? (
                    <p className="p-4 text-gray-500">No campaign volunteer registrations found yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                          <tr>
                            <th className="text-left px-3 py-2">Date</th>
                            <th className="text-left px-3 py-2">Campaign / NGO</th>
                            <th className="text-left px-3 py-2">Status</th>
                            <th className="text-left px-3 py-2">Certificate</th>
                            <th className="text-left px-3 py-2">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {campaignVolunteerRegistrations.map((row, index) => {
                            const registration = row?.registration || null;
                            const createdAtValue = registration?.updatedAt || registration?.createdAt;
                            const createdAt = createdAtValue ? new Date(createdAtValue) : null;
                            const status = registration
                              ? String(registration.certificateApprovalStatus || '').trim().toLowerCase() || 'pending'
                              : (row?.joined ? 'missing_details' : 'not_registered');
                            const hasCertificate = Boolean(getCertificateId(registration));

                            return (
                              <tr key={`${row?.campaign?.id || index}-${index}`} className="border-t">
                                <td className="px-3 py-2">{createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleDateString() : 'N/A'}</td>
                                <td className="px-3 py-2">
                                  <p className="font-medium text-gray-800">{row?.campaign?.title || 'Campaign'}</p>
                                  <p className="text-xs text-gray-500">{row?.campaign?.ngo?.name || 'NGO'}</p>
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                    status === 'approved'
                                      ? 'bg-green-100 text-green-700'
                                      : status === 'rejected'
                                        ? 'bg-red-100 text-red-700'
                                        : status === 'missing_details'
                                          ? 'bg-gray-100 text-gray-700'
                                          : 'bg-amber-100 text-amber-800'
                                  }`}>
                                    {status === 'missing_details' ? 'Missing details' : status}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {hasCertificate ? (
                                    <span className="text-green-700 font-semibold">Issued</span>
                                  ) : status === 'pending' ? (
                                    <span className="text-gray-600">Pending</span>
                                  ) : (
                                    <span className="text-gray-500">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-wrap gap-3">
                                    {hasCertificate && (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          setHistoryMessage('');
                                          try {
                                            const certificateId = getCertificateId(registration);
                                            const certificateRes = await getCertificateById(certificateId);
                                            const opened = openHtmlDocument(certificateRes?.data?.html || '<p>Unable to load certificate.</p>');
                                            if (!opened) setHistoryMessage('Please allow popups to view the certificate.');
                                          } catch (err) {
                                            setHistoryMessage('Failed to open certificate.');
                                          }
                                        }}
                                        className="text-indigo-600 font-semibold hover:underline"
                                      >
                                        View Certificate
                                      </button>
                                    )}
                                    <Link
                                      to={`/campaigns/${row?.campaign?.id}`}
                                      className="text-indigo-600 font-semibold hover:underline"
                                    >
                                      {registration ? 'View / Update' : 'Submit Details'}
                                    </Link>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2 bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link to="/profile" className="block p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition">
                <h3 className="font-semibold text-gray-800">Complete Profile</h3>
                <p className="text-sm text-gray-600 mt-1">Add interests to improve recommendations.</p>
              </Link>
              <Link to="/ngos" className="block p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition">
                <h3 className="font-semibold text-gray-800">Browse NGOs</h3>
                <p className="text-sm text-gray-600 mt-1">Find verified NGOs by category and location.</p>
              </Link>
              <Link to="/campaigns" className="block p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition">
                <h3 className="font-semibold text-gray-800">Browse Campaigns</h3>
                <p className="text-sm text-gray-600 mt-1">View active campaigns and payment goals.</p>
              </Link>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Discover</h2>
            <button
              onClick={handleGetRecommendations}
              className="w-full px-5 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700"
            >
              {hasPreferences ? 'See Recommendations' : 'Set Preferences'}
            </button>
          </div>
        </section>

        <section className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Notifications</h2>
          {notificationsLoading ? (
            <p className="text-gray-600">Loading notifications...</p>
          ) : notifications.length === 0 ? (
            <p className="text-gray-500">No notifications yet.</p>
          ) : (
            <div className="space-y-3">
              {notifications.slice(0, 5).map((note) => (
                <div key={note.id} className="border rounded-md p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-800">{note.title}</p>
                    <span className="text-xs text-gray-500">{new Date(note.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{note.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Request Support</h2>
              <p className="text-gray-600">Submit a help request to a selected NGO and track the status here.</p>
            </div>
            <button
              type="button"
              onClick={refreshHelpRequests}
              disabled={helpRefreshing}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 disabled:opacity-60"
            >
              {helpRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {helpMessage && (
            <div className="mt-4 p-3 rounded bg-blue-50 border border-blue-200 text-blue-800">
              {helpMessage}
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <form onSubmit={submitHelpRequest} className="rounded-lg border border-gray-200 p-5 bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900">Submit a Request</h3>
              <p className="text-sm text-gray-600 mt-1">
                Your mobile number from profile is shared with the NGO so they can contact you.
              </p>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Select NGO *</label>
                  <select
                    value={helpForm.ngoId}
                    onChange={(e) => setHelpForm((prev) => ({ ...prev, ngoId: e.target.value }))}
                    className="mt-1 w-full p-3 border border-gray-300 rounded-lg bg-white"
                    required
                  >
                    <option value="" disabled>Select an NGO</option>
                    {availableNgos.map((ngo) => (
                      <option key={ngo.id} value={ngo.id}>{ngo.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Age</label>
                  <input
                    type="number"
                    value={helpForm.age}
                    onChange={(e) => setHelpForm((prev) => ({ ...prev, age: e.target.value }))}
                    className="mt-1 w-full p-3 border border-gray-300 rounded-lg bg-white"
                    min={0}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Location</label>
                  <input
                    type="text"
                    value={helpForm.location}
                    onChange={(e) => setHelpForm((prev) => ({ ...prev, location: e.target.value }))}
                    className="mt-1 w-full p-3 border border-gray-300 rounded-lg bg-white"
                    placeholder="City, State"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Type of Help Required *</label>
                  <input
                    type="text"
                    value={helpForm.helpType}
                    onChange={(e) => setHelpForm((prev) => ({ ...prev, helpType: e.target.value }))}
                    className="mt-1 w-full p-3 border border-gray-300 rounded-lg bg-white"
                    placeholder="Medical, shelter, food, legal, etc."
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Description (optional)</label>
                  <textarea
                    value={helpForm.description}
                    onChange={(e) => setHelpForm((prev) => ({ ...prev, description: e.target.value }))}
                    className="mt-1 w-full p-3 border border-gray-300 rounded-lg bg-white"
                    rows={3}
                    placeholder="Add any context that helps the NGO respond faster."
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={helpLoading}
                className="mt-4 w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400"
              >
                {helpLoading ? 'Submitting…' : 'Submit Request'}
              </button>
            </form>

            <div className="rounded-lg border border-gray-200 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Your Requests</h3>
                  <p className="text-sm text-gray-600 mt-1">{helpRequests.length} total</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    value={helpQuery}
                    onChange={(e) => setHelpQuery(e.target.value)}
                    placeholder="Search requests…"
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm w-full sm:w-56"
                  />
                  <select
                    value={helpStatusFilter}
                    onChange={(e) => setHelpStatusFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm w-full sm:w-44"
                  >
                    <option value="all">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="in progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {filteredHelpRequests.length === 0 ? (
                  <p className="text-gray-500">No requests found for this filter.</p>
                ) : (
                  filteredHelpRequests.map((request) => {
                    const rawStatus = String(request.status || 'Pending');
                    const status = rawStatus.trim().toLowerCase();
                    const badgeClass = status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : status === 'rejected'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : status === 'in progress'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : status === 'approved'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200';

                    return (
                      <div key={request.id} className="border rounded-lg p-4 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">{request.ngo?.name || 'NGO'}</p>
                            <p className="text-sm text-gray-600 mt-0.5">{request.helpType || 'Support'}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${badgeClass}`}>
                            {rawStatus}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {request.location ? request.location : 'Location not specified'}
                        </p>
                        {request.ngo?.helplineNumber && (
                          <p className="text-xs text-gray-500">Helpline: {request.ngo.helplineNumber}</p>
                        )}
                        <p className="text-xs text-gray-400">Submitted: {new Date(request.createdAt).toLocaleString()}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8">
          <RecommendedNgos />
        </div>
      </div>

      {(selectedDonation || selectedVolunteer) && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800">
                {selectedDonation ? 'Donation Details' : 'Volunteer Activity Details'}
              </h3>
              <button type="button" onClick={closeHistoryModal} className="text-gray-500 hover:text-gray-700">Close</button>
            </div>

            <div className="p-6 space-y-4 text-sm text-gray-700">
              {historyDetailError && (
                <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700">
                  {historyDetailError}
                </div>
              )}

              {selectedDonation && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <p><strong>Date:</strong> {new Date(selectedDonation.createdAt).toLocaleString()}</p>
                    <p><strong>Amount:</strong> ₹{Number(selectedDonation.amount || 0).toLocaleString('en-IN')}</p>
                    <p><strong>Campaign:</strong> {selectedDonation.campaign?.title || 'Campaign'}</p>
                    <p><strong>NGO:</strong> {selectedDonation.ngo?.name || 'NGO'}</p>
                    <p><strong>Payment Method:</strong> {selectedDonation.paymentMethod || 'N/A'}</p>
                    <p><strong>Status:</strong> {selectedDonation.status}</p>
                    <p><strong>Receipt:</strong> {selectedDonation.receiptNumber || 'Pending'}</p>
                    <p><strong>Certificate Approval:</strong> {selectedDonation.certificateApprovalStatus || (selectedDonation.status === 'completed' ? 'pending' : 'not_requested')}</p>
                  </div>

                  {historyModalLoading ? (
                    <p className="text-gray-600">Loading receipt details...</p>
                  ) : selectedReceipt ? (
                    <div className="border rounded-lg p-4 bg-gray-50">
                      <p className="font-semibold text-gray-800 mb-2">Receipt Summary</p>
                      <ul className="list-disc ml-5 space-y-1">
                        {(selectedReceipt.printable?.lines || []).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handlePrintReceipt}
                      className="px-4 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
                    >
                      View / Print Receipt
                    </button>
                    <button
                      type="button"
                      onClick={() => handleViewCertificate(selectedDonation)}
                      className="px-4 py-2 rounded-md border border-indigo-600 text-indigo-600 font-semibold hover:bg-indigo-50"
                    >
                      View Certificate
                    </button>
                  </div>
                </>
              )}

              {selectedVolunteer && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <p><strong>Applied On:</strong> {new Date(selectedVolunteer.createdAt).toLocaleString()}</p>
                    <p><strong>Status:</strong> {selectedVolunteer.status}</p>
                    <p><strong>Activity:</strong> {selectedVolunteer.opportunity?.title || 'Volunteer Activity'}</p>
                    <p><strong>NGO:</strong> {selectedVolunteer.opportunity?.ngo?.name || 'NGO'}</p>
                    <p><strong>Assigned Task:</strong> {selectedVolunteer.assignedTask || 'Pending assignment'}</p>
                    <p><strong>Availability:</strong> {selectedVolunteer.availability || 'N/A'}</p>
                    <p><strong>Activity Hours:</strong> {Number(selectedVolunteer.activityHours || 0)}</p>
                    <p><strong>Certificate Approval:</strong> {selectedVolunteer.certificateApprovalStatus || 'not_requested'}</p>
                    <p><strong>Completed On:</strong> {selectedVolunteer.completedAt ? new Date(selectedVolunteer.completedAt).toLocaleString() : 'Not completed yet'}</p>
                  </div>

                  {Array.isArray(selectedVolunteer.preferredActivities) && selectedVolunteer.preferredActivities.length > 0 && (
                    <p><strong>Preferred Activities:</strong> {selectedVolunteer.preferredActivities.join(', ')}</p>
                  )}

                  {selectedVolunteer.motivation && (
                    <p><strong>Motivation:</strong> {selectedVolunteer.motivation}</p>
                  )}

                  {selectedVolunteer.certificateApprovalNote && (
                    <p><strong>NGO Note:</strong> {selectedVolunteer.certificateApprovalNote}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleViewCertificate(selectedVolunteer)}
                      className="px-4 py-2 rounded-md border border-indigo-600 text-indigo-600 font-semibold hover:bg-indigo-50"
                    >
                      View Certificate
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <PreferencesModal
        isOpen={showPreferencesModal}
        onClose={() => setShowPreferencesModal(false)}
        onComplete={handlePreferencesComplete}
      />
    </div>
  );
}
