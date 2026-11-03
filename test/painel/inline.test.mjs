import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { formatarLinhaInline, larguraDoPrefixo } from '../../src/painel/inline.mjs'
import { semCores } from '../../src/painel/texto.mjs'
import { pausa } from '../../src/pausa.mjs'

const FIXTURE = fileURLToPath(new URL('../_ajudantes/painel-inline.mjs', import.meta.url))

describe('formatarLinhaInline', () => {
  const s = { nome: 'web', cor: [52, 211, 153] }

  it('sem cor: nome alinhado e barra simples', () => {
    assert.equal(formatarLinhaInline(s, { texto: 'pronto', nivel: null }, { usaCor: false, largura: 8 }), 'web      | pronto')
  })

  it('com cor: mesmo texto, com a cor do serviço e o realce da linha', () => {
    const linha = formatarLinhaInline(s, { texto: 'GET /x', nivel: null }, { usaCor: true, largura: 8 })
    assert.match(linha, /^\x1b\[38;2;52;211;153mweb {5}/)
    assert.equal(semCores(linha), 'web      │ GET /x')
  })

  it('larguraDoPrefixo acompanha o maior nome, entre 8 e 16', () => {
    assert.equal(larguraDoPrefixo([{ nome: 'web' }]), 8)
    assert.equal(larguraDoPrefixo([{ nome: 'worker-pagamentos' }]), 16)
    assert.equal(larguraDoPrefixo([{ nome: 'scheduler1' }, { nome: 'a' }]), 10)
  })
})

/** O processo ainda existe? (sinal 0 só pergunta, não mata; funciona no Windows também) */
function existe(pid) {
  try {
    process.kill(pid, 0)

    return true
  } catch {
    return false
  }
}

describe('modo inline (processos de verdade)', () => {
  it('sobe dois processos, prefixa as linhas e encerra sem deixar órfãos', async () => {
    const comando = `node -e "console.log('pid ' + process.pid); setInterval(() => console.log('oi'), 300)"`
    const processo = nome => ({ nome, comando, cwd: process.cwd(), cor: [64, 196, 255], descricao: nome, porta: null, url: null, saude: null, padroes: null, metrica: null })
    const plano = { projeto: { nome: 'Inline', slogan: '', logo: null, raiz: process.cwd() }, processos: [processo('um'), processo('dois')], env: {}, reiniciar: true }

    const painel = spawn(process.execPath, [FIXTURE, JSON.stringify(plano), '1800'], {
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let saida = ''
    let erros = ''
    painel.stdout.setEncoding('utf8').on('data', d => (saida += d))
    painel.stderr.setEncoding('utf8').on('data', d => (erros += d))

    const codigo = await new Promise((resolve, reject) => {
      const limite = setTimeout(() => {
        painel.kill()
        reject(new Error(`o painel não encerrou a tempo\n${saida}\n${erros}`))
      }, 15_000)
      painel.on('exit', c => {
        clearTimeout(limite)
        resolve(c)
      })
    })

    assert.equal(codigo, 0, erros)
    const linhas = saida.split(/\r?\n/)
    for (const nome of ['um', 'dois']) {
      assert.ok(linhas.some(l => l === `${nome.padEnd(8)} | ▶ ${comando}`), `${nome} não subiu:\n${saida}`)
      assert.ok(linhas.some(l => l === `${nome.padEnd(8)} | oi`), `${nome} não prefixou:\n${saida}`)
      assert.ok(linhas.some(l => l === `${nome.padEnd(8)} | ■ parado`), `${nome} não parou:\n${saida}`)
    }
    assert.match(saida, /◆ Inline · dev encerrado depois de \ds/)
    assert.match(saida, /2 serviço\(s\) · 0 reinício\(s\) · 0 erro\(s\)/)

    // Os node -e reais (netos do painel, dentro do shell) não podem ficar vivos.
    const pids = [...saida.matchAll(/\| pid (\d+)/g)].map(m => Number(m[1]))
    assert.equal(pids.length, 2, saida)
    await pausa(300)
    assert.deepEqual(pids.filter(existe), [])
  })
})
