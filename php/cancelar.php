<?php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');

function responder(int $codigo, array $dados): void
{
    http_response_code($codigo);

    echo json_encode(
        $dados,
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );

    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');

    responder(405, [
        'sucesso' => false,
        'mensagem' => 'Método não permitido.'
    ]);
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

// Validação do token CSRF enviado pelo agendamentos.js.
$tokenSessao = $_SESSION['csrf_token'] ?? '';
$tokenRecebido = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';

if (
    !is_string($tokenSessao) ||
    $tokenSessao === '' ||
    !is_string($tokenRecebido) ||
    $tokenRecebido === '' ||
    !hash_equals($tokenSessao, $tokenRecebido)
) {
    responder(403, [
        'sucesso' => false,
        'mensagem' => 'Não foi possível validar a segurança da operação. Atualize a página e tente novamente.'
    ]);
}

$idUsuario = (int) $_SESSION['id_usuario'];
$tipoUsuario = (int) $_SESSION['cd_tipo_usuario'];

if (!in_array($tipoUsuario, [1, 3], true)) {
    responder(403, [
        'sucesso' => false,
        'mensagem' => 'Seu perfil não pode cancelar agendamentos.'
    ]);
}

$entrada = json_decode(
    file_get_contents('php://input'),
    true
);

if (!is_array($entrada)) {
    responder(400, [
        'sucesso' => false,
        'mensagem' => 'Os dados enviados são inválidos.'
    ]);
}

$idAgendamento = filter_var(
    $entrada['id_agendamento'] ?? null,
    FILTER_VALIDATE_INT
);

if (
    $idAgendamento === false ||
    $idAgendamento === null ||
    $idAgendamento < 1
) {
    responder(400, [
        'sucesso' => false,
        'mensagem' => 'Identificador do agendamento inválido.'
    ]);
}

try {
    require_once __DIR__ . '/conexao.php';

    if (!isset($conexao) || !$conexao instanceof PDO) {
        throw new RuntimeException('Conexão PDO indisponível.');
    }

    /*
     * Cliente: cancela somente os próprios agendamentos.
     * Prestador: cancela somente os agendamentos atribuídos a ele.
     */
    if ($tipoUsuario === 3) {
        $condicaoUsuario = 'tb_usuario_id_usuario = :id_usuario';
    } else {
        $condicaoUsuario = 'tb_prestador_id_usuario = :id_usuario';
    }

    /*
     * Só permite cancelar enquanto:
     * - o status estiver pendente ou confirmado;
     * - o horário do atendimento ainda não tiver chegado.
     */
    $sql = "
        UPDATE tb_agendamento
        SET st_agendamento = 'cancelado'
        WHERE id_agendamento = :id_agendamento
          AND {$condicaoUsuario}
          AND LOWER(TRIM(st_agendamento))
              IN ('pendente', 'aceito', 'agendado')
          AND hr_horario IS NOT NULL
          AND hr_horario > NOW()
    ";

    $consulta = $conexao->prepare($sql);

    $consulta->execute([
        ':id_agendamento' => (int) $idAgendamento,
        ':id_usuario' => $idUsuario
    ]);

    if ($consulta->rowCount() > 0) {
        responder(200, [
            'sucesso' => true,
            'mensagem' => 'Agendamento cancelado com sucesso.',
            'id_agendamento' => (int) $idAgendamento,
            'st_agendamento' => 'cancelado'
        ]);
    }

    /*
     * Se a atualização não ocorreu, verifica o motivo.
     */
    $verificacao = $conexao->prepare("
        SELECT
            id_agendamento,
            st_agendamento,
            hr_horario,
            (
                hr_horario IS NOT NULL
                AND hr_horario > NOW()
            ) AS horario_futuro
        FROM tb_agendamento
        WHERE id_agendamento = :id_agendamento
          AND {$condicaoUsuario}
        LIMIT 1
    ");

    $verificacao->execute([
        ':id_agendamento' => (int) $idAgendamento,
        ':id_usuario' => $idUsuario
    ]);

    $agendamento = $verificacao->fetch(PDO::FETCH_ASSOC);

    if (!$agendamento) {
        responder(404, [
            'sucesso' => false,
            'mensagem' => 'Agendamento não encontrado ou sem autorização para cancelá-lo.'
        ]);
    }

    $statusAtual = strtolower(
        trim((string) $agendamento['st_agendamento'])
    );

    if ($statusAtual === 'cancelado') {
        responder(200, [
            'sucesso' => true,
            'mensagem' => 'Este agendamento já estava cancelado.',
            'id_agendamento' => (int) $idAgendamento,
            'st_agendamento' => 'cancelado'
        ]);
    }

    if (
        in_array(
            $statusAtual,
            ['pendente', 'aceito', 'agendado'],
            true
        ) &&
        (int) $agendamento['horario_futuro'] !== 1
    ) {
        responder(409, [
            'sucesso' => false,
            'mensagem' => 'O horário do atendimento já chegou ou passou. Não é mais possível cancelar.'
        ]);
    }

    responder(409, [
        'sucesso' => false,
        'mensagem' => 'Este agendamento não pode ser cancelado no status atual.'
    ]);

} catch (Throwable $erro) {
    error_log(
        'Erro ao cancelar agendamento: ' . $erro->getMessage()
    );

    responder(500, [
        'sucesso' => false,
        'mensagem' => 'Não foi possível cancelar o agendamento. Tente novamente.'
    ]);
}
