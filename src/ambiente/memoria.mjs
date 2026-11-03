// Memória por serviço: soma a RAM de cada processo com a de toda a sua árvore de filhos (o
// `php artisan serve` e o `npm run dev` sobem outros processos, e é neles que a memória de fato está).
// No Windows mantém um PowerShell vivo, porque abrir um por amostra custa ~1 s; fora dele usa o `ps`.
import { spawn as spawnPadrao } from 'node:child_process'
import { executar as executarPadrao } from './executar.mjs'

/** @typedef {{ pid: number, ppid: number, bytes: number }} Amostra */

/** Marca o fim de cada resposta do PowerShell, que fica vivo e responde várias consultas. */
export const FIM_DA_AMOSTRA = '@@FIM@@'

const CONSULTA_DO_WINDOWS =
  'Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize | ' +
  `ForEach-Object { "$($_.ProcessId),$($_.ParentProcessId),$($_.WorkingSetSize)" }; '${FIM_DA_AMOSTRA}'\n`

/**
 * Lê linhas "pid,ppid,bytes" (PowerShell) ou "pid ppid rss" (`ps`, rss em KB: use fator 1024).
 * Linhas que não são três números são ignoradas (cabeçalhos, avisos).
 *
 * @param {string} texto
 * @param {number} [fator] multiplica a terceira coluna para chegar em bytes
 * @returns {Amostra[]}
 */
export function lerAmostras(texto, fator = 1) {
  return texto
    .split(/\r?\n/)
    .map(linha => linha.trim().split(/[,\s]+/).map(Number))
    .filter(colunas => colunas.length === 3 && colunas.every(Number.isFinite))
    .map(([pid, ppid, bytes]) => ({ pid, ppid, bytes: bytes * fator }))
}

/**
 * Memória de cada PID pedido somada à de todos os descendentes.
 *
 * @param {Amostra[]} amostras
 * @param {number[]} pids
 * @returns {Map<number, number>} pid → bytes (PIDs que não somaram nada ficam de fora)
 */
export function memoriaPorArvore(amostras, pids) {
  const filhos = new Map()
  const bytes = new Map()

  for (const amostra of amostras) {
    bytes.set(amostra.pid, amostra.bytes)
    filhos.set(amostra.ppid, [...(filhos.get(amostra.ppid) ?? []), amostra.pid])
  }

  const resultado = new Map()
  for (const raiz of pids) {
    let total = 0
    const fila = [raiz]
    // O PID 0 (System Idle no Windows) é pai de si mesmo: sem `vistos` o laço não terminaria.
    const vistos = new Set()
    while (fila.length) {
      const pid = fila.pop()
      if (vistos.has(pid)) {
        continue
      }
      vistos.add(pid)
      total += bytes.get(pid) ?? 0
      fila.push(...(filhos.get(pid) ?? []))
    }
    if (total) {
      resultado.set(raiz, total)
    }
  }

  return resultado
}

/**
 * Junta os pedaços que chegam do stdout do PowerShell e entrega cada resposta completa (tudo até
 * a marca de fim) a `aoCompletar`.
 *
 * @param {(texto: string) => void} aoCompletar
 * @returns {(pedaco: string) => void}
 */
export function criarLeitorDeRespostas(aoCompletar) {
  let acumulado = ''

  return pedaco => {
    acumulado += pedaco
    for (let fim = acumulado.indexOf(FIM_DA_AMOSTRA); fim >= 0; fim = acumulado.indexOf(FIM_DA_AMOSTRA)) {
      aoCompletar(acumulado.slice(0, fim))
      acumulado = acumulado.slice(fim + FIM_DA_AMOSTRA.length)
    }
  }
}

/**
 * Tira uma amostra da memória de todos os processos a cada `intervalo` ms.
 *
 * @param {(amostras: Amostra[]) => void} aoMedir
 * @param {object} [opcoes]
 * @param {NodeJS.Platform} [opcoes.plataforma]
 * @param {import('./executar.mjs').Executor} [opcoes.executar]   usado fora do Windows (`ps`)
 * @param {typeof spawnPadrao} [opcoes.criarProcesso]             usado no Windows (PowerShell vivo)
 * @param {number} [opcoes.intervalo]
 * @param {number} [opcoes.atraso]  espera da primeira amostra (os serviços ainda estão subindo)
 * @returns {{ parar(): void }}
 */
export function criarMedidor(aoMedir, opcoes = {}) {
  const {
    plataforma = process.platform,
    executar = executarPadrao,
    criarProcesso = spawnPadrao,
    intervalo = 5000,
    atraso = 1500,
  } = opcoes

  if (plataforma !== 'win32') {
    const medir = async () => {
      const { ok, saida } = await executar('ps', ['-axo', 'pid=,ppid=,rss='])
      if (ok) {
        aoMedir(lerAmostras(saida, 1024))
      }
    }
    const primeira = setTimeout(medir, atraso)
    const relogio = setInterval(medir, intervalo)

    return {
      parar() {
        clearTimeout(primeira)
        clearInterval(relogio)
      },
    }
  }

  const ps = criarProcesso('powershell', ['-NoProfile', '-NonInteractive', '-Command', '-'], {
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
  })
  let pendente = false
  ps.on('error', () => {})
  ps.stdin.on('error', () => {})
  ps.stdout.setEncoding('utf8')
  ps.stdout.on(
    'data',
    criarLeitorDeRespostas(texto => {
      pendente = false
      aoMedir(lerAmostras(texto))
    }),
  )
  ps.stdin.write("$ProgressPreference='SilentlyContinue'\n")

  // Uma consulta por vez: se o PowerShell atrasar, não empilha pedidos.
  const pedir = () => {
    if (!pendente && ps.stdin.writable) {
      pendente = true
      ps.stdin.write(CONSULTA_DO_WINDOWS)
    }
  }
  const primeira = setTimeout(pedir, atraso)
  const relogio = setInterval(pedir, intervalo)

  return {
    parar() {
      clearTimeout(primeira)
      clearInterval(relogio)
      try {
        ps.stdin.end()
        ps.kill()
      } catch {}
    },
  }
}
