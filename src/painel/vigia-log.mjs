// Aba de arquivo de log (ex.: storage/logs/laravel*.log): acompanha o arquivo mais recente da pasta
// (log diário troca de arquivo à meia-noite) lendo só o trecho novo a cada ciclo, pela posição, como
// um `tail -f`. Ao abrir mostra só o cabeçalho das últimas entradas, sem alertar: são do passado.
import fs from 'node:fs'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { classificar } from './classificacao.mjs'
import { registrar } from './logs.mjs'
import { limpar } from './texto.mjs'

/** "[2025-01-31 10:00:00] local.ERROR: mensagem {contexto}" — o formato do Monolog (Laravel). */
export const RE_MONOLOG = /^\[(\d{4}-\d\d-\d\d[T ][\d:.]+)[^\]]*\]\s+[\w-]+\.(\w+):\s?(.*)$/
const NIVEIS_DE_ERRO = ['ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY']

/** Lê no máximo 1 MB por ciclo: um log que explodiu não trava o painel. */
const MAX_POR_CICLO = 1024 * 1024
/** Ao abrir, procura as últimas entradas só no fim do arquivo. */
const BYTES_DO_HISTORICO = 64 * 1024
const ENTRADAS_DO_HISTORICO = 12
const MAX_TEXTO = 4000

/**
 * Lê o cabeçalho de uma entrada do Monolog. Linhas que não são cabeçalho (stack trace) dão null.
 *
 * @param {string} texto
 * @returns {{ nivel: 'erro' | 'alerta' | null, nivelLog: string, mensagem: string } | null}
 */
export function lerMonolog(texto) {
  const m = RE_MONOLOG.exec(texto)
  if (!m) {
    return null
  }
  const nivelLog = m[2].toUpperCase()

  return {
    nivel: NIVEIS_DE_ERRO.includes(nivelLog) ? 'erro' : nivelLog === 'WARNING' ? 'alerta' : null,
    nivelLog,
    // O contexto JSON (` {"exception":…}`) fica fora do alerta: é longo demais para uma linha.
    mensagem: m[3].split(' {"')[0],
  }
}

/** Regex dos nomes de arquivo (texto do plano); inválida vira "qualquer .log". */
export function compilarArquivos(texto) {
  try {
    return new RegExp(texto || '\\.log$')
  } catch {
    return /\.log$/
  }
}

/**
 * O arquivo da pasta que casa com o padrão e foi modificado por último.
 *
 * @param {string} pasta
 * @param {RegExp} padrao
 * @param {Pick<typeof fs, 'readdirSync' | 'statSync'>} [sistema]
 * @returns {{ nome: string, caminho: string, tamanho: number } | null}
 */
export function arquivoMaisRecente(pasta, padrao, sistema = fs) {
  try {
    const maisNovo = sistema
      .readdirSync(pasta)
      .filter(nome => padrao.test(nome))
      .map(nome => ({ nome, st: sistema.statSync(join(pasta, nome)) }))
      .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs)[0]

    return maisNovo ? { nome: maisNovo.nome, caminho: join(pasta, maisNovo.nome), tamanho: maisNovo.st.size } : null
  } catch {
    return null
  }
}

/**
 * Lê `tamanho` bytes a partir de `posicao` (null se o arquivo sumiu ou está bloqueado).
 *
 * @param {Pick<typeof fs, 'openSync' | 'readSync' | 'closeSync'>} [sistema]
 * @returns {Buffer | null}
 */
export function lerTrecho(caminho, posicao, tamanho, sistema = fs) {
  const buffer = Buffer.alloc(tamanho)
  let fd = null
  try {
    fd = sistema.openSync(caminho, 'r')
    const lidos = sistema.readSync(fd, buffer, 0, tamanho, posicao)

    return buffer.subarray(0, lidos)
  } catch {
    return null
  } finally {
    if (fd !== null) {
      try {
        sistema.closeSync(fd)
      } catch {}
    }
  }
}

/**
 * Começa a vigiar o log do serviço `s` (tipo 'log', com `s.log` vindo do plano).
 *
 * @param {import('./estado.mjs').Estado} estado
 * @param {import('./estado.mjs').Servico & Record<string, any>} s
 * @param {{ sistema?: typeof fs, intervalo?: number, relogio?: () => number }} [opcoes]
 * @returns {{ ciclo(): void, parar(): void, caminho(): string | null }}
 */
export function criarVigia(estado, s, { sistema = fs, intervalo = 700, relogio = Date.now } = {}) {
  const { pasta, arquivos, formato = 'texto' } = s.log
  const padrao = compilarArquivos(arquivos)
  let atual = null
  let posicao = 0
  let resto = ''
  let decodificador = new StringDecoder('utf8')

  const linha = (bruta, antigo) => {
    const texto = limpar(bruta).trimEnd()
    if (!texto) {
      return
    }
    const agora = relogio()
    if (formato !== 'monolog') {
      s.metricas.entradas = (s.metricas.entradas ?? 0) + (antigo ? 0 : 1)
      registrar(estado, s, texto.slice(0, MAX_TEXTO), classificar(texto, s.padroes), { antigo, agora })

      return
    }
    const entrada = lerMonolog(texto)
    if (!entrada) {
      registrar(estado, s, texto.slice(0, MAX_TEXTO), 'traco', { antigo, agora })

      return
    }
    s.metricas.entradas = (s.metricas.entradas ?? 0) + (antigo ? 0 : 1)
    registrar(estado, s, texto.slice(0, MAX_TEXTO), entrada.nivel, {
      antigo,
      agora,
      alerta: `${entrada.nivelLog}: ${entrada.mensagem}`,
    })
  }

  /** Contexto ao abrir: as últimas entradas (no Monolog só o cabeçalho; o detalhe está no arquivo). */
  const historico = arquivo => {
    const inicio = Math.max(0, arquivo.tamanho - BYTES_DO_HISTORICO)
    const ultimas = (lerTrecho(arquivo.caminho, inicio, arquivo.tamanho - inicio, sistema)?.toString('utf8') ?? '')
      .split('\n')
      .slice(inicio > 0 ? 1 : 0) // a primeira linha provavelmente começou antes do trecho lido
      .filter(l => (formato === 'monolog' ? RE_MONOLOG.test(l) : l.trim()))
      .slice(-ENTRADAS_DO_HISTORICO)
    const explicacao = formato === 'monolog' ? 'só o cabeçalho (o detalhe está no arquivo, o abre)' : 'o abre o arquivo'
    registrar(
      estado,
      s,
      `▶ acompanhando ${arquivo.nome}${ultimas.length ? ` — as últimas ${ultimas.length} entradas, ${explicacao}` : ''}`,
      'sistema',
      { agora: relogio() },
    )
    ultimas.forEach(l => linha(l, true))
    if (ultimas.length) {
      registrar(estado, s, '─── daqui em diante, ao vivo ───', 'sistema', { agora: relogio() })
    }
  }

  const ciclo = () => {
    const arquivo = arquivoMaisRecente(pasta, padrao, sistema)
    if (!arquivo) {
      return
    }
    if (arquivo.caminho !== atual) {
      const primeiro = atual === null
      atual = arquivo.caminho
      s.metricas.arquivo = arquivo.nome
      resto = ''
      decodificador = new StringDecoder('utf8')
      // O primeiro arquivo começa do fim (o histórico já foi mostrado); um arquivo novo, do início.
      posicao = primeiro ? arquivo.tamanho : 0
      primeiro ? historico(arquivo) : registrar(estado, s, `▶ novo arquivo: ${arquivo.nome}`, 'sistema', { agora: relogio() })
    }
    // Arquivo truncado (alguém limpou o log): recomeça do início.
    if (arquivo.tamanho < posicao) {
      posicao = 0
      resto = ''
    }
    if (arquivo.tamanho === posicao) {
      return
    }
    const buffer = lerTrecho(arquivo.caminho, posicao, Math.min(arquivo.tamanho - posicao, MAX_POR_CICLO), sistema)
    if (!buffer?.length) {
      return
    }
    posicao += buffer.length
    // O decodificador segura um acento cortado ao meio entre duas leituras.
    const partes = (resto + decodificador.write(buffer)).split('\n')
    resto = partes.pop()
    partes.forEach(p => linha(p, false))
  }

  s.estado = 'online'
  s.detalhe = 'acompanhando'
  // intervalo 0: sem relógio, quem chama roda `ciclo()` (os testes fazem assim).
  const relogioDoCiclo = intervalo > 0 ? setInterval(ciclo, intervalo) : null
  ciclo()

  return {
    ciclo,
    parar: () => clearInterval(relogioDoCiclo),
    caminho: () => atual,
  }
}
