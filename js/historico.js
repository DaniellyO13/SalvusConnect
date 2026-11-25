
"use strict";

// SalvusConnect — Histórico

let appointments = [];
let reviewDialog = null;
let selectedRating = 0;
let csrfToken = null;
let reviewsLoaded = false;
let submittingReview = false;

const reviewsByAppointment = new Map();

const currentUser = {
    id: null,
    full_name: "",
    role: "client"
};

const loadingHistory = document.getElementById("loadingHistory");
const emptyHistory = document.getElementById("emptyHistory");
const historyList = document.getElementById("historyList");

const reviewModal = document.getElementById("reviewModal");
const closeReviewModal = document.getElementById("closeReviewModal");
const reviewModalTitle = document.getElementById("reviewModalTitle");
const reviewServiceName = document.getElementById("reviewServiceName");
const reviewTargetName = document.getElementById("reviewTargetName");
const ratingStars = document.getElementById("ratingStars");
const reviewComment = document.getElementById("reviewComment");
const reviewError = document.getElementById("reviewError");
const submitReviewButton = document.getElementById("submitReviewButton");

const ratingButtons = ratingStars
    ? ratingStars.querySelectorAll("button")
    : [];

// Busca os dados reais da conta e seus agendamentos.
async function loadData() {
    try {
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

        if (!respostaUsuario.ok || !dadosUsuario.sucesso || !dadosUsuario.usuario) {
            throw new Error(
                dadosUsuario.mensagem ||
                "Não foi possível identificar o usuário autenticado."
            );
        }

        const usuario = dadosUsuario.usuario;
        const tipoUsuario = Number(usuario.cd_tipo_usuario);

        if (tipoUsuario === 1) {
            currentUser.role = "provider";
        } else if (tipoUsuario === 3) {
            currentUser.role = "client";
        } else {
            throw new Error(
                "O histórico está disponível somente para clientes e prestadores."
            );
        }

        currentUser.id = usuario.id_usuario;
        currentUser.full_name = usuario.nm_nome || "";

        const respostaAgendamentos = await fetch(
            "../php/listar_agend.php",
            {
                method: "GET",
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json"
                }
            }
        );

        const dadosAgendamentos = await respostaAgendamentos.json();

        if (
            !respostaAgendamentos.ok ||
            !dadosAgendamentos.sucesso ||
            !Array.isArray(dadosAgendamentos.agendamentos)
        ) {
            throw new Error(
                dadosAgendamentos.mensagem ||
                "Não foi possível carregar os agendamentos."
            );
        }

        appointments = dadosAgendamentos.agendamentos.map((agendamento) => {
            const dataHora = separarDataHora(agendamento.hr_horario);

            return {
                id: agendamento.id_agendamento,
                provider_id: agendamento.tb_prestador_id_usuario,
                provider_name: agendamento.nm_prestador,
                client_id: agendamento.tb_usuario_id_usuario,
                client_name: agendamento.nm_cliente,
                service_name: agendamento.nm_servico,
                date: dataHora.date,
                time: dataHora.time,
                status: agendamento.st_agendamento
            };
        });

        // Carrega as avaliações reais do usuário.
        await carregarAvaliacoes();

        return true;

    } catch (erro) {
        console.error("Erro ao carregar o histórico:", erro);
        appointments = [];
        return false;
    }
}

// Separa a data e o horário recebidos do banco de dados.
function separarDataHora(valor) {
    if (!valor) {
        return {
            date: "",
            time: ""
        };
    }

    const dataHora = String(valor).trim().replace("T", " ");
    const partes = dataHora.split(" ");

    return {
        date: partes[0] || "",
        time: partes[1] ? partes[1].substring(0, 5) : ""
    };
}

// Padroniza os nomes dos serviços com as iniciais em maiúsculas.
function formatarNomeServico(nome) {
    if (!nome) {
        return "Serviço";
    }

    return String(nome)
        .toLocaleLowerCase("pt-BR")
        .replace(/(^|[\s-])([a-zà-ÿ])/g, (match, separador, letra) => {
            return separador + letra.toLocaleUpperCase("pt-BR");
        });
}

// Seleciona os serviços concluídos do cliente ou prestador.
function getHistoryAppointments() {
    const campoUsuario = currentUser.role === "provider"
        ? "provider_id"
        : "client_id";

    return appointments
        .filter((appointment) => {
            return (
                String(appointment[campoUsuario]) === String(currentUser.id) &&
                String(appointment.status).toLowerCase() === "concluido"
            );
        })
        .sort((a, b) => {
            const dataA = new Date(
                `${a.date || ""}T${a.time || "00:00"}:00`
            ).getTime();

            const dataB = new Date(
                `${b.date || ""}T${b.time || "00:00"}:00`
            ).getTime();

            return (
                (Number.isNaN(dataB) ? 0 : dataB) -
                (Number.isNaN(dataA) ? 0 : dataA)
            );
        });
}

// Busca o token CSRF e as avaliações registradas.
async function carregarAvaliacoes() {
    reviewsLoaded = false;
    reviewsByAppointment.clear();

    try {
        const respostaCSRF = await fetch(
            "../php/avaliacoes.php?acao=csrf",
            {
                method: "GET",
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json"
                }
            }
        );

        const dadosCSRF = await respostaCSRF.json();

        if (
            !respostaCSRF.ok ||
            !dadosCSRF.sucesso ||
            !dadosCSRF.csrf_token
        ) {
            throw new Error(
                dadosCSRF.mensagem ||
                "Não foi possível obter o token de segurança."
            );
        }

        csrfToken = dadosCSRF.csrf_token;

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

        dadosAvaliacoes.avaliacoes.forEach((avaliacao) => {
            if (
                !avaliacao.eh_minha ||
                String(avaliacao.autor_id) !== String(currentUser.id)
            ) {
                return;
            }

            reviewsByAppointment.set(
                String(avaliacao.id_agendamento),
                avaliacao
            );
        });

        reviewsLoaded = true;

    } catch (erro) {
        csrfToken = null;
        reviewsByAppointment.clear();

        console.error("Erro ao carregar avaliações:", erro);
    }
}

// Verifica se o usuário já avaliou o atendimento.
function hasReview(appointmentId) {
    return reviewsByAppointment.get(String(appointmentId)) || null;
}

// Controla a mensagem de carregamento.
function mostrarCarregamento(mostrar) {
    if (loadingHistory) {
        loadingHistory.style.display = mostrar ? "flex" : "none";
    }
}

// Controla a mensagem de histórico vazio.
function mostrarHistoricoVazio(mostrar) {
    if (!emptyHistory) {
        return;
    }

    emptyHistory.hidden = !mostrar;
    emptyHistory.style.display = mostrar ? "flex" : "none";
}

// Cria os cartões do histórico.
function renderHistory() {
    if (!historyList || !emptyHistory) {
        console.error(
            "Não foram encontrados os elementos do histórico no HTML."
        );

        mostrarCarregamento(false);
        return;
    }

    mostrarCarregamento(false);

    const historico = getHistoryAppointments();

    historyList.replaceChildren();

    if (historico.length === 0) {
        historyList.style.display = "none";
        mostrarHistoricoVazio(true);
        return;
    }

    mostrarHistoricoVazio(false);
    historyList.style.display = "flex";

    historico.forEach((appointment) => {
        const card = document.createElement("article");
        card.className = "history-card";

        const avaliacao = hasReview(appointment.id);

        const nomePessoa = currentUser.role === "provider"
            ? appointment.client_name
            : appointment.provider_name;

        let acao = "";

        if (!reviewsLoaded) {
            acao = `
                <button
                    type="button"
                    class="review-button"
                    disabled
                    title="Não foi possível carregar as avaliações">

                    <i data-lucide="message-square" aria-hidden="true"></i>
                    <span>Indisponível</span>
                </button>
            `;
        } else if (avaliacao) {
            acao = `
                <button
                    type="button"
                    class="review-button"
                    data-appointment-id="${escapeHTML(appointment.id)}"
                    aria-label="Editar avaliação de ${escapeHTML(nomePessoa || "usuário")}">

                    <i data-lucide="edit-3" aria-hidden="true"></i>
                    <span>Editar avaliação</span>
                </button>
            `;
        } else {
            acao = `
                <button
                    type="button"
                    class="review-button"
                    data-appointment-id="${escapeHTML(appointment.id)}"
                    aria-label="Avaliar ${escapeHTML(
                        appointment.service_name || "serviço"
                    )}">

                    <i data-lucide="message-square" aria-hidden="true"></i>
                    <span>Avaliar</span>
                </button>
            `;
        }

        card.innerHTML = `
            <div class="history-card-content">
                <div class="history-info">
                    <div class="service-title-row">
                        <h3 class="service-title">
                            ${escapeHTML(
                                formatarNomeServico(appointment.service_name)
                            )}
                        </h3>

                        <span class="completed-badge">Concluído</span>
                    </div>

                    <p class="person-name">
                        ${escapeHTML(nomePessoa || "—")}
                    </p>

                    <div class="service-details">
                        <span class="detail-item">
                            <span class="detail-icon">
                                <i data-lucide="calendar" aria-hidden="true"></i>
                            </span>
                            <span>${formatDate(appointment.date)}</span>
                        </span>

                        <span class="detail-item">
                            <span class="detail-icon">
                                <i data-lucide="clock" aria-hidden="true"></i>
                            </span>
                            <span>${escapeHTML(appointment.time || "—")}</span>
                        </span>
                    </div>
                </div>

                <div class="history-action">
                    ${acao}
                </div>
            </div>
        `;

        historyList.appendChild(card);
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }

    addReviewButtonEvents();
}

// Adiciona os eventos dos botões de avaliação.
function addReviewButtonEvents() {
    if (!historyList) {
        return;
    }

    const botoes = historyList.querySelectorAll(".review-button");

    botoes.forEach((botao) => {
        botao.addEventListener("click", () => {
            if (botao.disabled) {
                return;
            }

            const agendamento = appointments.find((item) => {
                return (
                    String(item.id) ===
                    String(botao.dataset.appointmentId)
                );
            });

            if (agendamento) {
                openReviewDialog(
                    agendamento,
                    hasReview(agendamento.id)
                );
            }
        });
    });
}

// Abre o modal de avaliação ou edição.
function openReviewDialog(appointment, avaliacaoExistente = null) {
    if (!reviewModal || !reviewsLoaded) {
        return;
    }

    reviewDialog = {
        appointment,
        avaliacao: avaliacaoExistente
    };

    selectedRating = avaliacaoExistente
        ? Number(avaliacaoExistente.nota)
        : 0;

    if (reviewModalTitle) {
        if (avaliacaoExistente) {
            reviewModalTitle.textContent = "Editar Avaliação";
        } else {
            reviewModalTitle.textContent =
                currentUser.role === "provider"
                    ? "Avaliar Cliente"
                    : "Avaliar Serviço";
        }
    }

    if (reviewServiceName) {
        reviewServiceName.textContent =
            formatarNomeServico(appointment.service_name);
    }

    if (reviewTargetName) {
        reviewTargetName.textContent =
            currentUser.role === "provider"
                ? appointment.client_name || "—"
                : appointment.provider_name || "—";
    }

    if (reviewComment) {
        reviewComment.value = avaliacaoExistente
            ? avaliacaoExistente.comentario || ""
            : "";
    }

    limparErroAvaliacao();

    reviewModal.classList.add("active");
    reviewModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    updateRatingStars();
}

// Fecha o modal e limpa os campos.
function closeReviewDialog() {
    if (!reviewModal) {
        return;
    }

    reviewModal.classList.remove("active");
    reviewModal.setAttribute("aria-hidden", "true");

    reviewDialog = null;
    selectedRating = 0;

    document.body.style.overflow = "";

    if (reviewComment) {
        reviewComment.value = "";
    }

    limparErroAvaliacao();
    updateRatingStars();
}

// Limpa a mensagem de erro.
function limparErroAvaliacao() {
    if (!reviewError) {
        return;
    }

    reviewError.textContent = "";
    reviewError.hidden = true;
    reviewError.classList.remove("active");
}

// Exibe uma mensagem de erro.
function mostrarErroAvaliacao(texto) {
    if (!reviewError) {
        return;
    }

    reviewError.textContent = texto;
    reviewError.hidden = false;
    reviewError.classList.add("active");
}

// Eventos para fechar o modal.
if (closeReviewModal) {
    closeReviewModal.addEventListener("click", closeReviewDialog);
}

if (reviewModal) {
    reviewModal.addEventListener("click", (event) => {
        if (event.target === reviewModal) {
            closeReviewDialog();
        }
    });
}

document.addEventListener("keydown", (event) => {
    if (
        event.key === "Escape" &&
        reviewModal &&
        reviewModal.classList.contains("active")
    ) {
        closeReviewDialog();
    }
});

// Atualiza a aparência das estrelas.
function highlightStars(rating) {
    ratingButtons.forEach((button) => {
        const valor = Number(button.dataset.rating);
        const selecionada = valor <= rating;

        button.textContent = selecionada ? "★" : "☆";
        button.classList.toggle("active", selecionada);

        button.setAttribute(
            "aria-pressed",
            String(valor === selectedRating)
        );
    });
}

function updateRatingStars() {
    highlightStars(selectedRating);
}

// Eventos das estrelas de avaliação.
ratingButtons.forEach((button) => {
    button.addEventListener("click", () => {
        if (submittingReview) {
            return;
        }

        selectedRating = Number(button.dataset.rating);

        updateRatingStars();
        limparErroAvaliacao();
    });

    button.addEventListener("mouseenter", () => {
        if (!submittingReview) {
            highlightStars(Number(button.dataset.rating));
        }
    });
});

if (ratingStars) {
    ratingStars.addEventListener("mouseleave", updateRatingStars);
}

// Envia uma avaliação nova ou atualiza uma existente.
async function submitReview() {
    if (!reviewDialog || submittingReview) {
        return;
    }

    if (!reviewsLoaded || !csrfToken) {
        mostrarErroAvaliacao(
            "Não foi possível validar a segurança do envio. Atualize a página e tente novamente."
        );
        return;
    }

    if (selectedRating < 1 || selectedRating > 5) {
        mostrarErroAvaliacao(
            "Selecione uma nota de 1 a 5 estrelas."
        );
        return;
    }

    const comentario = reviewComment
        ? reviewComment.value.trim()
        : "";

    const avaliacaoExistente = reviewDialog.avaliacao;

    const dadosEnvio = {
        acao: avaliacaoExistente ? "editar" : "salvar",
        id_agendamento: reviewDialog.appointment.id,
        nota: selectedRating,
        comentario: comentario,
        csrf_token: csrfToken
    };

    if (avaliacaoExistente) {
        dadosEnvio.id_avaliacao = avaliacaoExistente.id_avaliacao;
    }

    submittingReview = true;

    if (submitReviewButton) {
        submitReviewButton.disabled = true;
        submitReviewButton.setAttribute("aria-busy", "true");
    }

    try {
        const resposta = await fetch("../php/avaliacoes.php", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-CSRF-Token": csrfToken
            },
            body: JSON.stringify(dadosEnvio)
        });

        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(
                resultado.mensagem ||
                "Não foi possível salvar a avaliação."
            );
        }

        const mensagemSucesso = resultado.mensagem ||
            "Avaliação registrada com sucesso.";

        closeReviewDialog();

        // Atualiza os dados reais para refletir o resultado do banco.
        await carregarAvaliacoes();

        renderHistory();

        if (!reviewsLoaded) {
            showToast(
                "Avaliação salva, mas não foi possível atualizar a listagem. Recarregue a página."
            );
        } else {
            showToast(mensagemSucesso);
        }

    } catch (erro) {
        console.error("Erro ao enviar avaliação:", erro);

        mostrarErroAvaliacao(
            erro.message ||
            "Ocorreu um erro ao enviar sua avaliação."
        );

    } finally {
        submittingReview = false;

        if (submitReviewButton) {
            submitReviewButton.disabled = false;
            submitReviewButton.removeAttribute("aria-busy");
        }
    }
}

if (submitReviewButton) {
    submitReviewButton.addEventListener("click", submitReview);
}

// Exibe uma notificação temporária.
function showToast(message) {
    const toast = document.createElement("div");

    toast.textContent = message;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    Object.assign(toast.style, {
        position: "fixed",
        bottom: "25px",
        right: "25px",
        zIndex: "2500",
        padding: "12px 18px",
        borderRadius: "8px",
        background: "#16804a",
        color: "#ffffff",
        fontSize: "14px",
        boxShadow: "0 5px 20px rgba(0, 0, 0, 0.15)"
    });

    document.body.appendChild(toast);

    window.setTimeout(() => {
        toast.remove();
    }, 2500);
}

// Formata a data em português brasileiro.
function formatDate(dateString) {
    if (!dateString) {
        return "—";
    }

    const data = new Date(`${dateString}T00:00:00`);

    if (Number.isNaN(data.getTime())) {
        return "—";
    }

    return data.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

// Formata o valor em reais.
function formatarPreco(valor) {
    const numero = Number(valor);

    if (!Number.isFinite(numero)) {
        return "0,00";
    }

    return numero.toFixed(2).replace(".", ",");
}

// Impede que os valores sejam interpretados como HTML.
function escapeHTML(valor) {
    const elemento = document.createElement("div");

    elemento.textContent = valor == null ? "" : String(valor);

    return elemento.innerHTML;
}

// Inicializa o histórico.
async function initHistory() {
    mostrarCarregamento(true);
    mostrarHistoricoVazio(false);

    await loadData();
    renderHistory();
}

initHistory();
