#!/usr/bin/env node
'use strict';

// End-to-end API smoke test runner (CLI only).
//
// Prereqs:
// - Backend server running (default: http://localhost:5001)
// - Database schema applied + seeded users/NGOs/admin available

const DEFAULT_API_BASE = 'http://localhost:5001/api';

const API_BASE = String(process.env.API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');

const credentials = {
  user: {
    email: process.env.SMOKE_USER_EMAIL || 'rahul@example.com',
    password: process.env.SMOKE_USER_PASSWORD || 'password123'
  },
  ngo: {
    email: process.env.SMOKE_NGO_EMAIL || 'akshayapatra@ngo.org',
    password: process.env.SMOKE_NGO_PASSWORD || 'password123'
  },
  admin: {
    email: process.env.SMOKE_ADMIN_EMAIL || 'admin@ngoconnect.org',
    password: process.env.SMOKE_ADMIN_PASSWORD || 'password123'
  }
};

const toApiUrl = (path) => {
  const cleaned = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${cleaned}`;
};

const toOriginUrl = (path) => {
  const origin = new URL(API_BASE).origin;
  const cleaned = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${cleaned}`;
};

const decodeBase64Url = (input) => {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
};

const decodeJwt = (token) => {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(decodeBase64Url(parts[1]));
  } catch (err) {
    return null;
  }
};

const safeJsonParse = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
};

const formatPreview = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.slice(0, 500);
  try {
    return JSON.stringify(value).slice(0, 700);
  } catch (err) {
    return String(value).slice(0, 500);
  }
};

const expect = (condition, message) => {
  if (!condition) {
    const error = new Error(message);
    error.name = 'SmokeTestAssertionError';
    throw error;
  }
};

const requestJson = async (method, path, { token, body, expectedStatus } = {}) => {
  const url = toApiUrl(path);
  const headers = {
    Accept: 'application/json'
  };

  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: payload
  });

  const contentType = String(res.headers.get('content-type') || '');
  const text = await res.text();
  const data = contentType.includes('application/json') ? safeJsonParse(text) : text;

  if (expectedStatus !== undefined) {
    const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    if (!allowed.includes(res.status)) {
      throw new Error(`${method} ${path} -> ${res.status} (expected ${allowed.join(' or ')}): ${formatPreview(data)}`);
    }
  } else if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${formatPreview(data)}`);
  }

  return { status: res.status, headers: res.headers, data };
};

const requestText = async (method, path, { token, body, expectedStatus } = {}) => {
  const url = toApiUrl(path);
  const headers = {
    Accept: '*/*'
  };

  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: payload
  });

  const text = await res.text();

  if (expectedStatus !== undefined) {
    const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    if (!allowed.includes(res.status)) {
      throw new Error(`${method} ${path} -> ${res.status} (expected ${allowed.join(' or ')}): ${text.slice(0, 400)}`);
    }
  } else if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  }

  return { status: res.status, headers: res.headers, data: text };
};

const step = async (name, fn) => {
  const started = Date.now();
  process.stdout.write(`- ${name}... `);
  const result = await fn();
  const duration = Date.now() - started;
  process.stdout.write(`OK (${duration}ms)\n`);
  return result;
};

const login = async (role) => {
  const creds = credentials[role];
  expect(creds?.email && creds?.password, `Missing credentials for role: ${role}`);
  const res = await requestJson('POST', '/auth/login', {
    body: { email: creds.email, password: creds.password },
    expectedStatus: 200
  });
  const token = res.data?.token;
  expect(token, `Login token missing for ${role}`);
  return token;
};

const findFirst = (items, predicate) => {
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    if (predicate(item)) return item;
  }
  return null;
};

const main = async () => {
  console.log(`API_BASE=${API_BASE}`);

  await step('API health', async () => {
    const res = await requestJson('GET', '/', { expectedStatus: [200, 404] }).catch(async () => {
      // Health is mounted at origin '/' not '/api' in this project.
      const originRes = await fetch(toOriginUrl('/'));
      expect(originRes.ok, `Origin health failed: ${originRes.status}`);
      const json = safeJsonParse(await originRes.text());
      expect(json && json.ok === true, 'Origin health response invalid');
      return { status: originRes.status, data: json };
    });
    if (res?.data && typeof res.data === 'object' && res.data.ok === true) return;
    // Accept unknown body for /api root (depending on setup), as long as origin health works.
    const originRes = await fetch(toOriginUrl('/'));
    expect(originRes.ok, `Origin health failed: ${originRes.status}`);
    const json = safeJsonParse(await originRes.text());
    expect(json && json.ok === true, 'Origin health response invalid');
  });

  const tokens = {};
  const identities = {};

  tokens.user = await step('Login as user', () => login('user'));
  identities.user = decodeJwt(tokens.user);
  expect(identities.user?.id && identities.user?.role === 'user', 'User JWT payload invalid');

  tokens.ngo = await step('Login as NGO', () => login('ngo'));
  identities.ngo = decodeJwt(tokens.ngo);
  expect(identities.ngo?.id && identities.ngo?.role === 'ngo', 'NGO JWT payload invalid');

  tokens.admin = await step('Login as admin', () => login('admin'));
  identities.admin = decodeJwt(tokens.admin);
  expect(identities.admin?.id && identities.admin?.role === 'admin', 'Admin JWT payload invalid');

  const ngoMe = await step('Fetch NGO profile', async () => {
    const res = await requestJson('GET', '/ngos/me', { token: tokens.ngo, expectedStatus: 200 });
    expect(res.data?.id, 'NGO profile missing id');
    return res.data;
  });

  const ngos = await step('List NGOs', async () => {
    const res = await requestJson('GET', '/ngos', { expectedStatus: 200 });
    expect(Array.isArray(res.data) && res.data.length > 0, 'NGO list empty');
    return res.data;
  });

  const campaigns = await step('List campaigns', async () => {
    const res = await requestJson('GET', '/campaigns', { expectedStatus: 200 });
    expect(Array.isArray(res.data) && res.data.length > 0, 'Campaign list empty');
    return res.data;
  });

  const ownedCampaigns = campaigns.filter((campaign) => String(campaign?.ngo?.id || campaign?.ngo || '') === String(ngoMe.id));
  expect(ownedCampaigns.length > 0, 'No campaigns found for seeded NGO account. Seed may not match SMOKE_NGO_EMAIL.');

  const donationCampaign = findFirst(
    ownedCampaigns,
    (campaign) => Number(campaign?.goalAmount || 0) > 0
  ) || ownedCampaigns[0];
  expect(donationCampaign?.id, 'Unable to pick campaign for donation');

  const volunteerCampaign = findFirst(
    ownedCampaigns,
    (campaign) => Array.isArray(campaign?.volunteersNeeded) && campaign.volunteersNeeded.length > 0
  ) || ownedCampaigns[0];
  expect(volunteerCampaign?.id, 'Unable to pick campaign for volunteering');

  const donationFlow = await step('Donation: initiate + confirm + receipt', async () => {
    const initiate = await requestJson('POST', `/donations/campaign/${donationCampaign.id}/initiate`, {
      token: tokens.user,
      body: {
        amount: 2453,
        paymentMethod: 'upi',
        donorName: 'Rahul Kumar',
        donorEmail: credentials.user.email,
        donorPhone: '9999999999',
        message: 'Smoke test donation',
        paymentDetails: { upiId: 'rahul@upi' }
      },
      expectedStatus: 200
    });

    const donationId = initiate.data?.donation?.id;
    expect(donationId, 'Donation initiate missing donation.id');

    const confirm = await requestJson('POST', `/donations/${donationId}/confirm`, {
      token: tokens.user,
      body: {
        orderId: initiate.data?.gatewayOrder?.orderId,
        paymentId: `mock_payment_${Date.now().toString(36)}`
      },
      expectedStatus: 200
    });

    expect(confirm.data?.donation?.status === 'completed', `Donation not completed: ${formatPreview(confirm.data?.donation)}`);

    const receipt = await requestJson('GET', `/donations/${donationId}/receipt`, {
      token: tokens.user,
      expectedStatus: 200
    });

    expect(receipt.data?.receiptNumber, 'Receipt payload missing receiptNumber');

    return { donationId };
  });

  await step('Donation: NGO certificate approve + user certificate visible', async () => {
    const pending = await requestJson('GET', '/donations/ngo/pending-approvals', {
      token: tokens.ngo,
      expectedStatus: 200
    });
    const pendingIds = new Set((pending.data || []).map((d) => String(d?.id || '')));
    expect(pendingIds.has(String(donationFlow.donationId)), 'Donation not found in NGO pending approvals queue');

    const decision = await requestJson('POST', `/donations/${donationFlow.donationId}/certificate/decision`, {
      token: tokens.ngo,
      body: { decision: 'approve', note: 'Approved in smoke test' },
      expectedStatus: 200
    });
    expect(decision.data?.certificate?.id, 'Donation certificate approve missing certificate.id');

    const myCerts = await requestJson('GET', '/certificates/my', { token: tokens.user, expectedStatus: 200 });
    expect(Array.isArray(myCerts.data), 'User certificates payload invalid');
    const hasDonationCert = myCerts.data.some((cert) => String(cert?.id || '') === String(decision.data.certificate.id));
    expect(hasDonationCert, 'Approved donation certificate not visible to user');
  });

  const volunteerOpportunity = await step('Volunteer opportunity: create (NGO)', async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
    const res = await requestJson('POST', '/volunteering', {
      token: tokens.ngo,
      body: {
        title: 'Volunteer: Bengaluru Outreach Sprint',
        description: 'Short on-ground outreach sprint for smoke test validation.',
        location: 'Indiranagar, Bengaluru, Karnataka',
        skills: ['Community Outreach', 'Data Entry Support'],
        commitment: 'One-time',
        dateRange: { startDate: now.toISOString(), endDate: end.toISOString() },
        spots: 12
      },
      expectedStatus: 200
    });
    expect(res.data?.id, 'Created volunteer opportunity missing id');
    return res.data;
  });

  const volunteerApplication = await step('Volunteer opportunity: apply + complete (user)', async () => {
    const applyRes = await requestJson('POST', `/volunteering/${volunteerOpportunity.id}/apply`, {
      token: tokens.user,
      body: {
        fullName: 'Rahul Kumar',
        email: credentials.user.email,
        phone: '9999999999',
        preferredActivities: ['Community Outreach'],
        availability: 'Weekends',
        motivation: 'Smoke test'
      },
      expectedStatus: [200, 201]
    });
    const applicationId = applyRes.data?.application?.id;
    expect(applicationId, `Volunteer apply missing application.id: ${formatPreview(applyRes.data)}`);

    const completeRes = await requestJson('POST', `/volunteering/${volunteerOpportunity.id}/complete`, {
      token: tokens.user,
      body: { activityHours: 4 },
      expectedStatus: 200
    });
    expect(completeRes.data?.application?.status === 'completed', 'Volunteer complete did not mark completed');

    return { applicationId };
  });

  await step('Volunteer opportunity: NGO certificate approve', async () => {
    const pendingRes = await requestJson('GET', '/volunteering/approvals/ngo/pending', {
      token: tokens.ngo,
      expectedStatus: 200
    });
    const pendingIds = new Set((pendingRes.data || []).map((row) => String(row?.id || '')));
    expect(pendingIds.has(String(volunteerApplication.applicationId)), 'Volunteer application not found in NGO pending approvals');

    const decisionRes = await requestJson('POST', `/volunteering/applications/${volunteerApplication.applicationId}/certificate/decision`, {
      token: tokens.ngo,
      body: { decision: 'approve', note: 'Approved in smoke test' },
      expectedStatus: 200
    });
    expect(decisionRes.data?.certificate?.id, 'Volunteer certificate decision missing certificate.id');
  });

  await step('Campaign volunteering: submit + NGO approve', async () => {
    const joinRes = await requestJson('POST', `/campaigns/${volunteerCampaign.id}/volunteer`, {
      token: tokens.user,
      body: {
        fullName: 'Rahul Kumar',
        email: credentials.user.email,
        phone: '9999999999',
        preferredActivities: ['Field Communications'],
        availability: 'Weekends',
        motivation: 'Smoke test'
      },
      expectedStatus: 200
    });
    expect(joinRes.data?.registration, 'Campaign volunteer join missing registration');

    const decisionRes = await requestJson('POST', `/campaigns/${volunteerCampaign.id}/volunteer/decision`, {
      token: tokens.ngo,
      body: {
        userId: identities.user.id,
        decision: 'approve',
        note: 'Approved in smoke test',
        activityHours: 3.5
      },
      expectedStatus: 200
    });
    expect(decisionRes.data?.registration?.certificateApprovalStatus === 'approved', 'Campaign volunteer approval did not set approved');
    expect(decisionRes.data?.certificate?.id || decisionRes.data?.registration?.certificate, 'Campaign volunteer approval missing certificate');

    const myRegs = await requestJson('GET', '/campaigns/my/volunteer-registrations', {
      token: tokens.user,
      expectedStatus: 200
    });
    expect(Array.isArray(myRegs.data), 'Campaign volunteer registrations payload invalid');
    const row = myRegs.data.find((entry) => String(entry?.campaign?.id || '') === String(volunteerCampaign.id));
    expect(row, 'Campaign volunteer registration missing from /campaigns/my/volunteer-registrations');
    expect(row.registration, 'Campaign volunteer registration missing details');
  });

  await step('NGO transparency score', async () => {
    const scoreRes = await requestJson('GET', `/ngos/${ngoMe.id}/transparency`, {
      expectedStatus: 200
    });
    expect(scoreRes.data?.transparencyScore, 'Transparency score payload missing');
    expect(Number.isFinite(Number(scoreRes.data?.transparencyScore?.score)), 'Transparency score value invalid');
  });

  const innovationFlow = {};

  await step('Innovation: create wishlist item (NGO)', async () => {
    const created = await requestJson('POST', '/innovation/wishlists/items', {
      token: tokens.ngo,
      body: {
        campaignId: donationCampaign.id,
        itemName: 'Science Workbooks',
        description: 'Workbooks for classroom intervention',
        quantityNeeded: 40,
        unit: 'books',
        priority: 'high',
        emergency: false
      },
      expectedStatus: 201
    });
    expect(created.data?.id, 'Wishlist item create missing id');
    innovationFlow.wishlistItemId = created.data.id;
  });

  await step('Innovation: list wishlist items + pledge + receive', async () => {
    const listed = await requestJson('GET', `/innovation/wishlists/items?ngoId=${encodeURIComponent(ngoMe.id)}`, {
      expectedStatus: 200
    });
    expect(Array.isArray(listed.data), 'Wishlist list payload invalid');
    const item = listed.data.find((entry) => String(entry?.id || '') === String(innovationFlow.wishlistItemId));
    expect(item, 'Created wishlist item not found in list');

    const pledge = await requestJson('POST', `/innovation/wishlists/items/${innovationFlow.wishlistItemId}/pledge`, {
      token: tokens.user,
      body: {
        quantityPledged: 12,
        note: 'Smoke test pledge'
      },
      expectedStatus: 201
    });
    expect(pledge.data?.id, 'Wishlist pledge missing id');
    innovationFlow.wishlistPledgeId = pledge.data.id;

    const received = await requestJson('POST', `/innovation/wishlists/pledges/${innovationFlow.wishlistPledgeId}/status`, {
      token: tokens.ngo,
      body: { status: 'received' },
      expectedStatus: 200
    });
    expect(received.data?.pledge?.status === 'received', 'Wishlist pledge status did not update to received');
  });

  await step('Innovation: giving circle create + contribute', async () => {
    const circle = await requestJson('POST', '/innovation/giving-circles', {
      token: tokens.user,
      body: {
        campaignId: donationCampaign.id,
        name: 'Smoke Circle',
        description: 'Collective donation circle',
        goalAmount: 15000
      },
      expectedStatus: 201
    });
    expect(circle.data?.id, 'Giving circle create missing id');
    innovationFlow.circleId = circle.data.id;

    const contribute = await requestJson('POST', `/innovation/giving-circles/${innovationFlow.circleId}/contribute`, {
      token: tokens.user,
      body: {
        amount: 750,
        note: 'Smoke test circle contribution'
      },
      expectedStatus: 201
    });
    expect(contribute.data?.contribution?.id, 'Giving circle contribution missing id');

    const details = await requestJson('GET', `/innovation/giving-circles/${innovationFlow.circleId}`, {
      token: tokens.user,
      expectedStatus: 200
    });
    expect(Array.isArray(details.data?.members), 'Giving circle details missing members');
    expect(Array.isArray(details.data?.contributions), 'Giving circle details missing contributions');
  });

  await step('Innovation: impact updates', async () => {
    const created = await requestJson('POST', '/innovation/impact-updates', {
      token: tokens.ngo,
      body: {
        campaignId: donationCampaign.id,
        title: 'Library materials delivered',
        details: 'Delivered learning materials to 3 government schools as part of the campaign activity plan.',
        amountUtilized: 18000,
        beneficiariesReached: 145,
        evidence: ['https://example.org/smoke/evidence-1']
      },
      expectedStatus: 201
    });
    expect(created.data?.id, 'Impact update create missing id');

    const listed = await requestJson('GET', `/innovation/impact-updates/campaign/${donationCampaign.id}`, {
      expectedStatus: 200
    });
    expect(Array.isArray(listed.data) && listed.data.length > 0, 'Impact updates list empty');
  });

  await step('Innovation: volunteer shifts + logs + export', async () => {
    const now = Date.now();
    const shift = await requestJson('POST', '/innovation/volunteer/shifts', {
      token: tokens.ngo,
      body: {
        title: 'Smoke shift',
        opportunityId: volunteerOpportunity.id,
        campaignId: donationCampaign.id,
        location: 'Koramangala',
        note: 'Smoke test shift',
        startAt: new Date(now + 1000 * 60 * 60 * 26).toISOString(),
        endAt: new Date(now + 1000 * 60 * 60 * 30).toISOString(),
        slots: 8,
        reminderBeforeHours: 12
      },
      expectedStatus: 201
    });
    expect(shift.data?.id, 'Volunteer shift create missing id');
    innovationFlow.shiftId = shift.data.id;

    const signup = await requestJson('POST', `/innovation/volunteer/shifts/${innovationFlow.shiftId}/signup`, {
      token: tokens.user,
      body: {},
      expectedStatus: 201
    });
    expect(signup.data?.id, 'Shift signup missing id');
    innovationFlow.shiftSignupId = signup.data.id;

    const volunteerLog = await requestJson('POST', `/innovation/volunteer/logs/${innovationFlow.shiftSignupId}`, {
      token: tokens.user,
      body: {
        hours: 4.5,
        summary: 'Supported logistics and attendee onboarding.'
      },
      expectedStatus: 201
    });
    expect(volunteerLog.data?.id, 'Volunteer log missing id');
    innovationFlow.volunteerLogId = volunteerLog.data.id;

    const ngoLogs = await requestJson('GET', '/innovation/volunteer/logs/ngo', {
      token: tokens.ngo,
      expectedStatus: 200
    });
    expect(Array.isArray(ngoLogs.data), 'NGO volunteer logs payload invalid');

    const approveLog = await requestJson('POST', `/innovation/volunteer/logs/${innovationFlow.volunteerLogId}/approve`, {
      token: tokens.ngo,
      body: { decision: 'approve', note: 'Smoke approval' },
      expectedStatus: 200
    });
    expect(String(approveLog.data?.log?.approvalStatus || '').toLowerCase() === 'approved', 'Volunteer log not approved');

    const exportCsv = await requestText('GET', '/innovation/volunteer/logs/ngo/export', {
      token: tokens.ngo,
      expectedStatus: 200
    });
    expect(typeof exportCsv.data === 'string' && exportCsv.data.includes('logId'), 'Volunteer log export CSV invalid');
  });

  await step('Innovation: CRM donors + segments', async () => {
    const donors = await requestJson('GET', '/innovation/crm/donors', {
      token: tokens.ngo,
      expectedStatus: 200
    });
    expect(Array.isArray(donors.data) && donors.data.length > 0, 'CRM donor list empty');
    const donorUserId = donors.data[0]?.donorUserId;
    expect(donorUserId, 'CRM donor row missing donorUserId');

    const note = await requestJson('POST', `/innovation/crm/donors/${donorUserId}/notes`, {
      token: tokens.ngo,
      body: { noteText: 'Smoke test donor note' },
      expectedStatus: 201
    });
    expect(note.data?.id, 'CRM donor note create missing id');

    const segment = await requestJson('POST', '/innovation/crm/segments', {
      token: tokens.ngo,
      body: {
        segmentName: `Smoke Segment ${Date.now().toString(36)}`,
        segmentDescription: 'Smoke segment for donor message',
        donorUserIds: donors.data.slice(0, 2).map((entry) => entry.donorUserId).filter(Boolean)
      },
      expectedStatus: 201
    });
    expect(segment.data?.id, 'CRM segment create missing id');
    innovationFlow.segmentId = segment.data.id;

    const dispatch = await requestJson('POST', `/innovation/crm/segments/${innovationFlow.segmentId}/campaign-message`, {
      token: tokens.ngo,
      body: {
        title: 'Impact milestone',
        message: 'Thank you for supporting this campaign. We have reached a major milestone this week.'
      },
      expectedStatus: 200
    });
    expect(Number(dispatch.data?.recipients || 0) >= 1, 'CRM segment dispatch recipients missing');
  });

  await step('Innovation: corporate matching', async () => {
    const profile = await requestJson('POST', '/innovation/corporate/profiles', {
      token: tokens.user,
      body: {
        companyName: `Smoke Match Corp ${Date.now().toString(36)}`,
        matchRatio: 1.5,
        capPerEmployee: 12000,
        policyNote: 'Smoke policy'
      },
      expectedStatus: 201
    });
    expect(profile.data?.id, 'Corporate profile create missing id');
    innovationFlow.corporateProfileId = profile.data.id;

    const link = await requestJson('POST', `/innovation/corporate/profiles/${innovationFlow.corporateProfileId}/link`, {
      token: tokens.user,
      body: { employeeCode: 'SMK-EMP-001' },
      expectedStatus: 201
    });
    expect(link.data?.id, 'Corporate link create missing id');

    const evaluate = await requestJson('POST', '/innovation/corporate/matches/evaluate', {
      token: tokens.user,
      body: { donationId: donationFlow.donationId },
      expectedStatus: 201
    });
    expect(evaluate.data?.id, 'Corporate match evaluate missing id');
    innovationFlow.corporateMatchId = evaluate.data.id;

    const approve = await requestJson('POST', `/innovation/corporate/matches/${innovationFlow.corporateMatchId}/approve`, {
      token: tokens.user,
      body: {},
      expectedStatus: 200
    });
    expect(String(approve.data?.match?.status || '').toLowerCase() === 'approved', 'Corporate match not approved');

    const myMatches = await requestJson('GET', '/innovation/corporate/matches/my', {
      token: tokens.user,
      expectedStatus: 200
    });
    expect(Array.isArray(myMatches.data) && myMatches.data.length > 0, 'Corporate matches list empty');
  });

  await step('Innovation: volunteer endorsement', async () => {
    const endorse = await requestJson('POST', '/innovation/endorsements', {
      token: tokens.ngo,
      body: {
        userId: identities.user.id,
        applicationId: volunteerApplication.applicationId,
        skills: ['Community Outreach', 'Event Coordination'],
        note: 'Smoke test endorsement'
      },
      expectedStatus: 201
    });
    expect(endorse.data?.id, 'Volunteer endorsement create missing id');

    const myEndorsements = await requestJson('GET', '/innovation/endorsements/my', {
      token: tokens.user,
      expectedStatus: 200
    });
    expect(Array.isArray(myEndorsements.data), 'Volunteer endorsements payload invalid');
  });

  await step('Innovation: emergency feed', async () => {
    const campaignEmergency = await requestJson('POST', `/innovation/emergency/campaigns/${donationCampaign.id}`, {
      token: tokens.ngo,
      body: {
        emergency: true,
        emergencyNote: 'Smoke emergency campaign toggle'
      },
      expectedStatus: 200
    });
    expect(campaignEmergency.data?.campaign?.emergency === true, 'Campaign emergency toggle failed');

    const opportunityEmergency = await requestJson('POST', `/innovation/emergency/opportunities/${volunteerOpportunity.id}`, {
      token: tokens.ngo,
      body: {
        emergency: true,
        emergencyNote: 'Smoke emergency opportunity toggle'
      },
      expectedStatus: 200
    });
    expect(opportunityEmergency.data?.opportunity?.emergency === true, 'Opportunity emergency toggle failed');

    const feed = await requestJson('GET', '/innovation/emergency/feed', {
      expectedStatus: 200
    });
    expect(feed.data && typeof feed.data === 'object', 'Emergency feed payload invalid');
    expect(Array.isArray(feed.data.campaigns), 'Emergency feed campaigns missing');
  });

  await step('Innovation: gamification summary + leaderboard', async () => {
    const me = await requestJson('GET', '/innovation/gamification/me', {
      token: tokens.user,
      expectedStatus: 200
    });
    expect(me.data && typeof me.data === 'object', 'Gamification summary payload invalid');
    expect(Number.isFinite(Number(me.data.points || 0)), 'Gamification summary points invalid');

    const leaderboard = await requestJson('GET', '/innovation/gamification/leaderboard?limit=10', {
      expectedStatus: 200
    });
    expect(Array.isArray(leaderboard.data), 'Gamification leaderboard payload invalid');
  });

  const supportRequest = await step('Support request: create (user)', async () => {
    const res = await requestJson('POST', '/requests', {
      token: tokens.user,
      body: {
        ngoId: ngoMe.id,
        age: 24,
        location: 'Koramangala, Bengaluru, Karnataka',
        helpType: 'Medical Support',
        description: 'Smoke test support request'
      },
      expectedStatus: 200
    });
    expect(res.data?.id, 'Support request create missing id');
    return res.data;
  });

  await step('Support request: appears in NGO inbox + status update', async () => {
    const ngoInbox = await requestJson('GET', '/requests/ngo', { token: tokens.ngo, expectedStatus: 200 });
    const inboxHas = (ngoInbox.data || []).some((row) => String(row?.id || '') === String(supportRequest.id));
    expect(inboxHas, 'Support request not visible to selected NGO');

    await requestJson('PUT', `/requests/${supportRequest.id}/status`, {
      token: tokens.ngo,
      body: { status: 'Approved' },
      expectedStatus: 200
    });

    const myRequests = await requestJson('GET', '/requests/my', { token: tokens.user, expectedStatus: 200 });
    const updated = (myRequests.data || []).find((row) => String(row?.id || '') === String(supportRequest.id));
    expect(updated && String(updated.status || '').toLowerCase() === 'approved', 'Support request status did not update for user');
  });

  await step('Messaging: user -> NGO -> user thread roundtrip', async () => {
    await requestJson('POST', `/messages/to-ngo/${ngoMe.id}`, {
      token: tokens.user,
      body: { body: 'Smoke test: hello NGO team!' },
      expectedStatus: 201
    });

    const ngoConversations = await requestJson('GET', '/messages/conversations', {
      token: tokens.ngo,
      expectedStatus: 200
    });
    expect(Array.isArray(ngoConversations.data), 'NGO conversations payload invalid');

    await requestJson('POST', `/messages/to-user/${identities.user.id}`, {
      token: tokens.ngo,
      body: { body: 'Smoke test: hello user, we received your message.' },
      expectedStatus: 201
    });

    const userThread = await requestJson('GET', `/messages/thread/${ngoMe.id}`, {
      token: tokens.user,
      expectedStatus: 200
    });
    const messages = userThread.data?.messages || [];
    expect(Array.isArray(messages) && messages.length > 0, 'User thread missing messages');
    const hasNgoReply = messages.some((m) => m?.senderRole === 'ngo' && String(m?.body || '').includes('we received your message'));
    expect(hasNgoReply, 'NGO reply not present in user thread');
  });

  await step('Flag request: submit + admin approve (best effort)', async () => {
    const candidate = findFirst(ngos, (ngo) => String(ngo?.id || '') !== String(ngoMe.id)) || ngos[0];
    expect(candidate?.id, 'Unable to pick NGO for flag request');

    const create = await requestJson('POST', `/ngos/${candidate.id}/flag-request`, {
      token: tokens.user,
      body: { reason: 'Smoke test moderation request' },
      expectedStatus: [200, 400]
    });

    let requestId = create.data?.request?.id || create.data?.id || null;

    const list = await requestJson('GET', '/admin/flag-requests', {
      token: tokens.admin,
      expectedStatus: 200
    });
    expect(Array.isArray(list.data), 'Admin flag request list payload invalid');

    if (!requestId) {
      // If the create call was rejected due to duplicate pending requests, find an existing pending row.
      const pending = list.data.find((row) => (
        String(row?.targetType || '').toLowerCase() === 'ngo' &&
        String(row?.targetId || '') === String(candidate.id) &&
        String(row?.status || '').toLowerCase() === 'pending'
      ));
      requestId = pending?.id || null;
    }

    if (!requestId) {
      // Don’t fail the full smoke test if moderation request already exists but is not discoverable.
      return;
    }

    await requestJson('PUT', `/admin/flag-requests/${requestId}/approve`, {
      token: tokens.admin,
      body: { note: 'Approved via smoke test' },
      expectedStatus: 200
    });
  });

  await step('Admin webhooks listing', async () => {
    const webhooks = await requestJson('GET', '/admin/webhooks?limit=5', {
      token: tokens.admin,
      expectedStatus: 200
    });
    expect(webhooks.data && typeof webhooks.data === 'object', 'Admin webhooks response invalid');
    expect(Array.isArray(webhooks.data.rows), 'Admin webhooks response missing rows[]');
  });

  await step('Admin webhook metrics', async () => {
    const metrics = await requestJson('GET', '/admin/webhooks/metrics?hours=24', {
      token: tokens.admin,
      expectedStatus: 200
    });
    expect(metrics.data && typeof metrics.data === 'object', 'Admin webhook metrics payload invalid');
    expect(metrics.data.summary && typeof metrics.data.summary === 'object', 'Admin webhook metrics missing summary');
  });

  await step('Admin webhook export (json)', async () => {
    const exported = await requestJson('GET', '/admin/webhooks/export?format=json&limit=5', {
      token: tokens.admin,
      expectedStatus: 200
    });
    expect(exported.data && typeof exported.data === 'object', 'Admin webhook export payload invalid');
    expect(Array.isArray(exported.data.rows), 'Admin webhook export missing rows[]');
  });

  await step('Admin webhook cleanup dry run', async () => {
    const cleanup = await requestJson('POST', '/admin/webhooks/cleanup', {
      token: tokens.admin,
      body: {
        dryRun: true,
        olderThanDays: 30,
        statuses: ['delivered', 'skipped', 'replayed_success'],
        limit: 50
      },
      expectedStatus: 200
    });
    expect(cleanup.data && typeof cleanup.data === 'object', 'Admin webhook cleanup payload invalid');
    expect(cleanup.data.result && typeof cleanup.data.result === 'object', 'Admin webhook cleanup missing result');
  });

  await step('Admin webhook worker status', async () => {
    const status = await requestJson('GET', '/admin/webhooks/worker/status', {
      token: tokens.admin,
      expectedStatus: 200
    });
    expect(status.data && typeof status.data === 'object', 'Webhook worker status payload invalid');
    expect(typeof status.data.enabled === 'boolean', 'Webhook worker status missing enabled flag');
    expect(status.data.runtime && typeof status.data.runtime === 'object', 'Webhook worker status missing runtime');
  });

  await step('Admin webhook worker run (best effort)', async () => {
    await requestJson('POST', '/admin/webhooks/worker/run', {
      token: tokens.admin,
      body: {},
      expectedStatus: [200, 400]
    });
  });

  await step('Admin dashboard snapshot', async () => {
    const dashboard = await requestJson('GET', '/admin/dashboard?noCache=true', {
      token: tokens.admin,
      expectedStatus: 200
    });
    expect(dashboard.data && typeof dashboard.data === 'object', 'Admin dashboard snapshot invalid');
    expect(dashboard.data.supportRequestsSummary, 'Admin dashboard snapshot missing supportRequestsSummary');

    const ssr = await requestText('GET', '/admin/dashboard/ssr?noCache=true', {
      token: tokens.admin,
      expectedStatus: 200
    });
    expect(typeof ssr.data === 'string' && ssr.data.length > 100, 'Admin dashboard SSR HTML response invalid');
  });

  console.log('\nSmoke test completed successfully.');
};

main().catch((err) => {
  console.error('\nSmoke test failed.');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
