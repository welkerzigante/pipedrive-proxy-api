// api/acToPipe.js (versão com a correção final)

async function apiCall(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
        let errorBody;
        try {
            errorBody = await response.json();
        } catch (e) {
            errorBody = { error: response.statusText };
        }
        throw new Error(`API Error (${response.status}): ${errorBody.error || JSON.stringify(errorBody)}`);
    }
    if (response.status === 204) return null;
    return response.json();
}

export default async function handler(req, res) {
    console.log("--- Nova requisição recebida em /api/acToPipe ---");

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    const {
        PIPEDRIVE_API_TOKEN,
        PIPEDRIVE_COMPANY_DOMAIN,
        AC_API_URL,
        AC_API_KEY,
        PIPEDRIVE_URL_FIELD_ID
    } = process.env;

    if (!PIPEDRIVE_API_TOKEN || !PIPEDRIVE_COMPANY_DOMAIN || !AC_API_URL || !AC_API_KEY || !PIPEDRIVE_URL_FIELD_ID) {
        console.error("ERRO: Variáveis de ambiente não configuradas.");
        return res.status(500).json({ success: false, error: "Variáveis de ambiente não configuradas no servidor." });
    }
    console.log("LOG: Variáveis de ambiente carregadas com sucesso.");

    const { dealId } = req.body;
    if (!dealId) {
        return res.status(400).json({ success: false, error: 'Deal ID é obrigatório.' });
    }
    console.log(`LOG: Processando Deal ID: ${dealId}`);

    try {
        const pipedriveBaseUrl = `https://${PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v1`;
        console.log("LOG: Iniciando chamada 1: GET /deals/{dealId}");
        const dealData = await apiCall(`${pipedriveBaseUrl}/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`);
        
        // --- A CORREÇÃO ESTÁ AQUI ---
        const personId = dealData.data.person_id.id; 
        
        if (!personId) throw new Error('Deal não possui uma pessoa vinculada.');
        console.log(`LOG: Sucesso! Person ID encontrado: ${personId}`);

        console.log("LOG: Iniciando chamada 2: GET /persons/{personId}");
        const personData = await apiCall(`${pipedriveBaseUrl}/persons/${personId}?api_token=${PIPEDRIVE_API_TOKEN}`);
        const email = personData.data.email.find(e => e.primary)?.value;
        if (!email) throw new Error('Pessoa vinculada ao deal não possui email.');
        console.log(`LOG: Sucesso! Email encontrado: ${email}`);

        console.log("LOG: Iniciando chamada 3: GET /contacts?email=...");
        const acContactData = await apiCall(`${AC_API_URL}/api/3/contacts?email=${encodeURIComponent(email)}`, {
            headers: { 'Api-Token': AC_API_KEY }
        });
        if (!acContactData.contacts || acContactData.contacts.length === 0) throw new Error(`Contato com email ${email} não encontrado no ActiveCampaign.`);
        const acContactId = acContactData.contacts[0].id;
        console.log(`LOG: Sucesso! AC Contact ID encontrado: ${acContactId}`);
        
        console.log("LOG: Iniciando chamada 4: GET /contacts/{id}/fieldValues");
        const acFieldValuesData = await apiCall(`${AC_API_URL}/api/3/contacts/${acContactId}/fieldValues`, {
            headers: { 'Api-Token': AC_API_KEY }
        });
        const firstUrlField = acFieldValuesData.fieldValues.find(field => field.field === '1'); // <-- MUDE O '1' SE NECESSÁRIO
        const firstUrl = firstUrlField ? firstUrlField.value : null;
        if (!firstUrl) throw new Error('Não foi possível encontrar a primeira URL de origem no ActiveCampaign.');
        console.log(`LOG: Sucesso! URL encontrada: ${firstUrl}`);

        const updatePayload = { [PIPEDRIVE_URL_FIELD_ID]: firstUrl };
        console.log("LOG: Iniciando chamada 5: PUT /deals/{dealId} para atualizar o campo.");
        await apiCall(`${pipedriveBaseUrl}/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
        });
        console.log("LOG: Sucesso! Deal atualizado no Pipedrive.");

        return res.status(200).json({ success: true, message: `Deal atualizado com a URL: ${firstUrl}` });

    } catch (error) {
        console.error("ERRO na execução:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
}