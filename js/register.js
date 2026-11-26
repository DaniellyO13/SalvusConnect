"use strict";

// SALVUSCONNECT — CADASTRO

document.addEventListener("DOMContentLoaded", inicializarCadastro);

function inicializarCadastro() {
    const formulario = document.getElementById("register-form");

    if (!formulario) {
        console.error("Formulário de cadastro não encontrado.");
        return;
    }

    configurarTipoUsuario();
    configurarMascaraTelefone();
    configurarMascaraCPF();
    configurarValidacaoSenhas();
    configurarEnvioFormulario(formulario);

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// IDENTIFICAR TIPO DE USUÁRIO

function configurarTipoUsuario() {
    const campoTipo = document.getElementById("cd_tipo_usuario");
    const subtitulo = document.getElementById("subtitle-type");
    const secaoContatos = document.getElementById("client-contact-section");

    if (!campoTipo || !subtitulo) {
        console.error("Campos de identificação do usuário não encontrados.");
        return;
    }

    const parametros = new URLSearchParams(window.location.search);
    const tipoRecebido = (parametros.get("type") || "cliente").toLowerCase();

    const ehPrestador =
        tipoRecebido === "prestador" || tipoRecebido === "1";

    // Tipos usados no projeto:
    // 1 = prestador
    // 3 = usuário comum
    campoTipo.value = ehPrestador ? "1" : "3";

    subtitulo.textContent = ehPrestador
        ? "Cadastro de Prestador de Serviços"
        : "Cadastro de Usuário";

    // Contatos adicionais aparecem apenas para clientes.
    if (secaoContatos) {
        secaoContatos.hidden = ehPrestador;
    }

    document.querySelectorAll("[data-client-phone] input").forEach(campo => {
        campo.disabled = ehPrestador;
        campo.required = false;

        if (ehPrestador) {
            campo.value = "";
        }
    });
}

// EXIBIR MENSAGENS

function exibirMensagem(texto, tipo) {
    const mensagem = document.getElementById("form-message");

    if (!mensagem) {
        return;
    }

    mensagem.textContent = texto;
    mensagem.className = `form-message ${tipo}`;
    mensagem.hidden = false;
    mensagem.setAttribute("role", tipo === "error" ? "alert" : "status");

    mensagem.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });
}

function limparMensagem() {
    const mensagem = document.getElementById("form-message");

    if (!mensagem) {
        return;
    }

    mensagem.textContent = "";
    mensagem.className = "form-message";
    mensagem.hidden = true;
}

// MÁSCARA DOS TELEFONES

function aplicarMascaraTelefone(valor) {
    const numeros = valor.replace(/\D/g, "").slice(0, 11);

    if (numeros.length === 0) {
        return "";
    }

    if (numeros.length <= 2) {
        return `(${numeros}`;
    }

    if (numeros.length <= 6) {
        return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
    }

    if (numeros.length <= 10) {
        return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
    }

    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
}

function configurarMascaraTelefone() {
    const camposTelefone = [
        "telefone",
        "telefone_familiar",
        "telefone_terceiros"
    ];

    camposTelefone.forEach(id => {
        const campo = document.getElementById(id);

        if (!campo) {
            return;
        }

        campo.addEventListener("input", () => {
            campo.value = aplicarMascaraTelefone(campo.value);
        });
    });
}

// MÁSCARA DO CPF

function configurarMascaraCPF() {
    const campoCPF = document.getElementById("nr_cpf");

    if (!campoCPF) {
        return;
    }

    campoCPF.addEventListener("input", () => {
        let numeros = campoCPF.value.replace(/\D/g, "").slice(0, 11);

        if (numeros.length > 9) {
            numeros = numeros.replace(
                /^(\d{3})(\d{3})(\d{3})(\d{1,2})$/,
                "$1.$2.$3-$4"
            );
        } else if (numeros.length > 6) {
            numeros = numeros.replace(
                /^(\d{3})(\d{3})(\d{1,3})$/,
                "$1.$2.$3"
            );
        } else if (numeros.length > 3) {
            numeros = numeros.replace(
                /^(\d{3})(\d{1,3})$/,
                "$1.$2"
            );
        }

        campoCPF.value = numeros;
    });
}

// VALIDAR CONFIRMAÇÃO DE SENHA

function configurarValidacaoSenhas() {
    const senha = document.getElementById("senha");
    const confirmarSenha = document.getElementById("confirmar_senha");

    if (!senha || !confirmarSenha) {
        return;
    }

    function validarSenhas() {
        if (
            confirmarSenha.value &&
            senha.value !== confirmarSenha.value
        ) {
            confirmarSenha.setCustomValidity("As senhas não coincidem.");
        } else {
            confirmarSenha.setCustomValidity("");
        }
    }

    senha.addEventListener("input", validarSenhas);
    confirmarSenha.addEventListener("input", validarSenhas);
}

// ENVIAR CADASTRO PARA O PHP

function configurarEnvioFormulario(formulario) {
    formulario.addEventListener("submit", async evento => {
        evento.preventDefault();
        limparMensagem();

        // Validar campos obrigatórios e regras HTML.
        if (!formulario.checkValidity()) {
            formulario.reportValidity();
            return;
        }

        const senha = document.getElementById("senha");
        const confirmarSenha = document.getElementById("confirmar_senha");

        if (senha.value !== confirmarSenha.value) {
            exibirMensagem("As senhas não coincidem.", "error");
            confirmarSenha.focus();
            return;
        }

        const botaoEnviar = document.getElementById("submit-button");

        if (!botaoEnviar) {
            exibirMensagem("Não foi possível encontrar o botão de cadastro.", "error");
            return;
        }

        const conteudoOriginal = botaoEnviar.innerHTML;

        botaoEnviar.disabled = true;
        botaoEnviar.textContent = "Criando conta...";

        let cadastroConcluido = false;

        try {
            const resposta = await fetch(formulario.action, {
                method: "POST",
                body: new FormData(formulario),
                headers: {
                    Accept: "application/json"
                },
                credentials: "same-origin"
            });

            // O cadastro espera uma resposta JSON do PHP.
            const tipoConteudo = resposta.headers.get("content-type") || "";

            if (!tipoConteudo.toLowerCase().includes("application/json")) {
                throw new Error(
                    "O servidor não retornou JSON. Verifique a resposta do arquivo cadastro.php."
                );
            }

            const dados = await resposta.json();

            if (!resposta.ok || !dados.sucesso) {
                exibirMensagem(
                    dados.mensagem || "Não foi possível concluir o cadastro.",
                    "error"
                );
                return;
            }

            cadastroConcluido = true;

            exibirMensagem(
                dados.mensagem || "Cadastro realizado com sucesso!",
                "success"
            );

            botaoEnviar.textContent = "Cadastro concluído!";

            // Usa o destino fornecido pelo servidor ou o login padrão.
            window.setTimeout(() => {
                window.location.href = dados.redirect || "login.html";
            }, 1800);

        } catch (erro) {
            console.error("Erro ao realizar cadastro:", erro);

            exibirMensagem(
                erro.message ||
                    "Não foi possível conectar ao servidor. Verifique se o XAMPP está ativo e tente novamente.",
                "error"
            );

        } finally {
            if (!cadastroConcluido) {
                botaoEnviar.disabled = false;
                botaoEnviar.innerHTML = conteudoOriginal;

                if (window.lucide) {
                    window.lucide.createIcons();
                }
            }
        }
    });
}
