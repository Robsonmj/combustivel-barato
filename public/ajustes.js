// Ajustes do app que você pode mudar sem mexer no resto do código.
window.AJUSTES = {
  // Supabase (painel do posto, destaques e patrocinadores).
  // Supabase > Project Settings > API: "Project URL" e a chave "anon public" (ou "publishable").
  // Essas duas informações são públicas por natureza: a segurança vem das regras do arquivo supabase/esquema.sql.
  // NUNCA coloque aqui a chave "service_role" / "secret".
  supabaseUrl: 'https://xubjrcujwtzgtjpbzjml.supabase.co',
  supabaseChave: 'sb_publishable_1rz0U7QsJZzm6uy8BY0sSQ_gM7YUvG7',

  // WhatsApp para postos e patrocinadores falarem com você (só números, com DDI e DDD, ex.: 5544999999999).
  // Fica visível no app. Deixe vazio para não mostrar.
  whatsappContato: '5545999213120', // Roy

  // E-mail de contato mostrado nos termos de uso e na política de privacidade.
  emailContato: 'robsonmj@gmail.com',
};
