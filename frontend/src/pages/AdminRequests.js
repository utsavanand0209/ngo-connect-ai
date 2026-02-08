import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAllHelpRequests } from '../services/api';

const when = (value) => {
  if (!value) return 'N/A';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'N/A';
  return dt.toLocaleString();
};

const textOrDash = (value) => (value === null || value === undefined || String(value).trim() === '' ? '-' : value);

export default function AdminRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const refresh = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setMessage('');
    try {
      const res = await getAllHelpRequests();
      if (signal?.aborted) return;
      setRequests(res.data || []);
    } catch (err) {
      if (signal?.aborted) return;
      setRequests([]);
      setMessage(err.response?.data?.message || 'Failed to load requests.');
    } finally {
      if (signal?.aborted) return;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const signal = { aborted: false };
    refresh({ signal });
    return () => { signal.aborted = true; };
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const status = String(statusFilter || 'all').trim().toLowerCase();
    const rows = (requests || []).filter((req) => {
      const rawStatus = String(req?.status || 'Pending').trim().toLowerCase();
      if (status !== 'all' && rawStatus !== status) return false;
      if (!q) return true;
      const hay = [
        req?.name,
        req?.mobileNumber,
        req?.helpType,
        req?.location,
        req?.status,
        req?.ngo?.name,
        req?.user?.name,
        req?.user?.email
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
    return [...rows].sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0));
  }, [requests, query, statusFilter]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Support Requests</h1>
              <p className="text-slate-600 mt-1">Monitor beneficiary help requests across NGOs.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/admin"
                className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm font-semibold hover:bg-slate-50"
              >
                Back to Dashboard
              </Link>
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>
        </header>

        {message && (
          <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-4">
            {message}
          </div>
        )}

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search requests…"
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm w-72"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="in progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <p className="text-sm text-slate-600">{filtered.length} results</p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="text-left px-3 py-2">Submitted</th>
                  <th className="text-left px-3 py-2">Requester</th>
                  <th className="text-left px-3 py-2">NGO</th>
                  <th className="text-left px-3 py-2">Help</th>
                  <th className="text-left px-3 py-2">Location</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      Loading requests…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      No requests found for this filter.
                    </td>
                  </tr>
                ) : (
                  filtered.slice(0, 100).map((req) => {
                    const rawStatus = String(req.status || 'Pending');
                    const status = rawStatus.trim().toLowerCase();
                    const badgeClass = status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : status === 'rejected'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : status === 'in progress'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : status === 'approved'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200';
                    return (
                      <tr key={req.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{when(req.createdAt)}</td>
                        <td className="px-3 py-2 text-slate-900">
                          <p className="font-semibold">{textOrDash(req.user?.name || req.name)}</p>
                          <p className="text-xs text-slate-500">{textOrDash(req.user?.email)}</p>
                          <p className="text-xs text-slate-500">{textOrDash(req.mobileNumber || req.user?.mobileNumber)}</p>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{textOrDash(req.ngo?.name)}</td>
                        <td className="px-3 py-2 text-slate-700">{textOrDash(req.helpType)}</td>
                        <td className="px-3 py-2 text-slate-700">{textOrDash(req.location)}</td>
                        <td className="px-3 py-2 text-slate-700">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold border ${badgeClass}`}>
                            {rawStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
