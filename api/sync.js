// api/sync.js

export default async function handler(req, res) {
    // Apenas permitir requisições do tipo POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    // Pega as chaves secretas que vamos configurar na Vercel
    const { PIPEDRIVE_API_TOKEN, PIPEDRIVE_COMPANY_DOMAIN } = process.env;

    if (!PIPEDRIVE_API_TOKEN || !PIPEDRIVE_COMPANY_DOMAIN) {
        return res.status(500).json({ success: false, error: "Configuração de API não encontrada no servidor." });
    }

    // Pega os dados que a extensão enviou (ID do Deal e a nota)
    const { dealId, note } = req.body;

    if (!dealId || !note) {
        return res.status(400).json({ success: false, error: 'ID do Deal e a nota são obrigatórios.' });
    }

    const BASE_URL = `https://${PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v1`;

    try {
        // Faz a chamada para a API do Pipedrive, usando a chave secreta
        const notePayload = {
            content: note, // A nota já vem formatada do content_script
            deal_id: parseInt(dealId, 10),
        };

        const noteResponse = await fetch(`${BASE_URL}/notes?api_token=${PIPEDRIVE_API_TOKEN}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(notePayload)
        });

        if (!noteResponse.ok) {
            const errorBody = await noteResponse.json();
            throw new Error(`Erro ao criar anotação: ${errorBody.error || 'Erro desconhecido'}`);
        }

        const noteData = await noteResponse.json();

        // Devolve uma resposta de sucesso para a extensão
        return res.status(200).json({ success: true, activityId: noteData.data.id });

    } catch (error) {
        // Devolve uma resposta de erro para a extensão
        return res.status(500).json({ success: false, error: error.message });
    }
}