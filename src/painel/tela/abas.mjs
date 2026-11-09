// Barra de abas (com o número de atalho, o ponto de estado e o contador de erros não vistos) e a
// linha de baixo, que sublinha a aba ativa. Se não cabe tudo, tira os números e depois mostra só a
// janela de abas em volta da ativa, com ‹ › indicando que há mais.
import { APAGADO, BRANCO, clarear, compor, escurecer, pinta, SUAVE, TEXTO, VERMELHO } from '../cores.mjs'
import { abaAtual, abas, nosCartoes } from '../estado.mjs'
import { ajustar, cortar, vis } from '../texto.mjs'
import { ponto } from './pecas.mjs'

/**
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w
 * @param {number} t agora
 * @returns {[string, string]} a barra e o sublinhado
 */
export function barraDeAbas(estado, w, t) {
  const lista = abas(estado)
  const atual = abaAtual(estado)

  const montar = compacto =>
    lista.map((a, i) => {
      const ativo = a.id === atual
      const partes = []
      if (!compacto && i < 9) {
        partes.push([ativo ? clarear(a.cor, 0.55) : APAGADO, `${i + 1} `])
      }
      partes.push(a.servico ? ponto(a.servico, t) : [ativo ? BRANCO : a.cor, a.icone])
      partes.push([ativo ? BRANCO : TEXTO, ` ${a.titulo}`, ativo])
      const naoVistos = a.servico ? a.servico.naoVistos : a.id === 'alertas' ? estado.alertasNaoVistos : 0
      if (naoVistos) {
        partes.push([VERMELHO, ` ✖${naoVistos > 99 ? '99+' : naoVistos}`, true])
      } else if (a.id === 'alertas' && estado.alertas.length) {
        partes.push([SUAVE, ` ${estado.alertas.length}`])
      }
      const texto = compor([[BRANCO, ' '], ...partes, [BRANCO, ' ']], ativo ? escurecer(a.cor, 0.6) : null)

      return { id: a.id, cor: a.cor, texto, w: vis(texto) }
    })

  let itens = montar(false)
  if (itens.reduce((n, it) => n + it.w + 1, 1) > w) {
    itens = montar(true)
  }

  // Janela que cabe na largura e contém a aba ativa.
  const ia = Math.max(0, itens.findIndex(it => it.id === atual))
  const soma = (a, b) => itens.slice(a, b + 1).reduce((n, it) => n + it.w + 1, 3)
  let ini = 0
  while (ini < ia && soma(ini, ia) > w) {
    ini++
  }
  let fim = ia
  while (fim + 1 < itens.length && soma(ini, fim + 1) <= w) {
    fim++
  }

  let x = 1
  let barra = ini > 0 ? pinta(SUAVE, '‹') : ' '
  let sublinha = ''
  estado.regioes.abas = []
  for (const it of itens.slice(ini, fim + 1)) {
    barra += `${it.texto} `
    // Com o foco nos cartões, o traço da aba ativa afina: as setas não estão mais aqui.
    const traco = nosCartoes(estado) ? pinta(escurecer(it.cor, 0.5), '─'.repeat(it.w)) : pinta(it.cor, '━'.repeat(it.w))
    sublinha += it.id === atual ? traco + pinta(APAGADO, '─') : pinta(APAGADO, '─'.repeat(it.w + 1))
    estado.regioes.abas.push({ id: it.id, x0: x, x1: x + it.w })
    x += it.w + 1
  }
  if (fim < itens.length - 1) {
    barra += pinta(SUAVE, '›')
  }

  sublinha = cortar(pinta(APAGADO, '─') + sublinha, w, false)

  return [ajustar(barra, w), sublinha + pinta(APAGADO, '─'.repeat(Math.max(0, w - vis(sublinha))))]
}
