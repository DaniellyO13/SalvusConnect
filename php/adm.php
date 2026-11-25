<?php

session_start();

require_once __DIR__ . '/conexao.php';

// Verifica se já existe algum administrador cadastrado.
$existeAdministrador = false;

try {
    $consultaAdministradores = $conexao->query(
        'SELECT COUNT(*) FROM tb_usuario WHERE cd_tipo_usuario = 0'
    );

    $existeAdministrador = (int) $consultaAdministradores->fetchColumn() > 0;

} catch (Throwable $e) {
    error_log(
        'Erro ao verificar administradores: ' . $e->getMessage()
    );

    http_response_code(500);
    exit('Não foi possível verificar o cadastro administrativo.');
}

// Permite o cadastro inicial somente pelo computador local
// enquanto ainda não existir nenhum administrador.
$acessoLocal = in_array(
    $_SERVER['REMOTE_ADDR'] ?? '',
    ['127.0.0.1', '::1'],
    true
);

$administradorAutenticado =
    isset($_SESSION['id_usuario']) &&
    isset($_SESSION['cd_tipo_usuario']) &&
    (int) $_SESSION['cd_tipo_usuario'] === 0;

$cadastroInicialPermitido =
    !$existeAdministrador && $acessoLocal;

// Bloqueia o acesso se não for administrador autenticado
// nem cadastro inicial autorizado.
if (!$administradorAutenticado && !$cadastroInicialPermitido) {
    header('Location: ../pages/login.html');
    exit;
}

if (empty($_SESSION['token_adm'])) {
    $_SESSION['token_adm'] = bin2hex(random_bytes(32));
}

$mensagens = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $token = $_POST['token_adm'] ?? '';

    if (
        !is_string($token) ||
        !hash_equals($_SESSION['token_adm'], $token)
    ) {
        http_response_code(403);
        exit('Solicitação inválida. Atualize a página e tente novamente.');
    }

    $usuarios = $_POST['usuarios'] ?? [];

    if (!is_array($usuarios)) {
        $usuarios = [];
    }

    for ($i = 0; $i < 3; $i++) {

        $dados = $usuarios[$i] ?? [];

        if (!is_array($dados)) {
            $mensagens[] = 'Administrador ' . ($i + 1) . ': dados inválidos.';
            continue;
        }

        $nome = trim($dados['nome'] ?? '');
        $email = trim($dados['email'] ?? '');
        $senha = $dados['senha'] ?? '';

        if (
            $nome === '' ||
            strlen($nome) > 100 ||
            !is_string($email) ||
            strlen($email) > 150 ||
            !filter_var($email, FILTER_VALIDATE_EMAIL) ||
            !is_string($senha) ||
            strlen($senha) < 8
        ) {
            $mensagens[] =
                'Administrador ' . ($i + 1) .
                ': confira o nome, o e-mail e a senha (mínimo de 8 caracteres).';
            continue;
        }

        try {

            $consulta = $conexao->prepare(
                'select id_usuario
                 from tb_usuario
                 where email = :email
                 limit 1'
            );

            $consulta->execute([
                'email' => $email
            ]);

            if ($consulta->fetch()) {
                $mensagens[] =
                    'O e-mail informado para o administrador ' .
                    ($i + 1) . ' já está cadastrado.';
                continue;
            }

            $senhaHash = password_hash($senha, PASSWORD_DEFAULT);

            if ($senhaHash === false) {
                throw new RuntimeException('Falha ao proteger a senha.');
            }

            $inserir = $conexao->prepare(
                'insert into tb_usuario
                    (nm_nome, email, senha, cd_tipo_usuario)
                 values
                    (:nome, :email, :senha, 0)'
            );

            $inserir->execute([
                'nome' => $nome,
                'email' => $email,
                'senha' => $senhaHash
            ]);

            $mensagens[] =
                'Administrador cadastrado com sucesso: ' .
                htmlspecialchars($nome, ENT_QUOTES, 'UTF-8') . '.';

        } catch (Throwable $e) {

            error_log('Erro ao cadastrar administrador: ' . $e->getMessage());

            $mensagens[] =
                'Não foi possível cadastrar o administrador ' .
                ($i + 1) . '. Tente novamente.';
        }
    }

    // Atualiza o token após o processamento.
    $_SESSION['token_adm'] = bin2hex(random_bytes(32));
}
?>

<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cadastrar administradores - SalvusConnect</title>

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 30px 16px;
            font-family: Arial, sans-serif;
            background: #f0f4f8;
            color: #1a2a4a;
        }

        main {
            max-width: 650px;
            margin: auto;
            padding: 28px;
            background: white;
            border-radius: 12px;
        }

        h1 {
            color: #1b3a6b;
        }

        .administrador {
            margin: 20px 0;
            padding: 18px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
        }

        label {
            display: block;
            margin-top: 12px;
            font-weight: bold;
        }

        input {
            width: 100%;
            padding: 11px;
            margin-top: 6px;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
        }

        button {
            width: 100%;
            padding: 13px;
            margin-top: 20px;
            border: 0;
            border-radius: 6px;
            background: #1b3a6b;
            color: white;
            font-size: 16px;
            cursor: pointer;
        }

        button:hover {
            background: #142d53;
        }

        .mensagens {
            padding: 14px;
            margin-bottom: 20px;
            background: #f1f5f9;
            border-radius: 8px;
            overflow-wrap: anywhere;
        }
    </style>
</head>

<body>

<main>

    <h1>SalvusConnect</h1>
    <h2>Cadastro dos três administradores</h2>

    <p>
        Preencha os dados das três contas. Cada uma será registrada
        com o código de usuário 0 (administrador).
    </p>

    <?php if ($mensagens): ?>
        <section class="mensagens">
            <strong>Resultado:</strong>

            <ul>
                <?php foreach ($mensagens as $mensagem): ?>
                    <li><?= $mensagem ?></li>
                <?php endforeach; ?>
            </ul>
        </section>
    <?php endif; ?>

    <form method="post">

        <input
            type="hidden"
            name="token_adm"
            value="<?= htmlspecialchars(
                $_SESSION['token_adm'],
                ENT_QUOTES,
                'UTF-8'
            ) ?>"
        >

        <?php for ($i = 0; $i < 3; $i++): ?>

            <section class="administrador">

                <h3>Administrador <?= $i + 1 ?></h3>

                <label for="nome<?= $i ?>">Nome completo</label>

                <input
                    id="nome<?= $i ?>"
                    type="text"
                    name="usuarios[<?= $i ?>][nome]"
                    maxlength="100"
                    autocomplete="name"
                    required
                >

                <label for="email<?= $i ?>">E-mail</label>

                <input
                    id="email<?= $i ?>"
                    type="email"
                    name="usuarios[<?= $i ?>][email]"
                    maxlength="150"
                    autocomplete="email"
                    required
                >

                <label for="senha<?= $i ?>">Senha</label>

                <input
                    id="senha<?= $i ?>"
                    type="password"
                    name="usuarios[<?= $i ?>][senha]"
                    minlength="8"
                    autocomplete="new-password"
                    required
                >

            </section>

        <?php endfor; ?>

        <button type="submit">
            Cadastrar administradores
        </button>

    </form>

</main>

</body>
</html>
