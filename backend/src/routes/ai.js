const auth = require('../middleware/auth');
const express = require('express');
const router = express.Router();
const AILog = require('../models/AILog');
const NGO = require('../models/NGO');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const Donation = require('../models/Donation');
const VolunteerOpportunity = require('../models/VolunteerOpportunity');
const VolunteerApplication = require('../models/VolunteerApplication');
const HelpRequest = require('../models/HelpRequest');
const Certificate = require('../models/Certificate');
const Category = require('../models/Category');
const Message = require('../models/Message');
const FlagRequest = require('../models/FlagRequest');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const jwt = require('jsonwebtoken');
const {
  normalizeRole,
  escapeRegExp,
  selectKbEntries,
  normalizeHistory,
  extractQuerySignals,
  analyzeStatsQuery,
  buildFollowUpSuggestions,
  buildPrompt,
  buildFallbackReply
} = require('../utils/supportChat');
const { computeFraudScore, FRAUD_THRESHOLD } = require('../utils/fraudScore');

// Initialize Google Generative AI
let genAI;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "YOUR_API_KEY_HERE") {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} else {
  console.warn("GEMINI_API_KEY not found or is a placeholder. Chatbot will use fallback responses.");
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toPositiveNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const toSafeText = (value, maxLength = 3000) => {
  const text = String(value || '').trim();
  return text.slice(0, maxLength);
};

const toTextArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

const parseDurationDays = (input = {}) => {
  const direct = Number(input.durationDays);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct);

  const startRaw = input.timelineStartDate || input.startDate;
  const endRaw = input.timelineEndDate || input.endDate;
  const start = Date.parse(startRaw || '');
  const end = Date.parse(endRaw || '');
  if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
    return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
  }
  return null;
};

const buildPlatformSnapshot = async () => {
  const [
    ngosTotal,
    ngosVerified,
    campaignsTotal,
    usersTotal,
    adminsTotal,
    donationsTotal,
    donationsCompletedTotal,
    volunteerOpportunitiesTotal,
    volunteerApplicationsTotal,
    helpRequestsTotal,
    certificatesTotal,
    categoriesTotal,
    messagesTotal,
    flagRequestsTotal
  ] = await Promise.all([
    NGO.countDocuments({ isActive: { $ne: false } }),
    NGO.countDocuments({ isActive: { $ne: false }, verified: true }),
    Campaign.countDocuments({}),
    User.countDocuments({ role: 'user' }),
    User.countDocuments({ role: 'admin' }),
    Donation.countDocuments({}),
    Donation.countDocuments({ status: 'completed' }),
    VolunteerOpportunity.countDocuments({}),
    VolunteerApplication.countDocuments({}),
    HelpRequest.countDocuments({}),
    Certificate.countDocuments({}),
    Category.countDocuments({}),
    Message.countDocuments({}),
    FlagRequest.countDocuments({})
  ]);

  const pendingComputed = Math.max(0, Number(ngosTotal || 0) - Number(ngosVerified || 0));

  return {
    asOf: new Date().toISOString(),
    ngosTotal: Number(ngosTotal || 0),
    ngosVerified: Number(ngosVerified || 0),
    ngosPending: pendingComputed,
    campaignsTotal: Number(campaignsTotal || 0),
    usersTotal: Number(usersTotal || 0),
    adminsTotal: Number(adminsTotal || 0),
    donationsTotal: Number(donationsTotal || 0),
    donationsCompletedTotal: Number(donationsCompletedTotal || 0),
    volunteerOpportunitiesTotal: Number(volunteerOpportunitiesTotal || 0),
    volunteerApplicationsTotal: Number(volunteerApplicationsTotal || 0),
    helpRequestsTotal: Number(helpRequestsTotal || 0),
    certificatesTotal: Number(certificatesTotal || 0),
    categoriesTotal: Number(categoriesTotal || 0),
    messagesTotal: Number(messagesTotal || 0),
    flagRequestsTotal: Number(flagRequestsTotal || 0)
  };
};

const average = (values = []) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
};

const median = (values = []) => {
  if (!values.length) return 0;
  const sorted = [...values].map((value) => Number(value || 0)).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
};

const inferCampaignDuration = (campaign = {}) =>
  parseDurationDays({
    durationDays: campaign.durationDays,
    timelineStartDate: campaign.timelineStartDate || campaign.startDate,
    timelineEndDate: campaign.timelineEndDate || campaign.endDate
  });

const buildProposalTemplate = (input = {}) => {
  const type = String(input.type || 'campaign_description').trim().toLowerCase();
  const title = toSafeText(input.title || 'Untitled Initiative', 140);
  const cause = toSafeText(input.cause || 'social impact', 100);
  const location = toSafeText(input.location || 'target communities', 120);
  const targetAudience = toSafeText(input.targetAudience || 'donors and partners', 160);
  const beneficiaries = toSafeText(input.beneficiaries || 'underserved families and youth', 260);
  const timeline = toSafeText(input.timeline || '12-week implementation cycle', 120);
  const goalAmount = toPositiveNumber(input.goalAmount, 0);
  const keyActivities = toTextArray(input.keyActivities);
  const activityText = keyActivities.length ? keyActivities.join(', ') : 'outreach, service delivery, and monitoring';
  const existingContext = toSafeText(input.existingContext, 500);
  const ngoName = toSafeText(input.ngoName || 'our NGO', 120);

  if (type === 'grant_proposal') {
    return [
      `Executive Summary`,
      `${ngoName} proposes "${title}" to address ${cause} challenges in ${location}. The project targets ${beneficiaries} through measurable interventions over ${timeline}.`,
      ``,
      `Problem Statement`,
      `Communities in ${location} continue to face constraints in ${cause}. Existing support remains fragmented, limiting long-term outcomes.`,
      ``,
      `Objectives`,
      `1. Improve service access for ${beneficiaries}.`,
      `2. Deliver structured activities including ${activityText}.`,
      `3. Build local ownership through transparent reporting and stakeholder collaboration.`,
      ``,
      `Implementation Plan`,
      `The program will execute in phased cycles: mobilization, delivery, and monitoring. Weekly checkpoints and milestone reviews will be used to track progress.`,
      ``,
      `Budget Overview`,
      goalAmount > 0
        ? `Requested budget: INR ${goalAmount.toLocaleString('en-IN')}, with allocation across operations, program delivery, and monitoring.`
        : `Budget will be finalized based on donor constraints and baseline assessment.`,
      ``,
      `Monitoring and Evaluation`,
      `Outcome metrics include participation, completion, and beneficiary impact indicators. Findings will be published through periodic progress updates.`,
      existingContext ? `` : '',
      existingContext ? `Additional Context: ${existingContext}` : ''
    ].filter(Boolean).join('\n');
  }

  if (type === 'impact_report') {
    return [
      `Impact Report: ${title}`,
      `Reporting Window: ${timeline}`,
      ``,
      `Program Summary`,
      `${ngoName} implemented activities focused on ${cause} in ${location} for ${beneficiaries}.`,
      ``,
      `Key Activities Delivered`,
      `- ${activityText}`,
      ``,
      `Outcome Snapshot`,
      `- Reach: beneficiary and volunteer participation tracked weekly`,
      `- Delivery quality: milestone adherence and completion levels`,
      `- Transparency: periodic public updates and financial summaries`,
      ``,
      `Financial Utilization`,
      goalAmount > 0
        ? `Total tracked budget envelope: INR ${goalAmount.toLocaleString('en-IN')}.`
        : `Budget utilization captured in internal ledgers and donor update notes.`,
      ``,
      `Next-Phase Recommendations`,
      `Expand high-performing activities, improve local partner coordination, and strengthen data collection for outcome verification.`,
      existingContext ? `` : '',
      existingContext ? `Additional Context: ${existingContext}` : ''
    ].filter(Boolean).join('\n');
  }

  return [
    `Campaign Overview`,
    `"${title}" is a ${cause} campaign in ${location} focused on ${beneficiaries}.`,
    ``,
    `Why This Campaign Matters`,
    `The campaign addresses a high-priority community need by combining resource mobilization with accountable execution.`,
    ``,
    `What We Will Do`,
    `Core activities include ${activityText}.`,
    ``,
    `Funding Need`,
    goalAmount > 0
      ? `Campaign goal: INR ${goalAmount.toLocaleString('en-IN')}.`
      : `Funding requirement will be calibrated from implementation milestones.`,
    ``,
    `Implementation Timeline`,
    `${timeline}.`,
    ``,
    `Call to Action`,
    `Support from ${targetAudience} will directly accelerate impact delivery and sustainability.`,
    existingContext ? `` : '',
    existingContext ? `Additional Context: ${existingContext}` : ''
  ].filter(Boolean).join('\n');
};

const buildCampaignForecast = ({ input = {}, campaigns = [] }) => {
  const goalAmount = toPositiveNumber(input.goalAmount, 0);
  const durationDays = parseDurationDays(input);
  const category = toSafeText(input.category, 80).toLowerCase();
  const location = toSafeText(input.location, 120).toLowerCase();
  const description = toSafeText(input.description, 4000);
  const volunteersNeededCount = toTextArray(input.volunteersNeeded).length;

  const normalized = (campaigns || [])
    .map((campaign) => {
      const goal = toPositiveNumber(campaign.goalAmount, 0);
      const current = toPositiveNumber(campaign.currentAmount, 0);
      const completion = goal > 0 ? clamp(current / goal, 0, 1.5) : 0;
      return {
        category: toSafeText(campaign.category, 80).toLowerCase(),
        location: toSafeText(campaign.location, 120).toLowerCase(),
        goalAmount: goal,
        completionRate: completion,
        durationDays: inferCampaignDuration(campaign)
      };
    })
    .filter((row) => row.goalAmount > 0);

  const globalCompletion = average(normalized.map((row) => row.completionRate)) || 0.42;
  const sameCategoryRows = category ? normalized.filter((row) => row.category === category) : [];
  const sameLocationRows = location ? normalized.filter((row) => row.location.includes(location)) : [];
  const categoryCompletion = sameCategoryRows.length >= 3
    ? average(sameCategoryRows.map((row) => row.completionRate))
    : globalCompletion;
  const locationCompletion = sameLocationRows.length >= 3
    ? average(sameLocationRows.map((row) => row.completionRate))
    : categoryCompletion;

  const medianGoal = median(normalized.map((row) => row.goalAmount)) || Math.max(goalAmount, 50000);
  const goalRatio = goalAmount > 0 && medianGoal > 0 ? goalAmount / medianGoal : 1;
  let goalFeasibility = 0.6;
  if (goalRatio <= 0.75) goalFeasibility = 0.84;
  else if (goalRatio <= 1.2) goalFeasibility = 0.72;
  else if (goalRatio <= 1.8) goalFeasibility = 0.52;
  else goalFeasibility = 0.34;

  let durationFit = 0.62;
  if (durationDays !== null) {
    if (durationDays >= 21 && durationDays <= 90) durationFit = 0.84;
    else if (durationDays >= 14 && durationDays <= 120) durationFit = 0.68;
    else if (durationDays < 14) durationFit = 0.42;
    else durationFit = 0.52;
  }

  const indicatorKeywords = ['beneficiary', 'families', 'students', 'health', 'water', 'livelihood', 'training', 'impact', 'outcome'];
  const keywordHits = indicatorKeywords.filter((keyword) => description.toLowerCase().includes(keyword)).length;
  const descriptionQuality = clamp(
    (description.length > 120 ? 0.35 : 0.12) + (description.length > 320 ? 0.2 : 0) + keywordHits * 0.06,
    0.15,
    0.92
  );

  const volunteerAdjustment = volunteersNeededCount >= 6 ? -0.05 : volunteersNeededCount > 0 ? 0.03 : 0;
  const weighted = clamp(
    categoryCompletion * 0.34 +
      locationCompletion * 0.18 +
      goalFeasibility * 0.22 +
      durationFit * 0.14 +
      descriptionQuality * 0.12 +
      volunteerAdjustment,
    0.18,
    0.95
  );

  const successProbability = Math.round(clamp(weighted * 100, 18, 95));
  const expectedCompletionRatio = clamp(weighted + (categoryCompletion - globalCompletion) * 0.1, 0.2, 1.1);
  const expectedAmount = Math.round(goalAmount * expectedCompletionRatio);

  const sampleSize = sameCategoryRows.length + sameLocationRows.length;
  const volatility = sampleSize >= 20 ? 0.16 : sampleSize >= 8 ? 0.22 : 0.3;
  const low = Math.round(Math.max(0, expectedAmount * (1 - volatility)));
  const high = Math.round(Math.max(expectedAmount, expectedAmount * (1 + volatility)));

  const strengths = [];
  const risks = [];
  const recommendedActions = [];

  if (goalFeasibility >= 0.7) strengths.push('Target goal aligns with historical campaign sizes.');
  else {
    risks.push('Requested goal is high compared to historical campaign medians.');
    recommendedActions.push('Phase the campaign into milestones with intermediate funding targets.');
  }

  if (durationFit >= 0.75) strengths.push('Campaign duration is in a high-performing range.');
  else {
    risks.push('Timeline may be too short or too long for optimal donor conversion.');
    recommendedActions.push('Keep campaign runtime between 3 and 12 weeks where possible.');
  }

  if (descriptionQuality >= 0.65) strengths.push('Campaign narrative includes useful impact context.');
  else {
    risks.push('Campaign description lacks measurable impact details.');
    recommendedActions.push('Add beneficiary counts, delivery milestones, and measurable outcomes.');
  }

  if (locationCompletion >= globalCompletion + 0.08) {
    strengths.push('Location trend indicates stronger historical completion rates.');
  }

  if (volunteersNeededCount >= 6) {
    risks.push('High volunteer dependency may slow execution if coordination is weak.');
    recommendedActions.push('Publish clear role descriptions and stagger volunteer onboarding.');
  }

  const confidence = sampleSize >= 20 ? 'high' : sampleSize >= 8 ? 'medium' : 'low';

  return {
    successProbability,
    confidence,
    predictedRange: {
      low,
      expected: expectedAmount,
      high
    },
    benchmark: {
      sampleSize,
      categorySampleSize: sameCategoryRows.length,
      locationSampleSize: sameLocationRows.length,
      medianGoal: Math.round(medianGoal),
      averageCompletionRate: Number(globalCompletion.toFixed(3))
    },
    strengths,
    risks,
    recommendedActions
  };
};

// Rule-based recommendation: simple scoring
router.post('/recommend-ngos', async (req, res) => {
  try {
    const { userId, location, interests } = req.body;
    const user = userId ? await User.findById(userId) : null;
    const ngos = await NGO.find({ verified: true });
    const scored = ngos.map(n => {
      let score = 0;
      if (location && n.location && typeof n.location === 'string' && n.location.toLowerCase().includes(location.toLowerCase())) score += 3;
      if (user && user.interests) {
        const common = user.interests.filter(i => (n.category || '').toLowerCase().includes(i.toLowerCase()));
        score += common.length * 2;
      }
      // small random to diversify
      score += Math.random();
      return { ngo: n, score };
    });
    scored.sort((a, b) => b.score - a.score);
    await AILog.create({ type: 'recommend', payload: { userId, location, interests }, result: scored.slice(0, 10).map(s => ({ id: s.ngo.id, score: s.score })) });
    res.json(scored.slice(0, 10));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/recommendations', auth(), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user preferences (either from preferences object or fallback to basic fields)
    const userInterests = user.preferences?.interests || user.interests || [];
    const userLocation = user.preferences?.location || user.location || '';
    const userSkills = user.preferences?.skills || user.skills || [];
    const preferredLocations = user.preferences?.preferredLocations || [];
    const causes = user.preferences?.causes || user.preferences?.causesCareAbout || [];
    
    // Get verified NGOs and active campaigns
    const ngos = await NGO.find({ verified: true, isActive: true });
    const campaigns = await Campaign.find().populate('ngo', 'name logo location verified isActive');
    const validCampaigns = campaigns.filter(
      c => c.ngo && c.ngo.id && c.ngo.verified !== false && c.ngo.isActive !== false
    );

    // Scoring and matching for NGOs
    const scoredNgos = ngos.map(ngo => {
      let score = 0;
      let reasons = [];

      // Location matching (highest priority)
      const userLocations = [userLocation, ...preferredLocations].filter(Boolean);
      if (userLocations.length > 0) {
        // Check geographies
        if (ngo.geographies && ngo.geographies.length > 0) {
          userLocations.forEach(loc => {
            if (ngo.geographies.some(g => g.toLowerCase().includes(loc.toLowerCase()))) {
              score += 5;
              reasons.push('Matches your location');
            }
          });
        }
        // Check location field
        if (typeof ngo.location === 'string' && userLocations.some(loc => ngo.location.toLowerCase().includes(loc.toLowerCase()))) {
          score += 4;
          reasons.push('Works in your area');
        }
      }

      // Interest/cause matching
      const allUserInterests = [...new Set([...userInterests, ...causes])];
      if (allUserInterests.length > 0) {
        // Match with primary sectors
        if (ngo.primarySectors && ngo.primarySectors.length > 0) {
          const commonPrimary = allUserInterests.filter(i => 
            ngo.primarySectors.some(s => s.toLowerCase().includes(i.toLowerCase()))
          );
          score += commonPrimary.length * 3;
          commonPrimary.forEach(i => reasons.push(`Focuses on ${i}`));
        }
        // Match with secondary sectors
        if (ngo.secondarySectors && ngo.secondarySectors.length > 0) {
          const commonSecondary = allUserInterests.filter(i => 
            ngo.secondarySectors.some(s => s.toLowerCase().includes(i.toLowerCase()))
          );
          score += commonSecondary.length * 1;
        }
        // Match with category
        if (ngo.category && allUserInterests.some(i => ngo.category.toLowerCase().includes(i.toLowerCase()))) {
          score += 2;
          reasons.push('Aligned with your interests');
        }
      }

      // Skills matching (for volunteering)
      if (userSkills.length > 0) {
        if (ngo.primarySectors) {
          const matchingSkills = userSkills.filter(skill => 
            ngo.primarySectors.some(s => s.toLowerCase().includes(skill.toLowerCase()))
          );
          score += matchingSkills.length * 1.5;
          if (matchingSkills.length > 0) {
            reasons.push('Needs your skills');
          }
        }
      }

      // Verified NGOs get bonus
      if (ngo.verified) {
        score += 2;
      }

      // Add a small random factor to break ties
      score += Math.random() * 0.5;

      return { ngo, score, reasons: [...new Set(reasons)].slice(0, 3) };
    });

    scoredNgos.sort((a, b) => b.score - a.score);
    const recommendedNgos = scoredNgos.slice(0, 10);

    // Scoring and matching for Campaigns
    const scoredCampaigns = validCampaigns.map(campaign => {
      let score = 0;
      let reasons = [];

      // Location matching
      if (userLocation && campaign.location) {
        if (campaign.location.toLowerCase().includes(userLocation.toLowerCase())) {
          score += 5;
          reasons.push('In your location');
        }
      }

      // Category matching
      const allUserInterests = [...new Set([...userInterests, ...causes])];
      if (allUserInterests.length > 0 && campaign.category) {
        if (allUserInterests.some(i => campaign.category.toLowerCase().includes(i.toLowerCase()))) {
          score += 4;
          reasons.push(`In ${campaign.category}`);
        }
      }

      // NGO credibility (based on parent NGO's score)
      const ngoMatch = campaign.ngo
        ? scoredNgos.find(n => n.ngo.id.toString() === campaign.ngo.id.toString())
        : null;
      if (ngoMatch) {
        score += ngoMatch.score * 0.3;
        reasons.push(...ngoMatch.reasons.slice(0, 2));
      }

      // Progress bonus (campaigns closer to goal)
      if (campaign.goalAmount > 0) {
        const progress = campaign.currentAmount / campaign.goalAmount;
        if (progress >= 0.75) {
          score += 2; // Almost funded
          reasons.push('Almost funded');
        } else if (progress >= 0.5) {
          score += 1;
        }
      }

      // Small random factor
      score += Math.random() * 0.5;

      return { campaign, score, reasons: [...new Set(reasons)].slice(0, 3) };
    });

    scoredCampaigns.sort((a, b) => b.score - a.score);
    const recommendedCampaigns = scoredCampaigns.slice(0, 10);

    // Log the recommendation
    await AILog.create({ 
      type: 'recommendations', 
      payload: { 
        userId: user.id,
        preferences: {
          location: userLocation,
          interests: userInterests,
          skills: userSkills
        }
      }, 
      result: { 
        ngoCount: recommendedNgos.length,
        campaignCount: recommendedCampaigns.length
      }
    });

    res.json({
      ngos: recommendedNgos,
      campaigns: recommendedCampaigns
    });
  } catch (err) {
    console.error('Error in /recommendations:', err);
    res.status(500).send('Server Error');
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

// NGO assistant: grant / campaign proposal draft generation
router.post('/proposal-draft', auth(['ngo', 'admin']), async (req, res) => {
  try {
    const allowedTypes = new Set(['campaign_description', 'grant_proposal', 'impact_report']);
    const requestedType = String(req.body?.type || 'campaign_description').trim().toLowerCase();
    const type = allowedTypes.has(requestedType) ? requestedType : 'campaign_description';

    const title = toSafeText(req.body?.title, 160);
    const existingContext = toSafeText(req.body?.existingContext, 2000);
    if (!title && !existingContext) {
      return res.status(400).json({ message: 'Provide at least a title or context to generate a draft.' });
    }

    let ngoName = 'our NGO';
    if (req.user?.role === 'ngo' && req.user?.id) {
      const ngo = await NGO.findById(req.user.id);
      if (ngo?.name) ngoName = ngo.name;
    }

    const input = {
      type,
      ngoName,
      title,
      cause: toSafeText(req.body?.cause, 120),
      targetAudience: toSafeText(req.body?.targetAudience, 180),
      beneficiaries: toSafeText(req.body?.beneficiaries, 280),
      goalAmount: toPositiveNumber(req.body?.goalAmount, 0),
      location: toSafeText(req.body?.location, 160),
      keyActivities: toTextArray(req.body?.keyActivities),
      timeline: toSafeText(req.body?.timeline, 140),
      existingContext
    };

    let draft = buildProposalTemplate(input);
    let mode = 'template';

    if (genAI) {
      try {
        const model = genAI.getGenerativeModel(
          { model: 'gemini-2.5-flash' },
          { apiVersion: 'v1beta' }
        );

        const prompt = `
You are an NGO proposal writing assistant.
Generate a ${type.replace('_', ' ')} in clear professional language.
Keep it practical, evidence-oriented, and suitable for donors/grant reviewers.
Do not include markdown code fences.

Context:
- NGO: ${input.ngoName}
- Initiative title: ${input.title || 'Not provided'}
- Cause: ${input.cause || 'Not provided'}
- Target audience: ${input.targetAudience || 'Not provided'}
- Beneficiaries: ${input.beneficiaries || 'Not provided'}
- Location: ${input.location || 'Not provided'}
- Goal amount: ${input.goalAmount > 0 ? `INR ${input.goalAmount.toLocaleString('en-IN')}` : 'Not provided'}
- Timeline: ${input.timeline || 'Not provided'}
- Activities: ${input.keyActivities.join(', ') || 'Not provided'}
- Existing context: ${input.existingContext || 'Not provided'}

Output requirements:
1) Use section headings.
2) Include measurable outcomes.
3) Keep length between 350 and 650 words.
`.trim();

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const candidateDraft = String(response.text() || '').trim();
        if (candidateDraft) {
          draft = candidateDraft;
          mode = 'gemini';
        }
      } catch (err) {
        mode = 'template';
      }
    }

    await AILog.create({
      type: 'proposal-draft',
      payload: {
        userId: req.user?.id,
        role: req.user?.role,
        input: { ...input, existingContext: input.existingContext.slice(0, 500) }
      },
      result: {
        mode,
        type,
        wordCount: draft.split(/\s+/).filter(Boolean).length
      }
    });

    return res.json({
      mode,
      type,
      draft
    });
  } catch (err) {
    console.error('Error generating proposal draft:', err);
    return res.status(500).json({ message: 'Unable to generate proposal draft right now.' });
  }
});

// Chatbot (LLM-powered)
router.post('/chat', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) {
      return res.json({ reply: 'Please type a message and try again.' });
    }

    const history = normalizeHistory(req.body?.history || []);

    const clientContext = req.body?.clientContext && typeof req.body.clientContext === 'object'
      ? req.body.clientContext
      : null;

    let role = normalizeRole(clientContext?.role);
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        role = normalizeRole(payload?.role);
      } catch (err) {
        // Ignore invalid token for chat; fall back to guest-safe behavior.
        role = role || 'guest';
      }
    }

    const kbEntries = selectKbEntries(message, 4, { history });
    const querySignals = extractQuerySignals({ message, history });
    const statsAnalysis = analyzeStatsQuery({ message, history, querySignals });
    const querySignalsForLog = {
      intentHints: querySignals.intentHints || [],
      locationHints: querySignals.locationHints || [],
      categoryHints: querySignals.categoryHints || [],
      namedEntityHints: querySignals.namedEntityHints || [],
      wantsDirectoryResults: Boolean(querySignals.wantsDirectoryResults),
      asksForCampaigns: Boolean(querySignals.asksForCampaigns),
      asksForNgos: Boolean(querySignals.asksForNgos),
      statsQuery: Boolean(statsAnalysis.isStatsQuery),
      statsTargets: statsAnalysis.targets || [],
      wantsVerified: Boolean(statsAnalysis.wantsVerified),
      wantsPending: Boolean(statsAnalysis.wantsPending),
      wantsCompleted: Boolean(statsAnalysis.wantsCompleted)
    };

    let platformSnapshot = null;
    if (statsAnalysis.isStatsQuery) {
      try {
        platformSnapshot = await buildPlatformSnapshot();
      } catch (snapshotErr) {
        console.error('Failed to build platform snapshot for chatbot:', snapshotErr);
      }
    }

    const buildDbContext = async () => {
      const parts = [];
      const seenRows = new Set();
      const matchedNgos = [];
      const matchedCampaigns = [];

      const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const toDisplayValue = (value, fallback = 'N/A') => {
        if (value === null || value === undefined) return fallback;
        if (typeof value === 'string') {
          const text = cleanText(value);
          return text || fallback;
        }
        if (typeof value === 'number') {
          return Number.isFinite(value) ? String(value) : fallback;
        }
        if (typeof value === 'boolean') {
          return value ? 'Yes' : 'No';
        }
        if (Array.isArray(value)) {
          const partsFromArray = value
            .map((entry) => toDisplayValue(entry, ''))
            .filter(Boolean);
          const uniqueParts = [...new Set(partsFromArray)];
          return uniqueParts.length > 0 ? uniqueParts.join(', ') : fallback;
        }
        if (typeof value === 'object') {
          const locationParts = [
            value.address,
            value.area,
            value.city,
            value.district,
            value.state,
            value.country,
            value.pincode,
            value.postalCode
          ]
            .map((entry) => toDisplayValue(entry, ''))
            .filter(Boolean);
          if (locationParts.length > 0) return [...new Set(locationParts)].join(', ');

          const genericParts = [value.name, value.label, value.title]
            .map((entry) => toDisplayValue(entry, ''))
            .filter(Boolean);
          if (genericParts.length > 0) return genericParts.join(', ');
          return fallback;
        }
        return fallback;
      };

      const markSeen = (prefix, value) => {
        const key = `${prefix}:${String(value || '').trim().toLowerCase()}`;
        if (!key || seenRows.has(key)) return false;
        seenRows.add(key);
        return true;
      };

      const toLooseRegex = (value) => {
        const normalized = String(value || '').trim();
        const escaped = escapeRegExp(normalized);
        if (!escaped || escaped.length < 2) return null;
        return new RegExp(escaped.replace(/\s+/g, '.*'), 'i');
      };

      const addNgoContext = async (label, filter) => {
        const ngos = await NGO.find(filter).limit(20).select('name description category location isActive verified');
        const visible = (ngos || [])
          .filter((ngo) => ngo && ngo.isActive !== false && ngo.verified !== false)
          .slice(0, 6);
        const selected = visible.filter((ngo) => markSeen('ngo', ngo.id || ngo._id || ngo.name));
        const formatted = selected.map((ngo) => `- ${toDisplayValue(ngo.name, 'NGO')}: ${(ngo.description || '').slice(0, 160)} (Category: ${toDisplayValue(ngo.category, 'N/A')}, Location: ${toDisplayValue(ngo.location, 'N/A')})`);
        if (formatted.length === 0) return;
        for (const ngo of selected) {
          matchedNgos.push({
            id: String(ngo.id || ngo._id || ''),
            name: toDisplayValue(ngo.name, 'NGO'),
            category: toDisplayValue(ngo.category, 'N/A'),
            location: toDisplayValue(ngo.location, 'N/A'),
            summary: String((ngo.description || '').slice(0, 140))
          });
        }
        parts.push(`NGOs ${label}:`);
        parts.push(...formatted);
      };

      const addCampaignContext = async (label, filter) => {
        const campaigns = await Campaign.find(filter)
          .populate('ngo', 'name verified isActive')
          .limit(10)
          .select('title description category location goalAmount currentAmount');
        const visible = (campaigns || [])
          .filter((campaign) => campaign && campaign.ngo && campaign.ngo.verified !== false && campaign.ngo.isActive !== false)
          .slice(0, 6);
        const selected = visible
          .filter((campaign) => markSeen('campaign', campaign.id || campaign._id || campaign.title));
        const formatted = selected
          .map((campaign) => {
            const goal = Number(campaign.goalAmount || 0);
            const current = Number(campaign.currentAmount || 0);
            const pct = goal > 0 ? Math.round((current / goal) * 100) : 0;
            return `- ${toDisplayValue(campaign.title, 'Campaign')}: ${toDisplayValue(campaign.category, 'Campaign')} (${toDisplayValue(campaign.location, 'N/A')}) by ${toDisplayValue(campaign.ngo?.name, 'NGO')} | ₹${current} raised${goal ? ` of ₹${goal} (${pct}%)` : ''}`;
          });
        if (formatted.length === 0) return;
        for (const campaign of selected) {
          const goal = Number(campaign.goalAmount || 0);
          const current = Number(campaign.currentAmount || 0);
          matchedCampaigns.push({
            id: String(campaign.id || campaign._id || ''),
            title: toDisplayValue(campaign.title, 'Campaign'),
            category: toDisplayValue(campaign.category, 'Campaign'),
            location: toDisplayValue(campaign.location, 'N/A'),
            ngoName: toDisplayValue(campaign.ngo?.name, 'NGO'),
            raisedAmount: current,
            goalAmount: goal
          });
        }
        parts.push(`Campaigns ${label}:`);
        parts.push(...formatted);
      };

      const locationHints = (querySignals.locationHints || []).slice(0, 2);
      for (const location of locationHints) {
        const rx = toLooseRegex(location);
        if (!rx) continue;
        const ngoLocationFilter = {
          verified: true,
          $or: [
            { location: rx },
            { 'location.address': rx },
            { 'location.area': rx },
            { 'location.city': rx },
            { 'location.district': rx },
            { 'location.state': rx },
            { 'location.country': rx }
          ]
        };
        const campaignLocationFilter = {
          $or: [
            { location: rx },
            { 'location.address': rx },
            { 'location.area': rx },
            { 'location.city': rx },
            { 'location.district': rx },
            { 'location.state': rx },
            { 'location.country': rx }
          ]
        };
        await Promise.all([
          addNgoContext(`in "${location}"`, ngoLocationFilter),
          addCampaignContext(`in "${location}"`, campaignLocationFilter)
        ]);
      }

      const categoryHints = (querySignals.categoryHints || []).slice(0, 2);
      for (const category of categoryHints) {
        const rx = toLooseRegex(category);
        if (!rx) continue;
        await Promise.all([
          addNgoContext(`related to "${category}"`, { verified: true, category: rx }),
          addCampaignContext(`related to "${category}"`, { category: rx })
        ]);
      }

      const namedEntityHints = (querySignals.namedEntityHints || []).slice(0, 2);
      for (const nameHint of namedEntityHints) {
        const rx = toLooseRegex(nameHint);
        if (!rx) continue;
        await Promise.all([
          addNgoContext(`matching "${nameHint}"`, { verified: true, name: rx }),
          addCampaignContext(`matching "${nameHint}"`, { title: rx })
        ]);
      }

      const hasSignalFilters =
        locationHints.length > 0 ||
        categoryHints.length > 0 ||
        namedEntityHints.length > 0;

      const wantsEntitySuggestions =
        querySignals.wantsDirectoryResults ||
        (querySignals.asksForNgos && /\b(which|what|show|list|find|recommend|suggest|best|top)\b/i.test(querySignals.normalizedText || '')) ||
        (querySignals.asksForCampaigns && /\b(which|what|show|list|find|recommend|suggest|best|top)\b/i.test(querySignals.normalizedText || ''));

      if (!hasSignalFilters && wantsEntitySuggestions) {
        await Promise.all([
          addNgoContext('you can explore now', { verified: true }),
          addCampaignContext('you can explore now', {})
        ]);
      }

      if (platformSnapshot && statsAnalysis.isStatsQuery) {
        parts.push('Platform snapshot stats:');
        parts.push(`- NGOs: ${platformSnapshot.ngosTotal} total, ${platformSnapshot.ngosVerified} verified, ${platformSnapshot.ngosPending} pending verification`);
        parts.push(`- Campaigns: ${platformSnapshot.campaignsTotal}`);
        parts.push(`- Users: ${platformSnapshot.usersTotal}, Admins: ${platformSnapshot.adminsTotal}`);
        parts.push(`- Donations: ${platformSnapshot.donationsTotal} total, ${platformSnapshot.donationsCompletedTotal} completed`);
        parts.push(`- Volunteering: ${platformSnapshot.volunteerOpportunitiesTotal} opportunities, ${platformSnapshot.volunteerApplicationsTotal} applications`);
        parts.push(`- Support requests: ${platformSnapshot.helpRequestsTotal}`);
        parts.push(`- Certificates: ${platformSnapshot.certificatesTotal}`);
        parts.push(`- Categories: ${platformSnapshot.categoriesTotal}`);
        parts.push(`- Messages: ${platformSnapshot.messagesTotal}`);
        parts.push(`- Flag requests: ${platformSnapshot.flagRequestsTotal}`);
      }

      const contextCards = [];
      if (platformSnapshot && statsAnalysis.isStatsQuery) {
        contextCards.push({
          type: 'stats',
          title: 'Live Platform Snapshot',
          items: [
            { label: 'NGOs', value: platformSnapshot.ngosTotal },
            { label: 'Verified NGOs', value: platformSnapshot.ngosVerified },
            { label: 'Campaigns', value: platformSnapshot.campaignsTotal },
            { label: 'Completed Donations', value: platformSnapshot.donationsCompletedTotal },
            { label: 'Volunteer Applications', value: platformSnapshot.volunteerApplicationsTotal },
            { label: 'Support Requests', value: platformSnapshot.helpRequestsTotal }
          ]
        });
      }
      if (matchedNgos.length > 0) {
        contextCards.push({
          type: 'ngos',
          title: `Matched NGOs (${matchedNgos.length})`,
          rows: matchedNgos.slice(0, 4)
        });
      }
      if (matchedCampaigns.length > 0) {
        contextCards.push({
          type: 'campaigns',
          title: `Matched Campaigns (${matchedCampaigns.length})`,
          rows: matchedCampaigns.slice(0, 4)
        });
      }

      return {
        text: parts.join('\n'),
        contextCards
      };
    };

    // --- Basic RAG (Retrieval-Augmented Generation) ---
    const dbContextPayload = await buildDbContext();
    const dbContext = dbContextPayload.text;
    const contextCards = Array.isArray(dbContextPayload.contextCards) ? dbContextPayload.contextCards : [];
    const followUps = buildFollowUpSuggestions({
      role,
      message,
      querySignals,
      statsAnalysis,
      platformSnapshot
    });
    const responseMeta = {
      followUps,
      contextCards,
      role,
      intentHints: querySignalsForLog.intentHints,
      locationHints: querySignalsForLog.locationHints,
      categoryHints: querySignalsForLog.categoryHints,
      modePolicy: 'auto'
    };

    if (!genAI) {
      const reply = buildFallbackReply({
        message,
        role,
        kbEntries,
        history,
        querySignals,
        platformSnapshot,
        dbContext
      });
      await AILog.create({
        type: 'chat',
        payload: { message, role, historyCount: history.length, querySignals: querySignalsForLog },
        result: { reply, mode: 'fallback', followUps, contextCards }
      });
      return res.json({ reply, mode: 'fallback', meta: responseMeta });
    }

    const model = genAI.getGenerativeModel(
      { model: 'gemini-2.5-flash' },
      { apiVersion: 'v1beta' }
    );

    const prompt = buildPrompt({
      message,
      role,
      kbEntries,
      dbContext,
      history,
      clientContext,
      querySignals
    });

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const reply = response.text();

      await AILog.create({
        type: 'chat',
        payload: { message, role, historyCount: history.length, querySignals: querySignalsForLog },
        result: { reply, mode: 'gemini', followUps, contextCards }
      });
      return res.json({ reply, mode: 'gemini', meta: responseMeta });
    } catch (llmErr) {
      const reply = buildFallbackReply({
        message,
        role,
        kbEntries,
        history,
        querySignals,
        platformSnapshot,
        dbContext
      });
      await AILog.create({
        type: 'chat',
        payload: { message, role, historyCount: history.length, querySignals: querySignalsForLog },
        result: { reply, mode: 'fallback-after-error', followUps, contextCards }
      });
      return res.json({ reply, mode: 'fallback', meta: responseMeta });
    }

  } catch (err) {
    console.error("Chatbot API error:", err);
    res.json({ reply: 'Sorry, I ran into an issue. Please try again.' });
  }
});

// Fraud scoring
router.post('/fraud-score', async (req, res) => {
  try {
    const ngoId = String(req.body?.ngoId || '').trim();
    if (!ngoId) {
      return res.status(400).json({ message: 'ngoId is required' });
    }

    const ngo = await NGO.findById(ngoId);
    if (!ngo) return res.status(404).json({ message: 'NGO not found' });

    const campaigns = await Campaign.find({ ngo: ngo.id });
    const { score, flagged, checks } = computeFraudScore({ ngo, campaigns });

    await AILog.create({ type: 'fraud', payload: { ngoId }, result: { score, flagged } });
    res.json({ score, flagged, threshold: FRAUD_THRESHOLD, checks });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Predictive fundraising analytics
router.post('/campaign-forecast', auth(['ngo', 'admin']), async (req, res) => {
  try {
    const goalAmount = toPositiveNumber(req.body?.goalAmount, 0);
    if (goalAmount <= 0) {
      return res.status(400).json({ message: 'goalAmount must be greater than 0.' });
    }

    const allCampaigns = await Campaign.find();
    const forecast = buildCampaignForecast({
      input: {
        title: req.body?.title,
        description: req.body?.description,
        category: req.body?.category,
        location: req.body?.location,
        goalAmount,
        durationDays: req.body?.durationDays,
        startDate: req.body?.startDate,
        endDate: req.body?.endDate,
        timelineStartDate: req.body?.timelineStartDate,
        timelineEndDate: req.body?.timelineEndDate,
        volunteersNeeded: req.body?.volunteersNeeded
      },
      campaigns: allCampaigns
    });

    await AILog.create({
      type: 'campaign-forecast',
      payload: {
        userId: req.user?.id,
        role: req.user?.role,
        category: toSafeText(req.body?.category, 80),
        location: toSafeText(req.body?.location, 120),
        goalAmount,
        durationDays: parseDurationDays(req.body || {})
      },
      result: forecast
    });

    return res.json(forecast);
  } catch (err) {
    console.error('Error in /campaign-forecast:', err);
    return res.status(500).json({ message: 'Unable to generate campaign forecast right now.' });
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
    await AILog.create({ type: 'match', payload: { campaignId }, result: scored.slice(0, 10).map(s => ({ id: s.user.id, score: s.score })) });
    res.json(scored.slice(0, 10));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
