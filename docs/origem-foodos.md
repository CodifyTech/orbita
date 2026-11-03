# O que o Órbita herda do FoodOS

Inventário das funcionalidades que existem hoje no monorepo FoodOS (`C:\Repos\clientes\FoodOS`,
branch `fix/global`) e que o Órbita precisa preservar. Antes de implementar cada comando, **leia o
arquivo original** indicado: o comportamento descrito aqui é um resumo, o código é a verdade.

Hoje a responsabilidade é dividida: o Node (raiz) faz banner, ajuda, setup visual e o painel; o PHP
(`backend/app/Console/Commands/Dev/`) faz doctor, reparo, parar, setup do ambiente e o "plano" do
dev. No Órbita a lógica e as decisões viram Node; o PHP fica reduzido a **um script de consulta e
execução** (`src/presets/laravel/ambiente.php`, ver CLAUDE.md) que devolve JSON. Onde este
documento diz "no Node: parse ou `php artisan config:show`", leia: perguntar ao `ambiente.php`.

## Arquivos de origem

| Arquivo | Linhas | Vira |
|---|---|---|
| `banner.mjs` | 110 | `src/banner.mjs` |
| `ajuda.mjs` | 46 | `codify help` |
| `setup.mjs` | 234 | `codify setup` (parte visual) |
| `monitor.mjs` | 2550 | `src/painel/` |
| `backend/app/Console/Commands/Dev/SubirCommand.php` (`foodos:dev`) | 292 | `codify dev` (resolução de portas + plano) |
| `backend/app/Console/Commands/Dev/DoctorCommand.php` (`foodos:doctor`) | 66 | `codify doctor` |
| `backend/app/Console/Commands/Dev/DiagnosticoDev.php` | 260 | `src/ambiente/diagnostico.mjs` |
| `backend/app/Console/Commands/Dev/ReparoDev.php` | 334 | `src/ambiente/reparo.mjs` |
| `backend/app/Console/Commands/Dev/PararCommand.php` (`foodos:parar`) | 112 | `codify parar` |
| `backend/app/Console/Commands/Dev/Portas.php` | 253 | `src/ambiente/portas.mjs` |
| `backend/app/Console/Commands/Dev/SetupCommand.php` (`foodos:setup`) | 325 | `codify setup` (parte do ambiente) |
| `backend/app/Console/Commands/Dev/ErroDeBanco.php` | 124 | `src/ambiente/erro-de-banco.mjs` |
| `backend/app/Console/Commands/Dev/EnvArquivo.php` | 32 | `src/ambiente/env.mjs` |
| `backend/app/Providers/DevServiceProvider.php` | 120 | preset `laravel` (processos, filas, Horizon×queue) |
| `backend/config/dev.php` | 40 | variáveis `DEV_*` lidas pelo preset `laravel` |
| `package.json` da raiz (`scripts` + `descricoes`) | — | `orbita.config.mjs` → `scripts`/`descricoes` |
| `CLAUDE.md` da raiz, seção "Comandos (raiz)" | — | documentação do usuário |

## 1. Banner (`banner.mjs`)

- Logo ASCII em degradê laranja→magenta, linha a linha com pausa; assinatura "desenvolvido e
  mantido por CodifyTech" com brilho que corre (degradê azul→roxo deslizando, 21 quadros);
  slogan do projeto + site `https://codifytech.com.br`; linha `▶ bun run <comando> — <descrição>`
  e régua em degradê.
- Descrição vem do `descricoes` do `package.json` (no Órbita: do `orbita.config.mjs`, com
  fallback ao `package.json`).
- **Sem TTY, com `CI` ou `NO_COLOR`:** texto puro, sem animação nem cor. Esconde o cursor durante a
  animação e restaura no `exit`.
- `FOODOS_BANNER=compacto` → uma linha (`▶ CodifyTech › <comando>  Projeto · site`), usada nas
  etapas do `verificar`. No Órbita a variável vira `ORBITA_BANNER=compacto`.
- O logo e o slogan são do projeto (vêm da config: `nome`, `logo` opcional, `slogan`); a assinatura
  e o site são da CodifyTech, fixos.

## 2. Ajuda (`ajuda.mjs` → `codify help`)

- Lê `scripts` + `descricoes` e agrupa: "Ambiente local" (`setup`, `dev`, `dev:*`), "Qualidade"
  (`test*`, `lint*`, `typecheck*`, `build*`, `verificar`), "Outros". Filtro por prefixo
  (`help dev` só `dev:*`). Script sem descrição aparece em vermelho com "(sem descrição…)".
- Bloco "Dicas": primeira vez (`setup → dev`), opções `--only/--except` com a lista de processos,
  atalhos do painel, preferência fixa da máquina (`DEV_EXCEPT/DEV_ONLY/DEV_SERVER_HOST`).
- No `verificar` do FoodOS cada etapa roda com o banner compacto; o `help` precisa continuar
  listando os scripts do projeto que não são do Órbita (lint, test…).

## 3. Portas e processos (`Portas.php`)

Funciona no Windows (netstat/tasklist/PowerShell `Get-CimInstance`) e Linux/macOS (lsof, `ss`
como fallback, `ps`).

- `emUso(porta)`: tenta conectar em `127.0.0.1` **e** `[::1]` (o Vite no Windows escuta só IPv6),
  timeout 200 ms.
- `proximaLivre(porta, reservadas)`: até `porta+50`, pulando as já escolhidas para outros serviços.
- `escutando()`: mapa porta→PID numa chamada só (porta a porta é lento no Windows). No Windows
  identifica escuta pelo endereço remoto `0.0.0.0:0`/`[::]:0`, não pelo texto LISTENING (muda com o
  idioma). Em TCP e TCPv6.
- `dono(porta)` → `{pid, nome, dica, encerravel}`. `encerravel` só se o processo é `php`, `node`
  ou `bun`. `dica` por nome: `wslrelay` (porta encaminhada do WSL), `php` (outro serve/reverb),
  `node`/`bun` (outro Vite), `docker`/`vpnkit` (container), senão "outro programa da máquina".
- `processos()`: todos os processos com `pid, ppid, nome, comando` (PowerShell JSON no Windows;
  `ps -axo pid=,ppid=,args=` fora).
- `raizDaSessao(pid)`: sobe a árvore (máx. 30 passos) procurando o ancestral mais alto cujo comando
  casa `monitor.mjs|concurrently|@laravel/multiplex|artisan (foodos:)?dev` — no Órbita, também
  `codify dev`/`orbita`. Encerrar a raiz derruba fila e scheduler, que não ocupam porta.
- `encerrar(pid)`: `taskkill /PID /T /F` no Windows; `kill` fora. `encerrarArvore`: no Linux,
  monta a árvore de descendentes e mata **pai antes dos filhos** (supervisor vivo os reiniciaria).
- `aguardarLiberar(porta)`: até 15 tentativas de 200 ms.
- `nomeDoProcesso(pid)`: `tasklist /FI "PID eq" /FO CSV` (sem processo, responde frase, não CSV).

## 4. Diagnóstico (`DiagnosticoDev.php`) — `codify doctor`

Cada item é `ok`, `aviso` ou `erro`, com `detalhe` e um `reparo` opcional (`porta`, `migrar`,
`banco`). Erro impede subir; aviso sobe mas funciona errado. Checa só os serviços que vão subir.

Preset `laravel` (lê `backend/.env` e os arquivos de config necessários — no Node, via parse do
`.env` + defaults do Laravel; o que não dá para saber sem o framework, pergunta ao `php artisan`):

1. **Chaves:** `APP_KEY` vazia → erro ("rode `php artisan key:generate`"); `JWT_SECRET` vazio →
   erro (o login falha). JWT só se o projeto usa (detectar `tymon/jwt-auth` no composer.json).
2. **Banco:** SQLite com arquivo inexistente (≠ `:memory:`) → erro. Sem conexão → erro com reparo
   `banco` (mensagem na 1ª linha, limitada a 120 chars). Conecta mas nunca migrou (tabela
   `migrations` não existe) → aviso com reparo `migrar` + seed. Migrations pendentes → aviso com
   reparo `migrar` sem seed (contar: arquivos em `database/migrations` + paths extras — no FoodOS,
   `app/Domains/*/Migrations` — menos as já rodadas na tabela `migrations`). Em dia → ok.
   *No Node:* conectar com cliente mysql/pg/sqlite por processo filho ou via
   `php artisan migrate:status --no-interaction` (parse); escolher o mais simples que preserve os
   três estados.
3. **Redis:** só se vai subir `horizon` ou `QUEUE_CONNECTION`/`CACHE_STORE` = redis. `PING` →
   ok `host:porta`; falha → erro com dica `docker compose -f compose.yaml up -d redis`.
4. **Fila:** `sync` → aviso ("jobs rodam na requisição e o worker fica ocioso"); `horizon` → ok
   "Horizon (conexão)"; `queue` → ok "queue:listen (conexão[, sem pcntl para o Horizon]), N filas".
5. **Portas** de `server`, `reverb`, `web` (só os que sobem): livre → ok; em uso → aviso "em uso por
   `<nome> (PID)` — `<dica>`. O `dev` oferece outra porta", reparo `porta`.
6. **Frontend** (se `web` sobe): pasta não existe → erro; `bun` fora do PATH → erro; sem
   `node_modules` → erro ("rode setup"). `VITE_API_URL` (lida de `.env`, `.env.local`,
   `.env.development`, `.env.development.local`, nesta precedência) vazia → aviso; apontando para
   outra API → aviso explicando criar `.env.local`; local → ok. `VITE_REVERB_APP_KEY` vazia → aviso
   ("funciona, mas sem tempo real"); ≠ `REVERB_APP_KEY` do backend → aviso ("websocket recusado");
   igual → ok.
- `urlApiLocal()`: host `0.0.0.0` vira `127.0.0.1`. `apontaParaApiLocal(url)`: host ∈
  {localhost, 127.0.0.1, 0.0.0.0, DEV_SERVER_HOST}.
- Saída: tabela de duas colunas com `✓`/`!`/`✗` coloridos, linha "Processos: …" no topo; resumo
  "N problema(s) impedem o ambiente de subir" (exit 1) ou "Ambiente pronto".
- Loop: até **6 rodadas** de diagnóstico → reparo → diagnóstico, enquanto houver reparo aceito.
  `--sem-perguntas` (ou sem TTY) só diagnostica.

Para presets não-Laravel o doctor checa o que couber: pasta, gerenciador de pacotes no PATH,
`node_modules`, porta, variáveis de ambiente que o preset declarar (ex.: `NUXT_PUBLIC_API_BASE`).

## 5. Reparo (`ReparoDev.php`)

Cada "sim" grava no `.env` **e** vale já nesta execução; o doctor confere tudo de novo.

- **Porta:** mostra dono e sugere a próxima livre (reservando as dos outros serviços); confirma
  "Trocar a porta do X para a N (grava no .env)?". Grava: `server` → `DEV_SERVER_PORT` e, se o
  frontend aponta para a API local, `VITE_API_URL` em `frontend/.env.local`; `reverb` →
  `REVERB_SERVER_PORT`, `VITE_REVERB_PORT` no `.env.local` e `REVERB_PORT` **só se**
  `broadcasting.reverb.host` é local; `web` → `DEV_FRONTEND_PORT`. Sem porta livre → mensagem.
- **Banco**, pelo tipo do erro (ver §7): recusada/host inexistente → pergunta host e porta (porta
  1–65535); acesso negado → usuário e senha (senha oculta, pode ser vazia); banco inexistente →
  `select` com "Criar o banco", "Configurar outro banco" (nome `[A-Za-z0-9_-]+`), "Nada, eu
  resolvo". Criar: mysql/mariadb `CREATE DATABASE IF NOT EXISTS \`x\` CHARACTER SET … COLLATE …`
  (charset/collation do `.env`/config, default utf8mb4/utf8mb4_unicode_ci); pgsql conecta no
  `postgres`, checa `pg_database` e `CREATE DATABASE "x"`; outro driver → aviso "crie manualmente".
  Escapar crase/aspas duplas dobrando-as.
- **Migrar:** confirma "Rodar as migrations e o seed agora?" (nunca migrado) ou "Rodar as migrations
  pendentes agora?"; executa `php artisan migrate --force` (+ `db:seed --force`); falha → explica
  com `ErroDeBanco.explicar` (problema + passos numerados).
- Gravar no `.env` do backend; no frontend sempre `.env.local` (o Vite lê por cima e o git ignora),
  e só se a pasta existe.

## 6. `.env` (`EnvArquivo.php`)

`gravar(arquivo, chave, valor)`: substitui a linha `CHAVE=...` existente (regex multiline) ou
acrescenta no fim, preservando comentários, ordem e fim de linha. Valor com espaço, `#`, aspas,
barra ou `$` vai entre aspas duplas com `"`, `\` e `$` escapados. Parse: compatível com o Dotenv
(aspas, comentários, `export`), precedência "o último vence" entre arquivos.

## 7. Erros de banco (`ErroDeBanco.php`)

- `tipo(mensagem, driver)`: `host-inexistente` (getaddrinfo, php_network_getaddresses, "Name or
  service not known", "No such host"); `recusada` ([2002], "Connection refused", "actively
  refused", "recusou", "could not connect to server"); `acesso-negado` ([1045], "Access denied",
  "password authentication failed"); `banco-inexistente` ([1049], "Unknown database", "does not
  exist" — ignorado no sqlite). Case-insensitive. Incluir os equivalentes dos clientes
  mysql/psql/Node, já que a mensagem não virá mais do PDO.
- `explicar(mensagem, conexao)` → `{problema, passos[]}`: driver ausente (`could not find driver` →
  `php --ini`, `extension=pdo_*`); host não encontrado (fora do Docker use `127.0.0.1`); nenhum
  servidor respondeu (WAMP verde / `docker compose up -d mariadb` / conferir DB_HOST/DB_PORT / usar
  SQLite); usuário recusado; banco não existe e sem permissão (SQL do CREATE / usuário com CREATE);
  SQLite não abre (caminho relativo à pasta do backend, permissão); default: 1ª linha da mensagem
  (300 chars) + "migration pela metade → `migrate:fresh --seed`" + caminho do `laravel.log`.

## 8. Subir (`SubirCommand.php` → `codify dev`)

- Opções: `--only=a,b`, `--except=a,b` (nome desconhecido → erro listando os válidos; filtro
  permanente em `DEV_ONLY`/`DEV_EXCEPT` do `.env`), `--sem-checagem` (pula o doctor),
  `--no-restart`, `--timestamps`, `--plano=<arquivo>` (grava o JSON em vez de subir). Lista vazia
  após o filtro → erro.
- **Resolução de portas antes do doctor**, serviço a serviço, reservando as portas já decididas:
  porta livre → segue. Ocupada: com TTY, `select` "A porta N (x) está em uso por `<dono>`" com
  opções *Usar a porta M nesta execução* (+ "(o SPA acompanha)" quando não é o web), *Encerrar
  `<dono>` e usar a N* (só se encerrável), *Não subir o x agora*, *Cancelar*; hint = dica do dono.
  Sem TTY: troca de porta (sem porta livre → erro e cancela). Encerrar falhou → aviso e cai em
  trocar (ou cancelar se não há porta).
- **Troca só nesta execução**, sem editar arquivo: variáveis de ambiente herdadas pelos filhos
  (vencem o `.env` no Laravel e no Vite): `server` → `DEV_SERVER_PORT` e `VITE_API_URL` se o
  frontend aponta para a local ("; o SPA já aponta para ela"); `reverb` → `REVERB_SERVER_PORT`,
  `VITE_REVERB_PORT` e `REVERB_PORT` se o host do broadcasting é local ("; API, fila e SPA já usam
  a nova"); `web` → `DEV_FRONTEND_PORT` ("; abra http://localhost:M").
- Depois roda o doctor (`--sem-perguntas` se sem TTY); falha → "Corrija os itens acima ou rode com
  `--sem-checagem`".
- **Plano** (o contrato entre a checagem e o painel): `processos[{nome, comando, cor}]`, `env`
  (variáveis trocadas), `reiniciar` (bool), `portas{nome: porta}`, `urls{server, web, reverb}`
  (reverb `ws://host:porta`, host `0.0.0.0`/`::` vira `127.0.0.1`), `saude` (`/up`), `logs`
  (pasta `storage/logs`), `ambiente{app, env, laravel, php, banco ("conexão · nome"), fila, filas[],
  cache}`. No Órbita o plano é gerado em Node a partir do `orbita.config.mjs` + presets; os campos
  de `ambiente` do Laravel vêm do `.env`/`php -v`/`composer.lock`.

### Preset `laravel` (`DevServiceProvider.php` + `config/dev.php`)

- Processos, nesta ordem (abas): `server` (`serve --host= --port=`, azul), `queue`
  (`queue:listen --tries=1 --timeout=0 --queue=<todas as filas>`, roxo), `horizon`
  (`horizon:listen` se `node_modules/chokidar` existe no backend, senão `horizon`; roxo),
  `schedule` (`schedule:work`, amarelo), `reverb` (`reverb:start`, rosa), `logs` (`pail`, só com
  pcntl), `web` (`bun run --cwd <frontend> dev --port N`, verde). `vite` do backend é sempre
  excluído.
- **Horizon × queue:** Horizon só com `pcntl` (não existe no PHP nativo do Windows) **e**
  `QUEUE_CONNECTION=redis`; senão `queue:listen`. Nunca os dois. Detectar pcntl: `php -m`.
- **Filas:** `default` + todas as `queue` dos supervisores de `config/horizon.php` (`defaults`), sem
  repetir, na ordem (no Node: `php artisan config:show horizon.defaults` ou parse; aceitar lista
  explícita na config do projeto).
- Variáveis: `DEV_ONLY`, `DEV_EXCEPT`, `DEV_SERVER_HOST` (default 127.0.0.1; `0.0.0.0` expõe na
  rede para testar o AgenteOS em outro equipamento), `DEV_SERVER_PORT` (8000),
  `DEV_FRONTEND_PATH` (`../frontend`, relativo ao backend), `DEV_FRONTEND_PORT` (5173). Reverb:
  `REVERB_SERVER_PORT` (8080), `REVERB_APP_KEY`.
- Windows: o console precisa de UTF-8 (`chcp 65001` / `sapi_windows_cp_set`) para os acentos.
- O backend usa bun apesar de ter `pnpm-lock.yaml`/`package-lock.json`: o gerenciador vem da config
  do projeto, não do lockfile.

## 9. Parar (`PararCommand.php` → `codify parar`)

- Opções `--force` (sem confirmação), `--listar` (só mostra).
- Para cada serviço com porta (`server`, `reverb`, `web`), olha a porta base **e as 10 seguintes**
  (o dev pode ter trocado). Para cada porta em escuta: identifica dono e raiz da sessão. Fora da
  porta base só encerra se há raiz de sessão do dev (um Node qualquer na 5175 não é nosso); na porta
  base sem raiz, só se o dono é encerrável, senão lista em "Não vou encerrar — …" com a dica
  (ex.: `wslrelay`).
- Agrupa por PID raiz: descrição "sessão do `dev` (PID N): API, fila, scheduler, Reverb e SPA dela"
  ou `<nome> (PID)`; mostra tabela "Vou encerrar:" com as portas. Nada → "Nada do ambiente local
  está rodando". Sem TTY e sem `--force` → erro pedindo `--force`. Confirma "Encerrar?" (default
  sim).
- Encerra a árvore, aguarda cada porta liberar; presa → erro "Continuam em uso: … Encerre pelo
  gerenciador de tarefas (ou `kill`) o PID N" e exit 1.

## 10. Setup (`setup.mjs` + `SetupCommand.php` → `codify setup`)

Parte visual (Node, já existe):
- Logo + "por CodifyTech"; boas-vindas **digitadas** letra a letra ("Bem-vindo(a) à CodifyTech! 👋",
  o que é o projeto, "vou preparar tudo e explicar cada passo"), aviso de que pode rodar de novo.
- `[0/3]` confere ferramentas (PHP, Composer, Bun; versão extraída de `--version`) com dica de
  instalação para cada faltante e sai. No Órbita a lista vem dos presets (php/composer para
  laravel, bun/node/pnpm conforme o projeto, dotnet para .NET, ionic CLI para ionic).
- Etapas `[n/3]` com título + "porquê" em cinza; cada comando roda com **spinner** braille + tempo,
  guardando a saída e mostrando as **15 últimas linhas** só se falhar, seguido de "Como resolver"
  numerado e "Depois rode `setup` de novo". `composer install --no-interaction --no-progress` no
  backend; `bun install` no frontend; checa `vendor/autoload.php` antes da etapa 3.
- `SIGINT` → "Setup interrompido. Pode rodar de novo: ele continua de onde parou" (exit 130).
- Fim: régua, "Tudo pronto! … em Ns", "Agora é só rodar `dev`. Bom código! 🚀 — equipe CodifyTech".

Parte do ambiente (PHP, portar):
- Sem `backend/.env` → copia `.env.example`, avisa e **reexecuta** (a config carregou sem `.env`).
- Etapas com título e explicação em português simples: *Chaves* (`key:generate --force` se
  `APP_KEY` vazia; `jwt:secret --force` se `JWT_SECRET` vazio), *Banco*, *Frontend*, *Check-up
  final* (doctor; falha → "O banco está pronto, mas os itens com ✗ impedem o dev. Corrija e rode
  setup de novo").
- **Banco:** sqlite → `DB_DATABASE` vazio vira `database/database.sqlite` (gravado no `.env`),
  arquivo criado se faltar (caminho absoluto/relativo ao backend). Até 6 tentativas de conectar;
  com TTY, falha chama o reparo de banco (§5) e tenta de novo; sem conserto, se o erro é "banco
  inexistente" segue (o `migrate --force` cria), senão falha explicada. `migrate --force`; se o
  banco **já tinha migrations rodadas**, não roda seed ("rodei só as migrations novas"; dica
  `migrate:fresh --seed`); vazio → `db:seed --force`. Falhas → `falhar(título, erro)` com
  `ErroDeBanco.explicar` e "Depois rode setup de novo (ou só o comando do backend)".
- **Frontend:** cria `frontend/.env` a partir do `.env.example` (ou vazio) se não existe; valores
  locais (`VITE_APP_NAME`, `VITE_API_URL` local, `VITE_REVERB_APP_KEY` = `REVERB_APP_KEY`,
  `VITE_REVERB_HOST=localhost`, `VITE_REVERB_PORT`, `VITE_REVERB_SCHEME=http`): num `.env` novo
  grava todos; num existente **só os vazios** (não sobrescreve escolha do dev). Se o `.env`
  resultante aponta para outra API ou outra chave do Reverb e não há `.env.local`, cria
  `frontend/.env.local` com comentário explicando e `VITE_API_URL` + `VITE_REVERB_APP_KEY` locais.
- **Próximos passos:** tabela `dev`, `dev:backend`, `dev:doctor`, `dev:list` com descrição; URLs do
  SPA e da API; "Login do seed: admin@admin.com / 123456" se o usuário existe no banco (consulta;
  no Órbita, texto configurável no preset/config).

## 11. Painel (`monitor.mjs` → `codify dev`)

Leia o arquivo inteiro: 2550 linhas, Node puro, sem dependência. Resumo do que faz:

- **Entrada:** `--classico` (roda o `php artisan dev` do framework, sem painel), `--inline` ou sem
  TTY (linhas prefixadas por serviço, cor por serviço), `FOODOS_PLANO=<json>` pula a checagem e usa
  um plano pronto (para depurar o painel → `ORBITA_PLANO`). Demais args vão para o `foodos:dev`.
- **Serviços:** um por processo do plano + aba `laravel` (vigia `storage/logs/laravel.log`, parse
  Monolog `[data] canal.NÍVEL: msg`, lê só o trecho novo por posição) + aba `tarefas` (saída das
  ações e comandos livres; só aparece quando tem conteúdo). Aba "Todos"/geral com cartões por
  serviço e "Alertas".
- **Logs:** buffers limitados (4000 linhas por serviço, 8000 no "todos", 500 alertas); classificação
  por regex de erro (`ERROR|CRITICAL|FAIL|Fatal error|Uncaught|SQLSTATE|ECONNREFUSED|EADDRINUSE|
  Exception|Error|Erro`) e aviso (`WARN|Warning|DEPRECATED|NOTICE`); alertas guardam contexto
  (linhas vizinhas) e `seq` para "ver no log"; realce de tokens (URLs, status HTTP, tempos, níveis);
  filtro `/` com realce; rolagem (↑↓ PgUp PgDn, `g` topo, End segue); `c` limpa; `y` copia o
  visível (clip no Windows, pbcopy, wl-copy/xclip).
- **Supervisão:** spawn com env do plano + `FORCE_COLOR`; detecção de porta em escuta; reinício
  automático com até 5 tentativas quando cai (se `reiniciar`); `r` reinicia, `s` para/sobe, `R`
  reinicia todos; matar com escalada (SIGTERM → forçar); ao sair restaura o terminal e mata tudo
  (`matarTudoAgora`), também em `uncaughtException` (com dica do `--classico`). Aguarda porta
  liberar antes de subir de novo.
- **Saúde:** `GET <url>/up` (latência, status, sparkline de latência com cor verde/amarelo/vermelho)
  ou TCP na porta; estados (subindo, saudável, degradado, parado, caiu, reiniciando) com ícone e cor.
- **Memória** por serviço (árvore de processos; PowerShell no Windows, `ps` fora), req/min pelo log,
  contagem de jobs no log da fila; sparklines `▁▂▃▄▅▆▇█`.
- **Ações rápidas (`a`):** limpar caches (`optimize:clear`), migrar, `migrate:status`,
  `queue:failed`, `queue:retry all`, diagnóstico (`doctor --sem-perguntas`), reiniciar todos, abrir
  API/SPA no navegador (`o`), "Conhecer a CodifyTech". No Órbita as ações vêm do preset
  (Laravel as acima; Node: `install`, `typecheck`…) + as da config.
- **Comando livre (`:`):** caixa com alvo backend/frontend (Tab alterna), histórico ↑↓, dica de
  exemplo por alvo; saída na aba tarefas. No Órbita o alvo é qualquer serviço (cwd dele).
- **UI:** splash com logo (1,7 s), cabeçalho com nome do app/ambiente/versões/banco/fila/cache,
  barra de abas com contadores de novos, cartões com estado/porta/url/memória/latência, rodapé de
  dicas por vista, toasts, caixas de ajuda (`?`), ações, comando, encerrando; mouse (clique nas
  abas, rolagem; `m` liga/desliga); título do terminal; redesenho só das linhas que mudaram;
  largura visual com wide chars/ANSI (funções `larguraDe`, `cortar`, `quebrar`, `vis`).
- Teclas: ver `DICAS` (linhas 1727–1764) e `tecla*` (2082–2330).

## 12. Scripts da raiz do FoodOS (modelo do que o `init` gera)

`dev`, `dev:backend` (`--except=web`), `dev:doctor`, `dev:list`, `dev:help`, `dev:parar`,
`dev:api`, `dev:web`, `dev:reverb`, `dev:queue` (`--only=queue --sem-checagem`), `dev:schedule`,
`test:api`, `lint:api`, `typecheck:web`, `lint:web`, `lint:check:web`, `test:web`,
`build:agente`, `test:agente`, `lint:agente`, `verificar` (encadeia tudo com banner compacto),
`help`. Todo script tem o banner na frente e uma entrada em `descricoes`.
