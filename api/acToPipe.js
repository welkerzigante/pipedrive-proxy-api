// api/acToPipe.js (versão de teste final, sem o parâmetro 'limit')

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

    const { PIPEDRIVE_API_TOKEN, PIPEDRIVE_COMPANY_DOMAIN, AC_API_URL, AC_API_KEY, PIPEDRIVE_URL_FIELD_ID } = process.env;

    if (!PIPEDRIVE_API_TOKEN || !PIPEDRIVE_COMPANY_DOMAIN || !AC_API_URL || !AC_API_KEY || !PIPEDRIVE_URL_FIELD_ID) {
        return res.status(500).json({ success: false, error: "Uma ou mais variáveis de ambiente não estão configuradas." });
    }
    
    const { dealId } = req.body;
    if (!dealId) {
        return res.status(400).json({ success: false, error: 'Deal ID é obrigatório.' });
    }

    try {
        const pipedriveBaseUrl = `https://${PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v1`;
        const dealData = await apiCall(`${pipedriveBaseUrl}/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`);
        const personField = dealData.data.person_id;
        const personId = (typeof personField === 'object' && personField !== null) ? personField.value : personField;
        if (!personId) throw new Error('Deal não possui uma pessoa vinculada.');
        
        const personData = await apiCall(`${pipedriveBaseUrl}/persons/${personId}?api_token=${PIPEDRIVE_API_TOKEN}`);
        const email = personData.data.email.find(e => e.primary)?.value;
        if (!email) throw new Error('Pessoa vinculada ao deal não possui email.');
        
        const acContactData = await apiCall(`${AC_API_URL}/api/3/contacts?email=${encodeURIComponent(email)}`, { headers: { 'Api-Token': AC_API_KEY } });
        if (!acContactData.contacts || acContactData.contacts.length === 0) throw new Error(`Contato com email ${email} não encontrado no ActiveCampaign.`);
        const acContactId = acContactData.contacts[0].id;

        // --- MUDANÇA PARA O TESTE FINAL: REMOVEMOS o parâmetro 'limit' ---
        const trackingLogsUrl = `${AC_API_URL}/api/3/contacts/${acContactId}/trackingLogs`;
        
        const trackingLogsData = await apiCall(trackingLogsUrl, { headers: { 'Api-Token': AC_API_KEY } });
        
        console.log("DADOS BRUTOS RECEBIDOS DA API (SEM LIMIT):", JSON.stringify(trackingLogsData, null, 2));

        if (!trackingLogsData.trackingLogs || trackingLogsData.trackingLogs.length === 0) {
            throw new Error(`Nenhum histórico de navegação (Tracking Log) encontrado para este contato.`);
        }
        
        const pageVisitLogs = trackingLogsData.trackingLogs.filter(log => log.value);
        const sortedLogs = pageVisitLogs.sort((a, b) => new Date(a.tstamp) - new Date(b.tstamp));
        
        if (sortedLogs.length === 0) {
            throw new Error(`Nenhum log de visita a uma página web foi encontrado no histórico.`);
        }
        
        const firstUrl = sortedLogs[0].value;

        const updatePayload = { [PIPEDRIVE_URL_FIELD_ID]: firstUrl };
        await apiCall(`${pipedriveBaseUrl}/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatePayload) });
        
        return res.status(200).json({ success: true, message: `Deal atualizado com a URL: ${firstUrl}` });

    } catch (error) {
        console.error("ERRO na execução:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
}