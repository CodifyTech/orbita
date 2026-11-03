// Roteador da CLI: lê os argumentos, carrega o projeto, mostra o banner e chama o comando.
// Não tem regra de negócio: cada comando mora em src/comandos/.
//
// `executarCli` é o contrato com bin/codify.mjs (e com o repasse para a instalação local):
// não mude a assinatura sem pensar nos projetos que fixaram versões diferentes do Órbita.
import { lerArgumentos } from './argumentos.mjs'
import { exibirBanner } from './banner.mjs'
import { COMANDOS, buscarComando } from './comandos/index.mjs'
import { carregarProjeto } from './config/carregar-config.mjs'
import { BINARIO } from './constantes.mjs'
import { ErroDeUso } from './erros.mjs'
import { criarEstilo } from './ui/estilo.mjs'
import { detectarTerminal } from './ui/terminal.mjs'
import { versaoDoOrbita } from './versao.mjs'

/**
 * @param {string[]} argv argumentos sem `node` e sem o caminho do script
 * @param {object} [ambiente] tudo que vem de fora do processo; os testes trocam por falsos
 * @returns {Promise<number>} código de saída
 */
export async function executarCli(argv, ambiente = {}) {
  const { cwd = process.cwd(), stdout = process.stdout, stderr = process.stderr, env = process.env } = ambiente
  const terminal = detectarTerminal({ stdout, env })
  const estilo = criarEstilo(terminal)

  try {
    const { posicionais, opcoes } = lerArgumentos(argv)

    if (opcoes.version || opcoes.v) {
      stdout.write(`${versaoDoOrbita()}\n`)

      return 0
    }

    // `codify`, `codify --help` e `codify dev --help` caem todos no help.
    const pediuAjuda = opcoes.help || opcoes.h
    const nome = pediuAjuda || posicionais.length === 0 ? 'help' : posicionais[0]
    const restantes = pediuAjuda && posicionais.length ? posicionais : posicionais.slice(1)

    const comando = buscarComando(nome)
    if (!comando) {
      throw new ErroDeUso(`Comando desconhecido: "${nome}".`, `Rode "${BINARIO} help" para ver os comandos disponíveis.`)
    }

    const projeto = await carregarProjeto(cwd)
    const contexto = {
      argumentos: { posicionais: restantes, opcoes },
      projeto,
      comandos: COMANDOS,
      saida: stdout,
      estilo,
      terminal,
      env,
    }

    if (comando.banner !== false) {
      await exibirBanner({
        comando: comando.nome,
        descricao: projeto.descricoes[comando.nome] ?? comando.descricao,
        config: projeto.config,
        terminal,
        saida: stdout,
        env,
      })
    }

    return (await comando.executar(contexto)) ?? 0
  } catch (erro) {
    if (!(erro instanceof ErroDeUso)) {
      throw erro
    }

    stderr.write(`\n${estilo.vermelho('✗')} ${erro.message}\n`)
    if (erro.dica) {
      stderr.write(`  ${estilo.suave(erro.dica)}\n`)
    }
    stderr.write('\n')

    return 1
  }
}
