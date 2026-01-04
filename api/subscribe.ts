import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const { address, email, chain, symbol } = await req.json();

  if (!address || !email) return new Response('Missing data', { status: 400 });

  const { error } = await supabase
    .from('subscriptions')
    .upsert({ address: address.toLowerCase(), email, chain, symbol }, { onConflict: 'address,email' });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify({ message: 'Subscribed!' }), { status: 200 });
}
