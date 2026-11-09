# Arquitetura

Este documento explica **como o código está dividido e por quê**. Se você é novo no projeto, leia
primeiro o [README](../README.md) e depois este.

## A ideia em uma frase

> **Node orquestra; o framework responde.**

O Órbita é Node puro e cuida de tudo que é genérico: painel, portas, processos, `.env`, perguntas,
`parar`, decisões do doctor e do reparo. O que só um framework sabe (por exemplo, "quais migrations
estão pendentes no Laravel") **não é reimplementado**. O preset `laravel` traz um script PHP
([`src/presets/laravel/ambiente.php`](../src/presets/laravel/ambiente.php)) que o Node executa e que
responde em JSON.

## Os conceitos

| Conceito | O que é | Onde |
|---|---|---|
| **Config** | o `orbita.config.mjs` do projeto, validado pelo `defineConfig` | `src/config/` |
| **Preset** | o que o Órbita sabe de **um** tipo de serviço: porta padrão, comando, saúde, cor, regex do log | `src/presets/` |
| **Família** | o que vale para todos os serviços de uma stack **na mesma pasta**: consultar o estado, diagnosticar, consertar, instalar, o que vai para o painel (ex.: `laravel`, `node`, `dotnet`) | `src/presets/` |
| **Serviço** | um item de `servicos` da config já resolvido: preset aplicado, pasta absoluta, porta e host desta máquina | `src/projeto/servicos.mjs` |
| **Grupo** | serviços da mesma família na mesma pasta (o `APP_KEY` é checado uma vez para `backend/`, não uma vez por serviço) | `src/projeto/servicos.mjs` |
| **Contexto** | o projeto resolvido (serviços, grupos, preferências, perguntas, saída), compartilhado por doctor, dev, parar e setup | `src/projeto/contexto.mjs` |
| **Plano** | JSON com tudo que o painel precisa (comandos, portas, saúde, logs, ações). É o contrato entre a checagem e o painel | `src/plano/tipos.mjs` |

Os contratos estão escritos como typedefs JSDoc, em arquivos que só documentam:
[`src/presets/tipos.mjs`](../src/presets/tipos.mjs), [`src/plano/tipos.mjs`](../src/plano/tipos.mjs)
e [`src/comandos/tipos.mjs`](../src/comandos/tipos.mjs).

## Camadas

```
bin/codify.mjs                 escolhe qual Órbita roda (o do projeto ou o global)
  └─ cli.mjs                   roteador: argumentos → projeto → banner → comando
      └─ comandos/             um arquivo por comando; só orquestra
          ├─ doctor/  plano/  setup/  init/  parar/      os fluxos de cada comando
          ├─ painel/                                      o monitor de terminal do `dev`
          └─ projeto/ (servicos, contexto, troca-de-porta) o projeto resolvido
              └─ presets/                                 o conhecimento de cada stack
                  └─ projeto/urls · projeto/preferencias  folhas: URLs da API, .env da máquina
                      └─ ambiente/  config/  ui/  banner  o "chão": SO, .env, config, cores
                          └─ constantes · erros · pausa · versao   base, sem dependências
```

### Regra de dependência

**Cada camada só importa das que estão abaixo dela, nunca de cima.** Na prática:

| Pasta | Não pode importar de |
|---|---|
| `ambiente/` | `ui`, `config`, `presets`, `projeto`, `painel`, `comandos` |
| `ui/` | `ambiente`, `presets`, `projeto`, `painel`, `comandos` |
| `presets/` | `projeto/servicos`, `projeto/contexto`, `doctor`, `plano`, `painel`, `comandos` |
| `painel/` | `comandos`, `plano` (só lê o tipo), `presets`, `projeto`, `doctor`, `config` |
| `comandos/` | outros comandos (a lógica comum sobe para uma pasta de baixo) |

Isso é conferido com um `grep` simples (veja "Como testar"). Por que importa: o `ambiente` (portas,
processos, `.env`) não sabe que existe painel nem banner, então dá para testá-lo sozinho. O painel
não sabe que existe Laravel: só obedece ao plano. E um preset novo não exige mexer em comando nenhum.

## O que cada pasta guarda

### `bin/` e a raiz de `src/`

| Arquivo | Responsabilidade |
|---|---|
| `bin/codify.mjs` | Procura o Órbita no `node_modules` do projeto (`src/repasse.mjs`) e delega a ele; senão usa o próprio |
| `src/cli.mjs` | `executarCli(argv, ambiente)`: o contrato com o bin. Monta o contexto do comando, mostra o banner, trata `ErroDeUso` |
| `src/argumentos.mjs` | `--chave=valor`, `--flag`, posicionais e `--` |
| `src/banner.mjs` | Cabeçalho CodifyTech: funções `montar*` puras e `exibirBanner`, a única que escreve |
| `src/erros.mjs` | `ErroDeUso`, `ErroDeConfig`, `ErroCancelado`: erros "esperados", mostrados sem stack trace |
| `src/index.mjs` | API pública do pacote: `defineConfig` |

### `src/comandos/`

Cada comando é um objeto `{ nome, descricao, executar(contexto) }`. O `contexto` traz argumentos,
projeto, perguntas, saída e estilo. **Comandos não leem `process.stdout` nem `process.argv`
direto**, e é isso que permite testá-los com uma saída falsa. O arquivo do comando é curto e só
chama o fluxo da pasta certa (`doctor/`, `setup/`…).

### `src/config/`

| Arquivo | Responsabilidade |
|---|---|
| `define-config.mjs` | Valida e preenche padrões. Chave desconhecida é erro |
| `raiz-do-projeto.mjs` | Descobre a raiz subindo pastas (config → package.json → pasta atual) |
| `carregar-config.mjs` | Importa o `orbita.config.mjs`, lê o `package.json`, monta o `Projeto` |

### `src/projeto/`

| Arquivo | Responsabilidade |
|---|---|
| `servicos.mjs` | Config → serviços resolvidos (preset, porta preferida, host), `--only/--except`, grupos |
| `contexto.mjs` | Monta o Contexto; `consultarFamilias` pergunta o estado real (ambiente.php) e aplica os ajustes (Horizon × queue) |
| `preferencias.mjs` | Onde ficam as preferências desta máquina (`DEV_*`) e a chave `DEV_<NOME>_PORT` |
| `troca-de-porta.mjs` | Troca permanente (doctor, grava no `.env`) e só nesta execução (dev, variáveis de ambiente) |
| `urls.mjs` | API local, "aponta para esta máquina?", `.env` que os frontends leem |

### `src/presets/`

Uma família por arquivo (ou pasta, quando é grande):

| Arquivo | Família | Presets |
|---|---|---|
| `laravel/` | `laravel` | `laravel`, `laravel:queue`, `laravel:horizon`, `laravel:schedule`, `laravel:reverb`, `laravel:pail` |
| `node.mjs` | `node` | `vite`, `nuxt`, `astro`, `next`, `ionic` |
| `dotnet.mjs` | `dotnet` | `dotnet` |
| `generico.mjs` | `generico` | (serviço só com `cmd`) |

A família Laravel é dividida por responsabilidade: `consulta.mjs` (ponte com o `ambiente.php`),
`diagnostico.mjs`, `reparo.mjs`, `setup.mjs` e `index.mjs` (presets + junção). O **`ambiente.php`**
sempre responde **um** JSON com `ok`, até em erro fatal do PHP (ex.: o `platform_check` do Composer
pedindo outra versão), porque tem um handler de shutdown.

### `src/doctor/`, `src/plano/`, `src/parar/`, `src/setup/`, `src/init/`

| Pasta | O fluxo |
|---|---|
| `doctor/` | `diagnostico.mjs` junta famílias e portas; `reparo.mjs` conserta a porta e delega o resto à família; `index.mjs` faz até 6 rodadas de diagnóstico → reparo → diagnóstico |
| `plano/` | `portas.mjs` resolve porta ocupada antes de subir (trocar, encerrar, pular, cancelar); `montar.mjs` gera o Plano |
| `parar/` | `alvos.mjs`: função pura que decide quem encerrar (portas + 10 seguintes, sessão do dev, só php/node/bun) |
| `setup/` | ferramentas → instalação (spinner) → configuração das famílias → `.env` dos frontends → check-up |
| `init/` | `detectar.mjs` examina as pastas pelo conteúdo; `gerar.mjs` escreve a config e os scripts |

### `src/painel/`

O monitor do `dev`, port modular do `monitor.mjs` do FoodOS. Recebe um Plano e não sabe nada de
stack. `index.mjs` só liga as peças:

| Arquivo | Responsabilidade |
|---|---|
| `estado.mjs` | estado do painel, plano normalizado, abas |
| `supervisor.mjs` | sobe, reinicia (até 5 vezes) e para cada processo; mata com escalada |
| `saude.mjs`, `metricas.mjs` | HTTP/TCP com latência; req/min, jobs, HMR, execuções |
| `logs.mjs`, `classificacao.mjs`, `vigia-log.mjs` | buffers limitados, erro/aviso pelas regex do plano, alertas com contexto, arquivo de log lido por posição |
| `teclas.mjs`, `mouse.mjs`, `entrada.mjs` | atalhos (`?` mostra todos), mouse, leitura do teclado |
| `acoes.mjs`, `comando-livre.mjs`, `tarefas.mjs` | menu `a`, caixa `:` e a aba "tarefas" |
| `requests.mjs` | escolher o request do log e abrir os detalhes, com o programa que o plano indica (`detalhesDeRequest`; no Laravel, `ambiente.php request`, que lê o Telescope) |
| `inline.mjs` | modo sem painel (`--inline` ou sem TTY) |
| `tela/` | cabeçalho, abas, cartões, alertas, caixas, splash e o `desenhista`, que redesenha só as linhas que mudaram |
| `texto.mjs`, `cores.mjs`, `formato.mjs` | largura visual (ANSI e caracteres largos), cores e formatos |

### `src/ambiente/` e `src/ui/`

`ambiente/` é o "chão de fábrica", tudo que fala com a máquina. Duas regras:

1. **Separar quem interpreta de quem executa.** `leitores-do-sistema.mjs` só transforma texto em
   dados (saída do `netstat`, `Get-NetTCPConnection`, `lsof`, `ss`, `ps`, `tasklist`) e é testado
   com amostras de qualquer sistema. `executar.mjs` é a porta para rodar programas e nunca lança.
2. **Dependências injetáveis.** `escutando`, `listarProcessos`, `encerrar`, `versaoDe`… aceitam
   `executar` e `plataforma` por parâmetro: os testes simulam Windows e Linux na mesma máquina.

| `ambiente/` | |
|---|---|
| `env.mjs` | ler e gravar `.env` (compatível com o Dotenv), preservando comentários e fim de linha |
| `portas.mjs` | em uso? dono? próxima livre? esperar liberar |
| `processos.mjs`, `filhos.mjs` | listar, raiz da sessão do dev, encerrar a árvore; subir filho com shell |
| `memoria.mjs`, `sistema.mjs` | memória por árvore de processos; copiar e abrir no navegador |
| `ferramentas.mjs` | ferramenta no PATH e a versão |
| `erro-de-banco.mjs` | SQLSTATE → "o que aconteceu" e passos numerados |
| `executar.mjs` | rodar programa (capturando ou na tela); aspas para `.bat`/`.cmd` no Windows |

`ui/` tem cores e degradês (`estilo`), detecção do terminal, perguntas sem dependência
(`perguntas`: confirmar, escolher, texto, senha), tabela de duas colunas, spinner e mensagens
padronizadas. Sem cor, as funções de estilo devolvem o texto puro, então quem as usa **nunca
pergunta** "tem cor?".

## O caminho do `codify dev`

```
codify dev --except=web
  ├─ cli.mjs              carrega o projeto, banner
  └─ comandos/dev.mjs
      ├─ projeto/contexto  serviços resolvidos (portas do .env da máquina), filtro --except
      ├─ consultarFamilias ambiente.php → JSON; Horizon sai sem pcntl, Pail também
      ├─ plano/portas      porta ocupada? trocar nesta execução / encerrar / pular / cancelar
      ├─ doctor            diagnostica; com terminal, oferece consertar (até 6 rodadas)
      ├─ plano/montar      Plano (JSON)
      └─ painel            sobe, vigia, mostra; `q` encerra tudo
```

## Decisões de desenho

| Decisão | Motivo |
|---|---|
| Sem dependências de runtime | Instala rápido, não quebra por atualização de terceiros |
| ESM (`.mjs`), Node ≥ 24 | Padrão do Node moderno; glob no `node --test` |
| Configuração em JS (`defineConfig`) | Comentários, autocomplete e validação na hora de carregar |
| O Órbita não adivinha nada na execução | Previsível: o que está na config é o que roda. Quem descobre a stack é o `codify init`, uma vez |
| Chave desconhecida na config é erro | Um `servico:` no lugar de `servicos:` seria ignorado em silêncio |
| Preset × família | O que é de um serviço (porta, comando) separado do que é de uma pasta (APP_KEY, banco) |
| O Plano é JSON puro | Dá para gravar (`--plano=`) e subir o painel sem checar nada (`ORBITA_PLANO`) |
| Windows: `Get-NetTCPConnection` antes do `netstat` | O `netstat -ano` de algumas builds do Windows 11 não lista sockets novos |
| `ORBITA_PHP` | A máquina pode ter o PHP errado no PATH (8.4 com projeto 8.5); o doctor explica isso em português |
| `ErroDeUso` × erro comum | Erro do dev mostra só a mensagem; bug do código mostra o stack |
| Teste espelha o `src/` | Quem acha o arquivo acha o teste |

## Como testar

- `npm test` (ou `bun test`). Só `node:test`; os dois runners precisam passar.
- **Unidade pura** é a regra: env, leitores, define-config, help, presets, plano, alvos do parar.
- **Contexto falso** ([`test/_ajudantes/projeto-falso.mjs`](../test/_ajudantes/projeto-falso.mjs)):
  monta um projeto numa pasta temporária, com perguntas de resposta pronta e executor falso. É
  assim que doctor, reparo, setup e plano são testados sem PHP nem banco.
- **Sistema real** só onde a amostra não basta: portas e processos (servidor de verdade numa porta
  livre), o `ambiente.php` (se houver PHP no PATH) e o modo inline do painel (processos reais, sem
  deixar órfãos).
- Conferir as camadas: `grep -rln "from '\.\./ui/" src/ambiente` não pode achar nada (e assim por
  diante, conforme a tabela acima).
