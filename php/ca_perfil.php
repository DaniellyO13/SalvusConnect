<?php

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');

$idUsuario = $_SESSION['id_usuario'] ?? null;

if (
    !is_numeric($idUsuario) ||
    (int) $idUsuario <= 0
) {
    http_response_code(401);

    echo json_encode([
        'sucesso' => false,
        'mensagem' => 'Sua sessão expirou. Entre novamente.'
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);

    exit;
}

try {
    // Gera o token CSRF caso ainda não exista.
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    require_once __DIR__ . '/conexao.php';

    if (!isset($conexao) || !$conexao instanceof PDO) {
        throw new RuntimeException('Conexão PDO indisponível.');
    }

    $sql = "
        select
            u.id_usuario,
            u.nm_nome,
            u.nr_cpf,
            u.cnh,
            u.nm_tipo_cnh,
            u.email,
            u.cd_tipo_usuario,
            u.ds_sobre_mim,
            (
                select t.nr_telefone
                from tb_telefone t
                where t.tb_usuario_id_usuario = u.id_usuario
                order by
                    case
                        when lower(trim(coalesce(t.nm_tipo_telefone, '')))
                            in ('principal', 'telefone principal')
                        then 0
                        else 1
                    end,
                    t.id_telefone
                limit 1
            ) as nr_telefone
        from tb_usuario u
        where u.id_usuario = :id_usuario
        limit 1
    ";

    $consulta = $conexao->prepare($sql);

    $consulta->execute([
        'id_usuario' => (int) $idUsuario
    ]);

    $usuario = $consulta->fetch(PDO::FETCH_ASSOC);

    if (!$usuario) {
        http_response_code(404);

        echo json_encode([
            'sucesso' => false,
            'mensagem' => 'Usuário não encontrado.'
        ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);

        exit;
    }

    $tipos = [
        0 => 'Administrador',
        1 => 'Prestador',
        3 => 'Cliente'
    ];

    $usuario['cd_tipo_usuario'] =
        (int) $usuario['cd_tipo_usuario'];

    $usuario['tipo_usuario'] =
        $tipos[$usuario['cd_tipo_usuario']] ?? 'Usuário';

    // Dados do antecedente criminal do prestador.
    $antecedente = null;

    if ($usuario['cd_tipo_usuario'] === 1) {

        $consultaAntecedente = $conexao->prepare("
            SELECT
                id_antecedente,
                st_analise,
                dt_envio,
                DATE_ADD(dt_envio, INTERVAL 6 MONTH) AS dt_renovacao
            FROM tb_antecedentes
            WHERE tb_usuario_id_usuario = :id_usuario
            ORDER BY id_antecedente DESC
            LIMIT 1
        ");

        $consultaAntecedente->execute([
            'id_usuario' => (int) $idUsuario
        ]);

        $antecedente = $consultaAntecedente->fetch(PDO::FETCH_ASSOC);

        if ($antecedente) {
            $antecedente['id_antecedente'] =
                (int) $antecedente['id_antecedente'];
        }
    }

    $_SESSION['nm_nome'] = $usuario['nm_nome'];
    $_SESSION['email'] = $usuario['email'];
    $_SESSION['cd_tipo_usuario'] =
        $usuario['cd_tipo_usuario'];

    echo json_encode([
        'sucesso' => true,
        'usuario' => $usuario,
        'antecedente' => $antecedente,
        'csrf_token' => $_SESSION['csrf_token']
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);

} catch (Throwable $e) {
    error_log('Erro em ca_perfil.php: ' . $e->getMessage());

    http_response_code(500);

    echo json_encode([
        'sucesso' => false,
        'mensagem' => 'Não foi possível carregar os dados do perfil.'
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
}
