import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, {
  getMessageConversations,
  getNgoDonationApprovalQueue,
  getNgoDonationTransactions,
  getNgoVolunteerApprovalQueue,
  getNgoVolunteerRequests,
  reviewDonationCertificateRequest,
  reviewVolunteerCertificateRequest
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

  const [donationApprovals, setDonationApprovals] = useState([]);
  const [volunteerApprovals, setVolunteerApprovals] = useState([]);
  const [approvalLoading, setApprovalLoading] = useState(true);
  const [approvalNotes, setApprovalNotes] = useState({});
  const [approvalMessage, setApprovalMessage] = useState('');

  const [messageUnreadCount, setMessageUnreadCount] = useState(0);

  const pendingCertificateTotal = useMemo(
    () => Number(donationSummary.pendingCertificateCount || 0) + Number(volunteerSummary.pendingCertificateCount || 0),
    [donationSummary, volunteerSummary]
  );

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
      const [ngoRes, donationRes, volunteerRes, conversationsRes] = await Promise.all([
        api.get('/ngos/me'),
        getNgoDonationTransactions({ limit: 25 }),
        getNgoVolunteerRequests({ limit: 25 }),
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

      const conversations = conversationsRes.data || [];
      const unread = conversations.reduce((sum, item) => sum + Number(item?.unreadCount || 0), 0);
      setMessageUnreadCount(unread);
    } catch (err) {
      setNgo(null);
      setDonationSummary({ completedCount: 0, totalCompletedAmount: 0, pendingCertificateCount: 0 });
      setDonationTransactions([]);
      setVolunteerSummary({ totalRequests: 0, appliedCount: 0, assignedCount: 0, completedCount: 0, withdrawnCount: 0, pendingCertificateCount: 0 });
      setVolunteerRequests([]);
      setMessageUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    loadApprovals();
  }, []);

  const handleApprovalNoteChange = (key, value) => {
    setApprovalNotes((prev) => ({ ...prev, [key]: value }));
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

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Total Donation Amount</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{currency(donationSummary.totalCompletedAmount)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Completed Donations</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{Number(donationSummary.completedCount || 0)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Volunteer Requests</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{Number(volunteerSummary.totalRequests || 0)}</p>
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
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Link to="/campaigns/create" className="px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-800">Create Campaign</Link>
            <Link to="/campaigns" className="px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-800">View Campaigns</Link>
            <Link to="/ngo/profile" className="px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-800">Update Profile</Link>
            <Link to="/messages" className="px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-800">Open Messages</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
