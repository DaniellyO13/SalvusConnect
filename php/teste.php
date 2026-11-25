<?php

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$resultado = null;
$erroGeral = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $email = $_POST['email'] ?? '';
    $senha = $_POST['senha'] ?? '';

    $camposRecebidos = (
        is_string($email) &&
        trim($email) !== '' &&
        is_string($senha) &&
        $senha !== ''
    );

    $email = is_string($email) ? trim($email) : '';
    $senha = is_string($senha) ? $senha : '';

    $resultado = [
        'campos' => $camposRecebidos,
        'email_valido' => false,
        'usuario_encontrado' => false,
        'hash_compativel' => false,
        'senha_valida' => false,
        'tipo_usuario' => null,
        'mensagem' => ''
    ];

    if (!$camposRecebidos) {

        $resultado['mensagem'] = 'Preencha o e-mail e a senha.';

    } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {

        $resultado['mensagem'] = 'O formato do e-mail é inválido.';

    } else {

        $resultado['email_valido'] = true;

        try {

            require_once __DIR__ . '/conexao.php';

            $consulta = $conexao->prepare(
                'SELECT id_usuario, senha, cd_tipo_usuario
                 FROM tb_usuario
                 WHERE email = :email
                 LIMIT 1'
            );

            $consulta->execute([
                'email' => $email
            ]);

            $usuario = $consulta->fetch(PDO::FETCH_ASSOC);

            if (!$usuario) {

                $resultado['mensagem'] = 'Nenhuma conta foi encontrada com esse e-mail.';

            } else {

                $resultado['usuario_encontrado'] = true;

                $hash = $usuario['senha'] ?? '';

                $resultado['hash_compativel'] = (
                    is_string($hash) &&
                    (
                        strpos($hash, '$2y$') === 0 ||
                        strpos($hash, '$argon2id$') === 0 ||
                        strpos($hash, '$argon2i$') === 0
                    )
                );

                $resultado['tipo_usuario'] = (int) $usuario['cd_tipo_usuario'];

                if (
                    is_string($hash) &&
                    $hash !== ''
                ) {

                    $resultado['senha_valida'] = password_verify(
                        $senha,
                        $hash
                    );
                }

                if (!$resultado['hash_compativel']) {

                    $resultado['mensagem'] = 'A senha cadastrada não está em um formato reconhecido.';

                } elseif (!$resultado['senha_valida']) {

                    $resultado['mensagem'] = 'A conta foi encontrada, mas a senha não corresponde ao cadastro.';

                } else {

                    $resultado['mensagem'] = 'Autenticação validada com sucesso!';
                }
            }

        } catch (Throwable $erro) {

            error_log('Erro no teste de autenticação: ' . $erro->getMessage());

            $erroGeral = 'Não foi possível executar o teste de autenticação.';
        }
    }
}

function marcarResultado($valor) {
    return $valor ? 'SIM' : 'NÃO';
}

?>

<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Teste de autenticação - SalvusConnect</title>

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 30px 16px;
            font-family: Arial, sans-serif;
            background: #f3f6fc;
            color: #0b132b;
        }

        .container {
            width: 100%;
            max-width: 520px;
            margin: 0 auto;
            padding: 28px;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 18px rgba(11, 19, 43, 0.08);
        }

        h1 {
            margin-top: 0;
            font-size: 24px;
        }

        p {
            line-height: 1.5;
            color: #475569;
        }

        label {
            display: block;
            margin: 18px 0 7px;
            font-weight: bold;
        }

        input {
            width: 100%;
            padding: 13px;
            border: 1px solid #cbd5e1;
            border-radius: 7px;
            font-size: 16px;
        }

        button {
            width: 100%;
            margin-top: 22px;
            padding: 14px;
            border: none;
            border-radius: 7px;
            background: #2563eb;
            color: #ffffff;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
        }

        button:hover {
            background: #1d4ed8;
        }

        .resultado {
            margin-top: 25px;
            padding: 18px;
            border-radius: 8px;
            background: #f1f5f9;
        }

        .resultado h2 {
            margin-top: 0;
            font-size: 19px;
        }

        .linha {
            padding: 9px 0;
            border-bottom: 1px solid #dbe2ea;
            font-size: 14px;
        }

        .mensagem {
            margin-top: 16px;
            padding: 13px;
            border-radius: 7px;
            background: #e0e8ff;
            color: #0b132b;
            line-height: 1.5;
            font-weight: bold;
        }

        .sucesso {
            background: #dcfce7;
            color: #166534;
        }

        .falha {
            background: #fee2e2;
            color: #991b1b;
        }
    </style>
</head>

<body>

    <main class="container">

        <h1>Teste de autenticação</h1>

        <p>
            Informe o e-mail e a senha de uma conta cadastrada
            para verificar o processo de autenticação.
        </p>

        <form method="POST" autocomplete="off">

            <label for="email">E-mail</label>
            <input
                type="email"
                id="email"
                name="email"
                required
                autocomplete="off"
            >

            <label for="senha">Senha</label>
            <input
                type="password"
                id="senha"
                name="senha"
                required
                autocomplete="new-password"
            >

            <button type="submit">Testar autenticação</button>

        </form>

        <?php if ($erroGeral): ?>

            <div class="mensagem falha">
                <?= htmlspecialchars($erroGeral, ENT_QUOTES, 'UTF-8') ?>
            </div>

        <?php endif; ?>

        <?php if ($resultado !== null): ?>

            <section class="resultado">

                <h2>Resultado do diagnóstico</h2>

                <div class="linha">
                    Campos recebidos:
                    <strong><?= marcarResultado($resultado['campos']) ?></strong>
                </div>

                <div class="linha">
                    Formato do e-mail válido:
                    <strong><?= marcarResultado($resultado['email_valido']) ?></strong>
                </div>

                <div class="linha">
                    Usuário encontrado:
                    <strong><?= marcarResultado($resultado['usuario_encontrado']) ?></strong>
                </div>

                <div class="linha">
                    Hash em formato reconhecido:
                    <strong><?= marcarResultado($resultado['hash_compativel']) ?></strong>
                </div>

                <div class="linha">
                    Senha validada:
                    <strong><?= marcarResultado($resultado['senha_valida']) ?></strong>
                </div>

                <div class="linha">
                    Tipo de usuário:
                    <strong>
                        <?= $resultado['tipo_usuario'] !== null
                            ? htmlspecialchars((string) $resultado['tipo_usuario'], ENT_QUOTES, 'UTF-8')
                            : 'Não identificado' ?>
                    </strong>
                </div>

                <div class="mensagem <?= $resultado['senha_valida'] ? 'sucesso' : 'falha' ?>">
                    <?= htmlspecialchars($resultado['mensagem'], ENT_QUOTES, 'UTF-8') ?>
                </div>

            </section>

        <?php endif; ?>

    </main>

</body>
</html>
