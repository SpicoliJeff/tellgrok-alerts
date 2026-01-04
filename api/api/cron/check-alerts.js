import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const config = { runtime: 'edge' };

export default async function handler() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data: subs } = await supabase.from('subscriptions').select('*');
  if (!subs || subs.length === 0) return new Response('No subscriptions');

  for (const sub of subs) {
    try {
      let gtNetwork = sub.chain.toLowerCase();
      if (gtNetwork === 'bnb chain') gtNetwork = 'bsc';
      if (gtNetwork === 'avalanche') gtNetwork = 'avax';

      const poolsRes = await fetch(`https://api.geckoterminal.com/api/v2/networks/${gtNetwork}/tokens/${sub.address}/pools?page=1`);
      const poolsJson = await poolsRes.json();
      if (!poolsJson.data?.length) continue;

      poolsJson.data.sort((a, b) => parseFloat(b.attributes.reserve_in_usd) - parseFloat(a.attributes.reserve_in_usd));
      const poolAddr = poolsJson.data[0].id.split('/').pop();

      const tradesRes = await fetch(`https://api.geckoterminal.com/api/v2/networks/${gtNetwork}/pools/${poolAddr}/trades?page=1`);
      const tradesJson = await tradesRes.json();
      const trades = tradesJson.data || [];

      const now = Date.now();
      const thirtyMinAgo = now - 30 * 60 * 1000;
      const twentyMinAgo = now - 20 * 60 * 1000;

      const recent30 = trades.filter(t => new Date(t.attributes.tx_time).getTime() > thirtyMinAgo);

      let highSells = 0;
      let similarAmounts = {};

      recent30.forEach(t => {
        const usd = parseFloat(t.attributes.total_price_usd || 0);
        const time = new Date(t.attributes.tx_time).getTime();

        if (t.attributes.type === 'sell' && usd > 5000 && time > twentyMinAgo) highSells++;

        const rounded = Math.round(usd / 50) * 50;
        similarAmounts[rounded] = (similarAmounts[rounded] || 0) + 1;
      });

      const manipulation = Object.values(similarAmounts).some(count => count >= 4);

      if (highSells >= 3 || manipulation) {
        await resend.emails.send({
          from: 'TellGrok Alerts <onboarding@resend.dev>',
          to: sub.email,
          subject: `🚨 Suspicious Activity Detected`,
          text: `Token: ${sub.symbol || sub.address}\nChain: ${sub.chain}\n\n${highSells >= 3 ? `${highSells} large sells in 20 minutes\n` : ''}${manipulation ? 'Multiple trades with similar amounts (possible manipulation)\n' : ''}Check your position immediately!`
        });
      }
    } catch (e) {
      console.error('Error:', e);
    }
  }

  return new Response('Check complete');
}
