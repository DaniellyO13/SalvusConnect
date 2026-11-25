<?php

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');

$idUsuario = $_SESSION['id_usuario'] ?? null;

if (!is_numeric($idUsuario) || (int) $idUsuario < 1) {
    responderFoto(401, false, 'Sua sessão expirou. Entre novamente.');
}

$idUsuario = (int) $idUsuario;

$pastaFotos = dirname(__DIR__)
    . DIRECTORY_SEPARATOR . 'storage'
    . DIRECTORY_SEPARATOR . 'fotos_perfil';

$mimesPermitidos = [
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png' => 'image/png'
];

/*
|--------------------------------------------------------------------------
| FUNÇÃO DE RESPOSTA JSON
|--------------------------------------------------------------------------
*/

function responderFoto(
    int $codigo,
    bool $sucesso,
    string $mensagem
): void {
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');

    echo json_encode([
        'sucesso' => $sucesso,
        'mensagem' => $mensagem
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);

    exit;
}

/*
|--------------------------------------------------------------------------
| VALIDAÇÃO DA PASTA DE ARMAZENAMENTO
|--------------------------------------------------------------------------
*/

if (!is_dir($pastaFotos) || !is_writable($pastaFotos)) {
    responderFoto(
        500,
        false,
        'A pasta de armazenamento das fotos não está disponível.'
    );
}

$pastaReal = realpath($pastaFotos);

if ($pastaReal === false) {
    responderFoto(
        500,
        false,
        'Não foi possível acessar o armazenamento das fotos.'
    );
}

/*
|--------------------------------------------------------------------------
| VISUALIZAÇÃO DA FOTO — GET
|--------------------------------------------------------------------------
*/

if ($_SERVER['REQUEST_METHOD'] === 'GET') {

    $fotoEncontrada = null;
    $extensaoEncontrada = null;

    foreach (array_keys($mimesPermitidos) as $extensao) {

        $nomeArquivo = $idUsuario . '.' . $extensao;

        $caminhoCompleto = realpath(
            $pastaReal . DIRECTORY_SEPARATOR . $nomeArquivo
        );

        if (
            $caminhoCompleto !== false &&
            dirname($caminhoCompleto) === $pastaReal &&
            is_file($caminhoCompleto) &&
            is_readable($caminhoCompleto)
        ) {
            $fotoEncontrada = $caminhoCompleto;
            $extensaoEncontrada = $extensao;
            break;
        }
    }

    if ($fotoEncontrada === null) {
        responderFoto(404, false, 'Nenhuma foto de perfil encontrada.');
    }

    if (!class_exists('finfo')) {
        responderFoto(
            500,
            false,
            'Não foi possível validar a imagem.'
        );
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeReal = $finfo->file($fotoEncontrada);

    if (
        !isset($mimesPermitidos[$extensaoEncontrada]) ||
        $mimeReal !== $mimesPermitidos[$extensaoEncontrada]
    ) {
        responderFoto(415, false, 'Imagem inválida.');
    }

    $informacoesImagem = @getimagesize($fotoEncontrada);

    if (
        $informacoesImagem === false ||
        ($informacoesImagem['mime'] ?? '') !== $mimeReal
    ) {
        responderFoto(415, false, 'Imagem inválida.');
    }

    session_write_close();

    header_remove('Content-Type');

    header('Content-Type: ' . $mimeReal);
    header('Content-Length: ' . filesize($fotoEncontrada));
    header('Content-Disposition: inline; filename="foto-perfil.' .
        $extensaoEncontrada . '"');
    header('X-Content-Type-Options: nosniff');

    readfile($fotoEncontrada);
    exit;
}

/*
|--------------------------------------------------------------------------
| ENVIO DA FOTO — POST
|--------------------------------------------------------------------------
*/

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: GET, POST');

    responderFoto(
        405,
        false,
        'Método de requisição não permitido.'
    );
}

// Validação do token CSRF.
$tokenSessao = $_SESSION['csrf_token'] ?? '';
$tokenRecebido = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';

if (
    !is_string($tokenSessao) ||
    $tokenSessao === '' ||
    !is_string($tokenRecebido) ||
    $tokenRecebido === '' ||
    !hash_equals($tokenSessao, $tokenRecebido)
) {
    responderFoto(
        403,
        false,
        'Não foi possível validar sua sessão. Atualize a página e tente novamente.'
    );
}

// Verifica o arquivo recebido.
if (!isset($_FILES['foto'])) {
    responderFoto(400, false, 'Selecione uma foto para enviar.');
}

$arquivo = $_FILES['foto'];

if (
    !is_array($arquivo) ||
    is_array($arquivo['error'] ?? null)
) {
    responderFoto(400, false, 'Envio de imagem inválido.');
}

if ($arquivo['error'] !== UPLOAD_ERR_OK) {

    $mensagensErro = [
        UPLOAD_ERR_INI_SIZE =>
            'A foto ultrapassa o limite permitido pelo servidor.',
        UPLOAD_ERR_FORM_SIZE =>
            'A foto ultrapassa o limite permitido.',
        UPLOAD_ERR_PARTIAL =>
            'O envio foi incompleto. Tente novamente.',
        UPLOAD_ERR_NO_FILE =>
            'Selecione uma foto para enviar.',
        UPLOAD_ERR_NO_TMP_DIR =>
            'A pasta temporária do servidor não está disponível.',
        UPLOAD_ERR_CANT_WRITE =>
            'O servidor não conseguiu receber a foto.',
        UPLOAD_ERR_EXTENSION =>
            'O envio foi bloqueado por uma extensão do PHP.'
    ];

    responderFoto(
        400,
        false,
        $mensagensErro[$arquivo['error']]
            ?? 'Não foi possível receber a foto.'
    );
}

if (
    !isset(
        $arquivo['tmp_name'],
        $arquivo['name'],
        $arquivo['size']
    ) ||
    !is_uploaded_file($arquivo['tmp_name'])
) {
    responderFoto(400, false, 'A imagem recebida não é válida.');
}

// Valida o tamanho máximo de 5 MB.
$limiteBytes = 5 * 1024 * 1024;

if (
    !is_numeric($arquivo['size']) ||
    (int) $arquivo['size'] < 1 ||
    (int) $arquivo['size'] > $limiteBytes
) {
    responderFoto(
        400,
        false,
        'A foto deve ter no máximo 5 MB.'
    );
}

// Valida a extensão informada.
$nomeOriginal = basename(
    str_replace('\\', '/', (string) $arquivo['name'])
);

$extensao = strtolower(
    pathinfo($nomeOriginal, PATHINFO_EXTENSION)
);

if (!isset($mimesPermitidos[$extensao])) {
    responderFoto(
        400,
        false,
        'Formato inválido. Envie uma imagem JPG, JPEG ou PNG.'
    );
}

// Valida o conteúdo real do arquivo.
if (!class_exists('finfo')) {
    responderFoto(
        500,
        false,
        'Não foi possível validar o tipo da imagem no servidor.'
    );
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mimeReal = $finfo->file($arquivo['tmp_name']);

if ($mimeReal !== $mimesPermitidos[$extensao]) {
    responderFoto(
        400,
        false,
        'O conteúdo da imagem não corresponde ao formato informado.'
    );
}

// Confirma que o arquivo é uma imagem válida.
$informacoesImagem = @getimagesize($arquivo['tmp_name']);

if (
    $informacoesImagem === false ||
    ($informacoesImagem['mime'] ?? '') !== $mimeReal
) {
    responderFoto(400, false, 'O arquivo enviado não é uma imagem válida.');
}

// Define o nome seguro usando o ID do usuário e a extensão validada.
$nomeSeguro = $idUsuario . '.' . $extensao;

$caminhoDestino = $pastaReal
    . DIRECTORY_SEPARATOR . $nomeSeguro;

$arquivoSalvo = false;

try {

    // Salva a nova foto.
    if (!move_uploaded_file($arquivo['tmp_name'], $caminhoDestino)) {
        responderFoto(
            500,
            false,
            'Não foi possível salvar a foto de perfil.'
        );
    }

    $arquivoSalvo = true;

    // Remove versões anteriores em outros formatos.
    foreach (array_keys($mimesPermitidos) as $extensaoAnterior) {

        if ($extensaoAnterior === $extensao) {
            continue;
        }

        $caminhoAnterior = $pastaReal
            . DIRECTORY_SEPARATOR
            . $idUsuario . '.' . $extensaoAnterior;

        if (is_file($caminhoAnterior)) {
            @unlink($caminhoAnterior);
        }
    }

    responderFoto(
        200,
        true,
        'Foto de perfil atualizada com sucesso.'
    );

} catch (Throwable $erro) {

    error_log(
        'Erro ao salvar foto de perfil no SalvusConnect: ' .
        $erro->getMessage()
    );

    responderFoto(
        500,
        false,
        'Não foi possível atualizar sua foto de perfil.'
    );
}
