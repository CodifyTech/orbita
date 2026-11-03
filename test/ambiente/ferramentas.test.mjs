import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { linhaDeComando } from '../../src/ambiente/executar.mjs'
import { compararVersoes, extrairVersao, versaoDe } from '../../src/ambiente/ferramentas.mjs'

describe('extrairVersao', () => {
  it('pega a primeira versão do texto', () => {
    assert.equal(extrairVersao('PHP 8.5.0 (cli) (built: Nov 18 2025)'), '8.5.0')
    assert.equal(extrairVersao('Composer version 2.8.8 2025-04-04'), '2.8.8')
    assert.equal(extrairVersao('1.4'), '1.4')
    assert.equal(extrairVersao('sem versão'), null)
  })
})

describe('compararVersoes', () => {
  it('compara número a número, não como texto', () => {
    assert.ok(compararVersoes('8.10.0', '8.5.0') > 0)
    assert.ok(compararVersoes('8.4.15', '8.5') < 0)
    assert.equal(compararVersoes('8.5', '8.5.0'), 0)
  })
})

describe('versaoDe', () => {
  it('lê a versão da saída da ferramenta', async () => {
    const executar = async () => ({ ok: true, saida: 'v24.12.0\n', erro: '' })

    assert.equal(await versaoDe('node', ['--version'], { executar }), '24.12.0')
  })

  it('ferramenta ausente dá null', async () => {
    const executar = async () => ({ ok: false, saida: '', erro: 'não é reconhecido' })

    assert.equal(await versaoDe('xyz', ['--version'], { executar }), null)
  })

  it('o node real responde', async () => {
    assert.match(await versaoDe(process.execPath, ['--version']), /^\d+\.\d+\.\d+$/)
  })
})

describe('linhaDeComando', () => {
  it('só põe aspas onde precisa', () => {
    assert.equal(linhaDeComando('php', ['artisan', 'serve', '--port=8000']), 'php artisan serve --port=8000')
    assert.equal(linhaDeComando('C:/Program Files/php/php.exe', ['a b']), '"C:/Program Files/php/php.exe" "a b"')
  })

  it('dobra as aspas de dentro', () => {
    assert.equal(linhaDeComando('echo', ['diz "oi"']), 'echo "diz ""oi"""')
  })
})
