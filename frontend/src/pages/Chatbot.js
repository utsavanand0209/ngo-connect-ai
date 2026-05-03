import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { getUserRole } from '../utils/auth';
import { PaperAirplaneIcon } from '@heroicons/react/solid';
import { SparklesIcon } from '@heroicons/react/outline';

const ROLE_DEFAULT_QUESTIONS = {
  guest: [
    'What can I do on this platform without login?',
    'How do I register as User or NGO?',
    'How can I browse NGOs and campaigns?'
  ],
  user: [
    'How do I donate to a campaign and get a receipt?',
    'Why is my certificate not available yet?',
    'How can I message an NGO from the platform?',
    'How do volunteer opportunities and certificates work?'
  ],
  ngo: [
    'How do I manage NGO profile and campaigns?',
    'How do I approve donation certificate requests?',
    'How do I review volunteer certificate approvals?'
  ],
  admin: [
    'How do NGO verification workflows work?',
    'How do I review flag requests?',
    'How do I monitor webhook worker status?'
  ]
};

const getDefaultQuestions = (role) => ROLE_DEFAULT_QUESTIONS[role] || ROLE_DEFAULT_QUESTIONS.guest;

const getWelcomeText = (role) => {
  if (role === 'admin') {
    return "Welcome! I'm NGO Connect Bot.\n\nI can help with admin workflows: verifications, moderation, analytics, webhooks, and support-request monitoring.";
  }
  if (role === 'ngo') {
    return "Welcome! I'm NGO Connect Bot.\n\nI can help you manage NGO profile, campaigns, approvals, support requests, and innovation tools.";
  }
  if (role === 'user') {
    return "Welcome! I'm NGO Connect Bot.\n\nAsk me anything about donations, volunteering, certificates, support requests, messages, and innovation features.";
  }
  return "Welcome! I'm NGO Connect Bot.\n\nAsk me anything about NGO Connect features and role workflows.";
};

const BotAvatar = () => (
  <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white">
    <SparklesIcon className="w-6 h-6" />
  </div>
);

const UserAvatar = () => (
  <div className="w-10 h-10 rounded-full bg-gray-300"></div>
);

const formatCompactNumber = (value) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return String(value || '0');
  return n.toLocaleString('en-IN');
};

const ContextCard = ({ card }) => {
  if (!card) return null;

  if (card.type === 'stats' && Array.isArray(card.items)) {
    return (
      <div className="mt-3 rounded-xl border border-indigo-200 bg-white/80 p-3">
        <p className="text-xs font-semibold text-indigo-700 mb-2">{card.title || 'Live Stats'}</p>
        <div className="grid grid-cols-2 gap-2">
          {card.items.slice(0, 6).map((item) => (
            <div key={`${item.label}-${item.value}`} className="rounded-lg bg-indigo-50 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-indigo-500">{item.label}</p>
              <p className="text-xs font-semibold text-indigo-900">{formatCompactNumber(item.value)}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if ((card.type === 'ngos' || card.type === 'campaigns') && Array.isArray(card.rows)) {
    return (
      <div className="mt-3 rounded-xl border border-indigo-200 bg-white/80 p-3">
        <p className="text-xs font-semibold text-indigo-700 mb-2">{card.title || 'Matched Results'}</p>
        <div className="space-y-2">
          {card.rows.slice(0, 4).map((row, idx) => (
            <div key={`${row.id || row.title || row.name || idx}`} className="rounded-lg bg-indigo-50 px-2 py-1.5">
              <p className="text-xs font-semibold text-indigo-900">
                {row.name || row.title || 'Item'}
              </p>
              {card.type === 'ngos' ? (
                <p className="text-[11px] text-indigo-700">
                  {row.category || 'N/A'} • {row.location || 'N/A'}
                </p>
              ) : (
                <p className="text-[11px] text-indigo-700">
                  {row.category || 'Campaign'} • {row.location || 'N/A'} • {row.ngoName || 'NGO'}
                </p>
              )}
              {card.type === 'campaigns' && (
                <p className="text-[11px] text-indigo-800">
                  ₹{formatCompactNumber(row.raisedAmount)} raised
                  {Number(row.goalAmount || 0) > 0 ? ` / ₹${formatCompactNumber(row.goalAmount)}` : ''}
                </p>
              )}
              {card.type === 'ngos' && row.summary && (
                <p className="text-[11px] text-indigo-800 line-clamp-2">{row.summary}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

export default function Chatbot() {
  const role = getUserRole() || 'guest';
  const [messages, setMessages] = useState([
    { from: 'bot', text: getWelcomeText(role), mode: 'system' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState(getDefaultQuestions(role));
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const sendMessage = async (rawMessage) => {
    const outgoing = String(rawMessage || '').trim();
    if (!outgoing || loading) return;

    const userMessage = { from: 'user', text: outgoing };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const history = messages
        .slice(-12)
        .map((m) => ({
          role: m.from === 'bot' ? 'assistant' : 'user',
          content: m.text
        }));

      const res = await api.post('/ai/chat', {
        message: outgoing,
        history,
        clientContext: {
          role,
          path: window.location.pathname
        }
      });
      const botMessage = {
        from: 'bot',
        text: res.data.reply,
        mode: res.data?.mode || null,
        cards: Array.isArray(res.data?.meta?.contextCards) ? res.data.meta.contextCards : []
      };
      setMessages(prev => [...prev, botMessage]);

      const followUps = Array.isArray(res.data?.meta?.followUps)
        ? res.data.meta.followUps.filter(Boolean)
        : [];
      if (followUps.length > 0) {
        setSuggestedQuestions(followUps.slice(0, 5));
      } else {
        setSuggestedQuestions(getDefaultQuestions(role));
      }
    } catch (err) {
      const errorMessage = { from: 'bot', text: 'Sorry, I encountered an error. Please try again.' };
      setMessages(prev => [...prev, errorMessage]);
      setSuggestedQuestions(getDefaultQuestions(role));
    } finally {
      setLoading(false);
    }
  };

  const send = async e => {
    e.preventDefault();
    if (!input.trim()) return;
    await sendMessage(input);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-3xl mx-auto bg-white shadow-xl rounded-lg overflow-hidden">
      <div className="bg-indigo-600 text-white p-4 flex items-center shadow-md">
        <BotAvatar />
        <div className="ml-4">
          <h2 className="text-xl font-bold">NGO Connect Bot</h2>
          <p className="text-sm opacity-80">Your platform assistant {role !== 'guest' ? `(${role})` : ''}</p>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6 overflow-y-auto bg-gray-50">
        <div className="flex flex-wrap gap-2">
          {suggestedQuestions.map((q) => (
            <button
              key={q}
              type="button"
              disabled={loading}
              onClick={() => sendMessage(q)}
              className="text-xs px-3 py-1.5 rounded-full border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
            >
              {q}
            </button>
          ))}
        </div>

        {messages.map((m, i) => (
          <div key={i} className={`flex items-end gap-3 animate-fade-in-up ${m.from === 'bot' ? '' : 'flex-row-reverse'}`}>
            {m.from === 'bot' ? <BotAvatar /> : <UserAvatar />}
            <div className={`max-w-md p-4 rounded-2xl ${m.from === 'bot' ? 'bg-indigo-100 text-gray-800 rounded-bl-none' : 'bg-blue-500 text-white rounded-br-none'}`}>
              <p className="text-sm whitespace-pre-wrap">{m.text}</p>
              {m.from === 'bot' && Array.isArray(m.cards) && m.cards.length > 0 && (
                <div>
                  {m.cards.map((card, idx) => (
                    <ContextCard key={`${card.type || 'card'}-${idx}`} card={card} />
                  ))}
                </div>
              )}
              {m.from === 'bot' && m.mode && m.mode !== 'system' && (
                <p className="text-[10px] mt-2 opacity-70 uppercase tracking-wide">{m.mode}</p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-end gap-3">
            <BotAvatar />
            <div className="max-w-md p-4 rounded-2xl bg-indigo-100 text-gray-800 rounded-bl-none">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse delay-75"></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse delay-150"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={send} className="p-4 border-t bg-white">
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
            className="flex-1 p-3 border rounded-full focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
            placeholder="Type your message..."
          />
          <button
            type="submit"
            disabled={loading}
            className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 disabled:bg-gray-400 transition transform hover:scale-110"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <PaperAirplaneIcon className="w-6 h-6 transform rotate-45" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// Add this to your tailwind.config.js or a global CSS file
/*
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 0.5s ease-out forwards;
}
*/
