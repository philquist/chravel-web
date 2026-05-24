/**
 * Manual replay tool for missed Stripe webhooks.
 * Usage:
 *   npx tsx scripts/billing/replay-stripe-webhook.ts evt_123 http://localhost:54321/functions/v1/stripe-webhook
 */
import Stripe from 'stripe';

const [eventId, endpoint] = process.argv.slice(2);

if (!eventId || !endpoint) {
  console.error('Usage: npx tsx scripts/billing/replay-stripe-webhook.ts <eventId> <endpoint>');
  process.exit(1);
}

const secretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!secretKey || !webhookSecret) {
  console.error('Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
  process.exit(1);
}

const stripe = new Stripe(secretKey, { apiVersion: '2025-08-27.basil' });
const event = await stripe.events.retrieve(eventId);
const body = JSON.stringify(event);
const header = await stripe.webhooks.generateTestHeaderStringAsync({
  payload: body,
  secret: webhookSecret,
});

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'stripe-signature': header },
  body,
});

console.log('status', response.status);
console.log(await response.text());
