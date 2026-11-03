# Arquitetura

Este documento explica **como o código está dividido e por quê**. Se você é novo no projeto, leia
primeiro o [README](../README.md) e depois este.

## A ideia em uma frase

> **Node orquestra; o framework responde.**

O Órbita é Node puro e cuida de tudo que é genérico (painel, portas, processos, `.env`, prompts).
O que só um framework sabe (por exemplo, "quais migrations estão pendentes no Laravel") **não é
reimplementado**: o preset daquele framework traz um pequeno script que o Node executa e que
responde em JSON. Detalhes em [CLAUDE.md](../CLAUDE.md).

## Camadas

```
            ┌──────────────────────────┐
            │  bin/codify.mjs          │  escolhe qual Órbita roda
            └────────────┬─────────────┘
                         ▼
            ┌──────────────────────────┐
            │  src/cli.mjs             │  roteador (sem regra de negócio)
            └────────────┬─────────────┘
                         ▼
            ┌──────────────────────────┐
            │  src/comandos/           │  um arquivo por comando
            └──┬───────┬───────┬───────┘
               ▼       ▼       ▼
        ┌─────────┐ ┌────────┐ ┌─────────┐
        │ config/ │ │ambiente│ │  ui/    │   cada um cuida de uma coisa só
        │         │ │        │ │ banner  │
        └─────────┘ └────────┘ └─────────┘
               ▼       ▼       ▼
            constantes · erros · pausa        base comum, sem dependências
```

### Regra de dependência

**Cada camada só importa das que estão abaixo dela, nunca de cima nem do lado.**

| Pasta | Pode importar de | Não pode importar de |
|---|---|---|
| `bin/` | `src/repasse.mjs` (e carrega o `cli.mjs` escolhido) | o resto |
| `src/cli.mjs` | tudo abaixo | |
| `src/comandos/` | `config`, `ambiente`, `ui`, `banner`, base | `cli.mjs`, outros comandos |
| `src/config/` | base | `ambiente`, `ui`, `comandos` |
| `src/ambiente/` | base | `ui`, `config`, `comandos` |
| `src/ui/` e `src/banner.mjs` | base | `ambiente`, `comandos` |
| base (`constantes`, `erros`, `pausa`) | nada do projeto | |

Por que isso importa: o `ambiente` (portas, processos, `.env`) não sabe que existe terminal colorido
nem banner, então dá para testá-lo sozinho e reaproveitá-lo em qualquer comando. O mesmo vale para
a `ui`: ela não sabe o que é uma porta.

Um comando **não chama outro comando**. Se dois comandos precisam da mesma lógica (o `dev` e o
`doctor` diagnosticam o ambiente), a lógica sobe para `ambiente/` e os dois a usam.

## O que cada pasta guarda

### `bin/`

`codify.mjs` quase não tem lógica: procura um Órbita instalado no projeto (`src/repasse.mjs`) e,
se achar, delega a ele; senão usa o próprio. Fica separado para que **a lógica toda mora em
`src/cli.mjs`**, que é o que a instalação do projeto também expõe.

### `src/comandos/`

Cada comando é um objeto com `nome`, `descricao` e `executar(contexto)` (contrato em
[`tipos.mjs`](../src/comandos/tipos.mjs)). O `contexto` traz tudo que o comando precisa: argumentos,
projeto carregado, onde escrever e o estilo de cores. Comandos **não leem `process.stdout` nem
`process.argv` direto**: recebem pelo contexto, e é isso que permite testá-los com uma saída falsa.

`em-construcao.mjs` é uma fábrica para os comandos do roadmap ainda não escritos: eles aparecem no
`help` e respondem com um erro claro em vez de "comando desconhecido".

### `src/config/`

| Arquivo | Responsabilidade |
|---|---|
| `define-config.mjs` | `defineConfig`: valida e preenche padrões. Chave desconhecida é erro. |
| `raiz-do-projeto.mjs` | Descobre a raiz subindo pastas (config → package.json → pasta atual) |
| `carregar-config.mjs` | Importa o `orbita.config.mjs`, lê o `package.json`, monta o `Projeto` |

### `src/ambiente/`

O "chão de fábrica": tudo que fala com a máquina. Duas regras de desenho:

1. **Separar quem interpreta de quem executa.** `leitores-do-sistema.mjs` só transforma texto em dados
   (saída do `netstat`, `lsof`, `ss`, `ps`, `tasklist`, PowerShell) e é testado com amostras de
   qualquer sistema. `executar.mjs` é a única porta para rodar programas externos e nunca lança
   exceção (devolve `ok: false`).
2. **Dependências injetáveis.** `escutando`, `listarProcessos`, `encerrar`… aceitam `executar` e
   `plataforma` por parâmetro. Os testes passam um executor falso e simulam Windows e Linux na mesma
   máquina.

| Arquivo | Responsabilidade |
|---|---|
| `env.mjs` | Ler e gravar `.env` (compatível com o Dotenv do Laravel), preservando comentários e fim de linha |
| `portas.mjs` | Porta em uso? Quem é o dono? Qual a próxima livre? Esperar liberar |
| `processos.mjs` | Listar processos, achar a raiz da sessão do `dev`, encerrar a árvore |
| `leitores-do-sistema.mjs` | Funções puras que interpretam a saída dos programas do SO |
| `executar.mjs` | Roda um programa do SO e devolve `{ ok, saida, erro }` |

**Nota sobre o Windows:** para descobrir quem escuta numa porta, o Órbita usa
`Get-NetTCPConnection` (PowerShell) e só cai para o `netstat` se o PowerShell não responder. O motivo
é prático: o `netstat -ano` de algumas builds do Windows 11 não lista sockets recém-abertos. Um teste
com servidor real (`test/ambiente/portas.test.mjs`) protege esse comportamento.

### `src/ui/` e `src/banner.mjs`

`ui/estilo.mjs` devolve funções de cor que já respeitam o terminal: sem cor, elas devolvem o texto
puro, então o código que as usa **nunca precisa perguntar** "tem cor?". `ui/terminal.mjs` decide isso
(TTY, `NO_COLOR`, `CI`).

O `banner.mjs` separa as funções `montar*` (puras: dados entram, texto sai) de `exibirBanner` (a única
que escreve, faz pausas e esconde o cursor).

### `src/painel/` e `src/presets/` (próximas etapas)

- `painel/`: o monitor de terminal do `dev` (abas, logs, alertas, saúde, memória). Vem do
  `monitor.mjs` do FoodOS.
- `presets/`: o que o Órbita sabe de cada stack. Um preset diz a porta padrão, o comando, a URL de
  saúde e o que checar no `doctor`. O preset `laravel` leva um `ambiente.php` que o Node executa e
  que responde em JSON.

## Decisões de desenho

| Decisão | Motivo |
|---|---|
| Sem dependências de runtime | Instala rápido, não quebra por atualização de terceiros e roda antes de qualquer `install` do projeto |
| ESM (`.mjs`) | Padrão do Node moderno; o `.mjs` dispensa `"type": "module"` no projeto que consome |
| Configuração em JS (`orbita.config.mjs`), não JSON | Permite comentários e lógica pontual, e ganha autocomplete com `defineConfig` |
| O Órbita não adivinha nada na execução | Previsível: o que está na config é o que roda. Quem descobre a stack é o `codify init`, uma vez |
| Chave desconhecida na config é erro | Um `servico:` no lugar de `servicos:` seria ignorado em silêncio; melhor falhar alto |
| `ErroDeUso` × erro comum | Erro do dev (config errada) mostra só a mensagem; bug do código mostra o stack |
| Teste espelha o `src/` | Quem acha o arquivo acha o teste |
| Repasse para a instalação local | Cada projeto fixa a versão no lockfile; o time todo roda a mesma |

## Como testar

- `npm test` (ou `bun test`). Usa só o `node:test`.
- **Unidade pura** é a regra: `env`, `leitores-do-sistema`, `define-config`, `argumentos`, `help`.
- **Sistema real** só onde o comportamento depende do SO e uma amostra não basta (portas e
  processos). Esses testes abrem um servidor de verdade numa porta livre.
- Ajudantes ficam em `test/_ajudantes/` (saída falsa, projeto temporário).
