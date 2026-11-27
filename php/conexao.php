<?php

$host = "localhost";
$banco = "u288393671_salvusconnect";
$usuario = "u288393671_salvusconnect";
$senha = "22794877Da@";

try {
    $conexao = new PDO(
        "mysql:host={$host};dbname={$banco};charset=utf8mb4",
        $usuario,
        $senha,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );
} catch (PDOException $erro) {
    error_log("Erro de conexão com o banco: " . $erro->getMessage());
    http_response_code(500);
    exit("Erro na conexão com o banco de dados.");
}