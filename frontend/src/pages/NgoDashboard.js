import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, {
  getNgoCampaignVolunteers,
  getMessageConversations,
  getNgoDonationApprovalQueue,
  getNgoDonationTransactions,
  getNgoHelpRequests,
  reviewCampaignVolunteerRegistration,
  getNgoVolunteerApprovalQueue,
  getNgoVolunteerRequests,
  reviewDonationCertificateRequest,
  reviewVolunteerCertificateRequest,
  updateHelpRequestStatus
} from '../services/api';

const currency = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const when = (value) => {
  if (!value) return 'N/A';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'N/A';
  return dt.toLocaleString();
};

export default function NgoDashboard() {
  const [loading, setLoading] = useState(true);
  const [ngo, setNgo] = useState(null);

  const [donationSummary, setDonationSummary] = useState({
    completedCount: 0,
    totalCompletedAmount: 0,
    pendingCertificateCount: 0
  });
  const [donationTransactions, setDonationTransactions] = useState([]);

  const [volunteerSummary, setVolunteerSummary] = useState({
    totalRequests: 0,
    appliedCount: 0,
    assignedCount: 0,
    completedCount: 0,
    withdrawnCount: 0,
    pendingCertificateCount: 0
  });
  const [volunteerRequests, setVolunteerRequests] = useState([]);

  const [campaignVolunteerSummary, setCampaignVolunteerSummary] = useState({
    campaignsCount: 0,
    totalVolunteers: 0,
    totalRegistrations: 0,
    pendingCertificateCount: 0
  });
  const [campaignVolunteers, setCampaignVolunteers] = useState([]);

  const [donationApprovals, setDonationApprovals] = useState([]);
  const [volunteerApprovals, setVolunteerApprovals] = useState([]);
  const [approvalLoading, setApprovalLoading] = useState(true);
  const [approvalNotes, setApprovalNotes] = useState({});
  const [approvalHours, setApprovalHours] = useState({});
  const [approvalMessage, setApprovalMessage] = useState('');

  const [messageUnreadCount, setMessageUnreadCount] = useState(0);

  const [helpRequests, setHelpRequests] = useState([]);
  const [helpRequestsLoading, setHelpRequestsLoading] = useState(true);
  const [helpRequestsMessage, setHelpRequestsMessage] = useState('');
  const [helpRequestQuery, setHelpRequestQuery] = useState('');
  const [helpRequestStatusFilter, setHelpRequestStatusFilter] = useState('all');
  const [helpRequestActionState, setHelpRequestActionState] = useState({});
  const [selectedHelpRequest, setSelectedHelpRequest] = useState(null);

  const volunteerSignupTotal = useMemo(
    () => Number(volunteerSummary.totalRequests || 0) + Number(campaignVolunteerSummary.totalVolunteers || 0),
    [volunteerSummary, campaignVolunteerSummary]
  );

  const pendingCertificateTotal = useMemo(
    () =>
      Number(donationSummary.pendingCertificateCount || 0) +
      Number(volunteerSummary.pendingCertificateCount || 0) +
      Number(campaignVolunteerSummary.pendingCertificateCount || 0),
    [donationSummary, volunteerSummary, campaignVolunteerSummary]
  );

  const supportRequestSummary = useMemo(() => {
    const summary = {
      total: 0,
      pending: 0,
      approved: 0,
      inProgress: 0,
      completed: 0,
      rejected: 0
    };

    const normalize = (value) => String(value || '').trim().toLowerCase();

    for (const req of helpRequests || []) {
      summary.total += 1;
      const status = normalize(req?.status || 'Pending');
      if (status === 'pending') summary.pending += 1;
      else if (status === 'approved') summary.approved += 1;
      else if (status === 'in progress') summary.inProgress += 1;
      else if (status === 'completed') summary.completed += 1;
      else if (status === 'rejected') summary.rejected += 1;
    }

    return summary;
  }, [helpRequests]);

  const filteredHelpRequests = useMemo(() => {
    const q = helpRequestQuery.trim().toLowerCase();
    const filter = String(helpRequestStatusFilter || 'all').trim().toLowerCase();

    const rows = (helpRequests || []).filter((req) => {
      const status = String(req?.status || 'Pending').trim().toLowerCase();
      if (filter !== 'all' && status !== filter) return false;

      if (!q) return true;
      const hay = [
        req?.name,
        req?.helpType,
        req?.location,
        req?.mobileNumber,
        req?.user?.name,
        req?.user?.email,
        req?.description
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    return [...rows].sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0));
  }, [helpRequests, helpRequestQuery, helpRequestStatusFilter]);

  const isVerified = ngo?.verified;

  const loadApprovals = async () => {
    setApprovalLoading(true);
    try {
      const [donationRes, volunteerRes] = await Promise.all([
        getNgoDonationApprovalQueue(),
        getNgoVolunteerApprovalQueue()
      ]);
      setDonationApprovals(donationRes.data || []);
      setVolunteerApprovals(volunteerRes.data || []);
    } catch (err) {
      setDonationApprovals([]);
      setVolunteerApprovals([]);
    } finally {
      setApprovalLoading(false);
    }
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [ngoRes, donationRes, volunteerRes, campaignVolunteersRes, conversationsRes] = await Promise.all([
        api.get('/ngos/me'),
        getNgoDonationTransactions({ limit: 25 }),
        getNgoVolunteerRequests({ limit: 25 }),
        getNgoCampaignVolunteers({ limit: 50 }),
        getMessageConversations()
      ]);

      setNgo(ngoRes.data || null);
      setDonationSummary(donationRes.data?.summary || {
        completedCount: 0,
        totalCompletedAmount: 0,
        pendingCertificateCount: 0
      });
      setDonationTransactions(donationRes.data?.transactions || []);

      setVolunteerSummary(volunteerRes.data?.summary || {
        totalRequests: 0,
        appliedCount: 0,
        assignedCount: 0,
        completedCount: 0,
        withdrawnCount: 0,
        pendingCertificateCount: 0
      });
      setVolunteerRequests(volunteerRes.data?.requests || []);

      setCampaignVolunteerSummary(campaignVolunteersRes.data?.summary || {
        campaignsCount: 0,
        totalVolunteers: 0,
        totalRegistrations: 0,
        pendingCertificateCount: 0
      });
      setCampaignVolunteers(campaignVolunteersRes.data?.volunteers || []);

      const conversations = conversationsRes.data || [];
      const unread = conversations.reduce((sum, item) => sum + Number(item?.unreadCount || 0), 0);
      setMessageUnreadCount(unread);
    } catch (err) {
      setNgo(null);
      setDonationSummary({ completedCount: 0, totalCompletedAmount: 0, pendingCertificateCount: 0 });
      setDonationTransactions([]);
      setVolunteerSummary({ totalRequests: 0, appliedCount: 0, assignedCount: 0, completedCount: 0, withdrawnCount: 0, pendingCertificateCount: 0 });
      setVolunteerRequests([]);
      setCampaignVolunteerSummary({ campaignsCount: 0, totalVolunteers: 0, totalRegistrations: 0, pendingCertificateCount: 0 });
      setCampaignVolunteers([]);
      setMessageUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  const loadHelpRequests = async ({ silent = false } = {}) => {
    if (!silent) setHelpRequestsLoading(true);
    setHelpRequestsMessage('');
    try {
      const res = await getNgoHelpRequests();
      setHelpRequests(res.data || []);
    } catch (err) {
      setHelpRequests([]);
      setHelpRequestsMessage(err.response?.data?.message || 'Unable to load support requests right now.');
    } finally {
      setHelpRequestsLoading(false);
    }
  };

  const setHelpRequestBusy = (id, busy) => {
    if (!id) return;
    setHelpRequestActionState((prev) => ({ ...prev, [id]: busy }));
  };

  const handleHelpRequestStatusUpdate = async (requestId, status) => {
    if (!requestId) return;
    setHelpRequestsMessage('');
    setHelpRequestBusy(requestId, true);
    try {
      await updateHelpRequestStatus(requestId, status);
      setHelpRequests((prev) =>
        (prev || []).map((item) => (item.id === requestId ? { ...item, status } : item))
      );
    } catch (err) {
      setHelpRequestsMessage(err.response?.data?.message || 'Failed to update support request status.');
    } finally {
      setHelpRequestBusy(requestId, false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    loadApprovals();
    loadHelpRequests();
  }, []);

  const handleApprovalNoteChange = (key, value) => {
    setApprovalNotes((prev) => ({ ...prev, [key]: value }));
  };

  const handleApprovalHoursChange = (key, value) => {
    setApprovalHours((prev) => ({ ...prev, [key]: value }));
  };

  const handleDonationDecision = async (donationId, decision) => {
    try {
      const noteKey = `donation-${donationId}`;
      await reviewDonationCertificateRequest(donationId, {
        decision,
        note: approvalNotes[noteKey] || ''
      });
      setApprovalMessage(`Donation certificate ${decision === 'approve' ? 'approved' : 'rejected'} successfully.`);
      await Promise.all([loadApprovals(), loadDashboardData()]);
    } catch (err) {
      setApprovalMessage(err.response?.data?.message || 'Failed to update donation certificate status.');
    }
  };

  const handleVolunteerDecision = async (applicationId, decision) => {
    try {
      const noteKey = `volunteer-${applicationId}`;
      await reviewVolunteerCertificateRequest(applicationId, {
        decision,
        note: approvalNotes[noteKey] || ''
      });
      setApprovalMessage(`Volunteer certificate ${decision === 'approve' ? 'approved' : 'rejected'} successfully.`);
      await Promise.all([loadApprovals(), loadDashboardData()]);
    } catch (err) {
      setApprovalMessage(err.response?.data?.message || 'Failed to update volunteer certificate status.');
    }
  };

  const handleCampaignVolunteerDecision = async (campaignId, userId, decision) => {
    try {
      const noteKey = `campaign-volunteer-${campaignId}-${userId}`;
      const rawHours = approvalHours[noteKey];
      const includeHours = rawHours !== undefined && rawHours !== null && String(rawHours).trim() !== '';
      const hoursValue = includeHours ? Number(rawHours) : undefined;
      if (includeHours && (!Number.isFinite(hoursValue) || hoursValue < 0)) {
        setApprovalMessage('Please enter a valid non-negative number of hours.');
        return;
      }

      const res = await reviewCampaignVolunteerRegistration(campaignId, {
        userId,
        decision,
        note: approvalNotes[noteKey] || '',
        ...(includeHours ? { activityHours: hoursValue } : {})
      });
      setApprovalMessage(res.data?.message || `Campaign volunteer ${decision === 'approve' ? 'approved' : 'rejected'} successfully.`);
      await loadDashboardData();
    } catch (err) {
      setApprovalMessage(err.response?.data?.message || 'Failed to update campaign volunteer status.');
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-600">Loading NGO dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">NGO Dashboard</h1>
              <p className="text-gray-600 mt-1">{ngo?.name || 'Your NGO workspace'}</p>
            </div>
            <div className={`px-3 py-2 rounded-lg text-sm font-semibold ${isVerified ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {isVerified ? 'Verified NGO' : 'Verification Pending'}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Total Donation Amount</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{currency(donationSummary.totalCompletedAmount)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Completed Donations</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{Number(donationSummary.completedCount || 0)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Volunteer Signups</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{Number(volunteerSignupTotal || 0)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Pending Certificates</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{pendingCertificateTotal}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Unread Messages</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{messageUnreadCount}</p>
              <Link to="/messages" className="inline-block mt-2 text-sm text-indigo-600 hover:underline">Open Inbox</Link>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Support Requests</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{supportRequestSummary.pending}</p>
              <p className="text-xs text-gray-500 mt-1">{supportRequestSummary.total} total</p>
            </div>
          </div>
        </header>

        <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Certificate Approval Queue</h2>
              <p className="text-sm text-gray-600 mt-1">
                Review completed donations and volunteer activities before certificate issuance.
              </p>
            </div>
            <button
              type="button"
              onClick={loadApprovals}
              className="px-3 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Refresh Queue
            </button>
          </div>

          <div className="mt-4 p-4 rounded-lg border border-blue-100 bg-blue-50 text-blue-900 text-sm">
            <p className="font-semibold">Approval Guidelines</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Approve only after verifying donor/volunteer details and campaign activity.</li>
              <li>Use reject with a clear note so users understand what needs correction.</li>
              <li>Approved requests issue certificates immediately and status is saved permanently.</li>
            </ul>
          </div>

          {approvalMessage && (
            <div className="mt-4 p-3 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm">
              {approvalMessage}
            </div>
          )}

          {approvalLoading ? (
            <p className="mt-4 text-gray-600">Loading approvals...</p>
          ) : (
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Donation Certificates</h3>
                {donationApprovals.length === 0 ? (
                  <p className="text-sm text-gray-500">No pending donation approvals.</p>
                ) : (
                  <div className="space-y-4">
                    {donationApprovals.map((item) => {
                      const noteKey = `donation-${item.id}`;
                      return (
                        <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                          <p className="font-semibold text-gray-900">{item.user?.name || item.donorName || 'Donor'}</p>
                          <p className="text-sm text-gray-600">{item.user?.email || item.donorEmail || 'No email'}</p>
                          <p className="text-sm text-gray-600 mt-1">Campaign: {item.campaign?.title || 'Campaign'}</p>
                          <p className="text-sm font-semibold text-gray-900 mt-1">Amount: {currency(item.amount)}</p>
                          <p className="text-xs text-gray-500 mt-1">Requested: {when(item.certificateApprovalRequestedAt || item.createdAt)}</p>

                          <textarea
                            rows={2}
                            value={approvalNotes[noteKey] || ''}
                            onChange={(e) => handleApprovalNoteChange(noteKey, e.target.value)}
                            placeholder="Optional note for the donor"
                            className="mt-3 w-full border border-gray-300 rounded-md p-2 text-sm"
                          />

                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleDonationDecision(item.id, 'approve')}
                              className="px-3 py-2 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDonationDecision(item.id, 'reject')}
                              className="px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Volunteer Certificates</h3>
                {volunteerApprovals.length === 0 ? (
                  <p className="text-sm text-gray-500">No pending volunteer approvals.</p>
                ) : (
                  <div className="space-y-4">
                    {volunteerApprovals.map((item) => {
                      const noteKey = `volunteer-${item.id}`;
                      return (
                        <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                          <p className="font-semibold text-gray-900">{item.user?.name || item.fullName || 'Volunteer'}</p>
                          <p className="text-sm text-gray-600">{item.user?.email || item.email || 'No email'}</p>
                          <p className="text-sm text-gray-600 mt-1">Opportunity: {item.opportunity?.title || 'Opportunity'}</p>
                          <p className="text-sm text-gray-600 mt-1">Status: {item.status || 'assigned'}</p>
                          <p className="text-xs text-gray-500 mt-1">Completed: {when(item.completedAt)}</p>

                          <textarea
                            rows={2}
                            value={approvalNotes[noteKey] || ''}
                            onChange={(e) => handleApprovalNoteChange(noteKey, e.target.value)}
                            placeholder="Optional note for the volunteer"
                            className="mt-3 w-full border border-gray-300 rounded-md p-2 text-sm"
                          />

                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleVolunteerDecision(item.id, 'approve')}
                              className="px-3 py-2 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVolunteerDecision(item.id, 'reject')}
                              className="px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Support Requests Inbox</h2>
              <p className="text-sm text-gray-600 mt-1">
                Requests submitted by beneficiaries. Update the status as your team responds.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Pending: {supportRequestSummary.pending} • Approved: {supportRequestSummary.approved} • In progress: {supportRequestSummary.inProgress} • Completed: {supportRequestSummary.completed}
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadHelpRequests()}
              className="px-3 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Refresh Requests
            </button>
          </div>

          {helpRequestsMessage && (
            <div className="mt-4 p-3 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm">
              {helpRequestsMessage}
            </div>
          )}

          <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-center">
            <input
              value={helpRequestQuery}
              onChange={(e) => setHelpRequestQuery(e.target.value)}
              placeholder="Search by name, help type, location, phone…"
              className="w-full md:w-96 px-3 py-2 rounded-lg border border-gray-200 text-sm"
            />
            <select
              value={helpRequestStatusFilter}
              onChange={(e) => setHelpRequestStatusFilter(e.target.value)}
              className="w-full md:w-60 px-3 py-2 rounded-lg border border-gray-200 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="in progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {helpRequestsLoading ? (
            <p className="mt-4 text-gray-600">Loading support requests...</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="text-left px-3 py-2">Submitted</th>
                    <th className="text-left px-3 py-2">Requester</th>
                    <th className="text-left px-3 py-2">Help</th>
                    <th className="text-left px-3 py-2">Location</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHelpRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                        No support requests found for this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredHelpRequests.slice(0, 30).map((item) => {
                      const rawStatus = String(item.status || 'Pending');
                      const status = rawStatus.trim().toLowerCase();
                      const busy = Boolean(helpRequestActionState[item.id]);
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
                        <tr key={item.id} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-700">{when(item.createdAt)}</td>
                          <td className="px-3 py-2 text-gray-800">
                            <p className="font-medium">{item.user?.name || item.name || 'Requester'}</p>
                            <p className="text-xs text-gray-500">{item.user?.email || '-'}</p>
                            <p className="text-xs text-gray-500">{item.mobileNumber || item.user?.mobileNumber || '-'}</p>
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            <p className="font-medium">{item.helpType || '-'}</p>
                            {item.description && (
                              <p className="text-xs text-gray-500 mt-1">
                                {String(item.description).length > 90 ? `${String(item.description).slice(0, 90)}…` : item.description}
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedHelpRequest(item)}
                              className="mt-2 text-xs font-semibold text-indigo-600 hover:underline"
                            >
                              View details
                            </button>
                          </td>
                          <td className="px-3 py-2 text-gray-700">{item.location || '-'}</td>
                          <td className="px-3 py-2 text-gray-700">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold border ${badgeClass}`}>
                              {rawStatus}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            <div className="flex flex-wrap items-center gap-2 min-w-[220px]">
                              {status === 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleHelpRequestStatusUpdate(item.id, 'Approved')}
                                    disabled={busy}
                                    className="px-3 py-2 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-60"
                                  >
                                    {busy ? 'Updating…' : 'Approve'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleHelpRequestStatusUpdate(item.id, 'Rejected')}
                                    disabled={busy}
                                    className="px-3 py-2 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-60"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}

                              {status === 'approved' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleHelpRequestStatusUpdate(item.id, 'In Progress')}
                                    disabled={busy}
                                    className="px-3 py-2 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60"
                                  >
                                    {busy ? 'Updating…' : 'Start'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleHelpRequestStatusUpdate(item.id, 'Rejected')}
                                    disabled={busy}
                                    className="px-3 py-2 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-60"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}

                              {status === 'in progress' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleHelpRequestStatusUpdate(item.id, 'Completed')}
                                    disabled={busy}
                                    className="px-3 py-2 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-60"
                                  >
                                    {busy ? 'Updating…' : 'Complete'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleHelpRequestStatusUpdate(item.id, 'Rejected')}
                                    disabled={busy}
                                    className="px-3 py-2 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-60"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}

                              {(status === 'completed' || status === 'rejected') && (
                                <span className="text-xs text-gray-400">No actions</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-bold text-gray-900">Donation Transactions</h2>
            <span className="text-sm text-gray-500">{donationTransactions.length} recent records</span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Donor</th>
                  <th className="text-left px-3 py-2">Campaign</th>
                  <th className="text-left px-3 py-2">Amount</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Certificate</th>
                </tr>
              </thead>
              <tbody>
                {donationTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-500">No donation transactions found.</td>
                  </tr>
                ) : (
                  donationTransactions.map((item) => (
                    <tr key={item.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-700">{when(item.paymentVerifiedAt || item.createdAt)}</td>
                      <td className="px-3 py-2 text-gray-800">
                        <p className="font-medium">{item.user?.name || item.donorName || 'Donor'}</p>
                        <p className="text-xs text-gray-500">{item.user?.email || item.donorEmail || 'No email'}</p>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{item.campaign?.title || 'Campaign'}</td>
                      <td className="px-3 py-2 font-semibold text-gray-900">{currency(item.amount)}</td>
                      <td className="px-3 py-2 text-gray-700">{item.status || 'pending'}</td>
                      <td className="px-3 py-2 text-gray-700">{item.certificateApprovalStatus || 'not_requested'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-bold text-gray-900">Volunteer Requests</h2>
            <div className="text-sm text-gray-600 flex items-center gap-3">
              <span>Applied: {volunteerSummary.appliedCount}</span>
              <span>Assigned: {volunteerSummary.assignedCount}</span>
              <span>Completed: {volunteerSummary.completedCount}</span>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="text-left px-3 py-2">Volunteer</th>
                  <th className="text-left px-3 py-2">Opportunity</th>
                  <th className="text-left px-3 py-2">Submitted</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Certificate</th>
                </tr>
              </thead>
              <tbody>
                {volunteerRequests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-gray-500">No volunteer requests found.</td>
                  </tr>
                ) : (
                  volunteerRequests.map((item) => (
                    <tr key={item.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-800">
                        <p className="font-medium">{item.user?.name || item.fullName || 'Volunteer'}</p>
                        <p className="text-xs text-gray-500">{item.user?.email || item.email || 'No email'}</p>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{item.opportunity?.title || 'Opportunity'}</td>
                      <td className="px-3 py-2 text-gray-700">{when(item.appliedAt || item.createdAt)}</td>
                      <td className="px-3 py-2 text-gray-700">{item.status || 'applied'}</td>
                      <td className="px-3 py-2 text-gray-700">{item.certificateApprovalStatus || 'not_requested'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-bold text-gray-900">Campaign Volunteer Registrations</h2>
            <div className="text-sm text-gray-600 flex items-center gap-3">
              <span>Campaigns: {campaignVolunteerSummary.campaignsCount}</span>
              <span>Volunteers: {campaignVolunteerSummary.totalVolunteers}</span>
            </div>
          </div>

          <p className="mt-2 text-sm text-gray-600">
            These are volunteers who registered directly from campaign pages.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="text-left px-3 py-2">Volunteer</th>
                  <th className="text-left px-3 py-2">Campaign</th>
                  <th className="text-left px-3 py-2">Submitted</th>
                  <th className="text-left px-3 py-2">Preferred Activities</th>
                  <th className="text-left px-3 py-2">Availability</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {campaignVolunteers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-gray-500">No campaign volunteer registrations found.</td>
                  </tr>
                ) : (
                  campaignVolunteers.map((item, index) => {
                    const registration = item.registration || null;
                    const submittedAt = registration?.updatedAt || registration?.createdAt || '';
                    const activities = Array.isArray(registration?.preferredActivities)
                      ? registration.preferredActivities.filter(Boolean).join(', ')
                      : '';
	                    const approvalStatus = registration
	                      ? String(registration.certificateApprovalStatus || '').trim().toLowerCase() || 'pending'
	                      : 'missing_details';
	                    const noteKey = `campaign-volunteer-${item.campaign?.id || ''}-${item.user?.id || item.userId || index}`;
	                    const hasCertificate = Boolean(registration?.certificate);
	                    const hoursValue = approvalHours[noteKey] !== undefined
	                      ? approvalHours[noteKey]
	                      : (registration?.activityHours ?? '');
	                    return (
                      <tr key={`${item.user?.id || item.userId || index}-${item.campaign?.id || index}`} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-800">
                          <p className="font-medium">{item.user?.name || registration?.fullName || 'Volunteer'}</p>
                          <p className="text-xs text-gray-500">{item.user?.email || registration?.email || 'No email'}</p>
                          {(item.user?.mobileNumber || registration?.phone) && (
                            <p className="text-xs text-gray-500">{item.user?.mobileNumber || registration?.phone}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          <p className="font-medium">{item.campaign?.title || 'Campaign'}</p>
                          <p className="text-xs text-gray-500">{item.campaign?.location || item.campaign?.area || ''}</p>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{submittedAt ? when(submittedAt) : 'N/A'}</td>
                        <td className="px-3 py-2 text-gray-700">{activities || (registration ? '-' : 'Joined (no form details)')}</td>
                        <td className="px-3 py-2 text-gray-700">{registration?.availability || '-'}</td>
                        <td className="px-3 py-2 text-gray-700">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold border ${
                            approvalStatus === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : approvalStatus === 'rejected'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : approvalStatus === 'pending'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-gray-50 text-gray-700 border-gray-200'
                          }`}>
                            {approvalStatus === 'missing_details' ? 'Missing details' : approvalStatus}
                          </span>
                          {approvalStatus === 'missing_details' && (
                            <p className="mt-1 text-xs text-gray-500">Volunteer joined but onboarding form not submitted.</p>
                          )}
                          {registration?.certificateApprovalNote && approvalStatus !== 'pending' && (
                            <p className="mt-1 text-xs text-gray-600">Note: {registration.certificateApprovalNote}</p>
                          )}
	                          <p className="mt-1 text-xs text-gray-500">
	                            Certificate:{' '}
	                            {hasCertificate ? (
	                              <span className="text-emerald-700 font-semibold">Issued</span>
	                            ) : approvalStatus === 'pending' ? (
	                              <span className="text-gray-600">Pending</span>
	                            ) : (
	                              <span className="text-gray-400">-</span>
	                            )}
	                          </p>
	                          {registration && approvalStatus === 'approved' && (
	                            <p className="mt-1 text-xs text-gray-500">Hours: {Number(registration.activityHours || 0)}</p>
	                          )}
	                        </td>
	                        <td className="px-3 py-2 text-gray-700">
	                          {(registration && (approvalStatus === 'pending' || approvalStatus === 'approved')) ? (
	                            <div className="min-w-[260px] space-y-2">
	                              <input
	                                type="number"
	                                min="0"
	                                step="0.5"
	                                value={hoursValue}
	                                onChange={(e) => handleApprovalHoursChange(noteKey, e.target.value)}
	                                placeholder="Hours served"
	                                className="w-full border border-gray-300 rounded-md px-2 py-1 text-xs"
	                              />
	                              <textarea
	                                rows={2}
	                                value={approvalNotes[noteKey] || ''}
	                                onChange={(e) => handleApprovalNoteChange(noteKey, e.target.value)}
	                                placeholder="Optional note for the volunteer"
	                                className="w-full border border-gray-300 rounded-md p-2 text-xs"
	                              />
	                              <div className="flex gap-2">
	                                <button
	                                  type="button"
	                                  onClick={() => handleCampaignVolunteerDecision(item.campaign?.id, item.user?.id || item.userId, 'approve')}
	                                  className="px-3 py-2 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
	                                >
	                                  {approvalStatus === 'approved' ? 'Update' : 'Approve'}
	                                </button>
	                                {approvalStatus === 'pending' && (
	                                  <button
	                                    type="button"
	                                    onClick={() => handleCampaignVolunteerDecision(item.campaign?.id, item.user?.id || item.userId, 'reject')}
	                                    className="px-3 py-2 text-xs bg-red-600 text-white rounded-md hover:bg-red-700"
	                                  >
	                                    Reject
	                                  </button>
	                                )}
	                              </div>
	                            </div>
	                          ) : (
	                            <span className="text-xs text-gray-400">-</span>
	                          )}
	                        </td>
	                      </tr>
	                    );
	                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Link to="/campaigns/create" className="px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-800">Create Campaign</Link>
            <Link to="/campaigns" className="px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-800">View Campaigns</Link>
            <Link to="/ngo/profile" className="px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-800">Update Profile</Link>
            <Link to="/messages" className="px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-800">Open Messages</Link>
          </div>
        </section>

        {selectedHelpRequest && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-5 border-b flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Support Request Details</h3>
                <button
                  type="button"
                  onClick={() => setSelectedHelpRequest(null)}
                  className="text-sm font-semibold text-gray-600 hover:text-gray-900"
                >
                  Close
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Submitted</p>
                    <p className="font-semibold text-gray-900">{when(selectedHelpRequest.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <p className="font-semibold text-gray-900">{selectedHelpRequest.status || 'Pending'}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-sm text-gray-500">Requester</p>
                  <p className="font-semibold text-gray-900 mt-1">
                    {selectedHelpRequest.user?.name || selectedHelpRequest.name || 'Requester'}
                  </p>
                  <p className="text-sm text-gray-700 mt-1">{selectedHelpRequest.user?.email || '-'}</p>
                  <p className="text-sm text-gray-700 mt-1">{selectedHelpRequest.mobileNumber || selectedHelpRequest.user?.mobileNumber || '-'}</p>
                  {selectedHelpRequest.age !== null && selectedHelpRequest.age !== undefined && selectedHelpRequest.age !== '' && (
                    <p className="text-sm text-gray-700 mt-1">Age: {selectedHelpRequest.age}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Help Type</p>
                    <p className="font-semibold text-gray-900 mt-1">{selectedHelpRequest.helpType || '-'}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Location</p>
                    <p className="font-semibold text-gray-900 mt-1">{selectedHelpRequest.location || '-'}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-sm text-gray-500">Description</p>
                  <p className="text-gray-800 mt-2 whitespace-pre-wrap">{selectedHelpRequest.description || 'No description provided.'}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
