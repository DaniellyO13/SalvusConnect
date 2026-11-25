"use strict";

// SALVUSCONNECT — LOGIN

document.addEventListener("DOMContentLoaded", () => {
    inicializarIcones();
    exibirMensagemAutenticacao();
});

// INICIALIZAR ÍCONES

function inicializarIcones() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// EXIBIR MENSAGENS DE AUTENTICAÇÃO

function exibirMensagemAutenticacao() {
    const parametros = new URLSearchParams(window.location.search);
    const codigoErro = parametros.get("erro");
    const caixa = document.getElementById("auth-message");

    if (!codigoErro || !caixa) {
        return;
    }

    const mensagensPermitidas = {
        google: "Não foi possível entrar com o Google. Tente novamente.",
        conta: "Não encontramos sua conta. Faça seu cadastro para continuar.",
        sessao: "Sua sessão expirou. Entre novamente.",
        campos: "Preencha todos os campos para entrar.",
        credenciais: "E-mail ou senha incorretos. Verifique seus dados e tente novamente.",
        tipo: "Não foi possível identificar o tipo da sua conta."
    };

    const mensagem = mensagensPermitidas[codigoErro];

    if (!mensagem) {
        return;
    }

    caixa.textContent = mensagem;
    caixa.classList.remove("success");
    caixa.classList.add("error");
    caixa.hidden = false;
}