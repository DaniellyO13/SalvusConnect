<?php
$host = "localhost";
$banco = "u288393671_salvusconnect";
$usuario = "u288393671_salvusconnect";
$senha = "22794877Da@";

$conexao = new mysqli($host, $usuario, $senha, $banco);

if ($conexao->connect_error) {
    die("Erro na conexão com o banco de dados.");
}

$conexao->set_charset("utf8mb4");
?>