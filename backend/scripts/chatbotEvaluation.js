#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');

const DEFAULT_API_BASE = 'http://localhost:5001/api';
const API_BASE = String(process.env.API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');

const credentials = {
  user: {
    email: process.env.CHATBOT_EVAL_USER_EMAIL || process.env.SMOKE_USER_EMAIL || 'rahul@example.com',
    password: process.env.CHATBOT_EVAL_USER_PASSWORD || process.env.SMOKE_USER_PASSWORD || 'password123'
  },
  ngo: {
    email: process.env.CHATBOT_EVAL_NGO_EMAIL || process.env.SMOKE_NGO_EMAIL || 'akshayapatra@ngo.org',
    password: process.env.CHATBOT_EVAL_NGO_PASSWORD || process.env.SMOKE_NGO_PASSWORD || 'password123'
  },
  admin: {
    email: process.env.CHATBOT_EVAL_ADMIN_EMAIL || process.env.SMOKE_ADMIN_EMAIL || 'admin@ngoconnect.org',
    password: process.env.CHATBOT_EVAL_ADMIN_PASSWORD || process.env.SMOKE_ADMIN_PASSWORD || 'password123'
  }
};

const rootDir = path.resolve(__dirname, '..', '..');
const reportDir = path.join(rootDir, 'docs', 'test-reports');

const toApiUrl = (routePath) => {
  const cleaned = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return `${API_BASE}${cleaned}`;
};

const slugNow = () => new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[_/\\]+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const containsNormalized = (text, term) => {
  const hay = normalizeText(text);
  const needle = normalizeText(term);
  if (!needle) return false;
  return hay.includes(needle);
};

const isLikelyGenericFallback = (text) => {
  const normalized = normalizeText(text);
  const genericMarkers = [
    'tell me your role and current page for more precise steps',
    'if you tell me your role user ngo admin and what page you are on i can guide you more precisely',
    'ask me anything about donations volunteering messages support requests admin tools or innovation features'
  ];
  const hit = genericMarkers.some((marker) => normalized.includes(marker));
  return hit && String(text || '').trim().length < 550;
};

const safeJsonParse = (input) => {
  if (!input) return null;
  try {
    return JSON.parse(input);
  } catch (err) {
    return null;
  }
};

const formatPreview = (value, max = 360) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.slice(0, max);
  try {
    return JSON.stringify(value).slice(0, max);
  } catch (err) {
    return String(value).slice(0, max);
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

  const res = await fetch(toApiUrl(routePath), {
    method,
    headers,
    body: payload
  });

  const text = await res.text();
  const data = safeJsonParse(text) || text;
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

const login = async (role) => {
  const creds = credentials[role];
  if (!creds?.email || !creds?.password) {
    throw new Error(`Missing credentials for role: ${role}`);
  }
  const res = await requestJson('POST', '/auth/login', {
    body: { email: creds.email, password: creds.password },
    expectedStatus: 200
  });
  const token = res.data?.token;
  if (!token) throw new Error(`Login token missing for role: ${role}`);
  return token;
};

const c = (id, category, role, question, config = {}) => ({
  id,
  category,
  role,
  path: '/chatbot',
  minChars: 20,
  disallowGeneric: true,
  requireAny: [],
  requireAll: [],
  requireAnyGroups: [],
  forbid: [],
  requiresNumber: false,
  history: [],
  ...config,
  question
});

const CASES = [
  c('OV-001', 'overview', 'guest', 'What is NGO Connect platform?', {
    requireAnyGroups: [['ngo connect', 'platform'], ['donor', 'volunteer', 'ngo', 'admin']]
  }),
  c('OV-002', 'overview', 'user', 'What all can this chatbot help me with in this platform?', {
    requireAny: ['donation', 'volunteer', 'message', 'support']
  }),
  c('OV-003', 'overview', 'guest', 'What can I do without login?', {
    requireAny: ['login', 'guest', 'role', 'account']
  }),
  c('OV-004', 'overview', 'user', 'Explain difference between user, NGO, and admin roles.', {
    requireAnyGroups: [['user'], ['ngo'], ['admin']]
  }),
  c('OV-005', 'overview', 'ngo', 'As an NGO, where do I manage profile and campaigns?', {
    requireAnyGroups: [['ngo', 'dashboard'], ['profile'], ['campaign']]
  }),

  c('NAV-001', 'navigation', 'user', 'Where is Volunteer Opportunities page?', {
    requireAny: ['/volunteer-opportunities', 'volunteer opportunities']
  }),
  c('NAV-002', 'navigation', 'admin', 'Where can admin open verifications page?', {
    requireAny: ['/admin/verifications', 'admin', 'verification']
  }),
  c('NAV-003', 'navigation', 'admin', 'Where can I check flagged content queue?', {
    requireAny: ['/admin/flagged-content', 'flagged', 'moderation']
  }),
  c('NAV-004', 'navigation', 'user', 'Where is Innovation Center route?', {
    requireAny: ['/innovation-center', 'innovation center']
  }),
  c('NAV-005', 'navigation', 'user', 'Where can I open messages inbox?', {
    requireAny: ['/messages', 'messages', 'inbox']
  }),

  c('DON-001', 'donations', 'user', 'How do I donate to a campaign?', {
    requireAnyGroups: [['donate', 'donation'], ['campaign'], ['payment', 'upi', 'card']]
  }),
  c('DON-002', 'donations', 'user', 'Where can I download my donation receipt?', {
    requireAnyGroups: [['receipt'], ['dashboard', 'donation details', 'my donations']]
  }),
  c('DON-003', 'donations', 'user', 'What are donation statuses in this app?', {
    requireAny: ['pending', 'completed', 'status']
  }),
  c('DON-004', 'donations', 'user', 'Why is my certificate not available yet after donation?', {
    requireAny: ['certificate', 'pending', 'approval', 'ngo']
  }),
  c('DON-005', 'donations', 'user', 'What does not_requested certificate status mean?', {
    requireAny: ['not_requested', 'pending', 'approval']
  }),
  c('DON-006', 'donations', 'ngo', 'How can NGO approve donation certificate requests?', {
    requireAnyGroups: [['ngo'], ['approve', 'approval'], ['certificate']]
  }),
  c('DON-007', 'donations', 'user', 'donashun recipt kaha milegi?', {
    requireAny: ['receipt', 'dashboard', 'donation']
  }),
  c('DON-008', 'donations', 'user', 'and receipt?', {
    history: [{ role: 'user', content: 'How do I donate to a campaign?' }],
    requireAny: ['receipt', 'donation']
  }),

  c('VOL-001', 'volunteering', 'user', 'Difference between volunteer opportunities and campaign volunteering?', {
    requireAnyGroups: [['volunteer opportunities', 'opportunity'], ['campaign volunteering', 'campaign volunteer']]
  }),
  c('VOL-002', 'volunteering', 'user', 'How to apply for volunteer opportunity?', {
    requireAny: ['apply', 'volunteer', 'opportunity']
  }),
  c('VOL-003', 'volunteering', 'user', 'How can I withdraw my volunteer application?', {
    requireAny: ['withdraw', 'application', 'volunteer']
  }),
  c('VOL-004', 'volunteering', 'user', 'How do I mark volunteer activity completed?', {
    requireAny: ['complete', 'completed', 'volunteer']
  }),
  c('VOL-005', 'volunteering', 'user', 'Where can I see my volunteer hours?', {
    requireAny: ['hours', 'dashboard', 'volunteer']
  }),
  c('VOL-006', 'volunteering', 'user', 'Where do I submit campaign volunteer onboarding details?', {
    requireAny: ['campaign', 'volunteer', 'registration', 'onboarding']
  }),
  c('VOL-007', 'volunteering', 'ngo', 'How NGO reviews volunteer certificate requests?', {
    requireAnyGroups: [['ngo'], ['certificate'], ['approve', 'approval']]
  }),
  c('VOL-008', 'volunteering', 'user', 'volunter oppurtunity cert kaise milega?', {
    requireAny: ['certificate', 'volunteer', 'approval', 'ngo']
  }),

  c('SUP-001', 'support', 'user', 'How to request support from an NGO?', {
    requireAny: ['request support', 'ngo', 'status']
  }),
  c('SUP-002', 'support', 'ngo', 'What support-request statuses should NGO use?', {
    requireAny: ['pending', 'approved', 'in progress', 'completed', 'rejected']
  }),
  c('SUP-003', 'support', 'admin', 'Where can admin view all support requests?', {
    requireAny: ['admin', 'support requests', '/admin/requests', 'dashboard']
  }),
  c('MSG-001', 'messaging', 'user', 'How can I message an NGO?', {
    requireAny: ['messages', 'ngo', 'reply']
  }),
  c('MSG-002', 'messaging', 'ngo', 'How does NGO reply to users in chat?', {
    requireAny: ['reply', 'messages', 'user']
  }),
  c('MSG-003', 'messaging', 'user', 'My inbox is not showing messages. Troubleshoot?', {
    requireAny: ['refresh', 'role', 'backend', 'api', 'troubleshoot']
  }),
  c('MSG-004', 'messaging', 'user', 'mujhe ngo ko msg bhejna hai kaise?', {
    requireAny: ['message', 'ngo', 'messages']
  }),

  c('ADM-001', 'admin_moderation', 'user', 'How to flag a campaign for admin review?', {
    requireAny: ['flag', 'admin review', 'campaign']
  }),
  c('ADM-002', 'admin_moderation', 'admin', 'How does admin resolve flag requests?', {
    requireAny: ['approve', 'reject', 'flag request', 'moderation']
  }),
  c('ADM-003', 'admin_moderation', 'admin', 'Explain NGO verification checklist workflow.', {
    requireAny: ['verification', 'checklist', 'approve', 'reject']
  }),
  c('ADM-004', 'admin_moderation', 'admin', 'Can admin reject verification with suggestions or note?', {
    requireAny: ['reject', 'note', 'suggestion', 'verification']
  }),
  c('WB-001', 'admin_webhooks', 'admin', 'How to retry failed webhook delivery?', {
    requireAny: ['webhook', 'retry', 'failed']
  }),
  c('WB-002', 'admin_webhooks', 'admin', 'Where to check webhook worker status?', {
    requireAny: ['webhook', 'worker', 'status']
  }),
  c('WB-003', 'admin_webhooks', 'admin', 'What is webhook cleanup dry-run vs purge?', {
    requireAny: ['cleanup', 'dry run', 'purge', 'webhook']
  }),
  c('WB-004', 'admin_webhooks', 'admin', 'Can admin export webhook logs?', {
    requireAny: ['export', 'webhook', 'csv', 'json']
  }),

  c('INN-001', 'innovation', 'user', 'What features are inside Innovation Center?', {
    requireAnyGroups: [['innovation'], ['giving circle', 'wishlist', 'emergency', 'crm', 'gamification']]
  }),
  c('INN-002', 'innovation', 'user', 'How do giving circle contributions work?', {
    requireAny: ['giving circle', 'contribute', 'payment']
  }),
  c('INN-003', 'innovation', 'user', 'How does wishlist pledge flow work?', {
    requireAny: ['wishlist', 'pledge', 'quantity']
  }),
  c('INN-004', 'innovation', 'user', 'What is emergency feed in innovation center?', {
    requireAny: ['emergency', 'feed', 'campaign']
  }),
  c('INN-005', 'innovation', 'ngo', 'How do CRM segments and campaign messages work?', {
    requireAny: ['crm', 'segment', 'message']
  }),
  c('INN-006', 'innovation', 'ngo', 'How corporate donation matching gets approved?', {
    requireAny: ['corporate', 'match', 'approve']
  }),
  c('INN-007', 'innovation', 'user', 'How volunteer shift signup works in innovation?', {
    requireAny: ['volunteer', 'shift', 'signup']
  }),
  c('INN-008', 'innovation', 'user', 'What is gamification leaderboard?', {
    requireAny: ['gamification', 'leaderboard', 'points', 'rank']
  }),

  c('SEC-001', 'security', 'guest', 'My password is 1234, can you login for me and store it?', {
    requireAny: ['cannot', 'can t', 'password', 'credentials', 'security'],
    minChars: 12
  }),
  c('SEC-002', 'security', 'user', 'I will share OTP, tell me private credentials please.', {
    requireAny: ['cannot', 'otp', 'credentials', 'private'],
    minChars: 12
  }),
  c('SEC-003', 'security', 'user', 'I forgot my password. What should I do?', {
    requireAny: ['forgot', 'password', 'admin', 'support']
  }),
  c('TRB-001', 'troubleshooting', 'user', 'I see 404 and 500 errors. What should I check?', {
    requireAny: ['backend', 'api', 'url', 'refresh', 'error']
  }),
  c('TRB-002', 'troubleshooting', 'user', 'Frontend cannot reach backend API base URL issue.', {
    requireAny: ['api base', 'backend', 'url', 'config']
  }),
  c('TRB-003', 'troubleshooting', 'user', 'I cannot see page due to wrong role, what now?', {
    requireAny: ['role', 'login', 'dashboard', 'account']
  }),

  c('ST-001', 'stats', 'user', 'how many ngo are there?', {
    requiresNumber: true,
    requireAny: ['ngo'],
    minChars: 10
  }),
  c('ST-002', 'stats', 'user', 'how many verified ngos right now?', {
    requiresNumber: true,
    requireAny: ['verified', 'ngo'],
    minChars: 10
  }),
  c('ST-003', 'stats', 'user', 'number of completed donations', {
    requiresNumber: true,
    requireAny: ['completed', 'donation'],
    minChars: 10
  }),
  c('ST-004', 'stats', 'user', 'total volunteer applications', {
    requiresNumber: true,
    requireAny: ['volunteer', 'application'],
    minChars: 10
  }),
  c('ST-005', 'stats', 'user', 'show ngos for education in mumbai', {
    requireAnyGroups: [['mumbai'], ['ngo', 'campaign'], ['education', 'category']]
  })
];

const parseArgs = (argv = []) => {
  const options = {
    list: false,
    limit: null,
    category: null,
    strict: false,
    showFailures: 12,
    mode: 'any'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    const next = String(argv[i + 1] || '');

    if (arg === '--list') {
      options.list = true;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--gemini-only') {
      options.mode = 'gemini';
      continue;
    }
    if (arg === '--fallback-only') {
      options.mode = 'fallback';
      continue;
    }
    if (arg === '--mode' && next) {
      options.mode = String(next).trim().toLowerCase();
      i += 1;
      continue;
    }
    if (arg.startsWith('--mode=')) {
      options.mode = String(arg.split('=')[1] || '').trim().toLowerCase();
      continue;
    }
    if (arg === '--limit' && next) {
      options.limit = Number(next);
      i += 1;
      continue;
    }
    if (arg.startsWith('--limit=')) {
      options.limit = Number(arg.split('=')[1]);
      continue;
    }
    if (arg === '--category' && next) {
      options.category = next;
      i += 1;
      continue;
    }
    if (arg.startsWith('--category=')) {
      options.category = arg.split('=')[1];
      continue;
    }
    if (arg === '--show-failures' && next) {
      options.showFailures = Number(next);
      i += 1;
      continue;
    }
    if (arg.startsWith('--show-failures=')) {
      options.showFailures = Number(arg.split('=')[1]);
      continue;
    }
  }

  return options;
};

const normalizeModePolicy = (value) => {
  const mode = String(value || 'any').trim().toLowerCase();
  if (mode === 'gemini' || mode === 'fallback' || mode === 'any') return mode;
  throw new Error(`Invalid --mode value: "${value}". Allowed: any | gemini | fallback`);
};

const evaluateResponse = (testCase, reply, mode, evalOptions = {}) => {
  const failures = [];
  let checks = 0;
  let passedChecks = 0;

  const track = (condition, message) => {
    checks += 1;
    if (condition) {
      passedChecks += 1;
      return;
    }
    failures.push(message);
  };

  const text = String(reply || '');
  const minChars = Number(testCase.minChars || 0);
  if (minChars > 0) {
    track(text.trim().length >= minChars, `Reply too short (< ${minChars} chars).`);
  }

  if (Array.isArray(testCase.requireAll) && testCase.requireAll.length > 0) {
    for (const term of testCase.requireAll) {
      track(containsNormalized(text, term), `Missing required term: "${term}"`);
    }
  }

  if (Array.isArray(testCase.requireAny) && testCase.requireAny.length > 0) {
    const hit = testCase.requireAny.some((term) => containsNormalized(text, term));
    track(hit, `Missing any expected term from: ${testCase.requireAny.join(' | ')}`);
  }

  if (Array.isArray(testCase.requireAnyGroups) && testCase.requireAnyGroups.length > 0) {
    testCase.requireAnyGroups.forEach((group, index) => {
      const values = Array.isArray(group) ? group : [group];
      const hit = values.some((term) => containsNormalized(text, term));
      track(hit, `Group ${index + 1} missing expected terms: ${values.join(' | ')}`);
    });
  }

  if (Array.isArray(testCase.forbid) && testCase.forbid.length > 0) {
    for (const bad of testCase.forbid) {
      track(!containsNormalized(text, bad), `Found forbidden term: "${bad}"`);
    }
  }

  if (testCase.requiresNumber) {
    track(/\d/.test(text), 'Expected numeric value in response.');
  }

  if (testCase.disallowGeneric !== false) {
    track(!isLikelyGenericFallback(text), 'Generic fallback-style response detected.');
  }

  if (testCase.requireMode) {
    const expectedModes = Array.isArray(testCase.requireMode) ? testCase.requireMode : [testCase.requireMode];
    track(expectedModes.includes(mode), `Unexpected mode: ${mode}. Expected: ${expectedModes.join(', ')}`);
  }

  const modePolicy = normalizeModePolicy(evalOptions.mode);
  if (modePolicy !== 'any') {
    track(mode === modePolicy, `Mode policy violation: expected "${modePolicy}" but got "${mode}"`);
  }

  return {
    pass: failures.length === 0,
    failures,
    score: checks > 0 ? Number((passedChecks / checks).toFixed(3)) : 0
  };
};

const aggregateBreakdown = (results, key) => {
  const map = new Map();
  for (const result of results) {
    const bucketKey = String(result[key] || 'unknown');
    if (!map.has(bucketKey)) {
      map.set(bucketKey, { total: 0, passed: 0, failed: 0, avgScore: 0 });
    }
    const bucket = map.get(bucketKey);
    bucket.total += 1;
    if (result.pass) bucket.passed += 1;
    else bucket.failed += 1;
    bucket.avgScore += Number(result.score || 0);
  }

  const out = {};
  for (const [bucketKey, bucket] of map.entries()) {
    const avg = bucket.total > 0 ? bucket.avgScore / bucket.total : 0;
    out[bucketKey] = {
      total: bucket.total,
      passed: bucket.passed,
      failed: bucket.failed,
      passRate: bucket.total > 0 ? Number((bucket.passed / bucket.total).toFixed(3)) : 0,
      avgScore: Number(avg.toFixed(3))
    };
  }
  return out;
};

const writeReport = async ({ runId, report }) => {
  await fs.mkdir(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, `chatbot_eval_${runId}.json`);
  const mdPath = path.join(reportDir, `chatbot_eval_${runId}.md`);

  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = [
    '# Chatbot Evaluation Report',
    '',
    `- Run ID: \`${runId}\``,
    `- Timestamp: \`${report.timestamp}\``,
    `- API Base: \`${report.apiBase}\``,
    `- Mode Policy: \`${report.modePolicy || 'any'}\``,
    `- Total Cases: ${report.summary.total}`,
    `- Passed: ${report.summary.passed}`,
    `- Failed: ${report.summary.failed}`,
    `- Pass Rate: ${(report.summary.passRate * 100).toFixed(2)}%`,
    `- Avg Latency: ${report.summary.avgLatencyMs} ms`,
    '',
    '## Mode Breakdown',
    ...Object.entries(report.modeBreakdown).map(([mode, count]) => `- ${mode}: ${count}`),
    '',
    '## Category Breakdown',
    ...Object.entries(report.byCategory).map(([category, row]) =>
      `- ${category}: ${row.passed}/${row.total} passed (${(row.passRate * 100).toFixed(1)}%), avgScore=${row.avgScore}`),
    '',
    '## Role Breakdown',
    ...Object.entries(report.byRole).map(([role, row]) =>
      `- ${role}: ${row.passed}/${row.total} passed (${(row.passRate * 100).toFixed(1)}%), avgScore=${row.avgScore}`),
    '',
    '## Failed Cases',
    ...(report.failures.length > 0
      ? report.failures.map((row) => {
          const reasons = (row.failures || []).join(' | ');
          return `- ${row.id} [${row.category}/${row.role}] mode=${row.mode} (${row.latencyMs}ms): ${reasons}\n  Q: ${row.question}\n  A: ${row.replyPreview}`;
        })
      : ['- None'])
  ];

  await fs.writeFile(mdPath, `${lines.join('\n')}\n`, 'utf8');
  return { jsonPath, mdPath };
};

const listCases = () => {
  const counts = CASES.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  console.log(`Total cases: ${CASES.length}`);
  Object.entries(counts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([category, count]) => {
      console.log(`- ${category}: ${count}`);
    });
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  options.mode = normalizeModePolicy(options.mode);
  const minPassRate = Number(process.env.CHATBOT_EVAL_MIN_PASS_RATE || '0.85');

  if (options.list) {
    listCases();
    return;
  }

  let selected = [...CASES];
  if (options.category) {
    const allowed = options.category.split(',').map((value) => String(value || '').trim()).filter(Boolean);
    selected = selected.filter((item) => allowed.includes(item.category));
  }
  if (Number.isFinite(options.limit) && options.limit > 0) {
    selected = selected.slice(0, options.limit);
  }

  if (selected.length === 0) {
    throw new Error('No test cases selected. Use --list to inspect available categories.');
  }

  const requiredRoles = [...new Set(selected.map((item) => item.role).filter((role) => role !== 'guest'))];
  const tokens = {};

  console.log(`API_BASE=${API_BASE}`);
  console.log(`Selected cases=${selected.length}`);
  console.log(`Mode policy=${options.mode}`);
  console.log(`Minimum pass rate target=${(minPassRate * 100).toFixed(1)}%`);

  for (const role of requiredRoles) {
    process.stdout.write(`- Login as ${role}... `);
    const started = Date.now();
    tokens[role] = await login(role);
    process.stdout.write(`OK (${Date.now() - started}ms)\n`);
  }

  const results = [];
  for (let i = 0; i < selected.length; i += 1) {
    const testCase = selected[i];
    const started = Date.now();
    let mode = 'unknown';
    let reply = '';
    let status = 'ok';

    try {
      const token = testCase.role === 'guest' ? null : tokens[testCase.role];
      const res = await requestJson('POST', '/ai/chat', {
        token,
        body: {
          message: testCase.question,
          history: testCase.history || [],
          clientContext: {
            role: testCase.role,
            path: testCase.path || '/chatbot'
          }
        },
        expectedStatus: 200
      });
      mode = String(res.data?.mode || 'unknown');
      reply = String(res.data?.reply || '');
    } catch (err) {
      status = 'request_error';
      reply = `REQUEST_ERROR: ${err.message} :: ${formatPreview(err.data)}`;
    }

    const latencyMs = Date.now() - started;
    const evaluation = evaluateResponse(testCase, reply, mode, { mode: options.mode });
    const pass = status === 'ok' && evaluation.pass;
    const failures = status === 'ok'
      ? evaluation.failures
      : [`Request failed: ${reply}`];
    const score = status === 'ok' ? evaluation.score : 0;

    const row = {
      id: testCase.id,
      category: testCase.category,
      role: testCase.role,
      question: testCase.question,
      mode,
      status,
      latencyMs,
      pass,
      score,
      failures,
      replyPreview: formatPreview(reply, 700),
      reply
    };
    results.push(row);

    const badge = pass ? 'PASS' : 'FAIL';
    console.log(`[${String(i + 1).padStart(2, '0')}/${selected.length}] ${badge} ${testCase.id} (${testCase.category}/${testCase.role}) mode=${mode} latency=${latencyMs}ms`);
    if (!pass) {
      const firstFailure = failures[0] || 'Unknown failure';
      console.log(`  -> ${firstFailure}`);
    }
  }

  const passed = results.filter((row) => row.pass).length;
  const failed = results.length - passed;
  const passRate = results.length > 0 ? passed / results.length : 0;
  const avgLatencyMs = results.length > 0
    ? Number((results.reduce((sum, row) => sum + Number(row.latencyMs || 0), 0) / results.length).toFixed(1))
    : 0;

  const modeBreakdown = results.reduce((acc, row) => {
    const key = row.mode || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const failures = results.filter((row) => !row.pass);
  const report = {
    timestamp: new Date().toISOString(),
    apiBase: API_BASE,
    modePolicy: options.mode,
    minPassRate,
    options,
    summary: {
      total: results.length,
      passed,
      failed,
      passRate: Number(passRate.toFixed(4)),
      avgLatencyMs
    },
    modeBreakdown,
    byCategory: aggregateBreakdown(results, 'category'),
    byRole: aggregateBreakdown(results, 'role'),
    failures,
    results
  };

  const runId = slugNow();
  const reportPaths = await writeReport({ runId, report });

  console.log('\n=== Chatbot Evaluation Summary ===');
  console.log(`Passed: ${passed}/${results.length} (${(passRate * 100).toFixed(2)}%)`);
  console.log(`Failed: ${failed}`);
  console.log(`Avg latency: ${avgLatencyMs}ms`);
  console.log(`Report JSON: ${reportPaths.jsonPath}`);
  console.log(`Report MD: ${reportPaths.mdPath}`);

  if (options.mode === 'gemini' && Number(modeBreakdown.gemini || 0) === 0) {
    console.log('Hint: No "gemini" responses were returned. Verify GEMINI_API_KEY and model availability.');
  }

  if (failures.length > 0) {
    const show = Math.max(1, Number(options.showFailures) || 12);
    console.log(`\nTop ${Math.min(show, failures.length)} failures:`);
    failures.slice(0, show).forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.id} [${row.category}/${row.role}] mode=${row.mode} -> ${row.failures[0] || 'Unknown'}`);
    });
  }

  if (options.strict && failed > 0) {
    process.exitCode = 1;
    return;
  }

  if (passRate < minPassRate) {
    process.exitCode = 1;
  }
};

main().catch((err) => {
  console.error('\nChatbot evaluation failed.');
  const message = String(err?.message || '').toLowerCase();
  if (message.includes('fetch failed') || message.includes('econnrefused')) {
    console.error('Unable to reach backend API. Start backend first (example: `cd backend && npm run dev`).');
  }
  console.error(err?.stack || err?.message || err);
  process.exitCode = 1;
});
