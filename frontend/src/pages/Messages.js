import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getMessageConversations,
  getMessageThread,
  getNgos,
  sendMessageToAllNgos,
  sendMessageToNgo,
  sendMessageToUser
} from '../services/api';

const parseToken = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (err) {
    return null;
  }
};

const fmt = (value) => {
  const parsed = Date.parse(value || '');
  if (Number.isNaN(parsed)) return 'N/A';
  return new Date(parsed).toLocaleString();
};

export default function Messages() {
  const [searchParams] = useSearchParams();
  const tokenPayload = parseToken();
  const role = tokenPayload?.role;
  const preferredNgoId = searchParams.get('ngo') || '';

  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadMessages, setThreadMessages] = useState([]);
  const [selectedCounterpartId, setSelectedCounterpartId] = useState('');

  const [ngos, setNgos] = useState([]);
  const [selectedNgoId, setSelectedNgoId] = useState('');
  const [sendMode, setSendMode] = useState('specific');

  const [composeBody, setComposeBody] = useState('');
  const [messageInfo, setMessageInfo] = useState('');
  const [messageError, setMessageError] = useState('');
  const [sending, setSending] = useState(false);

  const selectedConversation = useMemo(
    () => conversations.find((item) => String(item.counterpartId) === String(selectedCounterpartId)) || null,
    [conversations, selectedCounterpartId]
  );

  const loadConversations = async (preferredCounterpartId = '') => {
    setConversationsLoading(true);
    setMessageError('');
    try {
      const res = await getMessageConversations();
      const rows = res.data || [];
      setConversations(rows);

      const preferred = preferredCounterpartId && rows.find((item) => String(item.counterpartId) === String(preferredCounterpartId));
      if (preferred) {
        setSelectedCounterpartId(String(preferred.counterpartId));
      } else if (rows.length > 0 && !selectedCounterpartId) {
        setSelectedCounterpartId(String(rows[0].counterpartId));
      } else if (rows.length === 0) {
        setSelectedCounterpartId('');
        setThreadMessages([]);
      }
    } catch (err) {
      setConversations([]);
      setMessageError('Unable to load conversations right now.');
    } finally {
      setConversationsLoading(false);
    }
  };

  const loadThread = async (counterpartId) => {
    if (!counterpartId) {
      setThreadMessages([]);
      return;
    }
    setThreadLoading(true);
    setMessageError('');
    try {
      const res = await getMessageThread(counterpartId);
      setThreadMessages(res.data?.messages || []);
    } catch (err) {
      setThreadMessages([]);
      setMessageError(err.response?.data?.message || 'Unable to load this conversation.');
    } finally {
      setThreadLoading(false);
    }
  };

  useEffect(() => {
    if (!role) return;
    loadConversations();
  }, [role]);

  useEffect(() => {
    if (role !== 'user') return;
    getNgos()
      .then((res) => {
        const rows = res.data || [];
        setNgos(rows);
        if (preferredNgoId && rows.some((ngo) => String(ngo.id) === String(preferredNgoId))) {
          setSelectedNgoId(String(preferredNgoId));
          setSelectedCounterpartId(String(preferredNgoId));
          return;
        }
        if (rows.length > 0 && !selectedNgoId) {
          setSelectedNgoId(String(rows[0].id));
        }
      })
      .catch(() => {
        setNgos([]);
      });
  }, [role, preferredNgoId, selectedNgoId]);

  useEffect(() => {
    if (!selectedCounterpartId) return;
    loadThread(selectedCounterpartId);
  }, [selectedCounterpartId]);

  const submitMessage = async (e) => {
    e.preventDefault();
    const body = String(composeBody || '').trim();
    if (!body) {
      setMessageError('Please type a message.');
      return;
    }

    setSending(true);
    setMessageError('');
    setMessageInfo('');

    try {
      if (role === 'user') {
        if (sendMode === 'broadcast') {
          const res = await sendMessageToAllNgos(body);
          setMessageInfo(res.data?.message || 'Message sent to all NGOs.');
          setComposeBody('');
          await loadConversations(selectedCounterpartId);
          return;
        }

        const ngoId = selectedNgoId || selectedCounterpartId;
        if (!ngoId) {
          setMessageError('Please select an NGO.');
          return;
        }

        await sendMessageToNgo(ngoId, body);
        setMessageInfo('Message sent successfully.');
        setComposeBody('');
        setSelectedCounterpartId(String(ngoId));
        await loadConversations(String(ngoId));
        await loadThread(String(ngoId));
        return;
      }

      if (role === 'ngo') {
        if (!selectedCounterpartId) {
          setMessageError('Select a user conversation first.');
          return;
        }

        await sendMessageToUser(selectedCounterpartId, body);
        setMessageInfo('Reply sent successfully.');
        setComposeBody('');
        await loadConversations(selectedCounterpartId);
        await loadThread(selectedCounterpartId);
        return;
      }

      setMessageError('Messaging is available only for users and NGOs.');
    } catch (err) {
      setMessageError(err.response?.data?.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  if (!role) {
    return <div className="max-w-3xl mx-auto p-6 text-gray-600">Please login to access messages.</div>;
  }

  if (!['user', 'ngo'].includes(role)) {
    return <div className="max-w-3xl mx-auto p-6 text-gray-600">Messaging is enabled for user and NGO accounts.</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
      <p className="text-gray-600 mt-1">
        {role === 'user'
          ? 'Send messages to specific NGOs or broadcast updates to all NGOs.'
          : 'Reply to user conversations and track unread messages.'}
      </p>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="bg-white border border-gray-200 rounded-xl p-4 lg:col-span-1">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Conversations</h2>
          {conversationsLoading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-gray-500">No conversations yet.</p>
          ) : (
            <div className="space-y-2">
              {conversations.map((item) => {
                const active = String(item.counterpartId) === String(selectedCounterpartId);
                return (
                  <button
                    key={`${item.counterpartRole}-${item.counterpartId}`}
                    type="button"
                    onClick={() => {
                      setSelectedCounterpartId(String(item.counterpartId));
                      if (role === 'user') setSelectedNgoId(String(item.counterpartId));
                    }}
                    className={`w-full text-left border rounded-lg px-3 py-2 transition ${active ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{item.counterpart?.name || 'Unknown'}</p>
                        <p className="text-xs text-gray-500 truncate">{item.lastMessage?.body || 'No message preview'}</p>
                      </div>
                      {Number(item.unreadCount || 0) > 0 && (
                        <span className="inline-flex items-center justify-center min-w-6 h-6 text-xs px-2 rounded-full bg-red-100 text-red-700">
                          {item.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">{fmt(item.lastMessage?.createdAt)}</p>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="bg-white border border-gray-200 rounded-xl p-4 lg:col-span-2">
          <div className="border-b border-gray-100 pb-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {selectedConversation?.counterpart?.name || (role === 'user' ? 'New Message' : 'Select a conversation')}
            </h2>
            <p className="text-sm text-gray-500">
              {selectedConversation?.counterpart?.email || (role === 'user' ? 'Choose NGO and send your message below.' : 'Open a conversation to reply.')}
            </p>
          </div>

          <div className="h-96 overflow-y-auto border border-gray-100 rounded-lg p-3 bg-gray-50">
            {threadLoading ? (
              <p className="text-sm text-gray-500">Loading conversation...</p>
            ) : threadMessages.length === 0 ? (
              <p className="text-sm text-gray-500">No messages in this conversation yet.</p>
            ) : (
              <div className="space-y-3">
                {threadMessages.map((message) => {
                  const mine = role === 'user' ? message.senderRole === 'user' : message.senderRole === 'ngo';
                  return (
                    <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 ${mine ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-900'}`}>
                        <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                        <p className={`text-[11px] mt-1 ${mine ? 'text-indigo-100' : 'text-gray-500'}`}>
                          {fmt(message.createdAt)} {!mine && message.read ? '• Read' : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <form onSubmit={submitMessage} className="mt-4 space-y-3">
            {role === 'user' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select
                  value={sendMode}
                  onChange={(e) => setSendMode(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="specific">Message Specific NGO</option>
                  <option value="broadcast">Message All NGOs</option>
                </select>

                <select
                  value={selectedNgoId}
                  onChange={(e) => {
                    setSelectedNgoId(e.target.value);
                    setSelectedCounterpartId(e.target.value);
                  }}
                  disabled={sendMode === 'broadcast'}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm md:col-span-2 disabled:bg-gray-100"
                >
                  {ngos.length === 0 ? (
                    <option value="">No NGOs available</option>
                  ) : (
                    ngos.map((ngo) => (
                      <option key={ngo.id} value={ngo.id}>{ngo.name}</option>
                    ))
                  )}
                </select>
              </div>
            )}

            <textarea
              rows={3}
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
              placeholder={role === 'user' ? 'Type your message for NGO support...' : 'Type your reply to the user...'}
              className="w-full border border-gray-300 rounded-md p-3 text-sm"
            />

            {messageInfo && <p className="text-sm text-emerald-700">{messageInfo}</p>}
            {messageError && <p className="text-sm text-red-600">{messageError}</p>}

            <button
              type="submit"
              disabled={sending}
              className="px-4 py-2 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:bg-indigo-300"
            >
              {sending ? 'Sending...' : (role === 'ngo' ? 'Send Reply' : 'Send Message')}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
