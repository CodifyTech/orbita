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
| `porta` | inteiro 1–65535 | nenhuma | Porta padrão. Se estiver ocupada, o `dev` oferece outra |
| `cmd` | texto | o do preset | Comando próprio que sobe o serviço |
| `health` | texto | o do preset | Caminho (`/up`) ou URL para checar se o serviço está de pé |

O nome do serviço começa com letra e pode ter letras, números, `-`, `_` e `:`.

**Presets previstos** (etapa 5 do roadmap): `laravel` (e `laravel:queue`, `laravel:horizon`,
`laravel:schedule`, `laravel:reverb`), `vite`, `nuxt`, `astro`, `next`, `ionic`, `dotnet`.
Enquanto os presets não existem, o `preset` é validado só como texto não vazio.

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
    server: { preset: 'laravel', cwd: 'backend', porta: 8000, health: '/up' },
    queue: { preset: 'laravel:queue', cwd: 'backend' },
    schedule: { preset: 'laravel:schedule', cwd: 'backend' },
    reverb: { preset: 'laravel:reverb', cwd: 'backend', porta: 8080 },
    web: { preset: 'vite', cwd: 'frontend', porta: 5173 },
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
