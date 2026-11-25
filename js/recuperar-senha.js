
"use strict";

// SALVUSCONNECT — REDEFINIÇÃO DE SENHA

document.addEventListener("DOMContentLoaded", () => {
    const formulario = document.getElementById("recovery-form");
    const campoSenha = document.getElementById("recovery-password");
    const campoConfirmacao = document.getElementById(
        "recovery-password-confirm"
    );
    const campoToken = document.getElementById("recovery-token");
    const botaoSalvar = document.getElementById("recovery-submit");
    const mensagem = document.getElementById("recovery-message");

    if (window.lucide) {
        window.lucide.createIcons();
    }

    if (
        !formulario ||
        !campoSenha ||
        !campoConfirmacao ||
        !campoToken ||
        !botaoSalvar ||
        !mensagem
    ) {
        console.error(
            "Não foi possível inicializar o formulário de redefinição de senha."
        );
        return;
    }

    function mostrarMensagem(texto, tipo) {
        mensagem.textContent = texto;
        mensagem.className = `recovery-message ${tipo}`;
        mensagem.hidden = false;
    }

    function limparMensagem() {
        mensagem.textContent = "";
        mensagem.className = "recovery-message";
        mensagem.hidden = true;
    }

    function validarSenha(senha) {
        const possuiTamanhoMinimo = senha.length >= 8;
        const possuiMaiuscula = /[A-Z]/.test(senha);
        const possuiMinuscula = /[a-z]/.test(senha);
        const possuiCaractereEspecial = /[!@#$%¨&*]/.test(senha);

        return {
            valida:
                possuiTamanhoMinimo &&
                possuiMaiuscula &&
                possuiMinuscula &&
                possuiCaractereEspecial,
            possuiTamanhoMinimo,
            possuiMaiuscula,
            possuiMinuscula,
            possuiCaractereEspecial
        };
    }

    const parametros = new URLSearchParams(window.location.search);
    const token = parametros.get("token");

    if (!token) {
        mostrarMensagem(
            "Link de recuperação inválido ou incompleto. Solicite um novo link.",
            "error"
        );

        botaoSalvar.disabled = true;
        return;
    }

    campoToken.value = token;

    campoSenha.addEventListener("input", limparMensagem);
    campoConfirmacao.addEventListener("input", limparMensagem);

    formulario.addEventListener("submit", (evento) => {
        limparMensagem();

        if (!campoToken.value) {
            evento.preventDefault();

            mostrarMensagem(
                "Não foi possível validar o link de recuperação. Solicite um novo.",
                "error"
            );

            return;
        }

        if (!formulario.checkValidity()) {
            evento.preventDefault();
            formulario.reportValidity();
            return;
        }

        const senha = campoSenha.value;
        const confirmacao = campoConfirmacao.value;

        if (senha.length > 200) {
            evento.preventDefault();

            mostrarMensagem(
                "A senha não pode ultrapassar 200 caracteres.",
                "error"
            );

            campoSenha.focus();
            return;
        }

        const resultado = validarSenha(senha);

        if (!resultado.valida) {
            evento.preventDefault();

            const requisitos = [];

            if (!resultado.possuiTamanhoMinimo) {
                requisitos.push("pelo menos 8 caracteres");
            }

            if (!resultado.possuiMaiuscula) {
                requisitos.push("uma letra maiúscula");
            }

            if (!resultado.possuiMinuscula) {
                requisitos.push("uma letra minúscula");
            }

            if (!resultado.possuiCaractereEspecial) {
                requisitos.push("um caractere especial (!@#$%¨&*)");
            }

            mostrarMensagem(
                "Sua senha precisa conter: " + requisitos.join(", ") + ".",
                "error"
            );

            campoSenha.focus();
            return;
        }

        if (senha !== confirmacao) {
            evento.preventDefault();

            mostrarMensagem(
                "As senhas não coincidem. Confira os dois campos.",
                "error"
            );

            campoConfirmacao.focus();
            return;
        }

        // A validação definitiva e a atualização da senha
        // serão realizadas pelo PHP no servidor.

        botaoSalvar.disabled = true;

        const textoBotao = botaoSalvar.querySelector("span");

        if (textoBotao) {
            textoBotao.textContent = "Salvando...";
        }
    });
});
