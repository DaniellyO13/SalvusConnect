<?php

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');

$idUsuario = $_SESSION['id_usuario'] ?? null;
$tipoUsuario = $_SESSION['cd_tipo_usuario'] ?? null;

if (
    !is_numeric($idUsuario) ||
    (int) $idUsuario <= 0 ||
    !in_array((int) $tipoUsuario, [0, 1, 3], true)
) {
    http_response_code(401);

    echo json_encode([
        'sucesso' => false,
        'mensagem' => 'Sua sessão expirou. Entre novamente.'
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);

    exit;
}

echo json_encode([
    'sucesso' => true,
    'usuario' => [
        'id_usuario' => (int) $idUsuario,
        'nm_nome' => $_SESSION['nm_nome'] ?? '',
        'email' => $_SESSION['email'] ?? '',
        'cd_tipo_usuario' => (int) $tipoUsuario
    ]
], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
