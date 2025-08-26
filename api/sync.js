import { createClient } from '@vercel/kv';

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  const { contactName, dealId, lastMessageIdentifier, syncedBy } = request.body;
  const originalKey = contactName || request.query.contactName;

  if (!originalKey) {
    return response.status(400).json({ error: 'O nome do contato (contactName) é obrigatório.' });
  }

  // >>> INÍCIO DA CORREÇÃO <<<
  // Limpa a chave, removendo tudo que não for um dígito numérico.
  // Ex: "+55 48 9908-1334" se torna "554899081334"
  const safeKey = originalKey.replace(/\D/g, ''); 
  // >>> FIM DA CORREÇÃO <<<

  if (!safeKey) {
    return response.status(400).json({ error: 'O nome do contato fornecido é inválido.' });
  }

  if (request.method === 'POST') {
    try {
      const existingData = await kv.get(safeKey) || {};
      const newData = { ...existingData };

      if (dealId !== undefined) newData.dealId = dealId;
      if (lastMessageIdentifier !== undefined) newData.lastMessageIdentifier = lastMessageIdentifier;
      if (syncedBy !== undefined) {
        newData.syncedBy = syncedBy;
        newData.lastSyncTimestamp = new Date().toISOString();
      }

      await kv.set(safeKey, newData); // Usa a chave limpa para salvar
      return response.status(200).json({ success: true, savedData: newData });
    } catch (error) {
      return response.status(500).json({ error: error.message });
    }
  }

  if (request.method === 'GET') {
      try {
          const data = await kv.get(safeKey); // Usa a chave limpa para buscar
          if (!data) {
              return response.status(404).json({ message: 'Nenhum status encontrado para este contato.' });
          }
          return response.status(200).json(data);
      } catch (error) {
          return response.status(500).json({ error: error.message });
      }
  }

  return response.status(405).json({ error: 'Método não permitido.' });
}