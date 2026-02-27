// ============================================================
// Plaid Token Exchange — Supabase Edge Function
// POST /plaid-exchange
// Exchanges public token for access token and stores account data.
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

    const { public_token } = await req.json();
    if (!public_token) {
      return new Response(JSON.stringify({ error: 'Missing public_token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Exchange public token for access token
    const exchangeResp = await fetch(`${PLAID_BASE_URL}/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        public_token,
      }),
    });

    const exchangeData = await exchangeResp.json();
    if (!exchangeResp.ok) {
      console.error('Plaid exchange error:', exchangeData);
      return new Response(JSON.stringify({ error: 'Token exchange failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { access_token, item_id } = exchangeData;

    // Get account info
    const accountsResp = await fetch(`${PLAID_BASE_URL}/accounts/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        access_token,
      }),
    });

    const accountsData = await accountsResp.json();
    if (!accountsResp.ok) {
      console.error('Plaid accounts error:', accountsData);
      return new Response(JSON.stringify({ error: 'Failed to fetch accounts' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role client to bypass RLS for writing
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Store accounts
    const accountsToInsert = accountsData.accounts.map((acct: Record<string, unknown>) => ({
      user_id: user.id,
      plaid_item_id: item_id,
      plaid_account_id: acct.account_id,
      access_token,
      name: acct.name,
      official_name: acct.official_name,
      type: acct.type,
      subtype: acct.subtype,
      mask: acct.mask,
      current_balance: (acct.balances as Record<string, unknown>)?.current ?? 0,
      available_balance: (acct.balances as Record<string, unknown>)?.available,
      iso_currency_code: (acct.balances as Record<string, unknown>)?.iso_currency_code ?? 'USD',
    }));

    const { error: insertError } = await supabaseAdmin
      .from('accounts')
      .upsert(accountsToInsert, { onConflict: 'plaid_account_id' });

    if (insertError) {
      console.error('DB insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to store accounts' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Seed default categories if first account
    const { count } = await supabaseAdmin
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (!count || count === 0) {
      await supabaseAdmin.rpc('seed_default_categories', { p_user_id: user.id });
    }

    return new Response(
      JSON.stringify({
        success: true,
        accounts_linked: accountsToInsert.length,
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
