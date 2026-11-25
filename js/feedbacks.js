
"use strict";

// SALVUSCONNECT — FEEDBACKS

let reviews = [];

const currentUser = {
    id: null,
    full_name: "",
    role: null
};

document.addEventListener("DOMContentLoaded", carregarFeedbacks);

// CARREGAR AVALIAÇÕES REAIS

async function loadReviews() {
    // Identifica o usuário autenticado.
    const respostaUsuario = await fetch(
        "../php/usuarios.php?acao=meus_dados",
        {
            method: "GET",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json"
            }
        }
    );

    const dadosUsuario = await respostaUsuario.json();

    if (
        !respostaUsuario.ok ||
        !dadosUsuario.sucesso ||
        !dadosUsuario.usuario
    ) {
        throw new Error(
            dadosUsuario.mensagem ||
            "Não foi possível identificar o usuário autenticado."
        );
    }

    const usuario = dadosUsuario.usuario;
    const tipoUsuario = Number(usuario.cd_tipo_usuario);

    if (tipoUsuario !== 1 && tipoUsuario !== 3) {
        throw new Error(
            "As avaliações estão disponíveis somente para clientes e prestadores."
        );
    }

    currentUser.id = String(usuario.id_usuario);
    currentUser.full_name = usuario.nm_nome || "";

    currentUser.role = tipoUsuario === 1
        ? "provider"
        : "client";

    // Busca as avaliações relacionadas ao usuário.
    const respostaAvaliacoes = await fetch(
        "../php/avaliacoes.php?acao=listar",
        {
            method: "GET",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json"
            }
        }
    );

    const dadosAvaliacoes = await respostaAvaliacoes.json();

    if (
        !respostaAvaliacoes.ok ||
        !dadosAvaliacoes.sucesso ||
        !Array.isArray(dadosAvaliacoes.avaliacoes)
    ) {
        throw new Error(
            dadosAvaliacoes.mensagem ||
            "Não foi possível carregar as avaliações."
        );
    }

    // Exibe somente as avaliações recebidas pelo usuário atual.
    reviews = dadosAvaliacoes.avaliacoes
        .filter(avaliacao => {
            return (
                avaliacao &&
                typeof avaliacao === "object" &&
                String(avaliacao.avaliado_id) === currentUser.id &&
                String(avaliacao.autor_id) !== currentUser.id &&
                obterTexto(avaliacao.autor_nome, "") !== "" &&
                obterTexto(avaliacao.avaliado_nome, "") !== ""
            );
        })
        .map(avaliacao => ({
            id: avaliacao.id_avaliacao,
            reviewer_name: avaliacao.autor_nome,
            target_name: avaliacao.avaliado_nome,
            service_name: avaliacao.service_name || "",
            rating: Number(avaliacao.nota),
            comment: avaliacao.comentario || "",
            created_date: avaliacao.created_date || "",
            appointment_date: avaliacao.hr_horario || "",
            appointment_id: avaliacao.id_agendamento
        }));
}

// INICIALIZAÇÃO

async function carregarFeedbacks() {
    const loading = document.getElementById("loadingFeedbacks");
    const lista = document.getElementById("feedbackList");
    const vazio = document.getElementById("emptyFeedbacks");
    const estatisticas = document.getElementById("feedbackStats");

    if (loading) {
        loading.hidden = false;
        loading.style.display = "flex";
    }

    if (lista) {
        lista.replaceChildren();
    }

    if (vazio) {
        vazio.hidden = true;
        vazio.style.display = "none";
    }

    try {
        await loadReviews();

        atualizarEstatisticas();
        renderizarAvaliacoes();

        if (estatisticas) {
            estatisticas.style.display = "flex";
        }

    } catch (erro) {
        console.error("Erro ao carregar feedbacks:", erro);

        reviews = [];

        if (lista) {
            lista.replaceChildren();
        }

        if (estatisticas) {
            estatisticas.style.display = "none";
        }

        mostrarEstadoVazio(
            erro.message ||
            "Não foi possível carregar as avaliações. Atualize a página e tente novamente."
        );

    } finally {
        if (loading) {
            loading.hidden = true;
            loading.style.display = "none";
        }
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ESTATÍSTICAS

function atualizarEstatisticas() {
    const mediaElemento = document.getElementById("averageRating");
    const estrelasElemento = document.getElementById("averageStars");
    const quantidadeElemento = document.getElementById("reviewCount");
    const tipoElemento = document.getElementById("reviewType");

    const avaliacoesComNota = reviews.filter(avaliacao => {
        const nota = Number(avaliacao.rating);

        return Number.isFinite(nota) && nota >= 1 && nota <= 5;
    });

    const quantidade = reviews.length;

    const media = avaliacoesComNota.length
        ? avaliacoesComNota.reduce(
            (total, avaliacao) => total + Number(avaliacao.rating),
            0
        ) / avaliacoesComNota.length
        : 0;

    if (mediaElemento) {
        mediaElemento.textContent =
            avaliacoesComNota.length ? media.toFixed(1) : "—";
    }

    if (estrelasElemento) {
        estrelasElemento.textContent = gerarEstrelas(media);

        estrelasElemento.setAttribute(
            "aria-label",
            avaliacoesComNota.length
                ? `Nota média de ${media.toFixed(1)} de 5`
                : "Ainda não há avaliações com nota"
        );
    }

    if (quantidadeElemento) {
        quantidadeElemento.textContent =
            `${quantidade} ${quantidade === 1 ? "avaliação" : "avaliações"}`;
    }

    if (tipoElemento) {
        tipoElemento.textContent = currentUser.role === "provider"
            ? "Clientes sobre prestadores"
            : "Prestadores sobre clientes";
    }
}

// ESTRELAS

function gerarEstrelas(nota) {
    const notaArredondada = Math.max(
        0,
        Math.min(5, Math.round(Number(nota) || 0))
    );

    return "★".repeat(notaArredondada) +
        "☆".repeat(5 - notaArredondada);
}

// EXIBIR AVALIAÇÕES

function renderizarAvaliacoes() {
    const lista = document.getElementById("feedbackList");

    if (!lista) {
        return;
    }

    lista.replaceChildren();

    if (reviews.length === 0) {
        mostrarEstadoVazio(
            currentUser.role === "provider"
                ? "Você ainda não recebeu avaliações de clientes."
                : "Você ainda não recebeu avaliações de prestadores."
        );

        return;
    }

    ocultarEstadoVazio();

    const avaliacoesOrdenadas = [...reviews].sort((a, b) => {
        const dataA = new Date(a.created_date || a.appointment_date || 0).getTime() || 0;
        const dataB = new Date(b.created_date || b.appointment_date || 0).getTime() || 0;

        return dataB - dataA;
    });

    avaliacoesOrdenadas.forEach(avaliacao => {
        lista.appendChild(criarCartaoFeedback(avaliacao));
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ESTADO VAZIO

function mostrarEstadoVazio(mensagem) {
    const vazio = document.getElementById("emptyFeedbacks");
    const descricao = document.getElementById("emptyDescription");

    if (descricao) {
        descricao.textContent = mensagem;
    }

    if (vazio) {
        vazio.hidden = false;
        vazio.style.display = "block";
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function ocultarEstadoVazio() {
    const vazio = document.getElementById("emptyFeedbacks");

    if (vazio) {
        vazio.hidden = true;
        vazio.style.display = "none";
    }
}

// CRIAR CARTÃO DE FEEDBACK

function criarCartaoFeedback(avaliacao) {
    const card = document.createElement("article");
    card.className = "feedback-card";

    // Cabeçalho
    const cabecalho = document.createElement("div");
    cabecalho.className = "feedback-header";

    const informacoes = document.createElement("div");
    informacoes.className = "reviewer-info";

    const nome = obterTexto(
        avaliacao.reviewer_name,
        "Nome não disponível"
    );

    const avatar = document.createElement("div");
    avatar.className = "reviewer-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = obterInicial(nome);

    const detalhes = document.createElement("div");

    const nomeElemento = document.createElement("p");
    nomeElemento.className = "reviewer-name";
    nomeElemento.textContent = nome;

    const alvo = document.createElement("p");
    alvo.className = "reviewer-target";
    alvo.textContent =
        `Avaliação de ${obterTexto(avaliacao.target_name, "usuário")}`;

    detalhes.append(nomeElemento, alvo);
    informacoes.append(avatar, detalhes);

    // Nota
    const nota = Number(avaliacao.rating);
    const notaValida = Number.isFinite(nota) && nota >= 1 && nota <= 5;

    const estrelas = document.createElement("div");
    estrelas.className = "feedback-stars";
    estrelas.textContent = gerarEstrelas(notaValida ? nota : 0);

    estrelas.setAttribute(
        "aria-label",
        notaValida ? `${nota} de 5 estrelas` : "Nota não informada"
    );

    cabecalho.append(informacoes, estrelas);
    card.appendChild(cabecalho);

    // Serviço avaliado
    const servico = obterTexto(avaliacao.service_name, "");

    if (servico) {
        const etiquetaServico = document.createElement("span");
        etiquetaServico.className = "service-badge";
        etiquetaServico.textContent = servico;
        card.appendChild(etiquetaServico);
    }

    // Comentário
    const comentario = document.createElement("div");
    comentario.className = "feedback-comment";

    const textoComentario = document.createElement("p");
    textoComentario.textContent = obterTexto(
        avaliacao.comment,
        "Nenhum comentário foi informado."
    );

    comentario.appendChild(textoComentario);
    card.appendChild(comentario);

    // Data
    const dataPublicacao = formatarData(avaliacao.created_date);
    const dataAtendimento = formatarData(avaliacao.appointment_date);

    if (dataPublicacao || dataAtendimento) {
        const dataElemento = document.createElement("p");
        dataElemento.className = "feedback-date";

        dataElemento.textContent = dataPublicacao
            ? `Publicado em ${dataPublicacao}`
            : `Atendimento em ${dataAtendimento}`;

        card.appendChild(dataElemento);
    }

    return card;
}

// UTILITÁRIOS

function obterTexto(valor, padrao) {
    if (typeof valor !== "string") {
        return padrao;
    }

    const texto = valor.trim();
    return texto || padrao;
}

function obterInicial(nome) {
    return obterTexto(nome, "Usuário")
        .charAt(0)
        .toLocaleUpperCase("pt-BR");
}

function formatarData(valor) {
    if (!valor) {
        return "";
    }

    const data = new Date(
        String(valor).replace(" ", "T")
    );

    if (Number.isNaN(data.getTime())) {
        return "";
    }

    return data.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
}
