<?php

session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

const VERSAO_TERMO_CLIENTE = '1.0';
const VERSAO_TERMO_PRESTADOR = '1.0';
const VERSAO_AVISO_ANTECEDENTES = '1.0';

$diretorioRegistros = dirname(__DIR__) . '/storage/registros_termos/';

/**
 * Envia uma resposta JSON e encerra a execução.
 */
function responder(array $dados, int $status = 200): void
{
    http_response_code($status);

    echo json_encode(
        $dados,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    exit;
}

/**
 * Identifica o perfil e a versão dos termos.
 */
function obterPerfil(int $tipoUsuario): ?array
{
    if ($tipoUsuario === 3) {
        return [
            'perfil' => 'cliente',
            'versao' => VERSAO_TERMO_CLIENTE
        ];
    }

    if ($tipoUsuario === 1) {
        return [
            'perfil' => 'prestador',
            'versao' => VERSAO_TERMO_PRESTADOR
        ];
    }

    return null;
}

/**
 * Lê o registro individual do usuário.
 * Também reconhece registros criados pela versão anterior do arquivo.
 */
function lerRegistro(string $arquivo, int $idUsuario, string $perfil): array
{
    if (!is_file($arquivo)) {
        return [];
    }

    $conteudo = file_get_contents($arquivo);

    if ($conteudo === false) {
        return [];
    }

    $registro = json_decode($conteudo, true);

    if (
        !is_array($registro) ||
        ($registro['id_usuario'] ?? null) !== $idUsuario ||
        ($registro['perfil'] ?? null) !== $perfil
    ) {
        return [];
    }

    // Compatibilidade com o formato anterior.
    if (!isset($registro['termos']) && isset($registro['versao_termos'])) {
        $confirmacoesAntigas = $registro['confirmacoes'] ?? [];

        $registro['termos'] = [
            'versao' => $registro['versao_termos'],
            'aceito_em' => $registro['aceito_em'] ?? null,
            'confirmacoes' => [
                'leitura' => ($confirmacoesAntigas['leitura'] ?? false) === true,
                'concordancia' => ($confirmacoesAntigas['concordancia'] ?? false) === true
            ]
        ];
    }

    return $registro;
}

/**
 * Verifica se os termos vigentes foram aceitos.
 */
function termosAceitos(array $registro, string $versao): bool
{
    $termos = $registro['termos'] ?? [];
    $confirmacoes = $termos['confirmacoes'] ?? [];

    return
        ($termos['versao'] ?? null) === $versao &&
        ($confirmacoes['leitura'] ?? false) === true &&
        ($confirmacoes['concordancia'] ?? false) === true;
}

/**
 * Verifica se o aviso vigente de antecedentes foi aceito.
 */
function antecedentesAceitos(array $registro): bool
{
    $antecedentes = $registro['antecedentes'] ?? [];

    return
        ($antecedentes['versao'] ?? null) === VERSAO_AVISO_ANTECEDENTES &&
        ($antecedentes['concordou'] ?? false) === true;
}

/**
 * Grava o registro de forma protegida.
 */
function salvarRegistro(
    string $arquivo,
    string $diretorio,
    array $registro
): bool {

    if (
        !is_dir($diretorio) ||
        !is_writable($diretorio)
    ) {
        return false;
    }

    $conteudo = json_encode(
        $registro,
        JSON_PRETTY_PRINT |
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES
    );

    if ($conteudo === false) {
        return false;
    }

    $arquivoBloqueio = $arquivo . '.lock';
    $bloqueio = fopen($arquivoBloqueio, 'c');

    if ($bloqueio === false) {
        return false;
    }

    $arquivoTemporario = null;
    $gravado = false;
    $bloqueado = false;

    try {

        $bloqueado = flock($bloqueio, LOCK_EX);

        if (!$bloqueado) {
            return false;
        }

        $arquivoTemporario = $arquivo . '.tmp.' . bin2hex(random_bytes(8));

        $bytesGravados = file_put_contents(
            $arquivoTemporario,
            $conteudo,
            LOCK_EX
        );

        if (
            $bytesGravados === false ||
            $bytesGravados !== strlen($conteudo)
        ) {
            return false;
        }

        $gravado = rename($arquivoTemporario, $arquivo);

        return $gravado;

    } finally {

        if (
            $arquivoTemporario !== null &&
            is_file($arquivoTemporario)
        ) {
            unlink($arquivoTemporario);
        }

        if ($bloqueado) {
            flock($bloqueio, LOCK_UN);
        }

        fclose($bloqueio);
    }
}

// Verifica a sessão autenticada.
if (
    !isset($_SESSION['id_usuario']) ||
    !isset($_SESSION['cd_tipo_usuario'])
) {
    responder([
        'sucesso' => false,
        'mensagem' => 'Usuário não autenticado.'
    ], 401);
}

$idUsuario = filter_var(
    $_SESSION['id_usuario'],
    FILTER_VALIDATE_INT
);

$tipoUsuario = filter_var(
    $_SESSION['cd_tipo_usuario'],
    FILTER_VALIDATE_INT
);

if (
    $idUsuario === false ||
    $idUsuario <= 0 ||
    $tipoUsuario === false
) {
    responder([
        'sucesso' => false,
        'mensagem' => 'Dados da sessão inválidos.'
    ], 401);
}

// Administradores não precisam aceitar os documentos.
if ($tipoUsuario === 0) {
    responder([
        'sucesso' => true,
        'perfil' => 'administrador',
        'termos_aceitos' => true,
        'antecedentes_aceitos' => true,
        'mostrar_termos' => false,
        'mostrar_aviso_antecedentes' => false
    ]);
}

$dadosPerfil = obterPerfil($tipoUsuario);

if ($dadosPerfil === null) {
    responder([
        'sucesso' => false,
        'mensagem' => 'Tipo de usuário não permitido.'
    ], 403);
}

$perfil = $dadosPerfil['perfil'];
$versaoTermos = $dadosPerfil['versao'];

$arquivoRegistro = $diretorioRegistros . $idUsuario . '.json';

// Garante que o token CSRF esteja disponível.
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$metodo = $_SERVER['REQUEST_METHOD'];

/*
|--------------------------------------------------------------------------
| GET: consulta os aceites registrados.
|--------------------------------------------------------------------------
*/

if ($metodo === 'GET') {

    $registro = lerRegistro(
        $arquivoRegistro,
        $idUsuario,
        $perfil
    );

    $aceitouTermos = termosAceitos(
        $registro,
        $versaoTermos
    );

    $aceitouAntecedentes = false;

    if ($perfil === 'prestador' && $aceitouTermos) {
        $aceitouAntecedentes = antecedentesAceitos($registro);
    }

    responder([
        'sucesso' => true,
        'perfil' => $perfil,
        'versao_termos' => $versaoTermos,
        'versao_aviso_antecedentes' => (
            $perfil === 'prestador'
                ? VERSAO_AVISO_ANTECEDENTES
                : null
        ),
        'termos_aceitos' => $aceitouTermos,
        'antecedentes_aceitos' => $aceitouAntecedentes,
        'mostrar_termos' => !$aceitouTermos,
        'mostrar_aviso_antecedentes' => (
            $perfil === 'prestador' &&
            $aceitouTermos &&
            !$aceitouAntecedentes
        ),
        'csrf_token' => $_SESSION['csrf_token']
    ]);
}

/*
|--------------------------------------------------------------------------
| POST: registra os aceites individualmente.
|--------------------------------------------------------------------------
*/

if ($metodo === 'POST') {

    // Validação CSRF.
    $tokenEnviado = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';

    if (
        empty($_SESSION['csrf_token']) ||
        !is_string($tokenEnviado) ||
        !hash_equals($_SESSION['csrf_token'], $tokenEnviado)
    ) {
        responder([
            'sucesso' => false,
            'mensagem' => 'Token de segurança inválido. Atualize a página e tente novamente.'
        ], 403);
    }

    $entrada = json_decode(
        file_get_contents('php://input'),
        true
    );

    if (!is_array($entrada)) {
        responder([
            'sucesso' => false,
            'mensagem' => 'Dados enviados inválidos.'
        ], 400);
    }

    $acao = $entrada['acao'] ?? '';

    if (!in_array($acao, [
        'aceitar_termos',
        'aceitar_antecedentes'
    ], true)) {
        responder([
            'sucesso' => false,
            'mensagem' => 'Ação não reconhecida.'
        ], 400);
    }

    $registro = lerRegistro(
        $arquivoRegistro,
        $idUsuario,
        $perfil
    );

    $registro['id_usuario'] = $idUsuario;
    $registro['tipo_usuario'] = $tipoUsuario;
    $registro['perfil'] = $perfil;

    $dataAtual = (new DateTimeImmutable(
        'now',
        new DateTimeZone('America/Sao_Paulo')
    ))->format(DateTimeInterface::ATOM);

    /*
    |--------------------------------------------------------------------------
    | Aceite dos termos.
    |--------------------------------------------------------------------------
    */

    if ($acao === 'aceitar_termos') {

        $confirmacoes = $entrada['confirmacoes'] ?? null;

        if (
            !is_array($confirmacoes) ||
            ($confirmacoes['leitura'] ?? null) !== true ||
            ($confirmacoes['concordancia'] ?? null) !== true
        ) {
            responder([
                'sucesso' => false,
                'mensagem' => 'É necessário confirmar as duas declarações.'
            ], 422);
        }

        // Uma nova versão de termos exige novo aceite.
        $registro['termos'] = [
            'versao' => $versaoTermos,
            'aceito_em' => $dataAtual,
            'confirmacoes' => [
                'leitura' => true,
                'concordancia' => true
            ]
        ];

        // Se os termos forem aceitos novamente, uma confirmação
        // antiga de antecedentes não é apagada automaticamente.
    }

    /*
    |--------------------------------------------------------------------------
    | Aceite do aviso de antecedentes.
    |--------------------------------------------------------------------------
    */

    if ($acao === 'aceitar_antecedentes') {

        if ($perfil !== 'prestador') {
            responder([
                'sucesso' => false,
                'mensagem' => 'Esta confirmação é exclusiva para prestadores.'
            ], 403);
        }

        if (!termosAceitos($registro, $versaoTermos)) {
            responder([
                'sucesso' => false,
                'mensagem' => 'É necessário aceitar os termos do prestador antes desta confirmação.'
            ], 403);
        }

        if (($entrada['concordo'] ?? null) !== true) {
            responder([
                'sucesso' => false,
                'mensagem' => 'A concordância com o aviso de antecedentes é necessária.'
            ], 422);
        }

        $registro['antecedentes'] = [
            'versao' => VERSAO_AVISO_ANTECEDENTES,
            'aceito_em' => $dataAtual,
            'concordou' => true
        ];
    }

    // Grava o registro individual.
    if (!salvarRegistro(
        $arquivoRegistro,
        $diretorioRegistros,
        $registro
    )) {
        responder([
            'sucesso' => false,
            'mensagem' => 'Não foi possível gravar o registro. Verifique a pasta de armazenamento.'
        ], 500);
    }

    responder([
        'sucesso' => true,
        'mensagem' => (
            $acao === 'aceitar_termos'
                ? 'Aceite dos termos registrado com sucesso.'
                : 'Concordância com o aviso de antecedentes registrada com sucesso.'
        ),
        'perfil' => $perfil,
        'acao' => $acao,
        'termos_aceitos' => termosAceitos($registro, $versaoTermos),
        'antecedentes_aceitos' => (
            $perfil === 'prestador'
                ? antecedentesAceitos($registro)
                : false
        )
    ]);
}

header('Allow: GET, POST');

responder([
    'sucesso' => false,
    'mensagem' => 'Método não permitido.'
], 405);
