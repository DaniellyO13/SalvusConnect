<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

http_response_code(410);

echo json_encode(
    [
        'sucesso' => false,
        'mensagem' => 'A recuperação por e-mail foi desativada. Utilize a nova tela de redefinição de senha do SalvusConnect.'
    ],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);

exit;
