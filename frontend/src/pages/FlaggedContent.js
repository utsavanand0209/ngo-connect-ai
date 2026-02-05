import React, { useEffect, useState } from 'react';
import api from '../services/api';

export default function FlaggedContent() {
  const [ngos, setNgos] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/admin/flagged-ngos').then(res => setNgos(res.data));
    api.get('/admin/flagged-campaigns').then(res => setCampaigns(res.data));
  }, []);

  const resolveFlag = async (type, id) => {
    await api.put(`/admin/resolve-flag/${type}/${id}`);
    setMessage('Flag resolved!');
    if (type === 'ngo') setNgos(ngos.filter(n => n._id !== id));
    if (type === 'campaign') setCampaigns(campaigns.filter(c => c._id !== id));
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Flagged Content</h1>
      {message && <div className="mb-4 p-2 bg-green-100 text-green-700">{message}</div>}
      <h2 className="font-semibold mb-2">Flagged NGOs</h2>
      <ul className="mb-6 border rounded p-2">
        {ngos.length === 0 && <li className="text-gray-500">No flagged NGOs</li>}
        {ngos.map(ngo => (
          <li key={ngo._id} className="mb-2 flex justify-between items-center">
            <span><b>{ngo.name}</b> - {ngo.flagReason || 'No reason provided'}</span>
            <button className="bg-blue-600 text-white px-2 py-1 rounded" onClick={() => resolveFlag('ngo', ngo._id)}>Resolve</button>
          </li>
        ))}
      </ul>
      <h2 className="font-semibold mb-2">Flagged Campaigns</h2>
      <ul className="border rounded p-2">
        {campaigns.length === 0 && <li className="text-gray-500">No flagged campaigns</li>}
        {campaigns.map(camp => (
          <li key={camp._id} className="mb-2 flex justify-between items-center">
            <span><b>{camp.title}</b> - {camp.flagReason || 'No reason provided'}</span>
            <button className="bg-blue-600 text-white px-2 py-1 rounded" onClick={() => resolveFlag('campaign', camp._id)}>Resolve</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
