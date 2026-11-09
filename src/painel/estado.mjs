// O estado do painel num objeto só, criado a partir do plano: serviços, linhas, alertas, aba atual,
// caixa aberta… Tudo o que a tela desenha sai daqui, e tudo o que as teclas fazem muda isto aqui.
// As funções recebem o `estado` por parâmetro (nada de variável global), então dá para testá-las.
import { compilarPadroes, PADROES_PADRAO } from './classificacao.mjs'
import { AZUL, CIANO, corDe, LARANJA, VERMELHO } from './cores.mjs'

/** Quantos baldes de 2 s o gráfico de atividade de cada cartão guarda (2 minutos). */
export const BALDES_DE_ATIVIDADE = 60

/** Ids de abas que o painel usa para si; um serviço com um desses nomes ganha um sufixo. */
const RESERVADOS = ['geral', 'todos', 'alertas', 'tarefas']

/**
 * @typedef {'processo' | 'log' | 'tarefas'} TipoDeServico
 *   processo: sobe e é supervisionado; log: arquivo vigiado (plano.logs); tarefas: saída das ações
 */

/**
 * @typedef {object} Linha uma linha de log já limpa
 * @property {number} seq      número único e crescente (é como um alerta acha a sua linha)
 * @property {number} t        quando chegou (ms)
 * @property {string} texto
 * @property {import('./classificacao.mjs').Nivel} nivel
 * @property {Servico} s       de quem é a linha
 */

/**
 * @typedef {object} Servico uma aba do painel (processo, arquivo de log ou tarefas)
 * @property {string} nome
 * @property {TipoDeServico} tipo
 * @property {string} estado   chave de ESTADOS (tela/pecas.mjs): subindo, online, caiu…
 * @property {Linha[]} linhas
 * @property {Record<string, any>} metricas
 */

/**
 * Um serviço com todos os campos zerados; `extra` sobrescreve o que vier.
 *
 * @param {string} nome
 * @param {Partial<Servico> & Record<string, any>} [extra]
 * @returns {Servico & Record<string, any>}
 */
export function criarServico(nome, extra = {}) {
  return {
    nome,
    tipo: 'processo',
    comando: '',
    cwd: null,
    cor: AZUL,
    descricao: nome,
    url: null,
    porta: null,
    saude: null,
    padroes: PADROES_PADRAO,
    metrica: null,
    detalhesDeRequest: null,
    log: null,
    estado: 'parado',
    detalhe: null,
    filho: null,
    pid: null,
    inicio: 0,
    reinicios: 0,
    tentativas: 0,
    parando: false,
    reiniciarDepois: false,
    timer: null,
    retomarEm: 0,
    linhas: [],
    ultima: null,
    erros: 0,
    avisos: 0,
    naoVistos: 0,
    atividade: new Array(BALDES_DE_ATIVIDADE).fill(0),
    balde: 0,
    mem: null,
    latencia: null,
    falhasSaude: 0,
    proximaChecagem: 0,
    checando: false,
    metricas: {},
    ...extra,
  }
}

/**
 * Preenche o que faltar no plano; o painel nunca precisa testar se uma lista existe.
 *
 * @param {Partial<import('../plano/tipos.mjs').Plano>} bruto
 * @returns {import('../plano/tipos.mjs').Plano}
 */
export function normalizarPlano(bruto = {}) {
  return {
    env: {},
    reiniciar: true,
    processos: [],
    logs: [],
    ambiente: [],
    acoes: [],
    alvos: [],
    ...bruto,
    projeto: { nome: 'projeto', slogan: '', logo: null, raiz: process.cwd(), ...bruto.projeto },
  }
}

/**
 * Sem alvos no plano, o comando livre roda na raiz do projeto (melhor que não ter `:`).
 *
 * @param {import('../plano/tipos.mjs').Plano} plano
 * @returns {import('../plano/tipos.mjs').AlvoDoPlano[]}
 */
export function alvosDo(plano) {
  const alvos = plano.alvos.length ? plano.alvos : [{ nome: 'projeto', cwd: plano.projeto.raiz, exemplo: '', atalho: null, servicos: [] }]

  return alvos.map(alvo => ({
    exemplo: '',
    atalho: null,
    servicos: [],
    ...alvo,
    cwd: alvo.cwd ?? plano.projeto.raiz,
    cor: corDe(alvo.cor, AZUL),
  }))
}

/**
 * @param {Partial<import('../plano/tipos.mjs').Plano>} bruto
 * @param {{ agora?: number }} [opcoes]
 */
export function criarEstado(bruto, { agora = Date.now() } = {}) {
  const plano = normalizarPlano(bruto)
  const usados = new Set(RESERVADOS)
  const nomeUnico = nome => {
    let unico = nome
    for (let n = 2; usados.has(unico); n++) {
      unico = `${nome}-${n}`
    }
    usados.add(unico)

    return unico
  }

  const servicos = [
    ...plano.processos.map(p =>
      criarServico(nomeUnico(p.nome), {
        tipo: 'processo',
        comando: p.comando,
        cwd: p.cwd ?? plano.projeto.raiz,
        cor: corDe(p.cor, AZUL),
        descricao: p.descricao || p.nome,
        url: p.url ?? null,
        porta: p.porta ?? null,
        saude: p.saude ?? null,
        padroes: compilarPadroes(p.padroes),
        metrica: p.metrica ?? null,
        detalhesDeRequest: p.detalhesDeRequest ?? null,
      }),
    ),
    ...plano.logs.map(l =>
      criarServico(nomeUnico(l.nome), {
        tipo: 'log',
        cor: corDe(l.cor, LARANJA),
        descricao: l.descricao || l.nome,
        log: l,
      }),
    ),
    criarServico('tarefas', {
      tipo: 'tarefas',
      estado: 'ocioso',
      cor: CIANO,
      descricao: 'Ações rápidas e comandos rodados pelo painel',
    }),
  ]

  return {
    plano,
    servicos,
    /** Todas as linhas de todos os serviços, na ordem de chegada (aba "Todos"). */
    todas: [],
    alertas: [],
    alertasNaoVistos: 0,
    selAlerta: null,
    selCard: 0,
    /** Na visão geral, ←→ andam pelos cartões (true) ou pelas abas (false). */
    focoNosCartoes: false,
    abaId: 'geral',
    /** Rolagem, contador de novas, filtro e request escolhido de cada aba de log. */
    vistas: {},
    /** Tela de detalhes do request aberto (requests.mjs); ocupa o conteúdo da aba dele. */
    detalheRequest: null,
    /** Digitando o filtro (`/`). */
    digitando: false,
    /** Caixa aberta por cima da tela: 'ajuda' | 'acoes' | 'comando' | 'encerrando' | null. */
    overlay: null,
    selAcao: 0,
    alvos: alvosDo(plano),
    cmd: { alvo: 0, texto: '', hist: [], pos: -1, rascunho: '' },
    toast: null,
    destaque: null,
    inicio: agora,
    seq: 0,
    mouse: false,
    splashAte: 0,
    encerrando: false,
    painel: false,
    inline: false,
    /** Processos das ações e comandos livres em andamento. */
    tarefas: new Set(),
    /** Onde cada aba, cartão, alerta e linha de log foi desenhado, para o clique do mouse achar o alvo. */
    regioes: { abas: [], cards: [], alertas: [], log: [], secoes: [] },
    /** Chamado a cada linha registrada (o modo inline escreve a linha aqui). */
    aoRegistrar: null,
  }
}

/** @typedef {ReturnType<typeof criarEstado>} Estado */

/** Só os serviços que sobem processo (sem os logs e as tarefas). */
export const processos = estado => estado.servicos.filter(s => s.tipo === 'processo')

/** Serviços com aba: a de tarefas só aparece depois que algo rodou. */
export const visiveis = estado => estado.servicos.filter(s => s.tipo !== 'tarefas' || s.linhas.length > 0)

export const tarefasDe = estado => estado.servicos.find(s => s.tipo === 'tarefas')

export const servicoDe = (estado, id) => estado.servicos.find(s => s.nome === id) ?? null

/**
 * Uma aba de log: rolagem (0 = seguindo o fim), linhas novas desde que parou de seguir, filtro, `seq`
 * do request escolhido e `revelar` (o próximo desenho rola até deixar o escolhido visível).
 */
export const vista = (estado, id) => (estado.vistas[id] ??= { rolagem: 0, novos: 0, filtro: '', sel: null, revelar: false })

/** A linha passa no filtro (sem diferenciar maiúsculas)? */
export const casa = (linha, filtro) => !filtro || linha.texto.toLowerCase().includes(filtro.toLowerCase())

/** As abas na ordem da barra: visão geral, todos, um por serviço, alertas. */
export function abas(estado) {
  return [
    { id: 'geral', titulo: 'Visão geral', cor: LARANJA, icone: '◈' },
    { id: 'todos', titulo: 'Todos', cor: AZUL, icone: '≡' },
    ...visiveis(estado).map(s => ({ id: s.nome, titulo: s.nome, cor: s.cor, servico: s })),
    { id: 'alertas', titulo: 'Alertas', cor: VERMELHO, icone: '▲' },
  ]
}

/** A aba escolhida, ou a visão geral se ela sumiu (ex.: a de tarefas depois de limpar). */
export const abaAtual = estado => (abas(estado).some(a => a.id === estado.abaId) ? estado.abaId : 'geral')

/** O dev está navegando entre os cartões da visão geral (e não entre as abas)? */
export const nosCartoes = estado => estado.focoNosCartoes && abaAtual(estado) === 'geral'

/** Vai para a aba, devolve o foco à barra de abas e zera o contador de não vistos dela. */
export function irPara(estado, id) {
  if (!id) {
    return
  }
  estado.abaId = id
  estado.digitando = false
  estado.focoNosCartoes = false
  estado.detalheRequest = null
  const s = servicoDe(estado, id)
  if (s) {
    s.naoVistos = 0
  }
  if (id === 'alertas') {
    estado.alertasNaoVistos = 0
  }
}

/** Próxima (+1) ou anterior (-1) aba, dando a volta nas pontas. */
export function trocarAba(estado, passo) {
  const lista = abas(estado)
  const i = lista.findIndex(a => a.id === abaAtual(estado))
  irPara(estado, lista[(i + passo + lista.length) % lista.length].id)
}

/** Próximo (+1) ou anterior (-1) cartão da visão geral, dando a volta nas pontas. */
export function moverCartao(estado, passo) {
  const total = visiveis(estado).length
  if (total) {
    estado.selCard = (estado.selCard + passo + total) % total
  }
}

/**
 * Mensagem passageira na linha acima do rodapé.
 *
 * @param {Estado} estado
 * @param {string} texto
 * @param {'info' | 'ok' | 'erro'} [nivel]
 * @param {number} [ms]
 */
export function mostrarToast(estado, texto, nivel = 'info', ms = 4500, agora = Date.now()) {
  estado.toast = { texto, nivel, ate: agora + ms }
}

/**
 * Leva à linha do alerta no log do serviço, com ela a um terço da tela e destacada por 4 s.
 *
 * @param {Estado} estado
 * @param {{ s: Servico, seq: number }} alerta
 * @param {number} alturaDoLog linhas visíveis do log
 */
export function verNoLog(estado, alerta, alturaDoLog, agora = Date.now()) {
  const idx = alerta.s.linhas.findIndex(l => l.seq === alerta.seq)
  if (idx < 0) {
    return mostrarToast(estado, 'essa linha já saiu do histórico do log', 'info', 4500, agora)
  }
  irPara(estado, alerta.s.nome)
  const v = vista(estado, alerta.s.nome)
  v.filtro = ''
  v.rolagem = Math.max(0, alerta.s.linhas.length - 1 - idx - Math.floor(alturaDoLog / 3))
  v.novos = 0
  estado.destaque = { seq: alerta.seq, ate: agora + 4000 }
}
