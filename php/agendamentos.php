<?php
declare(strict_types=1);

date_default_timezone_set('America/Sao_Paulo');

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
        JSON_UNESCAPED_UNICODE |
        JSON_INVALID_UTF8_SUBSTITUTE
    );

    exit;
}

function prestadorAprovado(PDO $conexao, int $idUsuario): bool
{
    $consulta = $conexao->prepare("
        SELECT st_analise, dt_envio
        FROM tb_antecedentes
        WHERE tb_usuario_id_usuario = :id_usuario
        ORDER BY id_antecedente DESC
        LIMIT 1
    ");

    $consulta->execute([
        ':id_usuario' => $idUsuario
    ]);

    $antecedente = $consulta->fetch(PDO::FETCH_ASSOC);

    return
        $antecedente !== false &&
        $antecedente['dt_envio'] !== null &&
        $antecedente['st_analise'] === 'APROVADO';
}

/* Verifica a sessão. */
if (
    empty($_SESSION['id_usuario']) ||
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
        'mensagem' => 'Perfil não autorizado.'
    ]);
}

/* Gera o token CSRF da sessão. */
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

/* Conecta ao banco. */
try {
    require_once __DIR__ . '/conexao.php';

    if (!isset($conexao) || !$conexao instanceof PDO) {
        throw new RuntimeException('Conexão PDO indisponível.');
    }
} catch (Throwable $erro) {
    error_log(
        'Erro de conexão em agendamentos.php: ' .
        $erro->getMessage()
    );

    responder(500, [
        'sucesso' => false,
        'mensagem' => 'Não foi possível conectar ao banco de dados.'
    ]);
}

/* GET: disponibiliza o token CSRF. */
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $acao = strtolower(trim((string) ($_GET['acao'] ?? '')));

    if ($acao === 'csrf') {
        responder(200, [
            'sucesso' => true,
            'csrf_token' => $_SESSION['csrf_token']
        ]);
    }

    header('Allow: GET, POST');

    responder(405, [
        'sucesso' => false,
        'mensagem' => 'Utilize o endpoint de listagem para consultar os agendamentos.'
    ]);
}

/* Somente POST é permitido para alterações. */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: GET, POST');

    responder(405, [
        'sucesso' => false,
        'mensagem' => 'Método não permitido.'
    ]);
}

/* Lê os dados enviados em JSON. */
$conteudo = file_get_contents('php://input');
$entrada = json_decode($conteudo, true);

if (!is_array($entrada)) {
    responder(400, [
        'sucesso' => false,
        'mensagem' => 'Os dados enviados são inválidos.'
    ]);
}

/* Valida o token CSRF. */
$tokenRecebido = $_SERVER['HTTP_X_CSRF_TOKEN']
    ?? $entrada['csrf_token']
    ?? '';

if (
    !is_string($tokenRecebido) ||
    !hash_equals($_SESSION['csrf_token'], $tokenRecebido)
) {
    responder(403, [
        'sucesso' => false,
        'mensagem' => 'A validação de segurança falhou. Atualize a página e tente novamente.'
    ]);
}

$acao = strtolower(trim((string) ($entrada['acao'] ?? '')));

try {

    /*
     * AÇÕES DO PRESTADOR
     */
    if (in_array($acao, ['aceitar', 'recusar', 'iniciar', 'concluir'], true)) {

        if ($tipoUsuario !== 1) {
            responder(403, [
                'sucesso' => false,
                'mensagem' => 'Somente o prestador pode executar esta ação.'
            ]);
        }

        if (!prestadorAprovado($conexao, $idUsuario)) {
            responder(403, [
                'sucesso' => false,
                'mensagem' => 'Seu cadastro ainda não está liberado. Aguarde a aprovação dos antecedentes criminais.'
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

        $transicoes = [
            'aceitar' => [
                'novo_status' => 'aceito',
                'status_permitidos' => ['pendente'],
                'mensagem' => 'Agendamento aceito com sucesso.'
            ],
            'recusar' => [
                'novo_status' => 'recusado',
                'status_permitidos' => ['pendente'],
                'mensagem' => 'Solicitação recusada.'
            ],
            'iniciar' => [
                'novo_status' => 'em_andamento',
                'status_permitidos' => ['aceito'],
                'mensagem' => 'Atendimento iniciado.'
            ],
            'concluir' => [
                'novo_status' => 'concluido',
                'status_permitidos' => ['em_andamento'],
                'mensagem' => 'Atendimento concluído.'
            ]
        ];

        $transicao = $transicoes[$acao];

        $marcadores = implode(
            ', ',
            array_fill(
                0,
                count($transicao['status_permitidos']),
                '?'
            )
        );

        $sql = "
            UPDATE tb_agendamento
            SET st_agendamento = ?
            WHERE id_agendamento = ?
              AND tb_prestador_id_usuario = ?
              AND LOWER(TRIM(st_agendamento)) IN ($marcadores)
        ";

        $parametros = array_merge(
            [
                $transicao['novo_status'],
                (int) $idAgendamento,
                $idUsuario
            ],
            $transicao['status_permitidos']
        );

        $consulta = $conexao->prepare($sql);
        $consulta->execute($parametros);

        if ($consulta->rowCount() !== 1) {
            $verificacao = $conexao->prepare("
                SELECT st_agendamento
                FROM tb_agendamento
                WHERE id_agendamento = ?
                  AND tb_prestador_id_usuario = ?
                LIMIT 1
            ");

            $verificacao->execute([
                (int) $idAgendamento,
                $idUsuario
            ]);

            $registro = $verificacao->fetch(PDO::FETCH_ASSOC);

            if (!$registro) {
                responder(404, [
                    'sucesso' => false,
                    'mensagem' => 'Agendamento não encontrado para este prestador.'
                ]);
            }

            responder(409, [
                'sucesso' => false,
                'mensagem' => 'O status atual não permite esta ação.'
            ]);
        }

        responder(200, [
            'sucesso' => true,
            'mensagem' => $transicao['mensagem'],
            'id_agendamento' => (int) $idAgendamento,
            'st_agendamento' => $transicao['novo_status']
        ]);
    }

    /*
     * CRIAÇÃO DE AGENDAMENTO
     * Somente clientes podem solicitar.
     */
    if ($tipoUsuario !== 3) {
        responder(403, [
            'sucesso' => false,
            'mensagem' => 'Somente um cliente pode solicitar um agendamento.'
        ]);
    }

    $nomeServico = trim((string) ($entrada['nm_servico'] ?? ''));
    $nomePrestador = trim((string) ($entrada['prestador'] ?? ''));

    $idPrestadorEnviado = filter_var(
        $entrada['id_prestador'] ?? null,
        FILTER_VALIDATE_INT
    );

    $data = trim((string) ($entrada['data'] ?? ''));
    $horario = trim((string) ($entrada['horario'] ?? ''));

    if (
        $nomeServico === '' ||
        $data === '' ||
        $horario === ''
    ) {
        responder(400, [
            'sucesso' => false,
            'mensagem' => 'Informe o serviço, a data e o horário.'
        ]);
    }

    /* Valida a data. */
    $dataValida = DateTime::createFromFormat('!Y-m-d', $data);
    $errosData = DateTime::getLastErrors();

    if (
        !$dataValida ||
        $dataValida->format('Y-m-d') !== $data ||
        ($errosData !== false && (
            $errosData['warning_count'] > 0 ||
            $errosData['error_count'] > 0
        ))
    ) {
        responder(400, [
            'sucesso' => false,
            'mensagem' => 'A data informada é inválida.'
        ]);
    }

    /* Valida o horário. */
    if (!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $horario)) {
        responder(400, [
            'sucesso' => false,
            'mensagem' => 'O horário informado é inválido.'
        ]);
    }

    $dataHoraSolicitada = DateTimeImmutable::createFromFormat(
        '!Y-m-d H:i',
        $data . ' ' . $horario,
        new DateTimeZone('America/Sao_Paulo')
    );

    $errosDataHora = DateTimeImmutable::getLastErrors();

    if (
        !$dataHoraSolicitada ||
        $dataHoraSolicitada->format('Y-m-d H:i') !== $data . ' ' . $horario ||
        ($errosDataHora !== false && (
            $errosDataHora['warning_count'] > 0 ||
            $errosDataHora['error_count'] > 0
        ))
    ) {
        responder(400, [
            'sucesso' => false,
            'mensagem' => 'A data e o horário informados são inválidos.'
        ]);
    }

    $agora = new DateTimeImmutable(
        'now',
        new DateTimeZone('America/Sao_Paulo')
    );

    if ($dataHoraSolicitada <= $agora) {
        responder(400, [
            'sucesso' => false,
            'mensagem' => 'Escolha uma data e um horário futuros.'
        ]);
    }

    $dataHora = $dataHoraSolicitada->format('Y-m-d H:i:s');

    /* Localiza o serviço no catálogo real. */
    $consultaServico = $conexao->prepare("
        SELECT id_servico
        FROM tb_servicos
        WHERE nm_servico = :nm_servico
        LIMIT 1
    ");

    $consultaServico->execute([
        ':nm_servico' => $nomeServico
    ]);

    $servico = $consultaServico->fetch(PDO::FETCH_ASSOC);

    if (!$servico) {
        responder(404, [
            'sucesso' => false,
            'mensagem' => 'O serviço selecionado não foi encontrado no catálogo.'
        ]);
    }

    /*
     * Identifica o prestador pelo ID.
     * O nome é mantido como compatibilidade com chamadas anteriores.
     */
    $idPrestador = null;

    if (
        $idPrestadorEnviado !== false &&
        $idPrestadorEnviado !== null &&
        $idPrestadorEnviado > 0
    ) {
        $consultaPrestador = $conexao->prepare("
            SELECT u.id_usuario
            FROM tb_usuario AS u
            WHERE u.id_usuario = :id_usuario
              AND u.cd_tipo_usuario = 1
              AND EXISTS (
                  SELECT 1
                  FROM tb_antecedentes AS ant
                  WHERE ant.tb_usuario_id_usuario = u.id_usuario
                    AND ant.dt_envio IS NOT NULL
                    AND ant.id_antecedente = (
                        SELECT MAX(ant2.id_antecedente)
                        FROM tb_antecedentes AS ant2
                        WHERE ant2.tb_usuario_id_usuario = u.id_usuario
                    )
                    AND ant.st_analise = 'APROVADO'
              )
            LIMIT 1
        ");

        $consultaPrestador->execute([
            ':id_usuario' => (int) $idPrestadorEnviado
        ]);

        $prestador = $consultaPrestador->fetch(PDO::FETCH_ASSOC);

        if (!$prestador) {
            responder(404, [
                'sucesso' => false,
                'mensagem' => 'O prestador selecionado não foi encontrado ou ainda não está aprovado.'
            ]);
        }

        $idPrestador = (int) $prestador['id_usuario'];

    } elseif ($nomePrestador !== '') {

        $consultaPrestador = $conexao->prepare("
            SELECT u.id_usuario
            FROM tb_usuario AS u
            WHERE u.nm_nome = :nm_nome
              AND u.cd_tipo_usuario = 1
              AND EXISTS (
                  SELECT 1
                  FROM tb_antecedentes AS ant
                  WHERE ant.tb_usuario_id_usuario = u.id_usuario
                    AND ant.dt_envio IS NOT NULL
                    AND ant.id_antecedente = (
                        SELECT MAX(ant2.id_antecedente)
                        FROM tb_antecedentes AS ant2
                        WHERE ant2.tb_usuario_id_usuario = u.id_usuario
                    )
                    AND ant.st_analise = 'APROVADO'
              )
            ORDER BY u.id_usuario ASC
        ");

        $consultaPrestador->execute([
            ':nm_nome' => $nomePrestador
        ]);

        $prestadoresEncontrados = $consultaPrestador->fetchAll(PDO::FETCH_ASSOC);

        if (count($prestadoresEncontrados) === 0) {
            responder(404, [
                'sucesso' => false,
                'mensagem' => 'Não foi possível identificar um prestador aprovado com esse nome.'
            ]);
        }

        if (count($prestadoresEncontrados) > 1) {
            responder(400, [
                'sucesso' => false,
                'mensagem' => 'Existem prestadores com esse nome. Selecione pelo identificador.'
            ]);
        }

        $idPrestador = (int) $prestadoresEncontrados[0]['id_usuario'];
    }

    if (!$idPrestador) {
        responder(400, [
            'sucesso' => false,
            'mensagem' => 'Selecione um prestador para o agendamento.'
        ]);
    }

    $localBusca = trim((string) ($entrada['ds_local_busca'] ?? ''));
    $localEntrega = trim((string) ($entrada['ds_local_entrega'] ?? ''));

    /* Registra o agendamento com os dados reais. */
    $sql = "
        INSERT INTO tb_agendamento (
            st_agendamento,
            hr_horario,
            ds_local_busca,
            ds_local_entrega,
            tb_servicos_id_servico,
            tb_usuario_id_usuario,
            tb_prestador_id_usuario
        ) VALUES (
            'pendente',
            :hr_horario,
            :ds_local_busca,
            :ds_local_entrega,
            :id_servico,
            :id_cliente,
            :id_prestador
        )
    ";

    $insercao = $conexao->prepare($sql);

    $insercao->execute([
        ':hr_horario' => $dataHora,
        ':ds_local_busca' => $localBusca !== '' ? $localBusca : null,
        ':ds_local_entrega' => $localEntrega !== '' ? $localEntrega : null,
        ':id_servico' => (int) $servico['id_servico'],
        ':id_cliente' => $idUsuario,
        ':id_prestador' => $idPrestador
    ]);

    responder(201, [
        'sucesso' => true,
        'mensagem' => 'Solicitação de agendamento registrada com sucesso.',
        'id_agendamento' => (int) $conexao->lastInsertId(),
        'st_agendamento' => 'pendente'
    ]);

} catch (Throwable $erro) {
    error_log(
        'Erro ao processar agendamento: ' .
        $erro->getMessage()
    );

    responder(500, [
        'sucesso' => false,
        'mensagem' => 'Não foi possível processar o agendamento. Verifique os dados e tente novamente.'
    ]);
}
