<?php

declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function responder(int $codigo, array $dados): void
{
    http_response_code($codigo);

    echo json_encode(
        $dados,
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );

    exit;
}

if (
    !isset($_SESSION['id_usuario']) ||
    !isset($_SESSION['cd_tipo_usuario'])
) {
    responder(401, [
        'sucesso' => false,
        'mensagem' => 'Sua sessão expirou. Entre novamente.'
    ]);
}

$idUsuario = (int) $_SESSION['id_usuario'];
$tipoUsuario = (int) $_SESSION['cd_tipo_usuario'];

if (!in_array($tipoUsuario, [0, 1, 3], true)) {
    responder(403, [
        'sucesso' => false,
        'mensagem' => 'Perfil não autorizado a acessar esta lista.'
    ]);
}

try {
    require_once __DIR__ . '/conexao.php';

    $sql = "
        SELECT
            a.id_agendamento,
            a.st_agendamento,
            a.hr_horario,
            a.ds_local_busca,
            a.ds_local_entrega,
            a.tb_usuario_id_usuario,
            a.tb_prestador_id_usuario,
            s.nm_servico,
            s.ds_descricao,
            s.nr_duracao_minutos,
            cliente.nm_nome AS nm_cliente,
            prestador.nm_nome AS nm_prestador,
            CASE
                WHEN a.tb_usuario_id_usuario = :id_cliente_nome
                    THEN COALESCE(
                        prestador.nm_nome,
                        'Prestador ainda não definido'
                    )
                ELSE cliente.nm_nome
            END AS outra_pessoa
        FROM tb_agendamento AS a
        LEFT JOIN tb_servicos AS s
            ON s.id_servico = a.tb_servicos_id_servico
        LEFT JOIN tb_usuario AS cliente
            ON cliente.id_usuario = a.tb_usuario_id_usuario
        LEFT JOIN tb_usuario AS prestador
            ON prestador.id_usuario = a.tb_prestador_id_usuario
        WHERE LOWER(TRIM(a.st_agendamento)) <> 'cancelado'
    ";

    $parametros = [
        ':id_cliente_nome' => $idUsuario
    ];

    // Administrador: visualiza todos os agendamentos.
    if ($tipoUsuario !== 0) {
        $sql .= "
            AND (
                a.tb_usuario_id_usuario = :id_cliente_filtro
                OR a.tb_prestador_id_usuario = :id_prestador_filtro
            )
        ";

        $parametros[':id_cliente_filtro'] = $idUsuario;
        $parametros[':id_prestador_filtro'] = $idUsuario;
    }

    $sql .= "
        ORDER BY
            a.hr_horario IS NULL,
            a.hr_horario ASC,
            a.id_agendamento DESC
    ";

    $consulta = $conexao->prepare($sql);
    $consulta->execute($parametros);

    responder(200, [
        'sucesso' => true,
        'agendamentos' => $consulta->fetchAll(PDO::FETCH_ASSOC)
    ]);

} catch (Throwable $erro) {
    error_log(
        'Erro ao listar agendamentos: ' . $erro->getMessage()
    );

    responder(500, [
        'sucesso' => false,
        'mensagem' => 'Não foi possível carregar os agendamentos.'
    ]);
}