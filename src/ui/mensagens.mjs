// Mensagens padronizadas para o terminal (doctor, reparo, parar, setup), para todos falarem igual.

/**
 * @param {{ write(texto: string): unknown }} saida
 * @param {ReturnType<typeof import('./estilo.mjs').criarEstilo>} estilo
 */
export function criarMensagens(saida, estilo) {
  const escrever = texto => saida.write(`${texto}\n`)

  return {
    linha: (texto = '') => escrever(texto),
    /** Começo de um conserto: "! Porta 8000 (server) em uso por node.exe (PID 12)". */
    titulo: texto => escrever(`\n  ${estilo.amarelo('!')} ${estilo.amarelo(texto)}`),
    ok: texto => escrever(`  ${estilo.verde('✓')} ${texto}`),
    aviso: texto => escrever(`  ${estilo.amarelo('!')} ${texto}`),
    erro: texto => escrever(`  ${estilo.vermelho('✗')} ${texto}`),
    /** Erro com o que fazer, numerado. */
    comoResolver(titulo, passos, rodape = '') {
      escrever(`\n  ${estilo.vermelho('✗')} ${estilo.negrito(titulo)}`)
      escrever(`  ${estilo.amarelo('Como resolver:')}`)
      passos.forEach((passo, i) => escrever(`    ${i + 1}. ${passo}`))
      if (rodape) {
        escrever(`\n  ${rodape}`)
      }
      escrever('')
    },
  }
}
