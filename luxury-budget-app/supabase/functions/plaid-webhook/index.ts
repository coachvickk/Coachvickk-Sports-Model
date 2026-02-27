// ============================================================
// Plaid Webhook Handler — Supabase Edge Function
// POST /plaid-webhook
// Handles Plaid webhook events for transaction updates.
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts';

const PLAID_WEBHOOK_SECRET = Deno.env.get('PLAID_WEBHOOK_SECRET');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, plaid-verification',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.text();

    // Verify webhook signature (if secret configured)
    if (PLAID_WEBHOOK_SECRET) {
      const signature = req.headers.get('plaid-verification');
      if (signature) {
        const hmac = createHmac('sha256', PLAID_WEBHOOK_SECRET);
        hmac.update(body);
        const expected = hmac.digest('hex');
        if (signature !== expected) {
          console.warn('Webhook signature mismatch');
          return new Response(JSON.stringify({ error: 'Invalid signature' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    const event = JSON.parse(body);
    console.log('Plaid webhook:', event.webhook_type, event.webhook_code);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Handle transaction webhook events
    if (event.webhook_type === 'TRANSACTIONS') {
      const itemId = event.item_id;

      // Find the account/user for this item
      const { data: accounts } = await supabaseAdmin
        .from('accounts')
        .select('user_id')
        .eq('plaid_item_id', itemId)
        .limit(1);

      if (accounts?.length) {
        const userId = accounts[0].user_id;

        switch (event.webhook_code) {
          case 'SYNC_UPDATES_AVAILABLE':
          case 'INITIAL_UPDATE':
          case 'HISTORICAL_UPDATE':
          case 'DEFAULT_UPDATE': {
            // Log that a sync is needed — the client will trigger the actual sync
            await supabaseAdmin.from('audit_events').insert({
              user_id: userId,
              event_type: 'transaction_sync',
              description: `Plaid webhook: ${event.webhook_code} — new transactions available`,
              metadata: { webhook_code: event.webhook_code, item_id: itemId },
            });
            break;
          }

          case 'TRANSACTIONS_REMOVED': {
            if (event.removed_transactions?.length) {
              await supabaseAdmin
                .from('transactions')
                .delete()
                .in('plaid_transaction_id', event.removed_transactions);
            }
            break;
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
