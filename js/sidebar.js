(function () {
    const caminhoAtual = window.location.pathname;
    const arquivoAtual = caminhoAtual.split('/').pop().toLowerCase();

    let mensagensNaoLidas = false;
    let agendamentosNovos = false;
    let antecedenteEnviado = false;
    let usuarioAtual = null;
    let intervaloAgendamentos = null;

    // INDICADORES

    function atualizarIndicadorMensagens() {
        const indicador = document.querySelector(
            '[data-notification="mensagens"]'
        );

        if (indicador) {
            indicador.hidden = !mensagensNaoLidas;
        }
    }

    function atualizarIndicadorAgendamentos() {
        const indicador = document.querySelector(
            '[data-notification="agendamentos"]'
        );

        if (indicador) {
            indicador.hidden = !agendamentosNovos;
        }
    }

    function atualizarIndicadorAntecedentes() {
        const indicador = document.querySelector(
            '[data-notification="antecedentes"]'
        );

        if (indicador) {
            indicador.hidden = antecedenteEnviado;
        }
    }

    async function consultarAntecedenteEnviado(usuario) {
        const tipoUsuario = Number(usuario?.cd_tipo_usuario);

        if (tipoUsuario !== 1) {
            antecedenteEnviado = true;
            atualizarIndicadorAntecedentes();
            return;
        }

        // Mantém o aviso visível até confirmar o envio.
        antecedenteEnviado = false;
        atualizarIndicadorAntecedentes();

        try {
            const resposta = await fetch(
                '../php/usuarios.php?acao=meus_dados',
                {
                    method: 'GET',
                    credentials: 'same-origin',
                    headers: {
                        'Accept': 'application/json'
                    },
                    cache: 'no-store'
                }
            );

            if (!resposta.ok) {
                throw new Error(
                    'Não foi possível consultar o envio do antecedente.'
                );
            }

            const dados = await resposta.json();

            if (!dados.sucesso || !dados.usuario) {
                throw new Error(
                    dados.mensagem ||
                    'Resposta inválida ao consultar o antecedente.'
                );
            }

            antecedenteEnviado =
                dados.usuario.antecedente_enviado === true;

            atualizarIndicadorAntecedentes();
        } catch (erro) {
            console.error(
                'Erro ao consultar o envio do antecedente:',
                erro
            );

            // Se a consulta falhar, o aviso continua visível.
            antecedenteEnviado = false;
            atualizarIndicadorAntecedentes();
        }
    }

    // CONTROLE DE NOVIDADES NOS AGENDAMENTOS

    function obterChavesAgendamentos(usuario) {
        const identificador = String(usuario.id_usuario);

        return {
            snapshot: `salvus_agendamentos_snapshot_${identificador}`,
            pendentes: `salvus_agendamentos_pendentes_${identificador}`,
            sessao: `salvus_agendamentos_sessao_${identificador}`
        };
    }

    function criarSnapshotAgendamentos(agendamentos) {
        const snapshot = {};

        agendamentos.forEach(function (agendamento) {
            const id = String(agendamento.id_agendamento);
            const status = String(
                agendamento.st_agendamento || ''
            ).trim().toLowerCase();

            snapshot[id] = status;
        });

        return snapshot;
    }

    function possuiAgendamentoAtivo(agendamentos) {
        const statusAtivos = [
            'pendente',
            'aceito',
            'em_andamento'
        ];

        return agendamentos.some(function (agendamento) {
            const status = String(
                agendamento.st_agendamento || ''
            ).trim().toLowerCase();

            return statusAtivos.includes(status);
        });
    }

    function verificarAlteracoesAgendamentos(
        snapshotAtual,
        snapshotAnterior
    ) {
        let encontrouNovidade = false;

        Object.keys(snapshotAtual).forEach(function (id) {
            const statusAtual = snapshotAtual[id];

            // Novo agendamento.
            if (!Object.prototype.hasOwnProperty.call(
                snapshotAnterior,
                id
            )) {
                if ([
                    'pendente',
                    'aceito',
                    'em_andamento'
                ].includes(statusAtual)) {
                    encontrouNovidade = true;
                }

                return;
            }

            // Alteração de status de um agendamento existente.
            if (snapshotAnterior[id] !== statusAtual) {
                encontrouNovidade = true;
            }
        });

        return encontrouNovidade;
    }

    function consultarAgendamentosNovos(usuario) {
        const tipoUsuario = Number(usuario?.cd_tipo_usuario);

        if (![1, 3].includes(tipoUsuario)) {
            agendamentosNovos = false;
            atualizarIndicadorAgendamentos();
            return Promise.resolve();
        }

        return fetch('../php/listar_agend.php', {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            },
            cache: 'no-store'
        })
            .then(function (resposta) {
                if (!resposta.ok) {
                    throw new Error(
                        'Não foi possível consultar os agendamentos.'
                    );
                }

                return resposta.json();
            })
            .then(function (dados) {
                if (
                    !dados.sucesso ||
                    !Array.isArray(dados.agendamentos)
                ) {
                    throw new Error(
                        dados.mensagem ||
                        'Resposta inválida dos agendamentos.'
                    );
                }

                const chaves = obterChavesAgendamentos(usuario);

                const snapshotAtual = criarSnapshotAgendamentos(
                    dados.agendamentos
                );

                const snapshotSalvo = localStorage.getItem(
                    chaves.snapshot
                );

                let snapshotAnterior = {};

                if (snapshotSalvo !== null) {
                    try {
                        snapshotAnterior = JSON.parse(snapshotSalvo);

                        if (
                            !snapshotAnterior ||
                            typeof snapshotAnterior !== 'object' ||
                            Array.isArray(snapshotAnterior)
                        ) {
                            snapshotAnterior = {};
                        }
                    } catch (erro) {
                        console.error(
                            'Erro ao interpretar histórico de agendamentos:',
                            erro
                        );

                        snapshotAnterior = {};
                    }
                }

                const sessaoIniciada =
                    sessionStorage.getItem(chaves.sessao) === 'true';

                // Primeira consulta da sessão:
                // verifica se existem compromissos ativos ou alterações
                // desde o último acesso à conta.
                if (!sessaoIniciada) {
                    sessionStorage.setItem(chaves.sessao, 'true');

                    // Se a pessoa já está na página de agendamentos,
                    // considera que ela está visualizando os compromissos.
                    if (arquivoAtual === 'agendamentos.html') {
                        agendamentosNovos = false;

                        localStorage.setItem(
                            chaves.pendentes,
                            'false'
                        );

                        localStorage.setItem(
                            chaves.snapshot,
                            JSON.stringify(snapshotAtual)
                        );

                        atualizarIndicadorAgendamentos();
                        return;
                    }

                    const existeAgendamentoAtivo =
                        possuiAgendamentoAtivo(dados.agendamentos);

                    const houveAlteracao =
                        snapshotSalvo !== null &&
                        verificarAlteracoesAgendamentos(
                            snapshotAtual,
                            snapshotAnterior
                        );

                    agendamentosNovos =
                        existeAgendamentoAtivo || houveAlteracao;

                    localStorage.setItem(
                        chaves.pendentes,
                        String(agendamentosNovos)
                    );

                    localStorage.setItem(
                        chaves.snapshot,
                        JSON.stringify(snapshotAtual)
                    );

                    atualizarIndicadorAgendamentos();
                    return;
                }

                // Ao acessar Agendamentos, marca as novidades
                // como visualizadas nesta sessão.
                if (arquivoAtual === 'agendamentos.html') {
                    agendamentosNovos = false;

                    localStorage.setItem(
                        chaves.pendentes,
                        'false'
                    );

                    localStorage.setItem(
                        chaves.snapshot,
                        JSON.stringify(snapshotAtual)
                    );

                    atualizarIndicadorAgendamentos();
                    return;
                }

                const encontrouNovidade =
                    verificarAlteracoesAgendamentos(
                        snapshotAtual,
                        snapshotAnterior
                    );

                // Mantém a notificação ativa até a pessoa
                // acessar a página de agendamentos.
                const notificacaoAnterior = (
                    localStorage.getItem(chaves.pendentes) === 'true'
                );

                agendamentosNovos =
                    notificacaoAnterior || encontrouNovidade;

                localStorage.setItem(
                    chaves.pendentes,
                    String(agendamentosNovos)
                );

                localStorage.setItem(
                    chaves.snapshot,
                    JSON.stringify(snapshotAtual)
                );

                atualizarIndicadorAgendamentos();
            })
            .catch(function (erro) {
                console.error(
                    'Erro ao consultar novidades dos agendamentos:',
                    erro
                );
            });
    }

    function iniciarConsultaAgendamentos(usuario) {
        if (intervaloAgendamentos) {
            window.clearInterval(intervaloAgendamentos);
        }

        consultarAgendamentosNovos(usuario);

        // Verifica novidades periodicamente.
        intervaloAgendamentos = window.setInterval(function () {
            consultarAgendamentosNovos(usuario);
        }, 30000);
    }

    // MENSAGENS

    async function consultarMensagensNaoLidas(usuario) {
        const tipoUsuario = Number(usuario?.cd_tipo_usuario);

        if (![1, 3].includes(tipoUsuario)) {
            mensagensNaoLidas = false;
            atualizarIndicadorMensagens();
            return;
        }

        try {
            const resposta = await fetch('../php/chat.php?acao=listar', {
                method: 'GET',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json' },
                cache: 'no-store'
            });

            if (!resposta.ok) {
                throw new Error('Não foi possível consultar as mensagens.');
            }

            const dados = await resposta.json();

            if (!dados.sucesso || !Array.isArray(dados.conversas)) {
                throw new Error(dados.mensagem || 'Resposta inválida do chat.');
            }

            mensagensNaoLidas = dados.conversas.some(function (conversa) {
                return conversa.unread === true;
            });

            atualizarIndicadorMensagens();
        } catch (erro) {
            console.error('Erro ao consultar mensagens não visualizadas:', erro);
        }
    }

    window.addEventListener('salvus:mensagens-atualizadas', function (evento) {
        mensagensNaoLidas = evento.detail?.naoLidas === true;
        atualizarIndicadorMensagens();
    });

    const paginas = [
        { arquivo: 'dashboard.html', icone: 'house', nome: 'Início', ativo: ['dashboard.html'] },
        { arquivo: 'servicos.html', icone: 'wrench', nome: 'Serviços', ativo: ['servicos.html', 'prestador-detalhes.html'] },
        { arquivo: 'agendamentos.html', icone: 'calendar-days', nome: 'Agendamentos', ativo: ['agendamentos.html'] },
        { arquivo: 'historico.html', icone: 'history', nome: 'Histórico', ativo: ['historico.html'] },
        { arquivo: 'mensagens.html', icone: 'message-square', nome: 'Mensagens', ativo: ['mensagens.html', 'chat.html', 'chat2.html'] },
        { arquivo: 'feedbacks.html', icone: 'thumbs-up', nome: 'Feedbacks', ativo: ['feedbacks.html'] },
        { arquivo: 'veiculos.html', icone: 'car-front', nome: 'Veículos', ativo: ['veiculos.html'] },
        { arquivo: 'perfil.html', icone: 'user-round', nome: 'Perfil', ativo: ['perfil.html'] },
        { arquivo: 'configuracoes.html', icone: 'settings', nome: 'Configurações', ativo: ['configuracoes.html'] }
    ];

    // Mantém todas as opções do menu para todos os tipos de usuário.
    function obterPaginasDoUsuario(usuario) {
        return paginas;
    }

    // Cria os links sem alterar os caminhos ou os ícones existentes.
    function criarLinks(usuario = null) {
        const tipoUsuario = usuario
            ? Number(usuario.cd_tipo_usuario)
            : null;

        return obterPaginasDoUsuario(usuario).map(function (pagina) {
            const ativo = pagina.ativo.includes(arquivoAtual);

            const nomePagina =
                tipoUsuario === 1 && pagina.arquivo === 'servicos.html'
                    ? 'Meus Serviços'
                    : pagina.nome;

            let indicador = '';

            if (pagina.arquivo === 'agendamentos.html') {
                indicador = `
                    <span class="nav-indicator"
                          data-notification="agendamentos"
                          aria-label="Novidades nos agendamentos"
                          hidden></span>
                `;
            }

            if (pagina.arquivo === 'mensagens.html') {
                indicador = `
                    <span class="nav-indicator"
                          data-notification="mensagens"
                          aria-label="Mensagens não visualizadas"
                          hidden></span>
                `;
            }

            if (tipoUsuario === 1 && pagina.arquivo === 'perfil.html') {
                indicador = `
                    <span class="nav-indicator"
                          data-notification="antecedentes"
                          aria-label="Antecedente criminal ainda não enviado"
                          hidden></span>
                `;
            }

            return `
                <a href="${pagina.arquivo}"
                   class="nav-item${ativo ? ' active' : ''}"
                   ${ativo ? 'aria-current="page"' : ''}>
                    <i data-lucide="${pagina.icone}"></i>
                    <span>${nomePagina}</span>
                    ${indicador}
                </a>
            `;
        }).join('');
    }

    function criarMarca() {
        return `
            <a href="dashboard.html" class="brand" aria-label="SalvusConnect - Início">
            <span class="brand-icon">
                <i data-lucide="heart"></i>
            </span>
            <span class="brand-name">
                <span class="brand-salvus">Salvus</span><span class="brand-connect">Connect</span>
            </span>
            </a>
        `;
    }

    function criarSidebar() {
        const links = criarLinks();

        return `
            <aside class="sidebar" id="sidebar">
                <div class="sidebar-top">
                    <div class="sidebar-header">
                        ${criarMarca()}

                        <button class="close-btn"
                                type="button"
                                onclick="toggleMenu()"
                                aria-label="Fechar menu">
                            <i data-lucide="x"></i>
                        </button>
                    </div>

                    <nav class="nav-links" aria-label="Menu principal">
                        ${links}
                    </nav>
                </div>

                <div class="sidebar-footer">
                    <div class="user-profile">
                        <div class="avatar">
                            <i data-lucide="user-round"></i>
                        </div>

                        <div class="user-info">
                            <span class="user-name">Carregando...</span>
                            <span class="user-email"></span>
                        </div>
                    </div>

                    <button class="logout-btn"
                            type="button"
                            onclick="sairDaConta()">
                        <i data-lucide="log-out"></i>
                        <span>Sair</span>
                    </button>
                </div>
            </aside>

            <div class="overlay"
                 id="overlay"
                 onclick="toggleMenu()"></div>

            <header class="navbar">
                ${criarMarca()}

                <button class="menu-toggle"
                        type="button"
                        onclick="toggleMenu()"
                        aria-label="Abrir menu">
                    <i data-lucide="menu"></i>
                </button>
            </header>
        `;
    }

    function iniciarSidebar() {
        document.querySelectorAll('.sidebar, .navbar, .overlay')
            .forEach(elemento => elemento.remove());

        document.body.insertAdjacentHTML('afterbegin', criarSidebar());

        window.toggleMenu = function () {
            document.getElementById('sidebar')?.classList.toggle('active');
            document.getElementById('overlay')?.classList.toggle('active');
        };

        window.sairDaConta = async function () {
            const botaoSair = document.querySelector('.logout-btn');

            if (botaoSair) {
                botaoSair.disabled = true;
            }

            try {
                const resposta = await fetch('../php/logout.php', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Accept': 'application/json' },
                    cache: 'no-store'
                });

                const dados = await resposta.json();

                if (resposta.ok && dados.sucesso) {
                    // Permite que os agendamentos ativos sejam
                    // verificados novamente no próximo login.
                    if (usuarioAtual) {
                        const chaves = obterChavesAgendamentos(usuarioAtual);
                        sessionStorage.removeItem(chaves.sessao);
                    }

                    window.location.replace(dados.redirect || 'login.html');
                    return;
                }

                alert('Não foi possível encerrar a sessão.');
            } catch (erro) {
                console.error('Erro ao sair da conta:', erro);
                alert('Erro de conexão ao tentar sair.');
            } finally {
                if (botaoSair) {
                    botaoSair.disabled = false;
                }
            }
        };

        if (window.lucide) {
            window.lucide.createIcons();
        }

        carregarUsuario();
    }

    async function carregarUsuario() {
        try {
            const resposta = await fetch('../php/sessao.php', {
                method: 'GET',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json' },
                cache: 'no-store'
            });

            if (resposta.status === 401) {
                window.location.replace('login.html');
                return;
            }

            const dados = await resposta.json();

            if (!resposta.ok || !dados.sucesso || !dados.usuario) {
                throw new Error(dados.mensagem || 'Não foi possível carregar o usuário.');
            }

            const usuario = dados.usuario;
            usuarioAtual = usuario;

            const nomeCompleto = (usuario.nm_nome || '').trim();
            const primeiroNome = nomeCompleto
                ? nomeCompleto.split(/\s+/)[0]
                : 'Usuário';

            const elementoNome = document.querySelector('.user-name');
            const elementoEmail = document.querySelector('.user-email');
            const titulo = document.querySelector('.hero-content h1');

            // Atualiza os links conforme o tipo de usuário identificado.
            const menu = document.querySelector('.nav-links');

            if (menu) {
                menu.innerHTML = criarLinks(usuario);

                atualizarIndicadorMensagens();
                atualizarIndicadorAgendamentos();
                atualizarIndicadorAntecedentes();

                if (window.lucide) {
                    window.lucide.createIcons();
                }
            }

            if (elementoNome) {
                elementoNome.textContent = nomeCompleto || 'Usuário';
            }

            if (elementoEmail) {
                elementoEmail.textContent = usuario.email || '';
            }

            if (titulo) {
                titulo.textContent = `Bem-vindo(a), ${primeiroNome}!`;
            }

            await consultarAntecedenteEnviado(usuario);
            await consultarMensagensNaoLidas(usuario);

            iniciarConsultaAgendamentos(usuario);

            document.dispatchEvent(
                new CustomEvent('salvus:usuario-carregado', {
                    detail: usuario
                })
            );
        } catch (erro) {
            console.error('Erro ao carregar usuário:', erro);

            const elementoNome = document.querySelector('.user-name');
            const elementoEmail = document.querySelector('.user-email');

            if (elementoNome) {
                elementoNome.textContent = 'Usuário';
            }

            if (elementoEmail) {
                elementoEmail.textContent = '';
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciarSidebar);
    } else {
        iniciarSidebar();
    }
})();