#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');

const DEFAULT_API_BASE = 'http://localhost:5001/api';
const API_BASE = String(process.env.API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');

const credentials = {
  admin: {
    email: process.env.SCENARIO_ADMIN_EMAIL || process.env.SMOKE_ADMIN_EMAIL || 'admin@ngoconnect.org',
    password: process.env.SCENARIO_ADMIN_PASSWORD || process.env.SMOKE_ADMIN_PASSWORD || 'password123'
  }
};

const rootDir = path.resolve(__dirname, '../..');
const reportDir = path.join(rootDir, 'docs', 'test-reports');

const toApiUrl = (routePath) => {
  const cleaned = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return `${API_BASE}${cleaned}`;
};

const slugNow = () => new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);

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

const requestMultipart = async (routePath, { token, fields = {}, files = {}, expectedStatus } = {}) => {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }

  for (const [fieldName, filePath] of Object.entries(files)) {
    const content = await fs.readFile(filePath);
    const blob = new Blob([content], { type: 'text/plain' });
    formData.append(fieldName, blob, path.basename(filePath));
  }

  const res = await fetch(toApiUrl(routePath), {
    method: 'POST',
    headers,
    body: formData
  });

  const contentType = String(res.headers.get('content-type') || '');
  const text = await res.text();
  const data = contentType.includes('application/json') && text ? JSON.parse(text) : text;

  const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!allowed.includes(res.status)) {
    const err = new Error(`POST ${routePath} -> ${res.status} (expected ${allowed.join(' or ')})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return { status: res.status, data };
};

const expect = (condition, message, context = {}) => {
  if (!condition) {
    const err = new Error(message);
    err.context = context;
    throw err;
  }
};

const logStep = async (name, fn, report) => {
  process.stdout.write(`- ${name}... `);
  const started = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - started;
    report.steps.push({ name, status: 'passed', durationMs });
    process.stdout.write(`OK (${durationMs}ms)\n`);
    return result;
  } catch (err) {
    const durationMs = Date.now() - started;
    report.steps.push({
      name,
      status: 'failed',
      durationMs,
      error: err.message,
      context: err.context || err.data || null
    });
    process.stdout.write(`FAILED (${durationMs}ms)\n`);
    throw err;
  }
};

const login = async (role) => {
  const creds = credentials[role];
  const res = await requestJson('POST', '/auth/login', {
    body: { email: creds.email, password: creds.password },
    expectedStatus: 200
  });
  if (!res.data?.token) throw new Error(`Token missing for role=${role}`);
  return res.data.token;
};

const writeReport = async (runId, report) => {
  await fs.mkdir(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, `verification_interface_report_${runId}.json`);
  const mdPath = path.join(reportDir, `verification_interface_report_${runId}.md`);

  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = [
    '# Admin Verification Interface Scenario Report',
    '',
    `- Run ID: \`${runId}\``,
    `- Timestamp: \`${report.timestamp}\``,
    `- API Base: \`${report.apiBase}\``,
    `- Status: **${report.status.toUpperCase()}**`,
    '',
    '## Scenario',
    `- NGO ID: ${report.ngo.id || 'n/a'}`,
    `- NGO Email: ${report.ngo.email || 'n/a'}`,
    '',
    '## Assertions',
    ...report.assertions.map((item) => `- ${item}`),
    '',
    '## Steps'
  ];

  for (const step of report.steps) {
    const base = `- ${step.status === 'passed' ? 'PASS' : 'FAIL'} | ${step.name} (${step.durationMs}ms)`;
    lines.push(base);
    if (step.error) lines.push(`  - Error: ${step.error}`);
  }

  await fs.writeFile(mdPath, `${lines.join('\n')}\n`, 'utf8');
  return { jsonPath, mdPath };
};

const main = async () => {
  const runId = slugNow();
  const report = {
    runId,
    timestamp: new Date().toISOString(),
    apiBase: API_BASE,
    status: 'passed',
    ngo: {},
    assertions: [],
    steps: []
  };

  const tempDir = path.join(rootDir, 'backend', 'uploads');
  await fs.mkdir(tempDir, { recursive: true });
  const tempFilePath = path.join(tempDir, `verification_scenario_${runId}.txt`);
  await fs.writeFile(tempFilePath, `Verification scenario run ${runId}\n`, 'utf8');

  try {
    const adminToken = await logStep('Login as admin', () => login('admin'), report);

    const ngoPayload = {
      name: `Verification Scenario NGO ${runId}`,
      email: `verification.scenario.${runId}@example.com`,
      password: 'password123',
      role: 'ngo',
      registrationId: `VS-${runId}`,
      helplineNumber: '9000012345',
      categories: ['Food', 'Health'],
      addressDetails: {
        houseNumber: '101',
        landmark: 'Civic Center',
        district: 'Bengaluru Urban',
        state: 'Karnataka',
        pincode: '560001'
      }
    };

    const registerRes = await logStep('Register scenario NGO', () =>
      requestJson('POST', '/auth/register', { body: ngoPayload, expectedStatus: 201 }), report
    );
    const ngoId = registerRes.data?.ngoId;
    expect(ngoId, 'NGO id missing after registration');
    report.ngo = { id: ngoId, email: ngoPayload.email, name: ngoPayload.name };

    const ngoLoginRes = await logStep('Login as scenario NGO', () =>
      requestJson('POST', '/auth/login', {
        body: { email: ngoPayload.email, password: ngoPayload.password },
        expectedStatus: 200
      }), report
    );
    const ngoToken = ngoLoginRes.data?.token;
    expect(ngoToken, 'Scenario NGO token missing');

    await logStep('Load admin verification queue', async () => {
      const queue = await requestJson('GET', '/admin/ngo-verification-queue?status=all', {
        token: adminToken,
        expectedStatus: 200
      });
      const items = Array.isArray(queue.data?.items) ? queue.data.items : [];
      const createdNgo = items.find((item) => item?.id === ngoId);
      expect(createdNgo, 'Registered NGO not found in verification queue');
      expect(createdNgo.verificationStatus === 'pending', 'New NGO status should be pending', { status: createdNgo.verificationStatus });
      report.assertions.push('Registered NGO appears in queue with pending status.');
    }, report);

    await logStep('Verify with checklist enforcement before docs (expected fail)', async () => {
      const verifyAttempt = await requestJson('POST', `/admin/verify-ngo/${ngoId}`, {
        token: adminToken,
        body: { note: 'Pre-check verification', enforceChecklist: true },
        expectedStatus: 400
      });
      const message = String(verifyAttempt.data?.message || '').toLowerCase();
      expect(message.includes('incomplete') || message.includes('missing'), 'Expected checklist validation message', verifyAttempt.data);
      report.assertions.push('Checklist enforcement blocks verification for incomplete NGO profile.');
    }, report);

    await logStep('Reject NGO with reason and suggestions', async () => {
      const rejectRes = await requestJson('POST', `/admin/reject-ngo/${ngoId}`, {
        token: adminToken,
        body: {
          reason: 'Missing legal verification documents for compliance check.',
          suggestions: 'Upload registration certificate and add organization profile details.',
          note: 'Initial rejection in scenario',
          enforceReason: true
        },
        expectedStatus: 200
      });
      expect(rejectRes.data?.ngo?.verificationStatus === 'rejected', 'NGO status should be rejected after reject route', rejectRes.data);
      report.assertions.push('Rejection endpoint stores rejected status with feedback.');
    }, report);

    await logStep('NGO uploads verification document (resubmission)', async () => {
      const uploadRes = await requestMultipart('/ngos/me/verify', {
        token: ngoToken,
        files: { docs: tempFilePath },
        expectedStatus: 200
      });
      const status = String(uploadRes.data?.ngo?.verificationStatus || '').toLowerCase();
      expect(status === 'pending', 'NGO status should return to pending after document upload', uploadRes.data);
      report.assertions.push('NGO resubmission returns status to pending.');
    }, report);

    await logStep('Verify NGO after resubmission', async () => {
      const verifyRes = await requestJson('POST', `/admin/verify-ngo/${ngoId}`, {
        token: adminToken,
        body: {
          note: 'Approved after document resubmission.',
          enforceChecklist: true
        },
        expectedStatus: 200
      });
      expect(verifyRes.data?.ngo?.verificationStatus === 'approved', 'NGO status should be approved after verification', verifyRes.data);
      expect(verifyRes.data?.ngo?.verified === true, 'verified flag should be true after verification', verifyRes.data);
      report.assertions.push('Admin verification succeeds after checklist conditions are met.');
    }, report);

    await logStep('Queue includes verification history entries', async () => {
      const queue = await requestJson('GET', '/admin/ngo-verification-queue?status=all', {
        token: adminToken,
        expectedStatus: 200
      });
      const items = Array.isArray(queue.data?.items) ? queue.data.items : [];
      const createdNgo = items.find((item) => item?.id === ngoId);
      expect(createdNgo, 'Scenario NGO missing from queue');
      const history = Array.isArray(createdNgo.verificationHistory) ? createdNgo.verificationHistory : [];
      const actions = history.map((entry) => String(entry?.action || '').toLowerCase());
      expect(actions.includes('rejected'), 'History should contain rejected action', { actions });
      expect(actions.includes('approved'), 'History should contain approved action', { actions });
      report.assertions.push('Verification history contains rejected and approved decisions.');
    }, report);

    await logStep('Notifications are accessible for admin and NGO', async () => {
      const [adminNotes, ngoNotes] = await Promise.all([
        requestJson('GET', '/notifications?limit=50', { token: adminToken, expectedStatus: 200 }),
        requestJson('GET', '/notifications?limit=50', { token: ngoToken, expectedStatus: 200 })
      ]);
      const adminHasVerificationNote = (Array.isArray(adminNotes.data) ? adminNotes.data : [])
        .some((note) => String(note?.notificationType || '') === 'ngo_verification_admin' && String(note?.ngoId || '') === ngoId);
      const ngoHasVerificationNote = (Array.isArray(ngoNotes.data) ? ngoNotes.data : [])
        .some((note) => String(note?.notificationType || '') === 'ngo_verification' && String(note?.ngoId || '') === ngoId);
      expect(adminHasVerificationNote, 'Admin verification notification missing');
      expect(ngoHasVerificationNote, 'NGO verification notification missing');
      report.assertions.push('Admin + NGO notifications are generated for verification decisions.');
    }, report);
  } catch (err) {
    report.status = 'failed';
    report.error = err.message;
    report.errorContext = err.context || err.data || null;
  } finally {
    const { jsonPath, mdPath } = await writeReport(runId, report);
    console.log(`\nScenario status: ${report.status.toUpperCase()}`);
    console.log(`JSON report: ${path.relative(rootDir, jsonPath)}`);
    console.log(`Markdown report: ${path.relative(rootDir, mdPath)}`);
  }
};

main().catch((err) => {
  console.error('Fatal scenario error:', err);
  process.exitCode = 1;
});
