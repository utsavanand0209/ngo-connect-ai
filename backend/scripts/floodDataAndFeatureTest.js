#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');

const DEFAULT_API_BASE = 'http://localhost:5001/api';
const API_BASE = String(process.env.API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');

const ADMIN_EMAIL = process.env.FLOOD_ADMIN_EMAIL || process.env.SMOKE_ADMIN_EMAIL || 'admin@ngoconnect.org';
const ADMIN_PASSWORD = process.env.FLOOD_ADMIN_PASSWORD || process.env.SMOKE_ADMIN_PASSWORD || 'password123';
const DEFAULT_PASSWORD = process.env.FLOOD_DEFAULT_PASSWORD || 'password123';

const USER_COUNT = Math.max(Number(process.env.FLOOD_USER_COUNT) || 10, 3);
const NGO_COUNT = Math.max(Number(process.env.FLOOD_NGO_COUNT) || 4, 3);
const CAMPAIGNS_PER_NGO = Math.max(Number(process.env.FLOOD_CAMPAIGNS_PER_NGO) || 3, 1);
const OPPORTUNITIES_PER_NGO = Math.max(Number(process.env.FLOOD_OPPORTUNITIES_PER_NGO) || 2, 1);
const WISHLIST_ITEMS_PER_NGO = Math.max(Number(process.env.FLOOD_WISHLIST_ITEMS_PER_NGO) || 2, 1);
const SHIFTS_PER_NGO = Math.max(Number(process.env.FLOOD_SHIFTS_PER_NGO) || 2, 1);
const MEMBERS_PER_ROLE = Math.max(Number(process.env.FLOOD_MEMBERS_PER_ROLE) || 2, 1);

const ROLE_BUCKETS = [
  'Volunteer Network',
  'Field Operations',
  'Program Management',
  'Partnerships & Fundraising',
  'Leadership & Governance',
  'Finance & Compliance'
];

const rootDir = path.resolve(__dirname, '..', '..');
const reportDir = path.join(rootDir, 'docs', 'test-reports');

const slugNow = () => new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);

const toApiUrl = (routePath) => {
  const cleaned = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return `${API_BASE}${cleaned}`;
};

const formatPreview = (value) => {
  if (value == null) return '';
  if (typeof value === 'string') return value.slice(0, 500);
  try {
    return JSON.stringify(value).slice(0, 800);
  } catch (err) {
    return String(value).slice(0, 500);
  }
};

const requestJson = async (method, routePath, { token, body, expectedStatus } = {}) => {
  const headers = { Accept: 'application/json' };
  let payload;

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(toApiUrl(routePath), {
    method,
    headers,
    body: payload
  });

  const contentType = String(res.headers.get('content-type') || '');
  const text = await res.text();
  const data = contentType.includes('application/json')
    ? (text ? JSON.parse(text) : null)
    : text;

  const allowed = expectedStatus === undefined
    ? null
    : Array.isArray(expectedStatus)
      ? expectedStatus
      : [expectedStatus];

  if (allowed && !allowed.includes(res.status)) {
    const error = new Error(`${method} ${routePath} -> ${res.status} (expected ${allowed.join(' or ')})`);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  if (!allowed && !res.ok) {
    const error = new Error(`${method} ${routePath} -> ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return {
    status: res.status,
    data,
    headers: res.headers
  };
};

const buildPaymentDetails = (method, index) => {
  if (method === 'upi') {
    return { upiId: `flood${index}@okaxis` };
  }
  if (method === 'card') {
    return {
      cardNumber: '4111111111111111',
      cardHolderName: `Flood User ${index}`,
      expiry: '12/30',
      cvv: '123',
      cardBrand: 'Visa'
    };
  }
  return {
    netbankingBank: 'HDFC Bank'
  };
};

const pick = (list, index) => {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[index % list.length];
};

const distinct = (list) => [...new Set((list || []).filter(Boolean))];

const writeReport = async (runId, report) => {
  await fs.mkdir(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, `flood_feature_report_${runId}.json`);
  const mdPath = path.join(reportDir, `flood_feature_report_${runId}.md`);

  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = [
    '# Flood Data + Feature Test Report',
    '',
    `- Run ID: \`${runId}\``,
    `- Timestamp: \`${report.timestamp}\``,
    `- API Base: \`${report.apiBase}\``,
    '',
    '## Config',
    `- Users requested: ${report.config.userCount}`,
    `- NGOs requested: ${report.config.ngoCount}`,
    `- Campaigns per NGO: ${report.config.campaignsPerNgo}`,
    `- Opportunities per NGO: ${report.config.opportunitiesPerNgo}`,
    `- Wishlist items per NGO: ${report.config.wishlistItemsPerNgo}`,
    `- Shifts per NGO: ${report.config.shiftsPerNgo}`,
    `- Members per role: ${report.config.membersPerRole}`,
    '',
    '## Created Counts',
    `- Users: ${report.counts.users}`,
    `- NGOs: ${report.counts.ngos}`,
    `- Verified NGOs: ${report.counts.verifiedNgos}`,
    `- Rejected NGOs: ${report.counts.rejectedNgos}`,
    `- Campaigns: ${report.counts.campaigns}`,
    `- NGO Members: ${report.counts.members}`,
    `- Opportunities: ${report.counts.opportunities}`,
    `- Wishlists: ${report.counts.wishlistItems}`,
    `- Pledges: ${report.counts.pledges}`,
    `- Shifts: ${report.counts.shifts}`,
    `- Shift signups: ${report.counts.shiftSignups}`,
    `- Volunteer logs: ${report.counts.volunteerLogs}`,
    `- Donations: ${report.counts.donations}`,
    `- Giving circles: ${report.counts.givingCircles}`,
    `- Help requests: ${report.counts.helpRequests}`,
    `- Endorsements: ${report.counts.endorsements}`,
    `- Admin announcements: ${report.counts.announcements}`,
    '',
    '## Execution Summary',
    `- Steps total: ${report.execution.totalSteps}`,
    `- Steps passed: ${report.execution.passedSteps}`,
    `- Steps failed: ${report.execution.failedSteps}`,
    '',
    '## Failures',
    ...(report.failures.length === 0
      ? ['- None']
      : report.failures.map((item, idx) => (
        `- ${idx + 1}. ${item.name} :: ${item.message}${item.status ? ` (status ${item.status})` : ''}`
      )))
  ];

  await fs.writeFile(mdPath, `${lines.join('\n')}\n`, 'utf8');
  return { jsonPath, mdPath };
};

const main = async () => {
  const runId = slugNow();
  const start = Date.now();

  const report = {
    runId,
    timestamp: new Date().toISOString(),
    apiBase: API_BASE,
    config: {
      userCount: USER_COUNT,
      ngoCount: NGO_COUNT,
      campaignsPerNgo: CAMPAIGNS_PER_NGO,
      opportunitiesPerNgo: OPPORTUNITIES_PER_NGO,
      wishlistItemsPerNgo: WISHLIST_ITEMS_PER_NGO,
      shiftsPerNgo: SHIFTS_PER_NGO,
      membersPerRole: MEMBERS_PER_ROLE
    },
    counts: {
      users: 0,
      ngos: 0,
      verifiedNgos: 0,
      rejectedNgos: 0,
      campaigns: 0,
      members: 0,
      opportunities: 0,
      wishlistItems: 0,
      pledges: 0,
      shifts: 0,
      shiftSignups: 0,
      volunteerLogs: 0,
      donations: 0,
      givingCircles: 0,
      helpRequests: 0,
      endorsements: 0,
      announcements: 0
    },
    execution: {
      totalSteps: 0,
      passedSteps: 0,
      failedSteps: 0,
      durationMs: 0
    },
    testedFeatures: {},
    failures: []
  };

  const state = {
    users: [],
    ngos: [],
    verifiedNgos: [],
    rejectedNgos: [],
    campaigns: [],
    campaignsByNgo: new Map(),
    opportunities: [],
    opportunitiesByNgo: new Map(),
    wishlistItems: [],
    shifts: [],
    shiftSignups: [],
    volunteerLogs: [],
    donations: [],
    donationByUser: new Map(),
    volunteerApplications: [],
    campaignVolunteerRegistrations: [],
    helpRequests: [],
    pledges: [],
    circles: [],
    endorsements: []
  };

  const markFeature = (key) => {
    report.testedFeatures[key] = true;
  };

  const step = async (name, fn, options = {}) => {
    const { required = false } = options;
    report.execution.totalSteps += 1;
    process.stdout.write(`- ${name}... `);
    const started = Date.now();
    try {
      const result = await fn();
      report.execution.passedSteps += 1;
      process.stdout.write(`OK (${Date.now() - started}ms)\n`);
      return result;
    } catch (err) {
      report.execution.failedSteps += 1;
      process.stdout.write(`FAILED (${Date.now() - started}ms)\n`);
      const failure = {
        name,
        message: err.message,
        status: err.status || null,
        responsePreview: formatPreview(err.data)
      };
      report.failures.push(failure);
      if (required) throw err;
      return null;
    }
  };

  console.log(`API_BASE=${API_BASE}`);
  console.log(`Run ID=${runId}`);

  const adminLogin = await step('Login as admin', () => requestJson('POST', '/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    expectedStatus: 200
  }), { required: true });
  const adminToken = adminLogin.data?.token;
  if (!adminToken) throw new Error('Admin token not found.');

  const categoriesRes = await step('Load categories', () => requestJson('GET', '/categories/all', {
    expectedStatus: 200
  }), { required: true });

  const categoryNamesRaw = Array.isArray(categoriesRes.data)
    ? categoriesRes.data.map((entry) => (typeof entry === 'string' ? entry : entry?.name)).filter(Boolean)
    : [];
  const categoryNames = categoryNamesRaw.length > 0
    ? categoryNamesRaw
    : ['Food', 'Education', 'Healthcare', 'Environment', 'Animal Welfare'];

  for (let index = 1; index <= USER_COUNT; index += 1) {
    const email = `flood.user.${runId}.${index}@example.com`;
    const userPayload = {
      name: `Flood User ${index} ${runId}`,
      email,
      password: DEFAULT_PASSWORD,
      role: 'user',
      mobileNumber: String(9000000000 + index)
    };

    const reg = await step(`Register user ${index}`, () => requestJson('POST', '/auth/register', {
      body: userPayload,
      expectedStatus: 201
    }), { required: true });

    const login = await step(`Login user ${index}`, () => requestJson('POST', '/auth/login', {
      body: { email: userPayload.email, password: userPayload.password },
      expectedStatus: 200
    }), { required: true });

    state.users.push({
      id: reg.data?.userId,
      name: userPayload.name,
      email: userPayload.email,
      password: userPayload.password,
      mobileNumber: userPayload.mobileNumber,
      token: login.data?.token
    });
  }
  report.counts.users = state.users.length;

  for (let index = 1; index <= NGO_COUNT; index += 1) {
    const email = `flood.ngo.${runId}.${index}@example.com`;
    const categories = distinct([
      pick(categoryNames, index - 1),
      pick(categoryNames, index)
    ]);

    const ngoPayload = {
      name: `Flood NGO ${index} ${runId}`,
      email,
      password: DEFAULT_PASSWORD,
      role: 'ngo',
      registrationId: `FLOOD-${runId}-${index}`,
      helplineNumber: String(8000000000 + index),
      categories,
      addressDetails: {
        houseNumber: `${index}/12`,
        landmark: `Sector ${index}`,
        district: 'Bengaluru Urban',
        state: 'Karnataka',
        pincode: '560001'
      }
    };

    const reg = await step(`Register NGO ${index}`, () => requestJson('POST', '/auth/register', {
      body: ngoPayload,
      expectedStatus: 201
    }), { required: true });

    state.ngos.push({
      id: reg.data?.ngoId,
      name: ngoPayload.name,
      email: ngoPayload.email,
      password: ngoPayload.password,
      categories: ngoPayload.categories,
      index
    });
  }
  report.counts.ngos = state.ngos.length;

  await step('Load pending NGO registrations before moderation', () => requestJson('GET', '/admin/ngo-registrations', {
    token: adminToken,
    expectedStatus: 200
  }));

  const verifyCount = Math.max(NGO_COUNT - 1, 1);
  for (let i = 0; i < state.ngos.length; i += 1) {
    const ngo = state.ngos[i];
    if (!ngo?.id) continue;

    if (i < verifyCount) {
      const verified = await step(`Verify NGO ${ngo.id}`, () => requestJson('POST', `/admin/verify-ngo/${ngo.id}`, {
        token: adminToken,
        expectedStatus: 200
      }));
      if (verified) {
        state.verifiedNgos.push(ngo);
      }
    } else {
      const rejected = await step(`Reject NGO ${ngo.id}`, () => requestJson('POST', `/admin/reject-ngo/${ngo.id}`, {
        token: adminToken,
        expectedStatus: 200
      }));
      if (rejected) {
        state.rejectedNgos.push(ngo);
      }
    }
  }
  report.counts.verifiedNgos = state.verifiedNgos.length;
  report.counts.rejectedNgos = state.rejectedNgos.length;

  await step('Load pending NGO registrations after moderation', () => requestJson('GET', '/admin/ngo-registrations', {
    token: adminToken,
    expectedStatus: 200
  }));

  for (const ngo of state.verifiedNgos) {
    const login = await step(`Login verified NGO ${ngo.email}`, () => requestJson('POST', '/auth/login', {
      body: { email: ngo.email, password: ngo.password },
      expectedStatus: 200
    }), { required: true });
    ngo.token = login.data?.token;
  }

  const now = Date.now();
  const campaignSeedTexts = ['nutrition', 'hygiene', 'school-support', 'elder-care', 'green-drive'];

  for (const ngo of state.verifiedNgos) {
    const ngoCampaigns = [];

    for (let index = 1; index <= CAMPAIGNS_PER_NGO; index += 1) {
      const startDate = new Date(now - (1000 * 60 * 60 * 24 * (index + 3))).toISOString();
      const endDate = new Date(now + (1000 * 60 * 60 * 24 * (index + 75))).toISOString();
      const title = `Flood Campaign ${ngo.index}.${index} ${runId}`;

      const campaignBody = {
        title,
        description: `Large-scale ${pick(campaignSeedTexts, index)} initiative created for end-to-end testing (${runId}).`,
        goalAmount: 100000 + (index * 25000),
        currentAmount: 0,
        category: pick(ngo.categories, 0) || pick(categoryNames, index),
        location: 'Bengaluru',
        startDate,
        endDate,
        image: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1200',
        volunteersNeeded: ['Field Visit', 'Data Collection', 'Community Outreach'],
        beneficiaryStats: {
          familiesSupported: 0,
          volunteersEngaged: 0
        },
        tags: ['flood-test', runId]
      };

      const created = await step(`Create campaign ${ngo.index}.${index}`, () => requestJson('POST', '/campaigns', {
        token: ngo.token,
        body: campaignBody,
        expectedStatus: 200
      }));

      if (!created?.data?.id) continue;
      const campaign = {
        ...created.data,
        ngoId: ngo.id,
        ngoIndex: ngo.index
      };
      ngoCampaigns.push(campaign);
      state.campaigns.push(campaign);
      markFeature('campaign_creation');

      await step(`Post campaign update ${campaign.id}`, () => requestJson('POST', `/campaigns/${campaign.id}/updates`, {
        token: ngo.token,
        body: {
          headline: `Operational update ${runId}`,
          message: `Distribution checkpoints are live for campaign ${campaign.title}. Volunteers and supply partners are aligned for this sprint.`,
          impactSummary: `Reached ${45 + index * 9} beneficiaries in phase ${index}.`
        },
        expectedStatus: 200
      }));
      markFeature('campaign_updates');
    }

    state.campaignsByNgo.set(ngo.id, ngoCampaigns);

    for (const role of ROLE_BUCKETS) {
      for (let memberIndex = 1; memberIndex <= MEMBERS_PER_ROLE; memberIndex += 1) {
        const targetCampaign = pick(ngoCampaigns, memberIndex - 1);
        const memberPayload = {
          name: `${role} Member ${memberIndex} (${runId})`,
          role,
          tasksCompleted: 15 + memberIndex,
          contributions: `${role} stream delivery and reporting`,
          badges: memberIndex % 2 === 0 ? ['Campaign Contributor'] : ['Community Champion'],
          tasks: ['Strategic Planning', 'Field Coordination', 'Impact Follow-up'],
          campaignAssignments: targetCampaign ? [
            {
              campaignId: targetCampaign.id,
              campaignTitle: targetCampaign.title,
              task: 'Milestone Tracking',
              contribution: 'Contributed to milestone planning and execution.'
            }
          ] : [],
          joinedAt: new Date(now - (memberIndex * 86400000)).toISOString()
        };

        const created = await step(`Add NGO member (${ngo.index}/${role}/${memberIndex})`, () => requestJson('POST', '/ngos/me/members', {
          token: ngo.token,
          body: memberPayload,
          expectedStatus: 201
        }));

        if (created?.data?.member?.id) {
          state.members = state.members || [];
          state.members.push({
            id: created.data.member.id,
            ngoId: ngo.id,
            role
          });
          markFeature('ngo_members');
        }
      }
    }

    await step(`Fetch NGO members snapshot (${ngo.index})`, () => requestJson('GET', '/ngos/me/members', {
      token: ngo.token,
      expectedStatus: 200
    }));

    const ngoOpportunities = [];
    for (let index = 1; index <= OPPORTUNITIES_PER_NGO; index += 1) {
      const body = {
        title: `Flood Volunteer Opportunity ${ngo.index}.${index} ${runId}`,
        description: `Hands-on volunteering track ${index} for NGO ${ngo.index}.`,
        location: 'Bengaluru',
        skillsRequired: ['Logistics', 'Community Outreach', 'Data Entry'],
        timeCommitmentHours: index % 2 === 0 ? 6 : 3,
        isMicroVolunteer: index % 2 !== 0,
        spots: 30
      };
      const created = await step(`Create volunteer opportunity ${ngo.index}.${index}`, () => requestJson('POST', '/volunteering', {
        token: ngo.token,
        body,
        expectedStatus: 200
      }));

      if (created?.data?.id) {
        const opportunity = { ...created.data, ngoId: ngo.id };
        ngoOpportunities.push(opportunity);
        state.opportunities.push(opportunity);
        markFeature('volunteer_opportunities');
      }
    }
    state.opportunitiesByNgo.set(ngo.id, ngoOpportunities);

    for (let index = 1; index <= WISHLIST_ITEMS_PER_NGO; index += 1) {
      const targetCampaign = pick(ngoCampaigns, index - 1);
      const created = await step(`Create wishlist item ${ngo.index}.${index}`, () => requestJson('POST', '/innovation/wishlists/items', {
        token: ngo.token,
        body: {
          campaignId: targetCampaign?.id || '',
          itemName: `Flood Item ${ngo.index}.${index}`,
          description: `Critical in-kind need ${index} for field operations (${runId}).`,
          unit: 'kits',
          quantityNeeded: 20 + (index * 10),
          priority: index % 2 === 0 ? 'medium' : 'high',
          emergency: index === 1
        },
        expectedStatus: 201
      }));

      if (created?.data?.id) {
        state.wishlistItems.push({
          ...created.data,
          ngoId: ngo.id,
          campaignId: targetCampaign?.id || null
        });
        markFeature('wishlist_items');
      }
    }

    for (let index = 1; index <= SHIFTS_PER_NGO; index += 1) {
      const targetCampaign = pick(ngoCampaigns, index - 1);
      const targetOpportunity = pick(ngoOpportunities, index - 1);
      const startAt = new Date(now + (index * 36 * 60 * 60 * 1000));
      const endAt = new Date(startAt.getTime() + (2 * 60 * 60 * 1000));

      const created = await step(`Create shift ${ngo.index}.${index}`, () => requestJson('POST', '/innovation/volunteer/shifts', {
        token: ngo.token,
        body: {
          title: `Flood Shift ${ngo.index}.${index} ${runId}`,
          opportunityId: targetOpportunity?.id || '',
          campaignId: targetCampaign?.id || '',
          location: 'Zone A, Bengaluru',
          note: 'Field team coordination and beneficiary onboarding.',
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          slots: 8,
          reminderBeforeHours: 24,
          emergency: index === 1
        },
        expectedStatus: 201
      }));

      if (created?.data?.id) {
        state.shifts.push({
          ...created.data,
          ngoId: ngo.id
        });
        markFeature('volunteer_shifts');
      }
    }

    const firstCampaign = pick(ngoCampaigns, 0);
    if (firstCampaign?.id) {
      await step(`Create impact update for NGO ${ngo.index}`, () => requestJson('POST', '/innovation/impact-updates', {
        token: ngo.token,
        body: {
          campaignId: firstCampaign.id,
          title: `Impact milestone for NGO ${ngo.index}`,
          details: `Operational teams completed this milestone with measurable outcomes across food and outreach streams.`,
          amountUtilized: 28000,
          beneficiariesReached: 180,
          evidence: [`https://example.org/flood/${runId}/ngo-${ngo.index}/impact`]
        },
        expectedStatus: 201
      }));
      markFeature('impact_updates');

      await step(`Mark campaign emergency ${firstCampaign.id}`, () => requestJson('POST', `/innovation/emergency/campaigns/${firstCampaign.id}`, {
        token: ngo.token,
        body: {
          emergency: true,
          emergencyNote: `Urgent surge request (${runId})`
        },
        expectedStatus: 200
      }));
      markFeature('emergency_campaigns');
    }

    const firstOpportunity = pick(ngoOpportunities, 0);
    if (firstOpportunity?.id) {
      await step(`Mark opportunity emergency ${firstOpportunity.id}`, () => requestJson('POST', `/innovation/emergency/opportunities/${firstOpportunity.id}`, {
        token: ngo.token,
        body: {
          emergency: true,
          emergencyNote: `Emergency volunteer mobilization (${runId})`
        },
        expectedStatus: 200
      }));
      markFeature('emergency_opportunities');
    }
  }

  report.counts.campaigns = state.campaigns.length;
  report.counts.members = (state.members || []).length;
  report.counts.opportunities = state.opportunities.length;
  report.counts.wishlistItems = state.wishlistItems.length;
  report.counts.shifts = state.shifts.length;

  const donationMethods = ['upi', 'card', 'netbanking'];

  for (let userIndex = 0; userIndex < state.users.length; userIndex += 1) {
    const user = state.users[userIndex];
    const targetCampaign = pick(state.campaigns, userIndex);
    const targetOpportunity = pick(state.opportunities, userIndex);
    const targetNgo = pick(state.verifiedNgos, userIndex);

    if (!targetCampaign?.id || !targetOpportunity?.id || !targetNgo?.id) continue;

    const paymentMethod = pick(donationMethods, userIndex);
    const donationInitiate = await step(`Initiate donation user ${userIndex + 1}`, () => requestJson('POST', `/donations/campaign/${targetCampaign.id}/initiate`, {
      token: user.token,
      body: {
        amount: 500 + (userIndex * 100),
        paymentMethod,
        donorName: user.name,
        donorEmail: user.email,
        donorPhone: user.mobileNumber,
        message: `Flood donation ${runId} from ${user.name}`,
        paymentDetails: buildPaymentDetails(paymentMethod, userIndex + 1)
      },
      expectedStatus: 200
    }));

    if (donationInitiate?.data?.donation?.id) {
      const donationId = donationInitiate.data.donation.id;
      const orderId = donationInitiate.data?.gatewayOrder?.orderId;
      const donationConfirm = await step(`Confirm donation ${donationId}`, () => requestJson('POST', `/donations/${donationId}/confirm`, {
        token: user.token,
        body: {
          orderId,
          paymentId: `flood_payment_${runId}_${userIndex + 1}`,
          signature: 'mock_signature'
        },
        expectedStatus: 200
      }));

      if (donationConfirm?.data?.donation?.id) {
        state.donations.push({
          id: donationConfirm.data.donation.id,
          userId: user.id,
          ngoId: targetCampaign.ngoId,
          campaignId: targetCampaign.id
        });
        state.donationByUser.set(user.id, donationConfirm.data.donation.id);
        markFeature('donations');
      }
    }

    const campaignVolunteer = await step(`Campaign volunteer register user ${userIndex + 1}`, () => requestJson('POST', `/campaigns/${targetCampaign.id}/volunteer`, {
      token: user.token,
      body: {
        fullName: user.name,
        email: user.email,
        phone: user.mobileNumber,
        preferredActivities: ['Field Visit', 'Data Collection'],
        availability: 'Weekends',
        motivation: `I want to support campaign ${targetCampaign.title}.`
      },
      expectedStatus: 200
    }));

    if (campaignVolunteer) {
      state.campaignVolunteerRegistrations.push({
        campaignId: targetCampaign.id,
        ngoId: targetCampaign.ngoId,
        userId: user.id
      });
      markFeature('campaign_volunteer_registrations');
    }

    const volunteerApply = await step(`Opportunity apply user ${userIndex + 1}`, () => requestJson('POST', `/volunteering/${targetOpportunity.id}/apply`, {
      token: user.token,
      body: {
        fullName: user.name,
        email: user.email,
        phone: user.mobileNumber,
        preferredActivities: ['Logistics', 'Community Outreach'],
        availability: 'Weekdays evenings',
        motivation: 'I can support on-ground implementation and reporting.'
      },
      expectedStatus: 200
    }));

    if (volunteerApply?.data?.application?.id) {
      const applicationId = volunteerApply.data.application.id;
      state.volunteerApplications.push({
        id: applicationId,
        userId: user.id,
        ngoId: targetOpportunity.ngoId,
        opportunityId: targetOpportunity.id
      });

      await step(`Opportunity complete user ${userIndex + 1}`, () => requestJson('POST', `/volunteering/${targetOpportunity.id}/complete`, {
        token: user.token,
        body: {
          activityHours: 2 + (userIndex % 5)
        },
        expectedStatus: [200, 400]
      }));
      markFeature('volunteer_completion');
    }

    await step(`Message user ${userIndex + 1} -> NGO ${targetNgo.index}`, () => requestJson('POST', `/messages/to-ngo/${targetNgo.id}`, {
      token: user.token,
      body: {
        body: `Hello from ${user.name}. This is a flood workflow message (${runId}).`
      },
      expectedStatus: 201
    }));
    markFeature('messaging_user_to_ngo');

    const helpRequest = await step(`Create help request user ${userIndex + 1}`, () => requestJson('POST', '/requests', {
      token: user.token,
      body: {
        ngoId: targetNgo.id,
        name: user.name,
        age: 30 + (userIndex % 20),
        location: 'Bengaluru',
        helpType: 'Food Support',
        description: `Need support request created as part of flood test run ${runId}.`
      },
      expectedStatus: [200, 201]
    }));

    if (helpRequest?.data?.id) {
      state.helpRequests.push({
        id: helpRequest.data.id,
        ngoId: targetNgo.id,
        userId: user.id
      });
      markFeature('help_requests');
    }
  }

  report.counts.donations = state.donations.length;
  report.counts.helpRequests = state.helpRequests.length;

  const broadcaster = state.users[0];
  if (broadcaster?.token) {
    await step('Broadcast message to all NGOs', () => requestJson('POST', '/messages/to-all-ngos', {
      token: broadcaster.token,
      body: {
        body: `Broadcast message from flood scenario ${runId}.`
      },
      expectedStatus: 201
    }));
    markFeature('messaging_broadcast');
  }

  for (const ngo of state.verifiedNgos) {
    const relatedUsers = state.users.filter((_, idx) => (idx % state.verifiedNgos.length) === (ngo.index - 1) % state.verifiedNgos.length);

    for (const user of relatedUsers.slice(0, 4)) {
      await step(`Reply NGO ${ngo.index} -> ${user.email}`, () => requestJson('POST', `/messages/to-user/${user.id}`, {
        token: ngo.token,
        body: {
          body: `Thanks ${user.name}, your message is received (${runId}).`
        },
        expectedStatus: 201
      }));
      markFeature('messaging_ngo_to_user');
    }

    const pendingDonations = await step(`Load pending donation approvals NGO ${ngo.index}`, () => requestJson('GET', '/donations/ngo/pending-approvals', {
      token: ngo.token,
      expectedStatus: 200
    }));

    const pendingList = Array.isArray(pendingDonations?.data) ? pendingDonations.data : [];
    for (let index = 0; index < pendingList.length; index += 1) {
      const donation = pendingList[index];
      const decision = index % 3 === 0 ? 'reject' : 'approve';
      await step(`Donation cert decision ${donation.id} (${decision})`, () => requestJson('POST', `/donations/${donation.id}/certificate/decision`, {
        token: ngo.token,
        body: {
          decision,
          note: `Flood moderation ${runId}`
        },
        expectedStatus: 200
      }));
      markFeature('donation_certificate_workflow');
    }

    const campaignRegs = state.campaignVolunteerRegistrations.filter((entry) => String(entry.ngoId) === String(ngo.id));
    for (let index = 0; index < campaignRegs.length; index += 1) {
      const reg = campaignRegs[index];
      const decision = index % 4 === 0 ? 'reject' : 'approve';
      await step(`Campaign volunteer decision ${reg.campaignId}/${reg.userId}`, () => requestJson('POST', `/campaigns/${reg.campaignId}/volunteer/decision`, {
        token: ngo.token,
        body: {
          userId: reg.userId,
          decision,
          note: `Flood review ${runId}`,
          activityHours: decision === 'approve' ? 4 + (index % 5) : undefined
        },
        expectedStatus: [200, 404]
      }));
      markFeature('campaign_volunteer_decisions');
    }

    const volunteerApps = state.volunteerApplications.filter((entry) => String(entry.ngoId) === String(ngo.id));
    for (let index = 0; index < volunteerApps.length; index += 1) {
      const app = volunteerApps[index];
      const decision = index % 5 === 0 ? 'reject' : 'approve';
      await step(`Volunteer certificate decision ${app.id}`, () => requestJson('POST', `/volunteering/applications/${app.id}/certificate/decision`, {
        token: ngo.token,
        body: {
          decision,
          note: `Flood cert decision ${runId}`
        },
        expectedStatus: [200, 404]
      }));
      markFeature('volunteer_certificate_workflow');
    }

    const ngoDonorsRes = await step(`CRM donors NGO ${ngo.index}`, () => requestJson('GET', '/innovation/crm/donors?limit=500', {
      token: ngo.token,
      expectedStatus: 200
    }));

    const donors = Array.isArray(ngoDonorsRes?.data) ? ngoDonorsRes.data : [];
    if (donors.length > 0) {
      const firstDonor = donors[0];
      if (firstDonor?.donorUserId) {
        await step(`CRM donor note NGO ${ngo.index}`, () => requestJson('POST', `/innovation/crm/donors/${firstDonor.donorUserId}/notes`, {
          token: ngo.token,
          body: {
            noteText: `Follow-up note for donor ${firstDonor.donorUserId} in flood run ${runId}.`
          },
          expectedStatus: 201
        }));
        markFeature('crm_notes');
      }

      const segmentDonors = donors.slice(0, 4).map((item) => item.donorUserId).filter(Boolean);
      const segmentRes = await step(`Create CRM segment NGO ${ngo.index}`, () => requestJson('POST', '/innovation/crm/segments', {
        token: ngo.token,
        body: {
          segmentName: `Flood Segment NGO-${ngo.index}-${runId}`,
          segmentDescription: 'Auto-created segment for flood data testing.',
          donorUserIds: segmentDonors
        },
        expectedStatus: 201
      }));

      if (segmentRes?.data?.id) {
        await step(`Add members to segment NGO ${ngo.index}`, () => requestJson('POST', `/innovation/crm/segments/${segmentRes.data.id}/members`, {
          token: ngo.token,
          body: {
            donorUserIds: donors.slice(2, 6).map((item) => item.donorUserId).filter(Boolean)
          },
          expectedStatus: [200, 400]
        }));

        await step(`Send CRM campaign message NGO ${ngo.index}`, () => requestJson('POST', `/innovation/crm/segments/${segmentRes.data.id}/campaign-message`, {
          token: ngo.token,
          body: {
            title: `Flood Segment Message ${runId}`,
            message: 'Thank you for your continued support. This message validates segment communications.'
          },
          expectedStatus: 200
        }));

        markFeature('crm_segments');
      }
    }

    await step(`Run shift reminders NGO ${ngo.index}`, () => requestJson('POST', '/innovation/volunteer/shifts/reminders/run', {
      token: ngo.token,
      body: { hoursWindow: 72 },
      expectedStatus: 200
    }));
    markFeature('shift_reminders');

    await step(`Export NGO volunteer logs ${ngo.index}`, () => requestJson('GET', '/innovation/volunteer/logs/ngo/export', {
      token: ngo.token,
      expectedStatus: 200
    }));
    markFeature('volunteer_logs_export');

    await step(`Get NGO campaign update analytics ${ngo.index}`, () => requestJson('GET', '/campaigns/ngo/campaign-updates/analytics', {
      token: ngo.token,
      expectedStatus: 200
    }));
    markFeature('campaign_update_analytics');
  }

  for (let index = 0; index < state.wishlistItems.length; index += 1) {
    const item = state.wishlistItems[index];
    const user = pick(state.users, index);
    if (!item?.id || !user?.token) continue;

    const pledge = await step(`Pledge wishlist ${item.id}`, () => requestJson('POST', `/innovation/wishlists/items/${item.id}/pledge`, {
      token: user.token,
      body: {
        quantityPledged: 2,
        note: `In-kind pledge for item ${item.id} (${runId})`
      },
      expectedStatus: [201, 400]
    }));

    if (pledge?.status === 201 && pledge?.data?.id) {
      state.pledges.push({
        id: pledge.data.id,
        ngoId: item.ngoId,
        itemId: item.id
      });
      markFeature('wishlist_pledges');
    }
  }

  for (const ngo of state.verifiedNgos) {
    const ngoPledges = state.pledges.filter((pledge) => String(pledge.ngoId) === String(ngo.id));
    for (let index = 0; index < ngoPledges.length; index += 1) {
      const pledge = ngoPledges[index];
      const status = index % 3 === 0 ? 'received' : (index % 2 === 0 ? 'approved' : 'rejected');
      await step(`Pledge status ${pledge.id} -> ${status}`, () => requestJson('POST', `/innovation/wishlists/pledges/${pledge.id}/status`, {
        token: ngo.token,
        body: { status },
        expectedStatus: 200
      }));
      markFeature('wishlist_pledge_decisions');
    }
  }
  report.counts.pledges = state.pledges.length;

  const circleCreators = state.users.slice(0, Math.min(3, state.users.length));
  for (let index = 0; index < circleCreators.length; index += 1) {
    const creator = circleCreators[index];
    const campaign = pick(state.campaigns, index);
    if (!campaign?.id) continue;

    const circle = await step(`Create giving circle ${index + 1}`, () => requestJson('POST', '/innovation/giving-circles', {
      token: creator.token,
      body: {
        campaignId: campaign.id,
        name: `Flood Giving Circle ${index + 1} ${runId}`,
        description: 'Test circle for collaborative donations.',
        goalAmount: 20000 + (index * 5000)
      },
      expectedStatus: 201
    }));

    if (circle?.data?.id) {
      state.circles.push(circle.data);
      markFeature('giving_circles');
    }
  }
  report.counts.givingCircles = state.circles.length;

  for (let circleIndex = 0; circleIndex < state.circles.length; circleIndex += 1) {
    const circle = state.circles[circleIndex];
    const participants = state.users.slice(circleIndex + 1, circleIndex + 6);

    for (const user of participants) {
      await step(`Join circle ${circle.id} by ${user.email}`, () => requestJson('POST', `/innovation/giving-circles/${circle.id}/join`, {
        token: user.token,
        expectedStatus: [200, 201]
      }));

      await step(`Contribute circle ${circle.id} by ${user.email}`, () => requestJson('POST', `/innovation/giving-circles/${circle.id}/contribute`, {
        token: user.token,
        body: {
          amount: 650,
          note: `Circle contribution from ${user.name}`,
          paymentMethod: 'upi',
          paymentMeta: {
            donationId: state.donationByUser.get(user.id) || ''
          }
        },
        expectedStatus: [201, 400]
      }));
      markFeature('giving_circle_contributions');
    }
  }

  for (let index = 0; index < state.shifts.length; index += 1) {
    const shift = state.shifts[index];
    const user = pick(state.users, index);
    if (!shift?.id || !user?.token) continue;

    const signup = await step(`Shift signup ${shift.id} by ${user.email}`, () => requestJson('POST', `/innovation/volunteer/shifts/${shift.id}/signup`, {
      token: user.token,
      expectedStatus: [201, 400]
    }));

    if (signup?.status === 201 && signup?.data?.id) {
      const signupData = {
        id: signup.data.id,
        shiftId: shift.id,
        ngoId: shift.ngoId,
        userId: user.id,
        userToken: user.token
      };
      state.shiftSignups.push(signupData);
      markFeature('shift_signups');

      const log = await step(`Log volunteer hours ${signupData.id}`, () => requestJson('POST', `/innovation/volunteer/logs/${signupData.id}`, {
        token: user.token,
        body: {
          hours: 3,
          summary: `Completed planned activities for shift ${shift.id}.`
        },
        expectedStatus: 201
      }));

      if (log?.data?.id) {
        state.volunteerLogs.push({
          id: log.data.id,
          ngoId: shift.ngoId,
          userId: user.id
        });
        markFeature('volunteer_logs');
      }
    }
  }
  report.counts.shiftSignups = state.shiftSignups.length;
  report.counts.volunteerLogs = state.volunteerLogs.length;

  for (const ngo of state.verifiedNgos) {
    const logs = state.volunteerLogs.filter((item) => String(item.ngoId) === String(ngo.id));
    for (let index = 0; index < logs.length; index += 1) {
      const log = logs[index];
      const decision = index % 3 === 0 ? 'reject' : 'approve';
      await step(`Volunteer log decision ${log.id}`, () => requestJson('POST', `/innovation/volunteer/logs/${log.id}/approve`, {
        token: ngo.token,
        body: {
          decision,
          note: `Flood log review ${runId}`
        },
        expectedStatus: 200
      }));
      markFeature('volunteer_log_decisions');
    }
  }

  for (const ngo of state.verifiedNgos) {
    const app = state.volunteerApplications.find((entry) => String(entry.ngoId) === String(ngo.id));
    if (!app) continue;
    const endorsement = await step(`Create endorsement NGO ${ngo.index}`, () => requestJson('POST', '/innovation/endorsements', {
      token: ngo.token,
      body: {
        userId: app.userId,
        applicationId: app.id,
        skills: ['Community Outreach', 'Field Coordination', 'Program Reporting'],
        note: `Endorsed during flood run ${runId}`
      },
      expectedStatus: [201, 400]
    }));

    if (endorsement?.status === 201 && endorsement?.data?.id) {
      state.endorsements.push(endorsement.data);
      markFeature('endorsements');
    }
  }
  report.counts.endorsements = state.endorsements.length;

  for (const user of state.users.slice(0, 6)) {
    await step(`User endorsement feed ${user.email}`, () => requestJson('GET', '/innovation/endorsements/my', {
      token: user.token,
      expectedStatus: 200
    }));

    await step(`User gamification summary ${user.email}`, () => requestJson('GET', '/innovation/gamification/me', {
      token: user.token,
      expectedStatus: 200
    }));
    markFeature('gamification');
  }

  await step('Gamification leaderboard', () => requestJson('GET', '/innovation/gamification/leaderboard?limit=20', {
    expectedStatus: 200
  }));

  const ownerUser = state.users[0];
  const employeeUser = state.users[1];
  if (ownerUser?.token && employeeUser?.token) {
    const profile = await step('Create corporate profile', () => requestJson('POST', '/innovation/corporate/profiles', {
      token: ownerUser.token,
      body: {
        companyName: `Flood Corp ${runId}`,
        matchRatio: 1.5,
        capPerEmployee: 20000,
        policyNote: 'CSR match policy for test automation.'
      },
      expectedStatus: 201
    }));

    if (profile?.data?.id) {
      const link = await step('Employee link to corporate profile', () => requestJson('POST', `/innovation/corporate/profiles/${profile.data.id}/link`, {
        token: employeeUser.token,
        body: {
          employeeCode: `EMP-${runId}`
        },
        expectedStatus: 201
      }));

      if (link?.data?.id) {
        await step('Owner approves employee link', () => requestJson('POST', `/innovation/corporate/profiles/${profile.data.id}/employees/${link.data.id}/approve`, {
          token: ownerUser.token,
          expectedStatus: 200
        }));
      }

      const employeeDonationId = state.donationByUser.get(employeeUser.id);
      if (employeeDonationId) {
        const match = await step('Evaluate corporate match', () => requestJson('POST', '/innovation/corporate/matches/evaluate', {
          token: employeeUser.token,
          body: {
            donationId: employeeDonationId
          },
          expectedStatus: [201, 404]
        }));

        if (match?.status === 201 && match?.data?.id) {
          await step('Approve corporate match', () => requestJson('POST', `/innovation/corporate/matches/${match.data.id}/approve`, {
            token: ownerUser.token,
            expectedStatus: 200
          }));
          markFeature('corporate_matching');
        }
      }

      await step('Corporate matches my', () => requestJson('GET', '/innovation/corporate/matches/my', {
        token: employeeUser.token,
        expectedStatus: 200
      }));
    }
  }

  for (const ngo of state.verifiedNgos) {
    const request = state.helpRequests.find((entry) => String(entry.ngoId) === String(ngo.id));
    if (!request) continue;
    await step(`Update help request status by NGO ${ngo.index}`, () => requestJson('PUT', `/requests/${request.id}/status`, {
      token: ngo.token,
      body: {
        status: 'In Progress'
      },
      expectedStatus: 200
    }));
    markFeature('help_request_status_updates');
  }

  const adminAnnouncementPayloads = [
    { title: `System Broadcast ${runId}`, message: 'General platform announcement from admin flood scenario.', audience: 'all' },
    { title: `User Advisory ${runId}`, message: 'Targeted user advisory generated in flood scenario.', audience: 'users' },
    { title: `NGO Advisory ${runId}`, message: 'Targeted NGO advisory generated in flood scenario.', audience: 'ngos' }
  ];

  for (const payload of adminAnnouncementPayloads) {
    const created = await step(`Create admin announcement (${payload.audience})`, () => requestJson('POST', '/admin/notifications', {
      token: adminToken,
      body: payload,
      expectedStatus: 200
    }));
    if (created?.data?.id) {
      report.counts.announcements += 1;
      markFeature('admin_announcements');
    }
  }

  await step('Admin notifications list', () => requestJson('GET', '/admin/notifications', {
    token: adminToken,
    expectedStatus: 200
  }));

  for (const principal of [state.users[0], state.verifiedNgos[0]].filter(Boolean)) {
    await step(`Load notifications for ${principal.email || principal.name}`, () => requestJson('GET', '/notifications?limit=20', {
      token: principal.token,
      expectedStatus: 200
    }));
  }

  const notificationForOpen = await step('Load notifications for open/click tracking', () => requestJson('GET', '/notifications?limit=5', {
    token: state.users[0]?.token,
    expectedStatus: 200
  }));

  const firstNotificationId = Array.isArray(notificationForOpen?.data) ? notificationForOpen.data[0]?.id : null;
  if (firstNotificationId && state.users[0]?.token) {
    await step('Notification open event', () => requestJson('POST', `/notifications/${firstNotificationId}/open`, {
      token: state.users[0].token,
      body: { action: 'open' },
      expectedStatus: 200
    }));

    await step('Notification click event', () => requestJson('POST', `/notifications/${firstNotificationId}/open`, {
      token: state.users[0].token,
      body: { action: 'click' },
      expectedStatus: 200
    }));
    markFeature('notification_engagement');
  }

  const flagUserOne = state.users[0];
  const flagUserTwo = state.users[1] || state.users[0];
  const firstNgo = state.verifiedNgos[0];
  const firstCampaign = state.campaigns[0];

  if (flagUserOne?.token && firstNgo?.id) {
    await step('Submit NGO flag request', () => requestJson('POST', `/ngos/${firstNgo.id}/flag-request`, {
      token: flagUserOne.token,
      body: { reason: `Flood moderation request for NGO (${runId})` },
      expectedStatus: [200, 400]
    }));
    markFeature('flag_requests');
  }

  if (flagUserTwo?.token && firstCampaign?.id) {
    await step('Submit campaign flag request', () => requestJson('POST', `/campaigns/${firstCampaign.id}/flag-request`, {
      token: flagUserTwo.token,
      body: { reason: `Flood moderation request for campaign (${runId})` },
      expectedStatus: [200, 400]
    }));
    markFeature('flag_requests');
  }

  const pendingFlags = await step('Admin pending flag requests', () => requestJson('GET', '/admin/flag-requests?status=pending', {
    token: adminToken,
    expectedStatus: 200
  }));

  const pendingRequests = Array.isArray(pendingFlags?.data) ? pendingFlags.data : [];
  if (pendingRequests[0]?.id) {
    await step(`Approve flag request ${pendingRequests[0].id}`, () => requestJson('PUT', `/admin/flag-requests/${pendingRequests[0].id}/approve`, {
      token: adminToken,
      body: { note: `Approved in flood run ${runId}` },
      expectedStatus: 200
    }));
  }

  if (pendingRequests[1]?.id) {
    await step(`Reject flag request ${pendingRequests[1].id}`, () => requestJson('PUT', `/admin/flag-requests/${pendingRequests[1].id}/reject`, {
      token: adminToken,
      body: { note: `Rejected in flood run ${runId}` },
      expectedStatus: 200
    }));
  }

  await step('Admin flagged NGOs list', () => requestJson('GET', '/admin/flagged-ngos', {
    token: adminToken,
    expectedStatus: 200
  }));

  await step('Admin flagged campaigns list', () => requestJson('GET', '/admin/flagged-campaigns', {
    token: adminToken,
    expectedStatus: 200
  }));

  await step('Emergency feed', () => requestJson('GET', '/innovation/emergency/feed', {
    expectedStatus: 200
  }));

  await step('Admin webhook queue', () => requestJson('GET', '/admin/webhooks?limit=50', {
    token: adminToken,
    expectedStatus: 200
  }));

  await step('Admin webhook metrics', () => requestJson('GET', '/admin/webhooks/metrics?hours=24', {
    token: adminToken,
    expectedStatus: 200
  }));

  await step('Admin webhook export (json)', () => requestJson('GET', '/admin/webhooks/export?format=json&limit=300', {
    token: adminToken,
    expectedStatus: 200
  }));

  await step('Admin webhook cleanup dry run', () => requestJson('POST', '/admin/webhooks/cleanup', {
    token: adminToken,
    body: { olderThanDays: 30, dryRun: true },
    expectedStatus: 200
  }));

  await step('Admin webhook worker status', () => requestJson('GET', '/admin/webhooks/worker/status', {
    token: adminToken,
    expectedStatus: 200
  }));

  await step('Admin webhook worker run', () => requestJson('POST', '/admin/webhooks/worker/run', {
    token: adminToken,
    expectedStatus: [200, 400]
  }));

  await step('Admin requests list', () => requestJson('GET', '/admin/requests', {
    token: adminToken,
    expectedStatus: 200
  }));

  await step('Admin dashboard', () => requestJson('GET', '/admin/dashboard', {
    token: adminToken,
    expectedStatus: 200
  }));

  await step('Admin analytics', () => requestJson('GET', '/admin/analytics', {
    token: adminToken,
    expectedStatus: 200
  }));

  await step('Public NGO list', () => requestJson('GET', '/ngos', { expectedStatus: 200 }));
  await step('Public campaigns list', () => requestJson('GET', '/campaigns', { expectedStatus: 200 }));
  await step('Public volunteer opportunities list', () => requestJson('GET', '/volunteering', { expectedStatus: 200 }));
  await step('Public wishlist list', () => requestJson('GET', '/innovation/wishlists/items?limit=200', { expectedStatus: 200 }));

  report.execution.durationMs = Date.now() - start;

  const reportFiles = await writeReport(runId, report);

  console.log('Flood scenario complete.');
  console.log(`Users: ${report.counts.users}, NGOs: ${report.counts.ngos} (verified=${report.counts.verifiedNgos}, rejected=${report.counts.rejectedNgos})`);
  console.log(`Campaigns: ${report.counts.campaigns}, Members: ${report.counts.members}, Donations: ${report.counts.donations}`);
  console.log(`Failures: ${report.execution.failedSteps}`);
  console.log(`Report JSON: ${reportFiles.jsonPath}`);
  console.log(`Report MD: ${reportFiles.mdPath}`);

  if (report.execution.failedSteps > 0) {
    process.exitCode = 1;
  }
};

main().catch((err) => {
  console.error('Flood scenario failed:', err.message);
  if (err.data !== undefined) {
    console.error('Response preview:', formatPreview(err.data));
  }
  process.exitCode = 1;
});
