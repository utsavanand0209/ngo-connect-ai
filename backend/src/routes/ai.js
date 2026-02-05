const express = require('express');
const router = express.Router();
const AILog = require('../models/AILog');
const NGO = require('../models/NGO');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Google Generative AI
let genAI;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "YOUR_API_KEY_HERE") {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} else {
  console.warn("GEMINI_API_KEY not found or is a placeholder. Chatbot will use fallback responses.");
}

// Rule-based recommendation: simple scoring
router.post('/recommend-ngos', async (req, res) => {
  try {
    const { userId, location, interests } = req.body;
    const user = userId ? await User.findById(userId) : null;
    const ngos = await NGO.find({ verified: true });
    const scored = ngos.map(n => {
      let score = 0;
      if (location && n.location && n.location.toLowerCase().includes(location.toLowerCase())) score += 3;
      if (user && user.interests) {
        const common = user.interests.filter(i => (n.category || '').toLowerCase().includes(i.toLowerCase()));
        score += common.length * 2;
      }
      // small random to diversify
      score += Math.random();
      return { ngo: n, score };
    });
    scored.sort((a, b) => b.score - a.score);
    await AILog.create({ type: 'recommend', payload: { userId, location, interests }, result: scored.slice(0, 10).map(s => ({ id: s.ngo._id, score: s.score })) });
    res.json(scored.slice(0, 10));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Simple NLP classification using keywords
router.post('/classify-campaign', async (req, res) => {
  try {
    const { description } = req.body;
    const text = (description || '').toLowerCase();
    let category = 'Other';
    if (text.match(/school|education|teach|students/)) category = 'Education';
    else if (text.match(/health|hospital|clinic|doctor/)) category = 'Health';
    else if (text.match(/food|hunger|meals|feed/)) category = 'Food';
    else if (text.match(/disaster|flood|earthquake/)) category = 'Disaster Relief';
    else if (text.match(/environment|plant|tree|clean/)) category = 'Environment';
    await AILog.create({ type: 'classify', payload: { description }, result: { category } });
    res.json({ category });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Chatbot (LLM-powered)
router.post('/chat', async (req, res) => {
  if (!genAI) {
    return res.status(500).json({ 
      reply: "The chatbot is not configured. Please provide a valid GEMINI_API_KEY in the backend's .env file." 
    });
  }

  try {
    const { message } = req.body;
    const m = (message || '').toLowerCase();
    
        const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash" 
    }, { apiVersion: 'v1beta' });

    // --- Basic RAG (Retrieval-Augmented Generation) ---
    let context = "";
    // 1. Check for location-based queries
    if (m.includes(' in ')) {
      const parts = m.split(' in ');
      const potentialLocation = parts[parts.length - 1].replace('?', '').trim();
      const ngos = await NGO.find({ 
        verified: true,
        location: new RegExp(potentialLocation, 'i') 
      }).limit(5).select('name description category');
      
      if (ngos.length > 0) {
        context += `\n\nHere is some data from the database about NGOs in "${potentialLocation}":\n`;
        context += ngos.map(n => `- ${n.name}: ${n.description} (Category: ${n.category})`).join('\n');
      }
    }
    // 2. Check for category-based queries
    else if (m.includes(' for ') || m.includes(' about ')) {
      const parts = m.split(/ for | about /);
      const potentialCategory = parts[parts.length - 1].replace('?', '').trim();
      const ngos = await NGO.find({ 
        verified: true,
        category: new RegExp(potentialCategory, 'i') 
      }).limit(5).select('name description category');
      
      if (ngos.length > 0) {
        context += `\n\nHere is some data from the database about NGOs related to "${potentialCategory}":\n`;
        context += ngos.map(n => `- ${n.name}: ${n.description} (Category: ${n.category})`).join('\n');
      }
    }

    const prompt = `
      You are "NGO Connect Bot", a friendly and helpful AI assistant for the NGO Connect web platform.
      Your goal is to guide users, answer their questions about the platform, and help them find NGOs and campaigns.
      
      Platform Features:
      - Users can register as a regular user or as an NGO.
      - NGOs must be verified by an admin before they can create campaigns. They do this by uploading documents through their profile.
      - Users can browse a list of verified NGOs and active campaigns (for fundraising or volunteering).
      - Users can donate to campaigns or sign up to volunteer.
      - Users can find NGOs based on their category (e.g., education, health) and location.

      Instructions:
      - Be conversational and encouraging.
      - If you are asked to recommend NGOs, use the data provided in the context below.
      - If no specific data is provided in the context, you can answer general questions about the platform, but do NOT invent NGO names or details. Instead, guide the user on how to search for them on the platform (e.g., "You can browse all NGOs on the NGOs page!").
      - Keep your answers concise and to the point.
      
      ${context ? `CONTEXT FROM DATABASE:\n${context}` : ''}

      USER'S QUESTION: "${message}"

      YOUR RESPONSE:
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const reply = response.text();

    await AILog.create({ type: 'chat', payload: { message }, result: { reply } });
    res.json({ reply });

  } catch (err) {
    console.error("Chatbot API error:", err);
    res.status(500).json({ reply: 'Sorry, I am having trouble connecting to my brain right now. Please try again later.' });
  }
});

// Fraud scoring
router.post('/fraud-score', async (req, res) => {
  try {
    const { ngoId } = req.body;
    const ngo = await NGO.findById(ngoId);
    if (!ngo) return res.status(404).json({ message: 'NGO not found' });
    let score = 0;
    if (!ngo.verificationDocs || ngo.verificationDocs.length === 0) score += 40;
    const ageDays = (Date.now() - new Date(ngo.createdAt).getTime()) / (1000 * 3600 * 24);
    if (ageDays < 30) score += 20;
    if ((ngo.description || '').toLowerCase().match(/urgent|donate now|click here/)) score += 30;
    // mock high donation goal detection via campaigns
    const campaigns = await Campaign.find({ ngo: ngo._id });
    const highGoal = campaigns.some(c => (c.goalAmount || 0) >= 100000);
    if (highGoal) score += 20;
    const flagged = score >= 50;
    await AILog.create({ type: 'fraud', payload: { ngoId }, result: { score, flagged } });
    res.json({ score, flagged });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Volunteer matching
router.post('/match-volunteers', async (req, res) => {
  try {
    const { campaignId } = req.body;
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
    const users = await User.find();
    const scored = users.map(u => {
      let score = 0;
      if (u.location && campaign.location && u.location.toLowerCase().includes(campaign.location.toLowerCase())) score += 3;
      if (u.skills && campaign.volunteersNeeded) {
        const common = u.skills.filter(s => campaign.volunteersNeeded.includes(s));
        score += common.length * 2;
      }
      if (u.availability) score += 1;
      return { user: u, score };
    });
    scored.sort((a, b) => b.score - a.score);
    await AILog.create({ type: 'match', payload: { campaignId }, result: scored.slice(0, 10).map(s => ({ id: s.user._id, score: s.score })) });
    res.json(scored.slice(0, 10));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
