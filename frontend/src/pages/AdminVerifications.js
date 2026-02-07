import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function AdminVerifications() {
  const [ngos, setNgos] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    api.get('/admin/ngo-registrations')
      .then(res => {
        if (isMounted) setNgos(res.data);
      })
      .catch(() => {
        if (isMounted) setMessage('Failed to load pending NGOs.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, []);

  const handleVerify = async (id) => {
    try {
      await api.post(`/admin/verify-ngo/${id}`);
      setNgos(prev => prev.filter(n => n.id !== id));
      setMessage('NGO verified successfully.');
    } catch (err) {
      setMessage('Failed to verify NGO.');
    }
  };

  const handleReject = async (id) => {
    try {
      await api.post(`/admin/reject-ngo/${id}`);
      setNgos(prev => prev.filter(n => n.id !== id));
      setMessage('NGO rejected and removed.');
    } catch (err) {
      setMessage('Failed to reject NGO.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Pending NGO Verifications</h1>
        <p className="text-gray-600 mb-6">
          Review submitted NGO documents and approve or reject verification requests.
        </p>
        {message && <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-md p-3 mb-4">{message}</div>}
        {loading ? (
          <div className="text-gray-600">Loading pending NGOs...</div>
        ) : (
          <div className="space-y-4">
            {ngos.length === 0 && <div className="text-gray-500">No pending NGO verifications.</div>}
            {ngos.map(ngo => (
              <div key={ngo.id} className="border rounded-lg p-4 flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-gray-800">{ngo.name}</h3>
                  <p className="text-sm text-gray-500">{ngo.email}</p>
                  <p className="text-sm text-gray-500">
                  {
                    ngo.location && typeof ngo.location === 'object' && ngo.location.type === 'Point' && Array.isArray(ngo.location.coordinates)
                      ? `Coordinates: ${ngo.location.coordinates.join(', ')}`
                      : ngo.location || 'Location not set'
                  }
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleVerify(ngo.id)}
                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Verify
                  </button>
                  <button
                    onClick={() => handleReject(ngo.id)}
                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <Link to="/admin" className="text-indigo-600 hover:underline">Back to Admin Dashboard</Link>
      </div>
    </div>
  );
}
