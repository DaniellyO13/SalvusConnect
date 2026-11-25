
// SalvusConnect — Detalhes do prestador e agendamento.

// Estado da página.
let prestadorSelecionado = null;
let servicoSelecionado = null;
let servicosCatalogo = [];
let csrfToken = null;

/* Preços fixos definidos pelo SalvusConnect. */
const precosServicos = {
  'caminhada matinal': 100,
  'acompanhamento para exames': 150,
  'transporte para pronto-socorro': 200,
  'transporte para consultas': 300,
  'acompanhamento hospitalar': 90,
  'cuidado noturno': 80,
  'apoio domiciliar': 250,
  'compras e mandados': 120,
  'acompanhamento em viagens': 180,
  'visita e companhia': 130
};

function getParametroUrl(param) {
  return new URLSearchParams(window.location.search).get(param);
}

/* Obtém o token CSRF da sessão. */
async function obterTokenCSRF() {
  const resposta = await fetch(
    '../php/agendamentos.php?acao=csrf',
    {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }
  );

  const texto = await resposta.text();
  let dados;

  try {
    dados = JSON.parse(texto);
  } catch {
    console.error(
      'Resposta inválida ao obter token CSRF:',
      texto
    );
    throw new Error('Não foi possível validar a segurança da solicitação.');
  }

  if (
    !resposta.ok ||
    !dados.sucesso ||
    typeof dados.csrf_token !== 'string' ||
    !dados.csrf_token
  ) {
    throw new Error(
      dados.mensagem ||
      'Não foi possível obter o token de segurança.'
    );
  }

  csrfToken = dados.csrf_token;

  return csrfToken;
}

function escaparHTML(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, caractere => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[caractere]);
}

function definirDataMinima(campo) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');

  campo.min = `${ano}-${mes}-${dia}`;
}

function obterAreaPrincipal() {
  return document.querySelector('.main-container');
}

/* Prepara a área de detalhes sem modificar o HTML original. */
function prepararTelaDetalhes() {
  const area = obterAreaPrincipal();
  if (!area) return null;

  let telaDetalhes = document.getElementById(
    'tela-detalhes-prestador'
  );

  if (!telaDetalhes) {
    telaDetalhes = document.createElement('div');
    telaDetalhes.id = 'tela-detalhes-prestador';

    const elementos = Array.from(area.children).filter(elemento =>
      elemento.id !== 'tela-agendamento'
    );

    elementos.forEach(elemento => {
      telaDetalhes.appendChild(elemento);
    });

    area.appendChild(telaDetalhes);
  }

  return telaDetalhes;
}

function mostrarDetalhes() {
  const telaDetalhes = document.getElementById(
    'tela-detalhes-prestador'
  );

  const telaAgendamento = document.getElementById(
    'tela-agendamento'
  );

  if (telaDetalhes) telaDetalhes.hidden = false;
  if (telaAgendamento) telaAgendamento.hidden = true;

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (window.lucide) window.lucide.createIcons();
}

/* =========================================
   CONSULTA DOS DADOS REAIS
   ========================================= */

async function obterPrestadorAtual() {
  const idUrl = getParametroUrl('id');
  const idPrestador = Number(idUrl);

  if (
    !idUrl ||
    !Number.isInteger(idPrestador) ||
    idPrestador <= 0
  ) {
    throw new Error(
      'O identificador do prestador não foi informado corretamente.'
    );
  }

  const resposta = await fetch(
    `../php/usuarios.php?acao=detalhes_prestador&id=${encodeURIComponent(idPrestador)}`,
    {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }
  );

  const texto = await resposta.text();
  let dados;

  try {
    dados = JSON.parse(texto);
  } catch {
    console.error('Resposta inválida de usuarios.php:', texto);
    throw new Error('O servidor retornou uma resposta inválida.');
  }

  if (!resposta.ok || !dados.sucesso || !dados.prestador) {
    throw new Error(
      dados.mensagem || 'Não foi possível localizar esse prestador.'
    );
  }

  const usuario = dados.prestador;

  if (
    Number(usuario.id_usuario) !== idPrestador
  ) {
    throw new Error(
      'O prestador retornado não corresponde ao perfil selecionado.'
    );
  }

  if (Number(usuario.cd_tipo_usuario) !== 1) {
    throw new Error('O usuário selecionado não é um prestador.');
  }

  /* Consulta o catálogo geral de serviços. */
  const respostaServicos = await fetch('../php/servicos.php', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });

  const textoServicos = await respostaServicos.text();
  let dadosServicos;

  try {
    dadosServicos = JSON.parse(textoServicos);
  } catch {
    console.error('Resposta inválida de servicos.php:', textoServicos);
    throw new Error('Não foi possível ler o catálogo de serviços.');
  }

  if (!respostaServicos.ok || !Array.isArray(dadosServicos)) {
    throw new Error(
      dadosServicos.mensagem ||
      'Não foi possível carregar o catálogo de serviços.'
    );
  }

  servicosCatalogo = dadosServicos
    .map(servico => ({
      ...servico,
      id: Number(servico.id),
      titulo: servico.titulo || 'Serviço',
      descricao: servico.descricao || '',
      duracao: Number(servico.duracao),
      valor: obterPrecoServico(servico.titulo)
    }))
    .filter(servico =>
      Number.isInteger(servico.id) && servico.id > 0
    );

  /* Consulta somente os serviços selecionados pelo prestador. */
  const respostaOfertados = await fetch(
    `../php/servicos_prestador.php?id=${encodeURIComponent(idPrestador)}`,
    {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }
  );

  const textoOfertados = await respostaOfertados.text();
  let dadosOfertados;

  try {
    dadosOfertados = JSON.parse(textoOfertados);
  } catch {
    console.error(
      'Resposta inválida de servicos_prestador.php:',
      textoOfertados
    );
    throw new Error('Não foi possível consultar os serviços deste prestador.');
  }

  if (
    !respostaOfertados.ok ||
    !dadosOfertados.sucesso ||
    !Array.isArray(dadosOfertados.servicos)
  ) {
    throw new Error(
      dadosOfertados.mensagem ||
      'Não foi possível carregar os serviços deste prestador.'
    );
  }

  /* Mantém apenas os serviços selecionados por esse prestador. */
  const idsServicosOfertados = new Set(
    dadosOfertados.servicos
      .map(Number)
      .filter(id => Number.isInteger(id) && id > 0)
  );

  const servicos = servicosCatalogo
    .filter(servico => idsServicosOfertados.has(servico.id))
    .map(servico => ({
      ...servico,
      duracaoTexto: formatarDuracao(servico.duracao)
    }));

  /* Consulta as avaliações reais deste prestador.
     Essa consulta é independente das demais para não impedir
     o carregamento do perfil caso ocorra algum problema. */
  let dadosAvaliacoes = {
    avaliacoes: [],
    total_avaliacoes: 0,
    media_avaliacoes: null
  };

  try {
    const respostaAvaliacoes = await fetch(
      `../php/avaliacoes.php?acao=listar_prestador&id_prestador=${encodeURIComponent(idPrestador)}`,
      {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      }
    );

    const textoAvaliacoes = await respostaAvaliacoes.text();
    let resultadoAvaliacoes;

    try {
      resultadoAvaliacoes = JSON.parse(textoAvaliacoes);
    } catch {
      console.error(
        'Resposta inválida de avaliacoes.php:',
        textoAvaliacoes
      );
      throw new Error('O servidor retornou avaliações em formato inválido.');
    }

    if (
      !respostaAvaliacoes.ok ||
      !resultadoAvaliacoes.sucesso ||
      !Array.isArray(resultadoAvaliacoes.avaliacoes)
    ) {
      throw new Error(
        resultadoAvaliacoes.mensagem ||
        'Não foi possível consultar as avaliações.'
      );
    }

    dadosAvaliacoes = resultadoAvaliacoes;

  } catch (erro) {
    console.error(
      'Não foi possível carregar as avaliações do prestador:',
      erro
    );
  }

  const avaliacoes = dadosAvaliacoes.avaliacoes;
  const totalAvaliacoes =
    Number(dadosAvaliacoes.total_avaliacoes) || avaliacoes.length;

  const mediaAvaliacoes =
    dadosAvaliacoes.media_avaliacoes !== null &&
    dadosAvaliacoes.media_avaliacoes !== undefined &&
    dadosAvaliacoes.media_avaliacoes !== ''
      ? Number(dadosAvaliacoes.media_avaliacoes)
      : null;

  const mediaValida =
    totalAvaliacoes > 0 &&
    mediaAvaliacoes !== null &&
    Number.isFinite(mediaAvaliacoes);

  let textoAvaliacao = 'Ainda sem avaliações';

  if (mediaValida) {
    textoAvaliacao =
      `${mediaAvaliacoes.toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      })}/5 (${totalAvaliacoes} ${
        totalAvaliacoes === 1 ? 'avaliação' : 'avaliações'
      })`;
  } else if (totalAvaliacoes > 0) {
    textoAvaliacao =
      `${totalAvaliacoes} ${
        totalAvaliacoes === 1 ? 'avaliação' : 'avaliações'
      }`;
  }

  return {
    id: idPrestador,
    nome: usuario.nm_nome || 'Prestador',
    categoria: 'Prestador de serviços',
    descricao:
      usuario.ds_sobre_mim ||
      'Este prestador ainda não adicionou uma descrição.',
    telefone: usuario.telefone || '',
    endereco: usuario.endereco || '',
    avaliacao: textoAvaliacao,
    totalAvaliacoes,
    mediaAvaliacoes: mediaValida ? mediaAvaliacoes : null,
    servicos,
    avaliacoes
  };
}

function formatarDuracao(minutos) {
  const valor = Number(minutos);

  if (!Number.isFinite(valor) || valor <= 0) {
    return 'Duração não informada';
  }

  if (valor % 60 === 0) {
    const horas = valor / 60;
    return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  }

  return `${valor} minutos`;
}

/* =========================================
   AUXILIARES DO AGENDAMENTO
   ========================================= */

/* Normaliza o nome para localizar o preço fixo do catálogo. */
function normalizarNomeServico(nome) {
  return String(nome ?? '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function obterPrecoServico(nome) {
  const chave = normalizarNomeServico(nome);
  return precosServicos[chave] ?? null;
}

/* Formata o preço fixo do serviço para exibição. */
function formatarValorServico(servico) {
  const valor = servico?.valor ??
    servico?.preco ??
    servico?.vl_preco ??
    servico?.preco_servico ??
    servico?.valor_servico ??
    null;

  if (
    valor === null ||
    valor === undefined ||
    String(valor).trim() === ''
  ) {
    return '';
  }

  let numero;

  if (typeof valor === 'number') {
    numero = valor;
  } else {
    let valorNormalizado = String(valor)
      .trim()
      .replace(/[^\d,.-]/g, '');

    if (valorNormalizado.includes(',')) {
      valorNormalizado = valorNormalizado
        .replace(/\./g, '')
        .replace(',', '.');
    }

    numero = Number(valorNormalizado);
  }

  if (!Number.isFinite(numero) || numero < 0) {
    return '';
  }

  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

/* Lê os veículos cadastrados na chave atual do localStorage. */
function obterVeiculosCadastrados() {
  try {
    const dadosSalvos = localStorage.getItem(
      'salvusconnect_vehicles'
    );

    if (!dadosSalvos) {
      return [];
    }

    const veiculos = JSON.parse(dadosSalvos);

    if (!Array.isArray(veiculos)) {
      console.warn(
        'Os dados de veículos armazenados não estão no formato esperado.'
      );
      return [];
    }

    return veiculos
      .filter(veiculo =>
        veiculo &&
        typeof veiculo === 'object' &&
        !Array.isArray(veiculo)
      )
      .map((veiculo, indice) => ({
        indice,
        marca: String(veiculo.marca ?? '').trim(),
        modelo: String(veiculo.modelo ?? '').trim(),
        ano: String(veiculo.ano ?? '').trim(),
        cor: String(veiculo.cor ?? '').trim(),
        placa: String(veiculo.placa ?? '').trim()
      }))
      .filter(veiculo =>
        veiculo.marca ||
        veiculo.modelo ||
        veiculo.placa
      );

  } catch (erro) {
    console.error(
      'Não foi possível consultar os veículos cadastrados:',
      erro
    );

    return [];
  }
}

/* Monta as opções do seletor sem inserir HTML não tratado. */
function montarOpcoesVeiculos(veiculos) {
  if (veiculos.length === 0) {
    return `
      <option value="">
        Nenhum veículo cadastrado
      </option>
    `;
  }

  return `
    <option value="">
      Não utilizar veículo
    </option>

    ${veiculos.map(veiculo => {
      const identificacao = [
        `${veiculo.marca} ${veiculo.modelo}`.trim(),
        veiculo.ano,
        veiculo.cor,
        veiculo.placa ? `Placa: ${veiculo.placa}` : ''
      ].filter(Boolean).join(' • ');

      return `
        <option value="${veiculo.indice}">
          ${escaparHTML(identificacao)}
        </option>
      `;
    }).join('')}
  `;
}

/* Gera horários de 30 em 30 minutos. */
function gerarHorariosDisponiveis(servico) {
  const horarios = [];

  const inicioExpediente = 8 * 60;
  const inicioAlmoco = 12 * 60;
  const fimAlmoco = 13 * 60;
  const ultimoInicio = 17 * 60;

  const duracao = Number(servico?.duracao);
  const duracaoValida = Number.isFinite(duracao) && duracao > 0;

  for (
    let inicio = inicioExpediente;
    inicio <= ultimoInicio;
    inicio += 30
  ) {
    if (inicio >= inicioAlmoco && inicio < fimAlmoco) {
      continue;
    }

    if (duracaoValida) {
      const fimAtendimento = inicio + duracao;

      const atravessaAlmoco =
        inicio < fimAlmoco &&
        fimAtendimento > inicioAlmoco;

      if (atravessaAlmoco) {
        continue;
      }
    }

    const horas = String(Math.floor(inicio / 60)).padStart(2, '0');
    const minutos = String(inicio % 60).padStart(2, '0');

    horarios.push(`${horas}:${minutos}`);
  }

  return horarios;
}

/* Adiciona os estilos do calendário, veículo, observações e notificação. */
function garantirEstilosCalendario() {
  if (document.getElementById('salvus-calendario-estilos')) {
    return;
  }

  const estilo = document.createElement('style');
  estilo.id = 'salvus-calendario-estilos';

  estilo.textContent = `
    .appointment-calendar {
      width: 100%;
      max-width: 360px;
      margin: 0;
    }

    .appointment-calendar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }

    .appointment-calendar-month {
      color: #0b132b;
      font-size: 0.95rem;
      font-weight: 700;
      text-transform: capitalize;
      text-align: center;
    }

    .appointment-calendar-nav {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      flex-shrink: 0;
      padding: 0;
      color: #0b132b;
      background: #f4f6fa;
      border: 1px solid #d5deeb;
      border-radius: 7px;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }

    .appointment-calendar-nav:hover:not(:disabled) {
      background: #e0e8ff;
      border-color: #2563eb;
    }

    .appointment-calendar-nav:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .appointment-calendar-weekdays,
    .appointment-calendar-days {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 5px;
      width: 100%;
    }

    .appointment-calendar-weekdays {
      margin-bottom: 5px;
    }

    .appointment-calendar-weekday {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 24px;
      color: #64748b;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .appointment-calendar-empty {
      min-height: 34px;
    }

    .appointment-calendar-day {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-width: 0;
      min-height: 34px;
      padding: 3px;
      color: #0b132b;
      background: #f4f6fa;
      border: 1px solid transparent;
      border-radius: 7px;
      font-family: inherit;
      font-size: 0.84rem;
      font-weight: 500;
      cursor: pointer;
      transition:
        background-color 0.2s ease,
        border-color 0.2s ease,
        color 0.2s ease;
    }

    .appointment-calendar-day:hover:not(:disabled):not(.selected) {
      background: #e0e8ff;
      border-color: #cbd9f5;
    }

    .appointment-calendar-day.today:not(.selected) {
      border-color: #2563eb;
      font-weight: 700;
    }

    .appointment-calendar-day.selected {
      color: #ffffff;
      background: #2563eb;
      border-color: #2563eb;
      font-weight: 700;
    }

    .appointment-calendar-day:disabled {
      color: #aebbd0;
      background: #ffffff;
      cursor: not-allowed;
      opacity: 0.65;
    }

    .appointment-calendar-day:focus-visible,
    .appointment-calendar-nav:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }

    /* CAMPO DE VEÍCULO */

    .appointment-vehicle-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      padding: 13px 16px;
      background: #ffffff;
      border: 1px solid #d5deeb;
      border-radius: 10px;
      box-sizing: border-box;
    }

    .appointment-vehicle-label {
      display: block;
      color: #0b132b;
      font-size: 0.95rem;
      font-weight: 700;
    }

    .appointment-vehicle-select {
      display: block;
      width: 100%;
      min-height: 42px;
      padding: 9px 12px;
      color: #0b132b;
      background: #ffffff;
      border: 1px solid #aebbd0;
      border-radius: 8px;
      font-family: inherit;
      font-size: 0.88rem;
      cursor: pointer;
    }

    .appointment-vehicle-select:focus {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
      border-color: #2563eb;
    }

    /* CAMPO DE OBSERVAÇÕES */

    .appointment-observations-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      padding: 13px 16px;
      background: #ffffff;
      border: 1px solid #d5deeb;
      border-radius: 10px;
      box-sizing: border-box;
    }

    .appointment-observations-label {
      display: block;
      color: #0b132b;
      font-size: 0.95rem;
      font-weight: 700;
    }

    .appointment-observations-input {
      display: block;
      width: 100%;
      min-height: 90px;
      padding: 10px 12px;
      color: #0b132b;
      background: #ffffff;
      border: 1px solid #aebbd0;
      border-radius: 8px;
      font-family: inherit;
      font-size: 0.88rem;
      line-height: 1.5;
      resize: vertical;
      box-sizing: border-box;
    }

    .appointment-observations-input::placeholder {
      color: #7b8798;
      opacity: 1;
    }

    .appointment-observations-input:focus {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
      border-color: #2563eb;
    }

    /* NOTIFICAÇÃO FLUTUANTE DE SUCESSO */

    #tela-agendamento #agendamento-mensagem:empty {
      display: none;
    }

    #tela-agendamento #agendamento-mensagem.appointment-success-toast {
      position: fixed;
      top: 18px;
      left: 50%;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 10px;
      width: min(420px, calc(100vw - 32px));
      min-height: 0;
      margin: 0;
      padding: 12px 15px;
      color: #166534;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 10px;
      font-size: 0.88rem;
      font-weight: 600;
      line-height: 1.45;
      box-shadow: 0 8px 24px rgba(22, 101, 52, 0.16);
      box-sizing: border-box;
      pointer-events: none;
      transform: translateX(-50%);
      animation: salvus-toast-entrada 0.25s ease-out both;
    }

    #tela-agendamento #agendamento-mensagem.appointment-success-toast::before {
      content: "✓";
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      color: #ffffff;
      background: #16a34a;
      border-radius: 50%;
      font-size: 0.9rem;
      font-weight: 700;
    }

    #tela-agendamento #agendamento-mensagem.appointment-success-toast--closing {
      animation: salvus-toast-saida 0.3s ease-in forwards;
    }

    @keyframes salvus-toast-entrada {
      from {
        opacity: 0;
        transform: translate(-50%, -12px);
      }

      to {
        opacity: 1;
        transform: translate(-50%, 0);
      }
    }

    @keyframes salvus-toast-saida {
      from {
        opacity: 1;
        transform: translate(-50%, 0);
      }

      to {
        opacity: 0;
        transform: translate(-50%, -8px);
      }
    }

    @media (max-width: 360px) {
      .appointment-calendar {
        max-width: 100%;
      }

      .appointment-calendar-weekdays,
      .appointment-calendar-days {
        gap: 3px;
      }

      .appointment-calendar-day {
        min-height: 32px;
        font-size: 0.8rem;
      }

      .appointment-vehicle-field,
      .appointment-observations-field {
        padding: 12px;
      }
    }
  `;

  document.head.appendChild(estilo);
}

/* =========================================
   ELEMENTOS DO PERFIL
   ========================================= */

function definirTexto(id, texto) {
  const elemento = document.getElementById(id);
  if (elemento) elemento.textContent = texto;
}

function definirHTML(id, html) {
  const elemento = document.getElementById(id);
  if (elemento) elemento.innerHTML = html;
}

function definirMeta(id, icone, valor) {
  const elemento = document.getElementById(id);
  if (!elemento) return;

  if (!valor) {
    elemento.hidden = true;
    elemento.textContent = '';
    return;
  }

  elemento.hidden = false;
  elemento.innerHTML = `
    <i data-lucide="${icone}"></i>
    ${escaparHTML(valor)}
  `;
}

/* =========================================
   FORMULÁRIO DE AGENDAMENTO
   ========================================= */

function abrirTelaAgendamento(prestador, servico) {
  prestadorSelecionado = prestador;
  servicoSelecionado = servico;

  const area = obterAreaPrincipal();
  if (!area) return;

  garantirEstilosCalendario();

  let tela = document.getElementById('tela-agendamento');

  if (!tela) {
    tela = document.createElement('section');
    tela.id = 'tela-agendamento';
    tela.hidden = true;
    area.appendChild(tela);
  }

  const opcoesHorario = gerarHorariosDisponiveis(servico);
  const valorServico = formatarValorServico(servico);

  /* Consulta os veículos cadastrados no navegador. */
  const veiculosCadastrados = obterVeiculosCadastrados();
  const opcoesVeiculo = montarOpcoesVeiculos(veiculosCadastrados);

  tela.innerHTML = `
    <button
      type="button"
      class="back-btn"
      id="voltar-detalhes"
      aria-label="Voltar aos detalhes do prestador"
    >
      <i data-lucide="arrow-left"></i>
      Voltar aos detalhes
    </button>

    <section
      class="section-block appointment-summary-section"
      aria-label="Detalhes do serviço"
    >
      <article class="service-card appointment-summary-card">
        <div class="appointment-summary-content">
          <div class="appointment-summary-info">
            <div class="service-header">
              <h3>${escaparHTML(servico.titulo)}</h3>
            </div>

            <p class="service-desc">
              ${escaparHTML(servico.descricao || '')}
            </p>
          </div>

          <div class="appointment-summary-meta">
            ${
              valorServico
                ? `<span class="service-price">${escaparHTML(valorServico)}</span>`
                : ''
            }

            <span class="duration">
              <i data-lucide="clock"></i>
              ${escaparHTML(servico.duracaoTexto)}
            </span>
          </div>
        </div>
      </article>
    </section>

    <section
      class="section-block appointment-date-card"
      aria-labelledby="titulo-data-agendamento"
    >
      <h2
        id="titulo-data-agendamento"
        class="appointment-section-title"
      >
        Escolha a data
      </h2>

      <div class="appointment-date-layout">
        <div
          id="calendario-agendamento"
          class="appointment-calendar"
          tabindex="-1"
          aria-label="Calendário para escolher a data do agendamento"
        >
          <div class="appointment-calendar-header">
            <button
              type="button"
              id="calendario-mes-anterior"
              class="appointment-calendar-nav"
              aria-label="Mês anterior"
            >
              <i data-lucide="chevron-left"></i>
            </button>

            <span
              id="calendario-mes-atual"
              class="appointment-calendar-month"
              aria-live="polite"
            ></span>

            <button
              type="button"
              id="calendario-proximo-mes"
              class="appointment-calendar-nav"
              aria-label="Próximo mês"
            >
              <i data-lucide="chevron-right"></i>
            </button>
          </div>

          <div class="appointment-calendar-weekdays" aria-hidden="true">
            <span class="appointment-calendar-weekday">D</span>
            <span class="appointment-calendar-weekday">S</span>
            <span class="appointment-calendar-weekday">T</span>
            <span class="appointment-calendar-weekday">Q</span>
            <span class="appointment-calendar-weekday">Q</span>
            <span class="appointment-calendar-weekday">S</span>
            <span class="appointment-calendar-weekday">S</span>
          </div>

          <div
            id="calendario-dias"
            class="appointment-calendar-days"
            role="group"
            aria-label="Dias do mês"
          ></div>
        </div>

        <aside
          class="appointment-pending-notice"
          id="aviso-agendamento-pendente"
          role="note"
          aria-label="Atenção sobre a confirmação do agendamento"
        >
          <div class="appointment-pending-notice-heading">
            <i data-lucide="alert-triangle" aria-hidden="true"></i>
            <strong>ATENÇÃO</strong>
          </div>

          <p>
            Escolher uma data e um horário não confirma o agendamento.
            Sua solicitação só será aceita depois que o prestador confirmar
            o atendimento. Aguarde essa confirmação antes de considerar
            o horário reservado.
          </p>
        </aside>
      </div>

      <input
        type="hidden"
        id="agendamento-data"
        required
      >
    </section>

    <section
      class="section-block appointment-time-card"
      aria-labelledby="titulo-horario-agendamento"
    >
      <h2
        id="titulo-horario-agendamento"
        class="appointment-section-title"
      >
        Escolha o horário
      </h2>

      <p class="appointment-time-description">
        Selecione o horário desejado. Ele será enviado ao prestador para confirmação.
      </p>

      <div
        id="horarios-disponiveis"
        class="appointment-time-options"
        role="group"
        aria-label="Horários disponíveis para seleção"
      >
        ${
          opcoesHorario.length
            ? opcoesHorario.map(horario => `
                <button
                  type="button"
                  class="btn-horario"
                  data-horario="${horario}"
                  aria-pressed="false"
                >${horario}</button>
              `).join('')
            : `
                <p class="providers-empty">
                  Não há horários compatíveis com a duração deste serviço.
                </p>
              `
        }
      </div>

      <input
        type="hidden"
        id="agendamento-horario"
        required
      >

      <p
        id="horario-selecionado"
        class="appointment-selected-time"
        aria-live="polite"
      ></p>
    </section>

    <form
      id="form-agendamento"
      class="section-block appointment-form"
      aria-label="Confirmação da solicitação de agendamento"
    >
      <div class="appointment-vehicle-field">
        <label
          for="agendamento-veiculo"
          class="appointment-vehicle-label"
        >
          Veículo (opcional)
        </label>

        <select
          id="agendamento-veiculo"
          class="appointment-vehicle-select"
          aria-label="Selecione um veículo cadastrado, se necessário"
        >
          ${opcoesVeiculo}
        </select>
      </div>

      <div class="appointment-observations-field">
        <label
          for="agendamento-observacoes"
          class="appointment-observations-label"
        >
          Observações (opcional)
        </label>

        <textarea
          id="agendamento-observacoes"
          class="appointment-observations-input"
          rows="3"
          maxlength="500"
          placeholder="Descreva alguma informação importante sobre o atendimento..."
          aria-label="Observações opcionais sobre o agendamento"
        ></textarea>
      </div>

      <p id="agendamento-mensagem" role="status" aria-live="polite"></p>

      <div class="appointment-form-actions">
        <button type="submit" class="btn-agendar">
          Solicitar agendamento
        </button>
      </div>
    </form>
  `;

  const telaDetalhes = document.getElementById(
    'tela-detalhes-prestador'
  );

  if (telaDetalhes) telaDetalhes.hidden = true;
  tela.hidden = false;

  /* =========================================
     CALENDÁRIO COMPACTO
     ========================================= */

  const campoData = document.getElementById('agendamento-data');
  definirDataMinima(campoData);

  const calendarioMes = document.getElementById(
    'calendario-mes-atual'
  );

  const calendarioDias = document.getElementById(
    'calendario-dias'
  );

  const botaoMesAnterior = document.getElementById(
    'calendario-mes-anterior'
  );

  const botaoProximoMes = document.getElementById(
    'calendario-proximo-mes'
  );

  const [anoMinimo, mesMinimo] = campoData.min
    .split('-')
    .map(Number);

  const primeiroMesPermitido = new Date(
    anoMinimo,
    mesMinimo - 1,
    1
  );

  let mesExibido = new Date(
    anoMinimo,
    mesMinimo - 1,
    1
  );

  function formatarDataISO(ano, mes, dia) {
    const mesFormatado = String(mes).padStart(2, '0');
    const diaFormatado = String(dia).padStart(2, '0');

    return `${ano}-${mesFormatado}-${diaFormatado}`;
  }

  function renderizarCalendario() {
    const ano = mesExibido.getFullYear();
    const mes = mesExibido.getMonth();

    const titulo = mesExibido.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric'
    });

    calendarioMes.textContent =
      titulo.charAt(0).toUpperCase() + titulo.slice(1);

    const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    const quantidadeDias = new Date(ano, mes + 1, 0).getDate();

    const mesAtual = new Date(ano, mes, 1);

    botaoMesAnterior.disabled =
      mesAtual <= primeiroMesPermitido;

    let html = '';

    for (let i = 0; i < primeiroDiaSemana; i++) {
      html += `
        <span
          class="appointment-calendar-empty"
          aria-hidden="true"
        ></span>
      `;
    }

    for (let dia = 1; dia <= quantidadeDias; dia++) {
      const dataISO = formatarDataISO(ano, mes + 1, dia);
      const dataPassada = dataISO < campoData.min;
      const selecionada = dataISO === campoData.value;
      const hoje = dataISO === campoData.min;

      const classes = [
        'appointment-calendar-day',
        hoje ? 'today' : '',
        selecionada ? 'selected' : ''
      ].filter(Boolean).join(' ');

      html += `
        <button
          type="button"
          class="${classes}"
          data-data="${dataISO}"
          aria-label="${dia} de ${titulo}"
          aria-pressed="${selecionada ? 'true' : 'false'}"
          ${dataPassada ? 'disabled' : ''}
        >${dia}</button>
      `;
    }

    calendarioDias.innerHTML = html;
  }

  botaoMesAnterior.addEventListener('click', () => {
    if (botaoMesAnterior.disabled) return;

    mesExibido = new Date(
      mesExibido.getFullYear(),
      mesExibido.getMonth() - 1,
      1
    );

    renderizarCalendario();
  });

  botaoProximoMes.addEventListener('click', () => {
    mesExibido = new Date(
      mesExibido.getFullYear(),
      mesExibido.getMonth() + 1,
      1
    );

    renderizarCalendario();
  });

  calendarioDias.addEventListener('click', evento => {
    const botao = evento.target.closest('button[data-data]');

    if (!botao || botao.disabled) return;

    campoData.value = botao.dataset.data;

    document.getElementById('agendamento-horario').value = '';

    document.querySelectorAll('#horarios-disponiveis .btn-horario')
      .forEach(outro => {
        outro.classList.remove('selected');
        outro.setAttribute('aria-pressed', 'false');
      });

    document.getElementById('horario-selecionado').textContent = '';

    renderizarCalendario();
  });

  renderizarCalendario();

  /* =========================================
     SELEÇÃO DO HORÁRIO
     ========================================= */

  document.querySelectorAll('#horarios-disponiveis .btn-horario')
    .forEach(botao => {
      botao.addEventListener('click', () => {
        document.querySelectorAll('#horarios-disponiveis .btn-horario')
          .forEach(outro => {
            outro.classList.remove('selected');
            outro.setAttribute('aria-pressed', 'false');
          });

        botao.classList.add('selected');
        botao.setAttribute('aria-pressed', 'true');

        document.getElementById('agendamento-horario').value =
          botao.dataset.horario;

        document.getElementById('horario-selecionado').textContent =
          `Horário escolhido: ${botao.dataset.horario}`;
      });
    });

  document.getElementById('voltar-detalhes')
    .addEventListener('click', mostrarDetalhes);

  /* Temporizador exclusivo da notificação desta tela. */
  let temporizadorNotificacaoSucesso = null;

  /* =========================================
     ENVIO DA SOLICITAÇÃO
     ========================================= */

  document.getElementById('form-agendamento')
    .addEventListener('submit', async evento => {
      evento.preventDefault();

      const data = campoData.value;
      const horario = document.getElementById(
        'agendamento-horario'
      ).value;

      const mensagem = document.getElementById(
        'agendamento-mensagem'
      );

      const formulario = evento.currentTarget;
      const botaoEnviar = formulario.querySelector('[type="submit"]');
      const textoOriginal = botaoEnviar.textContent;

      if (!data) {
        mensagem.textContent = 'Selecione a data desejada.';

        document.getElementById('calendario-agendamento').focus();

        return;
      }

      if (data < campoData.min) {
        mensagem.textContent =
          'Escolha uma data igual ou posterior a hoje.';

        document.getElementById('calendario-agendamento').focus();

        return;
      }

      if (!horario) {
        mensagem.textContent = 'Selecione um horário.';
        return;
      }

      const solicitacao = {
        nm_servico: servicoSelecionado.titulo,
        id_prestador: prestadorSelecionado.id,
        data,
        horario
      };

      botaoEnviar.disabled = true;
      botaoEnviar.textContent = 'Enviando...';

      mensagem.classList.remove(
        'appointment-success-toast',
        'appointment-success-toast--closing'
      );

      mensagem.textContent = '';

      try {
        // Obtém o token CSRF antes de enviar o agendamento.
        const token = await obterTokenCSRF();

        const resposta = await fetch('../php/agendamentos.php', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-CSRF-Token': token
          },
          body: JSON.stringify(solicitacao)
        });

        const texto = await resposta.text();
        let dados;

        try {
          dados = JSON.parse(texto);
        } catch {
          console.error(
            'Resposta inválida de agendamentos.php:',
            texto
          );
          throw new Error('Resposta inválida do servidor.');
        }

        if (!resposta.ok || !dados.sucesso) {
          throw new Error(
            dados.mensagem ||
            'Não foi possível registrar a solicitação.'
          );
        }

        mensagem.textContent =
          dados.mensagem ||
          'Solicitação registrada com sucesso.';

        mensagem.classList.add('appointment-success-toast');

        botaoEnviar.textContent = 'Solicitação enviada';

        // Impede o envio duplicado após o sucesso.
        botaoEnviar.disabled = true;

        /* Remove a notificação após aproximadamente 5 segundos. */
        if (temporizadorNotificacaoSucesso !== null) {
          window.clearTimeout(temporizadorNotificacaoSucesso);
        }

        temporizadorNotificacaoSucesso = window.setTimeout(() => {
          mensagem.classList.add(
            'appointment-success-toast--closing'
          );

          temporizadorNotificacaoSucesso = window.setTimeout(() => {
            mensagem.classList.remove(
              'appointment-success-toast',
              'appointment-success-toast--closing'
            );

            mensagem.textContent = '';
            temporizadorNotificacaoSucesso = null;
          }, 300);

        }, 4700);

      } catch (erro) {
        console.error('Erro ao solicitar agendamento:', erro);

        if (temporizadorNotificacaoSucesso !== null) {
          window.clearTimeout(temporizadorNotificacaoSucesso);
          temporizadorNotificacaoSucesso = null;
        }

        mensagem.classList.remove(
          'appointment-success-toast',
          'appointment-success-toast--closing'
        );

        mensagem.textContent =
          erro.message ||
          'Não foi possível enviar a solicitação.';

        botaoEnviar.disabled = false;
        botaoEnviar.textContent = textoOriginal;
      }
    });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (window.lucide) window.lucide.createIcons();
}

/* =========================================
   EXIBIÇÃO DOS SERVIÇOS DO CATÁLOGO
   ========================================= */

function renderizarServicosPrestador(prestador) {
  const container = document.getElementById('services-container');
  if (!container) return;

  if (prestador.servicos.length === 0) {
    container.innerHTML = `
      <p class="providers-empty">
        Este prestador ainda não selecionou serviços para oferecer.
      </p>
    `;
    return;
  }

  /* Exibe somente os serviços selecionados pelo prestador. */
  container.innerHTML = prestador.servicos.map((servico, indice) => {
    const valorServico = formatarValorServico(servico);

    return `
      <div class="service-card">
        <div class="service-header">
          <h3>${escaparHTML(servico.titulo)}</h3>
        </div>

        <p class="service-desc">
          ${escaparHTML(servico.descricao)}
        </p>

        <div class="service-footer">
          ${
            valorServico
              ? `<span class="service-price">${escaparHTML(valorServico)}</span>`
              : ''
          }

          <span class="duration">
            <i data-lucide="clock"></i>
            ${escaparHTML(servico.duracaoTexto)}
          </span>

          <button
            class="btn-agendar"
            type="button"
            data-servico-index="${indice}"
          >
            Solicitar
          </button>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

/* =========================================
   EXIBIÇÃO DAS AVALIAÇÕES REAIS
   ========================================= */

function renderizarAvaliacoes(prestador) {
  const reviewsContainer = document.getElementById('reviews-container');
  const reviewsCount = document.getElementById('reviews-count');

  const avaliacoes = Array.isArray(prestador.avaliacoes)
    ? prestador.avaliacoes
    : [];

  const totalAvaliacoes =
    Number(prestador.totalAvaliacoes) || avaliacoes.length;

  if (reviewsCount) {
    reviewsCount.textContent =
      totalAvaliacoes > 0
        ? `${totalAvaliacoes} ${
            totalAvaliacoes === 1 ? 'avaliação' : 'avaliações'
          }`
        : 'Avaliações';
  }

  if (!reviewsContainer) return;

  if (avaliacoes.length === 0) {
    reviewsContainer.innerHTML =
      '<p>As avaliações deste prestador ainda não estão disponíveis.</p>';
    return;
  }

  reviewsContainer.innerHTML = avaliacoes.map(avaliacao => {
    const nomeAutor = escaparHTML(
      avaliacao.autor_nome || 'Cliente'
    );

    const comentario = String(
      avaliacao.comentario ?? ''
    ).trim();

    const notaInformada = Number(avaliacao.nota);

    const nota = Number.isFinite(notaInformada)
      ? Math.min(5, Math.max(0, Math.round(notaInformada)))
      : 0;

    const estrelas = `
      <span class="review-stars-filled" aria-hidden="true">${'★'.repeat(nota)}</span><span class="review-stars-empty" aria-hidden="true">${'☆'.repeat(5 - nota)}</span>
    `;

    return `
      <article class="review-card">
        <div class="review-header">
          <strong>${nomeAutor}</strong>

          <span
            class="review-stars"
            role="img"
            aria-label="Nota: ${nota} de 5"
          >${estrelas}</span>
        </div>

        ${
          comentario
            ? `<p class="review-comment">${escaparHTML(comentario)}</p>`
            : ''
        }
      </article>
    `;
  }).join('');
}

function renderizarDetalhesPrestador(prestador) {
  definirTexto(
    'p-avatar',
    prestador.nome.charAt(0).toUpperCase()
  );

  definirTexto('p-nome', prestador.nome);
  definirTexto('p-categoria', prestador.categoria);
  definirTexto('p-descricao', prestador.descricao);

  definirHTML(
    'p-avaliacao',
    `<i data-lucide="star" class="star-icon"></i> ${escaparHTML(prestador.avaliacao)}`
  );

  definirMeta('p-telefone', 'phone', prestador.telefone);
  definirMeta('p-endereco', 'map-pin', prestador.endereco);

  renderizarServicosPrestador(prestador);
  renderizarAvaliacoes(prestador);

  if (window.lucide) window.lucide.createIcons();
}

function mostrarErroDetalhes(mensagem) {
  console.error('Erro ao carregar detalhes:', mensagem);

  definirTexto('p-nome', 'Prestador indisponível');
  definirTexto('p-categoria', 'Não foi possível carregar o perfil.');
  definirTexto('p-descricao', mensagem);

  const servicesContainer = document.getElementById('services-container');

  if (servicesContainer) {
    servicesContainer.innerHTML = `
      <p class="providers-empty">
        Não foi possível carregar os dados deste prestador.
      </p>
    `;
  }
}

async function carregarDetalhesPrestador() {
  prepararTelaDetalhes();

  try {
    const prestador = await obterPrestadorAtual();

    prestadorSelecionado = prestador;

    renderizarDetalhesPrestador(prestador);

  } catch (erro) {
    mostrarErroDetalhes(
      erro.message || 'Não foi possível carregar o perfil.'
    );
  }
}

/* Solicitação dos serviços exibidos no catálogo. */
document.addEventListener('click', evento => {
  const botao = evento.target.closest(
    '.btn-agendar[data-servico-index]'
  );

  if (!botao || !prestadorSelecionado) return;

  const indiceServico = Number(botao.dataset.servicoIndex);
  const servico = prestadorSelecionado.servicos[indiceServico];

  if (servico) {
    abrirTelaAgendamento(prestadorSelecionado, servico);
  }
});

/* Inicialização da página. */
if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    carregarDetalhesPrestador
  );
} else {
  carregarDetalhesPrestador();
}
