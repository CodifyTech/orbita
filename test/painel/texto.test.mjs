import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pinta, VERMELHO } from '../../src/painel/cores.mjs'
import { duracao, mb, plural } from '../../src/painel/formato.mjs'
import {
  ajustar,
  centralizar,
  cortar,
  fatiarPlano,
  juntar,
  larguraDe,
  limpar,
  quebrar,
  semCores,
  vis,
} from '../../src/painel/texto.mjs'

const cp = letra => letra.codePointAt(0)

describe('larguraDe', () => {
  it('letras comuns e acentuadas ocupam 1 coluna', () => {
    assert.equal(larguraDe(cp('a')), 1)
    assert.equal(larguraDe(cp('ç')), 1)
    assert.equal(larguraDe(cp('█')), 1)
  })

  it('ideogramas e emoji ocupam 2', () => {
    assert.equal(larguraDe(cp('日')), 2)
    assert.equal(larguraDe(cp('한')), 2)
    assert.equal(larguraDe(cp('🚀')), 2)
  })

  it('controle, acento combinante e joiner não ocupam nada', () => {
    assert.equal(larguraDe(0x07), 0)
    assert.equal(larguraDe(0x301), 0)
    assert.equal(larguraDe(0x200d), 0)
    assert.equal(larguraDe(0xfe0f), 0)
  })
})

describe('vis', () => {
  it('ignora os códigos de cor', () => {
    assert.equal(vis(pinta(VERMELHO, 'erro')), 4)
  })

  it('conta largos em dobro', () => {
    assert.equal(vis('ab日本'), 6)
    assert.equal(vis('🚀 ok'), 5)
  })
})

describe('cortar', () => {
  it('não mexe no que já cabe', () => {
    assert.equal(cortar('curto', 10), 'curto')
  })

  it('corta na largura visível e põe reticências', () => {
    const cortado = cortar('abcdefghij', 5)
    assert.equal(vis(cortado), 5)
    assert.equal(semCores(cortado), 'abcd…')
  })

  it('sem reticências usa a largura toda', () => {
    assert.equal(semCores(cortar('abcdefghij', 5, false)), 'abcde')
  })

  it('preserva as cores e fecha com reset', () => {
    const cortado = cortar(pinta(VERMELHO, 'abcdefghij'), 4)
    assert.match(cortado, /^\x1b\[38;2;248;113;113m/)
    assert.equal(vis(cortado), 4)
  })

  it('não parte um caractere largo ao meio', () => {
    const cortado = cortar('日本語テキスト', 6)
    assert.ok(vis(cortado) <= 6)
    assert.equal(semCores(cortado), '日本…')
  })

  it('largura zero ou negativa dá vazio', () => {
    assert.equal(cortar('abc', 0), '')
  })
})

describe('ajustar, juntar e centralizar', () => {
  it('ajustar completa ou corta para a largura exata', () => {
    assert.equal(ajustar('ab', 5), 'ab   ')
    assert.equal(vis(ajustar('abcdefgh', 5)), 5)
    assert.equal(vis(ajustar('日本', 5)), 5)
  })

  it('juntar põe a direita encostada e corta a esquerda se faltar espaço', () => {
    assert.equal(juntar('esq', 'dir', 10), 'esq    dir')
    const apertado = juntar('esquerda comprida', 'dir', 10)
    assert.equal(vis(apertado), 10)
    assert.ok(apertado.endsWith('dir'))
  })

  it('centralizar divide a sobra', () => {
    assert.equal(centralizar('ab', 6), '  ab  ')
    assert.equal(centralizar('ab', 5), ' ab  ')
  })
})

describe('fatiarPlano', () => {
  it('fatia colunas e completa com espaço', () => {
    assert.equal(fatiarPlano('abcdef', 1, 4), 'bcd')
    assert.equal(fatiarPlano('ab', 0, 4), 'ab  ')
  })

  it('caractere largo cortado ao meio vira espaço', () => {
    assert.equal(fatiarPlano('日本', 1, 4), ' 本')
    assert.equal(vis(fatiarPlano('日本語', 0, 3)), 3)
  })
})

describe('quebrar', () => {
  it('quebra num espaço do último terço da linha', () => {
    assert.deepEqual(quebrar('aaaaaaa bbbbbbb', 10), ['aaaaaaa', 'bbbbbbb'])
  })

  it('espaço no começo da linha não serve: a linha ficaria curta demais', () => {
    assert.deepEqual(quebrar('aa bbbbbbbbbb', 10), ['aa bbbbbbb', 'bbb'])
  })

  it('sem espaço bom, quebra no meio da palavra', () => {
    assert.deepEqual(quebrar('abcdefghij', 4), ['abcd', 'efgh', 'ij'])
  })

  it('respeita caracteres largos', () => {
    assert.deepEqual(quebrar('日本語テ', 4), ['日本', '語テ'])
  })

  it('largura zero devolve o texto inteiro', () => {
    assert.deepEqual(quebrar('abc', 0), ['abc'])
  })
})

describe('limpar', () => {
  it('tira cores, títulos OSC e caracteres de controle', () => {
    assert.equal(limpar('\x1b[31mvermelho\x1b[0m'), 'vermelho')
    assert.equal(limpar('\x1b]0;título\x07texto'), 'texto')
    assert.equal(limpar('a\x07b\x00c'), 'abc')
  })

  it('troca tab por 4 espaços e preserva a barra invertida', () => {
    assert.equal(limpar('a\tb'), 'a    b')
    assert.equal(limpar(String.raw`App\Jobs\Teste`), String.raw`App\Jobs\Teste`)
  })
})

describe('formato', () => {
  it('duracao em s, m e h', () => {
    assert.equal(duracao(42_000), '42s')
    assert.equal(duracao(187_000), '3m07s')
    assert.equal(duracao(2 * 3600_000 + 5 * 60_000), '2h05m')
    assert.equal(duracao(-5), '0s')
  })

  it('mb em MB e GB', () => {
    assert.equal(mb(512 * 1024 ** 2), '512 MB')
    assert.equal(mb(1.5 * 1024 ** 3), '1.5 GB')
  })

  it('plural', () => {
    assert.equal(plural(1, 'erro'), '1 erro')
    assert.equal(plural(0, 'erro'), '0 erros')
    assert.equal(plural(2, 'reinício'), '2 reinícios')
  })
})
