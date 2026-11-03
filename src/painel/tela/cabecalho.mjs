// Primeira linha da tela: nome do projeto, quantos serviços estão no ar, erros, tempo ligado e, à
// direita, a assinatura da CodifyTech e o relógio.
import {
  AMARELO,
  APAGADO,
  compor,
  degrade,
  LARANJA,
  MAGENTA,
  marcaCodifyTech,
  NEGRITO,
  pinta,
  SUAVE,
  TEXTO,
  VERDE,
  VERMELHO,
} from '../cores.mjs'
import { processos } from '../estado.mjs'
import { duracao, horaDe, plural } from '../formato.mjs'
import { contarAlertas } from '../logs.mjs'
import { juntar } from '../texto.mjs'

const SEPARADOR = pinta(APAGADO, '  ·  ')

/**
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w
 * @param {number} t agora
 */
export function cabecalho(estado, w, t) {
  const lista = processos(estado)
  const noAr = lista.filter(s => s.estado === 'online').length
  const corResumo = noAr === lista.length ? VERDE : lista.some(s => s.estado === 'caiu') ? VERMELHO : AMARELO
  const { erros } = contarAlertas(estado.alertas)

  const esquerda = [
    ` ${degrade(`◆ ${estado.plano.projeto.nome}`, LARANJA, MAGENTA, (t / 2600) % 2, NEGRITO)}`,
    pinta(SUAVE, ' dev'),
    pinta(APAGADO, '  │  '),
    compor([
      [corResumo, '● '],
      [TEXTO, `${noAr}/${lista.length} no ar`],
    ]),
    erros ? SEPARADOR + pinta(VERMELHO, `✖ ${plural(erros, 'erro')}`) : '',
    SEPARADOR + pinta(SUAVE, `⏱ ${duracao(t - estado.inicio)}`),
  ].join('')
  const direita = `${w >= 110 ? pinta(SUAVE, 'desenvolvido por ') : ''}${marcaCodifyTech(t)}${pinta(APAGADO, '  │  ')}${pinta(TEXTO, horaDe(t))} `

  return juntar(esquerda, direita, w)
}
