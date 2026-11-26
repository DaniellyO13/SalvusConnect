<?php
session_start();

require_once __DIR__ . '/conexao.php';

header('Content-Type: application/json; charset=utf-8');

function responderJson(array $dados, int $status = 200): void
{
    http_response_code($status);

    echo json_encode(
        $dados,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    responderJson([
        'sucesso' => false,
        'mensagem' => 'Método de requisição inválido.'
    ], 405);
}

/* Dados do formulário */
$nome = trim($_POST['nm_nome'] ?? '');
$email = trim($_POST['email'] ?? '');
$cpf = preg_replace('/\D/', '', $_POST['nr_cpf'] ?? '');
$cnh = strtoupper(trim($_POST['cnh'] ?? ''));
$tipoCnh = strtoupper(trim($_POST['nm_tipo_cnh'] ?? ''));

$senha = $_POST['senha'] ?? '';
$confirmarSenha = $_POST['confirmar_senha'] ?? '';

$tipoUsuarioRecebido = $_POST['cd_tipo_usuario'] ?? '';

if (!in_array((string) $tipoUsuarioRecebido, ['1', '3'], true)) {
    responderJson([
        'sucesso' => false,
        'mensagem' => 'Selecione um tipo de conta válido.'
    ], 422);
}

$tipoUsuario = (int) $tipoUsuarioRecebido;

/* Telefones: opcionais e utilizados somente para clientes */
$telefones = [];

if ($tipoUsuario === 3) {
    $telefonesRecebidos = [
        'Principal' => $_POST['telefone'] ?? '',
        'Familiar' => $_POST['telefone_familiar'] ?? '',
        'Terceiros' => $_POST['telefone_terceiros'] ?? ''
    ];

    foreach ($telefonesRecebidos as $tipo => $numero) {
        $numero = preg_replace('/\D/', '', trim($numero));

        if ($numero !== '') {
            if (!in_array(strlen($numero), [10, 11], true)) {
                responderJson([
                    'sucesso' => false,
                    'mensagem' => "Confira o número de telefone: {$tipo}."
                ], 422);
            }

            $telefones[$tipo] = $numero;
        }
    }
}

/* Validações */
if ($nome === '' || $email === '' || $senha === '' || $confirmarSenha === '') {
    responderJson([
        'sucesso' => false,
        'mensagem' => 'Preencha todos os campos obrigatórios.'
    ], 422);
}

if (mb_strlen($nome) > 100) {
    responderJson([
        'sucesso' => false,
        'mensagem' => 'O nome deve ter no máximo 100 caracteres.'
    ], 422);
}

if (mb_strlen($email) > 150 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    responderJson([
        'sucesso' => false,
        'mensagem' => 'Informe um endereço de e-mail válido.'
    ], 422);
}

if ($cpf !== '' && strlen($cpf) !== 11) {
    responderJson([
        'sucesso' => false,
        'mensagem' => 'O CPF deve conter 11 números ou ficar em branco.'
    ], 422);
}

if (strlen($cnh) > 20 || strlen($tipoCnh) > 3) {
    responderJson([
        'sucesso' => false,
        'mensagem' => 'Confira os dados da CNH.'
    ], 422);
}

if (strlen($senha) < 8) {
    responderJson([
        'sucesso' => false,
        'mensagem' => 'A senha deve ter pelo menos 8 caracteres.'
    ], 422);
}

if ($senha !== $confirmarSenha) {
    responderJson([
        'sucesso' => false,
        'mensagem' => 'As senhas não coincidem.'
    ], 422);
}

try {
    $conexao->beginTransaction();

    /* Verifica se o e-mail já está cadastrado */
    $consultaEmail = $conexao->prepare(
        'SELECT id_usuario
         FROM tb_usuario
         WHERE email = :email
         LIMIT 1'
    );

    $consultaEmail->execute(['email' => $email]);

    if ($consultaEmail->fetch()) {
        $conexao->rollBack();

        responderJson([
            'sucesso' => false,
            'mensagem' => 'Este e-mail já está cadastrado.'
        ], 409);
    }

    /* Cria o usuário */
    $senhaHash = password_hash($senha, PASSWORD_DEFAULT);

    if ($senhaHash === false) {
        throw new RuntimeException(
            'Não foi possível gerar o hash da senha.'
        );
    }

    $sqlUsuario = '
        INSERT INTO tb_usuario
            (nm_nome, nr_cpf, cnh, nm_tipo_cnh, email, senha, cd_tipo_usuario)
        VALUES
            (:nome, :cpf, :cnh, :tipo_cnh, :email, :senha, :tipo_usuario)
    ';

    $inserirUsuario = $conexao->prepare($sqlUsuario);

    $inserirUsuario->execute([
        'nome' => $nome,
        'cpf' => $cpf !== '' ? $cpf : null,
        'cnh' => $cnh !== '' ? $cnh : null,
        'tipo_cnh' => $tipoCnh !== '' ? $tipoCnh : null,
        'email' => $email,
        'senha' => $senhaHash,
        'tipo_usuario' => $tipoUsuario
    ]);

    $idUsuario = (int) $conexao->lastInsertId();

    /* Salva somente os telefones preenchidos do cliente */
    if ($tipoUsuario === 3 && !empty($telefones)) {
        $sqlTelefone = '
            INSERT INTO tb_telefone
                (nr_telefone, nm_tipo_telefone, tb_usuario_id_usuario)
            VALUES
                (:telefone, :tipo_telefone, :id_usuario)
        ';

        $inserirTelefone = $conexao->prepare($sqlTelefone);

        foreach ($telefones as $tipo => $numero) {
            $inserirTelefone->execute([
                'telefone' => $numero,
                'tipo_telefone' => $tipo,
                'id_usuario' => $idUsuario
            ]);
        }
    }

    /*
     * Prestador: registra a pendência na tabela existente.
     * Nenhum arquivo é considerado enviado neste momento.
     */
    if ($tipoUsuario === 1) {
        $sqlAntecedente = '
            INSERT INTO tb_antecedentes
                (
                    nm_arquivo,
                    ds_arquivo,
                    nm_tipo_arquivo,
                    dt_envio,
                    st_analise,
                    dt_proxima_atualizacao,
                    ds_observacao,
                    tb_usuario_id_usuario,
                    tb_administrador_id_usuario
                )
            VALUES
                (
                    :arquivo,
                    :descricao,
                    :tipo_arquivo,
                    NULL,
                    :status,
                    NULL,
                    :observacao,
                    :id_usuario,
                    NULL
                )
        ';

        $inserirAntecedente = $conexao->prepare($sqlAntecedente);

        $inserirAntecedente->execute([
            'arquivo' => 'Pendente de envio',
            'descricao' => 'Documento ainda não enviado.',
            'tipo_arquivo' => 'Antecedentes criminais',
            'status' => 'PENDENTE',
            'observacao' => 'Aguardando envio do documento para análise.',
            'id_usuario' => $idUsuario
        ]);
    }

    $conexao->commit();

    /* Cadastro concluído: o usuário deverá entrar manualmente */
    $mensagem = $tipoUsuario === 1
        ? 'Cadastro concluído com sucesso! Faça login para acessar sua conta. O envio dos antecedentes criminais ainda está pendente.'
        : 'Cadastro concluído com sucesso! Faça login para acessar sua conta.';

    responderJson([
        'sucesso' => true,
        'mensagem' => $mensagem,
        'redirect' => 'login.html'
    ]);

} catch (Throwable $erro) {
    if ($conexao->inTransaction()) {
        $conexao->rollBack();
    }

    error_log(
        'Erro no cadastro do SalvusConnect: ' . $erro->getMessage()
    );

    responderJson([
        'sucesso' => false,
        'mensagem' => 'Não foi possível concluir o cadastro. Tente novamente.'
    ], 500);
}
