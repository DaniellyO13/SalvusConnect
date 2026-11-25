
/* SalvusConnect — Serviços conforme o tipo de usuário. */

let prestadores = [];
let servicos = [];
let usuarioAtual = null;
let modoAtual = null;
let servicosOfertados = new Set();
let csrfToken = null;
let antecedenteAprovado = false;

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

/* Escapa valores antes de inseri-los no HTML. */
function escaparHTML(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, caractere => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[caractere]);
}

function obterContainer() {
  return document.getElementById('providers-container');
}

function mostrarCarregamento(mensagem) {
  const container = obterContainer();
  if (!container) return;

  container.innerHTML = `
    <div class="providers-empty">
      ${escaparHTML(mensagem)}
    </div>
  `;
}

/* =========================================
   CATÁLOGO DE SERVIÇOS
   ========================================= */

function normalizarNomeServico(nome) {
  return String(nome ?? '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function formatarNomeServico(nome) {
  const texto = String(nome ?? '').trim();

  if (!texto) return 'Serviço';

  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1);
}

function obterPrecoServico(nome) {
  const chave = normalizarNomeServico(nome);
  return precosServicos[chave] ?? null;
}

function formatarPreco(valor) {
  if (valor === null || valor === undefined) {
    return 'Preço não informado';
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor);
}

async function obterCatalogoServicos() {
  const resposta = await fetch('../php/servicos.php', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });

  const texto = await resposta.text();
  let dados;

  try {
    dados = JSON.parse(texto);
  } catch {
    console.error('Resposta inválida de servicos.php:', texto);
    throw new Error('Resposta inválida do catálogo.');
  }

  if (!resposta.ok || !Array.isArray(dados)) {
    throw new Error(
      dados.mensagem || 'Não foi possível carregar o catálogo.'
    );
  }

  return dados.map(servico => ({
    id: Number(servico.id),
    titulo: formatarNomeServico(servico.titulo || 'Serviço'),
    descricao: servico.descricao || '',
    duracao: Number(servico.duracao),
    preco: obterPrecoServico(servico.titulo)
  })).filter(servico =>
    Number.isInteger(servico.id) && servico.id > 0
  );
}

/* =========================================
   PERSISTÊNCIA DOS SERVIÇOS DO PRESTADOR
   ========================================= */

async function lerRespostaJSON(resposta, origem) {
  const texto = await resposta.text();
  let dados;

  try {
    dados = JSON.parse(texto);
  } catch {
    console.error(
      `Resposta inválida de ${origem} (HTTP ${resposta.status}):`,
      texto
    );

    throw new Error(
      `O servidor retornou uma resposta inválida em ${origem} (HTTP ${resposta.status}).`
    );
  }

  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    console.error(`Formato inesperado de ${origem}:`, dados);

    throw new Error(
      `O servidor retornou dados em formato inesperado em ${origem}.`
    );
  }

  return dados;
}

async function obterTokenCSRF() {
  const resposta = await fetch('../php/ca_perfil.php', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });

  const dados = await lerRespostaJSON(
    resposta,
    'ca_perfil.php'
  );

  if (!resposta.ok || !dados.sucesso || !dados.csrf_token) {
    throw new Error(
      dados.mensagem ||
      `Não foi possível obter o token de segurança (HTTP ${resposta.status}).`
    );
  }

  csrfToken = dados.csrf_token;

  return csrfToken;
}

async function carregarServicosOfertados() {
  const resposta = await fetch('../php/servicos_prestador.php', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });

  const dados = await lerRespostaJSON(
    resposta,
    'servicos_prestador.php (consulta)'
  );

  if (!resposta.ok || !dados.sucesso || !Array.isArray(dados.servicos)) {
    throw new Error(
      dados.mensagem ||
      `Não foi possível recuperar seus serviços (HTTP ${resposta.status}).`
    );
  }

  /* Somente o status APROVADO libera a oferta de serviços. */
  antecedenteAprovado =
    String(dados.status_antecedente ?? '')
      .trim()
      .toUpperCase() === 'APROVADO';

  servicosOfertados = new Set(
    dados.servicos.map(Number).filter(id =>
      Number.isInteger(id) && id > 0
    )
  );

  if (servicosOfertados.size > 5) {
    throw new Error(
      'A seleção salva ultrapassa o limite de cinco serviços. Verifique os dados armazenados.'
    );
  }
}

async function salvarServicosOfertados() {
  if (!csrfToken) {
    await obterTokenCSRF();
  }

  const servicosEnviados = Array.from(servicosOfertados);

  const resposta = await fetch('../php/servicos_prestador.php', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    body: JSON.stringify({
      servicos: servicosEnviados
    }),
    cache: 'no-store'
  });

  const dados = await lerRespostaJSON(
    resposta,
    'servicos_prestador.php (salvamento)'
  );

  if (!resposta.ok || !dados.sucesso) {
    throw new Error(
      dados.mensagem ||
      `Não foi possível salvar seus serviços (HTTP ${resposta.status}).`
    );
  }

  if (!Array.isArray(dados.servicos)) {
    throw new Error(
      'O servidor confirmou o salvamento, mas não retornou a lista de serviços.'
    );
  }

  const servicosConfirmados = dados.servicos.map(Number);

  const enviadosOrdenados = [...servicosEnviados].sort((a, b) => a - b);
  const confirmadosOrdenados = [...servicosConfirmados].sort((a, b) => a - b);

  if (
    enviadosOrdenados.length !== confirmadosOrdenados.length ||
    enviadosOrdenados.some((id, indice) =>
      id !== confirmadosOrdenados[indice]
    )
  ) {
    throw new Error(
      'A lista de serviços confirmada pelo servidor é diferente da seleção enviada.'
    );
  }

  servicosOfertados = new Set(servicosConfirmados);
}

/* =========================================
   IDENTIFICAÇÃO DO USUÁRIO
   ========================================= */

async function configurarTela(usuario) {
  if (!usuario || usuario.id_usuario == null) {
    modoAtual = null;
    mostrarCarregamento('Não foi possível identificar o usuário.');
    return;
  }

  usuarioAtual = usuario;

  const tipoUsuario = Number(usuario.cd_tipo_usuario);

  const titulo = document.querySelector('.page-header h1');
  const descricao = document.querySelector('.page-header p');
  const busca = document.getElementById('search-input');
  const container = obterContainer();

  if (![0, 1, 3].includes(tipoUsuario)) {
    modoAtual = null;
    mostrarCarregamento('Perfil de usuário não autorizado.');
    return;
  }

  /* Administrador */
  if (tipoUsuario === 0) {
    modoAtual = 'admin';

    if (titulo) titulo.textContent = 'Área administrativa';

    if (descricao) {
      descricao.textContent =
        'Acesse o painel administrativo do SalvusConnect.';
    }

    if (busca) {
      busca.value = '';
      busca.placeholder = 'Busca indisponível nesta área.';
      busca.disabled = true;
    }

    if (container) {
      container.classList.remove('services-grid', 'providers-grid');
    }

    document.title = 'SalvusConnect - Área Administrativa';

    mostrarCarregamento(
      'O painel administrativo possui acesso próprio. Utilize a área administrativa para gerenciar o sistema.'
    );

    return;
  }

  if (busca) {
    busca.disabled = false;
  }

  modoAtual = tipoUsuario === 1 ? 'prestador' : 'cliente';

  if (container) {
    container.classList.toggle(
      'services-grid',
      modoAtual === 'prestador'
    );

    container.classList.toggle(
      'providers-grid',
      modoAtual === 'cliente'
    );
  }

  if (modoAtual === 'prestador') {
    if (titulo) titulo.textContent = 'Meus Serviços';

    if (descricao) {
      descricao.textContent =
        'Escolha os serviços que deseja oferecer.';
    }

    if (busca) {
      busca.value = '';
      busca.placeholder = 'Buscar serviço pelo nome ou descrição...';
    }

    document.title = 'SalvusConnect - Meus Serviços';

    document.getElementById('services-summary')?.remove();

    await carregarServicos();
    return;
  }

  if (titulo) titulo.textContent = 'Prestadores de Serviço';

  if (descricao) {
    descricao.textContent =
      'Consulte os profissionais cadastrados no SalvusConnect.';
  }

  if (busca) {
    busca.value = '';
    busca.placeholder = 'Buscar prestador pelo nome ou descrição...';
  }

  document.title = 'SalvusConnect - Prestadores de Serviços';

  document.getElementById('services-summary')?.remove();

  await carregarPrestadores();
}

/* =========================================
   LISTAGEM DE PRESTADORES — CLIENTE
   ========================================= */

function renderizarPrestadores(lista) {
  const container = obterContainer();
  if (!container) return;

  if (lista.length === 0) {
    container.innerHTML = `
      <div class="providers-empty">
        Nenhum prestador encontrado.
      </div>
    `;
    return;
  }

  container.innerHTML = lista.map(prestador => {
    const nome = escaparHTML(prestador.nome);
    const descricao = escaparHTML(
      prestador.descricao || 'Este profissional ainda não adicionou uma descrição.'
    );

    const primeiraLetra = escaparHTML(
      (prestador.nome || 'P').charAt(0).toUpperCase()
    );

    return `
      <article
        class="provider-card"
        data-id="${prestador.id}"
        tabindex="0"
        role="link"
        aria-label="Ver detalhes de ${nome}"
      >
        <div class="provider-avatar">${primeiraLetra}</div>

        <div class="provider-details">
          <h2 class="provider-name">${nome}</h2>

          <p class="provider-specialty">
            ${descricao}
          </p>

          <div class="provider-stats">
            <span class="services-count">
              <i data-lucide="user-round"></i>
              Prestador cadastrado
            </span>
          </div>
        </div>
      </article>
    `;
  }).join('');

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function filtrarPrestadores() {
  if (modoAtual !== 'cliente') return;

  const input = document.getElementById('search-input');
  if (!input) return;

  const termo = input.value.trim().toLocaleLowerCase('pt-BR');

  const filtrados = prestadores.filter(prestador => {
    const texto = [
      prestador.nome,
      prestador.descricao
    ].join(' ').toLocaleLowerCase('pt-BR');

    return texto.includes(termo);
  });

  renderizarPrestadores(filtrados);
}

async function carregarPrestadores() {
  const container = obterContainer();
  if (!container) return;

  mostrarCarregamento('Carregando prestadores...');

  try {
    const resposta = await fetch(
      '../php/usuarios.php?acao=listar_prestadores',
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
      throw new Error('Resposta inválida do servidor.');
    }

    if (!resposta.ok || !dados.sucesso) {
      throw new Error(
        dados.mensagem || 'Não foi possível carregar os prestadores.'
      );
    }

    if (!Array.isArray(dados.prestadores)) {
      throw new Error('A lista de prestadores retornada é inválida.');
    }

    prestadores = dados.prestadores
      .map(usuario => ({
        id: Number(usuario.id_usuario),
        nome: usuario.nm_nome || 'Prestador',
        descricao: usuario.ds_sobre_mim || ''
      }))
      .filter(prestador =>
        Number.isInteger(prestador.id) && prestador.id > 0
      );

    filtrarPrestadores();

  } catch (erro) {
    console.error('Erro ao carregar prestadores:', erro);

    container.innerHTML = `
      <div class="providers-empty">
        ${escaparHTML(erro.message || 'Não foi possível carregar os prestadores.')}
      </div>
    `;
  }
}

function abrirDetalhesPrestador(card) {
  const id = card.dataset.id;
  if (!id) return;

  window.location.href =
    `prestador-detalhes.html?id=${encodeURIComponent(id)}`;
}

/* =========================================
   CATÁLOGO — PRESTADOR
   ========================================= */

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

function renderizarServicos(lista) {
  const container = obterContainer();
  if (!container) return;

  const avisoAntecedente = antecedenteAprovado
    ? ''
    : `
      <div class="providers-empty" role="status">
        Para ofertar serviços, seu antecedente criminal precisa estar aprovado.
        O catálogo continua disponível para consulta.
      </div>
    `;

  if (lista.length === 0) {
    container.innerHTML = `
      ${avisoAntecedente}
      <div class="providers-empty">
        Nenhum serviço encontrado.
      </div>
    `;
    return;
  }

  container.innerHTML = avisoAntecedente + lista.map(servico => {
    const titulo = escaparHTML(servico.titulo);
    const descricao = escaparHTML(servico.descricao);
    const duracao = escaparHTML(
      formatarDuracao(servico.duracao)
    );
    const preco = escaparHTML(formatarPreco(servico.preco));
    const estaOfertando = servicosOfertados.has(servico.id);
    const ofertaBloqueada = !antecedenteAprovado;

    return `
      <article class="service-card">

        <div class="service-card-top">
          <i data-lucide="briefcase-medical" class="service-icon"></i>
        </div>

        <h2 class="service-name">${titulo}</h2>

        <p class="service-description">${descricao}</p>

        <div class="service-meta">
          <span>
            <i data-lucide="clock"></i>
            ${duracao}
          </span>
        </div>

        <div class="service-price">${preco}</div>

        <button
          type="button"
          class="service-toggle${estaOfertando ? ' is-offering' : ''}"
          data-service-id="${servico.id}"
          aria-pressed="${estaOfertando}"
          ${ofertaBloqueada ? 'disabled' : ''}
        >
          ${estaOfertando ? 'Oferecendo' : '+ Ofertar'}
        </button>

      </article>
    `;
  }).join('');

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function filtrarServicos() {
  if (modoAtual !== 'prestador') return;

  const input = document.getElementById('search-input');
  if (!input) return;

  const termo = input.value.trim().toLocaleLowerCase('pt-BR');

  const filtrados = servicos.filter(servico => {
    const texto = [
      servico.titulo,
      servico.descricao
    ].join(' ').toLocaleLowerCase('pt-BR');

    return texto.includes(termo);
  });

  renderizarServicos(filtrados);
}

async function carregarServicos() {
  const container = obterContainer();
  if (!container) return;

  mostrarCarregamento('Carregando catálogo de serviços...');

  try {
    await obterTokenCSRF();

    servicos = await obterCatalogoServicos();

    await carregarServicosOfertados();

    filtrarServicos();

  } catch (erro) {
    console.error('Erro ao carregar catálogo ou seleção:', erro);

    container.innerHTML = `
      <div class="providers-empty">
        ${escaparHTML(erro.message || 'Não foi possível carregar seus serviços.')}
      </div>
    `;
  }
}

/* =========================================
   EVENTOS DA PÁGINA
   ========================================= */

document.addEventListener('salvus:usuario-carregado', evento => {
  configurarTela(evento.detail);
});

function iniciarEventosServicos() {
  const input = document.getElementById('search-input');
  const container = obterContainer();

  input?.addEventListener('input', () => {
    if (modoAtual === 'prestador') {
      filtrarServicos();
    } else if (modoAtual === 'cliente') {
      filtrarPrestadores();
    }
  });

  container?.addEventListener('click', async evento => {
    if (modoAtual === 'prestador') {
      const botao = evento.target.closest('.service-toggle');

      if (!botao || botao.disabled) return;

      /* Segunda verificação antes de alterar a seleção. */
      if (!antecedenteAprovado) {
        alert(
          'Você precisa ter seu antecedente criminal aprovado para ofertar serviços.'
        );
        return;
      }

      const idServico = Number(botao.dataset.serviceId);

      if (!Number.isInteger(idServico) || idServico < 1) return;

      const selecaoAnterior = new Set(servicosOfertados);

      if (servicosOfertados.has(idServico)) {
        servicosOfertados.delete(idServico);
      } else {
        if (servicosOfertados.size >= 5) {
          alert('Você pode oferecer no máximo cinco serviços.');
          return;
        }

        servicosOfertados.add(idServico);
      }

      container.querySelectorAll('.service-toggle').forEach(botaoServico => {
        botaoServico.disabled = true;
      });

      try {
        await salvarServicosOfertados();

        filtrarServicos();

      } catch (erro) {
        servicosOfertados = selecaoAnterior;

        console.error('Erro ao salvar serviços ofertados:', erro);

        alert(
          erro.message || 'Não foi possível salvar sua seleção. Tente novamente.'
        );

        filtrarServicos();

      } finally {
        container.querySelectorAll('.service-toggle').forEach(botaoServico => {
          botaoServico.disabled = !antecedenteAprovado;
        });
      }

      return;
    }

    if (modoAtual !== 'cliente') return;

    const card = evento.target.closest('.provider-card');

    if (card) {
      abrirDetalhesPrestador(card);
    }
  });

  container?.addEventListener('keydown', evento => {
    if (modoAtual !== 'cliente') return;

    const card = evento.target.closest('.provider-card');

    if (
      card &&
      (evento.key === 'Enter' || evento.key === ' ')
    ) {
      evento.preventDefault();
      abrirDetalhesPrestador(card);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarEventosServicos);
} else {
  iniciarEventosServicos();
}
