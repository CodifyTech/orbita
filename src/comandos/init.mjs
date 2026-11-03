// `codify init`: examina as pastas do projeto e gera o orbita.config.mjs já preenchido, mais os
// scripts do package.json (só os que faltam). --force sobrescreve a config; --sem-scripts não mexe
// no package.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { ARQUIVO_DE_CONFIG, BINARIO, NOME_DO_PACOTE } from '../constantes.mjs'
import { ErroDeUso } from '../erros.mjs'
import { detectarApps, detectarGerenciador, servicosDosApps } from '../init/detectar.mjs'
import { acrescentarScripts, scriptsSugeridos, textoDaConfig } from '../init/gerar.mjs'
import { criarMensagens } from '../ui/mensagens.mjs'

/** @type {import('./tipos.mjs').Comando} */
export default {
  nome: 'init',
  descricao: 'Examina as pastas do projeto e gera o orbita.config.mjs já preenchido (e os scripts do package.json)',
  usaConfig: false,
  async executar({ argumentos: { opcoes }, projeto, saida, estilo }) {
    const mensagens = criarMensagens(saida, estilo)
    // Sem config ainda, a raiz é a do package.json mais próximo (ou a pasta atual).
    const { raiz } = projeto
    const arquivoDaConfig = join(raiz, ARQUIVO_DE_CONFIG)

    if (existsSync(arquivoDaConfig) && !opcoes.force) {
      throw new ErroDeUso(`Já existe ${ARQUIVO_DE_CONFIG} em ${raiz}.`, 'Use --force para gerar de novo (a config atual é sobrescrita).')
    }

    const apps = detectarApps(raiz)

    if (!apps.length) {
      throw new ErroDeUso(
        'Não encontrei nenhum app conhecido (Laravel, Vite, Nuxt, Astro, Next, Ionic ou .NET) até dois níveis abaixo desta pasta.',
        `Crie o ${ARQUIVO_DE_CONFIG} à mão, com serviços de "cmd" (veja docs/configuracao.md).`,
      )
    }

    const arquivoDoPacote = join(raiz, 'package.json')
    const pacote = existsSync(arquivoDoPacote) ? readFileSync(arquivoDoPacote, 'utf8') : null
    const nome = (pacote && JSON.parse(pacote).name) || basename(raiz)
    const servicos = servicosDosApps(apps)
    const sugeridos = scriptsSugeridos(servicos)
    const descricoes = Object.fromEntries(Object.entries(sugeridos).map(([script, { descricao }]) => [script, descricao]))

    mensagens.linha(`\n  ${estilo.negrito('Encontrei:')}`)
    for (const app of apps) {
      mensagens.ok(`${app.pasta}: ${app.tipo === 'node' ? app.preset : app.tipo}`)
    }

    writeFileSync(arquivoDaConfig, textoDaConfig({ nome, gerenciador: detectarGerenciador(raiz, apps), servicos, descricoes }))
    mensagens.linha(`\n  ${estilo.verde('✔')} ${ARQUIVO_DE_CONFIG} criado com os serviços: ${Object.keys(servicos).join(', ')}.`)

    if (!opcoes['sem-scripts']) {
      const comandos = Object.fromEntries(Object.entries(sugeridos).map(([script, { comando }]) => [script, comando]))
      const { texto, adicionados } = acrescentarScripts(pacote, comandos, nome)

      writeFileSync(arquivoDoPacote, texto)
      mensagens.linha(
        adicionados.length
          ? `  ${estilo.verde('✔')} package.json: scripts ${adicionados.join(', ')} adicionados.`
          : `  ${estilo.suave('package.json já tinha todos os scripts.')}`,
      )
    }

    mensagens.linha(`\n  ${estilo.negrito('Próximos passos:')}`)
    mensagens.linha(`    1. Revise o ${ARQUIVO_DE_CONFIG} (portas, serviços, descrições).`)
    mensagens.linha(`    2. Instale o Órbita no projeto: ${estilo.verde(`npm install --save-dev ${NOME_DO_PACOTE}`)}`)
    mensagens.linha(`    3. Rode ${estilo.verde(`${BINARIO} setup`)} e depois ${estilo.verde(`${BINARIO} dev`)}.\n`)
  },
}
