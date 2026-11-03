// `codify banner <script>`: o cabeçalho avulso, para pôr na frente de scripts do package.json que
// não são do Órbita:  "lint": "codify banner lint && eslint ."
import { exibirBanner } from '../banner.mjs'
import { ErroDeUso } from '../erros.mjs'

/** @type {import('./tipos.mjs').Comando} */
export default {
  nome: 'banner',
  descricao: 'Mostra só o cabeçalho da CodifyTech (para usar na frente de scripts do package.json)',
  banner: false,
  oculto: true,
  async executar({ argumentos, projeto, terminal, saida, env }) {
    const [script] = argumentos.posicionais

    if (!script) {
      throw new ErroDeUso('Informe o nome do script.', 'Exemplo: codify banner lint')
    }

    await exibirBanner({
      comando: script,
      execucao: `${projeto.config.gerenciador} run ${script}`,
      descricao: projeto.descricoes[script] ?? '',
      config: projeto.config,
      terminal,
      saida,
      env,
    })
  },
}
