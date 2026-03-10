import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../services/api';

const DEFAULT_SUMMARY = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  inReview: 0,
  averageCompleteness: 0
};

const DEFAULT_PROGRESS = {
  reviewedCount: 0,
  total: 0,
  reviewProgressPercent: 0
};

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 border-rose-200',
  in_review: 'bg-blue-100 text-blue-800 border-blue-200'
};

const API_ROOT = String(process.env.REACT_APP_API_URL || 'http://localhost:5001/api')
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');

const toSafeArray = (value) => (Array.isArray(value) ? value : []);
const toSafeText = (value) => String(value || '').trim();

const formatDateTime = (value) => {
  const timestamp = Date.parse(value || '');
  if (Number.isNaN(timestamp)) return '—';
  return new Date(timestamp).toLocaleString();
};

const formatStatusLabel = (status) => {
  const raw = toSafeText(status).toLowerCase();
  if (!raw) return 'Pending';
  if (raw === 'in_review') return 'In Review';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const getStatusStyle = (status) => STATUS_STYLES[toSafeText(status).toLowerCase()] || STATUS_STYLES.pending;

const buildDocHref = (docPath) => {
  const normalized = toSafeText(docPath).replace(/^\/+/, '');
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `${API_ROOT}/${normalized}`;
};

const buildWorkflowSteps = (ngo) => {
  const normalizedStatus = toSafeText(ngo?.verificationStatus).toLowerCase();
  const decisionDone = normalizedStatus === 'approved' || normalizedStatus === 'rejected';

  return [
    {
      key: 'submitted',
      label: 'Submission received',
      done: true,
      detail: formatDateTime(ngo?.createdAt)
    },
    {
      key: 'validation',
      label: 'Validation checks',
      done: Boolean(ngo?.checklist?.canAutoApprove),
      detail: `${Number(ngo?.checklist?.completed || 0)}/${Number(ngo?.checklist?.total || 0)} checks`
    },
    {
      key: 'decision',
      label: 'Decision',
      done: decisionDone,
      detail: decisionDone ? formatStatusLabel(normalizedStatus) : 'Pending review'
    }
  ];
};

const filterQueue = (items, statusFilter, query) => {
  const statusKey = toSafeText(statusFilter).toLowerCase();
  const q = toSafeText(query).toLowerCase();

  return toSafeArray(items).filter((item) => {
    const itemStatus = toSafeText(item?.verificationStatus).toLowerCase() || 'pending';
    if (statusKey !== 'all' && itemStatus !== statusKey) return false;
    if (!q) return true;

    const haystack = [
      item?.id,
      item?.name,
      item?.email,
      item?.registrationId,
      item?.helplineNumber,
      item?.category,
      item?.address,
      ...toSafeArray(item?.categories)
    ]
      .map((entry) => toSafeText(entry).toLowerCase())
      .join(' ');

    return haystack.includes(q);
  });
};

const normalizeStatusFilter = (value) => {
  const status = toSafeText(value).toLowerCase();
  if (['pending', 'approved', 'rejected', 'in_review', 'all'].includes(status)) return status;
  return 'pending';
};

export default function AdminVerifications() {
  const location = useLocation();
  const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialStatus = normalizeStatusFilter(urlParams.get('status'));
  const initialQuery = toSafeText(urlParams.get('q'));
  const initialNgoId = toSafeText(urlParams.get('ngoId'));

  const [queue, setQueue] = useState([]);
  const [summary, setSummary] = useState(DEFAULT_SUMMARY);
  const [progress, setProgress] = useState(DEFAULT_PROGRESS);
  const [recentHistory, setRecentHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedNgoId, setSelectedNgoId] = useState(initialNgoId);
  const [decisionNote, setDecisionNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionSuggestions, setRejectionSuggestions] = useState('');
  const [actionState, setActionState] = useState({});
  const [statusMessage, setStatusMessage] = useState(null);

  const fetchQueue = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.get('/admin/ngo-verification-queue', {
        params: { status: 'all' }
      });

      const data = res.data || {};
      const items = toSafeArray(data.items);
      setQueue(items);
      setSummary({ ...DEFAULT_SUMMARY, ...(data.summary || {}) });
      setProgress({ ...DEFAULT_PROGRESS, ...(data.progress || {}) });
      setRecentHistory(toSafeArray(data.recentHistory));
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to load verification queue.';
      setStatusMessage({ type: 'error', text: message });
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    const nextStatus = normalizeStatusFilter(urlParams.get('status'));
    const nextQuery = toSafeText(urlParams.get('q'));
    const nextNgoId = toSafeText(urlParams.get('ngoId'));

    setStatusFilter(nextStatus);
    setSearchQuery(nextQuery);
    if (nextNgoId) setSelectedNgoId(nextNgoId);
  }, [urlParams]);

  const filteredQueue = useMemo(
    () => filterQueue(queue, statusFilter, searchQuery),
    [queue, statusFilter, searchQuery]
  );

  useEffect(() => {
    if (loading) return;
    if (filteredQueue.length === 0) {
      setSelectedNgoId('');
      return;
    }
    const stillExists = filteredQueue.some((item) => item.id === selectedNgoId);
    if (!stillExists) {
      const first = filteredQueue[0];
      setSelectedNgoId(first?.id || '');
      setDecisionNote(toSafeText(first?.verificationReviewNote));
      setRejectionReason(toSafeText(first?.verificationRejectionReason));
      setRejectionSuggestions(toSafeText(first?.verificationRejectionSuggestions));
    }
  }, [filteredQueue, selectedNgoId, loading]);

  const selectedNgo = useMemo(
    () => filteredQueue.find((item) => item.id === selectedNgoId) || null,
    [filteredQueue, selectedNgoId]
  );

  const handleSelectNgo = (ngo) => {
    setSelectedNgoId(ngo?.id || '');
    setDecisionNote(toSafeText(ngo?.verificationReviewNote));
    setRejectionReason(toSafeText(ngo?.verificationRejectionReason));
    setRejectionSuggestions(toSafeText(ngo?.verificationRejectionSuggestions));
    setStatusMessage(null);
  };

  const setActionLoading = (key, value) => {
    setActionState((prev) => ({ ...prev, [key]: value }));
  };

  const handleVerify = async () => {
    if (!selectedNgo) return;

    const missing = toSafeArray(selectedNgo?.checklist?.missing);
    if (missing.length > 0) {
      setStatusMessage({
        type: 'error',
        text: `Verification checklist is incomplete. Missing: ${missing.join(', ')}.`
      });
      return;
    }

    const key = `verify-${selectedNgo.id}`;
    setActionLoading(key, true);
    setStatusMessage(null);
    try {
      const res = await api.post(`/admin/verify-ngo/${selectedNgo.id}`, {
        note: toSafeText(decisionNote),
        enforceChecklist: true
      });
      setStatusMessage({ type: 'success', text: res?.data?.message || 'NGO verified successfully.' });
      await fetchQueue({ silent: true });
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to verify NGO.';
      setStatusMessage({ type: 'error', text: message });
    } finally {
      setActionLoading(key, false);
    }
  };

  const handleReject = async () => {
    if (!selectedNgo) return;

    if (!toSafeText(rejectionReason)) {
      setStatusMessage({ type: 'error', text: 'Rejection reason is required.' });
      return;
    }

    const key = `reject-${selectedNgo.id}`;
    setActionLoading(key, true);
    setStatusMessage(null);
    try {
      const res = await api.post(`/admin/reject-ngo/${selectedNgo.id}`, {
        reason: toSafeText(rejectionReason),
        suggestions: toSafeText(rejectionSuggestions),
        note: toSafeText(decisionNote),
        enforceReason: true
      });
      setStatusMessage({ type: 'success', text: res?.data?.message || 'NGO rejected with feedback.' });
      await fetchQueue({ silent: true });
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to reject NGO.';
      setStatusMessage({ type: 'error', text: message });
    } finally {
      setActionLoading(key, false);
    }
  };

  const verifyBusy = selectedNgo ? Boolean(actionState[`verify-${selectedNgo.id}`]) : false;
  const rejectBusy = selectedNgo ? Boolean(actionState[`reject-${selectedNgo.id}`]) : false;
  const workflowSteps = buildWorkflowSteps(selectedNgo);

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">NGO Verification Review Console</h1>
              <p className="text-sm text-slate-600 mt-1">
                Detailed verification workflow with validation checks, audit history, and structured approval/rejection notes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchQueue({ silent: true })}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh Queue'}
            </button>
          </div>
        </div>

        {statusMessage?.text && (
          <div
            className={`rounded-xl border p-3 text-sm ${
              statusMessage.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total NGOs</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{summary.total}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-amber-600">Pending</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{summary.pending}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-emerald-600">Approved</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{summary.approved}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-rose-600">Rejected</p>
            <p className="text-2xl font-bold text-rose-700 mt-1">{summary.rejected}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Avg Completeness</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{summary.averageCompleteness}%</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Verification Progress</h2>
            <p className="text-sm text-slate-600">
              {progress.reviewedCount}/{progress.total} reviewed
            </p>
          </div>
          <div className="mt-3 h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-slate-900 transition-all duration-300"
              style={{ width: `${Math.min(Math.max(Number(progress.reviewProgressPercent || 0), 0), 100)}%` }}
            />
          </div>
          <p className="text-sm text-slate-600 mt-2">{progress.reviewProgressPercent}% completion</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search NGO name, email, registration ID..."
            className="flex-1 min-w-[220px] border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="in_review">In Review</option>
            <option value="all">All statuses</option>
          </select>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <section className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-slate-900">Verification Queue</h2>
              <span className="text-sm text-slate-500">{filteredQueue.length} shown</span>
            </div>

            {loading ? (
              <p className="text-sm text-slate-600">Loading verification queue...</p>
            ) : filteredQueue.length === 0 ? (
              <p className="text-sm text-slate-500">No NGOs match your current filters.</p>
            ) : (
              <div className="space-y-3 max-h-[760px] overflow-auto pr-1">
                {filteredQueue.map((ngo) => {
                  const selected = ngo.id === selectedNgoId;
                  return (
                    <button
                      key={ngo.id}
                      type="button"
                      onClick={() => handleSelectNgo(ngo)}
                      className={`w-full text-left border rounded-xl p-3 transition ${
                        selected
                          ? 'border-slate-900 bg-slate-50'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">{ngo.name || ngo.id}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{ngo.email || 'No email provided'}</p>
                        </div>
                        <span className={`px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(ngo.verificationStatus)}`}>
                          {formatStatusLabel(ngo.verificationStatus)}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-600 space-y-1">
                        <p>Registration: {ngo.registrationId || 'Not provided'}</p>
                        <p>Checklist: {ngo?.checklist?.completenessPercent || 0}% complete</p>
                        <p>Docs: {toSafeArray(ngo.verificationDocs).length}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="xl:col-span-3 bg-white border border-slate-200 rounded-2xl p-5">
            {!selectedNgo ? (
              <p className="text-sm text-slate-600">Select an NGO from the queue to review details.</p>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">{selectedNgo.name || selectedNgo.id}</h2>
                    <p className="text-sm text-slate-600 mt-1">{selectedNgo.email || 'No email provided'}</p>
                  </div>
                  <span className={`px-3 py-1 text-sm rounded-full border ${getStatusStyle(selectedNgo.verificationStatus)}`}>
                    {formatStatusLabel(selectedNgo.verificationStatus)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="border border-slate-200 rounded-xl p-3">
                    <p className="text-slate-500 text-xs uppercase tracking-wide">Registration ID</p>
                    <p className="text-slate-900 mt-1">{selectedNgo.registrationId || 'Not provided'}</p>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-3">
                    <p className="text-slate-500 text-xs uppercase tracking-wide">Helpline</p>
                    <p className="text-slate-900 mt-1">{selectedNgo.helplineNumber || 'Not provided'}</p>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-3">
                    <p className="text-slate-500 text-xs uppercase tracking-wide">Categories</p>
                    <p className="text-slate-900 mt-1">
                      {toSafeArray(selectedNgo.categories).length > 0
                        ? toSafeArray(selectedNgo.categories).join(', ')
                        : selectedNgo.category || 'Not provided'}
                    </p>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-3">
                    <p className="text-slate-500 text-xs uppercase tracking-wide">Submitted At</p>
                    <p className="text-slate-900 mt-1">{formatDateTime(selectedNgo.createdAt)}</p>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-4">
                  <h3 className="font-semibold text-slate-900">Workflow Progress</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                    {workflowSteps.map((step) => (
                      <div
                        key={step.key}
                        className={`rounded-lg border p-3 ${
                          step.done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <p className={`text-xs uppercase tracking-wide ${step.done ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {step.label}
                        </p>
                        <p className="text-sm text-slate-900 mt-1">{step.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">Validation Checklist</h3>
                    <span className="text-sm text-slate-600">
                      {selectedNgo?.checklist?.completed || 0}/{selectedNgo?.checklist?.total || 0}
                    </span>
                  </div>
                  <div className="space-y-2 mt-3">
                    {toSafeArray(selectedNgo?.checklist?.checks).map((check) => (
                      <div key={check.key} className="flex items-start justify-between gap-3 border border-slate-100 rounded-lg p-2.5">
                        <div>
                          <p className="text-sm text-slate-900">{check.label}</p>
                          <p className="text-xs text-slate-600 mt-0.5">{check.detail}</p>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${
                            check.passed
                              ? 'bg-emerald-100 border-emerald-200 text-emerald-700'
                              : 'bg-rose-100 border-rose-200 text-rose-700'
                          }`}
                        >
                          {check.passed ? 'Pass' : 'Missing'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-4">
                  <h3 className="font-semibold text-slate-900">Submitted Documents</h3>
                  {toSafeArray(selectedNgo.verificationDocs).length === 0 ? (
                    <p className="text-sm text-slate-500 mt-2">No verification documents uploaded.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {toSafeArray(selectedNgo.verificationDocs).map((docPath, index) => (
                        <li key={`${docPath}-${index}`} className="text-sm">
                          <a
                            href={buildDocHref(docPath)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-700 hover:underline break-all"
                          >
                            {docPath}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="font-semibold text-slate-900">Decision Notes and Feedback</h3>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Admin note (optional)</label>
                    <textarea
                      value={decisionNote}
                      onChange={(event) => setDecisionNote(event.target.value)}
                      rows={2}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                      placeholder="Internal note about this review decision..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Rejection reason (required for reject)</label>
                    <textarea
                      value={rejectionReason}
                      onChange={(event) => setRejectionReason(event.target.value)}
                      rows={2}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                      placeholder="Explain why this NGO is being rejected..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Suggestions for improvement (optional)</label>
                    <textarea
                      value={rejectionSuggestions}
                      onChange={(event) => setRejectionSuggestions(event.target.value)}
                      rows={2}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                      placeholder="Tell NGO exactly what to improve before resubmission..."
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleVerify}
                      disabled={verifyBusy || rejectBusy}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {verifyBusy ? 'Approving…' : 'Approve NGO'}
                    </button>
                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={verifyBusy || rejectBusy}
                      className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-60"
                    >
                      {rejectBusy ? 'Rejecting…' : 'Reject with Feedback'}
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-4">
                  <h3 className="font-semibold text-slate-900">Verification History (This NGO)</h3>
                  {toSafeArray(selectedNgo.verificationHistory).length === 0 ? (
                    <p className="text-sm text-slate-500 mt-2">No history entries yet.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {toSafeArray(selectedNgo.verificationHistory).map((entry) => (
                        <div key={entry.id || `${entry.action}-${entry.decidedAt}`} className="rounded-lg border border-slate-100 p-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${getStatusStyle(entry.action)}`}>
                              {formatStatusLabel(entry.action)}
                            </span>
                            <span className="text-xs text-slate-500">{formatDateTime(entry.decidedAt)}</span>
                          </div>
                          {entry.reason && <p className="text-sm text-slate-800 mt-1"><strong>Reason:</strong> {entry.reason}</p>}
                          {entry.suggestions && <p className="text-sm text-slate-800 mt-1"><strong>Suggestions:</strong> {entry.suggestions}</p>}
                          {entry.note && <p className="text-sm text-slate-700 mt-1"><strong>Note:</strong> {entry.note}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-slate-900">Global Verification Activity Log</h2>
          <p className="text-sm text-slate-600 mt-1">Recent actions across all NGO verification decisions.</p>
          {toSafeArray(recentHistory).length === 0 ? (
            <p className="text-sm text-slate-500 mt-3">No verification activity yet.</p>
          ) : (
            <div className="mt-3 overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">NGO</th>
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Reason/Note</th>
                  </tr>
                </thead>
                <tbody>
                  {toSafeArray(recentHistory).slice(0, 20).map((entry, index) => (
                    <tr key={`${entry.id || entry.ngoId || 'row'}-${index}`} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{formatDateTime(entry.decidedAt)}</td>
                      <td className="py-2 pr-4">
                        <p className="font-medium text-slate-900">{entry.ngoName || entry.ngoId}</p>
                        <p className="text-xs text-slate-500">{entry.ngoEmail || ''}</p>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${getStatusStyle(entry.action)}`}>
                          {formatStatusLabel(entry.action)}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        {entry.reason || entry.note || entry.suggestions || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <Link to="/admin" className="inline-block text-sm text-indigo-700 hover:underline">
          Back to Admin Dashboard
        </Link>
      </div>
    </div>
  );
}
