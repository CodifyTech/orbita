# Codify Órbita

> A CLI da CodifyTech para **subir, vigiar e diagnosticar o ambiente local** de qualquer projeto da casa.

Hoje cada projeto tem seus próprios scripts para rodar o ambiente de desenvolvimento: um para subir
a API, outro para o front, outro para a fila, e quando algo dá errado (porta ocupada, banco fora do
ar, `.env` incompleto) cada dev descobre sozinho. O Órbita junta tudo isso num comando só, igual em
todos os projetos:

```bash
codify setup    # primeira vez: instala dependências, cria o .env, configura o banco
codify dev      # sobe tudo num painel de terminal, uma aba por serviço
codify doctor   # confere o ambiente e conserta o que estiver errado
codify parar    # derruba o que ficou rodando (terminal fechado, sobra de outro dev)
```

O Órbita nasceu da extração dos scripts da raiz do monorepo FoodOS e vai substituí-los. A lista do
que ele herda está em [docs/origem-foodos.md](docs/origem-foodos.md).

---

## Estado atual

O projeto está sendo construído em etapas (a ordem vem do [CLAUDE.md](CLAUDE.md)). **Hoje só as
etapas 1 e 2 estão prontas**:

| Etapa | O que é | Situação |
|:-:|---|:-:|
| 1 | Entrada (`bin/codify.mjs`), `orbita.config.mjs`/`defineConfig`, banner e `help` | ✅ pronta |
| 2 | Base do ambiente: `.env`, portas e processos (com testes) | ✅ pronta |
| 3 | `doctor` + reparo e `parar` | ⏳ |
| 4 | `dev` (plano → painel) com `--only/--except/--inline/--no-restart/--sem-checagem` | ⏳ |
| 5 | Presets (`laravel`, `vite`, `nuxt`, `astro`, `next`, `ionic`, `dotnet`) e `init` | ⏳ |
| 6 | `setup` | ⏳ |
| 7 | `v0.1.0` no GitHub Packages e migração do FoodOS | ⏳ |

O que funciona agora: `codify help`, `codify --version`, o banner, a leitura/validação do
`orbita.config.mjs` e os módulos de `.env`, portas e processos (usados pelas próximas etapas). Os
comandos `dev`, `doctor`, `parar`, `setup` e `init` já aparecem no `help`, mas respondem
"ainda não foi implementado".

---

## Instalação

O pacote é privado, publicado no **GitHub Packages** da organização CodifyTech. Você autentica uma
vez no `~/.npmrc` e instala como qualquer pacote:

```bash
npm install --save-dev @codifytech/orbita   # no projeto (recomendado: fixa a versão no lockfile)
npm install --global @codifytech/orbita     # opcional: deixa o comando `codify` em qualquer pasta
```

Passo a passo do token em [docs/instalacao.md](docs/instalacao.md).

> **Por que instalar no projeto, e não só global?** O `codify` global procura o Órbita dentro do
> `node_modules` do projeto e, se achar, **delega a ele** (o mesmo que Vite e ESLint fazem). Assim
> todo o time roda exatamente a mesma versão, a que está no lockfile.

---

## Primeiros passos num projeto

**1.** Crie o `orbita.config.mjs` na raiz do projeto (em breve o `codify init` gera este arquivo
para você, examinando as pastas):

```js
import { defineConfig } from '@codifytech/orbita'

export default defineConfig({
  nome: 'Meu Projeto',
  gerenciador: 'bun', // quem roda os scripts: npm | bun | pnpm | yarn
  servicos: {
    api: { preset: 'laravel', cwd: 'backend', porta: 8000 },
    web: { preset: 'vite', cwd: 'frontend', porta: 5173 },
  },
  descricoes: {
    lint: 'Roda o ESLint e corrige o que der',
  },
})
```

**2.** Chame o Órbita pelos scripts do `package.json` (assim o time inteiro usa `bun run dev`):

```json
{
  "scripts": {
    "setup": "codify setup",
    "dev": "codify dev",
    "lint": "codify banner lint && eslint ."
  }
}
```

**3.** Rode `codify help` e veja o que o projeto tem à disposição.

Todas as chaves da configuração estão em [docs/configuracao.md](docs/configuracao.md).

---

## Comandos

| Comando | O que faz | Situação |
|---|---|:-:|
| `codify help [filtro]` | Lista os comandos do Órbita e os scripts do projeto. `help dev` mostra só `dev` e `dev:*` | ✅ |
| `codify banner <script>` | Mostra só o cabeçalho CodifyTech; serve para pôr na frente de scripts do projeto | ✅ |
| `codify --version` | Mostra a versão do Órbita | ✅ |
| `codify dev` | Sobe os serviços num painel de terminal, checando o ambiente antes | ⏳ |
| `codify doctor` | Diagnostica o ambiente e oferece consertar | ⏳ |
| `codify parar` | Derruba o ambiente que ficou rodando | ⏳ |
| `codify setup` | Prepara o projeto pela primeira vez | ⏳ |
| `codify init` | Gera o `orbita.config.mjs` examinando as pastas | ⏳ |

Variáveis de ambiente que mudam o comportamento:

| Variável | Efeito |
|---|---|
| `ORBITA_BANNER=compacto` | O banner vira uma linha só (útil quando um script encadeia várias etapas) |
| `NO_COLOR` | Saída sem cores |
| `CI` | Sem animações |

Sem terminal interativo (pipe, CI) o Órbita escreve texto puro, sem cor nem animação.

---

## Como o código está organizado

Cada pasta tem **uma** responsabilidade, e as dependências só apontam para baixo (veja
[docs/arquitetura.md](docs/arquitetura.md) para o raciocínio completo):

```
bin/
  codify.mjs            Porta de entrada. Só decide qual Órbita roda (global ou do projeto).

src/
  cli.mjs               Roteador: lê os argumentos, carrega o projeto, mostra o banner, chama o comando.
  argumentos.mjs        Leitor de argumentos (--chave=valor, --flag, posicionais).
  banner.mjs            O cabeçalho CodifyTech (logo, assinatura, descrição do comando).
  repasse.mjs           Procura o Órbita instalado no projeto e delega a ele.
  constantes.mjs        Nomes e valores fixos do produto.
  erros.mjs             ErroDeUso e ErroDeConfig (erros "esperados", sem stack trace).
  index.mjs             API pública do pacote: exporta o defineConfig.

  comandos/             Um arquivo por comando (help, banner, dev, doctor, parar, setup, init).
  config/               Ler, validar e localizar o orbita.config.mjs (defineConfig).
  ambiente/             O "chão de fábrica": .env, portas, processos, execução de programas do SO.
  ui/                   Cores, degradês e detecção do terminal.
  painel/               (etapa 4) O monitor de terminal do `dev`.
  presets/              (etapa 5) O que o Órbita sabe de cada stack: laravel, vite, nuxt…

test/                   Espelha o src/ (test/config testa src/config, e assim por diante).
docs/                   Documentação (origem-foodos, arquitetura, configuração, instalação).
```

### O caminho de um comando

```
codify help dev
   │
   ├─ bin/codify.mjs        existe um Órbita no node_modules do projeto? então delega a ele
   └─ src/cli.mjs
        ├─ argumentos.mjs   "help" é o comando, "dev" é o filtro
        ├─ config/          acha a raiz do projeto e carrega o orbita.config.mjs
        ├─ banner.mjs       mostra o cabeçalho
        └─ comandos/help.mjs  monta a lista e escreve na tela
```

### Glossário (o código é em português)

| Termo no código | Significa |
|---|---|
| `servicos` | Cada processo que o `dev` sobe (API, front, fila…); cada um vira uma aba do painel |
| `preset` | O que o Órbita já sabe de uma stack (porta padrão, como subir, o que checar) |
| `porta` / `emUso` / `proximaLivre` | Portas TCP do ambiente local |
| `dono` | Quem está escutando numa porta (PID, nome, dica do que provavelmente é) |
| `raizDaSessao` | O processo que iniciou um `dev`; encerrá-lo derruba fila e scheduler junto |
| `ErroDeUso` | Erro esperado (config errada, comando inexistente): a CLI mostra só a mensagem |

---

## Desenvolvimento

Requisitos: **Node 22 ou superior**. O pacote não tem nenhuma dependência de runtime.

```bash
npm test          # node --test (sem framework de teste externo)
bun test          # também funciona
node bin/codify.mjs help   # roda o Órbita direto do repositório
```

Convenções (as mesmas do restante da casa):

- **Português do Brasil** em conversa, UI, nomes de comandos, documentação e commits; o código também
  é em português (`servicos`, `portas`, `reparar`…).
- **Commits** em Conventional Commits em português: `feat: preset do nuxt`, `fix(doctor): …`.
- **Sem dependências de runtime.** Ferramenta de desenvolvimento (ESLint, por exemplo) só entra como
  `devDependency`.
- **Funções puras onde der.** Quem interpreta texto (saída do `netstat`, `.env`) é puro e testado com
  amostras; só uma camada fina fala com o sistema operacional.

### Como adicionar um comando

1. Crie `src/comandos/<nome>.mjs` com `export default { nome, descricao, executar(contexto) {…} }`
   (o contrato está em [src/comandos/tipos.mjs](src/comandos/tipos.mjs)).
2. Registre-o na lista de [src/comandos/index.mjs](src/comandos/index.mjs).
3. Escreva o teste em `test/comandos/<nome>.test.mjs`.

O `help` e o roteador passam a enxergá-lo sozinhos.

---

## Documentação

- [docs/arquitetura.md](docs/arquitetura.md): camadas, regras de dependência, decisões de desenho.
- [docs/configuracao.md](docs/configuracao.md): todas as chaves do `orbita.config.mjs`.
- [docs/instalacao.md](docs/instalacao.md): token do GitHub Packages, `.npmrc`, publicação.
- [docs/origem-foodos.md](docs/origem-foodos.md): o que o Órbita herda do FoodOS, item a item.
- [CLAUDE.md](CLAUDE.md): decisões já tomadas e ordem de implementação.

---

Desenvolvido e mantido por [CodifyTech](https://codifytech.com.br).
