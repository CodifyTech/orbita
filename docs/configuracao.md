# Configuração: `orbita.config.mjs`

Cada projeto tem **um** `orbita.config.mjs` na raiz. Ele diz ao Órbita quais serviços o projeto tem
e como descrever os scripts. O Órbita não adivinha nada em tempo de execução: o que está aqui é o
que vale.

```js
import { defineConfig } from '@codifytech/orbita'

export default defineConfig({
  nome: 'FoodOS',
  // …
})
```

`defineConfig` valida tudo na hora de carregar e mostra **todos** os problemas de uma vez:

```
✗ Configuração inválida em C:\projeto\orbita.config.mjs:
  - configuração: chave desconhecida "servico" (as válidas são: nome, slogan, logo, gerenciador, servicos, descricoes)
  - servicos.web: informe "preset" (ex.: "vite") ou "cmd" (o comando que sobe o serviço)
```

> O pacote precisa estar **instalado no projeto** (`npm install --save-dev @codifytech/orbita`) para o
> `import` acima funcionar. Veja [instalacao.md](instalacao.md).

## Chaves

| Chave | Tipo | Obrigatória | Padrão | O que é |
|---|---|:-:|---|---|
| `nome` | texto | sim | | Nome do projeto: aparece no banner, no `help` e no painel |
| `slogan` | texto | não | vazio | Frase curta exibida ao lado do site no banner |
| `logo` | lista de textos | não | logo do Órbita | Linhas do logo ASCII do projeto |
| `gerenciador` | `npm` \| `bun` \| `pnpm` \| `yarn` | não | `npm` | Quem roda os scripts (aparece como `bun run dev` no `help`) |
| `servicos` | objeto | não | `{}` | Os processos do ambiente local (veja abaixo) |
| `descricoes` | objeto | não | `{}` | `{ script: "descrição" }`, usado pelo banner e pelo `help` |

### `servicos`

Um item por processo que o `dev` sobe. **A ordem em que você declara é a ordem das abas do painel.**

```js
servicos: {
  api: { preset: 'laravel', cwd: 'backend', porta: 8000, health: '/up' },
  web: { cmd: 'bun run dev', cwd: 'frontend', porta: 5173 },
}
```

| Chave | Tipo | Padrão | O que é |
|---|---|---|---|
| `preset` | texto | | O que o Órbita já sabe daquela stack. Informe `preset` **ou** `cmd` (ou os dois) |
| `cwd` | texto | `.` | Pasta do serviço, relativa à raiz do projeto |
| `porta` | inteiro 1–65535 | a do preset | Porta padrão. Se estiver ocupada, o `dev` oferece outra |
| `cmd` | texto | o do preset | Comando próprio que sobe o serviço |
| `health` | texto | o do preset | Caminho (`/up`) ou URL para checar se o serviço está de pé. Sem ele, a saúde é "a porta responde" |

O nome do serviço começa com letra e pode ter letras, números, `-`, `_` e `:`.

### Presets

O preset diz como subir o serviço, a porta padrão, a saúde, a cor da aba, o que procurar no log e o
que o `doctor` e o `setup` fazem por ele. Um preset desconhecido é erro, com a lista dos válidos.

| Preset | Sobe com | Porta | Saúde | O doctor confere |
|---|---|:-:|---|---|
| `laravel` | `php artisan serve --host --port` | 8000 | `/up` | `APP_KEY`, `JWT_SECRET` (se usa tymon/jwt-auth), banco (conexão e migrations), Redis (se a fila/cache usa) |
| `laravel:queue` | `php artisan queue:listen` com **todas** as filas do Horizon | — | — | conexão da fila (`sync` é aviso) |
| `laravel:horizon` | `horizon:listen` (com chokidar) ou `horizon` | — | — | sai sozinho sem pcntl ou sem fila redis (aí vale o `laravel:queue`) |
| `laravel:schedule` | `php artisan schedule:work` | — | — | |
| `laravel:reverb` | `php artisan reverb:start --port` | 8080 | porta | `VITE_REVERB_APP_KEY` do frontend igual à do backend |
| `laravel:pail` | `php artisan pail` | — | — | sai sozinho sem pcntl (o PHP do Windows não tem) |
| `vite` | script `dev` do app, `--port N --strictPort` | 5173 | `/` | pasta, gerenciador no PATH, `node_modules`, `VITE_API_URL` |
| `nuxt` | script `dev`, `--port N` | 3000 | `/` | idem, com `NUXT_PUBLIC_API_BASE` |
| `astro` | script `dev`, `--port N` | 4321 | `/` | idem, com `PUBLIC_API_URL` |
| `next` | script `dev`, `-p N` | 3000 | `/` | idem, com `NEXT_PUBLIC_API_URL` |
| `ionic` | script `dev`, `--port N` | 8100 | `/` | idem, com `VITE_API_URL` |
| `dotnet` | `dotnet watch run --urls` | 5000 | porta | `dotnet` no PATH |

Os apps Node rodam o script `dev` do **próprio** `package.json` com o `gerenciador` da config (o npm
recebe `--` antes dos argumentos). A variável da API de cada frontend é conferida contra a API local,
que é o primeiro serviço `laravel` ou `dotnet` do projeto.

Serviço sem preset (só `cmd`) também funciona: o Órbita sobe o comando como está e confere só se a
pasta existe.

## Preferências desta máquina

O que é de **uma** máquina (e não vai para o git) fica num `.env`: o do primeiro serviço Laravel
(onde o FoodOS sempre guardou) ou, sem Laravel, o da raiz do projeto.

| Variável | Efeito |
|---|---|
| `DEV_ONLY` / `DEV_EXCEPT` | filtro fixo de serviços (o `--only` da execução vence o `DEV_ONLY`) |
| `DEV_SERVER_HOST` | host do `php artisan serve` (padrão `127.0.0.1`; `0.0.0.0` expõe na rede) |
| `DEV_SERVER_PORT` | porta do serviço `laravel` |
| `REVERB_SERVER_PORT` | porta do `laravel:reverb` (no `.env` do próprio app) |
| `DEV_<NOME>_PORT` | porta de qualquer outro serviço: `web` → `DEV_WEB_PORT`, `api-pix` → `DEV_API_PIX_PORT` |

A porta vale nesta ordem: preferência da máquina → `porta` da config → padrão do preset. Quem grava
essas variáveis é o `codify doctor`, quando você aceita trocar uma porta ocupada. O `codify dev` troca
**só naquela execução**, sem editar arquivo: passa variáveis de ambiente para os processos, e quem
depende do serviço acompanha. Se a API muda de porta, o frontend que aponta para a API local recebe
o endereço novo. Se o Reverb muda, `REVERB_PORT` e `VITE_REVERB_PORT` vão junto.

## Variáveis do Órbita

| Variável | Efeito |
|---|---|
| `ORBITA_PHP` | caminho do PHP a usar, quando o do PATH é de outra versão (ex.: `C:/wamp64/bin/php/php8.5.0/php.exe`) |
| `ORBITA_BANNER=compacto` | banner de uma linha |
| `ORBITA_PLANO=<arquivo>` | o `dev` sobe direto de um plano gravado com `--plano=<arquivo>` (para depurar o painel) |
| `NO_COLOR` / `CI` | sem cores / sem animações |

### `descricoes`

O texto que aparece depois do `▶` no banner e ao lado de cada script no `help`. Se o script não tem
descrição, o `help` o mostra em vermelho. Quando existe um `descricoes` no `package.json` do projeto,
ele vale como **fallback**: a chave do `orbita.config.mjs` vence.

### `logo`

Uma lista com as linhas do logo (fonte "ANSI Shadow" funciona bem). O degradê laranja → magenta é
aplicado pelo Órbita:

```js
logo: [
  '███████╗ ██████╗  ██████╗ ██████╗  ██████╗ ███████╗',
  '██╔════╝██╔═══██╗██╔═══██╗██╔══██╗██╔═══██╗██╔════╝',
  // …
],
```

Sem `logo`, vale o do próprio Órbita.

## Exemplo completo: FoodOS

```js
import { defineConfig } from '@codifytech/orbita'

export default defineConfig({
  nome: 'FoodOS',
  slogan: 'Gestão e PDV para bares e restaurantes',
  gerenciador: 'bun',
  servicos: {
    server: { preset: 'laravel', cwd: 'backend' },
    queue: { preset: 'laravel:queue', cwd: 'backend' },
    // Declarar os dois é seguro: com pcntl e fila redis fica o Horizon; senão, o queue:listen.
    horizon: { preset: 'laravel:horizon', cwd: 'backend' },
    schedule: { preset: 'laravel:schedule', cwd: 'backend' },
    reverb: { preset: 'laravel:reverb', cwd: 'backend' },
    logs: { preset: 'laravel:pail', cwd: 'backend' },
    web: { preset: 'vite', cwd: 'frontend' },
  },
  descricoes: {
    setup: 'Prepara tudo: dependências, .env, chaves, migrate (+ seed em banco vazio)',
    dev: 'Sobe API, fila, scheduler, Reverb e SPA num painel de terminal',
    'dev:doctor': 'Confere o ambiente e oferece consertar',
    'test:api': 'Testes do backend (Pest)',
  },
})
```

E no `package.json` do projeto:

```json
{
  "scripts": {
    "setup": "codify setup",
    "dev": "codify dev",
    "dev:backend": "codify dev --except=web",
    "dev:doctor": "codify doctor",
    "test:api": "codify banner test:api && cd backend && php artisan test --compact"
  }
}
```

`codify banner <script>` mostra o cabeçalho com a descrição do script, para scripts que não são do
Órbita terem o mesmo visual.

## Onde o Órbita procura a config

A partir da pasta onde você rodou o comando, sobe de pasta em pasta até achar um
`orbita.config.mjs`. Isso permite rodar `codify` de dentro de `backend/`, por exemplo. Sem config, usa
a pasta do `package.json` mais próximo e o `name` dele como nome do projeto.
