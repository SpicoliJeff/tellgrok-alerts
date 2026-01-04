import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const { address, email, chain, symbol } = await req.json();

  if (!address || !email) {
    return new Response('Missing address or email', { status: 400 });
  }

  // Save subscription
  const { error } = await supabase
    .from('subscriptions')
    .upsert({ address: address.toLowerCase(), email, chain, symbol }, { onConflict: 'address,email' });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  // Send confirmation email
  try {
    await resend.emails.send({
      from: 'TellGrok Alerts <onboarding@resend.dev>', // Or your verified domain later
      to: email,
      subject: '✅ Confirmed: You’re subscribed to token alerts!',
      html: `
        <h2>Subscription Confirmed!</h2>
        <p>You will now receive email alerts if suspicious activity is detected on:</p>
        <p><strong>Token:</strong> ${symbol || 'Unknown'}<br>
        <strong>Address:</strong> ${address}<br>
        <strong>Chain:</strong> ${chain}</p>
        <p>We check every 15 minutes for large sells, manipulation patterns, and bot activity.</p>
        <p><small>You can unsubscribe anytime by replying to any alert email.</small></p>
        <hr>
        <small>TellGrok.xyz — Stay safe out there.</small>
      `
    });
  } catch (emailError) {
    console.error('Failed to send confirmation email:', emailError);
    // Don't fail the whole request — subscription still saved
  }

  return new Response(JSON.stringify({ message: 'Subscribed and confirmation sent!' }), { status: 200 });
}
