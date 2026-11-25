<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

function responder(int $status, array $dados): void
{
    http_response_code($status);

    echo json_encode(
        $dados,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    responder(405, [
        'sucesso' => false,
        'mensagem' => 'Método não permitido.'
    ]);
}

responder(410, [
    'sucesso' => false,
    'mensagem' => 'A redefinição permanente de senha ainda não está configurada. A validação dos campos está disponível na interface do SalvusConnect.'
]);
