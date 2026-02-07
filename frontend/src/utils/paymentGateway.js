import { confirmDonationPayment, initiateDonationPayment } from '../services/api';

let razorpayScriptPromise = null;

const loadRazorpayScript = () => {
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
  return razorpayScriptPromise;
};

const createMockPaymentResult = (gatewayOrder) => ({
  provider: 'mock',
  orderId: gatewayOrder.orderId,
  paymentId: `mock_payment_${Date.now().toString(36)}`,
  signature: 'mock_signature'
});

const getMethodConfig = (preferredMethod) => {
  if (preferredMethod === 'upi') {
    return { upi: true, card: false, netbanking: false, wallet: false, emi: false };
  }
  if (preferredMethod === 'card') {
    return { upi: false, card: true, netbanking: false, wallet: false, emi: false };
  }
  if (preferredMethod === 'netbanking') {
    return { upi: false, card: false, netbanking: true, wallet: false, emi: false };
  }
  return { upi: true, card: true, netbanking: true, wallet: true, emi: true };
};

const launchCheckout = async ({
  gatewayOrder,
  donorName,
  donorEmail,
  donorPhone,
  campaignTitle,
  preferredMethod
}) => {
  if (!gatewayOrder || !gatewayOrder.provider) {
    throw new Error('Invalid payment order data.');
  }

  if (gatewayOrder.provider !== 'razorpay') {
    const proceed = window.confirm(
      `Mock checkout: Pay ₹${Number(gatewayOrder.amountMinor || 0) / 100} for "${campaignTitle || 'Campaign'}"?`
    );
    if (!proceed) throw new Error('Payment cancelled by user.');
    return createMockPaymentResult(gatewayOrder);
  }

  const scriptLoaded = await loadRazorpayScript();
  if (!scriptLoaded || !window.Razorpay) {
    throw new Error('Unable to load Razorpay checkout.');
  }

  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: gatewayOrder.keyId,
      amount: gatewayOrder.amountMinor,
      currency: gatewayOrder.currency || 'INR',
      name: 'NGO Connect',
      description: campaignTitle || 'Campaign Donation',
      order_id: gatewayOrder.orderId,
      prefill: {
        name: donorName || '',
        email: donorEmail || '',
        contact: donorPhone || ''
      },
      method: getMethodConfig(preferredMethod),
      theme: {
        color: '#4f46e5'
      },
      handler: (response) => {
        resolve({
          provider: 'razorpay',
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature
        });
      },
      modal: {
        ondismiss: () => reject(new Error('Payment cancelled by user.'))
      }
    });

    checkout.on('payment.failed', () => {
      reject(new Error('Payment failed at gateway.'));
    });

    checkout.open();
  });
};

export const processDonationWithGateway = async ({
  campaignId,
  amount,
  paymentMethod,
  paymentDetails,
  message,
  donorName,
  donorEmail,
  donorPhone,
  campaignTitle,
  preferredMethod
}) => {
  const initiationResponse = await initiateDonationPayment(campaignId, {
    amount,
    paymentMethod,
    paymentDetails,
    message,
    donorName,
    donorEmail,
    donorPhone
  });
  const initiation = initiationResponse.data;

  const paymentResult = await launchCheckout({
    gatewayOrder: initiation.gatewayOrder,
    donorName,
    donorEmail,
    donorPhone,
    campaignTitle,
    preferredMethod
  });

  const confirmationResponse = await confirmDonationPayment(
    initiation.donation.id,
    paymentResult
  );

  return {
    initiation,
    confirmation: confirmationResponse.data
  };
};
