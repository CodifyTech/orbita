// Aba de log (de um serviço ou "Todos"): barra com o estado do serviço, linha do comando e contagem,
// as linhas com hora, nome (na "Todos") e barra colorida pelo nível, barra de rolagem e o selo
// "N linhas acima do fim" quando o dev não está seguindo o fim.
import {
  AMARELO,
  APAGADO,
  AZUL,
  BRANCO,
  CIANO,
  compor,
  escurecer,
  FUNDO_SEL,
  NEGRITO,
  pinta,
  PRETO,
  SUAVE,
  SUBLINHADO,
  TEXTO,
  VERDE,
  VERMELHO,
} from '../cores.mjs'
import { processos, servicoDe, vista } from '../estado.mjs'
import { duracao, haQuanto, horaDe, mb } from '../formato.mjs'
import { ajustar, centralizar, fatiarPlano, juntar, quebrar, vis } from '../texto.mjs'
import { latencia } from './cartao.mjs'
import { corDoStatus, ESTADOS, pilula, ponto, spinner, textoEstado } from './pecas.mjs'
import { realce, realceFiltro } from './realce.mjs'

/** Margem esquerda: espaço + hora (8) + espaço + nome (9, só na "Todos") + barra e espaço. */
const larguraDaMargem = comNome => 1 + 8 + 1 + (comNome ? 9 : 0) + 2
/** Linha da tela (0-based) da primeira linha de log: cabeçalho, abas, sublinha e as duas barras da aba. */
const TOPO_DO_LOG = 5

const COR_DO_VERBO = { GET: [96, 165, 250], POST: VERDE, PUT: AMARELO, PATCH: AMARELO, DELETE: VERMELHO }
/** Colunas de largura fixa de uma linha de request. */
const COLUNA_DO_VERBO = 7
const COLUNA_DA_DURACAO = 9
const COLUNA_DE_IDADE = 8

const textoDaDuracao = ms => `~ ${ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`}`

/**
 * Uma linha de request em colunas: verbo, status, caminho (cortado se não couber), duração e há
 * quanto tempo aconteceu. Ocupa sempre uma linha de tela, com largura exata `w`.
 *
 * @param {import('../estado.mjs').Linha & { req: any }} l
 * @param {number} w
 * @param {number} t agora
 * @returns {{ plano: string, pintado: string }}
 */
export function colunasDoRequest(l, w, t) {
  const { metodo, status, caminho, ms } = l.req
  const verbo = (metodo ?? '···').padEnd(COLUNA_DO_VERBO)
  const codigo = status ? String(status) : '···'
  const tempo = textoDaDuracao(ms).padStart(COLUNA_DA_DURACAO)
  const idade = haQuanto(t - l.t).padStart(COLUNA_DE_IDADE)
  const livre = Math.max(1, w - vis(verbo) - vis(codigo) - vis(tempo) - vis(idade) - 5)
  const rota = vis(caminho) > livre ? `${fatiarPlano(caminho, 0, livre - 1).trimEnd()}…` : caminho
  const pontos = vis(rota) < livre - 1 ? ` ${'.'.repeat(livre - vis(rota) - 1)}` : ' '.repeat(livre - vis(rota))
  const juntarColunas = (a, b, c, d, e, f) => `${a} ${b} ${c}${d} ${e}  ${f}`

  return {
    plano: juntarColunas(verbo, codigo, rota, pontos, tempo, idade),
    pintado: juntarColunas(
      pinta(COR_DO_VERBO[metodo] ?? SUAVE, verbo, NEGRITO),
      status ? pinta(corDoStatus(status), codigo, NEGRITO) : pinta(APAGADO, codigo),
      pinta([147, 197, 253], rota),
      pinta([52, 58, 74], pontos),
      pinta([192, 132, 252], tempo),
      pinta(SUAVE, idade),
    ),
  }
}

/**
 * A rolagem que deixa a linha `idx` inteira na tela, mexendo o mínimo: uma linha longa ocupa várias
 * linhas de tela, por isso a conta passa pela altura de cada uma.
 *
 * @param {any[]} lista
 * @param {number} idx
 * @param {number} rolagem a atual
 * @param {number} altura linhas de tela disponíveis
 * @param {(linha: any) => number} alturaDe quantas linhas de tela a linha ocupa
 */
export function rolagemParaVer(lista, idx, rolagem, altura, alturaDe) {
  const ultima = lista.length - 1 - rolagem
  if (idx > ultima) {
    return lista.length - 1 - idx
  }
  let usadas = 0
  let topo = ultima + 1
  while (topo > 0 && usadas + alturaDe(lista[topo - 1]) <= altura) {
    usadas += alturaDe(lista[--topo])
  }
  if (idx >= topo) {
    return rolagem
  }
  usadas = 0
  let fim = idx - 1
  while (fim + 1 < lista.length && usadas + alturaDe(lista[fim + 1]) <= altura) {
    usadas += alturaDe(lista[++fim])
  }

  return lista.length - 1 - Math.max(fim, idx)
}

/**
 * Primeira linha da aba: o resumo do serviço (ou de todos, na aba "Todos").
 *
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w
 * @param {(import('../estado.mjs').Servico & Record<string, any>) | null} s
 * @param {number} t agora
 */
export function barraInfo(estado, w, s, t) {
  if (!s) {
    const servicos = processos(estado).map(p => compor([ponto(p, t), [TEXTO, ` ${p.nome}`]]))
    const logs = estado.servicos
      .filter(l => l.tipo === 'log')
      .map(l => compor([ponto(l, t), [TEXTO, ` ${l.metricas.arquivo ?? l.nome}`]]))

    return ajustar(` ${pilula(AZUL, '≡ todos os serviços')}  ${[...servicos, ...logs].join('   ')}`, w)
  }
  const [corPonto, icone] = ponto(s, t)
  const partes = [
    ` ${compor([[BRANCO, ` ${s.nome} `, true]], escurecer(s.cor, 0.5))}`,
    compor([
      [corPonto, icone],
      [ESTADOS[s.estado]?.cor ?? SUAVE, ` ${textoEstado(s, t)}`],
    ]),
    s.filho ? pinta(SUAVE, `⏱ ${duracao(t - s.inicio)}`) : '',
    s.tipo === 'processo' ? pinta(s.reinicios ? AMARELO : SUAVE, `↻ ${s.reinicios}`) : '',
    s.mem ? pinta(SUAVE, `▣ ${mb(s.mem)}`) : '',
    s.pid ? pinta(APAGADO, `PID ${s.pid}`) : '',
    s.url ? pinta(CIANO, s.url, SUBLINHADO) : '',
    latencia(s),
  ].filter(Boolean)

  return ajustar(partes.join('   '), w)
}

/** Cor da barrinha à esquerda do texto: pelo nível da linha, ou a cor do serviço. */
function corDaBarra(l, destacada) {
  if (destacada) {
    return AMARELO
  }

  return { erro: VERMELHO, alerta: AMARELO, sistema: CIANO }[l.nivel] ?? escurecer(l.s.cor, 0.4)
}

/**
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w
 * @param {number} h altura do conteúdo
 * @param {string} id nome do serviço ou 'todos'
 * @param {number} t agora
 */
export function vistaLog(estado, w, h, id, t) {
  const s = id === 'todos' ? null : servicoDe(estado, id)
  const v = vista(estado, id)
  const filtro = v.filtro.toLowerCase()
  const fonte = s ? s.linhas : estado.todas
  const lista = filtro ? fonte.filter(l => l.texto.toLowerCase().includes(filtro)) : fonte
  const alturaLog = h - 2
  // Não rola além do topo: a primeira linha para no alto da tela, sem deixar a tela vazia.
  v.rolagem = Math.min(v.rolagem, Math.max(0, lista.length - alturaLog))
  // Seq só cresce: menor que o da primeira linha é um request que já saiu do histórico.
  if (v.sel !== null && (!lista.length || v.sel < lista[0].seq)) {
    v.sel = null
  }

  const comando = s ? (s.tipo === 'processo' ? `$ ${s.comando}` : s.descricao) : 'saída de todos os serviços, na ordem em que chegou'
  const contagem = filtro ? `${lista.length} de ${fonte.length} linhas com “${v.filtro}”` : `${fonte.length} linhas`
  const L = [barraInfo(estado, w, s, t), juntar(` ${pinta(APAGADO, comando)}`, `${pinta(filtro ? AMARELO : APAGADO, contagem)} `, w)]

  const comNome = !s
  const larguraTexto = Math.max(10, w - larguraDaMargem(comNome) - 2)
  if (v.revelar) {
    v.revelar = false
    const idx = lista.findLastIndex(l => l.seq === v.sel)
    if (idx >= 0) {
      v.rolagem = rolagemParaVer(lista, idx, v.rolagem, alturaLog, l => (l.req ? 1 : quebrar(l.texto, larguraTexto).length))
    }
  }
  if (v.rolagem === 0) {
    v.novos = 0
  }
  const destaque = estado.destaque && t < estado.destaque.ate ? estado.destaque.seq : null
  const linhas = []
  /** A linha de log de cada linha de tela, para o clique achar o request. */
  const origens = []

  // De baixo para cima, só até encher a tela: com milhares de linhas, quebrar todas seria caro.
  for (let i = lista.length - 1 - v.rolagem; i >= 0 && linhas.length < alturaLog; i--) {
    const l = lista[i]
    const destacada = l.seq === destaque
    const barra = pinta(corDaBarra(l, destacada), destacada ? '▶' : '▎')
    const colunas = l.req ? colunasDoRequest(l, larguraTexto, t) : null
    const bloco = (colunas ? [colunas.plano] : quebrar(l.texto, larguraTexto)).map((pedaco, k) => {
      if (l.seq === v.sel) {
        return compor([[BRANCO, fatiarPlano(` ${k === 0 ? horaDe(l.t) : ' '.repeat(8)} › ${pedaco}`, 0, w - 1), true]], FUNDO_SEL)
      }
      const hora = k === 0 ? pinta(destacada ? AMARELO : APAGADO, horaDe(l.t)) : ' '.repeat(8)
      const nome = comNome ? `${k === 0 ? pinta(l.s.cor, l.s.nome.padEnd(8).slice(0, 8)) : ' '.repeat(8)} ` : ''
      const texto = filtro ? realceFiltro(pedaco, filtro) : (colunas?.pintado ?? realce(pedaco, l))

      return ` ${hora} ${nome}${barra} ${texto}`
    })
    linhas.unshift(...bloco)
    origens.unshift(...bloco.map(() => l))
  }
  while (linhas.length > alturaLog) {
    linhas.shift()
    origens.shift()
  }
  estado.regioes.log = origens.map((linha, y) => ({ y: TOPO_DO_LOG + y, linha }))

  if (!lista.length) {
    const [cor, icone] = s ? ponto(s, t) : [AZUL, spinner(t)]
    const mensagem = filtro ? `nenhuma linha com “${v.filtro}” — Esc limpa o filtro` : `aguardando a saída${s ? ` do ${s.nome}` : ''}…`
    for (let i = 0; i < Math.floor(alturaLog / 2) - 1; i++) {
      linhas.push('')
    }
    linhas.push(centralizar(`${pinta(cor, icone)} ${pinta(SUAVE, mensagem)}`, w))
  }

  // Barra de rolagem na última coluna.
  const total = lista.length
  const polegar = total > alturaLog ? Math.max(1, Math.round((alturaLog * alturaLog) / total)) : 0
  const posicao =
    total > alturaLog
      ? Math.round(((total - alturaLog - Math.min(v.rolagem, total - alturaLog)) / Math.max(1, total - alturaLog)) * (alturaLog - polegar))
      : 0
  for (let y = 0; y < alturaLog; y++) {
    const trilho = polegar && y >= posicao && y < posicao + polegar ? pinta(s?.cor ?? AZUL, '┃') : pinta([40, 46, 60], '│')
    L.push(ajustar(linhas[y] ?? '', w - 1) + trilho)
  }

  if (v.rolagem > 0) {
    const novas = v.novos ? `↓ ${v.novos} nova${v.novos === 1 ? '' : 's'} · ` : ''
    const selo = compor([[PRETO, ` ${novas}${v.rolagem} linha${v.rolagem === 1 ? '' : 's'} acima do fim · End segue o log `, true]], AMARELO)
    L[L.length - 1] = juntar(ajustar(linhas[alturaLog - 1] ?? '', w - vis(selo) - 3), `${selo}  `, w)
  }

  return L
}
