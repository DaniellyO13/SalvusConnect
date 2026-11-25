// SALVUSCONNECT — MENSAGENS

const API_CHAT = "../php/chat.php";

let activeConversation = null;
let currentUser = {
    id: null,
    name: "Usuário",
    role: "client"
};

let conversations = [];
let archivedConversations = [];
let messages = [];
let csrfToken = null;

const QUICK_MESSAGES_CLIENT = [
    "Olá! 👋",
    "Estou aguardando um retorno.",
    "Já estou no local.",
    "Tudo certo!"
];

const QUICK_MESSAGES_PROVIDER = [
    "Olá! 👋",
    "Estou a caminho.",
    "Cheguei ao local.",
    "Tudo certo!"
];

const elements = {};

document.addEventListener("DOMContentLoaded", initChat);

// INICIALIZAÇÃO

async function initChat() {
    elements.layout = document.querySelector(".messages-layout");

    elements.conversationsList = document.getElementById("conversations-list");
    elements.conversationsCount = document.getElementById("conversations-count");
    elements.emptyConversations = document.getElementById("empty-conversations");

    elements.chatPanel = document.getElementById("chat-panel");
    elements.emptyChat = document.getElementById("empty-chat");
    elements.chatContent = document.getElementById("chat-content");

    elements.chatAvatar = document.getElementById("chat-avatar");
    elements.chatContactName = document.getElementById("chat-contact-name");
    elements.chatContactStatus = document.getElementById("chat-contact-status");

    elements.chatMessages = document.getElementById("chat-messages");
    elements.emptyConversationMessages = document.getElementById(
        "empty-conversation-messages"
    );

    elements.messageForm = document.getElementById("message-form");
    elements.messageInput = document.getElementById("message-input");
    elements.sendButton = document.getElementById("send-message");

    elements.blockedWarning = document.getElementById("blocked-warning");

    elements.quickMessagesButton = document.getElementById(
        "quick-messages-button"
    );

    elements.quickMessages = document.getElementById("quick-messages");

    elements.backToConversations = document.getElementById(
        "back-to-conversations"
    );

    if (
        !elements.layout ||
        !elements.conversationsList ||
        !elements.chatMessages ||
        !elements.messageForm ||
        !elements.messageInput
    ) {
        console.error(
            "Não foi possível inicializar o chat: elementos necessários não encontrados."
        );
        return;
    }

    bindEvents();
    setChatAvailability(false);

    if (window.lucide) {
        window.lucide.createIcons();
    }

    await initializeChatData();
}

async function initializeChatData() {
    try {
        await loadSessionData();
        await loadConversations();

        renderConversations();
        renderQuickMessages();
    } catch (error) {
        console.error("Erro ao inicializar o chat:", error);

        showChatError(
            error.message || "Não foi possível carregar suas conversas."
        );
    }
}

// COMUNICAÇÃO COM O SERVIDOR

async function requestChat(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
        ...options,
        headers: {
            ...(options.headers || {})
        }
    });

    let data;

    try {
        data = await response.json();
    } catch (error) {
        throw new Error("O servidor retornou uma resposta inválida.");
    }

    if (!response.ok || !data.sucesso) {
        throw new Error(
            data.mensagem || "Não foi possível concluir a operação."
        );
    }

    return data;
}

async function loadSessionData() {
    const data = await requestChat(`${API_CHAT}?acao=csrf`);

    csrfToken = data.csrf_token;

    if (!csrfToken) {
        throw new Error("Não foi possível obter o token de segurança.");
    }
}

async function loadConversations() {
    const data = await requestChat(`${API_CHAT}?acao=listar`);

    if (
        !data.usuario ||
        !data.usuario.id ||
        ![1, 3].includes(Number(data.usuario.tipo))
    ) {
        throw new Error(
            "Não foi possível identificar o usuário autenticado."
        );
    }

    currentUser.id = Number(data.usuario.id);

    currentUser.role =
        Number(data.usuario.tipo) === 1
            ? "provider"
            : "client";

    conversations = Array.isArray(data.conversas)
        ? data.conversas
        : [];

    archivedConversations = Array.isArray(data.arquivadas)
        ? data.arquivadas
        : [];

    notificarAtualizacaoMensagens();
}

/*
 * Comunica ao menu se ainda existem mensagens não visualizadas.
 * O sidebar.js poderá utilizar esse evento para atualizar a bolinha.
 */

function notificarAtualizacaoMensagens() {
    const existemMensagensNaoLidas = conversations.some(
        (conversation) => conversation.unread === true
    );

    window.dispatchEvent(
        new CustomEvent("salvus:mensagens-atualizadas", {
            detail: {
                naoLidas: existemMensagensNaoLidas
            }
        })
    );
}

// EVENTOS

function bindEvents() {
    elements.messageForm.addEventListener("submit", (event) => {
        event.preventDefault();
        sendMessage(elements.messageInput.value);
    });

    elements.messageInput.addEventListener("input", () => {
        hideBlockedWarning();
    });

    elements.quickMessagesButton.addEventListener(
        "click",
        toggleQuickMessages
    );

    elements.backToConversations.addEventListener("click", () => {
        closeMobileConversation();
    });
}

// LISTA DE CONVERSAS

function renderConversations() {
    elements.conversationsList.replaceChildren();

    const validConversations = [
        ...conversations,
        ...archivedConversations
    ].filter((conversation) => {
        return (
            conversation &&
            conversation.id &&
            conversation.name &&
            conversation.id_agendamento
        );
    });

    elements.conversationsCount.textContent = String(
        validConversations.length
    );

    const hasConversations = validConversations.length > 0;

    elements.conversationsList.hidden = !hasConversations;
    elements.emptyConversations.hidden = hasConversations;

    if (!hasConversations) {
        if (window.lucide) {
            window.lucide.createIcons();
        }

        return;
    }

    const sortedConversations = [...validConversations].sort((a, b) => {
        return (
            new Date(b.updatedAt || 0).getTime() -
            new Date(a.updatedAt || 0).getTime()
        );
    });

    sortedConversations.forEach((conversation) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "conversation-item";

        button.setAttribute(
            "aria-label",
            `Abrir conversa com ${conversation.name}`
        );

        const isActive =
            activeConversation &&
            activeConversation.id === conversation.id;

        if (isActive) {
            button.classList.add("active");
            button.setAttribute("aria-current", "true");
        }

        const isArchived = conversation.archived === true;

        const avatar = document.createElement("div");
        avatar.className = "conversation-avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = getInitials(conversation.name);

        const info = document.createElement("div");
        info.className = "conversation-info";

        const name = document.createElement("span");
        name.className = "conversation-name";
        name.textContent = conversation.name;

        const preview = document.createElement("span");
        preview.className = "conversation-preview";

        const lastMessage = conversation.lastMessage || "Sem mensagens";

        preview.textContent = isArchived
            ? `Atendimento concluído · ${lastMessage}`
            : lastMessage;

        info.append(name, preview);
        button.append(avatar, info);

        button.addEventListener("click", () => {
            openConversation(conversation.id);
        });

        elements.conversationsList.appendChild(button);
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ABRIR E FECHAR CONVERSAS

async function openConversation(conversationId) {
    const conversation = conversations.find(
        (item) => item.id === conversationId
    );

    const archivedConversation = archivedConversations.find(
        (item) => item.id === conversationId
    );

    const selectedConversation =
        conversation || archivedConversation;

    if (!selectedConversation) {
        return;
    }

    activeConversation = selectedConversation;
    messages = [];

    elements.emptyChat.hidden = true;
    elements.chatContent.hidden = false;

    elements.chatContactName.textContent = selectedConversation.name;

    elements.chatAvatar.textContent = getInitials(
        selectedConversation.name
    );

    elements.chatAvatar.setAttribute(
        "aria-label",
        selectedConversation.name
    );

    elements.layout.classList.add("mobile-chat-open");

    hideBlockedWarning();
    hideChatError();
    closeQuickMessages();

    const isArchived = selectedConversation.archived === true;

    elements.chatContactStatus.textContent = isArchived
        ? "Atendimento concluído"
        : "Conversa disponível";

    setChatAvailability(!isArchived);

    renderConversations();
    renderMessages();

    try {
        await loadMessages(selectedConversation);
    } catch (error) {
        console.error("Erro ao carregar mensagens:", error);
        showChatError(error.message);
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }

    if (window.matchMedia("(max-width: 768px)").matches) {
        elements.chatPanel.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }

    if (!activeConversation?.archived) {
        elements.messageInput.focus({ preventScroll: true });
    }
}

async function loadMessages(conversation) {
    const idAgendamento = Number(conversation.id_agendamento);

    const data = await requestChat(
        `${API_CHAT}?acao=mensagens&id_agendamento=${encodeURIComponent(idAgendamento)}`
    );

    if (
        !activeConversation ||
        activeConversation.id !== conversation.id
    ) {
        return;
    }

    messages = Array.isArray(data.mensagens)
        ? data.mensagens
        : [];

    const isArchived = data.arquivada === true;

    activeConversation.status = data.status;
    activeConversation.archived = isArchived;

    elements.chatContactStatus.textContent = isArchived
        ? "Atendimento concluído"
        : "Conversa disponível";

    setChatAvailability(!isArchived);

    renderMessages();

    /*
     * O chat.php registra a visualização no servidor
     * durante o carregamento bem-sucedido do histórico.
     *
     * Atualizamos a lista em seguida para receber o estado
     * atualizado de mensagens não visualizadas.
     */

    await loadConversations();

    const conversaAtualizada = [
        ...conversations,
        ...archivedConversations
    ].find((item) => item.id === conversation.id);

    if (conversaAtualizada) {
        activeConversation = conversaAtualizada;
        activeConversation.status = data.status;
        activeConversation.archived = isArchived;
    }

    renderConversations();
}

function closeMobileConversation() {
    elements.layout.classList.remove("mobile-chat-open");
}

function setChatAvailability(enabled) {
    elements.messageInput.disabled = !enabled;
    elements.sendButton.disabled = !enabled;
    elements.quickMessagesButton.disabled = !enabled;

    if (!enabled) {
        closeQuickMessages();
    }
}

// EXIBIR MENSAGENS

function renderMessages() {
    elements.chatMessages.replaceChildren();

    if (!activeConversation) {
        showEmptyConversationMessages(true);
        return;
    }

    const conversationMessages = messages
        .filter((message) => {
            return (
                message.conversationId === activeConversation.id ||
                !message.conversationId
            );
        })
        .sort((a, b) => {
            return (
                new Date(a.createdAt || 0).getTime() -
                new Date(b.createdAt || 0).getTime()
            );
        });

    if (conversationMessages.length === 0) {
        showEmptyConversationMessages(true);
        return;
    }

    showEmptyConversationMessages(false);

    conversationMessages.forEach((message) => {
        const messageElement = document.createElement("div");

        const isOwnMessage =
            Number(message.senderId) === currentUser.id;

        messageElement.className = isOwnMessage
            ? "message sent"
            : "message received";

        const bubble = document.createElement("div");
        bubble.className = "message-bubble";
        bubble.textContent = message.content || "";

        const time = document.createElement("span");
        time.className = "message-time";
        time.textContent = formatTime(message.createdAt);

        messageElement.append(bubble, time);
        elements.chatMessages.appendChild(messageElement);
    });

    scrollToBottom();
}

function showEmptyConversationMessages(show) {
    elements.emptyConversationMessages.hidden = !show;

    if (show && window.lucide) {
        window.lucide.createIcons();
    }
}

// ENVIAR MENSAGENS

async function sendMessage(content) {
    if (!activeConversation) {
        return;
    }

    const cleanMessage = String(content || "").trim();

    if (!cleanMessage) {
        return;
    }

    if (cleanMessage.length > 2000) {
        showChatError(
            "Sua mensagem ultrapassa o limite de 2.000 caracteres."
        );
        return;
    }

    if (containsSensitiveInfo(cleanMessage)) {
        showBlockedWarning();
        return;
    }

    if (activeConversation.archived === true) {
        showChatError(
            "Este atendimento foi concluído. O histórico está disponível apenas para consulta."
        );
        return;
    }

    hideBlockedWarning();
    hideChatError();

    const conversationId = activeConversation.id;
    const idAgendamento = Number(activeConversation.id_agendamento);

    elements.sendButton.disabled = true;

    try {
        const data = await requestChat(
            `${API_CHAT}?acao=enviar`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-TOKEN": csrfToken
                },
                body: JSON.stringify({
                    id_agendamento: idAgendamento,
                    mensagem: cleanMessage
                })
            }
        );

        if (!data.dados) {
            throw new Error("O servidor não confirmou o envio da mensagem.");
        }

        elements.messageInput.value = "";

        closeQuickMessages();

        if (
            activeConversation &&
            activeConversation.id === conversationId
        ) {
            messages.push(data.dados);
            renderMessages();
        }

        await loadConversations();
        renderConversations();

        if (
            activeConversation &&
            activeConversation.id === conversationId
        ) {
            elements.messageInput.focus({ preventScroll: true });
        }
    } catch (error) {
        console.error("Erro ao enviar mensagem:", error);
        showChatError(error.message);
    } finally {
        if (
            activeConversation &&
            activeConversation.archived !== true
        ) {
            elements.sendButton.disabled = false;
        }
    }
}

// PROTEÇÃO CONTRA DADOS DE CONTATO EXTERNO

function containsSensitiveInfo(text) {
    if (typeof text !== "string" || text.length > 10000) {
        return false;
    }

    const normalizedText = text.toLowerCase();

    const socialWords = [
        "instagram",
        "insta",
        "facebook",
        "telegram",
        "whatsapp",
        "whats"
    ];

    const hasSocialNetwork = socialWords.some((word) =>
        normalizedText.includes(word)
    );

    const digitsOnly = text.replace(/\D/g, "");

    const hasPhone =
        digitsOnly.length >= 10 &&
        digitsOnly.length <= 13;

    const hasEmailAddress = containsEmailAddress(text);

    const hasSocialHandle = text
        .split(/\s+/)
        .some((word) => /^@[a-zA-Z0-9._]{2,30}$/.test(word));

    return (
        hasPhone ||
        hasEmailAddress ||
        hasSocialNetwork ||
        hasSocialHandle
    );
}

// IDENTIFICAÇÃO DE E-MAIL SEM EXPRESSÃO REGULAR

function containsEmailAddress(text) {
    function isAsciiLetter(character) {
        const code = character.charCodeAt(0);

        return (
            (code >= 65 && code <= 90) ||
            (code >= 97 && code <= 122)
        );
    }

    function isAsciiLetterOrDigit(character) {
        const code = character.charCodeAt(0);

        return (
            isAsciiLetter(character) ||
            (code >= 48 && code <= 57)
        );
    }

    function isLocalCharacter(character) {
        return (
            isAsciiLetterOrDigit(character) ||
            "._%+-".includes(character)
        );
    }

    function isDomainCharacter(character) {
        return (
            isAsciiLetterOrDigit(character) ||
            ".-".includes(character)
        );
    }

    for (let atIndex = 0; atIndex < text.length; atIndex++) {
        if (text[atIndex] !== "@") {
            continue;
        }

        let localLength = 0;

        for (
            let index = atIndex - 1;
            index >= 0 && isLocalCharacter(text[index]);
            index--
        ) {
            localLength++;
        }

        if (localLength === 0) {
            continue;
        }

        let domainLength = 0;

        for (
            let index = atIndex + 1;
            index < text.length && isDomainCharacter(text[index]);
            index++
        ) {
            if (text[index] === "." && domainLength > 0) {
                let tldLength = 0;

                for (
                    let tldIndex = index + 1;
                    tldIndex < text.length &&
                    isAsciiLetter(text[tldIndex]);
                    tldIndex++
                ) {
                    tldLength++;
                }

                if (tldLength >= 2) {
                    return true;
                }
            }

            domainLength++;
        }
    }

    return false;
}

function showBlockedWarning() {
    elements.blockedWarning.hidden = false;

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function hideBlockedWarning() {
    if (elements.blockedWarning) {
        elements.blockedWarning.hidden = true;
    }
}

// RESPOSTAS RÁPIDAS

function renderQuickMessages() {
    elements.quickMessages.replaceChildren();

    const quickMessages =
        currentUser.role === "provider"
            ? QUICK_MESSAGES_PROVIDER
            : QUICK_MESSAGES_CLIENT;

    quickMessages.forEach((message) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "quick-message";
        button.textContent = message;

        button.addEventListener("click", () => {
            sendMessage(message);
        });

        elements.quickMessages.appendChild(button);
    });
}

function toggleQuickMessages() {
    if (
        !activeConversation ||
        activeConversation.archived === true
    ) {
        return;
    }

    const isExpanded =
        elements.quickMessagesButton.getAttribute("aria-expanded") === "true";

    if (isExpanded) {
        closeQuickMessages();
    } else {
        elements.quickMessages.hidden = false;

        elements.quickMessagesButton.setAttribute(
            "aria-expanded",
            "true"
        );

        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
}

function closeQuickMessages() {
    if (!elements.quickMessages || !elements.quickMessagesButton) {
        return;
    }

    elements.quickMessages.hidden = true;

    elements.quickMessagesButton.setAttribute(
        "aria-expanded",
        "false"
    );
}

// UTILITÁRIOS

function getInitials(name) {
    const words = String(name || "Usuário")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) {
        return "U";
    }

    if (words.length === 1) {
        return words[0].charAt(0).toUpperCase();
    }

    return (
        words[0].charAt(0) +
        words[words.length - 1].charAt(0)
    ).toUpperCase();
}

function formatTime(dateString) {
    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        elements.chatMessages.scrollTop =
            elements.chatMessages.scrollHeight;
    });
}

function showChatError(message) {
    if (!elements.chatPanel) {
        console.warn(message);
        return;
    }

    hideChatError();

    const error = document.createElement("div");
    error.className = "blocked-warning chat-error";
    error.setAttribute("role", "alert");
    error.textContent = message;
    error.dataset.chatError = "true";

    elements.chatPanel.appendChild(error);
}

function hideChatError() {
    if (!elements.chatPanel) {
        return;
    }

    const existingError = elements.chatPanel.querySelector(
        '[data-chat-error="true"]'
    );

    if (existingError) {
        existingError.remove();
    }
}
