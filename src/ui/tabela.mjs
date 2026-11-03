// Linhas de duas colunas ("item ........ detalhe"), como o twoColumnDetail do Laravel, e os ícones
// de estado (✓ ! ✗) usados pelo doctor, pelo parar e pelo setup.

/** Tira os códigos ANSI (cores) para medir o tamanho que o texto ocupa na tela. */
export const semAnsi = texto => texto.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')

/**
 * `  esquerda ……………… direita`, preenchendo com pontos até `largura`. Se não cabe, um espaço só.
 *
 * @param {string} esquerda
 * @param {string} direita
 * @param {{ largura?: number, estilo: { suave(texto: string): string } }} opcoes
 */
export function linhaDeDetalhe(esquerda, direita, { largura = 100, estilo }) {
  const ocupado = 2 + semAnsi(esquerda).length + semAnsi(direita).length + 2
  const pontos = largura - ocupado

  return `  ${esquerda} ${pontos >= 2 ? `${estilo.suave('.'.repeat(pontos))} ` : ''}${direita}`
}

/** Largura útil do terminal (no máximo 120, para não esticar demais em monitor largo). */
export const larguraDoTerminal = (saida = process.stdout) => Math.min(saida.columns || 100, 120)

/**
 * Ícone colorido de um estado do diagnóstico.
 *
 * @param {'ok' | 'aviso' | 'erro'} estado
 * @param {ReturnType<typeof import('./estilo.mjs').criarEstilo>} estilo
 */
export function iconeDoEstado(estado, estilo) {
  return { ok: estilo.verde('✓'), aviso: estilo.amarelo('!'), erro: estilo.vermelho('✗') }[estado]
}

/** Pinta o texto com a cor do estado. */
export function corDoEstado(estado, estilo, texto) {
  return { ok: estilo.verde, aviso: estilo.amarelo, erro: estilo.vermelho }[estado](texto)
}
