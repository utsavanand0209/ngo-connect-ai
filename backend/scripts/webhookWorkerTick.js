/* eslint-disable no-console */
const { connectDB } = require('../src/db/postgres');
const { runWebhookAutoRetryTick, getWorkerConfig } = require('../src/utils/webhookAutoRetryWorker');

const run = async () => {
  await connectDB(process.env.POSTGRES_URL || process.env.DATABASE_URL);
  const cfg = getWorkerConfig();
  if (!cfg.enabled) {
    console.log('Webhook auto-retry worker is disabled. Set WEBHOOK_AUTO_RETRY_ENABLED=true.');
    process.exit(0);
  }

  const result = await runWebhookAutoRetryTick(cfg);
  console.log(JSON.stringify(result, null, 2));
};

run().catch((err) => {
  console.error('Webhook worker tick failed');
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
