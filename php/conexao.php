<?php

$host = "salvus-connecttcc.mysql.database.azure.com";
$banco = "db_salvusconn";
$usuario = "juliana_nunes007";
$senha = "4pmxWpF4XfAEHwd";


try {
    $conexao = new PDO(
        "mysql:host=$host;dbname=$banco;charset=utf8mb4",
        $usuario,
        $senha,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );
} catch (PDOException $erro) {
    error_log($erro->getMessage());
    http_response_code(500);
    exit("Não foi possível conectar ao banco de dados.");
}
