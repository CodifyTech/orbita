// O que fica no terminal depois que o painel fecha: quanto tempo o dev rodou, reinícios, erros e
// alertas, os últimos erros e a assinatura. Sem TTY sai em texto puro.
import { SITE } from '../constantes.mjs'
import {
  AMARELO,
  APAGADO,
  AZUL,
  CIANO,
  degrade,
  LARANJA,
  MAGENTA,
  NEGRITO,
  pinta,
  ROXO,
  SUAVE,
  TEXTO,
  VERMELHO,
} from './cores.mjs'
import { processos } from './estado.mjs'
import { duracao, horaDe } from './formato.mjs'
import { contarAlertas } from './logs.mjs'

/**
 * @param {import('./estado.mjs').Estado} estado
 * @param {{ usaCor: boolean, agora?: number }} opcoes
 * @returns {string}
 */
export function montarResumo(estado, { usaCor, agora = Date.now() }) {
  const c = (cor, texto) => (usaCor ? pinta(cor, texto) : texto)
  const marca = texto => (usaCor ? degrade(texto, LARANJA, MAGENTA, 0, NEGRITO) : texto)
  const lista = processos(estado)
  const errosRecentes = estado.alertas.filter(a => a.nivel === 'erro').slice(-3)
  const { erros, avisos } = contarAlertas(estado.alertas)
  const reinicios = lista.reduce((n, s) => n + s.reinicios, 0)

  const linhas = [
    '',
    `  ${marca(`◆ ${estado.plano.projeto.nome}`)} ${c(SUAVE, `· dev encerrado depois de ${duracao(agora - estado.inicio)}`)}`,
    `    ${[
      c(TEXTO, `${lista.length} serviço(s)`),
      c(reinicios ? AMARELO : SUAVE, `${reinicios} reinício(s)`),
      c(erros ? VERMELHO : SUAVE, `${erros} erro(s)`),
      c(avisos ? AMARELO : SUAVE, `${avisos} alerta(s)`),
    ].join(` ${c(SUAVE, '·')} `)}`,
  ]
  if (errosRecentes.length) {
    linhas.push('', `    ${c(VERMELHO, 'Últimos erros:')}`)
    for (const a of errosRecentes) {
      const vezes = a.vezes > 1 ? c(SUAVE, ` ×${a.vezes}`) : ''
      linhas.push(`      ${c(APAGADO, horaDe(a.t))} ${c(a.s.cor, a.s.nome.padEnd(8))} ${a.texto.slice(0, 140)}${vezes}`)
    }
  }
  const codifyTech = usaCor ? degrade('CodifyTech', AZUL, ROXO, 0, NEGRITO) : 'CodifyTech'
  linhas.push('', `  ${c(SUAVE, 'Até a próxima! —')} ${codifyTech} ${c(SUAVE, '·')} ${c(CIANO, SITE)}`, '', '')

  return linhas.join('\n')
}
