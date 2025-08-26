// api/sync.js

export default async function handler(request, response) {
  // Pega as credenciais seguras das Variáveis de Ambiente
  const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY;
  const PIPEDRIVE_COMPANY_DOMAIN = process.env.PIPEDRIVE_COMPANY_DOMAIN;

  // Verifica se as credenciais foram configuradas na Vercel
  if (!PIPEDRIVE_API_KEY || !PIPEDRIVE_COMPANY_DOMAIN) {
    return response.status(500).json({ success: false, error: "As credenciais do Pipedrive não estão configuradas no servidor." });
  }

  // Pega os dados enviados pelo plugin (dealId e a nota)
  const { dealId, note } = request.body;

  if (!dealId || !note) {
    return response.status(400).json({ success: false, error: "ID do Deal e Nota são obrigatórios." });
  }

  try {
    // Monta a URL da API do Pipedrive
    const url = `https://${PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/v1/notes?api_token=${PIPEDRIVE_API_KEY}`;

    // Faz a chamada para a API do Pipedrive para criar a nota
    const pipedriveResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: note,
        deal_id: dealId,
      }),
    });

    const data = await pipedriveResponse.json();

    if (!pipedriveResponse.ok) {
      // Se o Pipedrive retornar um erro, repassa esse erro
      throw new Error(data.error || 'Erro desconhecido do Pipedrive.');
    }

    // Se tudo deu certo, retorna sucesso e o ID da atividade criada
    return response.status(200).json({ success: true, activityId: data.data.id });

  } catch (error) {
    // Se qualquer coisa der errado, retorna uma mensagem de erro clara
    return response.status(500).json({ success: false, error: error.message });
  }
}