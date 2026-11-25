
"use strict";

// SALVUSCONNECT — DASHBOARD

const API_TERMOS = "../php/termos.php";

document.addEventListener("DOMContentLoaded", inicializarDashboard);

async function inicializarDashboard() {
    inicializarIcones();
    await carregarUsuarioAtual();
}

function inicializarIcones() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

async function carregarUsuarioAtual() {
    const titulo = document.getElementById("welcome-title");

    try {
        const resposta = await fetch("../php/usuarioA.php", {
            method: "GET",
            headers: {
                Accept: "application/json"
            },
            credentials: "same-origin",
            cache: "no-store"
        });

        if (resposta.status === 401) {
            window.location.replace("login.html?erro=sessao");
            return;
        }

        if (!resposta.ok) {
            throw new Error("Não foi possível consultar a sessão.");
        }

        const dados = await resposta.json();

        if (!dados.sucesso || !dados.usuario) {
            throw new Error("Os dados do usuário não foram encontrados.");
        }

        const nome = dados.usuario.nm_nome.trim();

        if (titulo) {
            titulo.textContent = nome
                ? `Bem-vindo(a), ${nome}!`
                : "Bem-vindo(a)!";
        }

        await verificarAceitesTermos();

    } catch (erro) {
        console.error("Erro ao carregar o dashboard:", erro);

        if (titulo) {
            titulo.textContent = "Bem-vindo(a)!";
        }
    }
}

/*
|--------------------------------------------------------------------------
| VERIFICAÇÃO DOS ACEITES
|--------------------------------------------------------------------------
*/

async function verificarAceitesTermos() {
    try {
        const resposta = await fetch(API_TERMOS, {
            method: "GET",
            headers: {
                Accept: "application/json"
            },
            credentials: "same-origin",
            cache: "no-store"
        });

        if (resposta.status === 401) {
            window.location.replace("login.html?erro=sessao");
            return;
        }

        if (!resposta.ok) {
            throw new Error("Não foi possível consultar os aceites dos termos.");
        }

        const dados = await resposta.json();

        if (!dados.sucesso) {
            throw new Error(dados.mensagem || "Erro ao consultar os termos.");
        }

        if (dados.perfil === "administrador") {
            return;
        }

        if (dados.mostrar_termos) {
            await exibirTermos(dados.perfil, dados.csrf_token);
            return;
        }

        if (
            dados.perfil === "prestador" &&
            dados.mostrar_aviso_antecedentes
        ) {
            await exibirAvisoAntecedentes(dados.csrf_token);
        }

    } catch (erro) {
        console.error("Erro ao verificar os termos:", erro);

        exibirModalErro(
            "Não foi possível verificar os Termos de Uso. " +
            "Por segurança, atualize a página ou tente novamente."
        );
    }
}

/*
|--------------------------------------------------------------------------
| ESTILO E ESTRUTURA DAS JANELAS
|--------------------------------------------------------------------------
*/

function prepararEstiloModal() {
    if (document.getElementById("salvus-termos-estilo")) {
        return;
    }

    const estilo = document.createElement("style");
    estilo.id = "salvus-termos-estilo";

    estilo.textContent = `
        .salvus-termos-overlay {
            position: fixed;
            inset: 0;
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(11, 19, 43, 0.78);
        }

        .salvus-termos-modal {
            width: 100%;
            max-width: 850px;
            max-height: 92vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            background: #ffffff;
            border-radius: 14px;
            box-shadow: 0 12px 45px rgba(0, 0, 0, 0.28);
            color: #0b132b;
        }

        .salvus-termos-header {
            padding: 22px 26px;
            background: #0b132b;
            color: #ffffff;
            flex-shrink: 0;
        }

        .salvus-termos-header h2 {
            margin: 0;
            font-size: 21px;
            line-height: 1.4;
        }

        .salvus-termos-header p {
            margin: 8px 0 0;
            color: #e0e8ff;
            font-size: 14px;
            line-height: 1.5;
        }

        .salvus-termos-conteudo {
            padding: 24px 28px;
            overflow-y: auto;
            line-height: 1.65;
            font-size: 15px;
        }

        .salvus-termos-conteudo h3 {
            margin: 22px 0 8px;
            color: #0b132b;
            font-size: 16px;
        }

        .salvus-termos-conteudo h3:first-child {
            margin-top: 0;
        }

        .salvus-termos-conteudo p {
            margin: 8px 0;
        }

        .salvus-termos-conteudo ul {
            padding-left: 22px;
        }

        .salvus-termos-confirmacoes {
            padding: 20px 26px;
            border-top: 1px solid #dce3f0;
            background: #f8faff;
            flex-shrink: 0;
        }

        .salvus-termos-checkbox {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            margin: 12px 0;
            font-size: 14px;
            line-height: 1.5;
            cursor: pointer;
        }

        .salvus-termos-checkbox input {
            width: 19px;
            height: 19px;
            min-width: 19px;
            margin-top: 2px;
            accent-color: #2563eb;
            cursor: pointer;
        }

        .salvus-termos-botao {
            width: 100%;
            min-height: 46px;
            margin-top: 14px;
            border: none;
            border-radius: 8px;
            background: #2563eb;
            color: #ffffff;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
        }

        .salvus-termos-botao:disabled {
            background: #aab5c8;
            cursor: not-allowed;
        }

        .salvus-termos-mensagem {
            margin-top: 10px;
            color: #b42318;
            font-size: 14px;
        }

        .salvus-termos-aviso {
            padding: 16px;
            margin: 16px 0;
            border-left: 4px solid #2563eb;
            border-radius: 5px;
            background: #eaf0ff;
        }

        /* NOTIFICAÇÃO FLUTUANTE DE ERRO */

        .salvus-notificacao-erro {
            position: fixed;
            top: 20px;
            left: 50%;
            z-index: 100001;
            display: flex;
            align-items: center;
            gap: 10px;
            width: calc(100% - 30px);
            max-width: 420px;
            padding: 12px 15px;
            border: 1px solid #fecaca;
            border-radius: 10px;
            background: #fef2f2;
            color: #991b1b;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
            font-size: 0.88rem;
            font-weight: 600;
            line-height: 1.45;
            opacity: 0;
            transform: translate(-50%, -15px);
            animation: salvus-notificacao-entrada 0.3s ease forwards;
        }

        .salvus-notificacao-erro-icone {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #dc2626;
            color: #ffffff;
            font-size: 15px;
            font-weight: 700;
        }

        .salvus-notificacao-erro.saindo {
            animation: salvus-notificacao-saida 0.3s ease forwards;
        }

        @keyframes salvus-notificacao-entrada {
            to {
                opacity: 1;
                transform: translate(-50%, 0);
            }
        }

        @keyframes salvus-notificacao-saida {
            to {
                opacity: 0;
                transform: translate(-50%, -15px);
            }
        }

        @media (max-width: 600px) {
            .salvus-termos-overlay {
                padding: 10px;
            }

            .salvus-termos-modal {
                max-height: 96vh;
            }

            .salvus-termos-header {
                padding: 18px;
            }

            .salvus-termos-header h2 {
                font-size: 18px;
            }

            .salvus-termos-conteudo {
                padding: 18px;
                font-size: 14px;
            }

            .salvus-termos-confirmacoes {
                padding: 16px 18px;
            }

            .salvus-notificacao-erro {
                top: 12px;
            }
        }
    `;

    document.head.appendChild(estilo);
}

/*
|--------------------------------------------------------------------------
| NOTIFICAÇÃO FLUTUANTE DE ERRO
|--------------------------------------------------------------------------
*/

function exibirNotificacaoErro(mensagem) {
    prepararEstiloModal();

    const notificacao = document.createElement("div");
    notificacao.className = "salvus-notificacao-erro";
    notificacao.setAttribute("role", "alert");
    notificacao.setAttribute("aria-live", "assertive");

    const icone = document.createElement("span");
    icone.className = "salvus-notificacao-erro-icone";
    icone.textContent = "!";

    const texto = document.createElement("span");
    texto.textContent = mensagem;

    notificacao.appendChild(icone);
    notificacao.appendChild(texto);

    document.body.appendChild(notificacao);

    setTimeout(() => {
        notificacao.classList.add("saindo");

        setTimeout(() => {
            notificacao.remove();
        }, 300);

    }, 5000);
}

function criarModalObrigatorio(titulo, descricao, conteudo, confirmacoes) {
    prepararEstiloModal();

    const overlay = document.createElement("div");
    overlay.className = "salvus-termos-overlay";

    overlay.innerHTML = `
        <section
            class="salvus-termos-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="salvus-termos-titulo"
        >
            <header class="salvus-termos-header">
                <h2 id="salvus-termos-titulo">${titulo}</h2>
                <p>${descricao}</p>
            </header>

            <div class="salvus-termos-conteudo">
                ${conteudo}
            </div>

            <div class="salvus-termos-confirmacoes">
                <div class="salvus-termos-lista-confirmacoes"></div>

                <p
                    class="salvus-termos-mensagem"
                    role="alert"
                    aria-live="polite"
                ></p>

                <button
                    type="button"
                    class="salvus-termos-botao"
                    disabled
                >
                    Enviar
                </button>
            </div>
        </section>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    const lista = overlay.querySelector(
        ".salvus-termos-lista-confirmacoes"
    );

    const botao = overlay.querySelector(
        ".salvus-termos-botao"
    );

    const mensagem = overlay.querySelector(
        ".salvus-termos-mensagem"
    );

    const caixas = [];

    confirmacoes.forEach((texto, indice) => {
        const label = document.createElement("label");
        label.className = "salvus-termos-checkbox";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `salvus-termos-confirmacao-${indice}`;

        const textoLabel = document.createElement("span");
        textoLabel.textContent = texto;

        label.appendChild(checkbox);
        label.appendChild(textoLabel);
        lista.appendChild(label);

        caixas.push(checkbox);
    });

    function atualizarBotao() {
        botao.disabled = !caixas.every(caixa => caixa.checked);
    }

    caixas.forEach(caixa => {
        caixa.addEventListener("change", atualizarBotao);
    });

    function fechar() {
        overlay.remove();
        document.body.style.overflow = "";
    }

    return {
        overlay,
        botao,
        mensagem,
        caixas,
        fechar
    };
}

/*
|--------------------------------------------------------------------------
| TERMOS DO CLIENTE
|--------------------------------------------------------------------------
*/

function obterDocumentoCliente() {
    return `
        <h3>1. PREÂMBULO E ACEITAÇÃO DOS TERMOS</h3>

        <p>
            <strong>1.1.</strong> O presente instrumento rege o acesso e a utilização
            dos serviços de intermediação tecnológica disponibilizados pela
            SalvusConnect ("Plataforma") aos Contratantes e Beneficiários do serviço
            ("Usuários").
        </p>

        <p>
            <strong>1.2. Adesão:</strong> Ao cadastrar-se, acessar ou contratar
            serviços por meio da Plataforma, o Usuário declara ter lido,
            compreendido e aceito integralmente, de forma irrestrita, as cláusulas
            dispostas neste documento.
        </p>

        <p>
            <strong>1.3.</strong> A SalvusConnect atua estritamente como prestadora
            de serviços de tecnologia para intermediação aproximativa, não sendo
            prestadora direta de serviços de transporte, enfermagem, assistência
            médica ou cuidadoria de idosos.
        </p>

        <h3>2. ELEGIBILIDADE E CADASTRO</h3>

        <p>
            <strong>2.1. Perfil do Beneficiário:</strong> O serviço destina-se a
            pessoas físicas com idade igual ou superior a 60 (sessenta) anos que
            possuam grau de autonomia física e cognitiva compatível com o
            acompanhamento ordinário de compromissos sociais, médicos ou
            burocráticos ("Idosos Ativos").
        </p>

        <p>
            <strong>2.2. Titularidade do Cadastro:</strong> A Conta de Usuário
            poderá ser gerada e gerida pelo próprio idoso ou por seu representante
            legal/familiar responsável.
        </p>

        <p>
            <strong>2.3. Contato de Emergência Obrigatório:</strong> É pré-requisito
            essencial e obrigatório para o agendamento de atendimentos a indicação
            e manutenção atualizada de, no mínimo, 1 (um) Contato de Emergência válido.
        </p>

        <h3>3. ESCOPO DOS SERVIÇOS E LIMITAÇÕES OPERACIONAIS</h3>

        <p>
            <strong>3.1. Abrangência do Atendimento:</strong> O serviço intermediado
            compreende o embarque no local e horário convencionados, o transporte
            individual privado, a permanência presencial do Acompanhante Motorizado
            durante a realização do compromisso e o transporte de retorno ao ponto
            de origem.
        </p>

        <p><strong>3.2. Exclusões Específicas e Limitações:</strong></p>

        <ul>
            <li>
                A Plataforma e os Prestadores cadastrados não prestam serviços de
                saúde, fisioterapia, cuidados paliativos ou enfermagem.
            </li>
            <li>
                É expressamente vedado o atendimento a idosos em estado de
                dependência severa, acamados, em situação de surto psiquiátrico ou
                que necessitem de transporte sanitário adaptado de emergência/ambulância.
            </li>
        </ul>

        <p>
            <strong>3.3. Protocolo de Intercorrências:</strong> Na hipótese de
            intercorrência de saúde durante a prestação do serviço, o Prestador está
            instruído a acionar imediatamente os serviços públicos de urgência
            (SAMU - 192 / Bombeiros - 193) e notificar, ato contínuo, o Contato de
            Emergência cadastrado.
        </p>

        <h3>4. CONDIÇÕES FINANCEIRAS, CANCELAMENTO E RETENÇÕES</h3>

        <p>
            <strong>4.1. Composição Tarifária:</strong> O valor cobrado abrange o
            custo do deslocamento viário e a tarifa referente ao tempo de
            acompanhamento presencial contratado.
        </p>

        <p>
            <strong>4.2. Excedente Temporal:</strong> Compromissos que ultrapassarem
            o período originalmente reservado ensejarão cobrança adicional
            proporcional por hora ou fração excedente, calculada segundo a tabela
            tarifária exibida no aplicativo.
        </p>

        <p><strong>4.3. Política de Cancelamento e Non-Show:</strong></p>

        <p>
            O Usuário poderá cancelar a solicitação do serviço sem qualquer
            penalidade financeira no prazo de até 48 (quarenta e oito) horas,
            contadas a partir do momento em que a solicitação foi realizada na
            plataforma. Após o encerramento desse prazo, poderá ser aplicada a
            taxa de cancelamento prevista na plataforma.
        </p>

        <p>
            A ausência do Usuário no local de embarque no horário aprazado
            (non-show) poderá acarretar a incidência da taxa de cancelamento
            destinada a ressarcir o deslocamento do Prestador.
        </p>

        <h3>5. PRIVACIDADE, GEOLOCALIZAÇÃO E PROTEÇÃO DE DADOS (LGPD)</h3>

        <p>
            <strong>5.1.</strong> O tratamento de dados pessoais e sensíveis é
            realizado em estrita observância à Lei Geral de Proteção de Dados
            Pessoais (Lei nº 13.709/2018 - LGPD) e ao Estatuto da Pessoa Idosa
            (Lei nº 10.741/2003).
        </p>

        <p>
            <strong>5.2. Telemetria em Tempo Real:</strong> O Usuário e seu
            responsável consentem expressamente com o compartilhamento da
            localização do veículo em tempo real e do status do atendimento com
            o Contato de Emergência indicado, para fins exclusivos de segurança
            e monitoramento familiar.
        </p>

        <h3>6. LIMITAÇÃO DE RESPONSABILIDADE DA PLATAFORMA</h3>

        <p>
            <strong>6.1.</strong> Em virtude da natureza estritamente intermediadora
            da Plataforma, a responsabilidade civil por eventuais danos materiais,
            morais ou acidentes automobilísticos decorrentes da condução do veículo
            ou da conduta individual no atendimento é de caráter direto e exclusivo
            do Prestador de Serviço Autônomo contratado.
        </p>

        <h3>7. LEGISLAÇÃO E FORO</h3>

        <p>
            <strong>7.1.</strong> Este contrato é regido pelas leis da República
            Federativa do Brasil, ficando eleito o Foro da Comarca de Mongaguá/SP
            para dirimir quaisquer controvérsias dele decorrentes.
        </p>

        <p><strong>Versão: 1.0 (Usuário)</strong></p>
    `;
}

/*
|--------------------------------------------------------------------------
| TERMOS DO PRESTADOR
|--------------------------------------------------------------------------
*/

function obterDocumentoPrestador() {
    return `
        <h3>1. NATUREZA DA PARCERIA E AUTONOMIA PROFISSIONAL</h3>

        <p>
            <strong>1.1.</strong> O presente instrumento regula a adesão do
            Acompanhante Motorizado ("Prestador") à Plataforma tecnológica
            mantida pela SalvusConnect.
        </p>

        <p>
            <strong>1.2. Ausência de Vínculo Empregatício:</strong> O Prestador
            declara ciência de que atua como profissional autônomo e independente,
            não existindo entre as partes qualquer vínculo trabalhista, de
            subordinação, societário ou de representação comercial. O Prestador
            detém plena autonomia para definir sua jornada e aceitar ou recusar chamadas.
        </p>

        <h3>2. REQUISITOS DE COMPLIANCE E ANTECEDENTES CRIMINAIS</h3>

        <p>
            <strong>2.1. Checagem Inicial no Onboarding (Obrigatória):</strong>
            O credenciamento do Prestador fica estritamente condicionado à
            apresentação prévia e validação documental de Certidão Negativa de
            Antecedentes Criminais (âmbito Estadual e Federal).
        </p>

        <p><strong>2.2. Renovação Semestral Compulsória (A cada 6 meses):</strong></p>

        <ul>
            <li>
                A cada 180 (cento e oitenta) dias de permanência na Plataforma,
                o Prestador deverá obrigatoriamente submeter nova Certidão Negativa
                de Antecedentes Criminais atualizada.
            </li>
            <li>
                O descumprimento do prazo semestral estipulado importará no bloqueio
                automático e preventivo da Conta, ficando o Prestador impossibilitado
                de aceitar novas chamadas até a regularização da documentação.
            </li>
        </ul>

        <p>
            <strong>2.3. Requisitos Adicionais:</strong> Possuir idade mínima de
            21 anos, Carteira Nacional de Habilitação (CNH) definitiva com
            observação formal de Exercício de Atividade Remunerada (EAR), e
            veículo cadastrado em situação regular perante os órgãos de trânsito.
        </p>

        <h3>3. CÓDIGO DE CONDUTA E DIRETRIZES DE ATENDIMENTO</h3>

        <p>
            <strong>3.1.</strong> O Prestador compromete-se a prestar os serviços
            com extrema urbanidade, pontualidade, ética, paciência e zelo,
            respeitando a integridade física e moral dos Usuários idosos.
        </p>

        <p>
            <strong>3.2.</strong> É terminantemente proibida qualquer conduta
            discriminatória, vexatória, negligente, abusiva ou a realização de
            procedimentos médicos/ambulatoriais no Usuário.
        </p>

        <h3>4. GESTÃO DE AVALIAÇÕES, RECLAMAÇÕES E REGIME DISCIPLINAR</h3>

        <p><strong>SISTEMA DE CONTROLE DE QUALIDADE E PENALIDADES</strong></p>

        <p>
            <strong>4.1. Atingimento do Limite de Reclamações (1ª Infração -
            Suspensão Temporária):</strong> O Prestador que acumular mais de
            3 (três) reclamações procedentes registradas por Usuários ou seus
            familiares — referentes a conduta inadequada, imprudência na direção,
            atrasos injustificados ou inobservância destes Termos — terá sua
            conta suspensa automaticamente pelo período improrrogável de
            14 (quatorze) dias (2 semanas).
        </p>

        <p>
            <strong>4.2. Reincidência e Descredenciamento Definitivo
            (2ª Infração - Expulsão):</strong> Caso o Prestador, após o
            cumprimento da suspensão temporária e retorno às atividades,
            incorra em reincidência quanto ao tipo de falta cometida ou acumule
            novas reclamações procedentes, será aplicado o descredenciamento
            sumário e definitivo (expulsão permanentemente) da Plataforma,
            sem direito à reativação de cadastro.
        </p>

        <p>
            <strong>4.3. Faltas Gravíssimas:</strong> Infrações gravíssimas
            (incluindo agressões, embriaguez ao volante, maus-tratos ou
            superveniência de anotações criminais) ensejarão o banimento
            imediato da Plataforma, independentemente de prévio histórico
            de reclamações.
        </p>

        <h3>5. REPASSES FINANCEIROS E RETENÇÃO DE TAXA DE INTERMEDIAÇÃO</h3>

        <p>
            <strong>5.1.</strong> Pelos serviços de intermediação prestados
            pela Plataforma, será retida uma taxa percentual sobre o valor
            bruto de cada atendimento, sendo o saldo remanescente repassado
            ao Prestador conforme periodicidade estabelecida no painel
            financeiro da aplicação.
        </p>

        <h3>6. RESPONSABILIDADE CIVIL E INDENIZAÇÃO</h3>

        <p>
            <strong>6.1.</strong> O Prestador responde de forma direta,
            exclusiva e integral por quaisquer danos materiais, morais,
            estéticos ou corporais causados aos Usuários ou a terceiros
            em decorrência do transporte ou da atividade de acompanhamento,
            isentando a Plataforma de qualquer responsabilidade regressiva
            ou solidária.
        </p>

        <h3>7. LEGISLAÇÃO APLICÁVEL E FORO</h3>

        <p>
            <strong>7.1.</strong> O presente contrato é regido pelas leis
            da República Federativa do Brasil, elegendo-se o Foro da
            Comarca de Mongaguá/SP para a resolução de eventuais litígios.
        </p>

        <p><strong>Versão: 1.0 (Prestador)</strong></p>
    `;
}

/*
|--------------------------------------------------------------------------
| ENVIO DOS ACEITES AO SERVIDOR
|--------------------------------------------------------------------------
*/

async function registrarAceite(dados, tokenCSRF) {
    const resposta = await fetch(API_TERMOS, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-CSRF-Token": tokenCSRF
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(dados)
    });

    const resultado = await resposta.json();

    if (!resposta.ok || !resultado.sucesso) {
        throw new Error(
            resultado.mensagem || "Não foi possível registrar a confirmação."
        );
    }

    return resultado;
}

/*
|--------------------------------------------------------------------------
| EXIBIÇÃO E ACEITE DOS TERMOS
|--------------------------------------------------------------------------
*/

async function exibirTermos(perfil, tokenCSRF) {
    const cliente = perfil === "cliente";

    const titulo = cliente
        ? "Termos e Condições Gerais de Uso"
        : "Termos de Adesão do Prestador";

    const descricao = cliente
        ? "Leia os termos antes de utilizar a plataforma SalvusConnect."
        : "Leia as condições de adesão e prestação de serviços da SalvusConnect.";

    const documento = cliente
        ? obterDocumentoCliente()
        : obterDocumentoPrestador();

    const confirmacoes = cliente
        ? [
            "Declaro que li e compreendi os Termos e Condições Gerais de Uso.",
            "Concordo com os Termos e Condições Gerais de Uso da SalvusConnect."
        ]
        : [
            "Declaro que li e compreendi as condições para liberação do meu perfil.",
            "Estou ciente e concordo que somente poderei operar na plataforma após o envio e a aprovação dos antecedentes criminais exigidos."
        ];

    const modal = criarModalObrigatorio(
        titulo,
        descricao,
        documento,
        confirmacoes
    );

    modal.botao.addEventListener("click", async () => {
        modal.botao.disabled = true;
        modal.mensagem.textContent = "";

        try {
            await registrarAceite({
                acao: "aceitar_termos",
                confirmacoes: {
                    leitura: true,
                    concordancia: true
                }
            }, tokenCSRF);

            modal.fechar();

            // Após os termos do prestador, a próxima verificação
            // apresentará o aviso separado de antecedentes.
            await verificarAceitesTermos();

        } catch (erro) {
            console.error("Erro ao registrar os termos:", erro);

            exibirNotificacaoErro(
                erro.message || "Não foi possível registrar seu aceite."
            );

            modal.botao.disabled = false;
        }
    });
}

/*
|--------------------------------------------------------------------------
| AVISO SEPARADO DE ANTECEDENTES CRIMINAIS
|--------------------------------------------------------------------------
*/

async function exibirAvisoAntecedentes(tokenCSRF) {
    const conteudo = `
        <div class="salvus-termos-aviso">
            <strong>Atenção: requisito obrigatório para atuar na plataforma.</strong>
        </div>

        <p>
            Para que seu perfil seja liberado para operar na SalvusConnect,
            é obrigatório enviar as Certidões Negativas de Antecedentes
            Criminais dos âmbitos Estadual e Federal.
        </p>

        <p>
            Seus documentos passarão por análise. Você somente poderá
            aceitar e realizar atendimentos depois que os antecedentes
            criminais forem enviados e aprovados.
        </p>

        <p>
            A documentação deverá ser renovada a cada 180 (cento e oitenta)
            dias, conforme os Termos de Adesão do Prestador.
        </p>

        <p>
            Ao confirmar, você declara estar ciente e concordar com essa
            exigência para a utilização da plataforma como prestador.
        </p>

        <p>
            Se não concordar, não confirme. O acesso permanecerá pendente
            dessa confirmação e o aviso será apresentado novamente no
            próximo login.
        </p>
    `;

    const modal = criarModalObrigatorio(
        "Aviso sobre Antecedentes Criminais",
        "Confirmação obrigatória para prestadores da SalvusConnect.",
        conteudo,
        [
            "Estou ciente e concordo com a exigência de envio e aprovação dos antecedentes criminais para operar na plataforma."
        ]
    );

    modal.botao.textContent = "Confirmar";

    modal.botao.addEventListener("click", async () => {
        modal.botao.disabled = true;
        modal.mensagem.textContent = "";

        try {
            await registrarAceite({
                acao: "aceitar_antecedentes",
                concordo: true
            }, tokenCSRF);

            modal.fechar();

        } catch (erro) {
            console.error(
                "Erro ao registrar a concordância com os antecedentes:",
                erro
            );

            exibirNotificacaoErro(
                erro.message || "Não foi possível registrar sua confirmação."
            );

            modal.botao.disabled = false;
        }
    });
}

/*
|--------------------------------------------------------------------------
| ERRO NA CONSULTA DOS ACEITES
|--------------------------------------------------------------------------
*/

function exibirModalErro(mensagemErro) {
    const modal = criarModalObrigatorio(
        "Não foi possível verificar os termos",
        "A confirmação dos documentos é necessária para continuar.",
        `<p>${mensagemErro}</p>`,
        []
    );

    const botao = modal.botao;

    botao.textContent = "Tentar novamente";
    botao.disabled = false;

    botao.addEventListener("click", async () => {
        botao.disabled = true;
        modal.mensagem.textContent = "";

        modal.fechar();

        await verificarAceitesTermos();
    });
}
