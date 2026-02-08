import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import api, { getAdminDashboard } from '../services/api';

const formatINR = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const formatCount = (value) => Number(value || 0).toLocaleString('en-IN');
const when = (value) => {
  if (!value) return 'N/A';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'N/A';
  return dt.toLocaleString();
};

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value || 0)));
const pct = (value) => `${Math.round(clamp01(value) * 100)}%`;
const textOrDash = (value) => (value === null || value === undefined || String(value).trim() === '' ? '-' : value);

export default function AdminDashboard() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [campaignQuery, setCampaignQuery] = useState('');
  const [campaignFlaggedOnly, setCampaignFlaggedOnly] = useState(false);
  const [campaignSort, setCampaignSort] = useState('progress');

  const [donationQuery, setDonationQuery] = useState('');
  const [donationStatus, setDonationStatus] = useState('all');
  const [donationSort, setDonationSort] = useState('latest');

  const [volunteerQuery, setVolunteerQuery] = useState('');
  const [volunteerStatus, setVolunteerStatus] = useState('all');
  const [volunteerSort, setVolunteerSort] = useState('latest');

  const [campaignVolunteerQuery, setCampaignVolunteerQuery] = useState('');
  const [showCampaignVolunteerRegistrations, setShowCampaignVolunteerRegistrations] = useState(false);

  const [actionState, setActionState] = useState({});

  const stats = snapshot?.stats || {
    pendingNgos: 0,
    verifiedNgos: 0,
    ngosTotal: 0,
    usersTotal: 0,
    adminsTotal: 0,
    campaignsTotal: 0,
    flaggedNgos: 0,
    flaggedCampaigns: 0,
    flaggedTotal: 0,
    requestsTotal: 0,
    categoriesTotal: 0,
    donationsCompletedCount: 0,
    donationsCompletedTotal: 0,
    volunteerApplicationsCount: 0,
    volunteerCompletedCount: 0,
    campaignVolunteersCount: 0,
    campaignVolunteerRegistrationsCount: 0
  };

  const fetchSnapshot = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setRefreshing(true);
      setError('');
      try {
        const res = await getAdminDashboard({ limit: 30, days: 14 });
        setSnapshot(res.data || null);
      } catch (err) {
        setError(err.response?.data?.message || 'Unable to load admin dashboard data right now.');
        setSnapshot(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    let isMounted = true;
    fetchSnapshot();
    return () => {
      isMounted = false;
    };
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = window.setInterval(() => {
      fetchSnapshot({ silent: true });
    }, 10000);
    return () => window.clearInterval(id);
  }, [autoRefresh, fetchSnapshot]);

  const campaignRows = useMemo(() => {
    const q = campaignQuery.trim().toLowerCase();
    const rows = (snapshot?.campaigns || []).filter((campaign) => {
      if (campaignFlaggedOnly && !campaign.flagged) return false;
      if (!q) return true;
      const hay = [
        campaign.title,
        campaign.category,
        campaign.location,
        campaign.area,
        campaign.ngo?.name
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    const sorted = [...rows];
    if (campaignSort === 'progress') {
      sorted.sort((a, b) => Number(b.progress || 0) - Number(a.progress || 0));
    } else if (campaignSort === 'raised') {
      sorted.sort((a, b) => Number(b.currentAmount || 0) - Number(a.currentAmount || 0));
    } else if (campaignSort === 'latest') {
      sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }
    return sorted.slice(0, 12);
  }, [snapshot, campaignQuery, campaignFlaggedOnly, campaignSort]);

  const donationRows = useMemo(() => {
    const q = donationQuery.trim().toLowerCase();
    const status = donationStatus;
    const rows = (snapshot?.donations || []).filter((donation) => {
      if (status !== 'all' && String(donation.status || '').toLowerCase() !== status) return false;
      if (!q) return true;
      const hay = [
        donation.receiptNumber,
        donation.donorName,
        donation.donorEmail,
        donation.user?.name,
        donation.user?.email,
        donation.campaign?.title,
        donation.ngo?.name
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    const sorted = [...rows];
    if (donationSort === 'latest') {
      sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } else if (donationSort === 'amount') {
      sorted.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    }
    return sorted.slice(0, 15);
  }, [snapshot, donationQuery, donationStatus, donationSort]);

  const volunteerRows = useMemo(() => {
    const q = volunteerQuery.trim().toLowerCase();
    const status = volunteerStatus;
    const rows = (snapshot?.volunteerApplications || []).filter((application) => {
      if (status !== 'all' && String(application.status || '').toLowerCase() !== status) return false;
      if (!q) return true;
      const hay = [
        application.user?.name,
        application.user?.email,
        application.opportunity?.title,
        application.ngo?.name,
        application.assignedTask
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    const sorted = [...rows];
    if (volunteerSort === 'latest') {
      sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } else if (volunteerSort === 'status') {
      sorted.sort((a, b) => String(a.status || '').localeCompare(String(b.status || '')));
    }
    return sorted.slice(0, 15);
  }, [snapshot, volunteerQuery, volunteerStatus, volunteerSort]);

  const campaignVolunteerRows = useMemo(() => {
    const q = campaignVolunteerQuery.trim().toLowerCase();
    const rows = (snapshot?.campaignVolunteerRegistrations || []).filter((item) => {
      if (!q) return true;
      const hay = [
        item.user?.name,
        item.user?.email,
        item.registration?.fullName,
        item.registration?.email,
        item.campaign?.title,
        item.ngo?.name
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    const sorted = [...rows].sort((a, b) => {
      const left = a.registration?.submittedAt || a.registration?.updatedAt || a.registration?.createdAt || 0;
      const right = b.registration?.submittedAt || b.registration?.updatedAt || b.registration?.createdAt || 0;
      return new Date(right) - new Date(left);
    });
    return sorted.slice(0, 15);
  }, [snapshot, campaignVolunteerQuery]);

  const handleVerifyNgo = async (ngoId) => {
    if (!ngoId) return;
    const key = `verify-${ngoId}`;
    setActionState((prev) => ({ ...prev, [key]: true }));
    try {
      await api.post(`/admin/verify-ngo/${ngoId}`);
      await fetchSnapshot();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to verify NGO.');
    } finally {
      setActionState((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleRejectNgo = async (ngoId) => {
    if (!ngoId) return;
    const key = `reject-${ngoId}`;
    setActionState((prev) => ({ ...prev, [key]: true }));
    try {
      await api.post(`/admin/reject-ngo/${ngoId}`);
      await fetchSnapshot();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reject NGO.');
    } finally {
      setActionState((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleResolveFlag = async (type, id) => {
    if (!type || !id) return;
    const key = `resolve-${type}-${id}`;
    setActionState((prev) => ({ ...prev, [key]: true }));
    try {
      await api.put(`/admin/resolve-flag/${type}/${id}`);
      await fetchSnapshot();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resolve flag.');
    } finally {
      setActionState((prev) => ({ ...prev, [key]: false }));
    }
  };

  const donationSeries = snapshot?.series?.donations || [];
  const volunteerSeries = snapshot?.series?.volunteerApplications || [];
  const generatedAt = snapshot?.generatedAt || null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Admin Control Room</h1>
              <p className="text-slate-600 mt-1">
                Live platform pulse: campaigns, donations, volunteer activity, and moderation queues.
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Last updated: {generatedAt ? when(generatedAt) : loading ? 'Loading…' : 'N/A'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(Boolean(e.target.checked))}
                />
                Auto refresh
              </label>
              <button
                type="button"
                onClick={() => fetchSnapshot()}
                disabled={refreshing}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
              >
                {refreshing ? 'Refreshing…' : 'Refresh now'}
              </button>
              <Link
                to="/admin/analytics"
                className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm font-semibold hover:bg-slate-50"
              >
                Open Analytics
              </Link>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-6 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-4">
            <p className="font-semibold">Dashboard error</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/90 backdrop-blur rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs font-semibold tracking-wide uppercase text-slate-500">Donations (Completed)</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-2">{formatINR(stats.donationsCompletedTotal)}</p>
            <p className="text-sm text-slate-600 mt-1">{formatCount(stats.donationsCompletedCount)} transactions</p>
          </div>
          <div className="bg-white/90 backdrop-blur rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs font-semibold tracking-wide uppercase text-slate-500">Volunteer Registrations</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-2">{formatCount(stats.volunteerApplicationsCount)}</p>
            <p className="text-sm text-slate-600 mt-1">{formatCount(stats.volunteerCompletedCount)} completed</p>
          </div>
          <div className="bg-white/90 backdrop-blur rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs font-semibold tracking-wide uppercase text-slate-500">Moderation</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-2">{formatCount(stats.flaggedTotal)}</p>
            <p className="text-sm text-slate-600 mt-1">
              NGOs: {formatCount(stats.flaggedNgos)} • Campaigns: {formatCount(stats.flaggedCampaigns)}
            </p>
          </div>
          <div className="bg-white/90 backdrop-blur rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs font-semibold tracking-wide uppercase text-slate-500">Queues</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-2">{formatCount(stats.pendingNgos)}</p>
            <p className="text-sm text-slate-600 mt-1">Pending NGO verifications</p>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Donations Pulse (Daily)</h2>
                <p className="text-sm text-slate-600 mt-1">Last {snapshot?.days || 14} days, completed donations.</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-sm font-semibold text-slate-900">{formatINR(stats.donationsCompletedTotal)}</p>
              </div>
            </div>
            <div className="mt-4" style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={donationSeries}>
                  <CartesianGrid strokeDasharray="4 4" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} width={80} />
                  <Tooltip formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
                  <Line type="monotone" dataKey="totalAmount" stroke="#0f766e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Volunteer Pulse (Daily)</h2>
                <p className="text-sm text-slate-600 mt-1">Applications submitted per day.</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-sm font-semibold text-slate-900">{formatCount(stats.volunteerApplicationsCount)}</p>
              </div>
            </div>
            <div className="mt-4" style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={volunteerSeries}>
                  <CartesianGrid strokeDasharray="4 4" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 xl:col-span-2">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Campaign Progress</h2>
                <p className="text-sm text-slate-600 mt-1">Top campaigns by progress toward goal.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={campaignQuery}
                  onChange={(e) => setCampaignQuery(e.target.value)}
                  placeholder="Search campaigns…"
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm w-64"
                />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={campaignFlaggedOnly}
                    onChange={(e) => setCampaignFlaggedOnly(Boolean(e.target.checked))}
                  />
                  Flagged only
                </label>
                <select
                  value={campaignSort}
                  onChange={(e) => setCampaignSort(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                >
                  <option value="progress">Sort: Progress</option>
                  <option value="raised">Sort: Raised</option>
                  <option value="latest">Sort: Latest</option>
                </select>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2">Campaign</th>
                    <th className="text-left px-3 py-2">NGO</th>
                    <th className="text-left px-3 py-2">Progress</th>
                    <th className="text-right px-3 py-2">Raised</th>
                    <th className="text-right px-3 py-2">Goal</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                        {loading ? 'Loading campaigns…' : 'No campaigns found for this filter.'}
                      </td>
                    </tr>
                  ) : (
                    campaignRows.map((campaign) => (
                      <tr key={campaign.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-900">
                          <div className="flex items-center gap-2">
                            {campaign.flagged && (
                              <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                                Flagged
                              </span>
                            )}
                            <Link to={`/campaigns/${campaign.id}`} className="font-semibold hover:underline">
                              {textOrDash(campaign.title)}
                            </Link>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {textOrDash(campaign.category)} • {textOrDash(campaign.location || campaign.area)}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {campaign.ngo ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="font-medium">{campaign.ngo.name}</span>
                              {campaign.ngo.verified ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Verified
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                                  Unverified
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-500">Unknown</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          <div className="flex items-center gap-3">
                            <div className="w-40 h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                              <div
                                className="h-full bg-emerald-500"
                                style={{ width: pct(campaign.progress) }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-700">{pct(campaign.progress)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-900 font-semibold">{formatINR(campaign.currentAmount)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{formatINR(campaign.goalAmount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Moderation Queue</h2>
                <p className="text-sm text-slate-600 mt-1">Resolve flags and verify pending NGOs.</p>
              </div>
              <Link to="/admin/flagged-content" className="text-sm font-semibold text-slate-900 hover:underline">
                Open
              </Link>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-bold text-slate-900">Pending NGO Verifications</h3>
              <p className="text-xs text-slate-500 mt-1">
                {formatCount(stats.pendingNgos)} pending total.
              </p>

              <div className="mt-3 space-y-3">
                {(snapshot?.pendingNgos || []).slice(0, 5).map((ngo) => {
                  const verifyKey = `verify-${ngo.id}`;
                  const rejectKey = `reject-${ngo.id}`;
                  return (
                    <div key={ngo.id} className="rounded-lg border border-slate-200 p-3">
                      <p className="font-semibold text-slate-900">{ngo.name || 'NGO'}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{ngo.email || 'No email'}</p>
                      <p className="text-xs text-slate-500 mt-1">Submitted: {when(ngo.createdAt)}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleVerifyNgo(ngo.id)}
                          disabled={Boolean(actionState[verifyKey] || actionState[rejectKey])}
                          className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {actionState[verifyKey] ? 'Verifying…' : 'Verify'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectNgo(ngo.id)}
                          disabled={Boolean(actionState[verifyKey] || actionState[rejectKey])}
                          className="px-3 py-1.5 rounded-md bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-60"
                        >
                          {actionState[rejectKey] ? 'Rejecting…' : 'Reject'}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {(snapshot?.pendingNgos || []).length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-600">
                    No pending NGO verifications.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-bold text-slate-900">Flagged Items</h3>
              <p className="text-xs text-slate-500 mt-1">
                NGOs: {formatCount(stats.flaggedNgos)} • Campaigns: {formatCount(stats.flaggedCampaigns)}
              </p>

              <div className="mt-3 space-y-2">
                {(snapshot?.flagged?.ngos || []).slice(0, 3).map((ngo) => {
                  const key = `resolve-ngo-${ngo.id}`;
                  return (
                    <div key={ngo.id} className="rounded-lg border border-slate-200 p-3">
                      <p className="font-semibold text-slate-900">{ngo.name || 'Flagged NGO'}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{ngo.flagReason || 'No reason provided'}</p>
                      <button
                        type="button"
                        onClick={() => handleResolveFlag('ngo', ngo.id)}
                        disabled={Boolean(actionState[key])}
                        className="mt-2 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-60"
                      >
                        {actionState[key] ? 'Resolving…' : 'Resolve'}
                      </button>
                    </div>
                  );
                })}

                {(snapshot?.flagged?.campaigns || []).slice(0, 3).map((campaign) => {
                  const key = `resolve-campaign-${campaign.id}`;
                  return (
                    <div key={campaign.id} className="rounded-lg border border-slate-200 p-3">
                      <p className="font-semibold text-slate-900">{campaign.title || 'Flagged campaign'}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{campaign.flagReason || 'No reason provided'}</p>
                      <button
                        type="button"
                        onClick={() => handleResolveFlag('campaign', campaign.id)}
                        disabled={Boolean(actionState[key])}
                        className="mt-2 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-60"
                      >
                        {actionState[key] ? 'Resolving…' : 'Resolve'}
                      </button>
                    </div>
                  );
                })}

                {(snapshot?.flagged?.ngos || []).length === 0 && (snapshot?.flagged?.campaigns || []).length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-600">
                    No flagged content right now.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">Donation Registrations</h2>
              <p className="text-sm text-slate-600 mt-1">Recent donations across the platform.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={donationQuery}
                onChange={(e) => setDonationQuery(e.target.value)}
                placeholder="Search donors, receipts, NGOs…"
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm w-72"
              />
              <select
                value={donationStatus}
                onChange={(e) => setDonationStatus(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
              >
                <option value="all">Status: All</option>
                <option value="completed">Status: Completed</option>
                <option value="pending">Status: Pending</option>
                <option value="failed">Status: Failed</option>
              </select>
              <select
                value={donationSort}
                onChange={(e) => setDonationSort(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
              >
                <option value="latest">Sort: Latest</option>
                <option value="amount">Sort: Amount</option>
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Donor</th>
                  <th className="text-left px-3 py-2">Campaign / NGO</th>
                  <th className="text-right px-3 py-2">Amount</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Certificate</th>
                  <th className="text-left px-3 py-2">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {donationRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                      {loading ? 'Loading donations…' : 'No donations found for this filter.'}
                    </td>
                  </tr>
                ) : (
                  donationRows.map((donation) => (
                    <tr key={donation.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{when(donation.createdAt)}</td>
                      <td className="px-3 py-2 text-slate-900">
                        <p className="font-semibold">{donation.donorName || donation.user?.name || 'Donor'}</p>
                        <p className="text-xs text-slate-500">{donation.donorEmail || donation.user?.email || '-'}</p>
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        <p className="font-medium">{donation.campaign?.title || '-'}</p>
                        <p className="text-xs text-slate-500">{donation.ngo?.name || '-'}</p>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-900 font-semibold">{formatINR(donation.amount)}</td>
                      <td className="px-3 py-2 text-slate-700">{textOrDash(donation.status)}</td>
                      <td className="px-3 py-2 text-slate-700">{textOrDash(donation.certificateApprovalStatus)}</td>
                      <td className="px-3 py-2 text-slate-700 font-mono text-xs">{textOrDash(donation.receiptNumber)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">Volunteer Registrations</h2>
              <p className="text-sm text-slate-600 mt-1">Recent volunteer opportunity applications.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={volunteerQuery}
                onChange={(e) => setVolunteerQuery(e.target.value)}
                placeholder="Search users, NGOs, opportunities…"
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm w-72"
              />
              <select
                value={volunteerStatus}
                onChange={(e) => setVolunteerStatus(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
              >
                <option value="all">Status: All</option>
                <option value="applied">Status: Applied</option>
                <option value="assigned">Status: Assigned</option>
                <option value="completed">Status: Completed</option>
              </select>
              <select
                value={volunteerSort}
                onChange={(e) => setVolunteerSort(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
              >
                <option value="latest">Sort: Latest</option>
                <option value="status">Sort: Status</option>
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="text-left px-3 py-2">Submitted</th>
                  <th className="text-left px-3 py-2">Volunteer</th>
                  <th className="text-left px-3 py-2">Opportunity / NGO</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Certificate</th>
                </tr>
              </thead>
              <tbody>
                {volunteerRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      {loading ? 'Loading volunteer registrations…' : 'No volunteer registrations found.'}
                    </td>
                  </tr>
                ) : (
                  volunteerRows.map((application) => (
                    <tr key={application.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{when(application.createdAt)}</td>
                      <td className="px-3 py-2 text-slate-900">
                        <p className="font-semibold">{application.user?.name || 'Volunteer'}</p>
                        <p className="text-xs text-slate-500">{application.user?.email || '-'}</p>
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        <p className="font-medium">{application.opportunity?.title || '-'}</p>
                        <p className="text-xs text-slate-500">{application.ngo?.name || '-'}</p>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{textOrDash(application.status)}</td>
                      <td className="px-3 py-2 text-slate-700">{textOrDash(application.certificateApprovalStatus)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">Campaign Volunteer Registrations</h2>
              <p className="text-sm text-slate-600 mt-1">
                Volunteers who registered directly on campaign pages (form-based).
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Total registrations: {formatCount(stats.campaignVolunteerRegistrationsCount)} • Total volunteers joined: {formatCount(stats.campaignVolunteersCount)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowCampaignVolunteerRegistrations((prev) => !prev)}
                className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                {showCampaignVolunteerRegistrations ? 'Hide' : 'Show'}
              </button>
              <input
                value={campaignVolunteerQuery}
                onChange={(e) => setCampaignVolunteerQuery(e.target.value)}
                placeholder="Search campaign volunteers…"
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm w-72"
              />
            </div>
          </div>

          {!showCampaignVolunteerRegistrations ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-600">
              Hidden by default to keep the dashboard fast. Click "Show" to load the table view.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2">Submitted</th>
                    <th className="text-left px-3 py-2">Volunteer</th>
                    <th className="text-left px-3 py-2">Campaign / NGO</th>
                    <th className="text-left px-3 py-2">Availability</th>
                    <th className="text-left px-3 py-2">Preferred Activities</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignVolunteerRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                        {loading ? 'Loading…' : 'No campaign volunteer registrations found.'}
                      </td>
                    </tr>
                  ) : (
                    campaignVolunteerRows.map((item, index) => {
                      const reg = item.registration || {};
                      const submitted = reg.submittedAt || reg.updatedAt || reg.createdAt || null;
                      const activities = Array.isArray(reg.preferredActivities)
                        ? reg.preferredActivities.filter(Boolean).join(', ')
                        : '';
                      return (
                        <tr key={`${item.user?.id || index}-${item.campaign?.id || index}`} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{when(submitted)}</td>
                          <td className="px-3 py-2 text-slate-900">
                            <p className="font-semibold">{item.user?.name || reg.fullName || 'Volunteer'}</p>
                            <p className="text-xs text-slate-500">{item.user?.email || reg.email || '-'}</p>
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            <p className="font-medium">{item.campaign?.title || '-'}</p>
                            <p className="text-xs text-slate-500">{item.ngo?.name || '-'}</p>
                          </td>
                          <td className="px-3 py-2 text-slate-700">{textOrDash(reg.availability)}</td>
                          <td className="px-3 py-2 text-slate-700">{activities || '-'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-xl font-extrabold text-slate-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <Link to="/admin/verifications" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50 transition">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Verification</p>
              <p className="mt-2 font-bold text-slate-900">Review NGO Verifications</p>
              <p className="text-sm text-slate-600 mt-1">{formatCount(stats.pendingNgos)} pending</p>
            </Link>
            <Link to="/admin/flagged-content" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50 transition">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Moderation</p>
              <p className="mt-2 font-bold text-slate-900">Review Flagged Content</p>
              <p className="text-sm text-slate-600 mt-1">{formatCount(stats.flaggedTotal)} total flagged</p>
            </Link>
            <Link to="/admin/users" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50 transition">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Users</p>
              <p className="mt-2 font-bold text-slate-900">Manage Users</p>
              <p className="text-sm text-slate-600 mt-1">{formatCount(stats.usersTotal)} users</p>
            </Link>
            <Link to="/admin/requests" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50 transition">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Support</p>
              <p className="mt-2 font-bold text-slate-900">Review Support Requests</p>
              <p className="text-sm text-slate-600 mt-1">{formatCount(stats.requestsTotal)} total</p>
            </Link>
            <Link to="/admin/notifications" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50 transition">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Broadcast</p>
              <p className="mt-2 font-bold text-slate-900">Send Notifications</p>
              <p className="text-sm text-slate-600 mt-1">To users/NGOs</p>
            </Link>
            <Link to="/admin/categories" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50 transition">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Catalog</p>
              <p className="mt-2 font-bold text-slate-900">Manage Categories</p>
              <p className="text-sm text-slate-600 mt-1">{formatCount(stats.categoriesTotal)} categories</p>
            </Link>
            <Link to="/ngos" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50 transition">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Public</p>
              <p className="mt-2 font-bold text-slate-900">Browse NGO Directory</p>
              <p className="text-sm text-slate-600 mt-1">Spot-check listings</p>
            </Link>
            <Link to="/campaigns" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50 transition">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Public</p>
              <p className="mt-2 font-bold text-slate-900">Browse Campaigns</p>
              <p className="text-sm text-slate-600 mt-1">Review progress and content</p>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
