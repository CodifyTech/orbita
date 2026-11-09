<?php

/*
 * Roteador do servidor embutido do PHP no preset `laravel` do Codify Órbita.
 *
 *   php -S 127.0.0.1:8000 -t public servidor.php
 *
 * Faz o mesmo que o resources/server.php do framework, mais escrever uma linha por request com o que
 * o `php artisan serve` não mostra: "GET 200 /api/pedidos ~ 12.50ms #a1b2c3". É ela que o painel lê
 * (RE_REQUISICAO em src/painel/metricas.mjs); mudou o formato, mude lá também.
 *
 * Também grava o request em storage/logs/orbita-requests.sqlite, no formato { resumo, secoes } que o
 * painel desenha (src/plano/tipos.mjs); o `#a1b2c3` é o id dele e `ambiente.php request-gravado` o lê.
 * Sem pdo_sqlite ou sem a pasta, o request segue normal, só sem id: a depuração nunca derruba a API.
 */

const LIMITE_DE_BYTES = 64 * 1024;
const REQUESTS_GUARDADOS = 2000;
/** Saem mascarados antes de ir para o disco, em qualquer nível do payload, dos headers e da resposta. */
const CHAVES_SENSIVEIS = [
    'password', 'password_confirmation', 'current_password', '_token', 'token', 'access_token', 'refresh_token',
    'authorization', 'php-auth-pw', 'cookie', 'set-cookie', 'x-csrf-token', 'x-xsrf-token',
];

function mascarar(array $dados): array
{
    foreach ($dados as $chave => $valor) {
        if (in_array(strtolower((string) $chave), CHAVES_SENSIVEIS, true)) {
            $dados[$chave] = '********';
        } elseif (is_array($valor)) {
            $dados[$chave] = mascarar($valor);
        }
    }

    return $dados;
}

function dentroDoLimite(array $valor, string $rotulo): array|string
{
    return strlen((string) json_encode($valor, JSON_PARTIAL_OUTPUT_ON_ERROR)) > LIMITE_DE_BYTES ? "({$rotulo} maior que 64 KB)" : $valor;
}

function payloadDoRequest(): array
{
    $json = json_decode((string) file_get_contents('php://input'), true);
    $arquivos = array_map(fn ($arquivo) => ['arquivo' => $arquivo['name'], 'bytes' => $arquivo['size']], $_FILES);

    return mascarar([...$_GET, ...(is_array($json) ? $json : $_POST), ...$arquivos]);
}

function headersDaResposta(): array
{
    $headers = [];

    foreach (headers_list() as $linha) {
        [$nome, $valor] = explode(':', $linha, 2) + [1 => ''];
        $nome = strtolower($nome);
        $headers[$nome] = isset($headers[$nome]) ? "{$headers[$nome]}, ".trim($valor) : trim($valor);
    }

    return mascarar($headers);
}

/** JSON vira estrutura (mascarada); texto aparece como está, cortado no limite; binário só o aviso. */
function valorDaResposta(string $resposta): array|string
{
    $json = json_decode($resposta, true);

    if (is_array($json)) {
        return dentroDoLimite(mascarar($json), 'resposta');
    }

    $cortada = strlen($resposta) > LIMITE_DE_BYTES;
    // O corte pode cair no meio de um caractere acentuado, e aí o texto pareceria binário.
    $texto = $cortada ? (string) preg_replace('/[\xC0-\xFF][\x80-\xBF]*$/', '', substr($resposta, 0, LIMITE_DE_BYTES)) : $resposta;

    if (preg_match('//u', $texto) !== 1) {
        return '(conteúdo binário)';
    }

    return $cortada ? "{$texto}\n… (cortado em 64 KB)" : $texto;
}

function gravarRequest(float $ms, int $status, string $resposta): ?string
{
    try {
        $id = bin2hex(random_bytes(8));
        $headers = array_change_key_case(getallheaders());
        $dados = [
            'resumo' => [
                'metodo' => $_SERVER['REQUEST_METHOD'],
                'caminho' => $_SERVER['REQUEST_URI'],
                'status' => $status,
                'duracaoMs' => round($ms),
                'memoriaMb' => round(memory_get_peak_usage(true) / 1024 / 1024, 1),
                'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
                'host' => $headers['host'] ?? null,
                'hora' => date('Y-m-d H:i:s'),
            ],
            // Os títulos são os mesmos do Telescope: é por eles que o painel evita seção repetida.
            'secoes' => [
                ['titulo' => 'Payload', 'tipo' => 'json', 'valor' => dentroDoLimite(payloadDoRequest(), 'payload')],
                ['titulo' => 'Headers', 'tipo' => 'json', 'valor' => mascarar($headers)],
                ['titulo' => 'Response', 'tipo' => 'json', 'valor' => valorDaResposta($resposta)],
                ['titulo' => 'Resp. Headers', 'tipo' => 'json', 'valor' => headersDaResposta()],
            ],
        ];

        $arquivo = dirname($_SERVER['DOCUMENT_ROOT']).'/storage/logs/orbita-requests.sqlite';
        $banco = new PDO("sqlite:{$arquivo}", null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 2]);
        // WAL: com PHP_CLI_SERVER_WORKERS há mais de um processo gravando, e a leitura não trava a escrita.
        $banco->exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, dados TEXT NOT NULL)');
        $banco->prepare('INSERT INTO requests (id, dados) VALUES (?, ?)')
            ->execute([$id, json_encode($dados, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR)]);

        $ultimo = (int) $banco->lastInsertId();

        if ($ultimo % 100 === 0) {
            $banco->exec('DELETE FROM requests WHERE rowid <= '.($ultimo - REQUESTS_GUARDADOS));
        }

        return $id;
    } catch (Throwable) {
        return null;
    }
}

$publico = $_SERVER['DOCUMENT_ROOT'];
$inicio = $_SERVER['REQUEST_TIME_FLOAT'] ?? microtime(true);
$metodo = $_SERVER['REQUEST_METHOD'];
// Sem decodificar: um caminho bruto não tem espaço nem quebra de linha, e a linha continua sendo uma só.
$caminho = strtok($_SERVER['REQUEST_URI'], '?') ?: '/';

$resposta = '';

// No shutdown porque aí o status já é o final, inclusive em erro fatal ou `exit` no meio do request.
register_shutdown_function(function () use ($metodo, $caminho, $inicio, &$resposta) {
    // Preflight de CORS só dobraria cada request do frontend no log (o Telescope também ignora).
    if ($metodo === 'OPTIONS') {
        return;
    }

    $ms = (microtime(true) - $inicio) * 1000;
    $status = http_response_code() ?: 200;
    // A checagem de saúde do painel bate aqui a cada 5 s: gravar só encheria o histórico.
    $id = ($_SERVER['HTTP_USER_AGENT'] ?? '') === 'codify-orbita' ? null : gravarRequest($ms, $status, $resposta);

    file_put_contents('php://stdout', sprintf("%s %d %s ~ %.2fms%s\n", $metodo, $status, $caminho, $ms, $id ? " #{$id}" : ''));
});

// O framework conta com a pasta atual sendo a public/ (o `artisan serve` sobe o processo nela).
chdir($publico);

$arquivo = urldecode((string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

if ($arquivo !== '/' && file_exists($publico.$arquivo)) {
    return false;
}

// Só observa: com chunk 1 cada escrita segue na hora, então streaming e headers não mudam.
ob_start(function (string $pedaco) use (&$resposta) {
    $resposta .= substr($pedaco, 0, max(0, LIMITE_DE_BYTES + 1 - strlen($resposta)));

    return $pedaco;
}, 1);

require_once $publico.'/index.php';
