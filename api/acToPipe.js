// api/acToPipe.js (Versão de diagnóstico para listar todos os eventos de um contato)

async function apiCall(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
        let errorBody;
        try { errorBody = await response.json(); } catch (e) { errorBody = { error: response.statusText }; }
        throw new Error(`API Error (${response.status}): ${errorBody.error || JSON.stringify(errorBody)}`);
    }
    if (response.status === 204) return null;
    return response.json();
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    const { PIPEDRIVE_API_TOKEN, PIPEDRIVE_COMPANY_DOMAIN, AC_API_URL, AC_API_KEY } = process.env;

    if (!PIPEDRIVE_API_TOKEN || !PIPEDRIVE_COMPANY_DOMAIN || !AC_API_URL || !AC_API_KEY) {
        return res.status(500).json({ success: false, error: "Uma ou mais variáveis de ambiente não estão configuradas." });
    }
    
    const { dealId } = req.body;
    if (!dealId) {
        return res.status(400).json({ success: false, error: 'Deal ID é obrigatório.' });
    }

    try {
        // --- Etapa 1: Buscar o Contato no Pipedrive ---
        const pipedriveBaseUrl = `https://${PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v1`;
        const dealData = await apiCall(`${pipedriveBaseUrl}/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`);
        const personField = dealData.data.person_id;
        const personId = (typeof personField === 'object' && personField !== null) ? personField.value : personField;
        if (!personId) throw new Error('Deal não possui uma pessoa vinculada.');
        
        const personData = await apiCall(`${pipedriveBaseUrl}/persons/${personId}?api_token=${PIPEDRIVE_API_TOKEN}`);
        const email = personData.data.email.find(e => e.primary)?.value;
        if (!email) throw new Error('Pessoa vinculada ao deal não possui email.');
        
        // --- Etapa 2: Encontrar o Contato no ActiveCampaign ---
        const acContactData = await apiCall(`${AC_API_URL}/api/3/contacts?email=${encodeURIComponent(email)}`, { headers: { 'Api-Token': AC_API_KEY } });
        if (!acContactData.contacts || acContactData.contacts.length === 0) throw new Error(`Contato com email ${email} não encontrado no ActiveCampaign.`);
        const acContactId = acContactData.contacts[0].id;

        // --- Etapa 3: Buscar os 100 eventos mais recentes do contato ---
        const trackingLogsUrl = `${AC_API_URL}/api/3/contacts/${acContactId}/trackingLogs?limit=100`;
        const trackingLogsData = await apiCall(trackingLogsUrl, { headers: { 'Api-Token': AC_API_KEY } });

        // --- Etapa 4: Imprimir os dados brutos no log ---
        console.log(`DADOS BRUTOS DO ACTIVE CAMPAIGN PARA O CONTATO ${acContactId}:`, JSON.stringify(trackingLogsData, null, 2));

        // Retorna uma mensagem de sucesso para a extensão, informando que os dados foram logados.
        return res.status(200).json({ 
            success: true, 
            message: `Dados brutos para o contato ${acContactId} foram impressos no log da Vercel. Verifique o painel da Vercel.` 
        });

    } catch (error) {
        console.error("ERRO na execução:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
}