// Números tirados da saída de cada processo para o cartão: req/min, jobs, HMR… O plano diz o que
// contar em cada serviço (`metrica`); o formato das linhas é o que a ferramenta daquela stack escreve
// (`php artisan serve`, `queue:work`, Vite). Serviço sem `metrica` só mostra quantas linhas tem.

/** Limite das requisições guardadas para a média (as de mais de 1 min já não entram na conta). */
export const MAX_REQUISICOES = 400

const RE_CTRL_C = /Press Ctrl\+C to (?:stop|quit)/i
/** `/rota ........ ~ 12.5ms` do `php artisan serve` (o carimbo de data já saiu antes daqui). */
const RE_REQUISICAO = /^\s*(?:\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\s+)?(\/\S*).*?~\s*([\d.]+)\s*(ms|s)\s*$/
/** `App\Jobs\EnviarEmail ........ RUNNING | DONE | FAIL` do worker de filas do Laravel. */
const RE_JOB = /^\s*(?:\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\s+)?(\S+).*\b(RUNNING|DONE|FAIL)\s*$/

const escapar = texto => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const linhasDeSaude = new WeakMap()

/** Regex que reconhece, no log do servidor, as requisições que o próprio painel faz à URL de saúde. */
function reDaSaude(s) {
  if (!linhasDeSaude.has(s)) {
    let re = null
    if (s.saude?.tipo === 'http' && s.saude.url) {
      try {
        re = new RegExp(`(?:^|\\s)${escapar(new URL(s.saude.url).pathname)}(?=[\\s?]|$)`)
      } catch {}
    }
    linhasDeSaude.set(s, re)
  }

  return linhasDeSaude.get(s)
}

/** Cada tipo de métrica: lê a linha, atualiza `s.metricas` e devolve false para descartar a linha. */
const ANALISADORES = {
  requisicoes(s, texto, agora) {
    // O painel bate na URL de saúde a cada 5 s: essas linhas só poluiriam o log e a média.
    if (/~/.test(texto) && reDaSaude(s)?.test(texto)) {
      return false
    }
    const r = RE_REQUISICAO.exec(texto)
    if (r) {
      const m = s.metricas
      m.reqs ??= []
      m.reqs.push({ t: agora, ms: r[3] === 's' ? Number(r[2]) * 1000 : Number(r[2]) })
      if (m.reqs.length > MAX_REQUISICOES) {
        m.reqs.splice(0, 100)
      }
      m.total = (m.total ?? 0) + 1
    }
  },

  jobs(s, texto) {
    const r = RE_JOB.exec(texto)
    if (!r) {
      return
    }
    const m = s.metricas
    if (r[2] === 'RUNNING') {
      m.rodando = r[1].split('\\').pop()
    } else {
      m.rodando = null
      r[2] === 'DONE' ? (m.feitos = (m.feitos ?? 0) + 1) : (m.falhas = (m.falhas ?? 0) + 1)
    }
  },

  /** Agendador: cada tarefa terminada (DONE/FAIL) conta uma execução. */
  execucoes(s, texto) {
    if (/\b(?:DONE|FAIL)\s*$/.test(texto)) {
      s.metricas.execucoes = (s.metricas.execucoes ?? 0) + 1
    }
  },

  /** Servidor de desenvolvimento do front (Vite e afins): recargas e tempo de partida. */
  hmr(s, texto) {
    const m = s.metricas
    if (/hmr update|page reload/i.test(texto)) {
      m.hmr = (m.hmr ?? 0) + 1
    }
    const pronto = /ready in\s*([\d.]+)\s*ms/i.exec(texto)
    if (pronto) {
      m.pronto = Number(pronto[1])
    }
  },
}

/** Tipos de métrica que o painel sabe contar. */
export const TIPOS_DE_METRICA = Object.keys(ANALISADORES)

/**
 * Atualiza as métricas do serviço com a linha.
 *
 * @param {import('./estado.mjs').Servico & Record<string, any>} s
 * @param {string} texto linha já limpa
 * @returns {boolean} false = a linha não deve aparecer no log
 */
export function analisar(s, texto, agora = Date.now()) {
  if (RE_CTRL_C.test(texto)) {
    return false
  }

  return ANALISADORES[s.metrica]?.(s, texto, agora) !== false
}

/**
 * Requisições do último minuto e a média de tempo delas (null sem nenhuma).
 *
 * @param {Record<string, any>} metricas
 * @returns {{ porMinuto: number, media: number | null }}
 */
export function resumoDeRequisicoes(metricas, agora = Date.now()) {
  const recentes = (metricas.reqs ?? []).filter(r => agora - r.t < 60_000)

  return {
    porMinuto: recentes.length,
    media: recentes.length ? recentes.reduce((soma, r) => soma + r.ms, 0) / recentes.length : null,
  }
}
