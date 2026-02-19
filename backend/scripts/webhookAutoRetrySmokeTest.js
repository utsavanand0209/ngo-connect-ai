#!/usr/bin/env node
'use strict';

/* eslint-disable no-console */
const http = require('http');
const { connectDB, close, query } = require('../src/db/postgres');
const { dispatchWebhook } = require('../src/utils/webhookDispatcher');
const { runWebhookAutoRetryTick } = require('../src/utils/webhookAutoRetryWorker');
const { getWebhookDeliveryByExternalId } = require('../src/utils/webhookDeliveryStore');

const EVENT_NAME = 'test.phase6.auto_retry';
const RECEIVER_HOST = '127.0.0.1';
const RECEIVER_PORT = Number(process.env.WEBHOOK_PHASE6_PORT || 5699);
const RECEIVER_PATH = '/phase6-worker-test';
const FAILURE_URL = `http://${RECEIVER_HOST}:${RECEIVER_PORT + 1}/unreachable`;
const SUCCESS_URL = `http://${RECEIVER_HOST}:${RECEIVER_PORT}${RECEIVER_PATH}`;

const readRawBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error('Payload too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const startReceiver = async () => {
  const received = [];
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== RECEIVER_PATH) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    try {
      const raw = await readRawBody(req);
      const parsed = JSON.parse(raw || '{}');
      received.push(parsed);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.statusCode = 500;
      res.end(`Receiver error: ${err.message || 'unknown'}`);
    }
  });

  await new Promise((resolve) => server.listen(RECEIVER_PORT, RECEIVER_HOST, resolve));
  return { server, received };
};

const run = async () => {
  await connectDB(process.env.POSTGRES_URL || process.env.DATABASE_URL);

  process.env.WEBHOOK_ENABLED = 'true';
  process.env.WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'ngo-connect-phase6-smoke-secret';
  process.env.WEBHOOK_TIMEOUT_MS = '1200';
  process.env.WEBHOOK_RETRIES = '1';
  process.env.WEBHOOK_EVENTS = '';

  const runId = `phase6_${Date.now().toString(36)}`;
  let receiverServer = null;
  let receivedPayloads = [];

  try {
    process.env.WEBHOOK_URL = FAILURE_URL;
    const failedDispatch = await dispatchWebhook(EVENT_NAME, {
      runId,
      phase: 'initial-failure'
    });

    expect(!failedDispatch.sent, 'Expected initial dispatch to fail.');
    expect(failedDispatch.logId, 'Expected failed dispatch to be persisted with a log id.');

    const logId = failedDispatch.logId;
    const deadLetter = await getWebhookDeliveryByExternalId(logId);
    expect(deadLetter, 'Dead-letter record not found.');
    expect(String(deadLetter.status || '') === 'dead_letter', `Expected dead_letter status, got ${deadLetter.status}`);

    // Prioritize this record in retry ordering for deterministic smoke behavior.
    await query(
      `
      UPDATE webhook_deliveries_rel
      SET next_retry_at = to_timestamp(0)
      WHERE external_id = $1
      `,
      [logId]
    );

    const receiver = await startReceiver();
    receiverServer = receiver.server;
    receivedPayloads = receiver.received;

    process.env.WEBHOOK_URL = SUCCESS_URL;
    const workerCfg = {
      batchSize: 100,
      replayAttempts: 1,
      backoffBaseMs: 1000,
      backoffMaxMs: 60000,
      alertEnabled: false,
      alertThreshold: 999999,
      alertCooldownMs: 60000,
      alertSampleSize: 3,
      alertEmailTo: [],
      alertSlackUrl: ''
    };

    let replayed = null;
    let tickResult = null;
    for (let i = 0; i < 3; i += 1) {
      tickResult = await runWebhookAutoRetryTick(workerCfg);
      replayed = await getWebhookDeliveryByExternalId(logId);
      if (String(replayed?.status || '') === 'replayed_success') break;
      await sleep(250);
    }

    expect(replayed, 'Replay record missing after worker tick.');
    expect(
      String(replayed.status || '') === 'replayed_success',
      `Expected replayed_success, got ${replayed.status || 'unknown'}`
    );

    const received = receivedPayloads.find(
      (payload) => payload?.event === EVENT_NAME && String(payload?.data?.runId || '') === runId
    );
    expect(received, 'Receiver did not capture replayed webhook payload.');

    console.log('Webhook worker auto-retry smoke test: PASS');
    console.log(`Dead-letter ID: ${logId}`);
    console.log(`Initial failure reason: ${failedDispatch.reason || 'unknown'}`);
    if (tickResult) {
      console.log(
        `Worker tick summary: processed=${Number(tickResult.processed || 0)}, success=${Number(tickResult.succeeded || 0)}, failed=${Number(tickResult.failed || 0)}`
      );
    }
  } finally {
    if (receiverServer) {
      await new Promise((resolve) => receiverServer.close(resolve));
    }
    await close();
  }
};

run().catch((err) => {
  console.error('Webhook worker auto-retry smoke test: FAIL');
  console.error(err?.stack || err?.message || err);
  close().finally(() => process.exit(1));
});
