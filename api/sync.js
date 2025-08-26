import Redis from 'ioredis';

// Cria o cliente do Redis usando a variável de ambiente REDIS_URL que a Vercel fornece
const redis = new Redis(process.env.REDIS_URL);

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  try {
    const { contactName, dealId, lastMessageIdentifier, syncedBy } = request.body || {};
    const originalKey = contactName || request.query.contactName;

    if (!originalKey) {
      return response.status(400).json({ error: 'O nome do contato (contactName) é obrigatório.' });
    }

    // A lógica de chave híbrida permanece a mesma, pois é robusta
    let finalKey;
    if (originalKey.startsWith('+')) {
      finalKey = originalKey.replace(/\D/g, '');
    } else {
      finalKey = originalKey;
    }

    if (!finalKey) {
        return response.status(400).json({ error: 'O nome do contato fornecido é inválido.' });
    }

    // --- LÓGICA PARA ATUALIZAR (MÉTODO POST) ---
    if (request.method === 'POST') {
        const existingDataString = await redis.get(finalKey);
        const existingData = existingDataString ? JSON.parse(existingDataString) : {};

        const newData = { ...existingData };

        // Atualiza os campos enviados na requisição
        if (dealId !== undefined) newData.dealId = dealId;
        if (lastMessageIdentifier !== undefined) newData.lastMessageIdentifier = lastMessageIdentifier;
        if (syncedBy !== undefined) {
          newData.syncedBy = syncedBy;
          newData.lastSyncTimestamp = new Date().toISOString();
        }
        
        // Salva o objeto como uma string JSON, pois o Redis só armazena texto
        await redis.set(finalKey, JSON.stringify(newData));
        return response.status(200).json({ success: true, savedData: newData });
    }

    // --- LÓGICA PARA OBTER (MÉTODO GET) ---
    if (request.method === 'GET') {
        const dataString = await redis.get(finalKey);
        
        if (!dataString) {
            return response.status(404).json({ message: 'Nenhum status encontrado para este contato.' });
        }
        
        // Converte a string JSON de volta para um objeto antes de enviar
        const data = JSON.parse(dataString);
        return response.status(200).json(data);
    }

    return response.status(405).json({ error: 'Método não permitido.' });

  } catch (error) {
    console.error("[ERRO FATAL NO REDIS/HANDLER]", error);
    return response.status(500).json({ error: 'Erro interno no servidor.', details: error.message });
  }
}