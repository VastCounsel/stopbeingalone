const { createClient } = require('@supabase/supabase-js');

const SB = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Map Stripe Price IDs to subscription tiers
const PRICE_TO_TIER = {
  // Replace these with your actual Stripe Price IDs
  // You can find them in Stripe Dashboard > Products > Pricing
  [process.env.STRIPE_PRICE_MONTHLY]: 'monthly',
  [process.env.STRIPE_PRICE_YEARLY]: 'yearly',
};

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Verify Stripe signature
  let stripeEvent;
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const sig = event.headers['stripe-signature'];

    if (STRIPE_WEBHOOK_SECRET && sig) {
      stripeEvent = stripe.webhooks.constructEvent(event.body, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      // Fallback: parse without verification (dev mode)
      stripeEvent = JSON.parse(event.body);
      console.log('WARNING: No webhook signature verification');
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  console.log('Stripe event:', stripeEvent.type);

  try {
    switch (stripeEvent.type) {

      // ── CHECKOUT COMPLETED ──
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        const customerEmail = session.customer_details?.email || session.customer_email;
        const clientRefId = session.client_reference_id; // Supabase user_id if passed

        console.log('Checkout completed:', { email: customerEmail, client_ref: clientRefId });

        // Determine tier from line items or metadata
        let tier = 'monthly'; // default
        if (session.metadata?.tier) {
          tier = session.metadata.tier;
        } else if (session.amount_total) {
          // Yearly is $349 = 34900 cents, Monthly is $49 = 4900 cents
          tier = session.amount_total >= 30000 ? 'yearly' : 'monthly';
        }

        // Find user by client_reference_id (user_id) or by email
        let userId = clientRefId;

        if (!userId && customerEmail) {
          // Look up user by email in Supabase Auth
          const { data: users } = await SB.auth.admin.listUsers();
          const user = users?.users?.find(u => u.email === customerEmail);
          if (user) {
            userId = user.id;
            console.log('Matched user by email:', userId);
          }
        }

        if (userId) {
          const { error } = await SB.from('user_profiles').update({
            subscription_tier: tier,
            stripe_customer_id: session.customer || null,
          }).eq('user_id', userId);

          if (error) {
            console.error('Failed to update tier:', error);
          } else {
            console.log(`Updated user ${userId} to tier: ${tier}`);
          }
        } else {
          console.error('Could not find user for checkout:', { email: customerEmail, ref: clientRefId });
        }
        break;
      }

      // ── SUBSCRIPTION DELETED (churn) ──
      case 'customer.subscription.deleted': {
        const subscription = stripeEvent.data.object;
        const customerId = subscription.customer;

        console.log('Subscription deleted, customer:', customerId);

        // Find user by stripe_customer_id
        const { data: profiles } = await SB.from('user_profiles')
          .select('user_id')
          .eq('stripe_customer_id', customerId);

        if (profiles?.length) {
          const { error } = await SB.from('user_profiles').update({
            subscription_tier: 'free',
          }).eq('stripe_customer_id', customerId);

          if (error) {
            console.error('Failed to revert tier:', error);
          } else {
            console.log(`Reverted user ${profiles[0].user_id} to free`);
          }
        } else {
          console.error('No user found with stripe_customer_id:', customerId);
        }
        break;
      }

      // ── INVOICE PAYMENT FAILED ──
      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object;
        console.log('Payment failed for customer:', invoice.customer);
        // Could send a notification or flag the account
        break;
      }

      default:
        console.log('Unhandled event type:', stripeEvent.type);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };

  } catch (err) {
    console.error('Webhook processing error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Processing error' }) };
  }
};
