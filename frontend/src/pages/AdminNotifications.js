import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function AdminNotifications() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('all');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    api.get('/admin/notifications')
      .then(res => {
        if (!isMounted) return;
        setNotifications(res.data || []);
      })
      .catch(() => {
        if (!isMounted) return;
        setStatus('Failed to load notifications.');
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });
    return () => { isMounted = false; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !message) {
      setStatus('Title and message are required.');
      return;
    }
    setSending(true);
    setStatus('');
    try {
      const res = await api.post('/admin/notifications', { title, message, audience });
      setNotifications(prev => [res.data, ...prev]);
      setTitle('');
      setMessage('');
      setAudience('all');
      setStatus('Notification sent.');
    } catch (err) {
      setStatus('Failed to send notification.');
    }
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Admin Notifications</h1>
        <p className="text-gray-600 mb-6">
          Send announcements and updates to users and NGOs.
        </p>
        {status && <div className="bg-purple-50 border border-purple-200 text-purple-800 rounded-md p-3 mb-4">{status}</div>}
        <form onSubmit={handleSubmit} className="space-y-4 mb-8">
          <div>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="Announcement title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
              rows={4}
              placeholder="Write your message"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Audience</label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="all">All</option>
              <option value="users">Users</option>
              <option value="ngos">NGOs</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={sending}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-purple-300"
          >
            {sending ? 'Sending...' : 'Send Notification'}
          </button>
        </form>

        <h2 className="text-lg font-semibold mb-3">Recent Notifications</h2>
        {loading ? (
          <div className="text-gray-600">Loading notifications...</div>
        ) : (
          <div className="space-y-3">
            {notifications.length === 0 && <div className="text-gray-500">No notifications sent yet.</div>}
            {notifications.map(note => (
              <div key={note.id} className="border rounded-md p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-800">{note.title}</p>
                  <span className="text-xs text-gray-500">{new Date(note.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-sm text-gray-700 mt-1">{note.message}</p>
                <p className="text-xs text-gray-500 mt-2">Audience: {note.audience}</p>
              </div>
            ))}
          </div>
        )}
        <Link to="/admin" className="text-indigo-600 hover:underline">Back to Admin Dashboard</Link>
      </div>
    </div>
  );
}
