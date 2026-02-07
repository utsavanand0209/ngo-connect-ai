import React, { useEffect, useState } from 'react';
import api from '../services/api';

export default function FlaggedContent() {
  const [ngos, setNgos] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [requests, setRequests] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);

  const loadFlagged = async () => {
    const [ngosRes, campaignsRes] = await Promise.all([
      api.get('/admin/flagged-ngos'),
      api.get('/admin/flagged-campaigns')
    ]);
    setNgos(ngosRes.data || []);
    setCampaigns(campaignsRes.data || []);
  };

  const loadRequests = async () => {
    const requestsRes = await api.get('/admin/flag-requests', { params: { status: 'pending' } });
    setRequests(requestsRes.data || []);
  };

  useEffect(() => {
    let isMounted = true;
    Promise.all([loadFlagged(), loadRequests()])
      .catch(() => {
        if (!isMounted) return;
        setMessage('Failed to load flagged content.');
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
        setRequestsLoading(false);
      });
    return () => { isMounted = false; };
  }, []);

  const resolveFlag = async (type, id) => {
    try {
      await api.put(`/admin/resolve-flag/${type}/${id}`);
      setMessage('Flag resolved!');
      if (type === 'ngo') setNgos(prev => prev.filter(n => n.id !== id));
      if (type === 'campaign') setCampaigns(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setMessage('Failed to resolve flag.');
    }
  };

  const resolveRequest = async (id, action) => {
    try {
      if (action === 'approve') {
        await api.put(`/admin/flag-requests/${id}/approve`);
        setMessage('Flag request approved.');
      } else {
        await api.put(`/admin/flag-requests/${id}/reject`);
        setMessage('Flag request rejected.');
      }
      setRequests(prev => prev.filter(r => r.id !== id));
      await loadFlagged();
    } catch (err) {
      setMessage('Failed to resolve request.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Flagged Content</h1>
      {message && <div className="mb-4 p-2 bg-green-100 text-green-700">{message}</div>}
      <h2 className="font-semibold mb-2">Pending Flag Requests</h2>
      {requestsLoading ? (
        <div className="text-gray-600 mb-6">Loading requests...</div>
      ) : (
        <ul className="mb-6 border rounded p-2">
          {requests.length === 0 && <li className="text-gray-500">No pending requests</li>}
          {requests.map(req => (
            <li key={req.id} className="mb-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <span>
                <b>{req.targetType.toUpperCase()}</b> - {req.targetName || req.targetId}
                {req.reason ? ` • ${req.reason}` : ''}
              </span>
              <div className="flex gap-2">
                <button
                  className="bg-green-600 text-white px-2 py-1 rounded"
                  onClick={() => resolveRequest(req.id, 'approve')}
                >
                  Approve & Flag
                </button>
                <button
                  className="bg-gray-600 text-white px-2 py-1 rounded"
                  onClick={() => resolveRequest(req.id, 'reject')}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {loading ? (
        <div className="text-gray-600 mb-6">Loading flagged content...</div>
      ) : (
        <>
      <h2 className="font-semibold mb-2">Flagged NGOs</h2>
      <ul className="mb-6 border rounded p-2">
        {ngos.length === 0 && <li className="text-gray-500">No flagged NGOs</li>}
        {ngos.map(ngo => (
          <li key={ngo.id} className="mb-2 flex justify-between items-center">
            <span><b>{ngo.name}</b> - {ngo.flagReason || 'No reason provided'}</span>
            <button className="bg-blue-600 text-white px-2 py-1 rounded" onClick={() => resolveFlag('ngo', ngo.id)}>Resolve</button>
          </li>
        ))}
      </ul>
      <h2 className="font-semibold mb-2">Flagged Campaigns</h2>
      <ul className="border rounded p-2">
        {campaigns.length === 0 && <li className="text-gray-500">No flagged campaigns</li>}
        {campaigns.map(camp => (
          <li key={camp.id} className="mb-2 flex justify-between items-center">
            <span><b>{camp.title}</b> - {camp.flagReason || 'No reason provided'}</span>
            <button className="bg-blue-600 text-white px-2 py-1 rounded" onClick={() => resolveFlag('campaign', camp.id)}>Resolve</button>
          </li>
        ))}
      </ul>
        </>
      )}
    </div>
  );
}
