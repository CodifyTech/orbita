import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { atualizarEnv, formatarValor, gravarEnv, lerEnv, lerEnvs, parseEnv } from '../../src/ambiente/env.mjs'
import { criarProjetoTemporario } from '../_ajudantes/saida-falsa.mjs'

describe('parseEnv', () => {
  it('lê chaves simples, ignorando comentários e linhas vazias', () => {
    assert.deepEqual(parseEnv('# app\nAPP_NAME=FoodOS\n\nAPP_ENV=local\n'), { APP_NAME: 'FoodOS', APP_ENV: 'local' })
  })

  it('aceita `export`, espaços em volta do "=" e CRLF', () => {
    assert.deepEqual(parseEnv('export A = 1\r\nB=2\r\n'), { A: '1', B: '2' })
  })

  it('tira o comentário do fim da linha, mas não o "#" colado no valor', () => {
    assert.deepEqual(parseEnv('A=1 # nota\nB=cor#fff'), { A: '1', B: 'cor#fff' })
  })

  it('valor vazio é string vazia', () => {
    assert.deepEqual(parseEnv('APP_KEY=\nJWT_SECRET='), { APP_KEY: '', JWT_SECRET: '' })
  })

  it('aspas duplas: preserva espaços e # e resolve escapes', () => {
    assert.deepEqual(parseEnv('A="oi # tudo bem"\nB="linha\\nnova"\nC="a\\"b\\\\c\\$d"'), {
      A: 'oi # tudo bem',
      B: 'linha\nnova',
      C: 'a"b\\c$d',
    })
  })

  it('aspas simples: literal, sem escapes', () => {
    assert.deepEqual(parseEnv(`A='sem \\n escape'`), { A: 'sem \\n escape' })
  })

  it('ignora o que vem depois da aspa que fecha', () => {
    assert.deepEqual(parseEnv('A="x" # comentário'), { A: 'x' })
  })

  it('valor entre aspas pode ocupar várias linhas', () => {
    assert.deepEqual(parseEnv('A="um\ndois"\nB=3'), { A: 'um\ndois', B: '3' })
  })

  it('o último valor da mesma chave vence', () => {
    assert.deepEqual(parseEnv('A=1\nA=2'), { A: '2' })
  })

  it('ignora linhas que não são atribuição', () => {
    assert.deepEqual(parseEnv('isso não é env\n=sem chave\nA=1'), { A: '1' })
  })
})

describe('formatarValor', () => {
  it('deixa valor simples como está', () => {
    assert.equal(formatarValor('http://localhost:8000'), 'http://localhost:8000')
    assert.equal(formatarValor(''), '')
  })

  it('põe aspas e escapa quando há espaço, #, aspas, barra ou $', () => {
    assert.equal(formatarValor('a b'), '"a b"')
    assert.equal(formatarValor('a#b'), '"a#b"')
    assert.equal(formatarValor('a"b'), '"a\\"b"')
    assert.equal(formatarValor('a\\b'), '"a\\\\b"')
    assert.equal(formatarValor('pa$$'), '"pa\\$\\$"')
  })

  it('o que é gravado é lido de volta igual', () => {
    for (const valor of ['simples', 'com espaço', 'a#b', 'aspas "duplas"', "aspas 'simples'", 'barra\\', 'dolar$', 'misto "x" $y \\z # w']) {
      assert.equal(parseEnv(`A=${formatarValor(valor)}`).A, valor, valor)
    }
  })
})

describe('atualizarEnv', () => {
  it('troca a linha existente e preserva o resto', () => {
    const antes = '# banco\nDB_HOST=127.0.0.1\nDB_PORT=3306\n\nAPP_ENV=local\n'

    assert.equal(atualizarEnv(antes, 'DB_PORT', '3307'), '# banco\nDB_HOST=127.0.0.1\nDB_PORT=3307\n\nAPP_ENV=local\n')
  })

  it('acrescenta no fim quando a chave não existe', () => {
    assert.equal(atualizarEnv('A=1\n', 'B', '2'), 'A=1\nB=2\n')
    assert.equal(atualizarEnv('A=1', 'B', '2'), 'A=1\nB=2\n')
  })

  it('arquivo vazio vira só a linha', () => {
    assert.equal(atualizarEnv('', 'A', '1'), 'A=1\n')
  })

  it('preserva o fim de linha CRLF', () => {
    assert.equal(atualizarEnv('A=1\r\n', 'B', '2'), 'A=1\r\nB=2\r\n')
    assert.equal(atualizarEnv('A=1\r\nB=2\r\n', 'B', '3'), 'A=1\r\nB=3\r\n')
  })

  it('não confunde chaves com o mesmo começo', () => {
    assert.equal(atualizarEnv('DB_PORT_X=1\n', 'DB_PORT', '2'), 'DB_PORT_X=1\nDB_PORT=2\n')
  })

  it('"$" no valor não vira referência do replace', () => {
    assert.equal(atualizarEnv('A=1\n', 'A', 'x$&y'), 'A="x\\$&y"\n')
  })

  it('mantém o `export` da linha trocada', () => {
    assert.equal(atualizarEnv('export A=1\n', 'A', '2'), 'export A=2\n')
  })

  it('rejeita nome de variável inválido', () => {
    assert.throws(() => atualizarEnv('', 'A B', '1'), /inválido/)
    assert.throws(() => atualizarEnv('', 'A=1\nB', '1'), /inválido/)
  })
})

describe('arquivos', () => {
  it('lerEnv devolve vazio para arquivo inexistente', () => {
    assert.deepEqual(lerEnv(join(criarProjetoTemporario(), 'nao-existe.env')), {})
  })

  it('gravarEnv cria o arquivo e depois atualiza', () => {
    const arquivo = join(criarProjetoTemporario(), '.env')

    gravarEnv(arquivo, 'A', '1')
    gravarEnv(arquivo, 'B', 'dois 2')
    gravarEnv(arquivo, 'A', '3')

    assert.equal(readFileSync(arquivo, 'utf8'), 'A=3\nB="dois 2"\n')
  })

  it('lerEnvs: o último arquivo da lista vence', () => {
    const raiz = criarProjetoTemporario({ '.env': 'URL=api\nSO_NO_ENV=1', '.env.local': 'URL=local' })
    const lidos = lerEnvs([join(raiz, '.env'), join(raiz, '.env.local'), join(raiz, 'inexistente')])

    assert.deepEqual(lidos, { URL: 'local', SO_NO_ENV: '1' })
  })

  it('o arquivo gravado é lido de volta pelo parse', () => {
    const arquivo = join(criarProjetoTemporario(), '.env')

    writeFileSync(arquivo, '# fixo\nA=1\n')
    gravarEnv(arquivo, 'VITE_API_URL', 'http://127.0.0.1:8001')

    assert.deepEqual(lerEnv(arquivo), { A: '1', VITE_API_URL: 'http://127.0.0.1:8001' })
  })
})
