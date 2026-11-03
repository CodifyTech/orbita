import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { executarCli } from '../src/cli.mjs'
import { versaoDoOrbita } from '../src/versao.mjs'
import { criarProjetoTemporario, criarSaidaFalsa } from './_ajudantes/saida-falsa.mjs'

const PROJETO = {
  'orbita.config.mjs': `export default { nome: 'Projeto Teste', descricoes: { lint: 'Roda o lint' } }`,
  'package.json': JSON.stringify({ scripts: { lint: 'eslint .' } }),
}

async function rodar(argv, arquivos = PROJETO) {
  const stdout = criarSaidaFalsa()
  const stderr = criarSaidaFalsa()
  const codigo = await executarCli(argv, { cwd: criarProjetoTemporario(arquivos), stdout, stderr, env: {} })

  return { codigo, saida: stdout.texto(), erro: stderr.texto() }
}

describe('executarCli', () => {
  it('--version mostra a versão do pacote', async () => {
    const { codigo, saida } = await rodar(['--version'])

    assert.equal(codigo, 0)
    assert.equal(saida.trim(), versaoDoOrbita())
  })

  it('sem argumentos cai no help, com banner', async () => {
    const { codigo, saida } = await rodar([])

    assert.equal(codigo, 0)
    assert.match(saida, /desenvolvido e mantido por CodifyTech/)
    assert.match(saida, /Projeto Teste — comandos do projeto/)
  })

  it('"dev --help" mostra a ajuda filtrada por dev', async () => {
    const { saida } = await rodar(['dev', '--help'])

    assert.match(saida, /codify dev/)
    assert.ok(!saida.includes('npm run lint'))
  })

  it('comando desconhecido sai com 1 e sugere o help', async () => {
    const { codigo, erro } = await rodar(['xyz'])

    assert.equal(codigo, 1)
    assert.match(erro, /Comando desconhecido: "xyz"/)
    assert.match(erro, /codify help/)
  })

  it('doctor aponta serviço com pasta inexistente e sai com 1', async () => {
    const { codigo, saida } = await rodar(['doctor', '--sem-perguntas'], {
      'orbita.config.mjs': `export default { nome: 'X', servicos: { worker: { cmd: 'node w.js', cwd: 'nao-existe' } } }`,
    })

    assert.equal(codigo, 1)
    assert.match(saida, /✗ Pasta nao-existe .* não encontrada/)
    assert.match(saida, /1 problema\(s\) impedem o ambiente de subir/)
  })

  it('doctor com tudo em ordem sai com 0', async () => {
    const { codigo, saida } = await rodar(['doctor', '--sem-perguntas'], {
      'orbita.config.mjs': `export default { nome: 'X', servicos: { worker: { cmd: 'node w.js' } } }`,
    })

    assert.equal(codigo, 0)
    assert.match(saida, /Ambiente pronto/)
  })

  it('--only com serviço desconhecido explica os válidos', async () => {
    const { codigo, erro } = await rodar(['doctor', '--only=xyz'], {
      'orbita.config.mjs': `export default { nome: 'X', servicos: { worker: { cmd: 'node w.js' } } }`,
    })

    assert.equal(codigo, 1)
    assert.match(erro, /Serviço\(s\) desconhecido\(s\): xyz/)
    assert.match(erro, /Use: worker/)
  })

  it('parar sem nada rodando avisa e sai com 0', async () => {
    const { codigo, saida } = await rodar(['parar'], {
      'orbita.config.mjs': `export default { nome: 'X', servicos: { web: { cmd: 'x', porta: 1 } } }`,
    })

    assert.equal(codigo, 0)
    assert.match(saida, /Nada do ambiente local está rodando/)
  })

  it('"banner <script>" mostra o cabeçalho com a descrição da config', async () => {
    const { codigo, saida } = await rodar(['banner', 'lint'])

    assert.equal(codigo, 0)
    assert.match(saida, /▶ npm run lint {2}— {2}Roda o lint/)
  })

  it('"banner" sem script explica o uso', async () => {
    const { codigo, erro } = await rodar(['banner'])

    assert.equal(codigo, 1)
    assert.match(erro, /Informe o nome do script/)
  })

  it('config inválida sai com 1 e aponta o problema', async () => {
    const { codigo, erro } = await rodar(['help'], { 'orbita.config.mjs': `export default { nome: 'X', servico: {} }` })

    assert.equal(codigo, 1)
    assert.match(erro, /chave desconhecida "servico"/)
  })

  it('erro que não é ErroDeUso é bug e sobe com o stack', async () => {
    const stdoutQuebrado = {
      isTTY: false,
      write() {
        throw new TypeError('bug no código')
      },
    }

    await assert.rejects(
      executarCli(['help'], { cwd: criarProjetoTemporario(PROJETO), stdout: stdoutQuebrado, stderr: criarSaidaFalsa(), env: {} }),
      /bug no código/,
    )
  })
})
