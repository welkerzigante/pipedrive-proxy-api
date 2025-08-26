import Redis from 'ioredis';

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

    // --- LÓGICA HÍBRIDA E DEFINITIVA PARA A CHAVE ---
    let finalKey;
    if (originalKey.startsWith('+')) {
      // Se parece um número, limpa e usa só os dígitos
      finalKey = originalKey.replace(/\D/g, '');
    } else {
      // Se for um nome, usa o nome original
      finalKey = originalKey;
    }
    // --- FIM DA LÓGICA HÍBRIDA ---

    if (!finalKey) {
        return response.status(400).json({ error: 'O nome do contato fornecido é inválido.' });
    }

    if (request.method === 'POST') {
        const existingDataString = await redis.get(finalKey);
        const existingData = existingDataString ? JSON.parse(existingDataString) : {};
        const newData = { ...existingData };

        if (dealId !== undefined) newData.dealId = dealId;
        if (lastMessageIdentifier !== undefined) newData.lastMessageIdentifier = lastMessageIdentifier;
        if (syncedBy !== undefined) {
          newData.syncedBy = syncedBy;
          newData.lastSyncTimestamp = new Date().toISOString();
        }
        
        await redis.set(finalKey, JSON.stringify(newData));
        return response.status(200).json({ success: true, savedData: newData });
    }

    if (request.method === 'GET') {
        const dataString = await redis.get(finalKey);
        
        if (!dataString) {
            return response.status(404).json({ message: 'Nenhum status encontrado para este contato.' });
        }
        
        const data = JSON.parse(dataString);
        return response.status(200).json(data);
    }

    return response.status(405).json({ error: 'Método não permitido.' });

  } catch (error) {
    console.error("[ERRO FATAL NO REDIS/HANDLER]", error);
    return response.status(500).json({ error: 'Erro interno no servidor.', details: error.message });
  }
}