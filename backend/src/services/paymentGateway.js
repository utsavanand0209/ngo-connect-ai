const crypto = require('crypto');
const https = require('https');

const getActiveProvider = () => {
  const provider = String(process.env.PAYMENT_GATEWAY_PROVIDER || 'mock').trim().toLowerCase();
  if (provider === 'razorpay' && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    return 'razorpay';
  }
  return 'mock';
};

const requestJson = ({ method, hostname, path, headers = {}, body }) =>
  new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      method,
      hostname,
      path,
      headers: {
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        let parsed = {};
        try {
          parsed = responseData ? JSON.parse(responseData) : {};
        } catch (err) {
          parsed = {};
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
          return;
        }
        reject(new Error(parsed.error?.description || parsed.message || 'Gateway request failed'));
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

const createRazorpayOrder = async ({ amountMinor, currency, receipt, notes }) => {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  return requestJson({
    method: 'POST',
    hostname: 'api.razorpay.com',
    path: '/v1/orders',
    headers: {
      Authorization: `Basic ${auth}`
    },
    body: {
      amount: amountMinor,
      currency,
      receipt,
      payment_capture: 1,
      notes: notes || {}
    }
  });
};

const createPaymentOrder = async ({
  amount,
  currency = 'INR',
  receipt,
  metadata = {}
}) => {
  const provider = getActiveProvider();
  const amountMinor = Math.round(Number(amount || 0) * 100);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    throw new Error('Invalid amount for payment order.');
  }

  if (provider === 'razorpay') {
    const order = await createRazorpayOrder({ amountMinor, currency, receipt, notes: metadata });
    return {
      provider: 'razorpay',
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amountMinor: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      status: order.status
    };
  }

  return {
    provider: 'mock',
    orderId: `mock_order_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    amountMinor,
    currency,
    receipt,
    status: 'created'
  };
};

const verifyPayment = ({
  provider,
  orderId,
  paymentId,
  signature
}) => {
  if (!orderId || !paymentId) {
    return { verified: false, reason: 'Missing payment details.' };
  }

  if (provider === 'razorpay') {
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    const verified = signature && expected === signature;
    return {
      verified,
      reason: verified ? '' : 'Invalid payment signature.'
    };
  }

  return { verified: true, reason: '' };
};

module.exports = {
  getActiveProvider,
  createPaymentOrder,
  verifyPayment
};
