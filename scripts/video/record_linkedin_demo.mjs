#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
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
const manifestPath = path.join(rootDir, 'video-assets', 'scenes', 'manifest.generated.json');
const rawDir = path.join(rootDir, 'video-assets', 'raw');
const rawVideoPath = path.join(rawDir, 'ngo-connect-automated-raw.webm');
const finalVideoPath = path.join(rootDir, 'video-assets', 'ngo-connect-linkedin-final.mp4');

const credentials = {
  user: { email: 'rahul@example.com', password: 'password123' },
  ngo: { email: 'akshayapatra@ngo.org', password: 'password123' },
  admin: { email: 'admin@ngoconnect.org', password: 'password123' }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readManifest() {
  const content = await fs.readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(content);
  return parsed.scenes || [];
}

async function go(page, route) {
  const url = new URL(route, baseUrl).toString();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(500);
}

async function clearSession(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('authChange'));
  });
  await sleep(300);
}

async function login(page, role) {
  const creds = credentials[role];
  if (!creds) return;
  await go(page, '/login');
  await page.fill('#email', creds.email);
  await page.fill('#password', creds.password);
  await Promise.all([
    page.click('button:has-text("Sign in")'),
    page.waitForLoadState('domcontentloaded')
  ]);
  await sleep(1500);
}

async function softScroll(page, totalPx = 1500, step = 250, stepDelay = 450) {
  let moved = 0;
  while (moved < totalPx) {
    await page.mouse.wheel(0, step);
    moved += step;
    await sleep(stepDelay);
  }
}

async function clickFirstCampaignCard(page) {
  const selector = 'a[href^="/campaigns/"]:not([href="/campaigns/create"])';
  const links = page.locator(selector);
  const count = await links.count();
  if (count > 0) {
    await links.first().click();
    await page.waitForLoadState('domcontentloaded');
    await sleep(1200);
  }
}

async function sceneAction(page, scene) {
  const slug = scene.slug;
  switch (slug) {
    case 'home_intro':
      await go(page, '/');
      await softScroll(page, 1200, 220, 320);
      break;
    case 'user_login':
      await login(page, 'user');
      break;
    case 'discover_ngos': {
      await go(page, '/discover');
      const search = page.locator('input[type="text"]').first();
      if (await search.isVisible().catch(() => false)) {
        await search.fill('health');
        await sleep(700);
        await search.fill('');
      }
      await softScroll(page, 700, 220, 260);
      break;
    }
    case 'ngo_map':
      await go(page, '/map');
      await sleep(2000);
      break;
    case 'campaign_listing':
      await go(page, '/campaigns');
      await sleep(1200);
      await clickFirstCampaignCard(page);
      await softScroll(page, 700, 250, 280);
      break;
    case 'donate_flow':
      await go(page, '/donate');
      await softScroll(page, 800, 220, 260);
      break;
    case 'volunteer_flow':
      await go(page, '/volunteer-opportunities');
      await softScroll(page, 900, 220, 260);
      break;
    case 'user_dashboard_profile':
      await go(page, '/dashboard');
      await sleep(1300);
      await go(page, '/profile');
      await softScroll(page, 600, 220, 260);
      break;
    case 'engagement_modules':
      await go(page, '/messages');
      await sleep(1200);
      await go(page, '/insights');
      await sleep(1000);
      await go(page, '/recommendations');
      await sleep(1000);
      await go(page, '/chatbot');
      await sleep(1000);
      break;
    case 'innovation_center':
      await go(page, '/innovation-center');
      await softScroll(page, 2200, 240, 280);
      break;
    case 'ngo_login':
      await clearSession(page);
      await login(page, 'ngo');
      break;
    case 'ngo_operations':
      await go(page, '/ngo/profile');
      await softScroll(page, 900, 220, 260);
      await go(page, '/campaigns/create');
      await sleep(1400);
      break;
    case 'ngo_updates_analytics':
      await go(page, '/campaigns');
      await clickFirstCampaignCard(page);
      await softScroll(page, 1000, 240, 280);
      break;
    case 'admin_login':
      await clearSession(page);
      await login(page, 'admin');
      break;
    case 'admin_governance':
      await go(page, '/admin');
      await sleep(1200);
      await go(page, '/admin/verifications');
      await sleep(900);
      await go(page, '/admin/flagged-content');
      await sleep(900);
      await go(page, '/admin/analytics');
      await sleep(1100);
      await go(page, '/admin/requests');
      await sleep(900);
      await go(page, '/admin/notifications');
      await sleep(900);
      await go(page, '/admin/categories');
      await sleep(900);
      await go(page, '/admin/users');
      await sleep(900);
      break;
    case 'webhooks_reliability':
      await go(page, '/admin');
      await softScroll(page, 800, 240, 260);
      await go(page, '/');
      await sleep(1200);
      break;
    default:
      await go(page, scene.route || '/');
      await sleep(1500);
      break;
  }
}

function runCommand(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  await ensureDir(rawDir);
  const scenes = await readManifest();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: rawDir, size: { width: 1920, height: 1080 } }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  console.log(`Recording ${scenes.length} scenes...`);

  for (const scene of scenes) {
    const totalMs = Math.round((Number(scene.settle_seconds || 0) + Number(scene.duration_sec || 0) + Number(scene.hold_after_seconds || 0)) * 1000);
    const start = Date.now();
    console.log(`Scene ${scene.id}: ${scene.title}`);
    try {
      await sceneAction(page, scene);
    } catch (err) {
      console.warn(`Scene '${scene.slug}' action error: ${err.message}`);
    }
    const elapsed = Date.now() - start;
    if (elapsed < totalMs) await sleep(totalMs - elapsed);
    if (elapsed > totalMs + 500) {
      console.warn(`Scene '${scene.slug}' exceeded target by ${(elapsed - totalMs)}ms`);
    }
  }

  const video = page.video();
  await context.close();
  await browser.close();

  const recordedPath = await video.path();
  if (await exists(rawVideoPath)) {
    await fs.rm(rawVideoPath, { force: true });
  }
  await fs.copyFile(recordedPath, rawVideoPath);

  console.log(`Raw recorded video: ${rawVideoPath}`);

  await runCommand('python3', ['scripts/video/build_master_audio.py'], rootDir);
  await runCommand('bash', ['scripts/video/export_linkedin_ready.sh', rawVideoPath, finalVideoPath], rootDir);

  console.log(`Final LinkedIn-ready video: ${finalVideoPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
