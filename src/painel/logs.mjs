// Linhas de log: guardar (com limite), contar atividade, transformar erro/aviso em alerta e quebrar
// a saída crua de um processo em linhas. Os buffers são limitados para o painel não crescer sem fim
// num `dev` que fica aberto o dia inteiro.
import { classificar } from './classificacao.mjs'
import { abaAtual, casa, mostrarToast, vista } from './estado.mjs'
import { horaDe } from './formato.mjs'
import { analisar, lerRequisicao } from './metricas.mjs'
import { limpar } from './texto.mjs'

export const MAX_LINHAS = 4000
export const MAX_TODAS = 8000
export const MAX_ALERTAS = 500
/** Os buffers são cortados em blocos: um `splice` a cada linha nova seria caro. */
const FOLGA = 500
/** Uma linha sem quebra maior que isso é entregue assim mesmo (ex.: um JSON gigante num log). */
const MAX_PENDENTE = 8000
const MAX_TEXTO = 4000
/** Alertas iguais (números trocados por #) dentro desta janela viram um só, com "×N". */
const JANELA_DE_REPETICAO = 60_000

/**
 * Avança o gráfico de atividade do serviço (baldes de 2 s): ele anda mesmo sem linhas novas.
 *
 * @param {import('./estado.mjs').Servico & Record<string, any>} s
 */
export function avancar(s, agora = Date.now()) {
  const balde = Math.floor(agora / 2000)
  const passos = s.balde ? Math.min(balde - s.balde, s.atividade.length) : 0
  for (let i = 0; i < passos; i++) {
    s.atividade.shift()
    s.atividade.push(0)
  }
  s.balde = balde
}

/**
 * Guarda uma linha no serviço e na aba "Todos"; erro e aviso viram alerta.
 *
 * @param {import('./estado.mjs').Estado} estado
 * @param {import('./estado.mjs').Servico & Record<string, any>} s
 * @param {string} texto
 * @param {import('./classificacao.mjs').Nivel} [nivel]
 * @param {{ antigo?: boolean, alerta?: string | null, agora?: number, req?: { caminho: string, ms: number } | null }} [opcoes]
 *   antigo: histórico lido ao abrir um arquivo de log (não alerta); alerta: texto do alerta, se
 *   diferente da linha; req: a linha é um request que dá para escolher e detalhar
 * @returns {import('./estado.mjs').Linha}
 */
export function registrar(estado, s, texto, nivel = null, { antigo = false, alerta = null, agora = Date.now(), req = null } = {}) {
  const linha = { seq: ++estado.seq, t: agora, texto, nivel, s }
  if (req) {
    linha.req = req
  }
  s.linhas.push(linha)
  if (s.linhas.length > MAX_LINHAS + FOLGA) {
    s.linhas.splice(0, FOLGA)
  }
  estado.todas.push(linha)
  if (estado.todas.length > MAX_TODAS + FOLGA) {
    estado.todas.splice(0, FOLGA)
  }
  s.ultima = linha
  avancar(s, agora)
  s.atividade[s.atividade.length - 1]++

  // Quem está lendo lá em cima, ou com um request escolhido, continua no mesmo ponto; o selo conta
  // as linhas novas.
  for (const id of [s.nome, 'todos']) {
    const v = estado.vistas[id]
    if ((v?.rolagem > 0 || v?.sel != null) && casa(linha, v.filtro)) {
      v.rolagem++
      v.novos++
    }
  }

  estado.aoRegistrar?.(s, linha)
  if (!antigo && (nivel === 'erro' || nivel === 'alerta')) {
    alertar(estado, s, nivel, alerta ?? texto, linha.seq, agora)
  }

  return linha
}

/**
 * Registra um alerta, juntando os repetidos do último minuto.
 *
 * @param {import('./estado.mjs').Estado} estado
 * @param {import('./estado.mjs').Servico & Record<string, any>} s
 * @param {'erro' | 'alerta'} nivel
 * @param {string} texto
 * @param {number} seq linha do log que gerou o alerta
 */
export function alertar(estado, s, nivel, texto, seq, agora = Date.now()) {
  nivel === 'erro' ? s.erros++ : s.avisos++
  const chave = `${s.nome}|${nivel}|${texto.replace(/\d+/g, '#').slice(0, 160)}`
  const repetido = estado.alertas.slice(-40).findLast(a => a.chave === chave && agora - a.t < JANELA_DE_REPETICAO)

  if (repetido) {
    repetido.vezes++
    repetido.t = agora
    repetido.seq = seq
  } else {
    estado.alertas.push({ chave, s, nivel, texto, seq, t: agora, vezes: 1 })
    if (estado.alertas.length > MAX_ALERTAS) {
      estado.alertas.shift()
    }
  }

  // Contadores e toast só fazem sentido com o painel na tela (no inline a linha já foi impressa).
  if (!estado.painel) {
    return
  }
  if (abaAtual(estado) !== 'alertas') {
    estado.alertasNaoVistos++
  }
  if (nivel === 'erro' && abaAtual(estado) !== s.nome) {
    s.naoVistos++
    mostrarToast(estado, `${s.nome}: ${texto}`, 'erro', 4500, agora)
  }
}

/**
 * Uma linha crua da saída do processo: limpa, tira o carimbo de data (a hora já aparece na margem),
 * atualiza as métricas e registra com o nível que as regex do serviço derem.
 *
 * @param {import('./estado.mjs').Estado} estado
 * @param {import('./estado.mjs').Servico & Record<string, any>} s
 * @param {string} bruta
 */
export function linhaDoProcesso(estado, s, bruta, agora = Date.now()) {
  let texto = bruta.replace(/\r$/, '')
  // Barras de progresso reescrevem a linha com \r: só o último estado interessa.
  if (texto.includes('\r')) {
    texto = texto.slice(texto.lastIndexOf('\r') + 1)
  }
  texto = limpar(texto)
    .replace(/^ {2}/, '')
    .replace(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\s+/, '')
    .trimEnd()
  if (!texto.trim() || analisar(s, texto, agora) === false) {
    return
  }
  const req = s.detalhesDeRequest ? lerRequisicao(texto) : null
  registrar(estado, s, texto.slice(0, MAX_TEXTO), classificar(texto, s.padroes), { agora, req })
}

/**
 * Lê um stream de texto e entrega linha a linha (a última, sem \n, só no fim do stream).
 *
 * @param {import('node:stream').Readable} stream
 * @param {(linha: string) => void} aoLer
 */
export function lerFluxo(stream, aoLer) {
  let resto = ''
  stream.setEncoding('utf8')
  stream.on('data', pedaco => {
    const partes = (resto + pedaco).split('\n')
    resto = partes.pop()
    for (const parte of partes) {
      aoLer(parte)
    }
    if (resto.length > MAX_PENDENTE) {
      aoLer(resto)
      resto = ''
    }
  })
  stream.on('end', () => resto && aoLer(resto))
}

/** Esvazia o log de um serviço (e as linhas dele na aba "Todos"). */
export function limparLog(estado, s) {
  s.linhas = []
  s.ultima = null
  estado.todas = estado.todas.filter(l => l.s !== s)
  vista(estado, s.nome).rolagem = 0
  vista(estado, s.nome).sel = null
}

/** Esvazia todos os logs. */
export function limparTodos(estado) {
  for (const s of estado.servicos) {
    s.linhas = []
    s.ultima = null
    vista(estado, s.nome).sel = null
  }
  estado.todas = []
  vista(estado, 'todos').rolagem = 0
}

/**
 * Total de erros e de avisos, somando as repetições ("×N").
 *
 * @param {{ nivel: string, vezes: number }[]} alertas
 */
export function contarAlertas(alertas) {
  const soma = nivel => alertas.filter(a => a.nivel === nivel).reduce((n, a) => n + a.vezes, 0)

  return { erros: soma('erro'), avisos: soma('alerta') }
}

/** Esvazia a lista de alertas e os contadores de não vistos. */
export function limparAlertas(estado) {
  estado.alertas = []
  estado.selAlerta = null
  estado.alertasNaoVistos = 0
  for (const s of estado.servicos) {
    s.naoVistos = 0
  }
}

/**
 * O alerta como texto para colar num chat ou issue: a linha e as vizinhas no log.
 *
 * @param {{ s: any, seq: number, t: number, texto: string, vezes: number }} alerta
 */
export function textoDoAlerta(alerta) {
  const idx = alerta.s.linhas.findIndex(l => l.seq === alerta.seq)
  const contexto = idx >= 0 ? alerta.s.linhas.slice(Math.max(0, idx - 3), idx + 6).map(l => `${horaDe(l.t)} ${l.texto}`) : []
  const cabecalho = `[${alerta.s.nome}] ${horaDe(alerta.t)} ${alerta.texto}${alerta.vezes > 1 ? ` (×${alerta.vezes})` : ''}`

  return [cabecalho, ...(contexto.length ? ['', ...contexto] : [])].join('\n')
}

/**
 * As linhas que estão na tela de uma aba de log (respeitando filtro e rolagem), como texto.
 *
 * @param {import('./estado.mjs').Estado} estado
 * @param {(import('./estado.mjs').Servico & Record<string, any>) | null} s null = aba "Todos"
 * @param {number} altura linhas visíveis do log
 * @returns {{ texto: string, quantidade: number }}
 */
export function linhasVisiveis(estado, s, altura) {
  const v = vista(estado, s ? s.nome : 'todos')
  const fonte = s ? s.linhas : estado.todas
  const lista = v.filtro ? fonte.filter(l => casa(l, v.filtro)) : fonte
  const fim = lista.length - v.rolagem
  const linhas = lista.slice(Math.max(0, fim - altura), Math.max(0, fim))

  return {
    texto: linhas.map(l => `${horaDe(l.t)} ${s ? '' : `[${l.s.nome}] `}${l.texto}`).join('\n'),
    quantidade: linhas.length,
  }
}
