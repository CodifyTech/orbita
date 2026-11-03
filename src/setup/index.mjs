// O `codify setup`: prepara o projeto pela primeira vez, explicando cada passo.
//
//   [0/N] ferramentas da máquina (o que os presets precisam: php, composer, bun, dotnet…)
//   [n/N] pacotes de cada pasta (composer install, bun install, dotnet restore) com spinner
//   [n/N] configuração de cada backend (.env, chaves, banco) — ex.: a do Laravel
//   [n/N] .env dos frontends apontando para a API local
//   [n/N] check-up final (o doctor)
//
// Porta do `setup.mjs` + `SetupCommand.php` do FoodOS. Pode rodar de novo: continua de onde parou.
import { rodarDoctor } from '../doctor/index.mjs'
import { precisaDeShell } from '../ambiente/executar.mjs'
import { versaoDe } from '../ambiente/ferramentas.mjs'
import { processoDoPlano } from '../plano/montar.mjs'
import { prepararEnvDoFrontend } from '../presets/node.mjs'
import { CORES } from '../ui/estilo.mjs'
import { criarMensagens } from '../ui/mensagens.mjs'
import { comSpinner, formatarTempo } from '../ui/spinner.mjs'
import { larguraDoTerminal, linhaDeDetalhe } from '../ui/tabela.mjs'
import { boasVindas } from './boas-vindas.mjs'

const RODAPE = 'Depois rode `codify setup` de novo.'

/**
 * @param {import('../presets/tipos.mjs').Contexto} contexto  com todos os serviços (filtrar: false)
 * @returns {Promise<number>} código de saída
 */
export async function rodarSetup(contexto) {
  const inicio = Date.now()
  const { saida, estilo, grupos } = contexto
  const mensagens = criarMensagens(saida, estilo)

  await boasVindas(contexto)

  const instalacoes = grupos.map(grupo => ({ grupo, etapa: grupo.familia.instalacao(grupo, contexto) })).filter(({ etapa }) => etapa)
  const configuracoes = grupos.flatMap(grupo => (grupo.familia.configuracao?.(grupo, contexto) ?? []).filter(etapa => !etapa.pular?.()))
  const frontends = grupos.filter(grupo => grupo.familia.nome === 'node')
  const total = instalacoes.length + configuracoes.length + (frontends.length ? 1 : 0) + 1
  let numero = 0
  const cabecalho = (titulo, porque) => {
    numero++
    saida.write(`${estilo.rgb(CORES.LARANJA, `[${numero}/${total}]`)} ${estilo.negrito(titulo)}\n      ${estilo.suave(porque)}\n`)
  }

  if (!(await conferirFerramentas(contexto, total))) {
    return 1
  }

  for (const { grupo, etapa } of instalacoes) {
    cabecalho(etapa.titulo, etapa.porque)
    if (!(await instalar(etapa, grupo.cwd, contexto))) {
      return 1
    }
  }

  for (const etapa of configuracoes) {
    cabecalho(etapa.titulo, etapa.porque)
    if (!(await etapa.executar(contexto))) {
      return 1
    }
    saida.write('\n')
  }

  if (frontends.length) {
    cabecalho('Frontend', 'Configurando o .env dos apps para conversarem com a API local (e com o tempo real, se houver).')
    for (const frontend of frontends) {
      const extras = Object.assign({}, ...grupos.map(grupo => grupo.familia.extrasDoFrontend?.(frontend.servicos[0], grupo, contexto) ?? {}))
      const feito = prepararEnvDoFrontend(frontend, contexto, extras)
      ;(feito.length ? feito : [`${frontend.pasta}/.env já estava configurado.`]).forEach(texto => mensagens.ok(texto))
    }
    saida.write('\n')
  }

  cabecalho('Check-up final', 'Conferindo se chaves, banco, portas e variáveis estão prontos para o `codify dev`.')
  await Promise.all(grupos.map(grupo => grupo.familia.consultar?.(grupo, contexto)))

  if (!(await rodarDoctor(contexto, { perguntar: contexto.perguntas.interativo })).ok) {
    mensagens.linha(`  Os itens com ${estilo.vermelho('✗')} acima impedem o \`codify dev\`. Corrija-os e rode ${estilo.verde('codify setup')} de novo.\n`)

    return 1
  }

  proximosPassos(contexto)

  saida.write(`  ${estilo.degrade('━'.repeat(60), CORES.LARANJA, CORES.MAGENTA)}\n`)
  saida.write(`  ${estilo.verde('✔')} ${estilo.negrito('Tudo pronto!')} Ambiente do ${contexto.projeto.config.nome} configurado em ${formatarTempo(Date.now() - inicio)}.\n`)
  saida.write(`  Agora é só rodar ${estilo.verde('codify dev')} e abrir o navegador. Bom código! 🚀  ${estilo.suave('— equipe CodifyTech')}\n\n`)

  return 0
}

/** [0/N]: o que cada família precisa no PATH, com a versão encontrada. Falta algo → para aqui. */
async function conferirFerramentas(contexto, total) {
  const { saida, estilo, grupos } = contexto
  const porComando = new Map()

  for (const grupo of grupos) {
    for (const ferramenta of grupo.familia.ferramentas(grupo, contexto)) {
      porComando.set(ferramenta.comando, ferramenta)
    }
  }

  const ferramentas = [...porComando.values()]
  const versoes = await Promise.all(ferramentas.map(({ comando, args }) => versaoDe(comando, args, contexto)))
  const faltando = ferramentas.filter((_, i) => !versoes[i])

  saida.write(`${estilo.rgb(CORES.LARANJA, `[0/${total}]`)} ${estilo.negrito('Conferindo as ferramentas da sua máquina')}\n`)
  saida.write(`      ${estilo.suave(`O projeto precisa de: ${ferramentas.map(({ nome }) => nome).join(', ') || 'nada além do Node'}.`)}\n`)

  for (const [i, { nome }] of ferramentas.entries()) {
    saida.write(versoes[i] ? `      ${estilo.verde('✔')} ${nome.padEnd(10)}${estilo.suave(versoes[i])}\n` : `      ${estilo.vermelho('✖')} ${nome.padEnd(10)}${estilo.vermelho('não encontrado')}\n`)
  }
  saida.write('\n')

  if (faltando.length) {
    saida.write(`      ${estilo.amarelo('Faltam ferramentas:')}\n`)
    faltando.forEach(({ dica }, i) => saida.write(`        ${i + 1}. ${dica}\n`))
    saida.write(`\n      Instale e rode ${estilo.verde('codify setup')} de novo.\n\n`)

    return false
  }

  return true
}

/** Roda a instalação com spinner; a saída só aparece (as 15 últimas linhas) se falhar. */
async function instalar(etapa, cwd, contexto) {
  const { saida, estilo, terminal } = contexto
  const { resultado, tempo } = await comSpinner(
    etapa.texto,
    () => contexto.executar(etapa.comando, etapa.args, { cwd, shell: precisaDeShell(), timeout: 0, env: { NO_COLOR: '1' } }),
    { saida, terminal, estilo },
  )

  if (resultado.ok) {
    saida.write(`      ${estilo.verde('✔')} Pronto. ${estilo.suave(`(${tempo})`)}\n\n`)

    return true
  }

  const ultimas = `${resultado.saida}\n${resultado.erro}`.trim().split('\n').slice(-15)
  saida.write(`      ${estilo.vermelho('✖')} ${estilo.negrito(`${etapa.comando} ${etapa.args.join(' ')} falhou.`)}\n\n`)
  if (ultimas[0]) {
    saida.write(`${estilo.suave(ultimas.map(linha => `        │ ${linha}`).join('\n'))}\n\n`)
  }
  saida.write(`      ${estilo.amarelo('Como resolver:')}\n`)
  etapa.passosSeFalhar.forEach((passo, i) => saida.write(`        ${i + 1}. ${passo}\n`))
  saida.write(`\n      ${RODAPE}\n\n`)

  return false
}

function proximosPassos(contexto) {
  const { saida, estilo, servicos } = contexto
  const largura = larguraDoTerminal(saida)
  const linha = (esquerda, direita) => saida.write(`${linhaDeDetalhe(esquerda, direita, { largura, estilo })}\n`)

  saida.write(`\n  ${estilo.negrito('Próximos passos')} (na raiz do projeto):\n\n`)
  linha(estilo.verde('codify dev'), 'sobe todos os serviços num painel (q para sair)')
  linha(estilo.verde('codify doctor'), 'confere o ambiente de novo')
  linha(estilo.verde('codify parar'), 'derruba o que ficou rodando')
  linha(estilo.verde('codify help'), 'todos os comandos e scripts do projeto')
  saida.write('\n')

  for (const servico of servicos.filter(({ porta }) => porta)) {
    linha(servico.nome, processoDoPlano(servico, contexto).url)
  }
  saida.write('\n')
}
