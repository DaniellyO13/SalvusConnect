<?php
declare(strict_types=1);

// Configura a resposta como JSON.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

// Retorna uma resposta padronizada.
function responderLogout(int $codigo, array $dados): void
{
    http_response_code($codigo);

    echo json_encode(
        $dados,
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );

    exit;
}

try {

    // Permite somente requisições POST.
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        header('Allow: POST');

        responderLogout(405, [
            'sucesso' => false,
            'mensagem' => 'Método de requisição não permitido.'
        ]);
    }

    // Inicia a sessão, caso ainda não esteja ativa.
    if (session_status() !== PHP_SESSION_ACTIVE) {

        if (!session_start()) {
            throw new RuntimeException('Não foi possível iniciar a sessão.');
        }
    }

    // Guarda os parâmetros antes de encerrar a sessão.
    $parametros = session_get_cookie_params();
    $nomeCookie = session_name();

    // Limpa todos os dados armazenados na sessão.
    $_SESSION = [];

    // Remove o cookie da sessão no navegador.
    if (ini_get('session.use_cookies')) {

        $opcoesCookie = [
            'expires' => time() - 42000,
            'path' => $parametros['path'],
            'secure' => (bool) $parametros['secure'],
            'httponly' => (bool) $parametros['httponly'],
            'samesite' => $parametros['samesite'] ?? 'Lax'
        ];

        if (!empty($parametros['domain'])) {
            $opcoesCookie['domain'] = $parametros['domain'];
        }

        if (!setcookie($nomeCookie, '', $opcoesCookie)) {
            throw new RuntimeException('Não foi possível remover o cookie da sessão.');
        }
    }

    // Destrói a sessão no servidor.
    if (session_status() === PHP_SESSION_ACTIVE) {

        if (!session_destroy()) {
            throw new RuntimeException('Não foi possível encerrar a sessão.');
        }
    }

    // Confirma o encerramento para o JavaScript.
    responderLogout(200, [
        'sucesso' => true,
        'mensagem' => 'Sessão encerrada com sucesso.',
        'redirect' => '../pages/login.html'
    ]);

} catch (Throwable $erro) {

    // Registra o erro para análise no log do PHP.
    error_log('Erro no logout.php: ' . $erro->getMessage());

    responderLogout(500, [
        'sucesso' => false,
        'mensagem' => 'Não foi possível encerrar a sessão. Tente novamente.'
    ]);
}
