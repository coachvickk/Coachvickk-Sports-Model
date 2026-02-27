// ============================================================
// Plaid Transaction Sync — Supabase Edge Function
// POST /plaid-sync
// Performs incremental transaction sync using Plaid's /transactions/sync.
// Handles initial 6-month backfill and ongoing updates.
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID')!;
const PLAID_SECRET = Deno.env.get('PLAID_SECRET')!;
const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'sandbox';

const PLAID_BASE_URL =
  PLAID_ENV === 'production'
    ? 'https://production.plaid.com'
    : PLAID_ENV === 'development'
    ? 'https://development.plaid.com'
    : 'https://sandbox.plaid.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get all user accounts
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('user_id', user.id);

    if (accountsError || !accounts?.length) {
      return new Response(JSON.stringify({ error: 'No linked accounts' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalAdded = 0;
    let totalModified = 0;
    let totalRemoved = 0;

    // Group accounts by plaid_item_id (same access_token)
    const itemGroups = new Map<string, typeof accounts>();
    for (const acct of accounts) {
      const group = itemGroups.get(acct.plaid_item_id) || [];
      group.push(acct);
      itemGroups.set(acct.plaid_item_id, group);
    }

    for (const [_itemId, itemAccounts] of itemGroups) {
      const accessToken = itemAccounts[0].access_token;
      let cursor = itemAccounts[0].cursor || '';
      let hasMore = true;

      while (hasMore) {
        const syncResp = await fetch(`${PLAID_BASE_URL}/transactions/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: PLAID_CLIENT_ID,
            secret: PLAID_SECRET,
            access_token: accessToken,
            cursor: cursor || undefined,
            count: 500,
          }),
        });

        const syncData = await syncResp.json();
        if (!syncResp.ok) {
          console.error('Plaid sync error:', syncData);
          break;
        }

        // Build account ID lookup
        const accountIdMap = new Map<string, string>();
        for (const acct of itemAccounts) {
          accountIdMap.set(acct.plaid_account_id, acct.id);
        }

        // Handle ADDED transactions
        if (syncData.added?.length) {
          const toInsert = syncData.added.map((tx: Record<string, unknown>) => ({
            user_id: user.id,
            account_id: accountIdMap.get(tx.account_id as string) || itemAccounts[0].id,
            plaid_transaction_id: tx.transaction_id,
            amount: tx.amount, // Plaid: positive = outflow
            merchant_name: tx.merchant_name,
            name: tx.name,
            date: tx.date,
            pending: tx.pending ?? false,
            plaid_category: Array.isArray(tx.category)
              ? (tx.category as string[]).join(' > ')
              : null,
            plaid_personal_finance_category:
              (tx.personal_finance_category as Record<string, unknown>)?.detailed ?? null,
          }));

          const { error: insertError } = await supabaseAdmin
            .from('transactions')
            .upsert(toInsert, { onConflict: 'plaid_transaction_id' });

          if (insertError) {
            console.error('Insert error:', insertError);
          }
          totalAdded += toInsert.length;
        }

        // Handle MODIFIED transactions
        if (syncData.modified?.length) {
          for (const tx of syncData.modified) {
            await supabaseAdmin
              .from('transactions')
              .update({
                amount: tx.amount,
                merchant_name: tx.merchant_name,
                name: tx.name,
                date: tx.date,
                pending: tx.pending ?? false,
                plaid_personal_finance_category:
                  tx.personal_finance_category?.detailed ?? null,
              })
              .eq('plaid_transaction_id', tx.transaction_id);
          }
          totalModified += syncData.modified.length;
        }

        // Handle REMOVED transactions
        if (syncData.removed?.length) {
          const removedIds = syncData.removed.map(
            (tx: Record<string, unknown>) => tx.transaction_id
          );
          await supabaseAdmin
            .from('transactions')
            .delete()
            .in('plaid_transaction_id', removedIds);
          totalRemoved += removedIds.length;
        }

        // Update cursor on all accounts in this item group
        cursor = syncData.next_cursor;
        hasMore = syncData.has_more;

        for (const acct of itemAccounts) {
          await supabaseAdmin
            .from('accounts')
            .update({
              cursor,
              last_synced_at: new Date().toISOString(),
            })
            .eq('id', acct.id);
        }
      }

      // Update balances
      const balResp = await fetch(`${PLAID_BASE_URL}/accounts/balance/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: PLAID_CLIENT_ID,
          secret: PLAID_SECRET,
          access_token: accessToken,
        }),
      });

      if (balResp.ok) {
        const balData = await balResp.json();
        for (const plaidAcct of balData.accounts) {
          await supabaseAdmin
            .from('accounts')
            .update({
              current_balance: plaidAcct.balances?.current ?? 0,
              available_balance: plaidAcct.balances?.available,
            })
            .eq('plaid_account_id', plaidAcct.account_id);
        }
      }
    }

    // Log audit event
    await supabaseAdmin.from('audit_events').insert({
      user_id: user.id,
      event_type: 'transaction_sync',
      description: `Synced ${totalAdded} new, ${totalModified} modified, ${totalRemoved} removed transactions`,
      metadata: { added: totalAdded, modified: totalModified, removed: totalRemoved },
    });

    return new Response(
      JSON.stringify({
        success: true,
        added: totalAdded,
        modified: totalModified,
        removed: totalRemoved,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
