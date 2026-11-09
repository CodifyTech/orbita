<?php

/*
 * Roteador do servidor embutido do PHP no preset `laravel` do Codify Órbita.
 *
 *   php -S 127.0.0.1:8000 -t public servidor.php
 *
 * Faz o mesmo que o resources/server.php do framework, mais escrever uma linha por request com o que
 * o `php artisan serve` não mostra: "GET 200 /api/pedidos ~ 12.50ms". É ela que o painel lê
 * (RE_REQUISICAO em src/painel/metricas.mjs); mudou o formato, mude lá também.
 */

$publico = $_SERVER['DOCUMENT_ROOT'];
$inicio = $_SERVER['REQUEST_TIME_FLOAT'] ?? microtime(true);
$metodo = $_SERVER['REQUEST_METHOD'];
// Sem decodificar: um caminho bruto não tem espaço nem quebra de linha, e a linha continua sendo uma só.
$caminho = strtok($_SERVER['REQUEST_URI'], '?') ?: '/';

// No shutdown porque aí o status já é o final, inclusive em erro fatal ou `exit` no meio do request.
register_shutdown_function(function () use ($metodo, $caminho, $inicio) {
    // Preflight de CORS só dobraria cada request do frontend no log (o Telescope também ignora).
    if ($metodo === 'OPTIONS') {
        return;
    }

    $ms = (microtime(true) - $inicio) * 1000;

    file_put_contents('php://stdout', sprintf("%s %d %s ~ %.2fms\n", $metodo, http_response_code() ?: 200, $caminho, $ms));
});

// O framework conta com a pasta atual sendo a public/ (o `artisan serve` sobe o processo nela).
chdir($publico);

$arquivo = urldecode((string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

if ($arquivo !== '/' && file_exists($publico.$arquivo)) {
    return false;
}

require_once $publico.'/index.php';
