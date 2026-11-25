<?php
session_start();

// Protege o painel administrativo.
if (
    !isset($_SESSION['id_usuario']) ||
    !isset($_SESSION['cd_tipo_usuario'])
) {
    header('Location: login.html');
    exit;
}

// Permite acesso somente ao administrador (tipo 0).
if ((int) $_SESSION['cd_tipo_usuario'] !== 0) {
    header('Location: dashboard.html');
    exit;
}

// Protege o nome exibido na página.
$nomeAdmin = htmlspecialchars(
    $_SESSION['nm_nome'] ?? 'Administrador',
    ENT_QUOTES,
    'UTF-8'
);
?>
<!DOCTYPE html>
<html lang="pt-BR">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <meta name="theme-color" content="#0b132b">
    <meta name="description" content="Painel administrativo do SalvusConnect">

    <title>Administração | SalvusConnect</title>

    <!-- Estilos -->
    <link rel="stylesheet" href="../css/index.css">
    <link rel="stylesheet" href="../css/admin.css">

    <!-- Ícones -->
    <script
    src="https://unpkg.com/lucide@0.469.0/dist/umd/lucide.js"
    integrity="sha256-u4LvZOBXQxTtbZJd5uYAlpESLruJD6ZRt3WD8OPVNU8="
    crossorigin="anonymous">
</script>

    <!-- JavaScript administrativo -->
    <script src="../js/admin.js" defer></script>
</head>

<body class="pagina-admin">

    <div class="admin-layout">

        <!-- =================================================
             MENU LATERAL
        ================================================== -->
        <aside
            class="admin-sidebar"
            id="adminSidebar"
            aria-label="Menu administrativo"
        >

            <!-- Identidade visual -->
            <div class="admin-brand">

                <div class="admin-brand-icon" aria-hidden="true">
                    <i data-lucide="heart"></i>
                </div>

                <div class="admin-brand-info">
                    <h2>
                        <span class="brand-salvus">Salvus</span><span class="brand-connect">Connect</span>
                    </h2>

                    <span class="admin-brand-subtitle">
                        Administração
                    </span>
                </div>

            </div>

            <!-- Navegação -->
            <nav class="admin-navigation" aria-label="Navegação do painel">

                <span class="nav-label">MENU PRINCIPAL</span>

                <button
                    class="admin-nav-item active"
                    type="button"
                    data-section="overview"
                    aria-current="page"
                >
                    <i data-lucide="layout-dashboard" aria-hidden="true"></i>
                    <span>Visão geral</span>
                </button>

                <button
                    class="admin-nav-item"
                    type="button"
                    data-section="appointments"
                >
                    <i data-lucide="calendar-days" aria-hidden="true"></i>
                    <span>Agendamentos</span>
                </button>

                <button
                    class="admin-nav-item"
                    type="button"
                    data-section="users"
                >
                    <i data-lucide="users" aria-hidden="true"></i>
                    <span>Usuários</span>
                </button>

                <span class="nav-label">ANÁLISES</span>

                <button
                    class="admin-nav-item"
                    type="button"
                    data-section="background"
                >
                    <i data-lucide="file-check" aria-hidden="true"></i>
                    <span>Antecedentes</span>
                    <span class="nav-counter" id="menuAntecedentes">—</span>
                </button>

                <button
                    class="admin-nav-item"
                    type="button"
                    data-section="history"
                >
                    <i data-lucide="history" aria-hidden="true"></i>
                    <span>Histórico de análises</span>
                </button>

            </nav>

            <!-- Rodapé da sidebar -->
            <div class="admin-sidebar-footer">

                <!-- Administrador conectado -->
                <div class="admin-profile-box">

                    <div class="admin-avatar" aria-hidden="true">
                        <i data-lucide="user"></i>
                    </div>

                    <div class="admin-profile-info">
                        <strong id="nomeAdministrador">
                            <?= $nomeAdmin ?>
                        </strong>

                        <span>Acesso administrativo</span>
                    </div>

                </div>

                <!-- Encerramento da sessão -->
                <a
                    href="../php/logout.php"
                    class="admin-footer-link logout-link"
                >
                    <i data-lucide="log-out" aria-hidden="true"></i>
                    <span>Sair</span>
                </a>

            </div>

        </aside>

        <!-- Sobreposição do menu mobile -->
        <div
            class="sidebar-overlay"
            id="sidebarOverlay"
            aria-hidden="true"
        ></div>


        <!-- =================================================
             CONTEÚDO PRINCIPAL
        ================================================== -->
        <main class="admin-main">

            <!-- Cabeçalho -->
            <header class="admin-topbar">

                <button
                    type="button"
                    class="sidebar-toggle"
                    id="sidebarToggle"
                    aria-label="Abrir menu"
                    aria-controls="adminSidebar"
                    aria-expanded="false"
                >
                    <i data-lucide="menu" aria-hidden="true"></i>
                </button>

                <div class="topbar-heading">
                    <span class="topbar-eyebrow">
                        SALVUSCONNECT / ADMINISTRAÇÃO
                    </span>

                    <h1 id="tituloSecaoAdmin">Visão geral</h1>
                </div>

                <div class="topbar-user">

                    <div class="topbar-user-icon" aria-hidden="true">
                        <i data-lucide="shield-check"></i>
                    </div>

                    <div>
                        <strong><?= $nomeAdmin ?></strong>
                        <span>Acesso administrativo</span>
                    </div>

                </div>

            </header>


            <!-- =================================================
                 ÁREA DAS SEÇÕES
            ================================================== -->
            <div class="admin-content">


                <!-- =============================================
                     VISÃO GERAL
                ============================================== -->
                <section
                    class="admin-section active"
                    id="section-overview"
                >

                    <div class="welcome-banner">

                        <div>
                            <span class="welcome-label">
                                PAINEL DE CONTROLE
                            </span>

                            <h2>
                                Bem-vindo(a), <?= $nomeAdmin ?>!
                            </h2>

                            <p>
                                Acompanhe os indicadores e as pendências
                                do sistema em um só lugar.
                            </p>
                        </div>

                        <div class="welcome-icon" aria-hidden="true">
                            <i data-lucide="chart-no-axes-combined"></i>
                        </div>

                    </div>


                    <!-- Resumo geral -->
                    <div class="section-heading">

                        <div>
                            <h2>Resumo geral</h2>
                            <p>Indicadores do SalvusConnect</p>
                        </div>

                        <button
                            type="button"
                            class="admin-refresh-button"
                            id="refreshAdmin"
                        >
                            <i data-lucide="refresh-cw" aria-hidden="true"></i>
                            <span>Atualizar</span>
                        </button>

                    </div>


                    <!-- Indicadores -->
                    <div class="admin-stats-grid">

                        <article class="admin-stat-card">

                            <div class="stat-card-top">

                                <div class="stat-icon blue">
                                    <i data-lucide="users" aria-hidden="true"></i>
                                </div>

                                <span class="stat-tag">Cadastros</span>

                            </div>

                            <p>Total de usuários</p>

                            <strong class="stat-number" id="totalUsuarios">
                                —
                            </strong>

                            <span class="stat-description">
                                Clientes e prestadores
                            </span>

                        </article>


                        <article class="admin-stat-card">

                            <div class="stat-card-top">

                                <div class="stat-icon purple">
                                    <i data-lucide="wrench" aria-hidden="true"></i>
                                </div>

                                <span class="stat-tag">Serviços</span>

                            </div>

                            <p>Prestadores</p>

                            <strong class="stat-number" id="totalPrestadores">
                                —
                            </strong>

                            <span class="stat-description">
                                Contas do tipo prestador
                            </span>

                        </article>


                        <article class="admin-stat-card">

                            <div class="stat-card-top">

                                <div class="stat-icon orange">
                                    <i data-lucide="calendar-clock" aria-hidden="true"></i>
                                </div>

                                <span class="stat-tag">Acompanhar</span>

                            </div>

                            <p>Agendamentos pendentes</p>

                            <strong class="stat-number" id="agendamentosPendentes">
                                —
                            </strong>

                            <span class="stat-description">
                                Aguardando atendimento
                            </span>

                        </article>


                        <article class="admin-stat-card">

                            <div class="stat-card-top">

                                <div class="stat-icon green">
                                    <i data-lucide="file-clock" aria-hidden="true"></i>
                                </div>

                                <span class="stat-tag">Análise</span>

                            </div>

                            <p>Antecedentes pendentes</p>

                            <strong class="stat-number" id="antecedentesPendentes">
                                —
                            </strong>

                            <span class="stat-description">
                                Documentos para avaliação
                            </span>

                        </article>

                    </div>


                    <!-- Painéis informativos -->
                    <div class="admin-info-grid">

                        <article class="admin-panel-card">

                            <div class="panel-card-heading">

                                <div>
                                    <h3>Central de pendências</h3>
                                    <p>Itens que precisam de acompanhamento</p>
                                </div>

                                <i data-lucide="clipboard-list" aria-hidden="true"></i>

                            </div>

                            <button
                                type="button"
                                class="admin-action-row"
                                data-section="background"
                            >

                                <span class="action-row-icon">
                                    <i data-lucide="file-search" aria-hidden="true"></i>
                                </span>

                                <span class="action-row-text">
                                    <strong>Antecedentes criminais</strong>
                                    <small>Consultar documentos pendentes</small>
                                </span>

                                <i data-lucide="chevron-right" aria-hidden="true"></i>

                            </button>

                            <button
                                type="button"
                                class="admin-action-row"
                                data-section="appointments"
                            >

                                <span class="action-row-icon">
                                    <i data-lucide="calendar-check" aria-hidden="true"></i>
                                </span>

                                <span class="action-row-text">
                                    <strong>Agendamentos</strong>
                                    <small>Acompanhar solicitações</small>
                                </span>

                                <i data-lucide="chevron-right" aria-hidden="true"></i>

                            </button>

                        </article>


                        <article class="admin-panel-card system-status-card">

                            <div class="panel-card-heading">

                                <div>
                                    <h3>Área administrativa</h3>
                                    <p>Controle do sistema</p>
                                </div>

                                <i data-lucide="shield-check" aria-hidden="true"></i>

                            </div>

                            <div class="system-status-item">

                                <span class="status-dot"></span>

                                <div>
                                    <strong>Acesso administrativo</strong>
                                    <p>Área restrita a administradores</p>
                                </div>

                            </div>

                            <div class="system-status-item">

                                <span class="status-dot pending-dot"></span>

                                <div>
                                    <strong>Dados do sistema</strong>
                                    <p id="adminDataStatus">Aguardando consulta</p>
                                </div>

                            </div>

                        </article>

                    </div>

                </section>


                <!-- =============================================
                     AGENDAMENTOS
                ============================================== -->
                <section
                    class="admin-section"
                    id="section-appointments"
                >

                    <div class="section-heading">
                        <div>
                            <h2>Agendamentos</h2>
                            <p>Consulta e acompanhamento dos atendimentos.</p>
                        </div>
                    </div>

                    <article
                        class="admin-panel-card"
                        id="containerAgendamentos"
                    >

                        <div class="empty-state">

                            <div class="empty-state-icon">
                                <i data-lucide="calendar-days" aria-hidden="true"></i>
                            </div>

                            <h3>Consulta de agendamentos</h3>

                            <p>Carregando registros do banco de dados...</p>

                        </div>

                    </article>

                </section>


                <!-- =============================================
                     USUÁRIOS
                ============================================== -->
                <section
                    class="admin-section"
                    id="section-users"
                >

                    <div class="section-heading">
                        <div>
                            <h2>Usuários cadastrados</h2>
                            <p>Consulta de cadastros e tipos de conta.</p>
                        </div>
                    </div>

                    <article
                        class="admin-panel-card"
                        id="containerUsuarios"
                    >

                        <div class="empty-state">

                            <div class="empty-state-icon">
                                <i data-lucide="users" aria-hidden="true"></i>
                            </div>

                            <h3>Consulta de usuários</h3>

                            <p>Carregando registros do banco de dados...</p>

                        </div>

                    </article>

                </section>


                <!-- =============================================
                     ANTECEDENTES CRIMINAIS
                ============================================== -->
                <section
                    class="admin-section"
                    id="section-background"
                >

                    <div class="section-heading">
                        <div>
                            <h2>Antecedentes criminais</h2>
                            <p>Documentos enviados pelos prestadores.</p>
                        </div>
                    </div>

                    <article
                        class="admin-panel-card"
                        id="containerAntecedentes"
                    >

                        <div class="empty-state">

                            <div class="empty-state-icon">
                                <i data-lucide="file-check" aria-hidden="true"></i>
                            </div>

                            <h3>Análise de documentos</h3>

                            <p>Carregando registros do banco de dados...</p>

                        </div>

                    </article>

                </section>


                <!-- =============================================
                     HISTÓRICO DE ANÁLISES
                ============================================== -->
                <section
                    class="admin-section"
                    id="section-history"
                >

                    <div class="section-heading">
                        <div>
                            <h2>Histórico de análises</h2>
                            <p>Registro de decisões administrativas.</p>
                        </div>
                    </div>

                    <article
                        class="admin-panel-card"
                        id="containerHistorico"
                    >

                        <div class="empty-state">

                            <div class="empty-state-icon">
                                <i data-lucide="history" aria-hidden="true"></i>
                            </div>

                            <h3>Histórico administrativo</h3>

                            <p>Carregando registros do banco de dados...</p>

                        </div>

                    </article>

                </section>


                <!-- Rodapé -->
                <footer class="admin-footer">
                    <span>SalvusConnect</span>
                    <span>Painel administrativo</span>
                </footer>

            </div>

        </main>

    </div>


    <!-- Inicialização dos ícones -->
    <script>
        document.addEventListener("DOMContentLoaded", function () {
            if (window.lucide) {
                window.lucide.createIcons();
            }
        });
    </script>

</body>
</html>
