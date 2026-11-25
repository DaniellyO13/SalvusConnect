<?php
declare(strict_types=1);

date_default_timezone_set('America/Sao_Paulo');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
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

function obterMarcador(string $comentario): ?array
{
    $padrao = '/^\[\[SC_AVALIACAO:v1:autor=(\d+):avaliado=(\d+)\]\]\n?(.*)$/s';

    if (!preg_match($padrao, $comentario, $correspondencia)) {
        return null;
    }

    return [
        'autor_id' => (int) $correspondencia[1],
        'avaliado_id' => (int) $correspondencia[2],
        'comentario' => $correspondencia[3]
    ];
}

function criarComentarioInterno(
    int $autorId,
    int $avaliadoId,
    string $comentario
): string {
    $marcador = "[[SC_AVALIACAO:v1:autor={$autorId}:avaliado={$avaliadoId}]]";

    if ($comentario !== '') {
        return $marcador . "\n" . $comentario;
    }

    return $marcador;
}

function validarIdentificadores(
    int $autorId,
    int $avaliadoId,
    int $clienteId,
    int $prestadorId
): bool {
    return (
        $autorId > 0 &&
        $avaliadoId > 0 &&
        $autorId !== $avaliadoId &&
        (
            ($autorId === $clienteId && $avaliadoId === $prestadorId) ||
            ($autorId === $prestadorId && $avaliadoId === $clienteId)
        )
    );
}

// --------------------------------------------------
// AUTENTICAÇÃO
// --------------------------------------------------

if (empty($_SESSION['id_usuario'])) {
    responder(401, [
        'sucesso' => false,
        'mensagem' => 'Você precisa estar autenticado.'
    ]);
}

$usuarioId = filter_var(
    $_SESSION['id_usuario'],
    FILTER_VALIDATE_INT
);

$tipoUsuario = (int) ($_SESSION['cd_tipo_usuario'] ?? -1);

if (!$usuarioId || !in_array($tipoUsuario, [1, 3], true)) {
    responder(403, [
        'sucesso' => false,
        'mensagem' => 'Seu perfil não possui permissão para utilizar as avaliações.'
    ]);
}

// --------------------------------------------------
// TOKEN CSRF
// --------------------------------------------------

if (
    empty($_SESSION['csrf_token']) ||
    !is_string($_SESSION['csrf_token'])
) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$acao = $_GET['acao'] ?? '';

if ($metodo === 'GET' && $acao === 'csrf') {
    responder(200, [
        'sucesso' => true,
        'csrf_token' => $_SESSION['csrf_token']
    ]);
}

// --------------------------------------------------
// CONEXÃO COM O BANCO
// --------------------------------------------------

require_once __DIR__ . '/conexao.php';

if (!isset($conexao) || !($conexao instanceof PDO)) {
    responder(500, [
        'sucesso' => false,
        'mensagem' => 'Não foi possível acessar o banco de dados.'
    ]);
}

// --------------------------------------------------
// LISTAR AVALIAÇÕES DE UM PRESTADOR
// --------------------------------------------------

if ($metodo === 'GET' && $acao === 'listar_prestador') {
    $prestadorId = filter_var(
        $_GET['id_prestador'] ?? null,
        FILTER_VALIDATE_INT
    );

    if (!$prestadorId || $prestadorId < 1) {
        responder(422, [
            'sucesso' => false,
            'mensagem' => 'Identificador do prestador inválido.'
        ]);
    }

    try {
        // Confirma que o identificador corresponde a um prestador.
        $consultaPrestador = $conexao->prepare("
            SELECT id_usuario
            FROM tb_usuario
            WHERE
                id_usuario = :id
                AND cd_tipo_usuario = 1
            LIMIT 1
        ");

        $consultaPrestador->execute([
            ':id' => $prestadorId
        ]);

        if (!$consultaPrestador->fetch()) {
            responder(404, [
                'sucesso' => false,
                'mensagem' => 'Prestador não encontrado.'
            ]);
        }

        // Consulta avaliações dos clientes sobre esse prestador.
        $sql = "
            SELECT
                av.id_avaliacao,
                av.ds_comentario,
                av.nr_nota,
                ag.id_agendamento,
                ag.tb_usuario_id_usuario AS cliente_id,
                ag.tb_prestador_id_usuario AS prestador_id,
                cliente.nm_nome AS cliente_nome
            FROM tb_avaliacao av
            INNER JOIN tb_agendamento ag
                ON ag.id_agendamento = av.tb_agendamento_id_agendamento
            INNER JOIN tb_usuario cliente
                ON cliente.id_usuario = ag.tb_usuario_id_usuario
            WHERE
                ag.st_agendamento = 'concluido'
                AND ag.tb_prestador_id_usuario = :prestador_id
            ORDER BY av.id_avaliacao DESC
        ";

        $consulta = $conexao->prepare($sql);

        $consulta->execute([
            ':prestador_id' => $prestadorId
        ]);

        $registros = $consulta->fetchAll();
        $avaliacoes = [];
        $somaNotas = 0;

        foreach ($registros as $registro) {
            $marcador = obterMarcador(
                (string) $registro['ds_comentario']
            );

            // Ignora avaliações antigas sem identificação de autoria.
            if ($marcador === null) {
                continue;
            }

            $clienteId = (int) $registro['cliente_id'];
            $idPrestadorRegistro = (int) $registro['prestador_id'];

            if (!validarIdentificadores(
                $marcador['autor_id'],
                $marcador['avaliado_id'],
                $clienteId,
                $idPrestadorRegistro
            )) {
                continue;
            }

            // Nesta página, exibimos somente avaliações de clientes
            // destinadas ao prestador.
            if (
                $marcador['autor_id'] !== $clienteId ||
                $marcador['avaliado_id'] !== $prestadorId
            ) {
                continue;
            }

            $nota = (int) $registro['nr_nota'];

            if ($nota < 1 || $nota > 5) {
                continue;
            }

            $avaliacoes[] = [
                'id_avaliacao' => (int) $registro['id_avaliacao'],
                'id_agendamento' => (int) $registro['id_agendamento'],
                'autor_id' => $clienteId,
                'autor_nome' => $registro['cliente_nome'],
                'avaliado_id' => $prestadorId,
                'nota' => $nota,
                'comentario' => $marcador['comentario']
            ];

            $somaNotas += $nota;
        }

        $totalAvaliacoes = count($avaliacoes);

        $mediaAvaliacoes = $totalAvaliacoes > 0
            ? round($somaNotas / $totalAvaliacoes, 1)
            : null;

        responder(200, [
            'sucesso' => true,
            'avaliacoes' => $avaliacoes,
            'total_avaliacoes' => $totalAvaliacoes,
            'media_avaliacoes' => $mediaAvaliacoes
        ]);

    } catch (Throwable $erro) {
        error_log(
            'Erro ao listar avaliações do prestador: ' .
            $erro->getMessage()
        );

        responder(500, [
            'sucesso' => false,
            'mensagem' => 'Não foi possível carregar as avaliações deste prestador.'
        ]);
    }
}

// --------------------------------------------------
// LISTAR AVALIAÇÕES DO USUÁRIO
// --------------------------------------------------

if ($metodo === 'GET' && $acao === 'listar') {
    try {
        $sql = "
            SELECT
                av.id_avaliacao,
                av.ds_comentario,
                av.nr_nota,
                av.tb_agendamento_id_agendamento AS id_agendamento,
                ag.tb_usuario_id_usuario AS cliente_id,
                ag.tb_prestador_id_usuario AS prestador_id,
                cliente.nm_nome AS cliente_nome,
                prestador.nm_nome AS prestador_nome
            FROM tb_avaliacao av
            INNER JOIN tb_agendamento ag
                ON ag.id_agendamento = av.tb_agendamento_id_agendamento
            INNER JOIN tb_usuario cliente
                ON cliente.id_usuario = ag.tb_usuario_id_usuario
            INNER JOIN tb_usuario prestador
                ON prestador.id_usuario = ag.tb_prestador_id_usuario
            WHERE
                ag.st_agendamento = 'concluido'
                AND (
                    ag.tb_usuario_id_usuario = :cliente_id
                    OR ag.tb_prestador_id_usuario = :prestador_id
                )
            ORDER BY av.id_avaliacao DESC
        ";

        $consulta = $conexao->prepare($sql);

        $consulta->execute([
            ':cliente_id' => $usuarioId,
            ':prestador_id' => $usuarioId
        ]);

        $registros = $consulta->fetchAll();
        $avaliacoes = [];

        foreach ($registros as $registro) {
            $marcador = obterMarcador(
                (string) $registro['ds_comentario']
            );

            // Avaliações sem marcador não possuem autoria identificável.
            if ($marcador === null) {
                continue;
            }

            $clienteId = (int) $registro['cliente_id'];
            $prestadorId = (int) $registro['prestador_id'];

            if (!validarIdentificadores(
                $marcador['autor_id'],
                $marcador['avaliado_id'],
                $clienteId,
                $prestadorId
            )) {
                continue;
            }

            $autorId = $marcador['autor_id'];
            $avaliadoId = $marcador['avaliado_id'];

            $nomeAutor = $autorId === $clienteId
                ? $registro['cliente_nome']
                : $registro['prestador_nome'];

            $nomeAvaliado = $avaliadoId === $clienteId
                ? $registro['cliente_nome']
                : $registro['prestador_nome'];

            $avaliacoes[] = [
                'id_avaliacao' => (int) $registro['id_avaliacao'],
                'id_agendamento' => (int) $registro['id_agendamento'],
                'autor_id' => $autorId,
                'avaliado_id' => $avaliadoId,
                'autor_nome' => $nomeAutor,
                'avaliado_nome' => $nomeAvaliado,
                'nota' => (int) $registro['nr_nota'],
                'comentario' => $marcador['comentario'],
                'eh_minha' => $autorId === (int) $usuarioId,
                'pode_editar' => $autorId === (int) $usuarioId
            ];
        }

        responder(200, [
            'sucesso' => true,
            'avaliacoes' => $avaliacoes
        ]);

    } catch (Throwable $erro) {
        error_log('Erro ao listar avaliações: ' . $erro->getMessage());

        responder(500, [
            'sucesso' => false,
            'mensagem' => 'Não foi possível carregar as avaliações.'
        ]);
    }
}

// --------------------------------------------------
// OPERAÇÕES DE GRAVAÇÃO
// --------------------------------------------------

if ($metodo !== 'POST') {
    responder(405, [
        'sucesso' => false,
        'mensagem' => 'Método não permitido.'
    ]);
}

$contentType = $_SERVER['CONTENT_TYPE'] ?? '';

if (stripos($contentType, 'application/json') === false) {
    responder(415, [
        'sucesso' => false,
        'mensagem' => 'O envio precisa utilizar o formato JSON.'
    ]);
}

$entrada = json_decode(
    file_get_contents('php://input'),
    true
);

if (!is_array($entrada)) {
    responder(400, [
        'sucesso' => false,
        'mensagem' => 'Dados enviados inválidos.'
    ]);
}

$token = $_SERVER['HTTP_X_CSRF_TOKEN']
    ?? $entrada['csrf_token']
    ?? '';

if (
    !is_string($token) ||
    !hash_equals($_SESSION['csrf_token'], $token)
) {
    responder(403, [
        'sucesso' => false,
        'mensagem' => 'Token de segurança inválido. Atualize a página.'
    ]);
}

$acao = $entrada['acao'] ?? '';

if (!in_array($acao, ['salvar', 'editar'], true)) {
    responder(400, [
        'sucesso' => false,
        'mensagem' => 'Operação de avaliação inválida.'
    ]);
}

$nota = filter_var(
    $entrada['nota'] ?? null,
    FILTER_VALIDATE_INT
);

if ($nota === false || $nota === null || $nota < 1 || $nota > 5) {
    responder(422, [
        'sucesso' => false,
        'mensagem' => 'A nota precisa estar entre 1 e 5 estrelas.'
    ]);
}

$comentario = $entrada['comentario'] ?? '';

if (!is_string($comentario)) {
    responder(422, [
        'sucesso' => false,
        'mensagem' => 'O comentário enviado é inválido.'
    ]);
}

$comentario = trim($comentario);

if (strlen($comentario) > 10000) {
    responder(422, [
        'sucesso' => false,
        'mensagem' => 'O comentário ultrapassou o limite permitido.'
    ]);
}

$idAgendamento = filter_var(
    $entrada['id_agendamento'] ?? null,
    FILTER_VALIDATE_INT
);

if (!$idAgendamento || $idAgendamento < 1) {
    responder(422, [
        'sucesso' => false,
        'mensagem' => 'Agendamento inválido.'
    ]);
}

$idAvaliacao = null;

if ($acao === 'editar') {
    $idAvaliacao = filter_var(
        $entrada['id_avaliacao'] ?? null,
        FILTER_VALIDATE_INT
    );

    if (!$idAvaliacao || $idAvaliacao < 1) {
        responder(422, [
            'sucesso' => false,
            'mensagem' => 'Avaliação inválida para edição.'
        ]);
    }
}

// --------------------------------------------------
// TRANSAÇÃO E VALIDAÇÕES
// --------------------------------------------------

try {
    $conexao->beginTransaction();

    // Bloqueia o agendamento durante a operação,
    // evitando cadastros simultâneos duplicados.
    $consultaAgendamento = $conexao->prepare("
        SELECT
            id_agendamento,
            st_agendamento,
            tb_usuario_id_usuario,
            tb_prestador_id_usuario
        FROM tb_agendamento
        WHERE id_agendamento = :id
        FOR UPDATE
    ");

    $consultaAgendamento->execute([
        ':id' => $idAgendamento
    ]);

    $agendamento = $consultaAgendamento->fetch();

    if (!$agendamento) {
        $conexao->rollBack();

        responder(404, [
            'sucesso' => false,
            'mensagem' => 'Agendamento não encontrado.'
        ]);
    }

    if ($agendamento['st_agendamento'] !== 'concluido') {
        $conexao->rollBack();

        responder(422, [
            'sucesso' => false,
            'mensagem' => 'Somente atendimentos concluídos podem receber avaliações.'
        ]);
    }

    $clienteId = (int) $agendamento['tb_usuario_id_usuario'];
    $prestadorId = (int) $agendamento['tb_prestador_id_usuario'];

    if (
        $clienteId < 1 ||
        $prestadorId < 1 ||
        $clienteId === $prestadorId
    ) {
        $conexao->rollBack();

        responder(422, [
            'sucesso' => false,
            'mensagem' => 'Os participantes deste agendamento são inválidos.'
        ]);
    }

    // O destinatário é determinado pelo banco,
    // nunca pelo valor enviado pelo navegador.
    if ($usuarioId === $clienteId && $tipoUsuario === 3) {
        $avaliadoId = $prestadorId;
    } elseif ($usuarioId === $prestadorId && $tipoUsuario === 1) {
        $avaliadoId = $clienteId;
    } else {
        $conexao->rollBack();

        responder(403, [
            'sucesso' => false,
            'mensagem' => 'Você não participa deste agendamento.'
        ]);
    }

    // Bloqueia e consulta todas as avaliações do atendimento.
    $consultaAvaliacoes = $conexao->prepare("
        SELECT id_avaliacao, ds_comentario
        FROM tb_avaliacao
        WHERE tb_agendamento_id_agendamento = :id
        FOR UPDATE
    ");

    $consultaAvaliacoes->execute([
        ':id' => $idAgendamento
    ]);

    $avaliacoesExistentes = $consultaAvaliacoes->fetchAll();

    if ($acao === 'salvar') {
        foreach ($avaliacoesExistentes as $existente) {
            $marcador = obterMarcador(
                (string) $existente['ds_comentario']
            );

            // Não é seguro atribuir autoria a registros antigos
            // que não possuem o marcador interno.
            if ($marcador === null) {
                $conexao->rollBack();

                responder(409, [
                    'sucesso' => false,
                    'mensagem' => 'Existe uma avaliação anterior sem identificação de autoria. Não é possível verificar a duplicidade com segurança.'
                ]);
            }

            if (!validarIdentificadores(
                $marcador['autor_id'],
                $marcador['avaliado_id'],
                $clienteId,
                $prestadorId
            )) {
                $conexao->rollBack();

                responder(409, [
                    'sucesso' => false,
                    'mensagem' => 'Foi encontrada uma avaliação com identificação inválida.'
                ]);
            }

            if ($marcador['autor_id'] === (int) $usuarioId) {
                $conexao->rollBack();

                responder(409, [
                    'sucesso' => false,
                    'mensagem' => 'Você já avaliou este atendimento.'
                ]);
            }
        }

        $comentarioInterno = criarComentarioInterno(
            (int) $usuarioId,
            $avaliadoId,
            $comentario
        );

        $inserir = $conexao->prepare("
            INSERT INTO tb_avaliacao (
                nr_nota,
                ds_comentario,
                tb_agendamento_id_agendamento
            ) VALUES (
                :nota,
                :comentario,
                :agendamento
            )
        ");

        $inserir->execute([
            ':nota' => $nota,
            ':comentario' => $comentarioInterno,
            ':agendamento' => $idAgendamento
        ]);

        $novoId = (int) $conexao->lastInsertId();

        $conexao->commit();

        responder(201, [
            'sucesso' => true,
            'mensagem' => 'Avaliação registrada com sucesso.',
            'id_avaliacao' => $novoId,
            'id_agendamento' => (int) $idAgendamento,
            'autor_id' => (int) $usuarioId,
            'avaliado_id' => $avaliadoId,
            'nota' => $nota,
            'comentario' => $comentario
        ]);
    }

    // --------------------------------------------------
    // EDIÇÃO: SOMENTE PELO AUTOR ORIGINAL
    // --------------------------------------------------

    $consultaEdicao = $conexao->prepare("
        SELECT
            id_avaliacao,
            ds_comentario
        FROM tb_avaliacao
        WHERE
            id_avaliacao = :avaliacao
            AND tb_agendamento_id_agendamento = :agendamento
        FOR UPDATE
    ");

    $consultaEdicao->execute([
        ':avaliacao' => $idAvaliacao,
        ':agendamento' => $idAgendamento
    ]);

    $avaliacaoOriginal = $consultaEdicao->fetch();

    if (!$avaliacaoOriginal) {
        $conexao->rollBack();

        responder(404, [
            'sucesso' => false,
            'mensagem' => 'Avaliação não encontrada.'
        ]);
    }

    $marcadorOriginal = obterMarcador(
        (string) $avaliacaoOriginal['ds_comentario']
    );

    if ($marcadorOriginal === null) {
        $conexao->rollBack();

        responder(409, [
            'sucesso' => false,
            'mensagem' => 'Esta avaliação não possui identificação de autoria e não pode ser editada com segurança.'
        ]);
    }

    if (!validarIdentificadores(
        $marcadorOriginal['autor_id'],
        $marcadorOriginal['avaliado_id'],
        $clienteId,
        $prestadorId
    )) {
        $conexao->rollBack();

        responder(409, [
            'sucesso' => false,
            'mensagem' => 'A identificação desta avaliação é inválida.'
        ]);
    }

    if ($marcadorOriginal['autor_id'] !== (int) $usuarioId) {
        $conexao->rollBack();

        responder(403, [
            'sucesso' => false,
            'mensagem' => 'Você só pode editar suas próprias avaliações.'
        ]);
    }

    // Confere novamente se a identificação original
    // corresponde ao participante autenticado.
    if ($marcadorOriginal['avaliado_id'] !== $avaliadoId) {
        $conexao->rollBack();

        responder(403, [
            'sucesso' => false,
            'mensagem' => 'Não é permitido alterar o destinatário da avaliação.'
        ]);
    }

    $comentarioAtualizado = criarComentarioInterno(
        (int) $usuarioId,
        $avaliadoId,
        $comentario
    );

    $atualizar = $conexao->prepare("
        UPDATE tb_avaliacao
        SET
            nr_nota = :nota,
            ds_comentario = :comentario
        WHERE id_avaliacao = :id
    ");

    $atualizar->execute([
        ':nota' => $nota,
        ':comentario' => $comentarioAtualizado,
        ':id' => $idAvaliacao
    ]);

    $conexao->commit();

    responder(200, [
        'sucesso' => true,
        'mensagem' => 'Avaliação atualizada com sucesso.',
        'id_avaliacao' => (int) $idAvaliacao,
        'id_agendamento' => (int) $idAgendamento,
        'autor_id' => (int) $usuarioId,
        'avaliado_id' => $avaliadoId,
        'nota' => $nota,
        'comentario' => $comentario
    ]);

} catch (Throwable $erro) {
    if ($conexao->inTransaction()) {
        $conexao->rollBack();
    }

    error_log('Erro no sistema de avaliações: ' . $erro->getMessage());

    responder(500, [
        'sucesso' => false,
        'mensagem' => 'Ocorreu um erro ao processar a avaliação.'
    ]);
}
