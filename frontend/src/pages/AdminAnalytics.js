import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import api from '../services/api';

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState({
    totals: {
      users: 0,
      verifiedNgos: 0,
      pendingNgos: 0,
      campaigns: 0,
      flagged: 0,
      donationsTotal: 0,
      volunteerTotal: 0
    },
    usersByRole: { admin: 0, ngo: 0, user: 0 },
    usersByMonth: [],
    donationsByMonth: [],
    volunteersByCampaign: []
  });
  const [ngoData, setNgoData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    const fetchAnalytics = api.get('/admin/analytics');
    const fetchNgos = api.get('/ngos');

    Promise.all([fetchAnalytics, fetchNgos])
      .then(([analyticsRes, ngosRes]) => {
        if (!isMounted) return;
        setAnalytics(analyticsRes.data);
        setNgoData(ngosRes.data);
      })
      .catch(() => {
        if (!isMounted) return;
        setMessage('Failed to load analytics.');
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => { isMounted = false; };
  }, []);

  const formatMonth = (value) => {
    if (!value) return '';
    const [year, month] = value.split('-').map(Number);
    if (!year || !month) return value;
    const date = new Date(year, month - 1, 1);
    return date.toLocaleString('en-US', { month: 'short', year: '2-digit' });
  };

  const formatCurrency = (value) => {
    const num = Number(value) || 0;
    if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`;
    if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
    if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
    return `₹${num}`;
  };

  const topNgosByIncome = ngoData
    .filter(ngo => ngo.financials && ngo.financials.income && ngo.financials.income.length > 0)
    .sort((a, b) => b.financials.income.slice(-1)[0] - a.financials.income.slice(-1)[0])
    .slice(0, 5)
    .map(ngo => ({
      name: ngo.name,
      income: ngo.financials.income.slice(-1)[0],
      expenses: ngo.financials.expenses.slice(-1)[0]
    }));

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Platform Analytics</h1>
        <p className="text-gray-600 mb-6">
          Track platform growth, donations, and engagement trends.
        </p>
        {message && <div className="bg-green-50 border border-green-200 text-green-800 rounded-md p-3 mb-4">{message}</div>}
        {loading ? (
          <div className="text-gray-600">Loading analytics...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="border rounded-lg p-4">
                <p className="text-sm text-gray-500">Total Users</p>
                <p className="text-2xl font-bold">{analytics.totals.users}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Admin: {analytics.usersByRole.admin} • NGOs: {analytics.usersByRole.ngo} • Users: {analytics.usersByRole.user}
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-gray-500">NGOs</p>
                <p className="text-2xl font-bold">{analytics.totals.verifiedNgos + analytics.totals.pendingNgos}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Verified: {analytics.totals.verifiedNgos} • Pending: {analytics.totals.pendingNgos}
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-gray-500">Campaigns</p>
                <p className="text-2xl font-bold">{analytics.totals.campaigns}</p>
                <p className="text-xs text-gray-500 mt-1">Flagged: {analytics.totals.flagged}</p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-gray-500">Totals</p>
                <p className="text-lg font-semibold">₹{analytics.totals.donationsTotal.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Volunteers: {analytics.totals.volunteerTotal}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="border rounded-lg p-4">
                <h2 className="text-lg font-semibold text-gray-800 mb-3">User Growth (Monthly)</h2>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={analytics.usersByMonth}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tickFormatter={formatMonth} />
                      <YAxis allowDecimals={false} />
                      <Tooltip labelFormatter={formatMonth} />
                      <Line type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="border rounded-lg p-4">
                <h2 className="text-lg font-semibold text-gray-800 mb-3">Donations (Monthly)</h2>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={analytics.donationsByMonth}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tickFormatter={formatMonth} />
                      <YAxis tickFormatter={formatCurrency} />
                      <Tooltip
                        labelFormatter={formatMonth}
                        formatter={(value) => `₹${Number(value).toLocaleString()}`}
                      />
                      <Line type="monotone" dataKey="total" stroke="#16a34a" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="border rounded-lg p-4">
                <h2 className="text-lg font-semibold text-gray-800 mb-3">Top Campaigns by Volunteers</h2>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={analytics.volunteersByCampaign} margin={{ left: 10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" name="Volunteers" fill="#f97316" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <h2 className="text-lg font-semibold text-gray-800 mb-3">Top 5 NGOs by Income (Latest Year)</h2>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={topNgosByIncome} margin={{ left: 10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
                      <YAxis tickFormatter={formatCurrency} />
                      <Tooltip formatter={(value) => `₹${Number(value).toLocaleString()}`} />
                      <Legend />
                      <Bar dataKey="income" name="Income" fill="#8884d8" />
                      <Bar dataKey="expenses" name="Expenses" fill="#82ca9d" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </>
        )}
        <Link to="/admin" className="text-indigo-600 hover:underline">Back to Admin Dashboard</Link>
      </div>
    </div>
  );
}
