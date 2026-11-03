// Saúde de cada serviço: uma consulta HTTP (GET na URL de saúde) ou TCP (conectar na porta), com a
// latência, e a transição de estado que o resultado provoca (subindo → no ar → sem resposta → no ar).
import http from 'node:http'
import https from 'node:https'
import { connect } from 'node:net'
import { duracao } from './formato.mjs'

/** @typedef {{ status: number, ms: number } | null} Resposta  null = não respondeu */

/** Com o serviço no ar a checagem espaça; subindo ou instável ela fica mais frequente. */
export const INTERVALO_NO_AR = 5000
export const INTERVALO_SUBINDO = 1500
/** Falhas seguidas até um serviço no ar virar "sem resposta" (uma só pode ser um GC demorado). */
export const FALHAS_PARA_INSTAVEL = 2

/**
 * GET na URL, sem seguir redirecionamento. Status < 500 conta como no ar (um 404 ou 401 ainda prova
 * que o servidor está de pé). HTTPS aceita certificado de desenvolvimento.
 *
 * @param {string} url
 * @returns {Promise<Resposta>}
 */
export function consultarHttp(url, { timeout = 2500 } = {}) {
  return new Promise(resolve => {
    const inicio = performance.now()
    const cliente = url.startsWith('https:') ? https : http
    let req
    try {
      req = cliente.get(url, { timeout, rejectUnauthorized: false, headers: { 'user-agent': 'codify-orbita' } }, res => {
        res.resume()
        resolve({ status: res.statusCode ?? 0, ms: performance.now() - inicio })
      })
    } catch {
      return resolve(null)
    }
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', () => resolve(null))
  })
}

/** Uma tentativa de conexão TCP num endereço. */
function conectar(host, porta, timeout) {
  return new Promise(resolve => {
    const inicio = performance.now()
    const conexao = connect({ port: porta, host })
    const terminar = resposta => {
      conexao.destroy()
      resolve(resposta)
    }
    conexao.setTimeout(timeout)
    conexao.once('connect', () => terminar({ status: 0, ms: performance.now() - inicio }))
    conexao.once('error', () => terminar(null))
    conexao.once('timeout', () => terminar(null))
  })
}

/**
 * Conecta na porta em 127.0.0.1 e em ::1 (no Windows o Vite escuta só no IPv6); vale o que responder.
 *
 * @param {number} porta
 * @returns {Promise<Resposta>}
 */
export async function consultarTcp(porta, { timeout = 1500 } = {}) {
  const respostas = await Promise.all(['127.0.0.1', '::1'].map(host => conectar(host, porta, timeout)))

  return respostas.find(Boolean) ?? null
}

/**
 * @param {import('../plano/tipos.mjs').SaudeDoProcesso} saude
 * @returns {Promise<Resposta>}
 */
export function consultar(saude) {
  if (saude.tipo === 'tcp' && saude.porta) {
    return consultarTcp(saude.porta)
  }
  if (saude.tipo === 'http' && saude.url) {
    return consultarHttp(saude.url)
  }

  return Promise.resolve(null)
}

/** Como a checagem aparece no detalhe do cartão: o caminho da URL ou a porta. */
export function rotuloDaSaude(saude) {
  if (saude?.tipo === 'tcp') {
    return `:${saude.porta}`
  }
  try {
    return new URL(saude.url).pathname
  } catch {
    return saude?.url ?? ''
  }
}

/**
 * Aplica o resultado de uma checagem ao serviço e diz o que registrar no log dele.
 *
 * @param {import('./estado.mjs').Servico & Record<string, any>} s
 * @param {Resposta} resposta
 * @returns {{ texto: string, nivel: 'sistema' | 'alerta' } | null}
 */
export function aplicarSaude(s, resposta, agora = Date.now()) {
  const ok = resposta !== null && resposta.status < 500

  if (ok) {
    s.falhasSaude = 0
    s.latencia = resposta.ms
    if (s.estado === 'online') {
      return null
    }
    const voltou = s.estado === 'instavel'
    s.estado = 'online'
    s.detalhe = null

    return {
      texto: voltou ? '✔ voltou a responder' : `✔ no ar em ${duracao(agora - s.inicio)}${s.url ? ` · ${s.url}` : ''}`,
      nivel: 'sistema',
    }
  }

  s.falhasSaude++
  if (s.estado !== 'online' || s.falhasSaude < FALHAS_PARA_INSTAVEL) {
    return null
  }
  const rotulo = rotuloDaSaude(s.saude)
  s.estado = 'instavel'
  s.detalhe = resposta ? `${rotulo} → ${resposta.status}` : 'sem resposta'

  return {
    texto: `${s.url ?? rotulo} ${resposta ? `respondeu ${resposta.status} em ${rotulo}` : 'parou de responder'}`,
    nivel: 'alerta',
  }
}
