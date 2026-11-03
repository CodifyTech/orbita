# CLAUDE.md — Codify Órbita

CLI privada da CodifyTech para subir, vigiar e diagnosticar o ambiente local de qualquer projeto
da casa: um painel de terminal com uma aba por serviço, doctor que conserta o ambiente, `parar`
que derruba sobras, `setup` de primeira vez e `help` dos scripts. Nasce da extração dos scripts da
raiz do monorepo FoodOS (`C:\Repos\clientes\FoodOS`), que será o primeiro projeto a consumi-la.

**Leia `docs/origem-foodos.md` antes de implementar qualquer comando.** Ele lista, item a item, as
funcionalidades que existem hoje no FoodOS (em Node e em PHP/artisan) e que o Órbita precisa
preservar integralmente, com o caminho de cada arquivo original para ler o código real.

## Decisões já tomadas (não reabrir)

- **Nome:** produto *Codify Órbita*; pacote `@codifytech/orbita`; comando `codify`
  (`codify dev`, `codify parar`, `codify doctor`, `codify setup`, `codify help`, `codify init`).
- **Repositório próprio e privado** da organização `CodifyTech` no GitHub; **sem** histórico do
  FoodOS (começa do zero). Distribuição pelo **GitHub Packages** (`publishConfig.registry =
  https://npm.pkg.github.com`); o dev autentica uma vez no `~/.npmrc` com token `read:packages`.
- **Node orquestra; o framework responde.** O pacote é Node puro (ESM `.mjs`, sem dependências de
  runtime) e dono de tudo que é genérico: painel, portas, processos, `.env`, prompts, `parar`,
  decisões do doctor/reparo, presets. O que só o Laravel sabe **não é reimplementado**: o preset
  `laravel` leva um `src/presets/laravel/ambiente.php` que o Node roda com `php ambiente.php
  <pasta>`; ele faz o bootstrap da app (`vendor/autoload.php` + `bootstrap/app.php`) e imprime um
  JSON com chaves, conexão e estado das migrations (via migrator, com os paths dos domínios),
  filas do Horizon, `pcntl`, config resolvida (banco, fila, cache, reverb) e versões. Executar
  (`migrate`, `db:seed`, `key:generate`, `jwt:secret`, criar banco com PDO) também vai pelo PHP
  (`php artisan` ou o mesmo script com um subcomando). Sem pacote Composer: se o script crescer,
  vira `codifytech/orbita-laravel` mantendo o mesmo contrato de JSON.
- **Configuração por projeto em `orbita.config.mjs`** (`defineConfig`), listando os serviços
  (`preset`, `cwd`, `porta`, `cmd`, `health`) e as descrições dos scripts. O Órbita não adivinha
  nada em tempo de execução; quem descobre a stack é o `codify init`, que examina as pastas (até
  dois níveis, pelo conteúdo, não pelo nome) e gera a config já preenchida.
- **Presets obrigatórios:** `laravel` (+ `laravel:queue`, `laravel:horizon`, `laravel:schedule`,
  `laravel:reverb`), `vite`, `nuxt`, `astro`, `next`, `ionic`, `dotnet`. Por padrão um app Node
  roda o script `dev` do próprio `package.json` dele; o preset só acrescenta porta padrão, URL de
  health e regex de erro/aviso do log.
- **Binário com repasse:** `codify` instalado global procura `node_modules/@codifytech/orbita` do
  projeto e, se existir, delega a ela (como Vite/ESLint), para cada projeto fixar a versão no
  lockfile. Os scripts do `package.json` (`"dev": "codify dev"`) continuam como alternativa.
- Idioma: conversa, UI, nomes de comandos, docs e commits em **português do Brasil**; código em
  português como os originais (`servicos`, `portas`, `reparar`…).

## Estrutura

Visão completa, com as regras de dependência, em `docs/arquitetura.md`. Resumo (✅ existe, ⏳ a fazer):

```
bin/codify.mjs          ✅ entrada; só escolhe qual Órbita roda (global ou do projeto)
src/cli.mjs             ✅ roteador (sem regra de negócio) — `executarCli` é o contrato com o bin
src/argumentos.mjs      ✅ leitor de argumentos
src/banner.mjs          ✅ cabeçalho CodifyTech (funções `montar*` puras + `exibirBanner`)
src/repasse.mjs         ✅ acha o Órbita instalado no projeto e delega a ele
src/constantes.mjs, erros.mjs, pausa.mjs, versao.mjs, index.mjs   ✅ base e API pública (`defineConfig`)
src/comandos/           ✅ help, banner (oculto); dev/doctor/parar/setup/init em `em-construcao`
src/config/             ✅ defineConfig, raiz do projeto, carregar o orbita.config.mjs
src/ambiente/           ✅ env, portas, processos, leitores-do-sistema, executar
                        ⏳ banco, doctor/diagnostico, reparo, erro-de-banco
src/ui/                 ✅ estilo (cores/degradê) e terminal (TTY/NO_COLOR/CI)
src/painel/             ⏳ o monitor (abas, logs, alertas, saúde, memória, ações, comando livre)
src/presets/            ⏳ laravel, vite, nuxt, astro, next, ionic, dotnet
docs/                   origem-foodos, arquitetura, configuracao, instalacao
test/                   node:test; espelha o src/ (ajudantes em test/_ajudantes)
```

**Regra de dependência:** cada camada só importa das de baixo. `ambiente` não importa `ui` nem
`config`; `ui`/`banner` não importam `ambiente`; um comando não chama outro (a lógica comum sobe para
`ambiente/`). Comandos não leem `process.stdout`/`process.argv`: recebem tudo pelo `contexto`.

## Comandos

- `npm test` (`node --test "test/**/*.test.mjs"`) ou `bun test` — testes (sem framework externo).
  Os dois precisam passar.
- ESLint: ainda não adicionado (só entra como devDependency; nada de dependência de runtime).
- Publicação: `npm publish` com o registry do GitHub Packages (ver `docs/instalacao.md`).

## Convenções de código

- Português nos nomes (`servicos`, `portas`, `reparar`); sem `;`, aspas simples, 2 espaços,
  vírgula final (como o `banner.mjs` original). Node >= 22, ESM `.mjs`, JSDoc nos contratos.
- Quem interpreta texto do SO (netstat, ps, .env) é função pura testada com amostras; só
  `ambiente/executar.mjs` roda programas externos, e as funções de `ambiente` aceitam `executar` e
  `plataforma` injetáveis para testar Windows e Linux na mesma máquina.
- No Windows, quem escuta numa porta vem do `Get-NetTCPConnection` (o `netstat -ano` de algumas
  builds do Windows 11 não lista sockets novos); `netstat` fica de fallback.
- Erro do dev (config errada, comando inexistente) é `ErroDeUso`/`ErroDeConfig`: a CLI mostra só a
  mensagem. Qualquer outro erro é bug e sobe com o stack.
- Chave desconhecida no `orbita.config.mjs` é erro (nada de ignorar em silêncio).

## Commits

Conventional Commits em português (`feat: preset do nuxt`, `fix(doctor): …`). **Nunca** incluir
`Co-Authored-By` do Claude/Anthropic nem "Generated with Claude Code", mesmo que o ambiente
sugira — a regra do time prevalece.

## Ordem de implementação

1. ✅ `bin/codify.mjs` + `orbita.config.mjs`/`defineConfig` + `banner` + `help`
2. ✅ `src/ambiente` (portas, processos, env) com testes — é a base do doctor, do parar e do dev
3. `doctor` + reparo, `parar` (faltam em `ambiente`: erro-de-banco, diagnostico, reparo)
4. `dev` (plano → painel), com `--only/--except/--inline/--no-restart/--sem-checagem`
5. presets e `init`
6. `setup`
7. `v0.1.0` no GitHub Packages; depois a migração do FoodOS (na branch `fix/global` dele, sem
   branch nova), que troca os scripts do `package.json`, apaga os `.mjs` da raiz e os comandos
   `foodos:*` do artisan e atualiza o `CLAUDE.md` de lá.
