<?php

/*
 * Consulta e execução do preset `laravel` do Codify Órbita.
 *
 * O Node decide; o Laravel responde. Este script faz o bootstrap da aplicação (vendor/autoload.php +
 * bootstrap/app.php) e imprime UM JSON na saída padrão. O que só o framework sabe (config resolvida,
 * conexão, migrations pendentes com os paths dos domínios, filas do Horizon, pcntl) sai daqui.
 *
 *   php ambiente.php <pasta-do-app>                    → estado do ambiente (veja `info()`)
 *   php ambiente.php <pasta-do-app> info --redis       → idem, testando o Redis mesmo se a fila não usar
 *   php ambiente.php <pasta-do-app> criar-banco [nome] → cria o banco da conexão padrão
 *
 * Contrato: sempre um objeto JSON com "ok". Em falha, {"ok": false, "erro": "...", "etapa": "..."}.
 * Mudou o formato? Mude também src/presets/laravel/consulta.mjs (e o teste dele).
 */

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

// Avisos e deprecações do PHP não podem sujar o JSON.
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED & ~E_NOTICE & ~E_WARNING);
ini_set('display_errors', 'stderr');
ob_start();

$respondido = false;

function responder(array $dados): never
{
    global $respondido;
    $respondido = true;

    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    echo json_encode($dados, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit($dados['ok'] ? 0 : 1);
}

// Erro fatal (ex.: o platform_check do Composer pedindo outra versão do PHP) não passa pelo catch:
// sem isto, o Node receberia HTML/texto em vez do JSON combinado.
register_shutdown_function(function () {
    global $respondido;
    $erro = error_get_last();

    if (! $respondido && $erro && in_array($erro['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR], true)) {
        responder(['ok' => false, 'etapa' => 'fatal', 'erro' => mb_substr(strtok($erro['message'], "\n"), 0, 500)]);
    }
});

function primeiraLinha(Throwable $e, int $limite = 500): string
{
    return mb_substr(strtok($e->getMessage(), "\n") ?: $e->getMessage(), 0, $limite);
}

$pasta = $argv[1] ?? null;
$acao = $argv[2] ?? 'info';
$opcoes = array_slice($argv, 3);

if (! $pasta || ! is_dir($pasta)) {
    responder(['ok' => false, 'etapa' => 'argumentos', 'erro' => 'Informe a pasta do app Laravel: php ambiente.php <pasta>']);
}

$pasta = realpath($pasta);

if (! is_file("{$pasta}/vendor/autoload.php")) {
    responder(['ok' => false, 'etapa' => 'vendor', 'erro' => "Sem vendor/autoload.php em {$pasta}: rode composer install"]);
}

// Caminhos relativos do .env (SQLite em database/database.sqlite) são relativos à pasta do app.
chdir($pasta);

try {
    require "{$pasta}/vendor/autoload.php";
    $app = require "{$pasta}/bootstrap/app.php";
    $app->make(Kernel::class)->bootstrap();
} catch (Throwable $e) {
    responder(['ok' => false, 'etapa' => 'bootstrap', 'erro' => primeiraLinha($e)]);
}

match ($acao) {
    'info' => responder(info($app, in_array('--redis', $opcoes, true))),
    'criar-banco' => responder(criarBanco($opcoes[0] ?? null)),
    default => responder(['ok' => false, 'etapa' => 'argumentos', 'erro' => "Ação desconhecida: {$acao}"]),
};

function info($app, bool $testarRedis): array
{
    $usaRedis = $testarRedis || config('queue.default') === 'redis' || config('cache.default') === 'redis';

    return [
        'ok' => true,
        'app' => [
            'nome' => config('app.name'),
            'env' => $app->environment(),
            'chave' => filled(config('app.key')),
        ],
        'jwt' => [
            'usa' => class_exists('Tymon\\JWTAuth\\JWT') || config()->has('jwt.secret'),
            'segredo' => filled(config('jwt.secret')),
        ],
        'versoes' => ['php' => PHP_VERSION, 'laravel' => $app->version()],
        'pcntl' => function_exists('pcntl_fork'),
        'banco' => banco(),
        'redis' => $usaRedis ? redis() : ['estado' => 'nao-usado'],
        'fila' => ['conexao' => config('queue.default'), 'filas' => filas()],
        'cache' => config('cache.default'),
        'horizon' => ['instalado' => class_exists('Laravel\\Horizon\\Horizon'), 'chokidar' => is_dir(base_path('node_modules/chokidar'))],
        'pail' => class_exists('Laravel\\Pail\\PailServiceProvider'),
        'reverb' => reverb(),
        'logs' => storage_path('logs'),
    ];
}

function conexao(): array
{
    $nome = config('database.default');
    $c = config("database.connections.{$nome}", []);

    return [
        'conexao' => $nome,
        'driver' => $c['driver'] ?? null,
        'host' => $c['host'] ?? null,
        'porta' => isset($c['port']) ? (string) $c['port'] : null,
        'banco' => isset($c['database']) ? (string) $c['database'] : null,
        'usuario' => $c['username'] ?? null,
        'charset' => $c['charset'] ?? null,
        'collation' => $c['collation'] ?? null,
    ];
}

/** Estados: ok, sqlite-inexistente, sem-conexao, nunca-migrado, pendentes. */
function banco(): array
{
    $conexao = conexao();
    $arquivo = $conexao['banco'];

    if ($conexao['driver'] === 'sqlite' && $arquivo !== ':memory:' && ! is_file((string) $arquivo)) {
        return [...$conexao, 'estado' => 'sqlite-inexistente'];
    }

    try {
        DB::connection()->getPdo();
    } catch (Throwable $e) {
        return [...$conexao, 'estado' => 'sem-conexao', 'erro' => primeiraLinha($e)];
    }

    try {
        $migrator = app('migrator');

        if (! $migrator->repositoryExists()) {
            return [...$conexao, 'estado' => 'nunca-migrado', 'pendentes' => null, 'rodadas' => 0];
        }

        // Os paths extras (ex.: app/Domains/*/Migrations) são os que os providers registraram.
        $arquivos = $migrator->getMigrationFiles([database_path('migrations'), ...$migrator->paths()]);
        $rodadas = $migrator->getRepository()->getRan();
        $pendentes = count(array_diff(array_keys($arquivos), $rodadas));

        return [...$conexao, 'estado' => $pendentes === 0 ? 'ok' : 'pendentes', 'pendentes' => $pendentes, 'rodadas' => count($rodadas)];
    } catch (Throwable $e) {
        return [...$conexao, 'estado' => 'sem-conexao', 'erro' => primeiraLinha($e)];
    }
}

function redis(): array
{
    $endereco = config('database.redis.default.host').':'.config('database.redis.default.port');

    try {
        Redis::connection()->ping();

        return ['estado' => 'ok', 'endereco' => $endereco];
    } catch (Throwable $e) {
        return ['estado' => 'erro', 'endereco' => $endereco, 'erro' => primeiraLinha($e, 200)];
    }
}

/** `default` + as filas dos supervisores do Horizon, sem repetir, na ordem. */
function filas(): array
{
    $filas = ['default'];

    foreach ((array) config('horizon.defaults', []) as $supervisor) {
        foreach ((array) ($supervisor['queue'] ?? []) as $fila) {
            $filas[] = $fila;
        }
    }

    return array_values(array_unique($filas));
}

function reverb(): ?array
{
    if (! config()->has('reverb.servers.reverb')) {
        return null;
    }

    return [
        'host' => config('reverb.servers.reverb.host'),
        'porta' => (int) config('reverb.servers.reverb.port'),
        'chave' => (string) config('reverb.apps.apps.0.key'),
        'broadcastHost' => config('broadcasting.connections.reverb.options.host'),
        'broadcastPorta' => config('broadcasting.connections.reverb.options.port'),
    ];
}

/**
 * Cria o banco com credenciais, host, porta, charset e collation da conexão padrão, conectando sem
 * escolher banco (no PostgreSQL, no `postgres`). O nome vem do argumento ou da própria conexão.
 */
function criarBanco(?string $nome): array
{
    $conexao = config('database.default');
    $config = config("database.connections.{$conexao}");
    $driver = $config['driver'] ?? '';
    $banco = $nome ?? (string) ($config['database'] ?? '');
    $temporaria = "{$conexao}_orbita_criar_banco";

    if (! in_array($driver, ['mysql', 'mariadb', 'pgsql'], true)) {
        return ['ok' => false, 'etapa' => 'criar-banco', 'erro' => "Não sei criar banco '{$driver}' sozinho: crie '{$banco}' manualmente."];
    }

    if (! preg_match('/^[A-Za-z0-9_-]+$/', $banco)) {
        return ['ok' => false, 'etapa' => 'criar-banco', 'erro' => "Nome de banco inválido: '{$banco}'"];
    }

    config(["database.connections.{$temporaria}" => [...$config, 'database' => $driver === 'pgsql' ? 'postgres' : null]]);

    try {
        $ligacao = DB::connection($temporaria);

        if ($driver === 'pgsql') {
            if (! $ligacao->selectOne('select 1 from pg_database where datname = ?', [$banco])) {
                $ligacao->statement('CREATE DATABASE "'.str_replace('"', '""', $banco).'"');
            }
        } else {
            $charset = $config['charset'] ?? 'utf8mb4';
            $collation = $config['collation'] ?? 'utf8mb4_unicode_ci';
            $ligacao->statement('CREATE DATABASE IF NOT EXISTS `'.str_replace('`', '``', $banco)."` CHARACTER SET {$charset} COLLATE {$collation}");
        }
    } catch (Throwable $e) {
        return ['ok' => false, 'etapa' => 'criar-banco', 'erro' => primeiraLinha($e, 300)];
    }

    return ['ok' => true, 'banco' => $banco];
}
