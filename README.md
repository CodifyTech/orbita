# Codify Órbita

> A CLI da CodifyTech para **subir, vigiar e diagnosticar o ambiente local** de qualquer projeto da casa.

Hoje cada projeto tem seus próprios scripts para rodar o ambiente de desenvolvimento: um para subir
a API, outro para o front, outro para a fila. Quando algo dá errado (porta ocupada, banco fora do
ar, `.env` incompleto), cada dev descobre sozinho. O Órbita junta tudo isso num comando só, igual em
todos os projetos:

```bash
codify init     # uma vez por projeto: examina as pastas e gera o orbita.config.mjs
codify setup    # primeira vez na máquina: dependências, .env, chaves, banco
codify dev      # o dia a dia: sobe tudo num painel de terminal, uma aba por serviço
codify doctor   # algo estranho? confere o ambiente e conserta o que estiver errado
codify parar    # derruba o que ficou rodando (terminal fechado, sobra de outro dev)
codify help     # todos os comandos e scripts do projeto
```

O Órbita nasceu da extração dos scripts da raiz do monorepo FoodOS, que já o usa. A lista do que ele
herdou está em [docs/origem-foodos.md](docs/origem-foodos.md).

---

## O que ele faz

- **`dev`**: antes de subir, resolve porta ocupada (usa a próxima livre só nesta execução, encerra
  a sobra de outro `dev` ou deixa o serviço de fora) e roda o doctor. Depois abre um **painel de
  terminal** com:
  - uma aba por serviço, uma "Todos" e "Alertas", com erros e avisos de tudo e o contexto;
  - o `laravel.log` ao vivo;
  - saúde (`/up` ou porta), memória, req/min e jobs;
  - reinício automático;
  - ações rápidas (`a`) e comando livre em qualquer pasta (`:`).
- **`doctor`**: confere chaves, banco (conexão e migrations), Redis, fila, portas e as variáveis do
  frontend, e **oferece consertar**:
  - porta ocupada: troca e grava no `.env`;
  - host/porta do banco recusados;
  - usuário e senha do banco;
  - banco que não existe: cria ou configura outro;
  - migrations pendentes.
- **`setup`**: confere as ferramentas (PHP, Composer, Bun…), instala as dependências de cada pasta,
  cria o `.env`, gera as chaves, prepara o banco (com seed só em banco vazio), aponta o frontend para
  a API local e termina com um check-up. Pode rodar de novo, porque continua de onde parou.
- **`parar`**: acha pelas portas o que ficou rodando e encerra a sessão inteira (fila e scheduler
  juntos). Não encerra o que não é `php`, `node` nem `bun`.
- **`init`**: descobre a stack pelo conteúdo das pastas (Laravel, Vite, Nuxt, Astro, Next, Ionic,
  .NET) e gera a config e os scripts do `package.json`.

---

## Instalação

O pacote é privado, publicado no **GitHub Packages** da organização CodifyTech. Você autentica uma
vez no `~/.npmrc` e instala como qualquer pacote:

```bash
bun install --save-dev @codifytech/orbita   # no projeto (recomendado: fixa a versão no lockfile)
bun install --global @codifytech/orbita     # opcional: deixa o comando `codify` em qualquer pasta
```

> **Use o `bun` para instalar.** O `npm install` não funcionou para este pacote, então a instalação
> oficial é pelo bun.

Passo a passo do token em [docs/instalacao.md](docs/instalacao.md).

> **Atenção: instalar no projeto não põe o `codify` no PATH.** O binário fica em
> `node_modules/.bin`, então, só com a instalação local, digitar `codify init` no terminal dá
> *"`codify` não é reconhecido"*. Você tem três saídas:
>
> | Você instalou | Como rodar |
> |---|---|
> | só no projeto | `npx codify <comando>` ou `bunx codify <comando>` (ex.: `npx codify init`) |
> | só no projeto | caminho direto do binário: `.\node_modules\.bin\codify <comando>` no PowerShell (ex.: `.\node_modules\.bin\codify setup`) ou `./node_modules/.bin/codify <comando>` no Git Bash, Linux e macOS |
> | no projeto | scripts do `package.json` (`npm run dev` / `bun run dev`), que o `init` já cria |
> | global | `codify <comando>` direto, em qualquer pasta |
>
> Na dúvida, instale as duas formas: a global dá o atalho, a local fixa a versão.

> **Por que instalar no projeto, e não só global?** O `codify` global procura o Órbita dentro do
> `node_modules` do projeto e, se achar, **delega a ele** (o mesmo que Vite e ESLint fazem). Assim
> todo o time roda exatamente a mesma versão, a que está no lockfile.

---

## Primeiros passos num projeto

**1.** Na raiz do projeto, gere a config. **Este é sempre o primeiro comando** depois de instalar:

```bash
codify init          # com o Órbita instalado global
npx codify init      # só instalado no projeto (npm/pnpm)
bunx codify init     # só instalado no projeto (bun)
```

Ele encontra os apps (até dois níveis abaixo), cria o `orbita.config.mjs` e acrescenta ao
`package.json` os scripts que faltam (`setup`, `dev`, `dev:doctor`, `dev:parar`, `help`). O resultado
é parecido com isto:

```js
import { defineConfig } from '@codifytech/orbita'

export default defineConfig({
  nome: 'Meu Projeto',
  gerenciador: 'bun',
  servicos: {
    server: { preset: 'laravel', cwd: 'backend' },
    queue: { preset: 'laravel:queue', cwd: 'backend' },
    schedule: { preset: 'laravel:schedule', cwd: 'backend' },
    web: { preset: 'vite', cwd: 'frontend' },
  },
  descricoes: {
    lint: 'Roda o ESLint e corrige o que der',
  },
})
```

**2.** Revise a config (todas as chaves e presets em [docs/configuracao.md](docs/configuracao.md)).

**3.** `codify setup` e depois `codify dev`. Se você não instalou o global, use os scripts que o
`init` acrescentou ao `package.json`: `npm run setup` / `npm run dev` (ou `bun run …`).

Scripts do projeto que não são do Órbita ganham o mesmo cabeçalho com `codify banner`:

```json
{ "scripts": { "lint": "codify banner lint && eslint ." } }
```

---

## Comandos e opções

| Comando | O que faz |
|---|---|
| `codify dev` | Sobe os serviços num painel de terminal, checando o ambiente antes |
| `codify doctor` | Diagnostica o ambiente e oferece consertar |
| `codify parar` | Derruba o ambiente que ficou rodando |
| `codify setup` | Prepara o projeto pela primeira vez |
| `codify init` | Gera o `orbita.config.mjs` examinando as pastas |
| `codify help [filtro]` | Lista os comandos e os scripts do projeto. `help dev` mostra só `dev` e `dev:*` |
| `codify banner <script>` | Só o cabeçalho, para scripts do `package.json` |
| `codify --version` | A versão do Órbita |

| Opção | Comandos | Efeito |
|---|---|---|
| `--only=a,b` · `--except=a,b` | `dev`, `doctor` | só estes serviços · todos menos estes |
| `--inline` | `dev` | sem painel: linhas prefixadas por serviço (automático sem TTY, ex.: CI) |
| `--no-restart` | `dev` | não reinicia sozinho o serviço que cair |
| `--sem-checagem` | `dev` | pula o doctor |
| `--listar` | `dev`, `parar` | só mostra (os serviços e comandos · o que seria encerrado) |
| `--plano=<arquivo>` | `dev` | grava o plano em JSON em vez de subir |
| `--sem-perguntas` | `doctor` | só diagnostica, não oferece conserto |
| `--force` | `parar`, `init` | não pergunta · sobrescreve a config |
| `--sem-scripts` | `init` | não mexe no `package.json` |

| Variável | Efeito |
|---|---|
| `ORBITA_PHP` | PHP a usar quando o do PATH é de outra versão (ex.: `C:/wamp64/bin/php/php8.5.0/php.exe`) |
| `ORBITA_BANNER=compacto` | banner de uma linha (para scripts que encadeiam etapas) |
| `ORBITA_PLANO=<arquivo>` | o `dev` sobe direto de um plano gravado, sem checar nada |
| `NO_COLOR` · `CI` | sem cores · sem animações |
| `DEV_ONLY`, `DEV_EXCEPT`, `DEV_SERVER_HOST`, `DEV_<NOME>_PORT` | preferências desta máquina, no `.env` (veja [docs/configuracao.md](docs/configuracao.md#preferências-desta-máquina)) |

### Atalhos do painel

Aperte **`?`** no painel para ver todos. Os principais:

| Tecla | Faz |
|---|---|
| `←` `→` `Tab` · `1`…`9` | troca de aba · vai direto para a aba |
| `↓` ou `⏎` · `↑` | na Visão geral: desce para os serviços (`←` `→` escolhem, `⏎` abre os logs) · volta às abas |
| `↑` `↓` `PgUp` `PgDn` · `End` | rola o log · volta a seguir o fim |
| `r` · `R` · `s` | reinicia o serviço · reinicia todos · para/sobe |
| `a` · `:` | ações rápidas · comando livre (Tab troca a pasta; a saída vai para a aba "tarefas") |
| `/` · `c` · `y` | filtra o log · limpa · copia o que está visível |
| `o` · `m` | abre no navegador · liga o mouse |
| `q` · `Ctrl+C` | sai, encerrando todos os serviços |

---

## Como o código está organizado

Cada pasta tem **uma** responsabilidade, e as dependências só apontam para baixo. A explicação
completa, com a regra de dependência e as decisões de desenho, está em
[docs/arquitetura.md](docs/arquitetura.md).

```
bin/codify.mjs        Porta de entrada: escolhe qual Órbita roda (o do projeto ou o global).

src/
  cli.mjs             Roteador: argumentos → projeto → banner → comando.
  comandos/           Um arquivo por comando (dev, doctor, parar, setup, init, help, banner).
  doctor/             Diagnóstico, reparo e as rodadas do doctor.
  plano/              Portas ocupadas antes de subir e o Plano (o JSON que o painel recebe).
  painel/             O monitor de terminal: supervisão, saúde, logs, teclas, tela.
  setup/  init/  parar/   Os fluxos desses comandos.
  projeto/            O projeto resolvido: serviços, grupos, preferências da máquina, troca de porta.
  presets/            O que o Órbita sabe de cada stack (famílias laravel, node, dotnet).
    laravel/ambiente.php   O script PHP que responde, em JSON, o que só o Laravel sabe.
  config/             Ler, validar e localizar o orbita.config.mjs (defineConfig).
  ambiente/           O "chão de fábrica": .env, portas, processos, memória, programas do SO.
  ui/                 Cores, perguntas, tabela, spinner, mensagens.
  banner.mjs          O cabeçalho CodifyTech.

test/                 Espelha o src/ (test/doctor testa src/doctor, e assim por diante).
docs/                 Arquitetura, configuração, instalação, origem no FoodOS.
```

### Glossário (o código é em português)

| Termo | Significa |
|---|---|
| `servico` | cada processo que o `dev` sobe (API, front, fila…); vira uma aba do painel |
| `preset` | o que o Órbita sabe de um tipo de serviço (porta padrão, como subir, saúde) |
| `familia` | o que vale para os serviços de uma stack na mesma pasta (APP_KEY, banco, instalação) |
| `grupo` | os serviços de uma família numa pasta (ex.: os 5 do Laravel em `backend/`) |
| `contexto` | o projeto resolvido, compartilhado por doctor, dev, parar e setup |
| `plano` | o JSON com tudo que o painel precisa para subir e vigiar |
| `dono` | quem está escutando numa porta (PID, nome, dica do que provavelmente é) |
| `raizDaSessao` | o processo que iniciou um `dev`; encerrá-lo derruba fila e scheduler junto |
| `ErroDeUso` | erro esperado (config errada, comando inexistente): a CLI mostra só a mensagem |

---

## Desenvolvimento

Requisitos: **Node 24 ou superior**. O pacote não tem nenhuma dependência de runtime.

```bash
npm test                   # node --test (sem framework de teste externo)
bun test                   # os dois runners precisam passar
node bin/codify.mjs help   # roda o Órbita direto do repositório
```

Para testar num projeto antes de publicar, ligue o pacote local ao projeto (`npm link`, ou uma junção
`node_modules/@codifytech/orbita` → este repositório).

Convenções:

- **Português do Brasil** em conversa, UI, nomes de comandos, documentação e commits; o código também
  é em português (`servicos`, `portas`, `reparar`…).
- **Commits** em Conventional Commits em português: `feat: preset do nuxt`, `fix(doctor): …`.
- **Sem dependências de runtime.** Ferramenta de desenvolvimento só entra como `devDependency`.
- **Funções puras onde der.** Quem interpreta texto (saída do `netstat`, `.env`) é puro e testado com
  amostras; só uma camada fina fala com o sistema operacional.

### Como adicionar um comando

1. Crie `src/comandos/<nome>.mjs` com `export default { nome, descricao, executar(contexto) {…} }`
   (o contrato está em [src/comandos/tipos.mjs](src/comandos/tipos.mjs)). Se a lógica for grande,
   ponha-a numa pasta própria em `src/` e deixe o comando só chamando.
2. Registre-o na lista de [src/comandos/index.mjs](src/comandos/index.mjs).
3. Escreva o teste em `test/comandos/<nome>.test.mjs`.

### Como adicionar um preset

1. Se a stack já tem família (`node.mjs`, `dotnet.mjs`, `laravel/`), acrescente o preset à lista
   dela. Senão, crie a família seguindo o contrato de [src/presets/tipos.mjs](src/presets/tipos.mjs)
   e registre-a em [src/presets/index.mjs](src/presets/index.mjs).
2. Se o `init` deve reconhecê-la, ensine o `detectarApp` em [src/init/detectar.mjs](src/init/detectar.mjs).
3. Teste o comando, o diagnóstico e o que vai para o plano (veja `test/presets/`).

---

## Documentação

- [docs/arquitetura.md](docs/arquitetura.md): camadas, conceitos, regra de dependência, decisões.
- [docs/configuracao.md](docs/configuracao.md): todas as chaves, os presets e as preferências da máquina.
- [docs/instalacao.md](docs/instalacao.md): token do GitHub Packages, `.npmrc`, publicação.
- [docs/origem-foodos.md](docs/origem-foodos.md): o que o Órbita herdou do FoodOS, item a item.
- [CLAUDE.md](CLAUDE.md): decisões já tomadas e convenções.

---

Desenvolvido e mantido por [CodifyTech](https://codifytech.com.br).
