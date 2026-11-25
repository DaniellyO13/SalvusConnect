
"use strict";

let usuarioAtual = null;
let csrfToken = null;
let temporizadorToast = null;
let urlFotoTemporaria = null;

/* inicializacao */

document.addEventListener("DOMContentLoaded", async () => {
    aplicarEstiloPerfil();
    prepararCamposIdentificacao();
    inicializarFormularioAntecedentes();
    inicializarFotoPerfil();

    if (window.lucide) {
        window.lucide.createIcons();
    }

    await carregarUsuarioAtual();
});

/* estilo do perfil e notificacoes */

function aplicarEstiloPerfil() {
    if (document.getElementById("perfil-estilos-identificacao")) {
        return;
    }

    const estilo = document.createElement("style");
    estilo.id = "perfil-estilos-identificacao";

    estilo.textContent = `
        .profile-identity-input {
            display: block;
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            padding: 4px 7px;
            margin: 0 0 5px;
            border: 1px solid transparent;
            border-radius: 6px;
            background: transparent;
            color: #243653;
            font-family: inherit;
            outline: none;
            transition: background-color .2s ease,
                        border-color .2s ease,
                        box-shadow .2s ease;
        }

        .profile-name-input {
            font-size: 18px;
            font-weight: 700;
            color: #1c3155;
        }

        .profile-email-input {
            font-size: 13px;
            color: #64748b;
        }

        .profile-identity-input:hover {
            background: #eef2f9;
            border-color: #dce3ed;
        }

        .profile-identity-input:focus {
            background: #fff;
            border-color: #1c3155;
            box-shadow: 0 0 0 3px rgba(28,49,85,.10);
        }

        .btn-save-profile:disabled,
        .btn-enviar-antecedente:disabled {
            opacity: .7;
            cursor: wait;
        }

        .perfil-toast {
            position: fixed;
            top: 22px;
            left: 50%;
            z-index: 99999;
            display: flex;
            align-items: center;
            gap: 10px;
            width: min(420px, calc(100vw - 32px));
            box-sizing: border-box;
            padding: 12px 15px;
            border: 1px solid #bbf7d0;
            border-radius: 10px;
            background: #f0fdf4;
            color: #166534;
            box-shadow: 0 4px 14px rgba(20,37,65,.12);
            opacity: 0;
            transform: translate(-50%, -10px);
            pointer-events: none;
            transition: opacity .25s ease, transform .25s ease;
        }

        .perfil-toast.visivel {
            opacity: 1;
            transform: translate(-50%, 0);
            pointer-events: auto;
        }

        .perfil-toast-icone {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #16a34a;
            color: #fff;
            font-size: 14px;
            font-weight: 700;
        }

        .perfil-toast-conteudo {
            flex: 1;
            min-width: 0;
        }

        .perfil-toast-titulo {
            margin: 0 0 2px;
            font-size: 0.88rem;
            font-weight: 600;
            line-height: 1.45;
            color: #166534;
        }

        .perfil-toast-mensagem {
            margin: 0;
            font-size: 0.88rem;
            font-weight: 600;
            line-height: 1.45;
            color: #166534;
            overflow-wrap: anywhere;
        }

        .perfil-toast-fechar {
            padding: 0 2px;
            border: 0;
            background: transparent;
            color: #166534;
            font-size: 20px;
            cursor: pointer;
        }

        .perfil-toast.erro {
            border-color: #f2cccc;
            background: #fff0f0;
            color: #a32929;
        }

        .perfil-toast.erro .perfil-toast-icone {
            background: #c53b3b;
            color: #fff;
        }

        .perfil-toast.erro .perfil-toast-titulo,
        .perfil-toast.erro .perfil-toast-mensagem,
        .perfil-toast.erro .perfil-toast-fechar {
            color: #a32929;
        }

        .profile-message,
        #antecedentes-message {
            margin: 12px 0;
            padding: 10px 12px;
            border-radius: 7px;
            background: #eef5ff;
            color: #1c3155;
            overflow-wrap: anywhere;
        }

        /* Oculta a mensagem de antecedentes quando estiver vazia. */
        #antecedentes-message:empty {
            display: none !important;
        }

        .profile-message[data-status="erro"],
        #antecedentes-message[data-status="erro"] {
            background: #fff0f0;
            color: #a32929;
        }

        #antecedentes-section[hidden] {
            display: none !important;
        }

        @media (max-width: 600px) {
            .perfil-toast {
                top: 12px;
            }
        }
    `;

    document.head.appendChild(estilo);
}

/* notificacoes */

function mostrarNotificacao(texto, tipo = "sucesso") {
    let toast = document.getElementById("perfil-toast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "perfil-toast";
        toast.className = "perfil-toast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");

        document.body.appendChild(toast);
    }

    clearTimeout(temporizadorToast);

    const erro = tipo === "erro";

    toast.className = "perfil-toast" + (erro ? " erro" : "");
    toast.replaceChildren();

    const icone = document.createElement("div");
    icone.className = "perfil-toast-icone";
    icone.textContent = erro ? "!" : "✓";

    const conteudo = document.createElement("div");
    conteudo.className = "perfil-toast-conteudo";

    const titulo = document.createElement("p");
    titulo.className = "perfil-toast-titulo";
    titulo.textContent = erro
        ? "Não foi possível concluir"
        : "Operação concluída";

    const mensagem = document.createElement("p");
    mensagem.className = "perfil-toast-mensagem";
    mensagem.textContent = texto;

    conteudo.append(titulo, mensagem);

    const fechar = document.createElement("button");
    fechar.type = "button";
    fechar.className = "perfil-toast-fechar";
    fechar.setAttribute("aria-label", "Fechar notificação");
    fechar.textContent = "×";

    fechar.addEventListener("click", () => {
        toast.classList.remove("visivel");
        clearTimeout(temporizadorToast);
    });

    toast.append(icone, conteudo, fechar);

    requestAnimationFrame(() => {
        toast.classList.add("visivel");
    });

    temporizadorToast = setTimeout(() => {
        toast.classList.remove("visivel");
    }, 5000);
}

function mostrarMensagemInline(texto, tipo = "sucesso") {
    const elemento = document.getElementById("profile-message");

    if (!elemento) {
        return;
    }

    elemento.hidden = false;
    elemento.textContent = texto;
    elemento.dataset.status = tipo === "erro" ? "erro" : "sucesso";
}

/* campos de nome e email */

function prepararCamposIdentificacao() {
    const titulo = document.querySelector(".profile-meta h2");
    const emailElemento = document.querySelector(".profile-meta p");

    if (titulo && !document.getElementById("profile-name")) {
        const input = document.createElement("input");

        input.type = "text";
        input.id = "profile-name";
        input.name = "nm_nome";
        input.maxLength = 100;
        input.required = true;
        input.autocomplete = "name";
        input.setAttribute("aria-label", "Nome completo");
        input.className =
            "profile-identity-input profile-name-input";

        titulo.replaceWith(input);
    }

    if (emailElemento && !document.getElementById("profile-email")) {
        const input = document.createElement("input");

        input.type = "email";
        input.id = "profile-email";
        input.name = "email";
        input.maxLength = 150;
        input.required = true;
        input.autocomplete = "email";
        input.setAttribute("aria-label", "E-mail");
        input.className =
            "profile-identity-input profile-email-input";

        emailElemento.replaceWith(input);
    }
}

/* =====================================================
   FOTO DE PERFIL
   SELEÇÃO, PRÉ-VISUALIZAÇÃO E ENVIO
   ===================================================== */

/* preparar o avatar e o campo de selecao */

function inicializarFotoPerfil() {
    const avatar = document.querySelector(".avatar-large");
    const botaoCamera = document.querySelector(".avatar-edit-btn");

    if (!avatar || !botaoCamera) {
        return;
    }

    let imagem = document.getElementById("profile-avatar-image");

    if (!imagem) {
        imagem = document.createElement("img");
        imagem.id = "profile-avatar-image";
        imagem.className = "profile-avatar-image";
        imagem.alt = "Foto do perfil";
        imagem.hidden = true;

        avatar.insertBefore(imagem, avatar.firstChild);
    }

    let campoFoto = document.getElementById("profile-photo-input");

    if (!campoFoto) {
        campoFoto = document.createElement("input");

        campoFoto.type = "file";
        campoFoto.id = "profile-photo-input";
        campoFoto.name = "foto";
        campoFoto.accept = "image/jpeg,image/png";
        campoFoto.hidden = true;

        document.body.appendChild(campoFoto);
    }

    if (botaoCamera.dataset.fotoInicializada === "true") {
        return;
    }

    botaoCamera.dataset.fotoInicializada = "true";

    botaoCamera.addEventListener("click", () => {
        if (!campoFoto.disabled) {
            campoFoto.click();
        }
    });

    campoFoto.addEventListener("change", selecionarFotoPerfil);
}

/* selecionar e validar a foto */

async function selecionarFotoPerfil(event) {
    const campoFoto = event.target;
    const arquivo = campoFoto.files?.[0];

    if (!arquivo) {
        return;
    }

    const tamanhoMaximo = 5 * 1024 * 1024;
    const tiposPermitidos = [
        "image/jpeg",
        "image/png"
    ];

    if (!tiposPermitidos.includes(arquivo.type)) {
        mostrarNotificacao(
            "Formato inválido. Selecione uma imagem JPG, JPEG ou PNG.",
            "erro"
        );

        campoFoto.value = "";
        return;
    }

    if (arquivo.size <= 0 || arquivo.size > tamanhoMaximo) {
        mostrarNotificacao(
            "A foto deve ter tamanho maior que zero e no máximo 5 MB.",
            "erro"
        );

        campoFoto.value = "";
        return;
    }

    if (!csrfToken || !usuarioAtual) {
        mostrarNotificacao(
            "Não foi possível validar sua sessão. Atualize a página e tente novamente.",
            "erro"
        );

        campoFoto.value = "";
        return;
    }

    // Exibe a pré-visualização antes do envio.
    const imagem = document.getElementById("profile-avatar-image");
    const avatar = document.querySelector(".avatar-large");
    const letra = document.getElementById("profile-avatar-letter");

    if (!imagem || !avatar) {
        mostrarNotificacao(
            "Não foi possível preparar a imagem do perfil.",
            "erro"
        );

        campoFoto.value = "";
        return;
    }

    if (urlFotoTemporaria) {
        URL.revokeObjectURL(urlFotoTemporaria);
        urlFotoTemporaria = null;
    }

    urlFotoTemporaria = URL.createObjectURL(arquivo);

    imagem.src = urlFotoTemporaria;
    imagem.hidden = false;

    if (letra) {
        letra.hidden = true;
    }

    imagem.onload = () => {
        imagem.hidden = false;

        if (letra) {
            letra.hidden = true;
        }
    };

    imagem.onerror = () => {
        imagem.hidden = true;

        if (letra) {
            letra.hidden = false;
        }
    };

    await enviarFotoPerfil(arquivo);
}

/* enviar foto para o servidor */

async function enviarFotoPerfil(arquivo) {
    const campoFoto = document.getElementById("profile-photo-input");
    const botaoCamera = document.querySelector(".avatar-edit-btn");

    const dados = new FormData();
    dados.append("foto", arquivo);

    if (campoFoto) {
        campoFoto.disabled = true;
    }

    if (botaoCamera) {
        botaoCamera.disabled = true;
        botaoCamera.setAttribute("aria-busy", "true");
    }

    mostrarNotificacao("Enviando sua foto de perfil...");

    try {
        const resposta = await fetch("../php/foto_perfil.php", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: {
                Accept: "application/json",
                "X-CSRF-Token": csrfToken
            },
            body: dados
        });

        if (resposta.status === 401) {
            window.location.replace("login.html");
            return;
        }

        const resultado = await lerRespostaJSON(resposta);

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(
                resultado.mensagem ||
                "Não foi possível atualizar sua foto."
            );
        }

        // Carrega novamente a imagem armazenada no servidor.
        await carregarFotoPerfil();

        mostrarNotificacao(
            resultado.mensagem ||
            "Sua foto de perfil foi atualizada com sucesso."
        );

    } catch (erro) {
        console.error("Erro ao enviar foto de perfil:", erro);

        // Restaura a foto que já estava salva, se existir.
        await carregarFotoPerfil();

        mostrarNotificacao(
            erro.message ||
            "Não foi possível atualizar sua foto de perfil.",
            "erro"
        );

    } finally {
        if (campoFoto) {
            campoFoto.disabled = false;
            campoFoto.value = "";
        }

        if (botaoCamera) {
            botaoCamera.disabled = false;
            botaoCamera.removeAttribute("aria-busy");
        }
    }
}

/* carregar a foto salva do usuario */

function carregarFotoPerfil() {
    return new Promise((resolve) => {
        const imagem = document.getElementById("profile-avatar-image");
        const letra = document.getElementById("profile-avatar-letter");

        if (!imagem) {
            resolve(false);
            return;
        }

        imagem.onload = () => {
            imagem.hidden = false;

            if (letra) {
                letra.hidden = true;
            }

            if (urlFotoTemporaria) {
                URL.revokeObjectURL(urlFotoTemporaria);
                urlFotoTemporaria = null;
            }

            resolve(true);
        };

        imagem.onerror = () => {
            imagem.hidden = true;

            if (letra) {
                letra.hidden = false;
            }

            if (urlFotoTemporaria) {
                URL.revokeObjectURL(urlFotoTemporaria);
                urlFotoTemporaria = null;
            }

            resolve(false);
        };

        imagem.src = "../php/foto_perfil.php?v=" + Date.now();
    });
}

/* carregar usuario conectado */

async function carregarUsuarioAtual() {
    try {
        const resposta = await fetch("../php/ca_perfil.php", {
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

        const resultado = await lerRespostaJSON(resposta);

        if (
            !resposta.ok ||
            !resultado.sucesso ||
            !resultado.usuario
        ) {
            throw new Error(
                resultado.mensagem ||
                "Não foi possível carregar o perfil."
            );
        }

        if (
            typeof resultado.csrf_token !== "string" ||
            !resultado.csrf_token
        ) {
            throw new Error(
                "Não foi possível validar a segurança da sessão. Atualize a página."
            );
        }

        usuarioAtual = resultado.usuario;
        csrfToken = resultado.csrf_token;

        atualizarIdentificacao(usuarioAtual);
        preencherDadosDoPerfil(usuarioAtual);

        // Carrega a foto salva do usuário.
        await carregarFotoPerfil();

        // Atualiza a situação do antecedente recebido pelo PHP.
        atualizarSituacaoAntecedente(resultado.antecedente || null);

    } catch (erro) {
        console.error("Erro ao carregar perfil:", erro);

        mostrarMensagemInline(
            erro.message ||
            "Atualize a página e tente novamente.",
            "erro"
        );

        mostrarNotificacao(
            erro.message ||
            "Não foi possível carregar o perfil.",
            "erro"
        );
    }
}

/* tratar respostas do servidor */

async function lerRespostaJSON(resposta) {
    const texto = await resposta.text();

    try {
        return JSON.parse(texto);
    } catch {
        console.error(
            "O servidor não retornou JSON:",
            texto.slice(0, 300)
        );

        throw new Error(
            "O servidor retornou uma resposta inesperada. Confira os arquivos PHP."
        );
    }
}

/* nome do perfil */

function obterNomeTipoUsuario(tipo) {
    switch (Number(tipo)) {
        case 0:
            return "Administrador";

        case 1:
            return "Prestador";

        case 3:
            return "Cliente";

        default:
            return "Usuário";
    }
}

function atualizarIdentificacao(usuario) {
    const nome = (usuario.nm_nome || "").trim();

    const nomeInput = document.getElementById("profile-name");
    const emailInput = document.getElementById("profile-email");

    const avatar =
        document.getElementById("profile-avatar-letter") ||
        document.querySelector(".avatar-large span");

    const cargo =
        document.getElementById("profile-role") ||
        document.querySelector(".badge-role");

    if (nomeInput) {
        nomeInput.value = nome;
    }

    if (emailInput) {
        emailInput.value = usuario.email || "";
    }

    if (avatar) {
        avatar.textContent = nome
            ? nome.charAt(0).toLocaleLowerCase("pt-BR")
            : "?";
    }

    if (cargo) {
        cargo.textContent = obterNomeTipoUsuario(
            usuario.cd_tipo_usuario
        );
    }

    // A seção de antecedentes é exibida apenas para prestadores.
    const secaoAntecedentes =
        document.getElementById("antecedentes-section");

    if (secaoAntecedentes) {
        secaoAntecedentes.hidden =
            Number(usuario.cd_tipo_usuario) !== 1;
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

/* formatar cpf */

function formatarCPF(input) {
    let valor = (input.value || "")
        .replace(/\D/g, "")
        .slice(0, 11);

    valor = valor.replace(/^(\d{3})(\d)/, "$1.$2");
    valor = valor.replace(
        /^(\d{3})\.(\d{3})(\d)/,
        "$1.$2.$3"
    );
    valor = valor.replace(
        /\.(\d{3})(\d{1,2})$/,
        ".$1-$2"
    );

    input.value = valor;
}

/* formatar telefone */

function formatarTelefone(input) {
    let valor = (input.value || "")
        .replace(/\D/g, "")
        .slice(0, 11);

    if (valor.length <= 2) {
        valor = valor ? `(${valor}` : "";
    } else if (valor.length <= 6) {
        valor = valor.replace(
            /^(\d{2})(\d+)/,
            "($1) $2"
        );
    } else if (valor.length <= 10) {
        valor = valor.replace(
            /^(\d{2})(\d{4})(\d+)/,
            "($1) $2-$3"
        );
    } else {
        valor = valor.replace(
            /^(\d{2})(\d{5})(\d{4})$/,
            "($1) $2-$3"
        );
    }

    input.value = valor;
}

/* preencher dados do perfil */

function preencherDadosDoPerfil(usuario) {
    const cpf = document.getElementById("profile-cpf");
    const cnh = document.getElementById("profile-cnh");
    const tipoCnh = document.getElementById("profile-cnh-type");
    const telefone = document.getElementById("profile-phone");
    const sobre = document.getElementById("profile-bio");

    if (cpf) {
        cpf.value = usuario.nr_cpf || "";
        formatarCPF(cpf);
    }

    if (cnh) {
        cnh.value = usuario.cnh || "";
    }

    if (tipoCnh) {
        tipoCnh.value = usuario.nm_tipo_cnh || "";
    }

    if (telefone) {
        telefone.value = usuario.nr_telefone || "";
        formatarTelefone(telefone);
    }

    if (sobre) {
        sobre.value = usuario.ds_sobre_mim || "";
    }
}

/* salvar perfil */

async function handleSaveProfile(event) {
    event.preventDefault();

    if (!csrfToken) {
        mostrarNotificacao(
            "Não foi possível validar sua sessão. Atualize a página e tente novamente.",
            "erro"
        );
        return;
    }

    if (!usuarioAtual || !usuarioAtual.id_usuario) {
        mostrarNotificacao(
            "Não foi possível identificar sua conta. Entre novamente.",
            "erro"
        );
        return;
    }

    const nomeInput = document.getElementById("profile-name");
    const emailInput = document.getElementById("profile-email");

    const cpf = document.getElementById("profile-cpf");
    const cnh = document.getElementById("profile-cnh");
    const tipoCnh = document.getElementById("profile-cnh-type");
    const telefone = document.getElementById("profile-phone");
    const sobre = document.getElementById("profile-bio");

    const botao =
        document.getElementById("btn-save-profile") ||
        event.submitter;

    const nome = nomeInput?.value.trim() || "";
    const email = emailInput?.value.trim() || "";

    const cpfNumeros =
        cpf?.value.replace(/\D/g, "") || "";

    const telefoneNumeros =
        telefone?.value.replace(/\D/g, "") || "";

    if (!nome || !email) {
        mostrarNotificacao(
            "Preencha o nome e o e-mail.",
            "erro"
        );
        return;
    }

    if (emailInput && !emailInput.checkValidity()) {
        emailInput.reportValidity();
        return;
    }

    if (cpfNumeros && cpfNumeros.length !== 11) {
        mostrarNotificacao(
            "O CPF precisa conter 11 números.",
            "erro"
        );

        cpf?.focus();
        return;
    }

    if (
        telefoneNumeros &&
        ![10, 11].includes(telefoneNumeros.length)
    ) {
        mostrarNotificacao(
            "O telefone deve conter DDD e número.",
            "erro"
        );

        telefone?.focus();
        return;
    }

    const dados = {
        nm_nome: nome,
        email: email,
        nr_cpf: cpfNumeros,
        cnh: cnh?.value.trim() || "",
        nm_tipo_cnh:
            tipoCnh?.value.trim().toUpperCase() || "",
        nr_telefone: telefoneNumeros,
        ds_sobre_mim: sobre?.value.trim() || ""
    };

    const textoBotao = botao?.innerHTML;

    if (botao) {
        botao.disabled = true;
        botao.textContent = "Salvando...";
    }

    try {
        const resposta = await fetch("../php/sa_perfil.php", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Accept": "application/json",
                "X-CSRF-Token": csrfToken
            },
            body: JSON.stringify(dados)
        });

        if (resposta.status === 401) {
            window.location.replace("login.html");
            return;
        }

        const resultado = await lerRespostaJSON(resposta);

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(
                resultado.mensagem ||
                "Não foi possível salvar o perfil."
            );
        }

        usuarioAtual =
            resultado.usuario ||
            { ...usuarioAtual, ...dados };

        atualizarIdentificacao(usuarioAtual);
        preencherDadosDoPerfil(usuarioAtual);

        mostrarMensagemInline(
            resultado.mensagem || "Perfil salvo com sucesso."
        );

        mostrarNotificacao(
            resultado.mensagem || "Seus dados foram salvos."
        );

    } catch (erro) {
        console.error("Erro ao salvar perfil:", erro);

        mostrarMensagemInline(
            erro.message || "Não foi possível salvar o perfil.",
            "erro"
        );

        mostrarNotificacao(
            erro.message || "Não foi possível salvar o perfil.",
            "erro"
        );

    } finally {
        if (botao) {
            botao.disabled = false;

            botao.innerHTML =
                textoBotao ||
                '<i data-lucide="save"></i> Salvar Perfil';
        }

        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
}

/* =====================================================
   ANTECEDENTES CRIMINAIS
   SITUAÇÃO, DATAS E RENOVAÇÃO
   ===================================================== */

/* formatar datas recebidas do banco */

function formatarDataAntecedente(data) {
    if (!data) {
        return "Não informada";
    }

    const dataTexto = String(data).substring(0, 10);
    const partes = dataTexto.split("-");

    if (partes.length !== 3) {
        return "Não informada";
    }

    const [ano, mes, dia] = partes;

    if (!ano || !mes || !dia) {
        return "Não informada";
    }

    return `${dia}/${mes}/${ano}`;
}

/* obter a data atual no formato do banco */

function obterDataAtualAntecedente() {
    const hoje = new Date();

    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");

    return `${ano}-${mes}-${dia}`;
}

/* criar uma linha informativa do painel */

function criarLinhaAntecedente(rotulo, valor) {
    const linha = document.createElement("div");
    linha.className = "antecedente-status-linha";

    const etiqueta = document.createElement("span");
    etiqueta.className = "antecedente-status-rotulo";
    etiqueta.textContent = rotulo;

    const conteudo = document.createElement("strong");
    conteudo.className = "antecedente-status-valor";
    conteudo.textContent = valor;

    linha.append(etiqueta, conteudo);

    return linha;
}

/* atualizar situacao do antecedente */

function atualizarSituacaoAntecedente(antecedente) {
    const formulario = document.getElementById("antecedentes-form");

    if (!formulario) {
        return;
    }

    let painel = document.getElementById(
        "antecedente-status-panel"
    );

    if (!painel) {
        painel = document.createElement("div");
        painel.id = "antecedente-status-panel";
        painel.className = "antecedente-status-panel";
        painel.setAttribute("aria-live", "polite");

        formulario.parentNode.insertBefore(painel, formulario);
    }

    painel.replaceChildren();

    const titulo = document.createElement("h3");
    titulo.className = "antecedente-status-titulo";
    titulo.textContent = "Situação do documento";

    painel.appendChild(titulo);

    const campoArquivo = document.getElementById(
        "arquivo-antecedente"
    );

    const botao = document.getElementById(
        "btn-enviar-antecedente"
    );

    const status = String(
        antecedente?.st_analise || ""
    ).trim().toUpperCase();

    const dataEnvio = antecedente?.dt_envio
        ? String(antecedente.dt_envio).substring(0, 10)
        : "";

    const dataRenovacao = antecedente?.dt_renovacao
        ? String(antecedente.dt_renovacao).substring(0, 10)
        : "";

    const hoje = obterDataAtualAntecedente();

    const documentoEnviado = Boolean(dataEnvio);

    const renovacaoVencida =
        status === "APROVADO" &&
        Boolean(dataRenovacao) &&
        hoje >= dataRenovacao;

    let textoStatus = "Não enviado";
    let classeStatus = "nao-enviado";
    let mensagem = "Você ainda não enviou seu documento. Selecione o arquivo para encaminhá-lo à análise.";
    let permitirEnvio = true;

    if (!documentoEnviado) {
        textoStatus = "Não enviado";
        classeStatus = "nao-enviado";

    } else if (status === "PENDENTE") {
        textoStatus = "Pendente de análise";
        classeStatus = "pendente";
        mensagem = "Seu documento foi recebido e está aguardando a análise da equipe do SalvusConnect.";
        permitirEnvio = false;

    } else if (status === "APROVADO" && renovacaoVencida) {
        textoStatus = "Aprovado — renovação necessária";
        classeStatus = "vencido";
        mensagem = "O prazo de seis meses chegou ao fim. Envie um novo documento para renovação.";

    } else if (status === "APROVADO") {
        textoStatus = "Aprovado";
        classeStatus = "aprovado";
        mensagem = "Seu documento foi aprovado e está dentro do prazo de validade.";
        permitirEnvio = false;

    } else if (status === "REPROVADO") {
        textoStatus = "Reprovado";
        classeStatus = "reprovado";
        mensagem = "Seu documento foi reprovado. Você pode enviar um novo arquivo para análise.";

    } else {
        textoStatus = status || "Não enviado";
        classeStatus = "nao-enviado";
        mensagem = "Confira a situação do seu documento com a equipe do SalvusConnect.";
    }

    painel.dataset.status = classeStatus;

    painel.appendChild(
        criarLinhaAntecedente("Status:", textoStatus)
    );

    if (documentoEnviado) {
        painel.appendChild(
            criarLinhaAntecedente(
                "Data de envio:",
                formatarDataAntecedente(dataEnvio)
            )
        );

        painel.appendChild(
            criarLinhaAntecedente(
                "Próxima renovação:",
                formatarDataAntecedente(dataRenovacao)
            )
        );
    }

    const aviso = document.createElement("p");
    aviso.className = "antecedente-status-aviso";
    aviso.textContent = mensagem;

    painel.appendChild(aviso);

    // O formulário fica disponível somente quando um novo envio é permitido.
    formulario.hidden = !permitirEnvio;

    if (campoArquivo) {
        campoArquivo.disabled = !permitirEnvio;
    }

    if (botao) {
        botao.disabled = !permitirEnvio;
    }
}

/* antecedentes criminais: formulario de envio */

function inicializarFormularioAntecedentes() {
    const formulario = document.getElementById("antecedentes-form");

    if (!formulario) {
        return;
    }

    formulario.addEventListener("submit", enviarAntecedente);
}

async function enviarAntecedente(event) {
    event.preventDefault();

    if (
        !usuarioAtual ||
        Number(usuarioAtual.cd_tipo_usuario) !== 1
    ) {
        mostrarMensagemAntecedentes(
            "Somente prestadores podem enviar antecedentes criminais.",
            "erro"
        );
        return;
    }

    if (!csrfToken) {
        mostrarMensagemAntecedentes(
            "Não foi possível validar sua sessão. Atualize a página e tente novamente.",
            "erro"
        );
        return;
    }

    const formulario = document.getElementById("antecedentes-form");
    const campoArquivo = document.getElementById("arquivo-antecedente");
    const botao = document.getElementById("btn-enviar-antecedente");

    if (!formulario || !campoArquivo || !campoArquivo.files.length) {
        mostrarMensagemAntecedentes(
            "Selecione um documento antes de enviar.",
            "erro"
        );
        return;
    }

    const arquivo = campoArquivo.files[0];
    const tamanhoMaximo = 5 * 1024 * 1024;

    const extensao = arquivo.name
        .split(".")
        .pop()
        .toLowerCase();

    const extensoesPermitidas = ["pdf", "png", "jpg", "jpeg"];

    if (!extensoesPermitidas.includes(extensao)) {
        mostrarMensagemAntecedentes(
            "Formato inválido. Selecione um PDF, PNG ou JPG.",
            "erro"
        );
        return;
    }

    if (arquivo.size <= 0 || arquivo.size > tamanhoMaximo) {
        mostrarMensagemAntecedentes(
            "O arquivo deve ter tamanho maior que zero e no máximo 5 MB.",
            "erro"
        );
        return;
    }

    const dados = new FormData();
    dados.append("antecedente", arquivo);

    const textoBotao = botao?.innerHTML;

    if (botao) {
        botao.disabled = true;
        botao.textContent = "Enviando documento...";
    }

    mostrarMensagemAntecedentes("");

    try {
        const resposta = await fetch("../php/antecedentes.php", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: {
                Accept: "application/json",
                "X-CSRF-Token": csrfToken
            },
            body: dados
        });

        if (resposta.status === 401) {
            window.location.replace("login.html");
            return;
        }

        const resultado = await lerRespostaJSON(resposta);

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(
                resultado.mensagem ||
                "Não foi possível enviar o documento."
            );
        }

        formulario.reset();

        // Recarrega os dados para mostrar o novo status e as datas.
        await carregarUsuarioAtual();

        mostrarMensagemAntecedentes(
            resultado.mensagem ||
            "Documento enviado para análise.",
            "sucesso"
        );

        mostrarNotificacao(
            resultado.mensagem ||
            "Documento enviado para análise."
        );

    } catch (erro) {
        console.error("Erro ao enviar antecedente:", erro);

        mostrarMensagemAntecedentes(
            erro.message ||
            "Não foi possível enviar o documento.",
            "erro"
        );

        mostrarNotificacao(
            erro.message ||
            "Não foi possível enviar o documento.",
            "erro"
        );

    } finally {
        if (botao) {
            botao.disabled = false;

            botao.innerHTML =
                textoBotao ||
                '<i data-lucide="upload"></i> Enviar documento';
        }

        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
}

function mostrarMensagemAntecedentes(texto, tipo = "sucesso") {
    const elemento =
        document.getElementById("antecedentes-message");

    if (!elemento) {
        if (texto) {
            mostrarNotificacao(
                texto,
                tipo === "erro" ? "erro" : "sucesso"
            );
        }

        return;
    }

    elemento.textContent = texto;
    elemento.dataset.status = tipo;

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

/* disponibilizar funcoes usadas pelo html */

window.handleSaveProfile = handleSaveProfile;
window.formatarCPF = formatarCPF;
window.formatarTelefone = formatarTelefone;
