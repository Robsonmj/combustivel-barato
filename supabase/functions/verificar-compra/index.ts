// Supabase Edge Function "verificar-compra".
// Recebe { token, produto } do app, consulta a assinatura na Google Play (Play Developer API),
// confirma (acknowledge) a compra quando ainda não foi confirmada e devolve { ativo, expira, produto }.
// Nada é gravado no banco: o token só passa por aqui.
//
// Segredo necessário (Edge Functions > Secrets): PLAY_CONTA_SERVICO = conteúdo do arquivo JSON da
// conta de serviço do Google Cloud que tem acesso ao app no Play Console.
// Publicar com "Verify JWT" desligado (o app chama sem login).

const PACOTE = 'io.github.robsonmj.combustivelbarato';
const PRODUTOS = ['premium_mensal', 'premium_anual'];
const ORIGENS = ['https://robsonmj.github.io', 'http://localhost:3001', 'http://localhost:3000'];

function cors(origem: string | null) {
  return {
    'Access-Control-Allow-Origin': origem && ORIGENS.includes(origem) ? origem : ORIGENS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
    'Content-Type': 'application/json',
  };
}

const b64url = (dados: ArrayBuffer | string) => {
  const bytes = typeof dados === 'string' ? new TextEncoder().encode(dados) : new Uint8Array(dados);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let tokenGoogle: { valor: string; expira: number } | null = null;

/** Token de acesso do Google para a conta de serviço (válido por 1 hora, guardado em memória). */
async function acessoGoogle(): Promise<string> {
  if (tokenGoogle && tokenGoogle.expira > Date.now() + 60_000) return tokenGoogle.valor;
  const conta = JSON.parse(Deno.env.get('PLAY_CONTA_SERVICO') ?? '{}');
  if (!conta.client_email || !conta.private_key) throw new Error('Segredo PLAY_CONTA_SERVICO não configurado');
  const agora = Math.floor(Date.now() / 1000);
  const corpo = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify({
    iss: conta.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600,
  }));
  const pem = conta.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const chave = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(corpo));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: corpo + '.' + b64url(assinatura),
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error('Google recusou a conta de serviço: ' + (d.error_description || d.error));
  tokenGoogle = { valor: d.access_token, expira: Date.now() + d.expires_in * 1000 };
  return tokenGoogle.valor;
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { headers: h });
  const responder = (dados: unknown, status = 200) => new Response(JSON.stringify(dados), { status, headers: h });
  try {
    const { token, produto } = await req.json();
    if (typeof token !== 'string' || token.length < 20 || token.length > 4000 || !PRODUTOS.includes(produto)) {
      return responder({ erro: 'Pedido inválido' }, 400);
    }
    const acesso = await acessoGoogle();
    const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACOTE}/purchases`;
    const r = await fetch(`${base}/subscriptionsv2/tokens/${encodeURIComponent(token)}`, {
      headers: { Authorization: `Bearer ${acesso}` },
    });
    const s = await r.json();
    if (!r.ok) return responder({ ativo: false, erro: s.error?.message || 'Compra não encontrada' }, r.status === 404 || r.status === 410 ? 200 : 502);

    const item = (s.lineItems || []).find((x: { productId: string }) => PRODUTOS.includes(x.productId));
    const ativo = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'].includes(s.subscriptionState) && Boolean(item);

    if (ativo && s.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
      const ack = await fetch(`${base}/subscriptions/${item.productId}/tokens/${encodeURIComponent(token)}:acknowledge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${acesso}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!ack.ok) return responder({ ativo: false, erro: 'Não foi possível confirmar a compra agora' }, 502);
    }
    return responder({ ativo, expira: item?.expiryTime || null, produto: item?.productId || produto });
  } catch (e) {
    return responder({ ativo: false, erro: (e as Error).message }, 500);
  }
});
