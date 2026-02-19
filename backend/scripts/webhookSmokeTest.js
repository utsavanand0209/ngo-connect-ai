/* eslint-disable no-console */
const http = require('http');
const { dispatchWebhook, verifyWebhookSignature } = require('../src/utils/webhookDispatcher');

const PORT = 5691;
const HOST = '127.0.0.1';
const PATH = '/webhook-test';

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let buffer = '';
    req.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve({ raw: buffer, parsed: JSON.parse(buffer || '{}') });
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });

const run = async () => {
  const testSecret = 'ngo-connect-webhook-smoke-secret';
  process.env.WEBHOOK_ENABLED = 'true';
  process.env.WEBHOOK_URL = `http://${HOST}:${PORT}${PATH}`;
  process.env.WEBHOOK_SECRET = testSecret;
  process.env.WEBHOOK_TIMEOUT_MS = '2500';
  process.env.WEBHOOK_RETRIES = '1';

  let assertionError = '';
  let received = false;

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== PATH) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    try {
      const { raw, parsed } = await readJsonBody(req);
      const timestamp = String(req.headers['x-ngoconnect-timestamp'] || '');
      const signature = String(req.headers['x-ngoconnect-signature'] || '');
      const isValidSignature = verifyWebhookSignature(testSecret, timestamp, raw, signature);

      if (!parsed || parsed.event !== 'test.webhook.ping') {
        assertionError = 'Unexpected event payload';
      } else if (!isValidSignature) {
        assertionError = 'Signature verification failed';
      } else if (String(parsed?.data?.message || '') !== 'ping') {
        assertionError = 'Unexpected payload body';
      } else {
        received = true;
      }

      res.statusCode = assertionError ? 400 : 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: !assertionError }));
    } catch (err) {
      assertionError = err.message || 'Receiver parse failure';
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: assertionError }));
    }
  });

  await new Promise((resolve) => server.listen(PORT, HOST, resolve));

  try {
    const result = await dispatchWebhook('test.webhook.ping', { message: 'ping' });
    if (!result.sent) {
      throw new Error(`Webhook dispatch failed: ${result.reason || 'unknown'}`);
    }
    if (!received) {
      throw new Error(assertionError || 'Receiver did not confirm payload');
    }
    console.log('Webhook smoke test: PASS');
    console.log(`Delivery ID: ${result.deliveryId}`);
    console.log(`HTTP status: ${result.statusCode}`);
    if (result.logId) {
      console.log(`Log ID: ${result.logId}`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

run().catch((err) => {
  console.error('Webhook smoke test: FAIL');
  console.error(err.message || err);
  process.exit(1);
});
