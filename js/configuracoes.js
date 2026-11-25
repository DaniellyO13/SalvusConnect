
"use strict";

// CONFIGURAÇÕES — SALVUSCONNECT

let usuarioConfiguracoes = null;

document.addEventListener("DOMContentLoaded", async () => {
    if (window.lucide) {
        window.lucide.createIcons();
    }

    await carregarUsuarioConfiguracoes();
});

// NOTIFICAÇÕES FLUTUANTES

function prepararEstiloNotificacoes() {
    if (document.getElementById("salvus-notificacoes-estilo")) {
        return;
    }

    const estilo = document.createElement("style");
    estilo.id = "salvus-notificacoes-estilo";

    estilo.textContent = `
        .salvus-notificacao {
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
            border: 1px solid;
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
            font-size: 0.88rem;
            font-weight: 600;
            line-height: 1.45;
            opacity: 0;
            transform: translate(-50%, -15px);
            animation: salvus-notificacao-entrada 0.3s ease forwards;
        }

        .salvus-notificacao.sucesso {
            border-color: #bbf7d0;
            background: #f0fdf4;
            color: #166534;
        }

        .salvus-notificacao.erro {
            border-color: #fecaca;
            background: #fef2f2;
            color: #991b1b;
        }

        .salvus-notificacao-icone {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            color: #ffffff;
            font-size: 15px;
            font-weight: 700;
        }

        .salvus-notificacao.sucesso .salvus-notificacao-icone {
            background: #16a34a;
        }

        .salvus-notificacao.erro .salvus-notificacao-icone {
            background: #dc2626;
        }

        .salvus-notificacao.saindo {
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
            .salvus-notificacao {
                top: 12px;
            }
        }
    `;

    document.head.appendChild(estilo);
}

function exibirNotificacao(tipo, mensagem) {
    prepararEstiloNotificacoes();

    const notificacao = document.createElement("div");
    notificacao.className = `salvus-notificacao ${tipo}`;

    notificacao.setAttribute(
        "role",
        tipo === "erro" ? "alert" : "status"
    );

    notificacao.setAttribute("aria-live", "polite");

    const icone = document.createElement("span");
    icone.className = "salvus-notificacao-icone";
    icone.textContent = tipo === "sucesso" ? "✓" : "!";

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

// IDENTIFICAÇÃO DO USUÁRIO AUTENTICADO

async function carregarUsuarioConfiguracoes() {
    try {
        const resposta = await fetch("../php/sessao.php", {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            headers: {
                Accept: "application/json"
            }
        });

        if (resposta.status === 401) {
            window.location.replace("login.html");
            return;
        }

        const dados = await resposta.json();

        if (!resposta.ok || !dados.sucesso || !dados.usuario) {
            throw new Error(
                dados.mensagem || "Não foi possível identificar a conta."
            );
        }

        usuarioConfiguracoes = dados.usuario;

        atualizarDadosPessoais(usuarioConfiguracoes);
        await carregarDadosDoBanco();
        carregarConfiguracoes();

    } catch (erro) {
        console.error("Erro ao carregar configurações da conta:", erro);

        exibirNotificacao(
            "erro",
            "Não foi possível carregar os dados da conta. Atualize a página."
        );
    }
}


function atualizarDadosPessoais(usuario) {
    const nome = (usuario.nm_nome || "").trim();
    const primeiroNome = nome ? nome.split(/\s+/)[0] : "Usuário";
    const email = usuario.email || "";

    const avatar = document.querySelector(".settings-avatar");
    const nomeElemento = document.querySelector(".settings-user-info strong");
    const emailElemento = document.querySelector(".settings-user-info > span:not(.role-badge)");
    const cargo = document.querySelector(".role-badge");
    const campoEmail = document.getElementById("email");
    const campoTelefone = document.getElementById("phone");

    if (avatar) {
        avatar.textContent = primeiroNome.charAt(0).toLowerCase();
    }

    if (nomeElemento) {
        nomeElemento.textContent = nome || "Usuário";
    }

    if (emailElemento) {
        emailElemento.textContent = email;
    }

    if (campoEmail) {
        campoEmail.value = email;
    }

    if (campoTelefone) {
        campoTelefone.value = usuario.nr_telefone || usuario.telefone || "";
    }

    if (cargo) {
        cargo.textContent = obterNomeTipoUsuario(usuario.cd_tipo_usuario);
    }
}


function obterNomeTipoUsuario(tipo) {
    switch (Number(tipo)) {
        case 0:
            return "Administrador";
        case 1:
            return "Prestador";
        case 3:
            return "Usuário comum";
        default:
            return "Usuário";
    }
}


function obterChaveConfiguracoes() {
    if (!usuarioConfiguracoes || !usuarioConfiguracoes.id_usuario) {
        return null;
    }

    return `salvusconnect_configuracoes_${usuarioConfiguracoes.id_usuario}`;
}


// MENU MOBILE

function toggleMenu() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");

    if (sidebar) {
        sidebar.classList.toggle("active");
    }

    if (overlay) {
        overlay.classList.toggle("active");
    }
}


// CARREGAR DADOS PESSOAIS DO BANCO

async function carregarDadosDoBanco() {
    try {
        const resposta = await fetch(
            "../php/usuarios.php?acao=meus_dados",
            {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                headers: {
                    Accept: "application/json"
                }
            }
        );

        if (resposta.status === 401) {
            window.location.replace("login.html");
            return;
        }

        const dados = await resposta.json();

        if (!resposta.ok || !dados.sucesso || !dados.usuario) {
            throw new Error(
                dados.mensagem || "Não foi possível consultar os dados."
            );
        }

        usuarioConfiguracoes = {
            ...usuarioConfiguracoes,
            ...dados.usuario
        };

        atualizarDadosPessoais(usuarioConfiguracoes);

    } catch (erro) {
        console.error("Erro ao consultar dados pessoais:", erro);

        throw erro;
    }
}


// SALVAR CONFIGURAÇÕES

async function salvarConfiguracoes() {
    if (!usuarioConfiguracoes || !usuarioConfiguracoes.id_usuario) {
        exibirNotificacao(
            "erro",
            "Não foi possível identificar sua conta. Atualize a página."
        );
        return;
    }

    const emailNotifications = document.getElementById("emailNotifications");
    const smsNotifications = document.getElementById("smsNotifications");
    const appointmentNotifications = document.getElementById("appointmentNotifications");
    const promotions = document.getElementById("promotions");
    const telefone = document.getElementById("phone");
    const endereco = document.getElementById("address");
    const campoEmail = document.getElementById("email");

    const configuracoesLocais = {
        endereco: endereco?.value.trim() || "",
        notificacoesEmail: emailNotifications?.checked ?? true,
        notificacoesSMS: smsNotifications?.checked ?? false,
        lembretesAgendamento: appointmentNotifications?.checked ?? true,
        promocoes: promotions?.checked ?? false
    };

    const nome = (usuarioConfiguracoes.nm_nome || "").trim();
    const email = campoEmail?.value.trim() || "";
    const numeroTelefone = telefone?.value.trim() || "";

    if (!nome) {
        exibirNotificacao(
            "erro",
            "Não foi possível identificar seu nome. Atualize a página."
        );
        return;
    }

    if (!email) {
        exibirNotificacao(
            "erro",
            "Informe seu endereço de e-mail."
        );
        return;
    }

    if (!numeroTelefone) {
        exibirNotificacao(
            "erro",
            "Informe seu telefone."
        );
        return;
    }

    const chave = obterChaveConfiguracoes();

    if (!chave) {
        exibirNotificacao(
            "erro",
            "Não foi possível identificar sua conta."
        );
        return;
    }

    try {
        const resposta = await fetch(
            "../php/usuarios.php?acao=atualizar_meus_dados",
            {
                method: "POST",
                credentials: "same-origin",
                cache: "no-store",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify({
                    nm_nome: nome,
                    email: email,
                    nr_telefone: numeroTelefone
                })
            }
        );

        const dados = await resposta.json();

        if (resposta.status === 401) {
            window.location.replace("login.html");
            return;
        }

        if (!resposta.ok || !dados.sucesso) {
            throw new Error(
                dados.mensagem || "Não foi possível atualizar seus dados."
            );
        }

        if (dados.usuario) {
            usuarioConfiguracoes = {
                ...usuarioConfiguracoes,
                ...dados.usuario
            };

            atualizarDadosPessoais(usuarioConfiguracoes);
        }

        try {
            localStorage.setItem(
                chave,
                JSON.stringify(configuracoesLocais)
            );
        } catch (erroLocal) {
            console.error(
                "Não foi possível salvar as preferências neste navegador:",
                erroLocal
            );
        }

        exibirNotificacao(
            "sucesso",
            "Nome, e-mail e telefone foram atualizados no banco de dados. As demais preferências permanecem salvas neste navegador."
        );

    } catch (erro) {
        console.error("Erro ao salvar configurações:", erro);

        exibirNotificacao(
            "erro",
            erro.message || "Não foi possível salvar suas configurações."
        );
    }
}


// CARREGAR CONFIGURAÇÕES TEMPORÁRIAS DO NAVEGADOR

function carregarConfiguracoes() {
    const chave = obterChaveConfiguracoes();

    if (!chave) {
        return;
    }

    try {
        const dados = localStorage.getItem(chave);

        if (!dados) {
            return;
        }

        const configuracoes = JSON.parse(dados);

        const endereco = document.getElementById("address");
        const emailNotifications = document.getElementById("emailNotifications");
        const smsNotifications = document.getElementById("smsNotifications");
        const appointmentNotifications = document.getElementById("appointmentNotifications");
        const promotions = document.getElementById("promotions");

        if (endereco) {
            endereco.value = configuracoes.endereco || "";
        }

        if (emailNotifications) {
            emailNotifications.checked =
                configuracoes.notificacoesEmail ?? true;
        }

        if (smsNotifications) {
            smsNotifications.checked =
                configuracoes.notificacoesSMS ?? false;
        }

        if (appointmentNotifications) {
            appointmentNotifications.checked =
                configuracoes.lembretesAgendamento ?? true;
        }

        if (promotions) {
            promotions.checked =
                configuracoes.promocoes ?? false;
        }

    } catch (erro) {
        console.error("Erro ao carregar configurações temporárias:", erro);

        exibirNotificacao(
            "erro",
            "Não foi possível carregar as preferências salvas neste navegador."
        );
    }
}
