
document.addEventListener('DOMContentLoaded', () => {
    const API_ADMIN = '../php/admin_dados.php';
    const API_ANTECEDENTES = '../php/antecedentes.php';
    const API_LOGOUT = '../php/logout.php';
    const LOGIN_PAGE = '../pages/login.html';

    // ---------------------------------------------------------
    // ELEMENTOS DO PAINEL
    // ---------------------------------------------------------

    const elementos = {
        usuarios: document.getElementById('totalUsuarios'),
        prestadores: document.getElementById('totalPrestadores'),
        agendamentos: document.getElementById('agendamentosPendentes'),
        antecedentes: document.getElementById('antecedentesPendentes')
    };

    const menuAntecedentes = document.getElementById('menuAntecedentes');
    const btnRefresh = document.getElementById('refreshAdmin');
    const containerAntecedentes = document.getElementById('containerAntecedentes');
    const containerHistorico = document.getElementById('containerHistorico');

    // Containers existentes no HTML.
    const containerAgendamentos = document.querySelector(
        '#section-appointments .admin-panel-card'
    );

    const containerUsuarios = document.querySelector(
        '#section-users .admin-panel-card'
    );

    // ---------------------------------------------------------
    // CONTROLE DO MENU LATERAL
    // ---------------------------------------------------------

    const botoesNav = document.querySelectorAll('[data-section]');
    const secoes = document.querySelectorAll('.admin-section');

    const sidebar = document.getElementById('adminSidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebarToggle = document.getElementById('sidebarToggle');

    // ---------------------------------------------------------
    // VARIÁVEIS
    // ---------------------------------------------------------

    let csrfToken = null;
    let carregamentoEmAndamento = false;
    let analiseEmAndamento = false;

    // ---------------------------------------------------------
    // FUNÇÕES AUXILIARES
    // ---------------------------------------------------------

    function atualizarIcones() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    function escaparHTML(valor) {
        return String(valor ?? '').replace(/[&<>"']/g, caractere => {
            const caracteres = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };

            return caracteres[caractere];
        });
    }

    function formatarData(data) {
        if (!data) {
            return 'Não informada';
        }

        const dataConvertida = new Date(
            String(data).replace(' ', 'T')
        );

        if (Number.isNaN(dataConvertida.getTime())) {
            return escaparHTML(data);
        }

        return dataConvertida.toLocaleString('pt-BR');
    }

    function fecharMenuMobile() {
        if (sidebar) {
            sidebar.classList.remove('open');
        }

        if (sidebarOverlay) {
            sidebarOverlay.classList.remove('active');
        }

        if (sidebarToggle) {
            sidebarToggle.setAttribute('aria-expanded', 'false');
        }
    }

    function abrirFecharMenuMobile() {
        if (!sidebar || !sidebarOverlay || !sidebarToggle) {
            return;
        }

        const menuAberto = sidebar.classList.toggle('open');

        sidebarOverlay.classList.toggle('active', menuAberto);
        sidebarToggle.setAttribute('aria-expanded', String(menuAberto));
    }

    function exibirErroNosContadores() {
        Object.values(elementos).forEach(elemento => {
            if (elemento) {
                elemento.textContent = '—';
            }
        });

        if (menuAntecedentes) {
            menuAntecedentes.textContent = '—';
        }
    }

    // ---------------------------------------------------------
    // EXIBIÇÃO DOS ANTECEDENTES
    // ---------------------------------------------------------

    function renderizarAntecedentes(antecedentes) {
        if (!containerAntecedentes) {
            console.warn(
                'O elemento containerAntecedentes não foi encontrado.'
            );
            return;
        }

        if (!Array.isArray(antecedentes) || antecedentes.length === 0) {
            containerAntecedentes.innerHTML = `
                <p class="admin-empty-message">
                    Nenhum documento de antecedente foi enviado até o momento.
                </p>
            `;
            return;
        }

        const documentos = antecedentes.map(documento => {
            const id = Number(documento.id_antecedente);
            const status = String(documento.st_analise || '').toUpperCase();

            let statusTexto = 'Não identificado';

            if (status === 'PENDENTE') {
                statusTexto = 'Pendente';
            } else if (status === 'APROVADO') {
                statusTexto = 'Aprovado';
            } else if (status === 'REPROVADO') {
                statusTexto = 'Reprovado';
            }

            // Identificação do prestador.
            const nomePrestador = escaparHTML(
                documento.nome_prestador || 'Nome não informado'
            );

            const cpfPrestador = escaparHTML(
                documento.cpf_mascarado || 'Não informado'
            );

            const telefonePrestador = escaparHTML(
                documento.telefone_prestador || 'Não informado'
            );

            // Informações do documento.
            const tipoArquivo = escaparHTML(
                documento.nm_tipo_arquivo || 'Não informado'
            );

            const dataEnvio = formatarData(documento.dt_envio);
            const dataAnalise = formatarData(documento.dt_analise);

            const observacao = documento.ds_observacao
                ? escaparHTML(documento.ds_observacao)
                : 'Nenhuma observação registrada.';

            const documentoValido = Number.isInteger(id) && id > 0;

            // Endereço do documento protegido.
            const urlDocumento = documentoValido
                ? `${API_ANTECEDENTES}?id=${encodeURIComponent(id)}`
                : '';

            // Botões de aprovação e reprovação.
            const botoesAcao = status === 'PENDENTE'
                ? `
                    <div class="antecedente-acoes">
                        <button
                            type="button"
                            class="btn-aprovar-antecedente"
                            data-antecedente-acao="aprovar"
                            data-id="${id}"
                        >
                            Aprovar
                        </button>

                        <button
                            type="button"
                            class="btn-reprovar-antecedente"
                            data-antecedente-acao="reprovar"
                            data-id="${id}"
                        >
                            Reprovar
                        </button>
                    </div>
                `
                : `
                    <p class="antecedente-resultado">
                        Documento já analisado.
                    </p>
                `;

            // Prévia do documento enviado.
            const previaDocumento = documentoValido
                ? `
                    <div class="antecedente-previa">
                        <h4>Prévia do documento</h4>

                        <a
                            href="${urlDocumento}"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="antecedente-link-documento"
                        >
                            Abrir documento completo
                        </a>

                        <div class="antecedente-previa-arquivo">
                            <iframe
                                src="${urlDocumento}#toolbar=0&navpanes=0"
                                title="Prévia do documento de ${nomePrestador}"
                                loading="lazy"
                            ></iframe>
                        </div>
                    </div>
                `
                : `
                    <div class="antecedente-previa">
                        <p>Prévia indisponível.</p>
                    </div>
                `;

            return `
                <article class="antecedente-card">

                    <div class="antecedente-card-info">

                        <div class="antecedente-cabecalho">

                            <span class="antecedente-status status-${escaparHTML(status.toLowerCase())}">
                                ${statusTexto}
                            </span>

                            <h3>${nomePrestador}</h3>

                        </div>

                        <div class="antecedente-dados-prestador">
                            <h4>Dados do prestador</h4>

                            <p>
                                <strong>CPF:</strong>
                                ${cpfPrestador}
                            </p>

                            <p>
                                <strong>Telefone:</strong>
                                ${telefonePrestador}
                            </p>
                        </div>

                        <div class="antecedente-dados-documento">
                            <h4>Informações do documento</h4>

                            <p>
                                <strong>Documento:</strong>
                                ${tipoArquivo}
                            </p>

                            <p>
                                <strong>Enviado em:</strong>
                                ${dataEnvio}
                            </p>
                        </div>

                        ${
                            status !== 'PENDENTE'
                                ? `
                                    <div class="antecedente-dados-analise">
                                        <p>
                                            <strong>Analisado em:</strong>
                                            ${dataAnalise}
                                        </p>

                                        <p>
                                            <strong>Observação:</strong>
                                            ${observacao}
                                        </p>
                                    </div>
                                `
                                : ''
                        }

                        <div class="antecedente-botoes">
                            ${botoesAcao}
                        </div>

                    </div>

                    ${previaDocumento}

                </article>
            `;
        }).join('');

        containerAntecedentes.innerHTML = documentos;

        atualizarIcones();
    }

    // ---------------------------------------------------------
    // EXIBIÇÃO DOS AGENDAMENTOS
    // ---------------------------------------------------------

    function renderizarAgendamentos(agendamentos) {
        if (!containerAgendamentos) {
            console.warn(
                'O container de agendamentos não foi encontrado.'
            );
            return;
        }

        if (!Array.isArray(agendamentos) || agendamentos.length === 0) {
            containerAgendamentos.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <i data-lucide="calendar-days"></i>
                    </div>
                    <h3>Nenhum agendamento encontrado</h3>
                    <p>Os atendimentos cadastrados aparecerão aqui.</p>
                </div>
            `;

            atualizarIcones();
            return;
        }

        const textosStatus = {
            pendente: 'Pendente',
            aceito: 'Aceito',
            recusado: 'Recusado',
            em_andamento: 'Em andamento',
            concluido: 'Concluído'
        };

        const cards = agendamentos.map(agendamento => {
            const statusOriginal = String(
                agendamento.st_agendamento || ''
            ).toLowerCase();

            const statusTexto = textosStatus[statusOriginal] ||
                'Não identificado';

            const statusClasse = escaparHTML(
                statusOriginal.replace(/[^a-z0-9_-]/g, '')
            );

            const nomePrestador = escaparHTML(
                agendamento.nome_prestador || 'Não informado'
            );

            const emailPrestador = escaparHTML(
                agendamento.email_prestador || 'Não informado'
            );

            const nomeCliente = escaparHTML(
                agendamento.nome_cliente || 'Não informado'
            );

            const emailCliente = escaparHTML(
                agendamento.email_cliente || 'Não informado'
            );

            const servico = escaparHTML(
                agendamento.nm_servico || 'Não informado'
            );

            const dataHorario = formatarData(
                agendamento.hr_horario
            );

            const localBusca = escaparHTML(
                agendamento.ds_local_busca || 'Não informado'
            );

            const localEntrega = escaparHTML(
                agendamento.ds_local_entrega || 'Não informado'
            );

            return `
                <article class="admin-panel-card"
                    style="
                        margin-bottom: 18px;
                        border: 1px solid #e0e8ff;
                        border-radius: 12px;
                        padding: 20px;
                    "
                >
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        flex-wrap: wrap;
                        gap: 12px;
                        margin-bottom: 18px;
                    ">
                        <h3 style="margin: 0;">
                            Agendamento #${escaparHTML(agendamento.id_agendamento)}
                        </h3>

                        <span class="agendamento-status status-${statusClasse}"
                            style="
                                display: inline-block;
                                padding: 8px 14px;
                                border-radius: 20px;
                                background: #e0e8ff;
                                color: #0b132b;
                                font-weight: 700;
                            "
                        >
                            ${statusTexto}
                        </span>
                    </div>

                    <div style="
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                        gap: 14px;
                        margin-bottom: 18px;
                    ">
                        <div style="
                            padding: 16px;
                            border-radius: 10px;
                            background: #f4f7ff;
                        ">
                            <h4 style="margin-top: 0;">
                                <i data-lucide="wrench"></i>
                                Prestador
                            </h4>

                            <p><strong>Nome:</strong> ${nomePrestador}</p>
                            <p><strong>E-mail:</strong> ${emailPrestador}</p>
                        </div>

                        <div style="
                            padding: 16px;
                            border-radius: 10px;
                            background: #f4f7ff;
                        ">
                            <h4 style="margin-top: 0;">
                                <i data-lucide="user-round"></i>
                                Cliente
                            </h4>

                            <p><strong>Nome:</strong> ${nomeCliente}</p>
                            <p><strong>E-mail:</strong> ${emailCliente}</p>
                        </div>
                    </div>

                    <div style="
                        border-top: 1px solid #e0e8ff;
                        padding-top: 14px;
                    ">
                        <h4>Informações do atendimento</h4>

                        <p>
                            <strong>Serviço:</strong>
                            ${servico}
                        </p>

                        <p>
                            <strong>Data e horário:</strong>
                            ${dataHorario}
                        </p>

                        <p>
                            <strong>Local de busca:</strong>
                            ${localBusca}
                        </p>

                        <p>
                            <strong>Local de entrega:</strong>
                            ${localEntrega}
                        </p>
                    </div>
                </article>
            `;
        }).join('');

        containerAgendamentos.innerHTML = cards;

        atualizarIcones();
    }

    // ---------------------------------------------------------
    // HISTÓRICO DE AGENDAMENTOS
    // ---------------------------------------------------------

    function renderizarHistorico(agendamentos) {
        if (!containerHistorico) {
            console.warn(
                'O container do histórico não foi encontrado.'
            );
            return;
        }

        if (!Array.isArray(agendamentos) || agendamentos.length === 0) {
            containerHistorico.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <i data-lucide="history"></i>
                    </div>
                    <h3>Nenhum registro encontrado</h3>
                    <p>Os registros dos atendimentos aparecerão aqui.</p>
                </div>
            `;

            atualizarIcones();
            return;
        }

        const textosStatus = {
            pendente: 'Pendente',
            aceito: 'Aceito',
            recusado: 'Recusado',
            em_andamento: 'Em andamento',
            concluido: 'Concluído'
        };

        const cards = agendamentos.map(agendamento => {
            const statusOriginal = String(
                agendamento.st_agendamento || ''
            ).toLowerCase();

            const statusTexto = textosStatus[statusOriginal] ||
                'Não identificado';

            const statusClasse = escaparHTML(
                statusOriginal.replace(/[^a-z0-9_-]/g, '')
            );

            const id = escaparHTML(
                agendamento.id_agendamento || 'Não informado'
            );

            const nomePrestador = escaparHTML(
                agendamento.nome_prestador || 'Não informado'
            );

            const nomeCliente = escaparHTML(
                agendamento.nome_cliente || 'Não informado'
            );

            const servico = escaparHTML(
                agendamento.nm_servico || 'Não informado'
            );

            const dataHorario = formatarData(
                agendamento.hr_horario
            );

            return `
                <article class="admin-panel-card"
                    style="
                        margin-bottom: 18px;
                        border: 1px solid #e0e8ff;
                        border-radius: 12px;
                        padding: 20px;
                    "
                >
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        flex-wrap: wrap;
                        gap: 12px;
                        margin-bottom: 18px;
                    ">
                        <h3 style="margin: 0;">
                            Agendamento #${id}
                        </h3>

                        <span class="agendamento-status status-${statusClasse}"
                            style="
                                display: inline-block;
                                padding: 8px 14px;
                                border-radius: 20px;
                                background: #e0e8ff;
                                color: #0b132b;
                                font-weight: 700;
                            "
                        >
                            ${statusTexto}
                        </span>
                    </div>

                    <div style="
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                        gap: 14px;
                        margin-bottom: 18px;
                    ">
                        <div style="
                            padding: 16px;
                            border-radius: 10px;
                            background: #f4f7ff;
                        ">
                            <h4 style="margin-top: 0;">
                                <i data-lucide="wrench"></i>
                                Prestador
                            </h4>

                            <p><strong>Nome:</strong> ${nomePrestador}</p>
                        </div>

                        <div style="
                            padding: 16px;
                            border-radius: 10px;
                            background: #f4f7ff;
                        ">
                            <h4 style="margin-top: 0;">
                                <i data-lucide="user-round"></i>
                                Cliente
                            </h4>

                            <p><strong>Nome:</strong> ${nomeCliente}</p>
                        </div>
                    </div>

                    <div style="
                        border-top: 1px solid #e0e8ff;
                        padding-top: 14px;
                    ">
                        <h4>Informações do atendimento</h4>

                        <p>
                            <strong>Serviço:</strong>
                            ${servico}
                        </p>

                        <p>
                            <strong>Data e horário:</strong>
                            ${dataHorario}
                        </p>
                    </div>
                </article>
            `;
        }).join('');

        containerHistorico.innerHTML = cards;

        atualizarIcones();
    }

    // ---------------------------------------------------------
    // EXIBIÇÃO DOS USUÁRIOS
    // ---------------------------------------------------------

    function renderizarUsuarios(usuariosComuns, prestadores) {
        if (!containerUsuarios) {
            console.warn(
                'O container de usuários não foi encontrado.'
            );
            return;
        }

        const listaUsuarios = Array.isArray(usuariosComuns)
            ? usuariosComuns
            : [];

        const listaPrestadores = Array.isArray(prestadores)
            ? prestadores
            : [];

        const criarCartoes = (lista, tipo) => {
            if (lista.length === 0) {
                return `
                    <p class="admin-empty-message">
                        Nenhum ${tipo} cadastrado até o momento.
                    </p>
                `;
            }

            return lista.map(usuario => {
                const nome = escaparHTML(
                    usuario.nm_nome || 'Nome não informado'
                );

                const email = escaparHTML(
                    usuario.email || 'E-mail não informado'
                );

                const telefone = escaparHTML(
                    usuario.telefone || 'Não informado'
                );

                const sobreMim = escaparHTML(
                    usuario.ds_sobre_mim || 'Não informado'
                );

                return `
                    <article class="admin-panel-card"
                        style="
                            padding: 16px;
                            border: 1px solid #e0e8ff;
                            border-radius: 10px;
                            margin-bottom: 12px;
                        "
                    >
                        <div style="
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            margin-bottom: 12px;
                        ">
                            <div style="
                                width: 42px;
                                height: 42px;
                                min-width: 42px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                border-radius: 50%;
                                background: #e0e8ff;
                                color: #2563eb;
                            ">
                                <i data-lucide="${
                                    tipo === 'prestador'
                                        ? 'wrench'
                                        : 'user-round'
                                }"></i>
                            </div>

                            <div>
                                <h4 style="margin: 0 0 4px;">
                                    ${nome}
                                </h4>
                                <small>
                                    Cadastro #${escaparHTML(usuario.id_usuario)}
                                </small>
                            </div>
                        </div>

                        <p>
                            <strong>E-mail:</strong>
                            ${email}
                        </p>

                        ${
                            tipo === 'prestador'
                                ? `
                                    <p>
                                        <strong>Telefone:</strong>
                                        ${telefone}
                                    </p>

                                    <p>
                                        <strong>Sobre:</strong>
                                        ${sobreMim}
                                    </p>
                                `
                                : ''
                        }
                    </article>
                `;
            }).join('');
        };

        containerUsuarios.innerHTML = `
            <div style="
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
                gap: 20px;
            ">
                <section>
                    <h3>
                        <i data-lucide="users"></i>
                        Usuários comuns
                        (${listaUsuarios.length})
                    </h3>

                    ${criarCartoes(listaUsuarios, 'usuário')}
                </section>

                <section>
                    <h3>
                        <i data-lucide="wrench"></i>
                        Prestadores
                        (${listaPrestadores.length})
                    </h3>

                    ${criarCartoes(listaPrestadores, 'prestador')}
                </section>
            </div>
        `;

        atualizarIcones();
    }

    // ---------------------------------------------------------
    // CARREGAMENTO DOS DADOS DO PAINEL
    // ---------------------------------------------------------

    async function carregarDadosAdmin() {
        if (carregamentoEmAndamento) {
            return;
        }

        carregamentoEmAndamento = true;

        Object.values(elementos).forEach(elemento => {
            if (elemento) {
                elemento.textContent = '...';
            }
        });

        try {
            const resposta = await fetch(API_ADMIN, {
                method: 'GET',
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json'
                },
                cache: 'no-store'
            });

            const textoResposta = await resposta.text();

            let dados;

            try {
                dados = JSON.parse(textoResposta);
            } catch {
                throw new Error(
                    'O servidor retornou uma resposta inválida.'
                );
            }

            if (!resposta.ok || !dados.sucesso) {
                throw new Error(
                    dados.mensagem || 'Não foi possível carregar os dados.'
                );
            }

            // Armazena o token CSRF administrativo.
            if (typeof dados.csrf_token === 'string') {
                csrfToken = dados.csrf_token;
            }

            // Atualiza os indicadores.
            if (elementos.usuarios) {
                elementos.usuarios.textContent = dados.total_usuarios ?? 0;
            }

            if (elementos.prestadores) {
                elementos.prestadores.textContent = dados.total_prestadores ?? 0;
            }

            if (elementos.agendamentos) {
                elementos.agendamentos.textContent = dados.agendamentos_pendentes ?? 0;
            }

            if (elementos.antecedentes) {
                elementos.antecedentes.textContent = dados.antecedentes_pendentes ?? 0;
            }

            // Atualiza o contador do menu lateral.
            if (menuAntecedentes) {
                menuAntecedentes.textContent = dados.antecedentes_pendentes ?? 0;
            }

            // Atualiza as listagens administrativas.
            renderizarAntecedentes(dados.antecedentes);
            renderizarAgendamentos(dados.agendamentos);
            renderizarHistorico(dados.agendamentos);

            renderizarUsuarios(
                dados.usuarios_comuns,
                dados.prestadores
            );

        } catch (erro) {
            console.error(
                'Erro ao carregar painel administrativo:',
                erro
            );

            exibirErroNosContadores();

            if (containerAntecedentes) {
                containerAntecedentes.innerHTML = `
                    <p class="admin-error-message">
                        Não foi possível carregar os documentos.
                        Tente atualizar o painel.
                    </p>
                `;
            }

            if (containerAgendamentos) {
                containerAgendamentos.innerHTML = `
                    <p class="admin-error-message">
                        Não foi possível carregar os agendamentos.
                        Tente atualizar o painel.
                    </p>
                `;
            }

            if (containerHistorico) {
                containerHistorico.innerHTML = `
                    <p class="admin-error-message">
                        Não foi possível carregar o histórico.
                        Tente atualizar o painel.
                    </p>
                `;
            }

            if (containerUsuarios) {
                containerUsuarios.innerHTML = `
                    <p class="admin-error-message">
                        Não foi possível carregar os usuários.
                        Tente atualizar o painel.
                    </p>
                `;
            }

        } finally {
            carregamentoEmAndamento = false;
        }
    }

    // ---------------------------------------------------------
    // APROVAR OU REPROVAR ANTECEDENTES
    // ---------------------------------------------------------

    async function analisarAntecedente(id, decisao) {
        if (analiseEmAndamento) {
            return;
        }

        if (!csrfToken) {
            if (decisao === 'REPROVADO') {
                alert(
                    'Não foi possível validar sua sessão. Atualize o painel.'
                );
            } else {
                console.error(
                    'Não foi possível validar a sessão para aprovar o documento.'
                );
            }

            return;
        }

        let observacao = '';

        // A aprovação é executada diretamente, sem confirmação.
        // Na reprovação, continua sendo obrigatório informar o motivo.
        if (decisao === 'REPROVADO') {
            observacao = prompt(
                'Informe o motivo da reprovação:'
            );

            if (observacao === null) {
                return;
            }

            observacao = observacao.trim();

            if (!observacao) {
                alert('É necessário informar o motivo da reprovação.');
                return;
            }

            if (observacao.length > 1000) {
                alert('A observação deve ter no máximo 1000 caracteres.');
                return;
            }
        }

        analiseEmAndamento = true;

        try {
            const resposta = await fetch(API_ADMIN, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({
                    id_antecedente: id,
                    decisao: decisao,
                    observacao: observacao
                })
            });

            const textoResposta = await resposta.text();

            let dados;

            try {
                dados = JSON.parse(textoResposta);
            } catch {
                throw new Error(
                    'O servidor retornou uma resposta inválida.'
                );
            }

            if (!resposta.ok || !dados.sucesso) {
                throw new Error(
                    dados.mensagem || 'Não foi possível analisar o documento.'
                );
            }

            // Na aprovação, não exibe mensagem.
            // Na reprovação, mantém o retorno ao administrador.
            if (decisao === 'REPROVADO') {
                alert(dados.mensagem);
            }

            // Atualiza indicadores e lista após a decisão.
            await carregarDadosAdmin();

        } catch (erro) {
            console.error(
                'Erro ao analisar antecedente:',
                erro
            );

            // Não exibe mensagens durante a aprovação.
            // Na reprovação, mantém o aviso de erro.
            if (decisao === 'REPROVADO') {
                alert(
                    erro.message ||
                    'Ocorreu um erro ao analisar o documento.'
                );
            }

        } finally {
            analiseEmAndamento = false;
        }
    }

    // Eventos dos botões da lista.
    if (containerAntecedentes) {
        containerAntecedentes.addEventListener('click', event => {
            const botao = event.target.closest(
                '[data-antecedente-acao]'
            );

            if (!botao) {
                return;
            }

            const id = Number(botao.dataset.id);
            const acao = botao.dataset.antecedenteAcao;

            if (!Number.isInteger(id) || id <= 0) {
                console.error('Identificador do documento inválido.');
                return;
            }

            if (acao === 'aprovar') {
                analisarAntecedente(id, 'APROVADO');
            } else if (acao === 'reprovar') {
                analisarAntecedente(id, 'REPROVADO');
            }
        });
    }

    // ---------------------------------------------------------
    // NAVEGAÇÃO ENTRE AS SEÇÕES
    // ---------------------------------------------------------

    function alternarSecao(targetSection) {
        if (!targetSection) {
            return;
        }

        const secaoAtiva = document.getElementById(
            `section-${targetSection}`
        );

        if (!secaoAtiva || !secaoAtiva.classList.contains('admin-section')) {
            console.warn(
                `A seção "${targetSection}" não foi encontrada.`
            );
            return;
        }

        secoes.forEach(secao => {
            secao.classList.remove('active');
        });

        botoesNav.forEach(botao => {
            botao.classList.remove('active');
        });

        secaoAtiva.classList.add('active');

        botoesNav.forEach(botao => {
            if (botao.getAttribute('data-section') === targetSection) {
                botao.classList.add('active');
            }
        });

        fecharMenuMobile();

        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }

    botoesNav.forEach(botao => {
        botao.addEventListener('click', () => {
            const section = botao.getAttribute('data-section');
            alternarSecao(section);
        });
    });

    // ---------------------------------------------------------
    // MENU MOBILE
    // ---------------------------------------------------------

    if (sidebarToggle && sidebar && sidebarOverlay) {
        sidebarToggle.addEventListener('click', abrirFecharMenuMobile);

        sidebarOverlay.addEventListener('click', fecharMenuMobile);

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                fecharMenuMobile();
            }
        });
    }

    // ---------------------------------------------------------
    // ATUALIZAÇÃO MANUAL
    // ---------------------------------------------------------

    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            carregarDadosAdmin();
        });
    }

    // ---------------------------------------------------------
    // LOGOUT
    // ---------------------------------------------------------

    const logoutLink = document.querySelector('.logout-link');

    if (logoutLink) {
        logoutLink.addEventListener('click', async event => {
            event.preventDefault();

            try {
                const resposta = await fetch(API_LOGOUT, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                const textoResposta = await resposta.text();

                let dados = {};

                try {
                    dados = JSON.parse(textoResposta);
                } catch {
                    dados = {};
                }

                if (!resposta.ok) {
                    throw new Error(
                        dados.mensagem || 'Não foi possível encerrar a sessão.'
                    );
                }

                if (dados.sucesso && dados.redirect) {
                    const destino = new URL(
                        dados.redirect,
                        window.location.href
                    );

                    if (destino.origin === window.location.origin) {
                        window.location.href = destino.href;
                        return;
                    }
                }

                window.location.href = LOGIN_PAGE;

            } catch (erro) {
                console.error('Erro ao efetuar logout:', erro);
                window.location.href = LOGIN_PAGE;
            }
        });
    }

    // ---------------------------------------------------------
    // INICIALIZAÇÃO
    // ---------------------------------------------------------

    atualizarIcones();
    carregarDadosAdmin();

    // Atualiza os dados automaticamente a cada 60 segundos.
    setInterval(carregarDadosAdmin, 60000);

    // Atualiza os dados quando o usuário retorna à página.
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            carregarDadosAdmin();
        }
    });
});
