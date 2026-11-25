<?php

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');

// 1. Verifica a sessão.
if (
    !isset($_SESSION['id_usuario']) ||
    !isset($_SESSION['cd_tipo_usuario'])
) {
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');

    echo json_encode([
        'sucesso' => false,
        'mensagem' => 'É necessário realizar o login.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$idUsuario = (int) $_SESSION['id_usuario'];
$tipoUsuario = (int) $_SESSION['cd_tipo_usuario'];

if ($idUsuario < 1) {
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');

    echo json_encode([
        'sucesso' => false,
        'mensagem' => 'Sessão de usuário inválida.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

require_once __DIR__ . '/conexao.php';

/*
|--------------------------------------------------------------------------
| FUNÇÃO DE RESPOSTA JSON
|--------------------------------------------------------------------------
*/

function responder(int $codigo, bool $sucesso, string $mensagem): void
{
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');

    echo json_encode([
        'sucesso' => $sucesso,
        'mensagem' => $mensagem
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

/*
|--------------------------------------------------------------------------
| 2. VISUALIZAÇÃO DO DOCUMENTO — GET
|--------------------------------------------------------------------------
*/

if ($_SERVER['REQUEST_METHOD'] === 'GET') {

    // Somente administradores podem visualizar documentos.
    if ($tipoUsuario !== 0) {
        responder(
            403,
            false,
            'Você não tem permissão para visualizar este documento.'
        );
    }

    // Confirma a permissão diretamente no banco.
    try {
        $consultaAdmin = $conexao->prepare("
            SELECT cd_tipo_usuario
            FROM tb_usuario
            WHERE id_usuario = :id_usuario
            LIMIT 1
        ");

        $consultaAdmin->execute([
            'id_usuario' => $idUsuario
        ]);

        $administrador = $consultaAdmin->fetch(PDO::FETCH_ASSOC);

        if (
            !$administrador ||
            (int) $administrador['cd_tipo_usuario'] !== 0
        ) {
            responder(
                403,
                false,
                'Você não tem permissão para visualizar este documento.'
            );
        }

        // Recebe e valida o ID do antecedente.
        $idAntecedente = filter_input(
            INPUT_GET,
            'id',
            FILTER_VALIDATE_INT
        );

        if (!$idAntecedente || $idAntecedente < 1) {
            responder(400, false, 'Documento inválido.');
        }

        // Busca somente documentos realmente enviados por prestadores.
        $consultaDocumento = $conexao->prepare("
            SELECT
                a.ds_arquivo,
                a.nm_arquivo,
                a.nm_tipo_arquivo,
                a.dt_envio,
                u.cd_tipo_usuario
            FROM tb_antecedentes a
            INNER JOIN tb_usuario u
                ON u.id_usuario = a.tb_usuario_id_usuario
            WHERE a.id_antecedente = :id_antecedente
              AND a.dt_envio IS NOT NULL
            LIMIT 1
        ");

        $consultaDocumento->execute([
            'id_antecedente' => $idAntecedente
        ]);

        $documento = $consultaDocumento->fetch(PDO::FETCH_ASSOC);

        if (
            !$documento ||
            (int) $documento['cd_tipo_usuario'] !== 1
        ) {
            responder(404, false, 'Documento não encontrado.');
        }

        // Valida o caminho salvo no banco.
        $caminhoBanco = (string) $documento['ds_arquivo'];

        if (
            !preg_match(
                '/^storage\/antecedentes\/([a-f0-9]{48})\.(pdf|jpg|jpeg|png)$/i',
                $caminhoBanco,
                $correspondencia
            )
        ) {
            responder(404, false, 'Documento não encontrado.');
        }

        $nomeSeguro = $correspondencia[1] . '.' .
            strtolower($correspondencia[2]);

        $extensao = strtolower(
            pathinfo($nomeSeguro, PATHINFO_EXTENSION)
        );

        // Resolve os caminhos reais para impedir acesso a outros diretórios.
        $pastaBase = realpath(
            dirname(__DIR__) .
            DIRECTORY_SEPARATOR . 'storage' .
            DIRECTORY_SEPARATOR . 'antecedentes'
        );

        if ($pastaBase === false || !is_dir($pastaBase)) {
            responder(404, false, 'Documento não encontrado.');
        }

        $caminhoCompleto = realpath(
            $pastaBase . DIRECTORY_SEPARATOR . $nomeSeguro
        );

        if (
            $caminhoCompleto === false ||
            dirname($caminhoCompleto) !== $pastaBase ||
            !is_file($caminhoCompleto) ||
            !is_readable($caminhoCompleto)
        ) {
            responder(404, false, 'Documento não encontrado.');
        }

        // Confere novamente o tipo real do arquivo.
        if (!class_exists('finfo')) {
            responder(
                500,
                false,
                'Não foi possível validar o documento.'
            );
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeReal = $finfo->file($caminhoCompleto);

        $mimesPermitidos = [
            'pdf' => 'application/pdf',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png' => 'image/png'
        ];

        if (
            !isset($mimesPermitidos[$extensao]) ||
            $mimeReal !== $mimesPermitidos[$extensao]
        ) {
            responder(415, false, 'Formato de documento inválido.');
        }

        // Libera a sessão antes de transmitir o arquivo.
        session_write_close();

        // Remove o cabeçalho JSON para entregar o documento.
        header_remove('Content-Type');

        header('Content-Type: ' . $mimeReal);
        header('Content-Disposition: inline; filename="documento.' . $extensao . '"');
        header('Content-Length: ' . filesize($caminhoCompleto));
        header('X-Frame-Options: SAMEORIGIN');
        header("Content-Security-Policy: frame-ancestors 'self'");

        readfile($caminhoCompleto);
        exit;

    } catch (Throwable $erro) {
        error_log(
            'Erro ao visualizar antecedente no SalvusConnect: ' .
            $erro->getMessage()
        );

        responder(
            500,
            false,
            'Não foi possível abrir o documento.'
        );
    }
}

/*
|--------------------------------------------------------------------------
| 3. ENVIO DO DOCUMENTO — POST
|--------------------------------------------------------------------------
*/

// Somente prestadores podem enviar documentos.
if ($tipoUsuario !== 1) {
    responder(
        403,
        false,
        'Somente prestadores podem enviar antecedentes.'
    );
}

// O envio aceita somente POST.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: GET, POST');
    responder(405, false, 'Método de requisição não permitido.');
}

// 4. Valida o token CSRF.
$tokenSessao = $_SESSION['csrf_token'] ?? '';
$tokenRecebido = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';

if (
    !is_string($tokenSessao) ||
    $tokenSessao === '' ||
    !is_string($tokenRecebido) ||
    $tokenRecebido === '' ||
    !hash_equals($tokenSessao, $tokenRecebido)
) {
    responder(
        403,
        false,
        'Não foi possível validar sua sessão. Atualize a página e tente novamente.'
    );
}

// 5. Verifica se o arquivo foi enviado.
if (!isset($_FILES['antecedente'])) {
    responder(400, false, 'Selecione um documento para enviar.');
}

$arquivo = $_FILES['antecedente'];

if (!is_array($arquivo) || is_array($arquivo['error'] ?? null)) {
    responder(400, false, 'Envio de arquivo inválido.');
}

if ($arquivo['error'] !== UPLOAD_ERR_OK) {
    $mensagensErro = [
        UPLOAD_ERR_INI_SIZE =>
            'O arquivo ultrapassa o limite permitido pelo servidor.',
        UPLOAD_ERR_FORM_SIZE =>
            'O arquivo ultrapassa o limite permitido.',
        UPLOAD_ERR_PARTIAL =>
            'O envio foi incompleto. Tente novamente.',
        UPLOAD_ERR_NO_FILE =>
            'Selecione um documento para enviar.',
        UPLOAD_ERR_NO_TMP_DIR =>
            'A pasta temporária do servidor não está disponível.',
        UPLOAD_ERR_CANT_WRITE =>
            'O servidor não conseguiu receber o arquivo.',
        UPLOAD_ERR_EXTENSION =>
            'O envio foi bloqueado por uma extensão do PHP.'
    ];

    responder(
        400,
        false,
        $mensagensErro[$arquivo['error']]
            ?? 'Não foi possível receber o documento.'
    );
}

if (
    !isset($arquivo['tmp_name'], $arquivo['name'], $arquivo['size']) ||
    !is_uploaded_file($arquivo['tmp_name'])
) {
    responder(400, false, 'O arquivo recebido não é válido.');
}

// 6. Valida tamanho, extensão e tipo real do arquivo.
$limiteBytes = 5 * 1024 * 1024;

if (
    !is_numeric($arquivo['size']) ||
    (int) $arquivo['size'] < 1 ||
    (int) $arquivo['size'] > $limiteBytes
) {
    responder(
        400,
        false,
        'O documento deve ter no máximo 5 MB.'
    );
}

$nomeOriginal = basename(
    str_replace('\\', '/', (string) $arquivo['name'])
);

$extensao = strtolower(pathinfo($nomeOriginal, PATHINFO_EXTENSION));

$tiposPermitidos = [
    'pdf' => ['application/pdf'],
    'jpg' => ['image/jpeg'],
    'jpeg' => ['image/jpeg'],
    'png' => ['image/png']
];

if (!isset($tiposPermitidos[$extensao])) {
    responder(
        400,
        false,
        'Formato inválido. Envie PDF, JPG, JPEG ou PNG.'
    );
}

if (!class_exists('finfo')) {
    responder(
        500,
        false,
        'Não foi possível validar o tipo do documento no servidor.'
    );
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mimeReal = $finfo->file($arquivo['tmp_name']);

if (!in_array($mimeReal, $tiposPermitidos[$extensao], true)) {
    responder(
        400,
        false,
        'O conteúdo do arquivo não corresponde ao formato informado.'
    );
}

// 7. Define o armazenamento dos documentos.
$pastaAntecedentes = dirname(__DIR__)
    . DIRECTORY_SEPARATOR . 'storage'
    . DIRECTORY_SEPARATOR . 'antecedentes';

if (!is_dir($pastaAntecedentes)) {
    responder(
        500,
        false,
        'A pasta de armazenamento não foi encontrada.'
    );
}

if (!is_writable($pastaAntecedentes)) {
    responder(
        500,
        false,
        'O servidor não tem permissão para salvar os documentos.'
    );
}

// Gera um nome aleatório para o arquivo.
try {
    $nomeSeguro = bin2hex(random_bytes(24)) . '.' . $extensao;
} catch (Throwable $erro) {
    error_log('Falha ao gerar nome de antecedente: ' . $erro->getMessage());

    responder(500, false, 'Não foi possível preparar o documento.');
}

$caminhoCompleto = $pastaAntecedentes
    . DIRECTORY_SEPARATOR . $nomeSeguro;

$caminhoBanco = 'storage/antecedentes/' . $nomeSeguro;

$arquivoSalvo = false;

try {
    // 8. Confirma o tipo de conta diretamente no banco.
    $consultaUsuario = $conexao->prepare("
        SELECT cd_tipo_usuario
        FROM tb_usuario
        WHERE id_usuario = :id_usuario
        LIMIT 1
    ");

    $consultaUsuario->execute([
        'id_usuario' => $idUsuario
    ]);

    $usuario = $consultaUsuario->fetch(PDO::FETCH_ASSOC);

    if (!$usuario) {
        responder(401, false, 'Usuário não encontrado.');
    }

    if ((int) $usuario['cd_tipo_usuario'] !== 1) {
        responder(
            403,
            false,
            'Somente prestadores podem enviar antecedentes.'
        );
    }

    // 9. Consulta o registro existente do prestador.
    $consulta = $conexao->prepare("
        SELECT
            id_antecedente,
            nm_arquivo,
            ds_arquivo,
            dt_envio,
            st_analise
        FROM tb_antecedentes
        WHERE tb_usuario_id_usuario = :id_usuario
        ORDER BY id_antecedente DESC
        LIMIT 1
    ");

    $consulta->execute([
        'id_usuario' => $idUsuario
    ]);

    $registro = $consulta->fetch(PDO::FETCH_ASSOC);

    $idAntecedente = null;
    $substituirRegistro = false;

    if ($registro) {
        $idAntecedente = (int) $registro['id_antecedente'];

        $ehPlaceholder = (
            $registro['dt_envio'] === null &&
            (
                $registro['nm_arquivo'] === 'Pendente de envio' ||
                $registro['ds_arquivo'] === 'Documento ainda não enviado.'
            )
        );

        $statusAtual = strtoupper(
            trim((string) $registro['st_analise'])
        );

        if ($ehPlaceholder || $statusAtual === 'REPROVADO') {
            $substituirRegistro = true;
        } else {
            responder(
                409,
                false,
                $statusAtual === 'APROVADO'
                    ? 'Seu documento já foi aprovado.'
                    : 'Já existe um documento enviado aguardando análise.'
            );
        }
    }

    // 10. Salva o arquivo.
    if (!move_uploaded_file($arquivo['tmp_name'], $caminhoCompleto)) {
        responder(
            500,
            false,
            'Não foi possível salvar o documento.'
        );
    }

    $arquivoSalvo = true;

    $conexao->beginTransaction();

    if ($substituirRegistro) {
        $sql = "
            UPDATE tb_antecedentes
            SET
                nm_arquivo = :nome,
                ds_arquivo = :caminho,
                nm_tipo_arquivo = :tipo,
                dt_envio = CURRENT_TIMESTAMP,
                st_analise = 'PENDENTE',
                dt_analise = NULL,
                ds_observacao = NULL,
                tb_administrador_id_usuario = NULL
            WHERE id_antecedente = :id_antecedente
              AND tb_usuario_id_usuario = :id_usuario
        ";

        $gravar = $conexao->prepare($sql);

        $gravar->execute([
            'nome' => $nomeOriginal,
            'caminho' => $caminhoBanco,
            'tipo' => 'Antecedentes criminais',
            'id_antecedente' => $idAntecedente,
            'id_usuario' => $idUsuario
        ]);

        if ($gravar->rowCount() !== 1) {
            throw new RuntimeException(
                'Não foi possível atualizar o registro do antecedente.'
            );
        }
    } else {
        $sql = "
            INSERT INTO tb_antecedentes (
                nm_arquivo,
                ds_arquivo,
                nm_tipo_arquivo,
                dt_envio,
                st_analise,
                tb_usuario_id_usuario
            ) VALUES (
                :nome,
                :caminho,
                :tipo,
                CURRENT_TIMESTAMP,
                'PENDENTE',
                :id_usuario
            )
        ";

        $gravar = $conexao->prepare($sql);

        $gravar->execute([
            'nome' => $nomeOriginal,
            'caminho' => $caminhoBanco,
            'tipo' => 'Antecedentes criminais',
            'id_usuario' => $idUsuario
        ]);
    }

    $conexao->commit();

    responder(
        200,
        true,
        'Documento enviado com sucesso! Ele está aguardando análise.'
    );

} catch (Throwable $erro) {
    if ($conexao->inTransaction()) {
        $conexao->rollBack();
    }

    if ($arquivoSalvo && is_file($caminhoCompleto)) {
        @unlink($caminhoCompleto);
    }

    error_log(
        'Erro ao enviar antecedentes no SalvusConnect: ' .
        $erro->getMessage()
    );

    responder(
        500,
        false,
        'Não foi possível registrar o documento. Tente novamente.'
    );
}
