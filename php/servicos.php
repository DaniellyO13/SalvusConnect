<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/conexao.php';

function responder(int $codigo, array $dados): void
{
    http_response_code($codigo);

    echo json_encode(
        $dados,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
    );

    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        header('Allow: GET');

        responder(405, [
            'sucesso' => false,
            'mensagem' => 'Método de requisição não permitido.'
        ]);
    }

    if (isset($_GET['id'])) {
        if (!is_scalar($_GET['id'])) {
            responder(400, [
                'sucesso' => false,
                'mensagem' => 'Identificador de serviço inválido.'
            ]);
        }

        $idServico = filter_var(
            $_GET['id'],
            FILTER_VALIDATE_INT
        );

        if ($idServico === false || $idServico === null || $idServico < 1) {
            responder(400, [
                'sucesso' => false,
                'mensagem' => 'Identificador de serviço inválido.'
            ]);
        }

        $consulta = $conexao->prepare("
            SELECT
                id_servico AS id,
                nm_servico AS titulo,
                ds_descricao AS descricao,
                nr_duracao_minutos AS duracao
            FROM tb_servicos
            WHERE id_servico = :id
            LIMIT 1
        ");

        $consulta->execute([
            ':id' => $idServico
        ]);

        $servico = $consulta->fetch(PDO::FETCH_ASSOC);

        if (!$servico) {
            responder(404, [
                'sucesso' => false,
                'mensagem' => 'Serviço não encontrado.'
            ]);
        }

        $servico['id'] = (int) $servico['id'];
        $servico['duracao'] = (int) $servico['duracao'];

        responder(200, $servico);
    }

    $consulta = $conexao->query("
        SELECT
            id_servico AS id,
            nm_servico AS titulo,
            ds_descricao AS descricao,
            nr_duracao_minutos AS duracao
        FROM tb_servicos
        ORDER BY nm_servico ASC
    ");

    $servicos = $consulta->fetchAll(PDO::FETCH_ASSOC);

    foreach ($servicos as &$servico) {
        $servico['id'] = (int) $servico['id'];
        $servico['duracao'] = (int) $servico['duracao'];
    }

    unset($servico);

    responder(200, $servicos);

} catch (Throwable $erro) {
    error_log(
        'Erro ao consultar serviços: ' . $erro->getMessage()
    );

    responder(500, [
        'sucesso' => false,
        'mensagem' => 'Não foi possível carregar os serviços.'
    ]);
}
