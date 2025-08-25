// api/acToPipe.js

// Função auxiliar para simplificar as chamadas de API
async function apiCall(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(`API Error (${response.status}): ${errorBody.error || JSON.stringify(errorBody)}`);
    }
    return response.json();
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    // --- 1. Carregar Variáveis de Ambiente Seguras ---
    const {
        PIPEDRIVE_API_TOKEN,
        PIPEDRIVE_COMPANY_DOMAIN,
        AC_API_URL, // Ex: https://suaconta.api-us1.com
        AC_API_KEY,
        PIPEDRIVE_URL_FIELD_ID // Chave do campo customizado no Pipedrive (ex: a1b2c3d...)
    } = process.env;

    if (!PIPEDRIVE_API_TOKEN || !PIPEDRIVE_COMPANY_DOMAIN || !AC_API_URL || !AC_API_KEY || !PIPEDRIVE_URL_FIELD_ID) {
        return res.status(500).json({ success: false, error: "Variáveis de ambiente não configuradas no servidor." });
    }

    const { dealId } = req.body;
    if (!dealId) {
        return res.status(400).json({ success: false, error: 'Deal ID é obrigatório.' });
    }

    try {
        // --- 2. Buscar o Deal no Pipedrive para pegar o ID da Pessoa ---
        const dealData = await apiCall(`https://${PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v1/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`);
        const personId = dealData.data.person_id;
        if (!personId) {
            throw new Error('Deal não possui uma pessoa vinculada.');
        }

        // --- 3. Buscar a Pessoa no Pipedrive para pegar o Email ---
        const personData = await apiCall(`https://${PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v1/persons/${personId}?api_token=${PIPEDRIVE_API_TOKEN}`);
        const email = personData.data.email.find(e => e.primary)?.value;
        if (!email) {
            throw new Error('Pessoa vinculada ao deal não possui email.');
        }

        // --- 4. Buscar o Contato no ActiveCampaign pelo Email ---
        const acContactData = await apiCall(`${AC_API_URL}/api/3/contacts?email=${encodeURIComponent(email)}`, {
            headers: { 'Api-Token': AC_API_KEY }
        });
        if (!acContactData.contacts || acContactData.contacts.length === 0) {
            throw new Error(`Contato com email ${email} não encontrado no ActiveCampaign.`);
        }
        const acContactId = acContactData.contacts[0].id;
        
        // --- 5. ACHAR A PRIMEIRA URL ACESSADA ---
        // IMPORTANTE: O AC não tem um campo padrão "primeira URL". Geralmente isso é salvo
        // em um CAMPO CUSTOMIZADO. Você precisa descobrir qual é o seu.
        // Vamos buscar todos os campos customizados do contato.
        const acFieldValuesData = await apiCall(`${AC_API_URL}/api/3/contacts/${acContactId}/fieldValues`, {
            headers: { 'Api-Token': AC_API_KEY }
        });
        
        // Você precisa substituir '1' pelo ID do seu campo customizado de "Primeira URL"
        // Para descobrir o ID, vá em Contatos > Campos e veja a lista.
        // Ou, você pode iterar e procurar pelo nome do campo.
        const firstUrlField = acFieldValuesData.fieldValues.find(field => field.field === '1'); // <-- MUDE O '1'
        const firstUrl = firstUrlField ? firstUrlField.value : null;

        if (!firstUrl) {
            throw new Error('Não foi possível encontrar a primeira URL de origem no ActiveCampaign para este contato.');
        }

        // --- 6. Atualizar o Deal no Pipedrive com a URL encontrada ---
        const updatePayload = {
            [PIPEDRIVE_URL_FIELD_ID]: firstUrl
        };

        const updateResponse = await apiCall(`https://${PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v1/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
        });

        // --- 7. Enviar Resposta de Sucesso ---
        return res.status(200).json({ success: true, message: `Deal atualizado com a URL: ${firstUrl}` });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}