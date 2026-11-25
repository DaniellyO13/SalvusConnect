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

function responder(int $status, array $dados): void
{
    http_response_code($status);

    echo json_encode(
        $dados,
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );

    exit;
}

function obterIdUsuario(): int
{
    return isset($_SESSION['id_usuario'])
        ? (int) $_SESSION['id_usuario']
        : 0;
}

function obterTipoUsuario(): int
{
    return isset($_SESSION['cd_tipo_usuario'])
        ? (int) $_SESSION['cd_tipo_usuario']
        : -1;
}

function obterDiretorioMensagens(): string
{
    return __DIR__ . '/../storage/mensagens';
}

function obterCaminhoConversa(int $idAgendamento): string
{
    return obterDiretorioMensagens()
        . '/conversa_'
        . $idAgendamento
        . '.json';
}

function obterCaminhoConversaUsuarios(
    int $idCliente,
    int $idPrestador
): string {
    return obterDiretorioMensagens()
        . '/conversa_cliente_'
        . $idCliente
        . '_prestador_'
        . $idPrestador
        . '.json';
}

function obterIdConversa(int $idCliente, int $idPrestador): string
{
    return 'usuarios-' . $idCliente . '-' . $idPrestador;
}

function criarEstruturaConversa(
    int $idCliente,
    int $idPrestador
): array {
    return [
        'id_conversa' => obterIdConversa($idCliente, $idPrestador),
        'id_cliente' => $idCliente,
        'id_prestador' => $idPrestador,
        'mensagens' => [],
        'leituras' => []
    ];
}

function consultarAgendamento(
    PDO $conexao,
    int $idAgendamento
): ?array {
    $sql = "
        SELECT
            a.id_agendamento,
            a.st_agendamento,
            a.tb_usuario_id_usuario AS id_cliente,
            a.tb_prestador_id_usuario AS id_prestador,
            cliente.nm_nome AS nm_cliente,
            prestador.nm_nome AS nm_prestador,
            servico.nm_servico
        FROM tb_agendamento a
        INNER JOIN tb_usuario cliente
            ON cliente.id_usuario = a.tb_usuario_id_usuario
        INNER JOIN tb_usuario prestador
            ON prestador.id_usuario = a.tb_prestador_id_usuario
        INNER JOIN tb_servicos servico
            ON servico.id_servico = a.tb_servicos_id_servico
        WHERE a.id_agendamento = :id_agendamento
        LIMIT 1
    ";

    $consulta = $conexao->prepare($sql);

    $consulta->execute([
        ':id_agendamento' => $idAgendamento
    ]);

    $agendamento = $consulta->fetch(PDO::FETCH_ASSOC);

    return $agendamento ?: null;
}

function validarParticipacao(array $agendamento): bool
{
    $idUsuario = obterIdUsuario();

    return $idUsuario === (int) $agendamento['id_cliente']
        || $idUsuario === (int) $agendamento['id_prestador'];
}

function obterNomeOutroParticipante(array $agendamento): string
{
    $idUsuario = obterIdUsuario();

    if ($idUsuario === (int) $agendamento['id_cliente']) {
        return (string) $agendamento['nm_prestador'];
    }

    return (string) $agendamento['nm_cliente'];
}

function obterPapelOutroParticipante(array $agendamento): string
{
    return obterIdUsuario() === (int) $agendamento['id_cliente']
        ? 'provider'
        : 'client';
}

function obterIdsAgendamentosPar(
    PDO $conexao,
    int $idCliente,
    int $idPrestador
): array {
    $sql = "
        SELECT id_agendamento
        FROM tb_agendamento
        WHERE
            tb_usuario_id_usuario = :id_cliente
            AND tb_prestador_id_usuario = :id_prestador
        ORDER BY id_agendamento ASC
    ";

    $consulta = $conexao->prepare($sql);

    $consulta->execute([
        ':id_cliente' => $idCliente,
        ':id_prestador' => $idPrestador
    ]);

    return array_map(
        'intval',
        $consulta->fetchAll(PDO::FETCH_COLUMN)
    );
}

function lerArquivoConversa(
    string $caminho,
    int $idCliente,
    int $idPrestador,
    ?int $idAgendamentoEsperado = null
): array {
    $arquivo = fopen($caminho, 'rb');

    if ($arquivo === false) {
        throw new RuntimeException('Não foi possível abrir o histórico.');
    }

    try {
        if (!flock($arquivo, LOCK_SH)) {
            throw new RuntimeException('Não foi possível acessar o histórico.');
        }

        $conteudo = stream_get_contents($arquivo);

        flock($arquivo, LOCK_UN);
    } finally {
        fclose($arquivo);
    }

    if ($conteudo === false || trim($conteudo) === '') {
        throw new RuntimeException('O histórico da conversa está vazio ou inválido.');
    }

    $dados = json_decode($conteudo, true);

    if (
        !is_array($dados)
        || !isset($dados['id_cliente'])
        || (int) $dados['id_cliente'] !== $idCliente
        || !isset($dados['id_prestador'])
        || (int) $dados['id_prestador'] !== $idPrestador
        || !isset($dados['mensagens'])
        || !is_array($dados['mensagens'])
    ) {
        throw new RuntimeException('O histórico da conversa está inválido.');
    }

    if (
        $idAgendamentoEsperado !== null
        && (
            !isset($dados['id_agendamento'])
            || (int) $dados['id_agendamento'] !== $idAgendamentoEsperado
        )
    ) {
        throw new RuntimeException('O histórico do agendamento está inválido.');
    }

    return $dados;
}

function combinarMensagens(array $mensagensExistentes, array $novasMensagens): array
{
    $mensagensUnicas = [];

    foreach (array_merge($mensagensExistentes, $novasMensagens) as $mensagem) {
        if (!is_array($mensagem)) {
            continue;
        }

        $idMensagem = isset($mensagem['id'])
            ? (string) $mensagem['id']
            : '';

        $chave = $idMensagem !== ''
            ? 'id-' . $idMensagem
            : 'hash-' . hash(
                'sha256',
                json_encode(
                    $mensagem,
                    JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
                ) ?: ''
            );

        $mensagensUnicas[$chave] = $mensagem;
    }

    $resultado = array_values($mensagensUnicas);

    usort($resultado, function (array $a, array $b): int {
        return strcmp(
            (string) ($a['createdAt'] ?? ''),
            (string) ($b['createdAt'] ?? '')
        );
    });

    return $resultado;
}

/*
 * REGISTRO DE VISUALIZAÇÃO
 *
 * Cada participante possui seu próprio registro dentro do JSON.
 * O identificador da última mensagem visualizada permite distinguir
 * mensagens que chegaram depois da abertura da conversa.
 */

function registrarLeitura(
    int $idCliente,
    int $idPrestador,
    array $mensagensVisualizadas
): void {
    if (empty($mensagensVisualizadas)) {
        return;
    }

    $ultimaMensagem = null;

    foreach ($mensagensVisualizadas as $mensagem) {
        if (is_array($mensagem)) {
            $ultimaMensagem = $mensagem;
        }
    }

    if (!$ultimaMensagem) {
        return;
    }

    $idUltimaMensagem = isset($ultimaMensagem['id'])
        ? (string) $ultimaMensagem['id']
        : '';

    $dataUltimaMensagem = isset($ultimaMensagem['createdAt'])
        ? (string) $ultimaMensagem['createdAt']
        : '';

    if ($idUltimaMensagem === '' && $dataUltimaMensagem === '') {
        return;
    }

    $idUsuario = obterIdUsuario();

    $diretorio = obterDiretorioMensagens();

    if (!is_dir($diretorio) || !is_writable($diretorio)) {
        throw new RuntimeException(
            'A pasta de armazenamento de mensagens não está disponível.'
        );
    }

    $caminho = obterCaminhoConversaUsuarios(
        $idCliente,
        $idPrestador
    );

    $arquivo = fopen($caminho, 'c+');

    if ($arquivo === false) {
        throw new RuntimeException('Não foi possível registrar a visualização.');
    }

    try {
        if (!flock($arquivo, LOCK_EX)) {
            throw new RuntimeException('Não foi possível bloquear o histórico.');
        }

        rewind($arquivo);

        $conteudo = stream_get_contents($arquivo);

        if ($conteudo === false || trim($conteudo) === '') {
            throw new RuntimeException('O histórico da conversa está indisponível.');
        }

        $dados = json_decode($conteudo, true);

        if (
            !is_array($dados)
            || !isset($dados['id_cliente'])
            || (int) $dados['id_cliente'] !== $idCliente
            || !isset($dados['id_prestador'])
            || (int) $dados['id_prestador'] !== $idPrestador
            || !isset($dados['mensagens'])
            || !is_array($dados['mensagens'])
        ) {
            throw new RuntimeException('O histórico da conversa está inválido.');
        }

        if (
            !isset($dados['leituras'])
            || !is_array($dados['leituras'])
        ) {
            $dados['leituras'] = [];
        }

        $dados['leituras'][(string) $idUsuario] = [
            'ultima_mensagem_id' => $idUltimaMensagem,
            'visualizado_em' => date('c')
        ];

        $novoConteudo = json_encode(
            $dados,
            JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
        );

        if ($novoConteudo === false) {
            throw new RuntimeException('Não foi possível preparar o registro de leitura.');
        }

        rewind($arquivo);

        if (!ftruncate($arquivo, 0)) {
            throw new RuntimeException('Não foi possível atualizar o histórico.');
        }

        $gravados = fwrite($arquivo, $novoConteudo);

        if ($gravados === false || $gravados !== strlen($novoConteudo)) {
            throw new RuntimeException('Não foi possível salvar o registro de leitura.');
        }

        if (!fflush($arquivo)) {
            throw new RuntimeException('Não foi possível finalizar o registro de leitura.');
        }

        flock($arquivo, LOCK_UN);
    } finally {
        fclose($arquivo);
    }
}

/*
 * VERIFICAÇÃO DE MENSAGENS NÃO VISUALIZADAS
 */

function possuiMensagensNaoLidas(
    array $dadosConversa,
    int $idUsuario
): bool {
    $mensagens = $dadosConversa['mensagens'] ?? [];

    if (!is_array($mensagens) || empty($mensagens)) {
        return false;
    }

    $leituras = $dadosConversa['leituras'] ?? [];

    $leituraUsuario = is_array($leituras)
        ? ($leituras[(string) $idUsuario] ?? null)
        : null;

    if (!is_array($leituraUsuario)) {
        foreach ($mensagens as $mensagem) {
            if (
                is_array($mensagem)
                && (int) ($mensagem['senderId'] ?? 0) !== $idUsuario
            ) {
                return true;
            }
        }

        return false;
    }

    $idUltimaMensagemLida = (string) (
        $leituraUsuario['ultima_mensagem_id'] ?? ''
    );

    /*
     * Primeiro tenta localizar exatamente a última mensagem
     * que estava carregada quando o participante abriu a conversa.
     */

    if ($idUltimaMensagemLida !== '') {
        $indiceUltimaMensagemLida = null;

        foreach ($mensagens as $indice => $mensagem) {
            if (
                is_array($mensagem)
                && (string) ($mensagem['id'] ?? '') === $idUltimaMensagemLida
            ) {
                $indiceUltimaMensagemLida = $indice;
                break;
            }
        }

        if ($indiceUltimaMensagemLida !== null) {
            foreach ($mensagens as $indice => $mensagem) {
                if (
                    $indice > $indiceUltimaMensagemLida
                    && is_array($mensagem)
                    && (int) ($mensagem['senderId'] ?? 0) !== $idUsuario
                ) {
                    return true;
                }
            }

            return false;
        }
    }

    /*
     * Compatibilidade com registros de leitura sem identificador
     * ou com históricos antigos que não possuam o identificador salvo.
     */

    $dataVisualizacao = strtotime(
        (string) ($leituraUsuario['visualizado_em'] ?? '')
    );

    if ($dataVisualizacao === false) {
        foreach ($mensagens as $mensagem) {
            if (
                is_array($mensagem)
                && (int) ($mensagem['senderId'] ?? 0) !== $idUsuario
            ) {
                return true;
            }
        }

        return false;
    }

    foreach ($mensagens as $mensagem) {
        if (!is_array($mensagem)) {
            continue;
        }

        if ((int) ($mensagem['senderId'] ?? 0) === $idUsuario) {
            continue;
        }

        $dataMensagem = strtotime(
            (string) ($mensagem['createdAt'] ?? '')
        );

        if (
            $dataMensagem !== false
            && $dataMensagem > $dataVisualizacao
        ) {
            return true;
        }
    }

    return false;
}

function gravarConversaMesclada(
    int $idCliente,
    int $idPrestador,
    array $dados
): void {
    $diretorio = obterDiretorioMensagens();

    if (!is_dir($diretorio) || !is_writable($diretorio)) {
        throw new RuntimeException(
            'A pasta de armazenamento de mensagens não está disponível.'
        );
    }

    $caminho = obterCaminhoConversaUsuarios(
        $idCliente,
        $idPrestador
    );

    $arquivo = fopen($caminho, 'c+');

    if ($arquivo === false) {
        throw new RuntimeException('Não foi possível salvar o histórico.');
    }

    try {
        if (!flock($arquivo, LOCK_EX)) {
            throw new RuntimeException('Não foi possível bloquear o histórico.');
        }

        rewind($arquivo);

        $conteudoAtual = stream_get_contents($arquivo);

        if ($conteudoAtual === false) {
            throw new RuntimeException('Não foi possível ler o histórico atual.');
        }

        if (trim($conteudoAtual) !== '') {
            $dadosAtuais = json_decode($conteudoAtual, true);

            if (
                !is_array($dadosAtuais)
                || !isset($dadosAtuais['id_cliente'])
                || (int) $dadosAtuais['id_cliente'] !== $idCliente
                || !isset($dadosAtuais['id_prestador'])
                || (int) $dadosAtuais['id_prestador'] !== $idPrestador
                || !isset($dadosAtuais['mensagens'])
                || !is_array($dadosAtuais['mensagens'])
            ) {
                throw new RuntimeException('O histórico atual está inválido.');
            }

            $dados['mensagens'] = combinarMensagens(
                $dadosAtuais['mensagens'],
                $dados['mensagens']
            );

            /*
             * Preserva os registros individuais de leitura
             * durante a consolidação de históricos antigos.
             */

            if (
                isset($dadosAtuais['leituras'])
                && is_array($dadosAtuais['leituras'])
            ) {
                $dados['leituras'] = $dadosAtuais['leituras'];
            }
        }

        $novoConteudo = json_encode(
            $dados,
            JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
        );

        if ($novoConteudo === false) {
            throw new RuntimeException('Não foi possível preparar o histórico.');
        }

        rewind($arquivo);

        if (!ftruncate($arquivo, 0)) {
            throw new RuntimeException('Não foi possível atualizar o histórico.');
        }

        $gravados = fwrite($arquivo, $novoConteudo);

        if ($gravados === false || $gravados !== strlen($novoConteudo)) {
            throw new RuntimeException('Não foi possível gravar o histórico.');
        }

        if (!fflush($arquivo)) {
            throw new RuntimeException('Não foi possível finalizar a gravação.');
        }

        flock($arquivo, LOCK_UN);
    } finally {
        fclose($arquivo);
    }
}

function lerConversa(
    PDO $conexao,
    int $idCliente,
    int $idPrestador
): array {
    $dados = criarEstruturaConversa(
        $idCliente,
        $idPrestador
    );

    $caminhoCompartilhado = obterCaminhoConversaUsuarios(
        $idCliente,
        $idPrestador
    );

    $arquivoCompartilhadoExiste = is_file($caminhoCompartilhado);

    if ($arquivoCompartilhadoExiste) {
        $dados = lerArquivoConversa(
            $caminhoCompartilhado,
            $idCliente,
            $idPrestador
        );
    }

    $quantidadeInicial = count($dados['mensagens']);

    $idsAgendamentos = obterIdsAgendamentosPar(
        $conexao,
        $idCliente,
        $idPrestador
    );

    foreach ($idsAgendamentos as $idAgendamento) {
        $caminhoLegado = obterCaminhoConversa($idAgendamento);

        if (!is_file($caminhoLegado)) {
            continue;
        }

        $dadosLegados = lerArquivoConversa(
            $caminhoLegado,
            $idCliente,
            $idPrestador,
            $idAgendamento
        );

        $dados['mensagens'] = combinarMensagens(
            $dados['mensagens'],
            $dadosLegados['mensagens']
        );
    }

    $quantidadeFinal = count($dados['mensagens']);

    if (
        $quantidadeFinal > 0
        && (
            !$arquivoCompartilhadoExiste
            || $quantidadeFinal !== $quantidadeInicial
        )
    ) {
        gravarConversaMesclada(
            $idCliente,
            $idPrestador,
            $dados
        );
    }

    return $dados;
}

function salvarMensagem(
    int $idCliente,
    int $idPrestador,
    array $mensagem
): void {
    $diretorio = obterDiretorioMensagens();

    if (!is_dir($diretorio) || !is_writable($diretorio)) {
        throw new RuntimeException(
            'A pasta de armazenamento de mensagens não está disponível.'
        );
    }

    $caminho = obterCaminhoConversaUsuarios(
        $idCliente,
        $idPrestador
    );

    $arquivo = fopen($caminho, 'c+');

    if ($arquivo === false) {
        throw new RuntimeException('Não foi possível salvar a mensagem.');
    }

    try {
        if (!flock($arquivo, LOCK_EX)) {
            throw new RuntimeException(
                'Não foi possível bloquear o histórico para gravação.'
            );
        }

        rewind($arquivo);

        $conteudo = stream_get_contents($arquivo);

        if ($conteudo === false) {
            throw new RuntimeException('Não foi possível ler o histórico.');
        }

        if (trim($conteudo) === '') {
            $dados = criarEstruturaConversa(
                $idCliente,
                $idPrestador
            );
        } else {
            $dados = json_decode($conteudo, true);

            if (
                !is_array($dados)
                || !isset($dados['id_cliente'])
                || (int) $dados['id_cliente'] !== $idCliente
                || !isset($dados['id_prestador'])
                || (int) $dados['id_prestador'] !== $idPrestador
                || !isset($dados['mensagens'])
                || !is_array($dados['mensagens'])
            ) {
                throw new RuntimeException(
                    'O histórico da conversa está inválido.'
                );
            }
        }

        $dados['mensagens'][] = $mensagem;

        $novoConteudo = json_encode(
            $dados,
            JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
        );

        if ($novoConteudo === false) {
            throw new RuntimeException('Não foi possível preparar a mensagem.');
        }

        rewind($arquivo);

        if (!ftruncate($arquivo, 0)) {
            throw new RuntimeException('Não foi possível atualizar o histórico.');
        }

        $gravados = fwrite($arquivo, $novoConteudo);

        if ($gravados === false || $gravados !== strlen($novoConteudo)) {
            throw new RuntimeException('Não foi possível gravar a mensagem.');
        }

        if (!fflush($arquivo)) {
            throw new RuntimeException('Não foi possível finalizar a gravação.');
        }

        flock($arquivo, LOCK_UN);
    } finally {
        fclose($arquivo);
    }
}

function existeAtendimentoAtivo(
    PDO $conexao,
    int $idCliente,
    int $idPrestador
): bool {
    $sql = "
        SELECT COUNT(*)
        FROM tb_agendamento
        WHERE
            tb_usuario_id_usuario = :id_cliente
            AND tb_prestador_id_usuario = :id_prestador
            AND st_agendamento IN ('aceito', 'em_andamento')
    ";

    $consulta = $conexao->prepare($sql);

    $consulta->execute([
        ':id_cliente' => $idCliente,
        ':id_prestador' => $idPrestador
    ]);

    return (int) $consulta->fetchColumn() > 0;
}

// AUTENTICAÇÃO

$idUsuario = obterIdUsuario();
$tipoUsuario = obterTipoUsuario();

if ($idUsuario <= 0 || !in_array($tipoUsuario, [1, 3], true)) {
    responder(401, [
        'sucesso' => false,
        'mensagem' => 'Acesso não autorizado.'
    ]);
}

// CONEXÃO

try {
    require_once __DIR__ . '/conexao.php';

    if (!isset($conexao) || !$conexao instanceof PDO) {
        throw new RuntimeException('Conexão com o banco indisponível.');
    }
} catch (Throwable $erro) {
    error_log('Chat - conexão: ' . $erro->getMessage());

    responder(500, [
        'sucesso' => false,
        'mensagem' => 'Não foi possível conectar ao sistema.'
    ]);
}

// TOKEN CSRF

if (empty($_SESSION['csrf_token'])) {
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

// LISTAR CONVERSAS

if ($metodo === 'GET' && $acao === 'listar') {
    try {
        $sql = "
            SELECT
                a.id_agendamento
            FROM tb_agendamento a
            WHERE
                (
                    a.tb_usuario_id_usuario = :id_cliente
                    OR a.tb_prestador_id_usuario = :id_prestador
                )
                AND a.st_agendamento IN (
                    'aceito',
                    'em_andamento',
                    'concluido'
                )
            ORDER BY a.hr_horario DESC, a.id_agendamento DESC
        ";

        $consulta = $conexao->prepare($sql);

        $consulta->execute([
            ':id_cliente' => $idUsuario,
            ':id_prestador' => $idUsuario
        ]);

        $agendamentos = $consulta->fetchAll(PDO::FETCH_ASSOC);

        $pares = [];

        foreach ($agendamentos as $item) {
            $idAgendamento = (int) $item['id_agendamento'];

            $agendamento = consultarAgendamento(
                $conexao,
                $idAgendamento
            );

            if (!$agendamento || !validarParticipacao($agendamento)) {
                continue;
            }

            $idCliente = (int) $agendamento['id_cliente'];
            $idPrestador = (int) $agendamento['id_prestador'];

            $chave = $idCliente . '-' . $idPrestador;

            $statusAtivo = in_array(
                $agendamento['st_agendamento'],
                ['aceito', 'em_andamento'],
                true
            );

            if (!isset($pares[$chave])) {
                $pares[$chave] = $agendamento;
                continue;
            }

            $statusAtualAtivo = in_array(
                $pares[$chave]['st_agendamento'],
                ['aceito', 'em_andamento'],
                true
            );

            if ($statusAtivo && !$statusAtualAtivo) {
                $pares[$chave] = $agendamento;
            }
        }

        $conversasAtivas = [];

        foreach ($pares as $agendamento) {
            $status = $agendamento['st_agendamento'];

            if (!in_array($status, ['aceito', 'em_andamento'], true)) {
                continue;
            }

            $idCliente = (int) $agendamento['id_cliente'];
            $idPrestador = (int) $agendamento['id_prestador'];

            $dadosConversa = lerConversa(
                $conexao,
                $idCliente,
                $idPrestador
            );

            $listaMensagens = $dadosConversa['mensagens'];

            $ultimaMensagem = [];

            if (!empty($listaMensagens)) {
                $ultimaMensagem = end($listaMensagens);
            }

            $conversasAtivas[] = [
                'id' => obterIdConversa($idCliente, $idPrestador),
                'id_agendamento' => (int) $agendamento['id_agendamento'],
                'name' => obterNomeOutroParticipante($agendamento),
                'role' => obterPapelOutroParticipante($agendamento),
                'status' => $status,
                'nm_servico' => $agendamento['nm_servico'],
                'lastMessage' => $ultimaMensagem['content'] ?? 'Sem mensagens',
                'updatedAt' => $ultimaMensagem['createdAt'] ?? null,
                'archived' => false,
                'unread' => possuiMensagensNaoLidas(
                    $dadosConversa,
                    $idUsuario
                )
            ];
        }

        responder(200, [
            'sucesso' => true,
            'usuario' => [
                'id' => $idUsuario,
                'tipo' => $tipoUsuario
            ],
            'conversas' => $conversasAtivas,
            'arquivadas' => []
        ]);
    } catch (Throwable $erro) {
        error_log('Chat - listar: ' . $erro->getMessage());

        responder(500, [
            'sucesso' => false,
            'mensagem' => 'Não foi possível carregar as conversas.'
        ]);
    }
}

// CARREGAR HISTÓRICO

if ($metodo === 'GET' && $acao === 'mensagens') {
    $idAgendamento = filter_var(
        $_GET['id_agendamento'] ?? null,
        FILTER_VALIDATE_INT
    );

    if (!$idAgendamento || $idAgendamento <= 0) {
        responder(400, [
            'sucesso' => false,
            'mensagem' => 'Agendamento inválido.'
        ]);
    }

    try {
        $agendamento = consultarAgendamento($conexao, $idAgendamento);

        if (!$agendamento || !validarParticipacao($agendamento)) {
            responder(403, [
                'sucesso' => false,
                'mensagem' => 'Você não tem acesso a esta conversa.'
            ]);
        }

        $status = $agendamento['st_agendamento'];

        if (!in_array($status, ['aceito', 'em_andamento', 'concluido'], true)) {
            responder(403, [
                'sucesso' => false,
                'mensagem' => 'Esta conversa ainda não está disponível.'
            ]);
        }

        $idCliente = (int) $agendamento['id_cliente'];
        $idPrestador = (int) $agendamento['id_prestador'];

        $dadosConversa = lerConversa(
            $conexao,
            $idCliente,
            $idPrestador
        );

        /*
         * Registra somente as mensagens que foram carregadas
         * nesta requisição, sem marcar mensagens posteriores
         * como visualizadas.
         */

        try {
            registrarLeitura(
                $idCliente,
                $idPrestador,
                $dadosConversa['mensagens']
            );
        } catch (Throwable $erroLeitura) {
            error_log('Chat - registrar leitura: ' . $erroLeitura->getMessage());
        }

        responder(200, [
            'sucesso' => true,
            'id_agendamento' => $idAgendamento,
            'status' => $status,
            'arquivada' => !existeAtendimentoAtivo(
                $conexao,
                $idCliente,
                $idPrestador
            ),
            'mensagens' => $dadosConversa['mensagens']
        ]);
    } catch (Throwable $erro) {
        error_log('Chat - mensagens: ' . $erro->getMessage());

        responder(500, [
            'sucesso' => false,
            'mensagem' => 'Não foi possível carregar o histórico.'
        ]);
    }
}

// ENVIAR MENSAGEM

if ($metodo === 'POST' && $acao === 'enviar') {
    $entrada = json_decode(
        file_get_contents('php://input'),
        true
    );

    if (!is_array($entrada)) {
        responder(400, [
            'sucesso' => false,
            'mensagem' => 'Dados da mensagem inválidos.'
        ]);
    }

    $tokenRecebido =
        $_SERVER['HTTP_X_CSRF_TOKEN']
        ?? $entrada['csrf_token']
        ?? '';

    if (
        !is_string($tokenRecebido)
        || !hash_equals($_SESSION['csrf_token'], $tokenRecebido)
    ) {
        responder(403, [
            'sucesso' => false,
            'mensagem' => 'Token de segurança inválido. Atualize a página.'
        ]);
    }

    $idAgendamento = filter_var(
        $entrada['id_agendamento'] ?? null,
        FILTER_VALIDATE_INT
    );

    $conteudo = $entrada['mensagem'] ?? '';

    if (!$idAgendamento || $idAgendamento <= 0) {
        responder(400, [
            'sucesso' => false,
            'mensagem' => 'Agendamento inválido.'
        ]);
    }

    if (!is_string($conteudo)) {
        responder(400, [
            'sucesso' => false,
            'mensagem' => 'Mensagem inválida.'
        ]);
    }

    $conteudo = trim($conteudo);

    if ($conteudo === '') {
        responder(400, [
            'sucesso' => false,
            'mensagem' => 'Digite uma mensagem antes de enviar.'
        ]);
    }

    if (mb_strlen($conteudo, 'UTF-8') > 2000) {
        responder(400, [
            'sucesso' => false,
            'mensagem' => 'A mensagem ultrapassa o limite de 2.000 caracteres.'
        ]);
    }

    try {
        $agendamento = consultarAgendamento($conexao, $idAgendamento);

        if (!$agendamento || !validarParticipacao($agendamento)) {
            responder(403, [
                'sucesso' => false,
                'mensagem' => 'Você não tem acesso a esta conversa.'
            ]);
        }

        $idCliente = (int) $agendamento['id_cliente'];
        $idPrestador = (int) $agendamento['id_prestador'];

        if (!existeAtendimentoAtivo($conexao, $idCliente, $idPrestador)) {
            responder(403, [
                'sucesso' => false,
                'mensagem' => 'Não é possível enviar mensagens sem um atendimento ativo.'
            ]);
        }

        $nomeUsuario = $tipoUsuario === 1
            ? $agendamento['nm_prestador']
            : $agendamento['nm_cliente'];

        $mensagem = [
            'id' => bin2hex(random_bytes(16)),
            'conversationId' => obterIdConversa($idCliente, $idPrestador),
            'senderId' => $idUsuario,
            'senderName' => $nomeUsuario,
            'content' => $conteudo,
            'createdAt' => date('c')
        ];

        salvarMensagem(
            $idCliente,
            $idPrestador,
            $mensagem
        );

        responder(201, [
            'sucesso' => true,
            'mensagem' => 'Mensagem enviada.',
            'dados' => $mensagem
        ]);
    } catch (Throwable $erro) {
        error_log('Chat - enviar: ' . $erro->getMessage());

        responder(500, [
            'sucesso' => false,
            'mensagem' => 'Não foi possível enviar a mensagem.'
        ]);
    }
}

// OPERAÇÃO OU MÉTODO INVÁLIDO

responder(405, [
    'sucesso' => false,
    'mensagem' => 'Operação não permitida.'
]);
