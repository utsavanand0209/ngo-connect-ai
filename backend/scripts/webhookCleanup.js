#!/usr/bin/env node
'use strict';

/* eslint-disable no-console */
const { connectDB, close } = require('../src/db/postgres');
const { cleanupWebhookDeliveries } = require('../src/utils/webhookDeliveryStore');

const parseBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  const raw = String(value || '').trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(raw)) return false;
  return fallback;
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const run = async () => {
  await connectDB(process.env.POSTGRES_URL || process.env.DATABASE_URL);

  const olderThanDays = parsePositiveInt(process.env.WEBHOOK_CLEANUP_DAYS, 30);
  const limit = parsePositiveInt(process.env.WEBHOOK_CLEANUP_LIMIT, 2000);
  const dryRun = parseBoolean(process.env.WEBHOOK_CLEANUP_DRY_RUN, true);
  const statuses = String(process.env.WEBHOOK_CLEANUP_STATUSES || 'delivered,skipped,replayed_success')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const result = await cleanupWebhookDeliveries({
    olderThanDays,
    limit,
    dryRun,
    statuses
  });

  console.log(JSON.stringify(result, null, 2));
};

run()
  .catch((err) => {
    console.error('Webhook cleanup failed');
    console.error(err?.stack || err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close();
  });
