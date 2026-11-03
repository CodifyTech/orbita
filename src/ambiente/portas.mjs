// Portas do ambiente local: quem está usando, qual a próxima livre e esperar liberar.
// Porta do `Portas.php` do FoodOS; o que é de processo (encerrar, sessão do dev) está em processos.mjs.
import { connect } from 'node:net'
import { basename } from 'node:path'
import { pausa } from '../pausa.mjs'
import { executar as executarPadrao } from './executar.mjs'
import { lerLsof, lerNetstat, lerNetTcpConnection, lerSs } from './leitores-do-sistema.mjs'
import { nomeDoProcesso } from './processos.mjs'

/** Processos que costumam ser sobra de outro `dev` (servidor, Vite…) e podem ser encerrados. */
const ENCERRAVEIS = ['php', 'node', 'bun']

const LIMITE_DA_BUSCA = 50

/**
 * @typedef {object} Dono
 * @property {number} pid
 * @property {string} nome
 * @property {string} dica        explicação para o dev do que provavelmente é aquele processo
 * @property {boolean} encerravel se o Órbita pode oferecer encerrá-lo
 */

/**
 * A porta responde em 127.0.0.1 ou em ::1? Testa os dois: o Vite no Windows escuta só no IPv6.
 *
 * @param {number} numero
 * @param {number} [timeout] ms de espera por endereço
 * @returns {Promise<boolean>}
 */
export async function emUso(numero, timeout = 200) {
  const respostas = await Promise.all(['127.0.0.1', '::1'].map(host => responde(host, numero, timeout)))

  return respostas.some(Boolean)
}

const responde = (host, port, timeout) =>
  new Promise(resolve => {
    const conexao = connect({ host, port, timeout })
    const terminar = resultado => {
      conexao.destroy()
      resolve(resultado)
    }

    conexao.once('connect', () => terminar(true))
    conexao.once('timeout', () => terminar(false))
    conexao.once('error', () => terminar(false))
  })

/**
 * Primeira porta livre depois de `numero` (até 50 acima), pulando as já escolhidas para outros serviços.
 *
 * @param {number} numero
 * @param {number[]} [reservadas]
 * @returns {Promise<number | null>} null se não há nenhuma livre
 */
export async function proximaLivre(numero, reservadas = []) {
  for (let candidata = numero + 1; candidata <= numero + LIMITE_DA_BUSCA; candidata++) {
    if (!reservadas.includes(candidata) && !(await emUso(candidata))) {
      return candidata
    }
  }

  return null
}

/**
 * Portas em escuta na máquina numa chamada só (testar porta a porta é lento no Windows, onde
 * conectar numa porta fechada de localhost leva centenas de ms).
 *
 * @param {{ executar?: import('./executar.mjs').Executor, plataforma?: NodeJS.Platform }} [opcoes]
 * @returns {Promise<Map<number, number>>} porta → PID
 */
export async function escutando({ executar = executarPadrao, plataforma = process.platform } = {}) {
  if (plataforma === 'win32') {
    const doPowerShell = lerNetTcpConnection(
      (
        await executar('powershell', [
          '-NoProfile',
          '-Command',
          'Get-NetTCPConnection | Where-Object { $_.RemotePort -eq 0 } | ' +
            'Select-Object LocalPort,OwningProcess,RemoteAddress,RemotePort | ConvertTo-Json -Compress',
        ])
      ).saida,
    )

    return doPowerShell.size ? doPowerShell : escutandoPeloNetstat(executar)
  }

  const lsof = await executar('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'])

  if (lsof.ok) {
    return lerLsof(lsof.saida)
  }

  return lerSs((await executar('ss', ['-ltnpH'])).saida)
}

/** Fallback do Windows quando o PowerShell não responde: TCP (IPv4) e TCPv6 em duas chamadas. */
async function escutandoPeloNetstat(executar) {
  const [v4, v6] = await Promise.all([
    executar('netstat', ['-ano', '-p', 'TCP']),
    executar('netstat', ['-ano', '-p', 'TCPv6']),
  ])

  return new Map([...lerNetstat(v6.saida), ...lerNetstat(v4.saida)])
}

/**
 * Quem está escutando na porta, ou null se ninguém (ou se não deu para descobrir).
 *
 * @param {number} numero
 * @param {{ executar?: import('./executar.mjs').Executor, plataforma?: NodeJS.Platform }} [opcoes]
 * @returns {Promise<Dono | null>}
 */
export async function dono(numero, opcoes = {}) {
  const pid = (await escutando(opcoes)).get(numero)

  return pid === undefined ? null : identificar(pid, await nomeDoProcesso(pid, opcoes))
}

/**
 * @param {number} pid
 * @param {string | null} nome nome do executável, como o sistema informa
 * @returns {Dono}
 */
export function identificar(pid, nome) {
  const base = basename((nome ?? '').toLowerCase(), '.exe')

  return { pid, nome: nome || `PID ${pid}`, dica: dica(base), encerravel: ENCERRAVEIS.includes(base) }
}

/** "node.exe (PID 123)" ou "outro processo". */
export const descrever = dono => (dono ? `${dono.nome} (PID ${dono.pid})` : 'outro processo')

/** Espera a porta liberar depois de encerrar o processo (o sistema demora um instante). */
export async function aguardarLiberar(numero, tentativas = 15, intervalo = 200) {
  for (let i = 0; i < tentativas; i++) {
    if (!(await emUso(numero))) {
      return true
    }
    await pausa(intervalo)
  }

  return false
}

function dica(nome) {
  if (nome === 'wslrelay') {
    return 'porta encaminhada do WSL: algo rodando no WSL (outro `dev`, o Reverb…) usa essa porta'
  }
  if (nome === 'php') {
    return 'provavelmente outro `php artisan serve`/`reverb:start` aberto ou que ficou para trás'
  }
  if (nome === 'node' || nome === 'bun') {
    return 'provavelmente outro servidor de desenvolvimento (Vite, Nuxt…) aberto ou que ficou para trás'
  }
  if (nome.includes('docker') || nome === 'vpnkit') {
    return 'um container Docker publicou essa porta'
  }

  return 'outro programa da máquina'
}
