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

if (empty($_SESSION['id_usuario'])) {
    responder(401, [
        'sucesso' => false,
        'mensagem' => 'Sua sessão expirou. Entre novamente.'
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    responder(405, [
        'sucesso' => false,
        'mensagem' => 'Método não permitido.'
    ]);
}

// Validação do token CSRF
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

$dados = json_decode(file_get_contents('php://input'), true);

if (!is_array($dados)) {
    responder(400, [
        'sucesso' => false,
        'mensagem' => 'Os dados enviados são inválidos.'
    ]);
}

$nome = trim((string) ($dados['nm_nome'] ?? ''));
$email = trim((string) ($dados['email'] ?? ''));

$cpf = preg_replace(
    '/\D+/',
    '',
    (string) ($dados['nr_cpf'] ?? '')
);

$cnh = trim((string) ($dados['cnh'] ?? ''));

$tipoCnh = strtoupper(
    trim((string) ($dados['nm_tipo_cnh'] ?? ''))
);

$telefone = preg_replace(
    '/\D+/',
    '',
    (string) ($dados['nr_telefone'] ?? '')
);

$sobreMim = trim(
    (string) ($dados['ds_sobre_mim'] ?? '')
);

if (
    $nome === '' ||
    mb_strlen($nome, 'UTF-8') > 100
) {
    responder(422, [
        'sucesso' => false,
        'mensagem' => 'Informe um nome de até 100 caracteres.'
    ]);
}

if (
    !filter_var($email, FILTER_VALIDATE_EMAIL) ||
    strlen($email) > 150
) {
    responder(422, [
        'sucesso' => false,
        'mensagem' => 'Informe um e-mail válido de até 150 caracteres.'
    ]);
}

if ($cpf !== '' && strlen($cpf) !== 11) {
    responder(422, [
        'sucesso' => false,
        'mensagem' => 'O CPF deve conter 11 números.'
    ]);
}

if (strlen($cnh) > 20 || strlen($tipoCnh) > 3) {
    responder(422, [
        'sucesso' => false,
        'mensagem' => 'Confira os campos de CNH.'
    ]);
}

if (
    $telefone !== '' &&
    !in_array(strlen($telefone), [10, 11], true)
) {
    responder(422, [
        'sucesso' => false,
        'mensagem' => 'O telefone deve conter DDD e número.'
    ]);
}

if (mb_strlen($sobreMim, 'UTF-8') > 1000) {
    responder(422, [
        'sucesso' => false,
        'mensagem' => 'A descrição deve ter até 1000 caracteres.'
    ]);
}

try {
    require_once __DIR__ . '/conexao.php';

    if (!isset($conexao) || !$conexao instanceof PDO) {
        throw new RuntimeException('Conexão PDO indisponível.');
    }

    $conexao->beginTransaction();

    // Impede que duas contas utilizem o mesmo e-mail.
    $verificarEmail = $conexao->prepare(
        'select id_usuario
         from tb_usuario
         where email = :email
           and id_usuario <> :id_usuario
         limit 1'
    );

    $verificarEmail->execute([
        'email' => $email,
        'id_usuario' => $idUsuario
    ]);

    if ($verificarEmail->fetch(PDO::FETCH_ASSOC)) {
        $conexao->rollBack();

        responder(409, [
            'sucesso' => false,
            'mensagem' => 'Este e-mail já está cadastrado em outra conta.'
        ]);
    }

    // Atualiza somente as colunas existentes em tb_usuario.
    $atualizar = $conexao->prepare(
        'update tb_usuario
         set nm_nome = :nm_nome,
             nr_cpf = :nr_cpf,
             cnh = :cnh,
             nm_tipo_cnh = :nm_tipo_cnh,
             email = :email,
             ds_sobre_mim = :ds_sobre_mim
         where id_usuario = :id_usuario'
    );

    $atualizar->execute([
        'nm_nome' => $nome,
        'nr_cpf' => $cpf !== '' ? $cpf : null,
        'cnh' => $cnh !== '' ? $cnh : null,
        'nm_tipo_cnh' => $tipoCnh !== '' ? $tipoCnh : null,
        'email' => $email,
        'ds_sobre_mim' => $sobreMim !== ''
            ? $sobreMim
            : null,
        'id_usuario' => $idUsuario
    ]);

    // Procura o telefone principal para preservar os outros telefones.
    if ($telefone !== '') {
        $buscarTelefone = $conexao->prepare(
            "select id_telefone
             from tb_telefone
             where tb_usuario_id_usuario = :id_usuario
               and lower(trim(coalesce(nm_tipo_telefone, '')))
                   in ('principal', 'telefone principal')
             order by id_telefone
             limit 1"
        );

        $buscarTelefone->execute([
            'id_usuario' => $idUsuario
        ]);

        $idTelefone = $buscarTelefone->fetchColumn();

        if ($idTelefone) {
            $salvarTelefone = $conexao->prepare(
                'update tb_telefone
                 set nr_telefone = :telefone
                 where id_telefone = :id_telefone
                   and tb_usuario_id_usuario = :id_usuario'
            );

            $salvarTelefone->execute([
                'telefone' => $telefone,
                'id_telefone' => (int) $idTelefone,
                'id_usuario' => $idUsuario
            ]);

        } else {
            $inserirTelefone = $conexao->prepare(
                "insert into tb_telefone
                    (nr_telefone, nm_tipo_telefone, tb_usuario_id_usuario)
                 values
                    (:telefone, 'principal', :id_usuario)"
            );

            $inserirTelefone->execute([
                'telefone' => $telefone,
                'id_usuario' => $idUsuario
            ]);
        }
    }

    // Consulta o telefone mais relevante antes de confirmar a transação.
    $telefoneConsulta = $conexao->prepare(
        "select nr_telefone
         from tb_telefone
         where tb_usuario_id_usuario = :id_usuario
         order by
            case
                when lower(trim(coalesce(nm_tipo_telefone, '')))
                    in ('principal', 'telefone principal')
                then 0
                else 1
            end,
            id_telefone
         limit 1"
    );

    $telefoneConsulta->execute([
        'id_usuario' => $idUsuario
    ]);

    $telefoneAtual = $telefoneConsulta->fetchColumn();

    // Retorna os dados atualizados do usuário.
    $usuarioConsulta = $conexao->prepare(
        'select
            id_usuario,
            nm_nome,
            nr_cpf,
            cnh,
            nm_tipo_cnh,
            email,
            cd_tipo_usuario,
            ds_sobre_mim
         from tb_usuario
         where id_usuario = :id_usuario
         limit 1'
    );

    $usuarioConsulta->execute([
        'id_usuario' => $idUsuario
    ]);

    $usuario = $usuarioConsulta->fetch(PDO::FETCH_ASSOC);

    if (!$usuario) {
        throw new RuntimeException(
            'Não foi possível consultar os dados atualizados do usuário.'
        );
    }

    $tipos = [
        0 => 'Administrador',
        1 => 'Prestador',
        3 => 'Cliente'
    ];

    $usuario['id_usuario'] = (int) $usuario['id_usuario'];

    $usuario['cd_tipo_usuario'] =
        (int) $usuario['cd_tipo_usuario'];

    $usuario['tipo_usuario'] =
        $tipos[$usuario['cd_tipo_usuario']] ?? 'Usuário';

    $usuario['nr_telefone'] = $telefoneAtual ?: null;

    // Atualiza os dados da sessão.
    // O tipo de usuário não pode ser alterado pelo formulário.
    $_SESSION['nm_nome'] = $usuario['nm_nome'];
    $_SESSION['email'] = $usuario['email'];

    $conexao->commit();

    responder(200, [
        'sucesso' => true,
        'mensagem' => 'Seu perfil foi salvo com sucesso.',
        'usuario' => $usuario
    ]);

} catch (Throwable $e) {
    if (
        isset($conexao) &&
        $conexao instanceof PDO &&
        $conexao->inTransaction()
    ) {
        $conexao->rollBack();
    }

    error_log('Erro em sa_perfil.php: ' . $e->getMessage());

    responder(500, [
        'sucesso' => false,
        'mensagem' => 'Não foi possível salvar o perfil. Confira os campos e tente novamente.'
    ]);
}