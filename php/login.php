<?php

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');

// Caminhos das páginas
$paginaLogin = '../pages/login.html';
$paginaDashboard = '../pages/dashboard.html';
$paginaAdmin = '../pages/admin.html';

// Impede acesso direto ao processamento
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ' . $paginaLogin);
    exit;
}

// Recebe os dados do formulário
$email = $_POST['email'] ?? '';
$senha = $_POST['senha'] ?? '';

// Valida os campos
if (
    !is_string($email) ||
    !is_string($senha) ||
    trim($email) === '' ||
    $senha === ''
) {
    header('Location: ' . $paginaLogin . '?erro=campos');
    exit;
}

$email = trim($email);

try {
    require_once __DIR__ . '/conexao.php';

    if (!isset($conexao) || !$conexao instanceof PDO) {
        throw new RuntimeException('Conexão PDO indisponível.');
    }

    /*
     * DIAGNÓSTICO 1:
     * Identifica o banco e o servidor utilizados.
     */
    $ambiente = $conexao->query(
        'SELECT DATABASE() AS banco, @@hostname AS servidor'
    )->fetch(PDO::FETCH_ASSOC);

    /*
     * Busca o usuário pelo e-mail.
     */
    $sql = "
        SELECT
            id_usuario,
            nm_nome,
            email,
            senha,
            cd_tipo_usuario
        FROM tb_usuario
        WHERE email = :email
        LIMIT 1
    ";

    $consulta = $conexao->prepare($sql);

    $consulta->execute([
        'email' => $email
    ]);

    $usuario = $consulta->fetch(PDO::FETCH_ASSOC);

    /*
     * DIAGNÓSTICO 2:
     * Verifica o registro recuperado e a senha.
     * Nenhuma senha ou hash completo é registrado.
     */
    $usuarioEncontrado = is_array($usuario);
    $senhaValida = false;

    $idUsuario = 'NAO_ENCONTRADO';
    $tamanhoHash = 0;
    $algoritmoHash = 'NAO_DISPONIVEL';
    $formatoHashValido = false;

    if ($usuarioEncontrado) {
        $idUsuario = (string) $usuario['id_usuario'];

        if (
            isset($usuario['senha']) &&
            is_string($usuario['senha']) &&
            $usuario['senha'] !== ''
        ) {
            $hashGravado = $usuario['senha'];

            $tamanhoHash = strlen($hashGravado);

            $informacoesHash = password_get_info($hashGravado);

            $algoritmoHash = $informacoesHash['algoName'] ?? 'desconhecido';

            $formatoHashValido = (
                $algoritmoHash !== 'unknown' &&
                $algoritmoHash !== 'desconhecido'
            );

            if ($formatoHashValido) {
                $senhaValida = password_verify(
                    $senha,
                    $hashGravado
                );
            }
        }
    }

    /*
     * DIAGNÓSTICO 3:
     * Registra somente informações técnicas necessárias
     * para identificar a origem da falha.
     */
    error_log(
        'Diagnóstico login SalvusConnect: ' .
        'banco=' . ($ambiente['banco'] ?? 'INDEFINIDO') .
        '; servidor=' . ($ambiente['servidor'] ?? 'INDEFINIDO') .
        '; usuario_encontrado=' . ($usuarioEncontrado ? 'SIM' : 'NAO') .
        '; id_usuario=' . $idUsuario .
        '; tamanho_hash=' . $tamanhoHash .
        '; algoritmo_hash=' . $algoritmoHash .
        '; formato_hash_valido=' . ($formatoHashValido ? 'SIM' : 'NAO') .
        '; senha_recebida_bytes=' . strlen($senha) .
        '; senha_valida=' . ($senhaValida ? 'SIM' : 'NAO')
    );

    /*
     * Diferencia usuário não encontrado de senha incorreta.
     */
    if (!$usuarioEncontrado) {
        header('Location: ' . $paginaLogin . '?erro=conta');
        exit;
    }

    if (!$senhaValida) {
        header('Location: ' . $paginaLogin . '?erro=credenciais');
        exit;
    }

    /*
     * Verifica o tipo de usuário.
     */
    $tipoUsuario = (int) $usuario['cd_tipo_usuario'];

    if (!in_array($tipoUsuario, [0, 1, 3], true)) {
        header('Location: ' . $paginaLogin . '?erro=tipo');
        exit;
    }

    /*
     * Renova o identificador da sessão.
     */
    session_regenerate_id(true);

    /*
     * Armazena os dados do usuário.
     */
    $_SESSION['id_usuario'] = (int) $usuario['id_usuario'];
    $_SESSION['nm_nome'] = $usuario['nm_nome'];
    $_SESSION['email'] = $usuario['email'];
    $_SESSION['cd_tipo_usuario'] = $tipoUsuario;

    /*
     * Gera o token CSRF da sessão autenticada.
     */
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));

    /*
     * Direciona conforme o tipo de conta.
     */
    switch ($tipoUsuario) {
        case 0:
            header('Location: ' . $paginaAdmin);
            exit;

        case 1:
        case 3:
            header('Location: ' . $paginaDashboard);
            exit;
    }

} catch (Throwable $erro) {
    error_log(
        'Erro no login do SalvusConnect: ' . $erro->getMessage()
    );

    http_response_code(500);

    exit(
        'Não foi possível realizar o login. ' .
        'Tente novamente mais tarde.'
    );
}