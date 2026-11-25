// SalvusConnect — Agendamentos por tipo de usuário.

document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab-btn");
  const lista = document.getElementById("appointments-list");
  const emptyState = document.getElementById("empty-state");

  const modal = document.getElementById("cancel-modal");
  const modalMensagem = document.getElementById("cancel-modal-message");
  const botaoVoltar = document.getElementById("cancel-modal-back");
  const botaoConfirmar = document.getElementById("cancel-modal-confirm");

  let agendamentos = [];
  let usuarioAtual = null;
  let cardSelecionado = null;
  let cancelando = false;
  let filtroAtual = "pendentes";
  let carregando = false;
  let csrfToken = null;
  let selecaoInicialRealizada = false;

  const TIPOS_USUARIO = {
    ADMINISTRADOR: 0,
    PRESTADOR: 1,
    CLIENTE: 3
  };

  function atualizarIcones() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function mostrarMensagem(texto, erro = false) {
    document.getElementById("sc-toast")?.remove();

    const toast = document.createElement("div");
    toast.id = "sc-toast";
    toast.setAttribute("role", erro ? "alert" : "status");

    const icone = document.createElement("span");
    icone.textContent = erro ? "!" : "✓";

    Object.assign(icone.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
      width: "24px",
      height: "24px",
      borderRadius: "50%",
      background: erro ? "#dc2626" : "#16a34a",
      color: "#ffffff",
      fontSize: "16px",
      fontWeight: "700"
    });

    const mensagem = document.createElement("span");
    mensagem.textContent = texto;

    Object.assign(toast.style, {
      position: "fixed",
      top: "18px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "4000",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      width: "min(420px, calc(100vw - 32px))",
      boxSizing: "border-box",
      padding: "12px 15px",
      border: `1px solid ${erro ? "#fecaca" : "#bbf7d0"}`,
      borderRadius: "10px",
      background: erro ? "#fef2f2" : "#f0fdf4",
      color: erro ? "#991b1b" : "#166534",
      boxShadow: "0 8px 24px rgba(22, 101, 52, 0.16)",
      fontSize: "0.88rem",
      fontWeight: "600",
      lineHeight: "1.45",
      boxSizing: "border-box",
      pointerEvents: "none"
    });

    toast.append(icone, mensagem);

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  async function lerJSON(resposta) {
    const texto = await resposta.text();

    try {
      return JSON.parse(texto);
    } catch {
      console.error("Resposta inválida do PHP:", texto);
      throw new Error(
        "Resposta inválida do servidor. Verifique os arquivos PHP e o console."
      );
    }
  }

  // Obtém o token CSRF fornecido pelo agendamentos.php.
  async function obterTokenCSRF() {
    if (csrfToken) return csrfToken;

    const resposta = await fetch("../php/agendamentos.php?acao=csrf", {
      method: "GET",
      credentials: "same-origin",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    });

    const dados = await lerJSON(resposta);

    if (!resposta.ok || !dados.sucesso || !dados.csrf_token) {
      throw new Error(
        dados.mensagem ||
        "Não foi possível validar a segurança da operação."
      );
    }

    csrfToken = dados.csrf_token;

    return csrfToken;
  }

  function normalizarTexto(valor) {
    return String(valor || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  // Formata o nome do serviço com apenas a primeira letra maiúscula.
  function formatarNomeServico(valor) {
    const nome = String(valor || "").trim().toLocaleLowerCase("pt-BR");

    if (!nome) {
      return "Serviço de saúde";
    }

    return (
      nome.charAt(0).toLocaleUpperCase("pt-BR") +
      nome.slice(1)
    );
  }

  function normalizarStatus(status) {
    const valor = normalizarTexto(status).replace(/\s+/g, "_");

    if (["pendente", "pendentes"].includes(valor)) {
      return "pendentes";
    }

    if (
      [
        "aceito",
        "aceita",
        "agendado",
        "agendados",
        "confirmado",
        "confirmados"
      ].includes(valor)
    ) {
      return "agendados";
    }

    if (["em_andamento", "andamento"].includes(valor)) {
      return "andamento";
    }

    if (
      [
        "concluido",
        "concluidos",
        "finalizado",
        "finalizados"
      ].includes(valor)
    ) {
      return "concluidos";
    }

    return "outros";
  }

  function nomeStatus(status) {
    const classe = normalizarStatus(status);

    const nomes = {
      pendentes: "Pendente",
      agendados: "Agendado",
      andamento: "Em andamento",
      concluidos: "Concluído",
      outros: String(status || "Outro status")
    };

    return nomes[classe];
  }

  function criarElemento(tag, classe, texto) {
    const elemento = document.createElement(tag);

    if (classe) elemento.className = classe;
    if (texto !== undefined) elemento.textContent = texto;

    return elemento;
  }

  // Atualiza os números exibidos ao lado das abas.
  function atualizarContadoresAbas() {
    const contagens = {
      pendentes: 0,
      agendados: 0,
      andamento: 0
    };

    agendamentos.forEach(agendamento => {
      const status = normalizarStatus(agendamento.st_agendamento);

      if (Object.prototype.hasOwnProperty.call(contagens, status)) {
        contagens[status]++;
      }
    });

    tabs.forEach(tab => {
      const filtro = tab.dataset.filter;

      // Remove qualquer contador das abas Concluídos e Todos.
      if (!Object.prototype.hasOwnProperty.call(contagens, filtro)) {
        tab.querySelector(".appointment-tab-count")?.remove();
        return;
      }

      let indicador = tab.querySelector(".appointment-tab-count");

      if (!indicador) {
        indicador = criarElemento("span", "appointment-tab-count");
        indicador.setAttribute("aria-hidden", "true");
        tab.appendChild(indicador);
      }

      indicador.textContent = String(contagens[filtro]);
    });
  }

  function formatarDataHora(valor) {
    if (!valor) {
      return {
        data: "Data não definida",
        hora: "Horário não definido"
      };
    }

    const partes = String(valor).replace("T", " ").split(" ");
    const data = partes[0] || "";
    const hora = partes[1] || "";

    const [ano, mes, dia] = data.split("-");

    return {
      data:
        ano && mes && dia
          ? `${dia}/${mes}/${ano}`
          : "Data não definida",
      hora:
        hora
          ? hora.slice(0, 5)
          : "Horário não definido"
    };
  }

  /*
   * Interpreta o horário do banco como horário local.
   * O cancelamento só é permitido antes do horário agendado.
   */
  function horarioAindaFuturo(valor) {
    if (!valor) return false;

    const correspondencia = String(valor)
      .trim()
      .match(
        /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
      );

    if (!correspondencia) return false;

    const [, ano, mes, dia, hora, minuto, segundo = "0"] =
      correspondencia;

    const dataAgendada = new Date(
      Number(ano),
      Number(mes) - 1,
      Number(dia),
      Number(hora),
      Number(minuto),
      Number(segundo)
    );

    // Impede que uma data inválida seja interpretada incorretamente.
    if (
      dataAgendada.getFullYear() !== Number(ano) ||
      dataAgendada.getMonth() !== Number(mes) - 1 ||
      dataAgendada.getDate() !== Number(dia) ||
      dataAgendada.getHours() !== Number(hora) ||
      dataAgendada.getMinutes() !== Number(minuto) ||
      dataAgendada.getSeconds() !== Number(segundo)
    ) {
      return false;
    }

    return dataAgendada.getTime() > Date.now();
  }

  function obterIdCliente(agendamento) {
    return Number(
      agendamento.tb_usuario_id_usuario ??
      agendamento.id_cliente ??
      agendamento.id_usuario ??
      0
    );
  }

  function obterIdPrestador(agendamento) {
    return Number(
      agendamento.tb_prestador_id_usuario ??
      agendamento.id_prestador ??
      agendamento.prestador_id ??
      0
    );
  }

  function pertenceAoUsuario(agendamento) {
    if (!usuarioAtual) return false;

    const tipo = Number(usuarioAtual.cd_tipo_usuario);
    const idUsuario = Number(usuarioAtual.id_usuario);

    if (tipo === TIPOS_USUARIO.ADMINISTRADOR) {
      return true;
    }

    if (tipo === TIPOS_USUARIO.CLIENTE) {
      const idCliente = obterIdCliente(agendamento);
      return idCliente > 0 && idCliente === idUsuario;
    }

    if (tipo === TIPOS_USUARIO.PRESTADOR) {
      const idPrestador = obterIdPrestador(agendamento);
      return idPrestador > 0 && idPrestador === idUsuario;
    }

    return false;
  }

  function obterNomeOutraPessoa(agendamento) {
    const tipo = Number(usuarioAtual?.cd_tipo_usuario);

    if (tipo === TIPOS_USUARIO.CLIENTE) {
      return (
        agendamento.nm_prestador ||
        agendamento.outra_pessoa ||
        "Prestador ainda não definido"
      );
    }

    if (tipo === TIPOS_USUARIO.PRESTADOR) {
      return (
        agendamento.nm_cliente ||
        agendamento.outra_pessoa ||
        "Cliente não identificado"
      );
    }

    const cliente = agendamento.nm_cliente || "Cliente não identificado";
    const prestador = agendamento.nm_prestador || "Prestador não definido";

    return `${cliente} · ${prestador}`;
  }

  function criarBotaoAcao(texto, acao, icone, classe = "") {
    const botao = criarElemento(
      "button",
      `btn-cancelar ${classe}`.trim(),
      texto
    );

    botao.type = "button";
    botao.dataset.acao = acao;

    /*
     * Cada ação possui sua própria cor.
     * Mantém a classe existente para preservar o restante do estilo.
     */
    const coresAcoes = {
      aceitar: {
        backgroundColor: "#2563eb",
        borderColor: "#2563eb",
        color: "#ffffff"
      },
      recusar: {
        backgroundColor: "#b42318",
        borderColor: "#b42318",
        color: "#ffffff"
      },
      iniciar: {
        backgroundColor: "#2563eb",
        borderColor: "#2563eb",
        color: "#ffffff"
      },
      concluir: {
        backgroundColor: "#16804a",
        borderColor: "#16804a",
        color: "#ffffff"
      },
      cancelar: {
        backgroundColor: "#b42318",
        borderColor: "#b42318",
        color: "#ffffff"
      }
    };

    if (coresAcoes[acao]) {
      Object.assign(botao.style, coresAcoes[acao]);
    }

    const simbolo = criarElemento("i");
    simbolo.setAttribute("data-lucide", icone);
    simbolo.setAttribute("aria-hidden", "true");

    botao.prepend(simbolo);
    return botao;
  }

  /*
   * As ações dependem do tipo de usuário, do status
   * e, para cancelar, de o horário ainda não ter chegado.
   */
  function obterAcoesPermitidas(agendamento) {
    const tipo = Number(usuarioAtual?.cd_tipo_usuario);
    const status = normalizarStatus(agendamento.st_agendamento);
    const podeCancelar = horarioAindaFuturo(agendamento.hr_horario);
    const acoes = [];

    if (tipo === TIPOS_USUARIO.CLIENTE) {
      if (
        ["pendentes", "agendados"].includes(status) &&
        podeCancelar
      ) {
        acoes.push({
          texto: "Cancelar",
          acao: "cancelar",
          icone: "circle-x"
        });
      }

      return acoes;
    }

    if (tipo === TIPOS_USUARIO.PRESTADOR) {
      if (status === "pendentes") {
        acoes.push(
          {
            texto: "Aceitar",
            acao: "aceitar",
            icone: "check-circle"
          },
          {
            texto: "Recusar",
            acao: "recusar",
            icone: "x-circle"
          }
        );
      }

      if (status === "agendados") {
        acoes.push({
          texto: "Iniciar atendimento",
          acao: "iniciar",
          icone: "play-circle"
        });

        if (podeCancelar) {
          acoes.push({
            texto: "Cancelar",
            acao: "cancelar",
            icone: "circle-x"
          });
        }
      }

      if (status === "andamento") {
        acoes.push({
          texto: "Concluir atendimento",
          acao: "concluir",
          icone: "check-circle"
        });
      }
    }

    // O administrador continua apenas visualizando os registros.
    return acoes;
  }

  function atualizarAcoesCartao(agendamento, cartao) {
    let container = cartao.querySelector(".appointment-actions");
    const acoesPermitidas = obterAcoesPermitidas(agendamento);

    if (!acoesPermitidas.length) {
      container?.remove();
      return;
    }

    if (!container) {
      container = criarElemento("div", "appointment-actions");
      cartao.appendChild(container);
    }

    container.replaceChildren();

    acoesPermitidas.forEach(item => {
      container.appendChild(
        criarBotaoAcao(
          item.texto,
          item.acao,
          item.icone
        )
      );
    });
  }

  function criarCartao(agendamento) {
    const status = normalizarStatus(agendamento.st_agendamento);
    const cartao = criarElemento("article", "appointment-card");

    cartao.dataset.id = agendamento.id_agendamento;
    cartao.dataset.status = status;
    cartao.dataset.horario = agendamento.hr_horario || "";

    const conteudo = criarElemento("div", "appointment-content");
    const linhaTitulo = criarElemento("div", "appointment-title-row");

    linhaTitulo.appendChild(
      criarElemento(
        "h2",
        "",
        formatarNomeServico(agendamento.nm_servico)
      )
    );

    linhaTitulo.appendChild(
      criarElemento(
        "span",
        `status-badge ${status}`,
        nomeStatus(agendamento.st_agendamento)
      )
    );

    conteudo.appendChild(linhaTitulo);

    conteudo.appendChild(
      criarElemento(
        "p",
        "provider-name",
        obterNomeOutraPessoa(agendamento)
      )
    );

    const dataHora = formatarDataHora(agendamento.hr_horario);
    const detalhes = criarElemento("div", "appointment-details");

    [
      ["calendar-days", dataHora.data],
      ["clock-3", dataHora.hora]
    ].forEach(([icone, texto]) => {
      const item = criarElemento("span");
      const simbolo = criarElemento("i");

      simbolo.setAttribute("data-lucide", icone);
      simbolo.setAttribute("aria-hidden", "true");

      item.append(simbolo, document.createTextNode(` ${texto}`));
      detalhes.appendChild(item);
    });

    conteudo.appendChild(detalhes);

    if (agendamento.nr_duracao_minutos != null) {
      conteudo.appendChild(
        criarElemento(
          "p",
          "appointment-message",
          `Duração: ${Number(agendamento.nr_duracao_minutos)} minutos`
        )
      );
    }

    const mensagens = {
      pendentes: "Aguardando confirmação do prestador.",
      agendados: "Agendamento confirmado.",
      andamento: "Atendimento em andamento.",
      concluidos: "Atendimento concluído.",
      outros: "Consulte o status do atendimento."
    };

    conteudo.appendChild(
      criarElemento(
        "p",
        "appointment-message",
        mensagens[status]
      )
    );

    cartao.appendChild(conteudo);
    atualizarAcoesCartao(agendamento, cartao);

    return cartao;
  }

  /*
   * Atualiza os botões periodicamente sem reconstruir os cartões.
   * O botão Cancelar desaparece quando chega a hora marcada.
   */
  function atualizarBotoesPorHorario() {
    if (!lista) return;

    const cartoes = lista.querySelectorAll(".appointment-card");

    cartoes.forEach(cartao => {
      const botaoCancelar = cartao.querySelector('[data-acao="cancelar"]');

      if (
        botaoCancelar &&
        !horarioAindaFuturo(cartao.dataset.horario)
      ) {
        botaoCancelar.remove();

        const container = cartao.querySelector(".appointment-actions");

        if (container && !container.querySelector("button")) {
          container.remove();
        }
      }
    });
  }

  function filtrarAgendamentos(status) {
    if (!lista) return;

    filtroAtual = status;

    const cards = lista.querySelectorAll(".appointment-card");
    let visiveis = 0;

    cards.forEach(card => {
      const corresponde =
        status === "todos" ||
        card.dataset.status === status;

      card.classList.toggle("hidden", !corresponde);

      if (corresponde) visiveis++;
    });

    if (emptyState) {
      emptyState.classList.toggle("hidden", visiveis > 0);

      const titulo = emptyState.querySelector("h2");
      const texto = emptyState.querySelector("p");

      if (visiveis === 0 && agendamentos.length > 0) {
        if (titulo) {
          titulo.textContent = "Nenhum agendamento nesta categoria";
        }

        if (texto) {
          texto.textContent =
            "Selecione outra categoria para visualizar os atendimentos.";
        }
      }
    }

    tabs.forEach(tab => {
      const ativo = tab.dataset.filter === status;

      tab.classList.toggle("active", ativo);
      tab.setAttribute("aria-pressed", String(ativo));
    });

    atualizarIcones();
  }

  async function carregarAgendamentos() {
    if (carregando || !lista) return;
    carregando = true;

    try {
      const resposta = await fetch("../php/listar_agend.php", {
        method: "GET",
        credentials: "same-origin",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      });

      const dados = await lerJSON(resposta);

      if (!resposta.ok || !dados.sucesso) {
        throw new Error(
          dados.mensagem ||
          "Não foi possível carregar os agendamentos."
        );
      }

      const todos = Array.isArray(dados.agendamentos)
        ? dados.agendamentos
        : [];

      // O PHP também aplica as permissões da sessão.
      agendamentos = todos.filter(pertenceAoUsuario);

      lista.replaceChildren();

      agendamentos.forEach(agendamento => {
        lista.appendChild(criarCartao(agendamento));
      });

      // Atualiza os contadores com a lista recebida do servidor.
      atualizarContadoresAbas();

      // Define a primeira aba automaticamente, somente na carga inicial.
      if (!selecaoInicialRealizada) {
        const prioridades = [
          "pendentes",
          "agendados",
          "andamento",
          "concluidos"
        ];

        filtroAtual =
          prioridades.find(status =>
            agendamentos.some(
              agendamento =>
                normalizarStatus(agendamento.st_agendamento) === status
            )
          ) || "pendentes";

        selecaoInicialRealizada = true;
      }

      if (emptyState) {
        const titulo = emptyState.querySelector("h2");
        const texto = emptyState.querySelector("p");

        if (titulo) titulo.textContent = "Nenhum agendamento";

        if (texto) {
          texto.textContent =
            "Você não possui agendamentos neste status.";
        }

        emptyState.classList.toggle("hidden", agendamentos.length > 0);
      }

      filtrarAgendamentos(filtroAtual);
      atualizarBotoesPorHorario();

    } catch (erro) {
      console.error("Erro ao carregar agendamentos:", erro);

      if (emptyState) {
        emptyState.classList.remove("hidden");

        const titulo = emptyState.querySelector("h2");
        const texto = emptyState.querySelector("p");

        if (titulo) titulo.textContent = "Não foi possível carregar";
        if (texto) texto.textContent = erro.message;
      }
    } finally {
      carregando = false;
    }
  }

  function abrirModal(card) {
    cardSelecionado = card;

    const titulo = card.querySelector(".appointment-title-row h2")
      ?.textContent.trim() || "este agendamento";

    if (modalMensagem) {
      modalMensagem.textContent =
        `Deseja realmente cancelar "${titulo}"?`;
    }

    modal?.classList.remove("hidden");
    modal?.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    if (botaoConfirmar) {
      botaoConfirmar.disabled = false;
      botaoConfirmar.textContent = "Confirmar cancelamento";
    }

    if (botaoVoltar) {
      botaoVoltar.disabled = false;
      botaoVoltar.focus();
    }

    atualizarIcones();
  }

  function fecharModal(forcar = false) {
    if (cancelando && !forcar) return;

    modal?.classList.add("hidden");
    modal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");

    cardSelecionado = null;
  }

  async function executarAcao(acao, id) {
    if (acao === "cancelar") {
      const agendamento = agendamentos.find(
        item => Number(item.id_agendamento) === Number(id)
      );

      if (
        !agendamento ||
        !horarioAindaFuturo(agendamento.hr_horario)
      ) {
        atualizarBotoesPorHorario();

        mostrarMensagem(
          "O horário do atendimento já chegou. Não é mais possível cancelar.",
          true
        );

        return;
      }

      const card = lista.querySelector(
        `.appointment-card[data-id="${CSS.escape(String(id))}"]`
      );

      if (card) abrirModal(card);
      return;
    }

    // Envia a ação ao PHP com o token CSRF.
    try {
      const token = await obterTokenCSRF();

      const resposta = await fetch("../php/agendamentos.php", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-Token": token
        },
        body: JSON.stringify({
          acao,
          id_agendamento: Number(id)
        })
      });

      const dados = await lerJSON(resposta);

      if (!resposta.ok || !dados.sucesso) {
        throw new Error(
          dados.mensagem ||
          `Não foi possível executar a ação "${acao}".`
        );
      }

      mostrarMensagem(dados.mensagem || "Agendamento atualizado.");
      await carregarAgendamentos();

    } catch (erro) {
      console.error(`Erro ao executar ${acao}:`, erro);

      mostrarMensagem(
        erro.message || "Não foi possível atualizar o agendamento.",
        true
      );
    }
  }

  // Abas de status.
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      filtrarAgendamentos(tab.dataset.filter);
    });
  });

  // Botões dos cartões.
  lista?.addEventListener("click", evento => {
    const botao = evento.target.closest("[data-acao]");
    if (!botao) return;

    const card = botao.closest(".appointment-card");
    if (!card) return;

    const id = Number(card.dataset.id);

    if (!Number.isInteger(id) || id < 1) {
      mostrarMensagem("Agendamento sem ID válido.", true);
      return;
    }

    executarAcao(botao.dataset.acao, id);
  });

  botaoVoltar?.addEventListener("click", fecharModal);

  modal?.addEventListener("click", evento => {
    if (evento.target === modal) fecharModal();
  });

  document.addEventListener("keydown", evento => {
    if (
      evento.key === "Escape" &&
      modal &&
      !modal.classList.contains("hidden")
    ) {
      fecharModal();
    }
  });

  if (botaoConfirmar) {
    botaoConfirmar.addEventListener("click", async () => {
      if (!cardSelecionado || cancelando) return;

      const id = Number(cardSelecionado.dataset.id);

      if (!Number.isInteger(id) || id < 1) {
        mostrarMensagem("Agendamento sem ID válido no banco.", true);
        return;
      }

      const agendamento = agendamentos.find(
        item => Number(item.id_agendamento) === id
      );

      // Verifica novamente caso o horário chegue com o modal aberto.
      if (
        !agendamento ||
        !horarioAindaFuturo(agendamento.hr_horario)
      ) {
        fecharModal();
        atualizarBotoesPorHorario();

        mostrarMensagem(
          "O horário do atendimento já chegou. Não é mais possível cancelar.",
          true
        );

        return;
      }

      cancelando = true;
      botaoConfirmar.disabled = true;

      if (botaoVoltar) botaoVoltar.disabled = true;

      botaoConfirmar.textContent = "Cancelando...";

      try {
        // Reutiliza o token CSRF da sessão.
        const token = await obterTokenCSRF();

        const resposta = await fetch("../php/cancelar.php", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-CSRF-Token": token
          },
          body: JSON.stringify({
            id_agendamento: id
          })
        });

        const dados = await lerJSON(resposta);

        if (!resposta.ok || !dados.sucesso) {
          throw new Error(
            dados.mensagem || "Não foi possível cancelar."
          );
        }

        fecharModal(true);
        mostrarMensagem(dados.mensagem || "Agendamento cancelado.");

        await carregarAgendamentos();

      } catch (erro) {
        console.error("Erro ao cancelar:", erro);

        mostrarMensagem(
          erro.message || "Falha ao cancelar.",
          true
        );
      } finally {
        cancelando = false;
        botaoConfirmar.disabled = false;

        if (botaoVoltar) botaoVoltar.disabled = false;

        botaoConfirmar.textContent = "Confirmar cancelamento";
      }
    });
  }

  // Recebe a conta que o sidebar.js já identificou.
  async function definirUsuario(usuario) {
    if (!usuario || usuario.id_usuario == null) return;

    const idAtual = Number(usuarioAtual?.id_usuario);
    const idNovo = Number(usuario.id_usuario);
    const tipoAtual = Number(usuarioAtual?.cd_tipo_usuario);
    const tipoNovo = Number(usuario.cd_tipo_usuario);

    if (idAtual === idNovo && tipoAtual === tipoNovo) return;

    usuarioAtual = usuario;

    if (![0, 1, 3].includes(tipoNovo)) {
      mostrarMensagem("Tipo de usuário sem permissão.", true);
      return;
    }

    await carregarAgendamentos();
  }

  document.addEventListener("salvus:usuario-carregado", evento => {
    definirUsuario(evento.detail);
  });

  // Fallback caso a sessão ainda não tenha sido recebida pelo sidebar.
  async function carregarSessao() {
    if (usuarioAtual) return;

    try {
      const resposta = await fetch("../php/sessao.php", {
        method: "GET",
        credentials: "same-origin",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      });

      const dados = await lerJSON(resposta);

      if (!resposta.ok || !dados.sucesso || !dados.usuario) {
        throw new Error(
          dados.mensagem || "Não foi possível identificar a sessão."
        );
      }

      await definirUsuario(dados.usuario);

    } catch (erro) {
      console.error("Erro ao identificar usuário:", erro);

      mostrarMensagem(
        "Não foi possível identificar sua conta. Atualize a página.",
        true
      );
    }
  }

  // Checa o limite de cancelamento a cada segundo.
  setInterval(atualizarBotoesPorHorario, 1000);

  carregarSessao();
  atualizarIcones();
});
