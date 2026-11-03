// Leitura e escrita de arquivos .env. Porta do `EnvArquivo.php` do FoodOS.
//
// Parse compatível com o Dotenv do Laravel (aspas, comentários, `export`, valor em várias linhas).
// Não expande `${OUTRA_VARIAVEL}`: o Órbita lê o que está escrito, quem expande é o framework.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const LINHA_DE_ATRIBUICAO = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/
const CHAVE_VALIDA = /^[A-Za-z_][A-Za-z0-9_.]*$/

/**
 * @param {string} texto conteúdo de um .env
 * @returns {Record<string, string>}
 */
export function parseEnv(texto) {
  const resultado = {}
  const linhas = texto.split(/\r?\n/)

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim()

    if (linha === '' || linha.startsWith('#')) {
      continue
    }

    const atribuicao = LINHA_DE_ATRIBUICAO.exec(linha)
    if (!atribuicao) {
      continue
    }

    const [, chave, resto] = atribuicao
    const aspas = resto[0]

    if (aspas === '"' || aspas === "'") {
      // O fechamento pode estar mais abaixo: valor entre aspas aceita várias linhas.
      let corpo = resto.slice(1)
      let fim = acharFechamento(corpo, aspas)

      while (fim === -1 && i + 1 < linhas.length) {
        corpo += `\n${linhas[++i]}`
        fim = acharFechamento(corpo, aspas)
      }

      const bruto = fim === -1 ? corpo : corpo.slice(0, fim)
      resultado[chave] = aspas === '"' ? desescapar(bruto) : bruto
    } else {
      // Sem aspas, um " #" já começa o comentário do fim da linha.
      resultado[chave] = resto.replace(/\s+#.*$/, '').trim()
    }
  }

  return resultado
}

/** Posição da aspa que fecha o valor (ignorando as escapadas com barra), ou -1. */
function acharFechamento(corpo, aspas) {
  for (let i = 0; i < corpo.length; i++) {
    if (corpo[i] === '\\') {
      i++
    } else if (corpo[i] === aspas) {
      return i
    }
  }

  return -1
}

const ESCAPES = { n: '\n', r: '\r', t: '\t' }

const desescapar = texto => texto.replace(/\\([nrt"\\$])/g, (_, letra) => ESCAPES[letra] ?? letra)

/** Lê um .env; arquivo que não existe vale como vazio. */
export function lerEnv(arquivo) {
  return existsSync(arquivo) ? parseEnv(readFileSync(arquivo, 'utf8')) : {}
}

/**
 * Lê vários .env juntos; o último da lista vence (ex.: `.env`, `.env.local`).
 *
 * @param {string[]} arquivos do menos para o mais prioritário
 */
export function lerEnvs(arquivos) {
  return Object.assign({}, ...arquivos.map(lerEnv))
}

/**
 * Devolve o conteúdo com `chave=valor` já aplicado: troca a linha existente ou acrescenta no fim,
 * preservando comentários, ordem e o fim de linha do arquivo (LF ou CRLF).
 *
 * @param {string} conteudo
 * @param {string} chave
 * @param {string} valor
 */
export function atualizarEnv(conteudo, chave, valor) {
  if (!CHAVE_VALIDA.test(chave)) {
    throw new Error(`Nome de variável de ambiente inválido: "${chave}"`)
  }

  const linha = `${chave}=${formatarValor(valor)}`
  const padrao = new RegExp(`^(export\\s+)?${escaparParaRegex(chave)}=[^\\r\\n]*`, 'gm')

  if (conteudo.search(padrao) !== -1) {
    // Função (e não texto) no replace: `$` no valor não pode virar referência de grupo.
    return conteudo.replace(padrao, (_, exportar = '') => exportar + linha)
  }

  const quebra = conteudo.includes('\r\n') ? '\r\n' : '\n'

  return (conteudo === '' ? '' : conteudo.trimEnd() + quebra) + linha + quebra
}

/** Grava `chave=valor` no arquivo (cria se não existir). */
export function gravarEnv(arquivo, chave, valor) {
  const conteudo = existsSync(arquivo) ? readFileSync(arquivo, 'utf8') : ''

  writeFileSync(arquivo, atualizarEnv(conteudo, chave, valor))
}

/** Valor com espaço, #, aspas, barra ou $ precisa de aspas para ser lido de volta igual. */
export function formatarValor(valor) {
  return /[\s#"'\\$]/.test(valor) ? `"${valor.replace(/["\\$]/g, '\\$&')}"` : valor
}

const escaparParaRegex = texto => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
