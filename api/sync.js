import { createClient } from '@vercel/kv';

export default async function handler(request, response) {
  // Log inicial para confirmar que a função foi acionada
  console.log(`--- INICIANDO REQUISIÇÃO: ${request.method} ---`);

  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    console.log("Respondendo à requisição OPTIONS.");
    return response.status(200).end();
  }

  try {
    const kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });

    // Log para ver o que recebemos na requisição
    console.log("Query da requisição (GET):", request.query);
    console.log("Corpo da requisição (POST):", request.body);

    const { contactName } = request.body || {};
    const originalKey = contactName || request.query.contactName;

    console.log(`[ETAPA 1] Chave original extraída: "${originalKey}" (Tipo: ${typeof originalKey})`);

    if (!originalKey) {
      console.error("[ERRO] A chave original é nula ou vazia. Retornando 400.");
      return response.status(400).json({ error: 'O nome do contato (contactName) é obrigatório.' });
    }

    let finalKey;
    console.log(`[ETAPA 2] Verificando se a chave começa com '+': ${originalKey.startsWith('+')}`);
    
    if (originalKey.startsWith('+')) {
      finalKey = originalKey.replace(/\D/g, '');
    } else {
      finalKey = originalKey;
    }
    console.log(`[ETAPA 3] Chave final gerada: "${finalKey}"`);

    if (!finalKey) {
        console.error("[ERRO] A chave final é nula ou vazia. Retornando 400.");
        return response.status(400).json({ error: 'O nome do contato fornecido é inválido.' });
    }

    if (request.method === 'POST') {
        const existingData = await kv.get(finalKey) || {};
        await kv.set(finalKey, { ...existingData, ...request.body });
        console.log(`[SUCESSO POST] Dados salvos para a chave: ${finalKey}`);
        return response.status(200).json({ success: true });
    }

    if (request.method === 'GET') {
        const data = await kv.get(finalKey);
        if (!data) {
            console.log(`[INFO GET] Nenhum dado encontrado para a chave: ${finalKey}`);
            return response.status(404).json({ message: 'Nenhum status encontrado.' });
        }
        console.log(`[SUCESSO GET] Dados encontrados para a chave: ${finalKey}`);
        return response.status(200).json(data);
    }

    return response.status(405).json({ error: 'Método não permitido.' });

  } catch (error) {
    console.error("[ERRO FATAL] Ocorreu um erro inesperado na função:", error);
    return response.status(500).json({ error: 'Erro interno no servidor.', details: error.message });
  }
}