#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');

const DEFAULT_API_BASE = 'http://localhost:5001/api';
const API_BASE = String(process.env.API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');

const credentials = {
  user: {
    email: process.env.SCENARIO_USER_EMAIL || process.env.SMOKE_USER_EMAIL || 'rahul@example.com',
    password: process.env.SCENARIO_USER_PASSWORD || process.env.SMOKE_USER_PASSWORD || 'password123'
  },
  admin: {
    email: process.env.SCENARIO_ADMIN_EMAIL || process.env.SMOKE_ADMIN_EMAIL || 'admin@ngoconnect.org',
    password: process.env.SCENARIO_ADMIN_PASSWORD || process.env.SMOKE_ADMIN_PASSWORD || 'password123'
  }
};

const rootDir = path.resolve(__dirname, '..', '..');
const reportDir = path.join(rootDir, 'docs', 'test-reports');

const toApiUrl = (routePath) => {
  const cleaned = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return `${API_BASE}${cleaned}`;
};

const slugNow = () => new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);

const formatPreview = (value) => {
  if (value == null) return '';
  if (typeof value === 'string') return value.slice(0, 320);
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch (err) {
    return String(value).slice(0, 320);
  }
};

const requestJson = async (method, routePath, { token, body, expectedStatus } = {}) => {
  const headers = { Accept: 'application/json' };
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(toApiUrl(routePath), { method, headers, body: payload });
  const contentType = String(res.headers.get('content-type') || '');
  const text = await res.text();
  const data = contentType.includes('application/json') && text ? JSON.parse(text) : text;

  const allowed = expectedStatus === undefined
    ? null
    : Array.isArray(expectedStatus)
      ? expectedStatus
      : [expectedStatus];

  if (allowed && !allowed.includes(res.status)) {
    const err = new Error(`${method} ${routePath} -> ${res.status} (expected ${allowed.join(' or ')})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  if (!allowed && !res.ok) {
    const err = new Error(`${method} ${routePath} -> ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return { status: res.status, data };
};

const logStep = async (name, fn) => {
  process.stdout.write(`- ${name}... `);
  const started = Date.now();
  const result = await fn();
  process.stdout.write(`OK (${Date.now() - started}ms)\n`);
  return result;
};

const login = async (role) => {
  const creds = credentials[role];
  if (!creds?.email || !creds?.password) {
    throw new Error(`Missing credentials for role=${role}`);
  }
  const res = await requestJson('POST', '/auth/login', {
    body: { email: creds.email, password: creds.password },
    expectedStatus: 200
  });
  if (!res.data?.token) {
    throw new Error(`Login token missing for role=${role}`);
  }
  return res.data.token;
};

const submitCampaignFlagRequest = async ({ token, reason }) => {
  const campaignsRes = await requestJson('GET', '/campaigns', { expectedStatus: 200 });
  const campaigns = Array.isArray(campaignsRes.data) ? campaignsRes.data : [];
  for (const campaign of campaigns) {
    if (!campaign?.id || campaign?.flagged) continue;
    try {
      const res = await requestJson('POST', `/campaigns/${campaign.id}/flag-request`, {
        token,
        body: { reason },
        expectedStatus: 200
      });
      return {
        targetType: 'campaign',
        targetId: campaign.id,
        targetName: campaign.title || campaign.id,
        requestId: res.data?.request?.id || null
      };
    } catch (err) {
      if (err.status === 400) continue;
      throw err;
    }
  }
  throw new Error('Unable to submit campaign flag request: no eligible campaign target found.');
};

const writeReport = async (runId, report) => {
  await fs.mkdir(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, `role_workflow_report_${runId}.json`);
  const mdPath = path.join(reportDir, `role_workflow_report_${runId}.md`);

  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = [
    '# Role Workflow Report',
    '',
    `- Run ID: \`${runId}\``,
    `- Timestamp: \`${report.timestamp}\``,
    `- API Base: \`${report.apiBase}\``,
    '',
    '## Created NGOs',
    ...report.createdNgos.map((ngo, idx) => `- ${idx + 1}. ${ngo.name} (${ngo.id}) - ${ngo.email}`),
    '',
    '## Verification Summary',
    `- Pending before: ${report.verification.pendingBefore}`,
    `- Pending after: ${report.verification.pendingAfter}`,
    `- Verified IDs: ${report.verification.verifiedIds.join(', ') || 'none'}`,
    `- Rejected IDs: ${report.verification.rejectedIds.join(', ') || 'none'}`,
    '',
    '## Flag Moderation Summary',
    ...report.flagging.submitted.map((req, idx) =>
      `- Submitted ${idx + 1}: ${req.targetType} ${req.targetName} (${req.targetId}) request=${req.requestId}`),
    ...report.flagging.resolved.map((item, idx) =>
      `- Resolved ${idx + 1}: request=${item.requestId} action=${item.action} status=${item.finalStatus || 'unknown'}`),
    '',
    `- Flagged NGO count (admin view): ${report.flagging.flaggedNgoCount}`,
    `- Flagged campaign count (admin view): ${report.flagging.flaggedCampaignCount}`
  ];

  await fs.writeFile(mdPath, `${lines.join('\n')}\n`, 'utf8');
  return { jsonPath, mdPath };
};

const main = async () => {
  const runId = slugNow();
  console.log(`API_BASE=${API_BASE}`);
  console.log(`Run ID=${runId}`);

  const userToken = await logStep('Login as user', () => login('user'));
  const adminToken = await logStep('Login as admin', () => login('admin'));

  const categoriesRes = await logStep('Load categories', () =>
    requestJson('GET', '/categories/all', { expectedStatus: 200 })
  );
  const categoryNames = (Array.isArray(categoriesRes.data) ? categoriesRes.data : [])
    .map((item) => item?.name)
    .filter(Boolean);
  const selectedCategories = categoryNames.slice(0, 2);
  if (selectedCategories.length === 0) selectedCategories.push('Other');

  const createdNgos = [];
  const ngoPasswords = [];

  for (let index = 1; index <= 3; index += 1) {
    const suffix = `${runId}${index}`;
    const payload = {
      name: `Scenario NGO ${index} ${runId}`,
      email: `scenario.ngo.${suffix}@example.com`,
      password: 'password123',
      role: 'ngo',
      registrationId: `SCN-${suffix}`,
      helplineNumber: `90000${String(index).padStart(5, '0')}`,
      categories: selectedCategories,
      addressDetails: {
        houseNumber: `${index}/10`,
        landmark: `Scenario Block ${index}`,
        district: 'Bengaluru Urban',
        state: 'Karnataka',
        pincode: '560001'
      }
    };

    const created = await logStep(`Register NGO ${index}`, () =>
      requestJson('POST', '/auth/register', { body: payload, expectedStatus: 201 })
    );

    const ngoId = created.data?.ngoId;
    if (!ngoId) throw new Error(`NGO ID missing for index=${index}`);

    createdNgos.push({ id: ngoId, name: payload.name, email: payload.email });
    ngoPasswords.push({ email: payload.email, password: payload.password });
  }

  for (const ngoCreds of ngoPasswords) {
    await logStep(`Login check for ${ngoCreds.email}`, async () => {
      await requestJson('POST', '/auth/login', {
        body: ngoCreds,
        expectedStatus: 200
      });
    });
  }

  const pendingBefore = await logStep('Load pending NGO registrations (before verify/reject)', async () => {
    const res = await requestJson('GET', '/admin/ngo-registrations', {
      token: adminToken,
      expectedStatus: 200
    });
    return Array.isArray(res.data) ? res.data : [];
  });

  const verifiedIds = [];
  const rejectedIds = [];

  for (const ngo of createdNgos.slice(0, 2)) {
    await logStep(`Verify NGO ${ngo.id}`, async () => {
      await requestJson('POST', `/admin/verify-ngo/${ngo.id}`, {
        token: adminToken,
        expectedStatus: 200
      });
    });
    verifiedIds.push(ngo.id);
  }

  const rejectedNgo = createdNgos[2];
  await logStep(`Reject NGO ${rejectedNgo.id}`, async () => {
    await requestJson('POST', `/admin/reject-ngo/${rejectedNgo.id}`, {
      token: adminToken,
      expectedStatus: 200
    });
  });
  rejectedIds.push(rejectedNgo.id);

  const pendingAfter = await logStep('Load pending NGO registrations (after verify/reject)', async () => {
    const res = await requestJson('GET', '/admin/ngo-registrations', {
      token: adminToken,
      expectedStatus: 200
    });
    return Array.isArray(res.data) ? res.data : [];
  });

  const submittedRequests = [];

  for (const ngo of createdNgos.slice(0, 2)) {
    const reason = `Scenario-${runId}: user requested review for NGO ${ngo.id}`;
    const res = await logStep(`Submit NGO flag request (${ngo.id})`, () =>
      requestJson('POST', `/ngos/${ngo.id}/flag-request`, {
        token: userToken,
        body: { reason },
        expectedStatus: 200
      })
    );
    submittedRequests.push({
      targetType: 'ngo',
      targetId: ngo.id,
      targetName: ngo.name,
      requestId: res.data?.request?.id || null
    });
  }

  const campaignRequest = await logStep('Submit campaign flag request', () =>
    submitCampaignFlagRequest({
      token: userToken,
      reason: `Scenario-${runId}: user requested review for campaign`
    })
  );
  submittedRequests.push(campaignRequest);

  const pendingFlagRequests = await logStep('Load pending flag requests', async () => {
    const res = await requestJson('GET', '/admin/flag-requests?status=pending', {
      token: adminToken,
      expectedStatus: 200
    });
    return Array.isArray(res.data) ? res.data : [];
  });

  const scenarioPending = pendingFlagRequests.filter((req) =>
    submittedRequests.some((item) => item.requestId && item.requestId === req.id)
  );

  const resolved = [];
  const resolutionPlan = [
    { action: 'approve', requestId: scenarioPending[0]?.id || submittedRequests[0]?.requestId },
    { action: 'approve', requestId: scenarioPending[1]?.id || submittedRequests[1]?.requestId },
    { action: 'reject', requestId: scenarioPending[2]?.id || submittedRequests[2]?.requestId }
  ].filter((item) => Boolean(item.requestId));

  for (const item of resolutionPlan) {
    const route = item.action === 'approve'
      ? `/admin/flag-requests/${item.requestId}/approve`
      : `/admin/flag-requests/${item.requestId}/reject`;
    const response = await logStep(`${item.action.toUpperCase()} flag request ${item.requestId}`, () =>
      requestJson('PUT', route, {
        token: adminToken,
        body: { note: `Scenario ${runId}: ${item.action}` },
        expectedStatus: 200
      })
    );
    resolved.push({
      requestId: item.requestId,
      action: item.action,
      finalStatus: response.data?.request?.status || null
    });
  }

  const [flaggedNgoRes, flaggedCampaignRes, finalRequestsRes] = await Promise.all([
    logStep('Load flagged NGOs', () => requestJson('GET', '/admin/flagged-ngos', { token: adminToken, expectedStatus: 200 })),
    logStep('Load flagged campaigns', () => requestJson('GET', '/admin/flagged-campaigns', { token: adminToken, expectedStatus: 200 })),
    logStep('Load final flag requests snapshot', () => requestJson('GET', '/admin/flag-requests', { token: adminToken, expectedStatus: 200 }))
  ]);

  const finalRequests = Array.isArray(finalRequestsRes.data) ? finalRequestsRes.data : [];
  const requestStatusById = Object.fromEntries(
    finalRequests
      .filter((req) => req?.id)
      .map((req) => [req.id, req.status || null])
  );

  const report = {
    runId,
    timestamp: new Date().toISOString(),
    apiBase: API_BASE,
    createdNgos,
    verification: {
      pendingBefore: pendingBefore.length,
      pendingAfter: pendingAfter.length,
      createdNgosFoundInPendingBefore: createdNgos
        .filter((ngo) => pendingBefore.some((row) => row.id === ngo.id))
        .map((ngo) => ngo.id),
      createdNgosFoundInPendingAfter: createdNgos
        .filter((ngo) => pendingAfter.some((row) => row.id === ngo.id))
        .map((ngo) => ngo.id),
      verifiedIds,
      rejectedIds
    },
    flagging: {
      submitted: submittedRequests,
      resolved: resolved.map((item) => ({
        ...item,
        finalStatus: requestStatusById[item.requestId] || item.finalStatus
      })),
      flaggedNgoCount: Array.isArray(flaggedNgoRes.data) ? flaggedNgoRes.data.length : 0,
      flaggedCampaignCount: Array.isArray(flaggedCampaignRes.data) ? flaggedCampaignRes.data.length : 0
    }
  };

  const reportFiles = await writeReport(runId, report);

  console.log('Scenario complete.');
  console.log(`Created NGOs: ${createdNgos.length}`);
  console.log(`Verified: ${verifiedIds.length}, Rejected: ${rejectedIds.length}`);
  console.log(`Submitted flag requests: ${submittedRequests.length}, Resolved: ${resolved.length}`);
  console.log(`Report JSON: ${reportFiles.jsonPath}`);
  console.log(`Report MD: ${reportFiles.mdPath}`);
};

main().catch((err) => {
  console.error('Scenario failed:', err.message);
  if (err.data !== undefined) {
    console.error('Response preview:', formatPreview(err.data));
  }
  process.exitCode = 1;
});
