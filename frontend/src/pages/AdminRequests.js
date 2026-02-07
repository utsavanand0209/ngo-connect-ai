import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAllHelpRequests } from '../services/api';

export default function AdminRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    getAllHelpRequests()
      .then(res => {
        if (isMounted) setRequests(res.data || []);
      })
      .catch(() => {
        if (isMounted) setMessage('Failed to load requests.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">All Support Requests</h1>
        <p className="text-gray-600 mb-6">Monitor beneficiary requests across NGOs.</p>
        {message && <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-md p-3 mb-4">{message}</div>}
        {loading ? (
          <div className="text-gray-600">Loading requests...</div>
        ) : requests.length === 0 ? (
          <div className="text-gray-500">No requests found.</div>
        ) : (
          <div className="space-y-4">
            {requests.map(req => (
              <div key={req.id} className="border rounded-lg p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-800">{req.name}</p>
                  <p className="text-sm text-gray-500">
                    NGO: {req.ngo?.name || 'N/A'} • {req.helpType} • {req.location || 'Location not specified'}
                  </p>
                  <p className="text-xs text-gray-400">Mobile: {req.mobileNumber}</p>
                  <p className="text-xs text-gray-400">Submitted: {new Date(req.createdAt).toLocaleString()}</p>
                </div>
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-gray-100 text-gray-700">
                  {req.status}
                </span>
              </div>
            ))}
          </div>
        )}
        <Link to="/admin" className="text-indigo-600 hover:underline">Back to Admin Dashboard</Link>
      </div>
    </div>
  );
}
