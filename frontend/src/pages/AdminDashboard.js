import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ pending: 0, flagged: 0, users: 0, requests: 0, categories: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      api.get('/admin/ngo-registrations'),
      api.get('/admin/flagged-ngos'),
      api.get('/admin/flagged-campaigns'),
      api.get('/users'),
      api.get('/admin/requests'),
      api.get('/categories/all')
    ])
      .then(([pendingRes, flaggedNgosRes, flaggedCampaignsRes, usersRes, requestsRes, categoriesRes]) => {
        if (!isMounted) return;
        const flaggedCount = (flaggedNgosRes.data?.length || 0) + (flaggedCampaignsRes.data?.length || 0);
        setStats({
          pending: pendingRes.data?.length || 0,
          flagged: flaggedCount,
          users: usersRes.data?.length || 0,
          requests: requestsRes.data?.length || 0,
          categories: categoriesRes.data?.length || 0
        });
      })
      .catch(() => {
        if (!isMounted) return;
        setStats({ pending: 0, flagged: 0, users: 0, requests: 0, categories: 0 });
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
            <h1 className="text-4xl font-bold text-gray-800">Admin Dashboard</h1>
            <p className="text-gray-600 mt-1">Manage users, NGOs, and content.</p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-red-600">
              <h3 className="text-lg font-semibold text-gray-700">Pending NGO Verifications</h3>
              <p className="text-3xl font-bold text-red-600 mt-2">{loading ? '...' : stats.pending}</p>
              <Link to="/admin/verifications" className="mt-4 inline-block px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
                View & Verify
              </Link>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-yellow-600">
              <h3 className="text-lg font-semibold text-gray-700">Flagged Content</h3>
              <p className="text-3xl font-bold text-yellow-600 mt-2">{loading ? '...' : stats.flagged}</p>
              <Link to="/admin/flagged-content" className="mt-4 inline-block px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700">
                Review Content
              </Link>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-blue-600">
              <h3 className="text-lg font-semibold text-gray-700">User Management</h3>
              <p className="text-3xl font-bold text-blue-600 mt-2">{loading ? '...' : stats.users}</p>
               <Link to="/admin/users" className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                Manage Users
              </Link>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-indigo-600">
              <h3 className="text-lg font-semibold text-gray-700">Support Requests</h3>
              <p className="text-3xl font-bold text-indigo-600 mt-2">{loading ? '...' : stats.requests}</p>
              <Link to="/admin/requests" className="mt-4 inline-block px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
                View Requests
              </Link>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-green-600">
              <h3 className="text-lg font-semibold text-gray-700">Categories</h3>
              <p className="text-3xl font-bold text-green-600 mt-2">{loading ? '...' : stats.categories}</p>
              <Link to="/admin/categories" className="mt-4 inline-block px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
                Manage Categories
              </Link>
            </div>
        </section>

        <section className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Link to="/admin/verifications" className="p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition">
                <p className="text-sm uppercase tracking-wide text-gray-500">Verification</p>
                <p className="mt-2 font-semibold text-gray-800">Review NGO Verifications</p>
              </Link>
              <Link to="/admin/flagged-content" className="p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition">
                <p className="text-sm uppercase tracking-wide text-gray-500">Moderation</p>
                <p className="mt-2 font-semibold text-gray-800">Review Flagged Content</p>
              </Link>
              <Link to="/admin/analytics" className="p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition">
                <p className="text-sm uppercase tracking-wide text-gray-500">Analytics</p>
                <p className="mt-2 font-semibold text-gray-800">View Platform Metrics</p>
              </Link>
              <Link to="/admin/notifications" className="p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition">
                <p className="text-sm uppercase tracking-wide text-gray-500">Communications</p>
                <p className="mt-2 font-semibold text-gray-800">Send Notifications</p>
              </Link>
              <Link to="/admin/requests" className="p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition">
                <p className="text-sm uppercase tracking-wide text-gray-500">Requests</p>
                <p className="mt-2 font-semibold text-gray-800">Review Support Requests</p>
              </Link>
              <Link to="/admin/categories" className="p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition">
                <p className="text-sm uppercase tracking-wide text-gray-500">Catalog</p>
                <p className="mt-2 font-semibold text-gray-800">Manage Categories</p>
              </Link>
            </div>
        </section>
      </div>
    </div>
  );
}
