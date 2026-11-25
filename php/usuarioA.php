<?php

session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

if (!isset($_SESSION['id_usuario'])) {
    http_response_code(401);

    echo json_encode([
        'sucesso' => false,
        'mensagem' => 'Sessão não encontrada.'
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

require_once __DIR__ . '/conexao.php';

try {
    $sql = '
        SELECT
            id_usuario,
            nm_nome,
            email,
            cd_tipo_usuario
        FROM tb_usuario
        WHERE id_usuario = :id_usuario
        LIMIT 1
    ';

    $consulta = $conexao->prepare($sql);

    $consulta->execute([
        'id_usuario' => (int) $_SESSION['id_usuario']
    ]);

    $usuario = $consulta->fetch();

    if (!$usuario) {
        http_response_code(401);

        echo json_encode([
            'sucesso' => false,
            'mensagem' => 'Usuário não encontrado.'
        ], JSON_UNESCAPED_UNICODE);

        exit;
    }

    // Atualiza os dados da sessão com os valores do banco.
    $_SESSION['nm_nome'] = $usuario['nm_nome'];
    $_SESSION['email'] = $usuario['email'];
    $_SESSION['cd_tipo_usuario'] = (int) $usuario['cd_tipo_usuario'];

    echo json_encode([
        'sucesso' => true,
        'usuario' => [
            'id_usuario' => (int) $usuario['id_usuario'],
            'nm_nome' => $usuario['nm_nome'],
            'email' => $usuario['email'],
            'cd_tipo_usuario' => (int) $usuario['cd_tipo_usuario']
        ]
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $erro) {
    error_log('Erro ao consultar usuário atual: ' . $erro->getMessage());

    http_response_code(500);

    echo json_encode([
        'sucesso' => false,
        'mensagem' => 'Não foi possível carregar os dados do usuário.'
    ], JSON_UNESCAPED_UNICODE);
}