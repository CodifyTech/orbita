// Monta um Contexto (src/presets/tipos.mjs) sobre uma pasta temporária, para testar presets,
// doctor, plano e parar sem precisar de PHP, banco ou terminal.
import { defineConfig } from '../../src/config/define-config.mjs'
import { montarContexto } from '../../src/projeto/contexto.mjs'
import { criarEstilo } from '../../src/ui/estilo.mjs'
import { criarProjetoTemporario, criarSaidaFalsa, TERMINAL_SIMPLES } from './saida-falsa.mjs'

/** Perguntas com respostas prontas, na ordem (confirmar → true/false, escolher/texto → valor). */
export function perguntasProntas(respostas = []) {
  const fila = [...respostas]
  const proxima = async () => fila.shift()

  return { interativo: true, confirmar: proxima, escolher: proxima, texto: proxima, senha: proxima, pendentes: fila }
}

/**
 * @param {object} config  o que iria no orbita.config.mjs (sem nome: "Teste")
 * @param {Record<string, string>} [arquivos]  arquivos da pasta temporária
 * @param {object} [extras]  opcoes, perguntas, executar…
 */
export function contextoFalso(config, arquivos = {}, extras = {}) {
  const raiz = criarProjetoTemporario(arquivos)
  const projeto = { raiz, arquivoDeConfig: null, config: defineConfig({ nome: 'Teste', ...config }), scripts: {}, descricoes: {} }
  const saida = criarSaidaFalsa()

  return montarContexto(projeto, {
    saida,
    estilo: criarEstilo({ usaCor: false }),
    terminal: TERMINAL_SIMPLES,
    perguntas: perguntasProntas(),
    env: {},
    ...extras,
  })
}
