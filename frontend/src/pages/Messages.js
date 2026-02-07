import React, { useEffect, useState } from 'react';
import api from '../services/api';

export default function Messages() {
  const [messages, setMessages] = useState([]);
  useEffect(() => {
    api.get('/messages/ngo').then(r => setMessages(r.data));
  }, []);
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold">Messages</h1>
      <div className="mt-6 space-y-4">
        {messages.map(m => (
          <div key={m.id} className="p-4 bg-white rounded shadow">
            <p><b>From:</b> {m.from?.name} ({m.from?.email})</p>
            <p>{m.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
