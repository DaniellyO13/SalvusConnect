<?php

session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

// Verifica se o usuário está autenticado e é administrador.
if (
    !isset($_SESSION['id_usuario']) ||
    !isset($_SESSION['cd_tipo_usuario']) ||
    (int) $_SESSION['cd_tipo_usuario'] !== 0
) {
    http_response_code(403);

    echo json_encode([
        'sucesso' => false,
        'mensagem' => 'Acesso não autorizado.'
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

require_once __DIR__ . '/conexao.php';

try {

    // Confirma no banco se o usuário ainda é administrador.
    $consultaAdmin = $conexao->prepare("
        SELECT cd_tipo_usuario
        FROM tb_usuario
        WHERE id_usuario = :id_usuario
        LIMIT 1
    ");

    $consultaAdmin->execute([
        ':id_usuario' => (int) $_SESSION['id_usuario']
    ]);

    $tipoAdministrador = $consultaAdmin->fetchColumn();

    if ($tipoAdministrador === false || (int) $tipoAdministrador !== 0) {
        http_response_code(403);

        echo json_encode([
            'sucesso' => false,
            'mensagem' => 'Acesso não autorizado.'
        ], JSON_UNESCAPED_UNICODE);

        exit;
    }

    // Gera o token CSRF da sessão administrativa.
    if (empty($_SESSION['csrf_admin'])) {
        $_SESSION['csrf_admin'] = bin2hex(random_bytes(32));
    }

    $metodo = $_SERVER['REQUEST_METHOD'];

    // ==========================================
    // GET: indicadores e listas administrativas
    // ==========================================

    if ($metodo === 'GET') {

        // Total de usuários cadastrados.
        $consulta = $conexao->query("
            SELECT COUNT(*)
            FROM tb_usuario
        ");

        $totalUsuarios = (int) $consulta->fetchColumn();

        // Total de prestadores cadastrados.
        $consulta = $conexao->query("
            SELECT COUNT(*)
            FROM tb_usuario
            WHERE cd_tipo_usuario = 1
        ");

        $totalPrestadores = (int) $consulta->fetchColumn();

        // Agendamentos aguardando resposta.
        $consulta = $conexao->query("
            SELECT COUNT(*)
            FROM tb_agendamento
            WHERE st_agendamento = 'pendente'
        ");

        $agendamentosPendentes = (int) $consulta->fetchColumn();

        // Antecedentes enviados e aguardando análise.
        $consulta = $conexao->query("
            SELECT COUNT(*)
            FROM tb_antecedentes
            WHERE st_analise = 'PENDENTE'
              AND dt_envio IS NOT NULL
        ");

        $antecedentesPendentes = (int) $consulta->fetchColumn();

        // ==========================================
        // Lista completa de agendamentos.
        // ==========================================

        $consulta = $conexao->query("
            SELECT
                a.id_agendamento,
                a.st_agendamento,
                a.hr_horario,
                a.ds_local_busca,
                a.ds_local_entrega,

                s.nm_servico,

                cliente.id_usuario AS id_cliente,
                cliente.nm_nome AS nome_cliente,
                cliente.email AS email_cliente,

                prestador.id_usuario AS id_prestador,
                prestador.nm_nome AS nome_prestador,
                prestador.email AS email_prestador

            FROM tb_agendamento a

            INNER JOIN tb_usuario cliente
                ON cliente.id_usuario = a.tb_usuario_id_usuario

            INNER JOIN tb_usuario prestador
                ON prestador.id_usuario = a.tb_prestador_id_usuario

            INNER JOIN tb_servicos s
                ON s.id_servico = a.tb_servicos_id_servico

            ORDER BY
                a.hr_horario DESC,
                a.id_agendamento DESC
        ");

        $agendamentos = $consulta->fetchAll(PDO::FETCH_ASSOC);

        // ==========================================
        // Lista de usuários comuns.
        // ==========================================

        $consulta = $conexao->query("
            SELECT
                id_usuario,
                nm_nome,
                email

            FROM tb_usuario

            WHERE cd_tipo_usuario = 3

            ORDER BY nm_nome ASC
        ");

        $usuariosComuns = $consulta->fetchAll(PDO::FETCH_ASSOC);

        // ==========================================
        // Lista de prestadores.
        // ==========================================

        $consulta = $conexao->query("
            SELECT
                u.id_usuario,
                u.nm_nome,
                u.email,
                u.ds_sobre_mim,

                (
                    SELECT t.nr_telefone
                    FROM tb_telefone t
                    WHERE t.tb_usuario_id_usuario = u.id_usuario
                    ORDER BY t.id_telefone DESC
                    LIMIT 1
                ) AS telefone

            FROM tb_usuario u

            WHERE u.cd_tipo_usuario = 1

            ORDER BY u.nm_nome ASC
        ");

        $prestadores = $consulta->fetchAll(PDO::FETCH_ASSOC);

        // ==========================================
        // Lista de antecedentes enviados.
        // ==========================================

        $consulta = $conexao->query("
            SELECT
                a.id_antecedente,
                a.nm_arquivo,
                a.nm_tipo_arquivo,
                a.dt_envio,
                a.st_analise,
                a.dt_analise,
                a.ds_observacao,

                u.id_usuario,
                u.nm_nome AS nome_prestador,
                u.nr_cpf AS cpf_original,

                (
                    SELECT t.nr_telefone
                    FROM tb_telefone t
                    WHERE t.tb_usuario_id_usuario = u.id_usuario
                    ORDER BY t.id_telefone DESC
                    LIMIT 1
                ) AS telefone_prestador

            FROM tb_antecedentes a

            INNER JOIN tb_usuario u
                ON u.id_usuario = a.tb_usuario_id_usuario

            WHERE a.dt_envio IS NOT NULL
              AND u.cd_tipo_usuario = 1

            ORDER BY
                CASE
                    WHEN a.st_analise = 'PENDENTE' THEN 0
                    ELSE 1
                END,
                a.dt_envio DESC
        ");

        $antecedentes = $consulta->fetchAll(PDO::FETCH_ASSOC);

        // Mascara o CPF antes de enviar os dados ao navegador.
        foreach ($antecedentes as &$antecedente) {

            $cpf = preg_replace(
                '/\D/',
                '',
                (string) ($antecedente['cpf_original'] ?? '')
            );

            if (strlen($cpf) === 11) {
                $antecedente['cpf_mascarado'] =
                    '***.***.***-' . substr($cpf, -2);
            } else {
                $antecedente['cpf_mascarado'] = 'Não informado';
            }

            unset($antecedente['cpf_original']);

            if (
                !isset($antecedente['telefone_prestador']) ||
                trim((string) $antecedente['telefone_prestador']) === ''
            ) {
                $antecedente['telefone_prestador'] = 'Não informado';
            }
        }

        unset($antecedente);

        echo json_encode([
            'sucesso' => true,
            'csrf_token' => $_SESSION['csrf_admin'],

            'total_usuarios' => $totalUsuarios,
            'total_prestadores' => $totalPrestadores,
            'agendamentos_pendentes' => $agendamentosPendentes,
            'antecedentes_pendentes' => $antecedentesPendentes,

            'agendamentos' => $agendamentos,
            'usuarios_comuns' => $usuariosComuns,
            'prestadores' => $prestadores,

            'antecedentes' => $antecedentes

        ], JSON_UNESCAPED_UNICODE);

        exit;
    }

    // ==========================================
    // POST: aprovar ou reprovar antecedentes
    // ==========================================

    if ($metodo === 'POST') {

        // Validação do token CSRF.
        $tokenSessao = $_SESSION['csrf_admin'] ?? '';
        $tokenRecebido = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';

        if (
            !is_string($tokenSessao) ||
            $tokenSessao === '' ||
            !is_string($tokenRecebido) ||
            $tokenRecebido === '' ||
            !hash_equals($tokenSessao, $tokenRecebido)
        ) {
            http_response_code(403);

            echo json_encode([
                'sucesso' => false,
                'mensagem' => 'Não foi possível validar sua sessão. Atualize o painel.'
            ], JSON_UNESCAPED_UNICODE);

            exit;
        }

        // Recebe os dados enviados pelo JavaScript.
        $dados = json_decode(
            file_get_contents('php://input'),
            true
        );

        if (!is_array($dados)) {
            http_response_code(400);

            echo json_encode([
                'sucesso' => false,
                'mensagem' => 'Dados inválidos.'
            ], JSON_UNESCAPED_UNICODE);

            exit;
        }

        // Valida os tipos dos campos recebidos.
        $decisaoRecebida = $dados['decisao'] ?? '';
        $observacaoRecebida = $dados['observacao'] ?? '';

        if (
            !is_string($decisaoRecebida) ||
            !is_string($observacaoRecebida)
        ) {
            http_response_code(400);

            echo json_encode([
                'sucesso' => false,
                'mensagem' => 'Dados inválidos.'
            ], JSON_UNESCAPED_UNICODE);

            exit;
        }

        $idAntecedente = filter_var(
            $dados['id_antecedente'] ?? null,
            FILTER_VALIDATE_INT
        );

        $decisao = strtoupper(trim($decisaoRecebida));
        $observacao = trim($observacaoRecebida);

        $idAdministrador = (int) $_SESSION['id_usuario'];

        // Valida o identificador.
        if (!$idAntecedente || $idAntecedente <= 0) {
            http_response_code(400);

            echo json_encode([
                'sucesso' => false,
                'mensagem' => 'Antecedente inválido.'
            ], JSON_UNESCAPED_UNICODE);

            exit;
        }

        // Aceita somente as duas decisões.
        if (!in_array($decisao, ['APROVADO', 'REPROVADO'], true)) {
            http_response_code(400);

            echo json_encode([
                'sucesso' => false,
                'mensagem' => 'Decisão inválida.'
            ], JSON_UNESCAPED_UNICODE);

            exit;
        }

        // A reprovação exige uma justificativa.
        if ($decisao === 'REPROVADO' && $observacao === '') {
            http_response_code(400);

            echo json_encode([
                'sucesso' => false,
                'mensagem' => 'Informe o motivo da reprovação.'
            ], JSON_UNESCAPED_UNICODE);

            exit;
        }

        // Verifica o tamanho da observação.
        $tamanhoObservacao = function_exists('mb_strlen')
            ? mb_strlen($observacao, 'UTF-8')
            : strlen($observacao);

        if ($tamanhoObservacao > 1000) {
            http_response_code(400);

            echo json_encode([
                'sucesso' => false,
                'mensagem' => 'A observação deve ter no máximo 1000 caracteres.'
            ], JSON_UNESCAPED_UNICODE);

            exit;
        }

        // Atualiza somente documentos enviados e ainda pendentes.
        $consulta = $conexao->prepare("
            UPDATE tb_antecedentes a

            INNER JOIN tb_usuario u
                ON u.id_usuario = a.tb_usuario_id_usuario

            SET
                a.st_analise = :decisao,
                a.dt_analise = CURRENT_TIMESTAMP,
                a.ds_observacao = :observacao,
                a.tb_administrador_id_usuario = :administrador

            WHERE a.id_antecedente = :id_antecedente
              AND a.dt_envio IS NOT NULL
              AND a.st_analise = 'PENDENTE'
              AND u.cd_tipo_usuario = 1
        ");

        $consulta->execute([
            ':decisao' => $decisao,
            ':observacao' => $observacao !== '' ? $observacao : null,
            ':administrador' => $idAdministrador,
            ':id_antecedente' => $idAntecedente
        ]);

        if ($consulta->rowCount() === 0) {
            http_response_code(409);

            echo json_encode([
                'sucesso' => false,
                'mensagem' => 'Documento não encontrado ou já analisado.'
            ], JSON_UNESCAPED_UNICODE);

            exit;
        }

        echo json_encode([
            'sucesso' => true,
            'mensagem' => $decisao === 'APROVADO'
                ? 'Documento aprovado com sucesso.'
                : 'Documento reprovado com sucesso.',
            'decisao' => $decisao
        ], JSON_UNESCAPED_UNICODE);

        exit;
    }

    // ==========================================
    // Outros métodos não são permitidos.
    // ==========================================

    http_response_code(405);

    header('Allow: GET, POST');

    echo json_encode([
        'sucesso' => false,
        'mensagem' => 'Método não permitido.'
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $erro) {

    error_log(
        'Erro no painel administrativo: ' .
        $erro->getMessage()
    );

    http_response_code(500);

    echo json_encode([
        'sucesso' => false,
        'mensagem' => 'Não foi possível processar a solicitação.'
    ], JSON_UNESCAPED_UNICODE);
}
