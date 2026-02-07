const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const NGO = require('../models/NGO');
const auth = require('../middleware/auth');

const MAX_MESSAGE_LENGTH = 2000;

const cleanBody = (value) => String(value || '').trim();
const sameId = (left, right) => String(left || '') === String(right || '');
const createdAtValue = (message) => {
  const parsed = Date.parse(message?.createdAt || message?.updatedAt || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const buildThreadKey = (userId, ngoId) => `user:${String(userId)}|ngo:${String(ngoId)}`;

const normalizeMessageDoc = (doc = {}) => {
  const normalized = { ...(doc || {}) };
  normalized.fromUser = normalized.fromUser || normalized.from || null;
  normalized.fromNGO = normalized.fromNGO || null;
  normalized.toUser = normalized.toUser || null;
  normalized.toNGO = normalized.toNGO || null;
  normalized.read = Boolean(normalized.read);

  if (!normalized.threadKey) {
    const userId = normalized.fromUser || normalized.toUser;
    const ngoId = normalized.fromNGO || normalized.toNGO;
    if (userId && ngoId) {
      normalized.threadKey = buildThreadKey(userId, ngoId);
    }
  }

  return normalized;
};

const toPlainDoc = (entity) => {
  if (!entity) return null;
  if (typeof entity.toObject === 'function') return entity.toObject();
  return { ...entity };
};

const loadAllMessages = async () => {
  const docs = await Message.find({}).sort({ createdAt: 1 });
  return docs.map((doc) => normalizeMessageDoc(toPlainDoc(doc)));
};

const getConversationCounterpart = (message, viewerRole, viewerId) => {
  if (viewerRole === 'user') {
    if (sameId(message.fromUser, viewerId) && message.toNGO) {
      return { role: 'ngo', id: String(message.toNGO) };
    }
    if (sameId(message.toUser, viewerId) && message.fromNGO) {
      return { role: 'ngo', id: String(message.fromNGO) };
    }
    return null;
  }

  if (viewerRole === 'ngo') {
    if (sameId(message.toNGO, viewerId) && message.fromUser) {
      return { role: 'user', id: String(message.fromUser) };
    }
    if (sameId(message.fromNGO, viewerId) && message.toUser) {
      return { role: 'user', id: String(message.toUser) };
    }
    return null;
  }

  return null;
};

const collectParticipantIds = (messages = []) => {
  const userIds = new Set();
  const ngoIds = new Set();

  for (const message of messages) {
    if (message.fromUser) userIds.add(String(message.fromUser));
    if (message.toUser) userIds.add(String(message.toUser));
    if (message.fromNGO) ngoIds.add(String(message.fromNGO));
    if (message.toNGO) ngoIds.add(String(message.toNGO));
  }

  return {
    userIds: Array.from(userIds),
    ngoIds: Array.from(ngoIds)
  };
};

const loadParticipants = async (messages = []) => {
  const { userIds, ngoIds } = collectParticipantIds(messages);

  const [users, ngos] = await Promise.all([
    Promise.all(userIds.map((id) => User.findById(id).select('name email mobileNumber'))),
    Promise.all(ngoIds.map((id) => NGO.findById(id).select('name email verified logo')))
  ]);

  const userMap = new Map();
  const ngoMap = new Map();

  userIds.forEach((id, index) => {
    const user = users[index];
    if (user) {
      userMap.set(String(id), {
        id: user.id,
        role: 'user',
        name: user.name,
        email: user.email,
        mobileNumber: user.mobileNumber
      });
    }
  });

  ngoIds.forEach((id, index) => {
    const ngo = ngos[index];
    if (ngo) {
      ngoMap.set(String(id), {
        id: ngo.id,
        role: 'ngo',
        name: ngo.name,
        email: ngo.email,
        verified: ngo.verified,
        logo: ngo.logo
      });
    }
  });

  return { userMap, ngoMap };
};

const hydrateMessage = (message, participants) => {
  const { userMap, ngoMap } = participants;
  const senderRole = message.fromNGO ? 'ngo' : 'user';
  const recipientRole = message.toNGO ? 'ngo' : 'user';

  const senderId = senderRole === 'ngo' ? String(message.fromNGO || '') : String(message.fromUser || '');
  const recipientId = recipientRole === 'ngo' ? String(message.toNGO || '') : String(message.toUser || '');

  return {
    ...message,
    senderRole,
    recipientRole,
    sender: senderRole === 'ngo' ? ngoMap.get(senderId) || null : userMap.get(senderId) || null,
    recipient: recipientRole === 'ngo' ? ngoMap.get(recipientId) || null : userMap.get(recipientId) || null
  };
};

const findThreadMessages = (messages, viewerRole, viewerId, counterpartId) => {
  if (viewerRole === 'user') {
    return messages.filter((message) => (
      (sameId(message.fromUser, viewerId) && sameId(message.toNGO, counterpartId)) ||
      (sameId(message.toUser, viewerId) && sameId(message.fromNGO, counterpartId))
    ));
  }

  if (viewerRole === 'ngo') {
    return messages.filter((message) => (
      (sameId(message.toNGO, viewerId) && sameId(message.fromUser, counterpartId)) ||
      (sameId(message.fromNGO, viewerId) && sameId(message.toUser, counterpartId))
    ));
  }

  return [];
};

const markMessagesRead = async (messages = [], viewerRole, viewerId) => {
  const unread = messages.filter((message) => {
    if (message.read) return false;
    if (viewerRole === 'user') {
      return sameId(message.toUser, viewerId) && Boolean(message.fromNGO);
    }
    if (viewerRole === 'ngo') {
      return sameId(message.toNGO, viewerId) && Boolean(message.fromUser);
    }
    return false;
  });

  if (unread.length === 0) return 0;

  for (const message of unread) {
    const messageDoc = await Message.findById(message.id);
    if (!messageDoc || messageDoc.read) continue;
    messageDoc.read = true;
    await messageDoc.save();
  }

  return unread.length;
};

const validateMessageBody = (value) => {
  const body = cleanBody(value);
  if (!body) {
    const error = new Error('Message body is required.');
    error.status = 400;
    throw error;
  }
  if (body.length > MAX_MESSAGE_LENGTH) {
    const error = new Error(`Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`);
    error.status = 400;
    throw error;
  }
  return body;
};

const ensureUserExists = async (userId) => {
  const user = await User.findById(userId).select('name email');
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }
  return user;
};

const ensureNgoExists = async (ngoId) => {
  const ngo = await NGO.findById(ngoId).select('name email verified isActive');
  if (!ngo || ngo.isActive === false) {
    const error = new Error('NGO not found.');
    error.status = 404;
    throw error;
  }
  return ngo;
};

// Send message to a specific NGO (user only)
router.post('/to-ngo/:ngoId', auth(['user']), async (req, res) => {
  try {
    const body = validateMessageBody(req.body?.body);
    const ngo = await ensureNgoExists(req.params.ngoId);

    const message = await Message.create({
      fromUser: req.user.id,
      toNGO: ngo.id,
      body,
      read: false,
      threadKey: buildThreadKey(req.user.id, ngo.id)
    });

    res.status(201).json({
      message: 'Message sent successfully.',
      data: message
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

// Broadcast a message to all active NGOs (user only)
router.post('/to-all-ngos', auth(['user']), async (req, res) => {
  try {
    const body = validateMessageBody(req.body?.body);

    const ngos = (await NGO.find({})).filter((ngo) => ngo.isActive !== false);
    if (ngos.length === 0) {
      return res.status(404).json({ message: 'No active NGOs available.' });
    }

    const payloads = ngos.map((ngo) => ({
      fromUser: req.user.id,
      toNGO: ngo.id,
      body,
      read: false,
      threadKey: buildThreadKey(req.user.id, ngo.id)
    }));

    await Message.insertMany(payloads);

    res.status(201).json({
      message: `Message sent to ${payloads.length} NGOs.`,
      deliveredCount: payloads.length
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

// Reply to a specific user (NGO only)
router.post('/to-user/:userId', auth(['ngo']), async (req, res) => {
  try {
    const body = validateMessageBody(req.body?.body);
    const user = await ensureUserExists(req.params.userId);

    const message = await Message.create({
      fromNGO: req.user.id,
      toUser: user.id,
      body,
      read: false,
      threadKey: buildThreadKey(user.id, req.user.id)
    });

    res.status(201).json({
      message: 'Reply sent successfully.',
      data: message
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

// Conversation list with unread counts
router.get('/conversations', auth(['user', 'ngo']), async (req, res) => {
  try {
    const viewerRole = req.user.role;
    const viewerId = req.user.id;
    const allMessages = await loadAllMessages();

    const relevant = allMessages.filter((message) => {
      if (viewerRole === 'user') {
        return sameId(message.fromUser, viewerId) || sameId(message.toUser, viewerId);
      }
      if (viewerRole === 'ngo') {
        return sameId(message.toNGO, viewerId) || sameId(message.fromNGO, viewerId);
      }
      return false;
    });

    const participants = await loadParticipants(relevant);
    const conversations = new Map();

    for (const message of relevant) {
      const counterpart = getConversationCounterpart(message, viewerRole, viewerId);
      if (!counterpart) continue;

      const key = `${counterpart.role}:${counterpart.id}`;
      const existing = conversations.get(key);
      const unreadForViewer = viewerRole === 'user'
        ? (sameId(message.toUser, viewerId) && !message.read)
        : (sameId(message.toNGO, viewerId) && !message.read);

      if (!existing) {
        conversations.set(key, {
          counterpartRole: counterpart.role,
          counterpartId: counterpart.id,
          counterpart: counterpart.role === 'ngo'
            ? participants.ngoMap.get(counterpart.id) || null
            : participants.userMap.get(counterpart.id) || null,
          unreadCount: unreadForViewer ? 1 : 0,
          lastMessage: {
            id: message.id,
            body: message.body,
            createdAt: message.createdAt,
            senderRole: message.fromNGO ? 'ngo' : 'user'
          }
        });
        continue;
      }

      if (unreadForViewer) {
        existing.unreadCount += 1;
      }

      if (createdAtValue(message) >= createdAtValue(existing.lastMessage)) {
        existing.lastMessage = {
          id: message.id,
          body: message.body,
          createdAt: message.createdAt,
          senderRole: message.fromNGO ? 'ngo' : 'user'
        };
      }
    }

    const payload = Array.from(conversations.values())
      .sort((left, right) => createdAtValue(right.lastMessage) - createdAtValue(left.lastMessage));

    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Fetch full thread with a specific counterpart and mark incoming as read
router.get('/thread/:counterpartId', auth(['user', 'ngo']), async (req, res) => {
  try {
    const viewerRole = req.user.role;
    const viewerId = req.user.id;
    const counterpartId = req.params.counterpartId;

    if (viewerRole === 'user') {
      await ensureNgoExists(counterpartId);
    } else {
      await ensureUserExists(counterpartId);
    }

    const allMessages = await loadAllMessages();
    const thread = findThreadMessages(allMessages, viewerRole, viewerId, counterpartId)
      .sort((left, right) => createdAtValue(left) - createdAtValue(right));

    await markMessagesRead(thread, viewerRole, viewerId);

    const refreshed = await loadAllMessages();
    const refreshedThread = findThreadMessages(refreshed, viewerRole, viewerId, counterpartId)
      .sort((left, right) => createdAtValue(left) - createdAtValue(right));

    const participants = await loadParticipants(refreshedThread);
    const hydrated = refreshedThread.map((message) => hydrateMessage(message, participants));

    res.json({
      counterpartRole: viewerRole === 'user' ? 'ngo' : 'user',
      counterpartId,
      messages: hydrated
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

// Explicit read endpoint for a conversation
router.post('/thread/:counterpartId/read', auth(['user', 'ngo']), async (req, res) => {
  try {
    const viewerRole = req.user.role;
    const viewerId = req.user.id;
    const counterpartId = req.params.counterpartId;

    const allMessages = await loadAllMessages();
    const thread = findThreadMessages(allMessages, viewerRole, viewerId, counterpartId);
    const updatedCount = await markMessagesRead(thread, viewerRole, viewerId);

    res.json({ message: 'Thread marked as read.', updatedCount });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

// Legacy NGO inbox endpoint (kept for compatibility)
router.get('/ngo', auth(['ngo']), async (req, res) => {
  try {
    const allMessages = await loadAllMessages();
    const incoming = allMessages
      .filter((message) => sameId(message.toNGO, req.user.id))
      .sort((left, right) => createdAtValue(right) - createdAtValue(left));
    const participants = await loadParticipants(incoming);
    const hydrated = incoming.map((message) => hydrateMessage(message, participants));
    res.json(hydrated);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
