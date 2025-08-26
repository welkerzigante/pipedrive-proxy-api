import { createClient } from '@vercel/kv';

// Conecta ao banco de dados usando as variáveis de ambiente que a Vercel configurou
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(request, response) {
  // Configurações de CORS para permitir que a extensão do Chrome acesse a API
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responde ao "preflight request" do navegador
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // --- LÓGICA PARA ATUALIZAR UM STATUS (MÉTODO POST) ---
  if (request.method === 'POST') {
    const { phoneNumber, dealId, lastMessageIdentifier, syncedBy } = request.body;

    if (!phoneNumber) {
      return response.status(400).json({ error: 'O número de telefone (phoneNumber) é obrigatório.' });
    }

    try {
      // Pega os dados que já existem para não apagar informações (ex: o dealId)
      const existingData = await kv.get(phoneNumber) || {};
      
      const newData = { ...existingData };

      // Atualiza os campos que foram enviados na requisição
      if (dealId !== undefined) newData.dealId = dealId;
      if (lastMessageIdentifier !== undefined) newData.lastMessageIdentifier = lastMessageIdentifier;
      if (syncedBy !== undefined) {
        newData.syncedBy = syncedBy;
        newData.lastSyncTimestamp = new Date().toISOString(); // Adiciona data/hora da sincronização
      }

      // Salva o objeto completo de volta no banco
      await kv.set(phoneNumber, newData);
      
      return response.status(200).json({ success: true, data: newData });
    } catch (error) {
      return response.status(500).json({ success: false, error: error.message });
    }
  }

  // --- LÓGICA PARA OBTER UM STATUS (MÉTODO GET) ---
  if (request.method === 'GET') {
      const { phoneNumber } = request.query;

      if (!phoneNumber) {
          return response.status(400).json({ error: 'O parâmetro phoneNumber é obrigatório.' });
      }
      try {
          const data = await kv.get(phoneNumber);
          if (!data) {
              return response.status(404).json({ message: 'Nenhum status encontrado para este número.' });
          }
          return response.status(200).json(data);
      } catch (error) {
          return response.status(500).json({ success: false, error: error.message });
      }
  }

  return response.status(405).json({ error: 'Método não permitido.' });
}