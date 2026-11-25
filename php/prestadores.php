<?php

session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

function responder(int $codigo, array $dados): void
{
    http_response_code($codigo);

    echo json_encode(
        $dados,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    exit;
}

// Verifica se o usuário está autenticado.
if (
    !isset($_SESSION['id_usuario']) ||
    !isset($_SESSION['cd_tipo_usuario'])
) {
    responder(401, [
        'sucesso' => false,
        'mensagem' => 'É necessário realizar o login.'
    ]);
}

try {
    require_once __DIR__ . '/conexao.php';

    // Consulta somente prestadores cujo antecedente mais recente foi aprovado.
    $sql = "
        SELECT
            u.id_usuario AS id,
            u.nm_nome AS nome,
            u.ds_sobre_mim AS descricao,

            (
                SELECT t.nr_telefone
                FROM tb_telefone t
                WHERE t.tb_usuario_id_usuario = u.id_usuario
                ORDER BY t.id_telefone ASC
                LIMIT 1
            ) AS telefone

        FROM tb_usuario u

        WHERE u.cd_tipo_usuario = 1

          AND EXISTS (
              SELECT 1
              FROM tb_antecedentes a
              WHERE a.tb_usuario_id_usuario = u.id_usuario
                AND a.id_antecedente = (
                    SELECT MAX(a2.id_antecedente)
                    FROM tb_antecedentes a2
                    WHERE a2.tb_usuario_id_usuario = u.id_usuario
                )
                AND a.st_analise = 'APROVADO'
                AND a.dt_envio IS NOT NULL
          )

        ORDER BY u.nm_nome ASC
    ";

    $consulta = $conexao->prepare($sql);
    $consulta->execute();

    $prestadores = $consulta->fetchAll(PDO::FETCH_ASSOC);

    responder(200, [
        'sucesso' => true,
        'prestadores' => $prestadores
    ]);

} catch (Throwable $erro) {
    error_log(
        'Erro ao carregar prestadores do SalvusConnect: ' .
        $erro->getMessage()
    );

    responder(500, [
        'sucesso' => false,
        'mensagem' => 'Não foi possível carregar os prestadores.'
    ]);
}
