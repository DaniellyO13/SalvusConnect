<?php

session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

function responder($dados, $codigo = 200) {
    http_response_code($codigo);

    echo json_encode(
        $dados,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    exit;
}

// Verifica se o usuário está autenticado.
if (
    !isset($_SESSION['id_usuario']) ||
    !isset($_SESSION['cd_tipo_usuario'])
) {
    responder([
        'sucesso' => false,
        'mensagem' => 'É necessário realizar o login.'
    ], 401);
}

$idUsuario = (int) $_SESSION['id_usuario'];
$tipoUsuario = (int) $_SESSION['cd_tipo_usuario'];
$acao = $_GET['acao'] ?? '';

try {

    require_once __DIR__ . '/conexao.php';

    // Lista somente prestadores com o antecedente mais recente aprovado.
    if ($acao === 'listar_prestadores') {

        $sql = "
            SELECT
                u.id_usuario,
                u.nm_nome,
                u.ds_sobre_mim,

                (
                    SELECT t.nr_telefone
                    FROM tb_telefone t
                    WHERE t.tb_usuario_id_usuario = u.id_usuario
                    ORDER BY t.id_telefone ASC
                    LIMIT 1
                ) AS telefone

            FROM tb_usuario u

            WHERE u.cd_tipo_usuario = 1

              AND EXISTS (
                  SELECT 1
                  FROM tb_antecedentes a
                  WHERE a.tb_usuario_id_usuario = u.id_usuario
                    AND a.id_antecedente = (
                        SELECT MAX(a2.id_antecedente)
                        FROM tb_antecedentes a2
                        WHERE a2.tb_usuario_id_usuario = u.id_usuario
                    )
                    AND a.st_analise = 'APROVADO'
                    AND a.dt_envio IS NOT NULL
              )

            ORDER BY u.nm_nome ASC
        ";

        $consulta = $conexao->prepare($sql);
        $consulta->execute();

        responder([
            'sucesso' => true,
            'prestadores' => $consulta->fetchAll(PDO::FETCH_ASSOC)
        ]);
    }

    // Consulta os detalhes de um prestador aprovado.
    if ($acao === 'detalhes_prestador') {

        $idPrestador = filter_var(
            $_GET['id'] ?? null,
            FILTER_VALIDATE_INT
        );

        if (
            $idPrestador === false ||
            $idPrestador === null ||
            $idPrestador < 1
        ) {
            responder([
                'sucesso' => false,
                'mensagem' => 'Identificador do prestador inválido.'
            ], 400);
        }

        $sql = "
            SELECT
                u.id_usuario,
                u.nm_nome,
                u.ds_sobre_mim,
                u.cd_tipo_usuario,

                (
                    SELECT t.nr_telefone
                    FROM tb_telefone t
                    WHERE t.tb_usuario_id_usuario = u.id_usuario
                    ORDER BY t.id_telefone ASC
                    LIMIT 1
                ) AS telefone

            FROM tb_usuario u

            WHERE u.id_usuario = :id_usuario
              AND u.cd_tipo_usuario = 1

              AND EXISTS (
                  SELECT 1
                  FROM tb_antecedentes a
                  WHERE a.tb_usuario_id_usuario = u.id_usuario
                    AND a.id_antecedente = (
                        SELECT MAX(a2.id_antecedente)
                        FROM tb_antecedentes a2
                        WHERE a2.tb_usuario_id_usuario = u.id_usuario
                    )
                    AND a.st_analise = 'APROVADO'
                    AND a.dt_envio IS NOT NULL
              )

            LIMIT 1
        ";

        $consulta = $conexao->prepare($sql);
        $consulta->execute([
            'id_usuario' => $idPrestador
        ]);

        $prestador = $consulta->fetch(PDO::FETCH_ASSOC);

        if (!$prestador) {
            responder([
                'sucesso' => false,
                'mensagem' => 'Prestador não encontrado ou ainda não aprovado.'
            ], 404);
        }

        responder([
            'sucesso' => true,
            'prestador' => $prestador
        ]);
    }

    // Consulta todos os usuários. Acesso exclusivo do administrador.
    if ($acao === 'listar_usuarios' && $tipoUsuario === 0) {

        $sql = "
            SELECT
                id_usuario,
                nm_nome,
                email,
                cd_tipo_usuario
            FROM tb_usuario
            ORDER BY nm_nome ASC
        ";

        $consulta = $conexao->prepare($sql);
        $consulta->execute();

        responder([
            'sucesso' => true,
            'tipo_usuario' => 'administrador',
            'usuarios' => $consulta->fetchAll(PDO::FETCH_ASSOC)
        ]);
    }

    // Consulta os próprios dados do administrador, cliente ou prestador.
    if (
        $acao === 'meus_dados' &&
        in_array($tipoUsuario, [0, 1, 3], true)
    ) {

        $sql = "
            SELECT
                u.id_usuario,
                u.nm_nome,
                u.email,
                u.cd_tipo_usuario,

                (
                    SELECT t.nr_telefone
                    FROM tb_telefone t
                    WHERE t.tb_usuario_id_usuario = u.id_usuario
                    ORDER BY
                        CASE
                            WHEN lower(trim(coalesce(t.nm_tipo_telefone, '')))
                                IN ('principal', 'telefone principal')
                            THEN 0
                            ELSE 1
                        END,
                        t.id_telefone
                    LIMIT 1
                ) AS nr_telefone

            FROM tb_usuario u

            WHERE u.id_usuario = :id_usuario

            LIMIT 1
        ";

        $consulta = $conexao->prepare($sql);
        $consulta->execute([
            'id_usuario' => $idUsuario
        ]);

        $usuario = $consulta->fetch(PDO::FETCH_ASSOC);

        if (!$usuario) {
            responder([
                'sucesso' => false,
                'mensagem' => 'Usuário não encontrado.'
            ], 404);
        }

        // Mantém compatibilidade com a resposta anterior.
        $usuario['telefone'] = $usuario['nr_telefone'];

        // Informa se o prestador já enviou o antecedente mais recente.
        // Clientes e administradores não recebem esse campo.
        if ($tipoUsuario === 1) {
            $sqlAntecedente = "
                SELECT EXISTS (
                    SELECT 1
                    FROM tb_antecedentes a
                    WHERE a.tb_usuario_id_usuario = :id_usuario
                      AND a.id_antecedente = (
                          SELECT MAX(a2.id_antecedente)
                          FROM tb_antecedentes a2
                          WHERE a2.tb_usuario_id_usuario = :id_usuario_ultimo
                      )
                      AND a.dt_envio IS NOT NULL
                )
            ";

            $consultaAntecedente = $conexao->prepare($sqlAntecedente);
            $consultaAntecedente->execute([
                'id_usuario' => $idUsuario,
                'id_usuario_ultimo' => $idUsuario
            ]);

            $usuario['antecedente_enviado'] =
                (bool) $consultaAntecedente->fetchColumn();
        }

        $tipos = [
            0 => 'administrador',
            1 => 'prestador',
            3 => 'cliente'
        ];

        responder([
            'sucesso' => true,
            'tipo_usuario' => $tipos[$tipoUsuario] ?? 'usuario',
            'usuario' => $usuario
        ]);
    }

    // Atualiza os próprios dados do administrador, cliente ou prestador.
    if (
        $acao === 'atualizar_meus_dados' &&
        in_array($tipoUsuario, [0, 1, 3], true)
    ) {

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            responder([
                'sucesso' => false,
                'mensagem' => 'Método de requisição inválido.'
            ], 405);
        }

        // Aceita dados enviados por formulário ou JSON.
        $dados = $_POST;

        if (empty($dados)) {
            $conteudo = file_get_contents('php://input');
            $dadosJson = json_decode($conteudo, true);

            if (is_array($dadosJson)) {
                $dados = $dadosJson;
            }
        }

        $nome = trim($dados['nm_nome'] ?? '');
        $email = trim($dados['email'] ?? '');

        $telefoneInformado = $dados['nr_telefone'] ?? '';

        if (
            !is_string($telefoneInformado) &&
            !is_numeric($telefoneInformado)
        ) {
            responder([
                'sucesso' => false,
                'mensagem' => 'Informe um telefone válido.'
            ], 400);
        }

        $telefone = preg_replace(
            '/\D/',
            '',
            (string) $telefoneInformado
        );

        // Validação do nome conforme a coluna VARCHAR(100).
        $quantidadeCaracteresNome = function_exists('mb_strlen')
            ? mb_strlen($nome, 'UTF-8')
            : preg_match_all('/./us', $nome);

        if (
            $nome === '' ||
            $quantidadeCaracteresNome === false ||
            $quantidadeCaracteresNome > 100
        ) {
            responder([
                'sucesso' => false,
                'mensagem' => 'Informe um nome válido com até 100 caracteres.'
            ], 400);
        }

        // Validação do e-mail conforme a coluna VARCHAR(150).
        if (
            $email === '' ||
            strlen($email) > 150 ||
            !filter_var($email, FILTER_VALIDATE_EMAIL)
        ) {
            responder([
                'sucesso' => false,
                'mensagem' => 'Informe um endereço de e-mail válido.'
            ], 400);
        }

        // Validação do telefone conforme a coluna CHAR(11).
        if (
            strlen($telefone) < 10 ||
            strlen($telefone) > 11
        ) {
            responder([
                'sucesso' => false,
                'mensagem' => 'Informe um telefone válido com DDD.'
            ], 400);
        }

        $conexao->beginTransaction();

        // Atualiza somente o usuário autenticado.
        $sqlUsuario = "
            UPDATE tb_usuario
            SET
                nm_nome = :nm_nome,
                email = :email
            WHERE id_usuario = :id_usuario
        ";

        $consultaUsuario = $conexao->prepare($sqlUsuario);
        $consultaUsuario->execute([
            'nm_nome' => $nome,
            'email' => $email,
            'id_usuario' => $idUsuario
        ]);

        // Localiza o telefone principal, seguindo o mesmo critério do perfil.
        $sqlTelefone = "
            SELECT id_telefone
            FROM tb_telefone
            WHERE tb_usuario_id_usuario = :id_usuario
              AND lower(trim(coalesce(nm_tipo_telefone, '')))
                  IN ('principal', 'telefone principal')
            ORDER BY id_telefone ASC
            LIMIT 1
            FOR UPDATE
        ";

        $consultaTelefone = $conexao->prepare($sqlTelefone);
        $consultaTelefone->execute([
            'id_usuario' => $idUsuario
        ]);

        $idTelefone = $consultaTelefone->fetchColumn();

        if ($idTelefone) {

            // Atualiza o telefone principal já cadastrado.
            $sqlAtualizarTelefone = "
                UPDATE tb_telefone
                SET nr_telefone = :nr_telefone
                WHERE id_telefone = :id_telefone
                  AND tb_usuario_id_usuario = :id_usuario
            ";

            $consultaAtualizarTelefone = $conexao->prepare(
                $sqlAtualizarTelefone
            );

            $consultaAtualizarTelefone->execute([
                'nr_telefone' => $telefone,
                'id_telefone' => (int) $idTelefone,
                'id_usuario' => $idUsuario
            ]);

        } else {

            // Cadastra um telefone principal caso ainda não exista.
            $sqlInserirTelefone = "
                INSERT INTO tb_telefone (
                    nr_telefone,
                    nm_tipo_telefone,
                    tb_usuario_id_usuario
                ) VALUES (
                    :nr_telefone,
                    'principal',
                    :id_usuario
                )
            ";

            $consultaInserirTelefone = $conexao->prepare(
                $sqlInserirTelefone
            );

            $consultaInserirTelefone->execute([
                'nr_telefone' => $telefone,
                'id_usuario' => $idUsuario
            ]);
        }

        // Consulta o telefone principal atualizado.
        $sqlTelefoneAtual = "
            SELECT nr_telefone
            FROM tb_telefone
            WHERE tb_usuario_id_usuario = :id_usuario
            ORDER BY
                CASE
                    WHEN lower(trim(coalesce(nm_tipo_telefone, '')))
                        IN ('principal', 'telefone principal')
                    THEN 0
                    ELSE 1
                END,
                id_telefone
            LIMIT 1
        ";

        $consultaTelefoneAtual = $conexao->prepare($sqlTelefoneAtual);
        $consultaTelefoneAtual->execute([
            'id_usuario' => $idUsuario
        ]);

        $telefoneAtual = $consultaTelefoneAtual->fetchColumn();

        // Confirma a gravação no banco de dados.
        $conexao->commit();

        // Sincroniza os dados atualizados na sessão.
        $_SESSION['nm_nome'] = $nome;
        $_SESSION['email'] = $email;

        responder([
            'sucesso' => true,
            'mensagem' => 'Dados atualizados com sucesso.',
            'usuario' => [
                'id_usuario' => $idUsuario,
                'nm_nome' => $nome,
                'email' => $email,
                'cd_tipo_usuario' => $tipoUsuario,
                'nr_telefone' => $telefoneAtual ?: null,
                'telefone' => $telefoneAtual ?: null
            ]
        ]);
    }

    // Impede ações desconhecidas ou sem permissão.
    responder([
        'sucesso' => false,
        'mensagem' => 'Ação inválida ou sem permissão de acesso.'
    ], 403);

} catch (Throwable $erro) {

    if (
        isset($conexao) &&
        $conexao instanceof PDO &&
        $conexao->inTransaction()
    ) {
        $conexao->rollBack();
    }

    error_log(
        'Erro ao consultar ou atualizar usuários no SalvusConnect: ' .
        $erro->getMessage()
    );

    responder([
        'sucesso' => false,
        'mensagem' => 'Não foi possível processar os dados.'
    ], 500);
}
