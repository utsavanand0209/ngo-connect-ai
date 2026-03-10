#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = require(path.join(rootDir, 'frontend', 'node_modules', 'playwright')));
}

const baseUrl = process.argv[2] || 'http://localhost:3000';
const apiBase = process.argv[3] || 'http://localhost:5001/api';

const outPagesDir = path.join(rootDir, 'assets', 'linkedin', 'screenshots', 'pages');
const outCodeDir = path.join(rootDir, 'assets', 'linkedin', 'screenshots', 'code');
const indexPath = path.join(rootDir, 'docs', 'linkedin', 'screenshots_index.md');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function ensureDirs() {
  await fs.mkdir(outPagesDir, { recursive: true });
  await fs.mkdir(outCodeDir, { recursive: true });
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

async function getToken(email, password) {
  const data = await requestJson(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return data.token;
}

async function clearAuth(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('authChange'));
  });
  await sleep(250);
}

async function setAuth(page, token) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
    window.dispatchEvent(new Event('authChange'));
  }, token);
  await sleep(300);
}

async function captureRoute(page, item) {
  const url = new URL(item.route, baseUrl).toString();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(item.waitMs || 1800);

    if (item.scrollY) {
      await page.evaluate((y) => window.scrollTo(0, y), item.scrollY);
      await sleep(500);
    }

    const target = path.join(outPagesDir, `${item.key}.png`);
    await page.screenshot({ path: target, fullPage: false });
    return { ...item, file: target, ok: true };
  } catch (err) {
    const target = path.join(outPagesDir, `${item.key}__ERROR.png`);
    await page.screenshot({ path: target, fullPage: false }).catch(() => {});
    return { ...item, file: target, ok: false, error: err.message };
  }
}

async function captureCodeShot(page, item) {
  const absPath = path.join(rootDir, item.file);
  const raw = await fs.readFile(absPath, 'utf8');
  const lines = raw.split('\n').slice(0, item.maxLines || 140);
  const numbered = lines
    .map((line, idx) => `${String(idx + 1).padStart(3, ' ')}  ${line}`)
    .join('\n');

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { margin: 0; background: #0b1020; color: #e5e7eb; font-family: Menlo, Consolas, Monaco, monospace; }
  .wrap { padding: 28px 32px; }
  .title { font: 700 24px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #7dd3fc; margin-bottom: 14px; }
  .sub { font: 500 14px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #93c5fd; margin-bottom: 16px; }
  pre { margin: 0; white-space: pre-wrap; line-height: 1.45; font-size: 15px; background: #111827; border: 1px solid #1f2937; border-radius: 14px; padding: 18px; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="title">${escHtml(item.title)}</div>
    <div class="sub">${escHtml(item.file)} (first ${item.maxLines || 140} lines)</div>
    <pre>${escHtml(numbered)}</pre>
  </div>
</body>
</html>`;

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await sleep(350);

  const outFile = path.join(outCodeDir, `${item.key}.png`);
  await page.screenshot({ path: outFile, fullPage: false });
  return { ...item, file: outFile };
}

async function main() {
  await ensureDirs();

  const ngoList = await requestJson(`${apiBase}/ngos`);
  const campaignList = await requestJson(`${apiBase}/campaigns`);

  const ngoId = ngoList?.[0]?.id;
  const campaignId = campaignList?.[0]?.id;

  if (!ngoId || !campaignId) {
    throw new Error('Could not resolve ngoId or campaignId from API.');
  }

  const userToken = await getToken('rahul@example.com', 'password123');
  const ngoToken = await getToken('akshayapatra@ngo.org', 'password123');
  const adminToken = await getToken('admin@ngoconnect.org', 'password123');

  const publicRoutes = [
    { key: '01_home', title: 'Home', route: '/' },
    { key: '02_login', title: 'Login', route: '/login' },
    { key: '03_register', title: 'Register', route: '/register' },
    { key: '04_ngos', title: 'NGO List', route: '/ngos' },
    { key: '05_ngo_profile', title: 'NGO Profile', route: `/ngos/${ngoId}`, waitMs: 2500 },
    { key: '06_ngo_detail_demo', title: 'NGO Detail Demo', route: '/ngo-detail' }
  ];

  const userRoutes = [
    { key: '07_user_discover', title: 'Discover NGOs', route: '/discover' },
    { key: '08_user_map', title: 'Map', route: '/map', waitMs: 3200 },
    { key: '09_user_volunteer_campaigns', title: 'Volunteer Campaigns', route: '/volunteer-campaigns' },
    { key: '10_user_volunteer_opportunities', title: 'Volunteer Opportunities', route: '/volunteer-opportunities' },
    { key: '11_user_donate', title: 'Donate', route: '/donate' },
    { key: '12_user_insights', title: 'Insights', route: '/insights' },
    { key: '13_user_dashboard', title: 'User Dashboard', route: '/dashboard' },
    { key: '14_user_profile', title: 'User Profile', route: '/profile' },
    { key: '15_user_campaigns', title: 'Campaign List', route: '/campaigns' },
    { key: '16_user_campaign_detail', title: 'Campaign Detail', route: `/campaigns/${campaignId}` },
    { key: '17_user_messages', title: 'Messages', route: '/messages' },
    { key: '18_user_innovation', title: 'Innovation Center (User)', route: '/innovation-center', waitMs: 2600 },
    { key: '19_user_chatbot', title: 'Chatbot', route: '/chatbot', waitMs: 2300 },
    { key: '20_user_recommendations', title: 'Recommendations', route: '/recommendations' },
    { key: '21_user_volunteer_redirect', title: 'Volunteer Redirect Route', route: '/volunteer', waitMs: 2200 }
  ];

  const ngoRoutes = [
    { key: '22_ngo_dashboard', title: 'NGO Dashboard', route: '/dashboard', waitMs: 2300 },
    { key: '23_ngo_profile_update', title: 'NGO Profile Update', route: '/ngo/profile', waitMs: 2300 },
    { key: '24_ngo_campaign_create', title: 'Create Campaign', route: '/campaigns/create' },
    { key: '25_ngo_messages', title: 'Messages (NGO)', route: '/messages' },
    { key: '26_ngo_innovation', title: 'Innovation Center (NGO)', route: '/innovation-center', waitMs: 2600 },
    { key: '27_ngo_campaigns', title: 'Campaigns (NGO)', route: '/campaigns' }
  ];

  const adminRoutes = [
    { key: '28_admin_dashboard', title: 'Admin Dashboard', route: '/admin', waitMs: 2300 },
    { key: '29_admin_verifications', title: 'Admin Verifications', route: '/admin/verifications' },
    { key: '30_admin_flagged_content', title: 'Flagged Content', route: '/admin/flagged-content' },
    { key: '31_admin_users', title: 'Admin Users', route: '/admin/users' },
    { key: '32_admin_analytics', title: 'Admin Analytics', route: '/admin/analytics' },
    { key: '33_admin_notifications', title: 'Admin Notifications', route: '/admin/notifications' },
    { key: '34_admin_requests', title: 'Admin Requests', route: '/admin/requests' },
    { key: '35_admin_categories', title: 'Admin Categories', route: '/admin/categories' }
  ];

  const codeShots = [
    { key: 'code_01_app_js', title: 'Frontend Routing', file: 'frontend/src/App.js', maxLines: 160 },
    { key: 'code_02_admin_analytics_js', title: 'Admin Analytics Page', file: 'frontend/src/pages/AdminAnalytics.js', maxLines: 220 },
    { key: 'code_03_innovation_center_js', title: 'Innovation Center Logic', file: 'frontend/src/pages/InnovationCenter.js', maxLines: 220 },
    { key: 'code_04_api_js', title: 'API Service Layer', file: 'frontend/src/services/api.js', maxLines: 220 },
    { key: 'code_05_backend_server_js', title: 'Backend Server Setup', file: 'backend/src/server.js', maxLines: 220 }
  ];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const pageResults = [];

  await clearAuth(page);
  for (const r of publicRoutes) pageResults.push(await captureRoute(page, r));

  await setAuth(page, userToken);
  for (const r of userRoutes) pageResults.push(await captureRoute(page, r));

  await setAuth(page, ngoToken);
  for (const r of ngoRoutes) pageResults.push(await captureRoute(page, r));

  await setAuth(page, adminToken);
  for (const r of adminRoutes) pageResults.push(await captureRoute(page, r));

  const codeResults = [];
  for (const c of codeShots) codeResults.push(await captureCodeShot(page, c));

  await context.close();
  await browser.close();

  const lines = [];
  lines.push('# LinkedIn Screenshot Index');
  lines.push('');
  lines.push('## Frontend Pages');
  lines.push('');

  for (const r of pageResults) {
    const rel = path.relative(rootDir, r.file);
    const status = r.ok ? 'OK' : `ERROR: ${r.error}`;
    lines.push(`- ${r.key} | ${r.title} | ${r.route} | ${status}`);
    lines.push(`  - [${path.basename(r.file)}](/${r.file})`);
  }

  lines.push('');
  lines.push('## Code Screenshots');
  lines.push('');

  for (const c of codeResults) {
    lines.push(`- ${c.key} | ${c.title} | ${c.file.replace(rootDir + '/', '')}`);
    lines.push(`  - [${path.basename(c.file)}](/${c.file})`);
  }

  await fs.writeFile(indexPath, lines.join('\n') + '\n', 'utf8');

  const okCount = pageResults.filter((r) => r.ok).length;
  const failCount = pageResults.length - okCount;

  console.log(`Captured page screenshots: ${okCount}/${pageResults.length} successful, ${failCount} failed.`);
  console.log(`Captured code screenshots: ${codeResults.length}.`);
  console.log(`Index written: ${indexPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
