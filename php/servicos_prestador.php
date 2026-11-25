<?php

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
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

/*
|-------------------------------------------------------------------------- 
| IDENTIFICAÇÃO DA CONTA
|-------------------------------------------------------------------------- 
*/

$idUsuario = $_SESSION['id_usuario'] ?? null;
$tipoUsuario = $_SESSION['cd_tipo_usuario'] ?? null;

if (
    !is_numeric($idUsuario) ||
    (int) $idUsuario <= 0 ||
    !in_array((int) $tipoUsuario, [0, 1, 3], true)
) {
    responder(401, [
        'sucesso' => false,
        'mensagem' => 'Sua sessão expirou. Entre novamente.'
    ]);
}

$idUsuario = (int) $idUsuario;
$tipoUsuario = (int) $tipoUsuario;

/*
|-------------------------------------------------------------------------- 
| CONEXÃO COM O BANCO
|-------------------------------------------------------------------------- 
*/

require_once __DIR__ . '/conexao.php';

if (!isset($conexao) || !$conexao instanceof PDO) {
    responder(500, [
        'sucesso' => false,
        'mensagem' => 'Não foi possível conectar ao banco de dados.'
    ]);
}

/*
|-------------------------------------------------------------------------- 
| DIRETÓRIO DE ARMAZENAMENTO
|-------------------------------------------------------------------------- 
*/

$diretorio = dirname(__DIR__) . '/storage/servicos_prestadores';

try {
    if (!is_dir($diretorio)) {
        if (!mkdir($diretorio, 0755, true) && !is_dir($diretorio)) {
            throw new RuntimeException(
                'Não foi possível criar o diretório de armazenamento.'
            );
        }
    }

    if (!is_writable($diretorio)) {
        throw new RuntimeException(
            'O diretório de armazenamento não possui permissão de escrita.'
        );
    }

    /*
     * Impede listagem e acesso HTTP direto aos arquivos JSON.
     * Não substitui a necessidade de configurar o Apache corretamente.
     */
    $arquivoProtecao = $diretorio . '/.htaccess';

    if (!file_exists($arquivoProtecao)) {
        $protecao = "Options -Indexes\nRequire all denied\n";

        if (file_put_contents($arquivoProtecao, $protecao, LOCK_EX) === false) {
            throw new RuntimeException(
                'Não foi possível proteger o diretório de armazenamento.'
            );
        }
    }

} catch (Throwable $erro) {
    error_log(
        'Erro no armazenamento de serviços: ' . $erro->getMessage()
    );

    responder(500, [
        'sucesso' => false,
        'mensagem' => 'Não foi possível preparar o armazenamento dos serviços.'
    ]);
}

/*
|-------------------------------------------------------------------------- 
| FUNÇÕES DE ARMAZENAMENTO
|-------------------------------------------------------------------------- 
*/

function obterCaminhoArquivo(int $idPrestador): string
{
    global $diretorio;

    return $diretorio . '/' . $idPrestador . '.json';
}

function obterServicosSalvos(int $idPrestador): array
{
    $arquivo = obterCaminhoArquivo($idPrestador);

    if (!is_file($arquivo)) {
        return [];
    }

    $conteudo = file_get_contents($arquivo);

    if ($conteudo === false) {
        throw new RuntimeException(
            'Não foi possível consultar os serviços salvos.'
        );
    }

    $dados = json_decode($conteudo, true);

    if (
        !is_array($dados) ||
        !isset($dados['id_usuario']) ||
        !isset($dados['servicos']) ||
        (int) $dados['id_usuario'] !== $idPrestador ||
        !is_array($dados['servicos'])
    ) {
        throw new RuntimeException(
            'O arquivo de serviços possui um formato inválido.'
        );
    }

    $servicos = [];

    foreach ($dados['servicos'] as $idServico) {
        if (
            is_int($idServico) ||
            (is_string($idServico) && ctype_digit($idServico))
        ) {
            $idServico = (int) $idServico;

            if ($idServico > 0 && !in_array($idServico, $servicos, true)) {
                $servicos[] = $idServico;
            }
        }
    }

    return $servicos;
}

function validarServicosCatalogo(array $ids): array
{
    global $conexao;

    if (count($ids) > 5) {
        responder(422, [
            'sucesso' => false,
            'mensagem' => 'Você pode oferecer no máximo cinco serviços.'
        ]);
    }

    if (count($ids) === 0) {
        return [];
    }

    $marcadores = implode(',', array_fill(0, count($ids), '?'));

    $sql = "
        SELECT id_servico
        FROM tb_servicos
        WHERE id_servico IN ($marcadores)
    ";

    $consulta = $conexao->prepare($sql);
    $consulta->execute($ids);

    $existentes = array_map(
        'intval',
        $consulta->fetchAll(PDO::FETCH_COLUMN)
    );

    if (count($existentes) !== count($ids)) {
        responder(422, [
            'sucesso' => false,
            'mensagem' => 'Um ou mais serviços selecionados não existem no catálogo.'
        ]);
    }

    return $existentes;
}

function salvarServicos(int $idPrestador, array $servicos): void
{
    $arquivo = obterCaminhoArquivo($idPrestador);
    $arquivoTemporario = $arquivo . '.' . bin2hex(random_bytes(8)) . '.tmp';

    $dados = [
        'id_usuario' => $idPrestador,
        'servicos' => array_values($servicos)
    ];

    $json = json_encode(
        $dados,
        JSON_PRETTY_PRINT |
        JSON_UNESCAPED_UNICODE |
        JSON_INVALID_UTF8_SUBSTITUTE
    );

    if ($json === false) {
        throw new RuntimeException(
            'Não foi possível preparar os serviços para gravação.'
        );
    }

    try {
        if (file_put_contents($arquivoTemporario, $json, LOCK_EX) === false) {
            throw new RuntimeException(
                'Não foi possível gravar os serviços.'
            );
        }

        if (!rename($arquivoTemporario, $arquivo)) {
            throw new RuntimeException(
                'Não foi possível atualizar os serviços salvos.'
            );
        }

    } finally {
        if (is_file($arquivoTemporario)) {
            @unlink($arquivoTemporario);
        }
    }
}

/*
|-------------------------------------------------------------------------- 
| CONSULTA DOS SERVIÇOS
|-------------------------------------------------------------------------- 
*/

try {
    $metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($metodo === 'GET') {

        /*
         * Sem parâmetro ID:
         * consulta os serviços do próprio prestador
         * e o status do seu antecedente.
         *
         * Com parâmetro ID:
         * consulta os serviços públicos de um prestador específico.
         */

        $statusAntecedente = null;

        if (isset($_GET['id'])) {
            $idPrestador = filter_var(
                $_GET['id'],
                FILTER_VALIDATE_INT
            );

            if (!$idPrestador || $idPrestador <= 0) {
                responder(400, [
                    'sucesso' => false,
                    'mensagem' => 'Identificação do prestador inválida.'
                ]);
            }

            $consulta = $conexao->prepare(
                'SELECT id_usuario
                 FROM tb_usuario
                 WHERE id_usuario = :id
                   AND cd_tipo_usuario = 1
                 LIMIT 1'
            );

            $consulta->execute([
                'id' => $idPrestador
            ]);

            if (!$consulta->fetch()) {
                responder(404, [
                    'sucesso' => false,
                    'mensagem' => 'Prestador não encontrado.'
                ]);
            }

        } else {
            if ($tipoUsuario !== 1) {
                responder(403, [
                    'sucesso' => false,
                    'mensagem' => 'Somente prestadores podem consultar sua própria seleção.'
                ]);
            }

            $idPrestador = $idUsuario;

            /*
             * Consulta o antecedente mais recente do próprio prestador.
             * O relacionamento utiliza a chave estrangeira existente
             * em tb_antecedentes.
             */

            $consultaAntecedente = $conexao->prepare(
                "SELECT st_analise
                 FROM tb_antecedentes
                 WHERE tb_usuario_id_usuario = :id_usuario
                 ORDER BY id_antecedente DESC
                 LIMIT 1"
            );

            $consultaAntecedente->execute([
                'id_usuario' => $idPrestador
            ]);

            $registroAntecedente = $consultaAntecedente->fetch(
                PDO::FETCH_ASSOC
            );

            if ($registroAntecedente) {
                $statusAntecedente = strtoupper(
                    trim((string) $registroAntecedente['st_analise'])
                );
            }
        }

        $servicos = obterServicosSalvos($idPrestador);

        $resposta = [
            'sucesso' => true,
            'id_usuario' => $idPrestador,
            'servicos' => $servicos
        ];

        /*
         * O status é retornado somente na consulta
         * da própria seleção do prestador.
         */

        if (!isset($_GET['id'])) {
            $resposta['status_antecedente'] = $statusAntecedente;
        }

        responder(200, $resposta);
    }

    /*
    |-------------------------------------------------------------------------- 
    | SALVAMENTO DOS SERVIÇOS
    |-------------------------------------------------------------------------- 
    */

    if ($metodo === 'POST') {

        if ($tipoUsuario !== 1) {
            responder(403, [
                'sucesso' => false,
                'mensagem' => 'Somente prestadores podem alterar seus serviços.'
            ]);
        }

        /*
         * Validação CSRF.
         */

        $tokenSessao = $_SESSION['csrf_token'] ?? '';

        $tokenRecebido = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';

        if ($tokenRecebido === '') {
            $tokenRecebido = $_POST['csrf_token'] ?? '';
        }

        if (
            !is_string($tokenSessao) ||
            $tokenSessao === '' ||
            !is_string($tokenRecebido) ||
            $tokenRecebido === '' ||
            !hash_equals($tokenSessao, $tokenRecebido)
        ) {
            responder(403, [
                'sucesso' => false,
                'mensagem' => 'Token de segurança inválido. Atualize a página.'
            ]);
        }

        /*
         * VERIFICAÇÃO DO ANTECEDENTE CRIMINAL.
         *
         * Somente o antecedente mais recente do prestador
         * pode autorizar a oferta de serviços.
         *
         * Sem documento, pendente ou reprovado:
         * a gravação é bloqueada.
         */

        $consultaAntecedente = $conexao->prepare(
            "SELECT st_analise
             FROM tb_antecedentes
             WHERE tb_usuario_id_usuario = :id_usuario
             ORDER BY id_antecedente DESC
             LIMIT 1"
        );

        $consultaAntecedente->execute([
            'id_usuario' => $idUsuario
        ]);

        $registroAntecedente = $consultaAntecedente->fetch(
            PDO::FETCH_ASSOC
        );

        $statusAntecedente = $registroAntecedente
            ? strtoupper(trim((string) $registroAntecedente['st_analise']))
            : null;

        if ($statusAntecedente !== 'APROVADO') {
            responder(403, [
                'sucesso' => false,
                'mensagem' => 'Você precisa ter seu antecedente criminal aprovado para ofertar serviços.'
            ]);
        }

        /*
         * O ID do prestador sempre vem da sessão.
         * Nunca é aceito um ID de proprietário enviado pelo navegador.
         */

        $entrada = file_get_contents('php://input');
        $dados = json_decode($entrada, true);

        if (!is_array($dados) || !isset($dados['servicos'])) {
            responder(400, [
                'sucesso' => false,
                'mensagem' => 'Lista de serviços inválida.'
            ]);
        }

        if (!is_array($dados['servicos']) || !array_is_list($dados['servicos'])) {
            responder(400, [
                'sucesso' => false,
                'mensagem' => 'A seleção deve ser uma lista de serviços.'
            ]);
        }

        if (count($dados['servicos']) > 5) {
            responder(422, [
                'sucesso' => false,
                'mensagem' => 'Você pode oferecer no máximo cinco serviços.'
            ]);
        }

        $ids = [];

        foreach ($dados['servicos'] as $idServico) {
            if (
                !is_int($idServico) &&
                !(is_string($idServico) && ctype_digit($idServico))
            ) {
                responder(422, [
                    'sucesso' => false,
                    'mensagem' => 'A seleção contém um identificador inválido.'
                ]);
            }

            $idServico = (int) $idServico;

            if ($idServico <= 0 || in_array($idServico, $ids, true)) {
                responder(422, [
                    'sucesso' => false,
                    'mensagem' => 'A seleção contém serviços inválidos ou repetidos.'
                ]);
            }

            $ids[] = $idServico;
        }

        $idsValidados = validarServicosCatalogo($ids);

        /*
         * Bloqueia operações simultâneas sobre o mesmo prestador.
         */

        $arquivoLock = $diretorio . '/' . $idUsuario . '.lock';
        $bloqueio = fopen($arquivoLock, 'c');

        if ($bloqueio === false) {
            throw new RuntimeException(
                'Não foi possível controlar a gravação dos serviços.'
            );
        }

        try {
            if (!flock($bloqueio, LOCK_EX)) {
                throw new RuntimeException(
                    'Não foi possível bloquear a gravação dos serviços.'
                );
            }

            salvarServicos($idUsuario, $idsValidados);

        } finally {
            flock($bloqueio, LOCK_UN);
            fclose($bloqueio);
        }

        responder(200, [
            'sucesso' => true,
            'mensagem' => 'Serviços atualizados com sucesso.',
            'id_usuario' => $idUsuario,
            'servicos' => $idsValidados
        ]);
    }

    responder(405, [
        'sucesso' => false,
        'mensagem' => 'Método não permitido.'
    ]);

} catch (Throwable $erro) {

    error_log(
        'Erro em servicos_prestador.php: ' . $erro->getMessage()
    );

    responder(500, [
        'sucesso' => false,
        'mensagem' => 'Não foi possível processar os serviços do prestador.'
    ]);
}
