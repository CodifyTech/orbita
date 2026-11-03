import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { rodarSetup } from '../../src/setup/index.mjs'
import { contextoFalso, perguntasProntas } from '../_ajudantes/projeto-falso.mjs'

/** Uma porta que está livre agora (o sistema escolhe). */
const portaLivre = () =>
  new Promise(resolve => {
    const servidor = createServer().listen(0, '127.0.0.1', () => {
      const { port } = servidor.address()
      servidor.close(() => resolve(port))
    })
  })

/** Executor falso: toda ferramenta tem versão e toda instalação dá certo, a não ser `falhar`. */
const executorFalso = ({ falhar = null } = {}) => {
  const chamadas = []
  const executar = async (comando, args = []) => {
    chamadas.push([comando, ...args].join(' '))

    if (args[0] === '--version') {
      return { ok: comando !== falhar, saida: '1.2.3', erro: '' }
    }

    return comando === falhar ? { ok: false, saida: 'linha 1\nERRO: sem internet', erro: '' } : { ok: true, saida: 'ok', erro: '' }
  }

  return { executar, chamadas }
}

describe('rodarSetup', () => {
  it('ferramentas → instalação → frontend → check-up → tudo pronto', async () => {
    const porta = await portaLivre()
    const { executar, chamadas } = executorFalso()
    const contexto = contextoFalso(
      { gerenciador: 'bun', servicos: { web: { preset: 'vite', cwd: 'frontend', porta } } },
      { 'frontend/package.json': '{}', 'frontend/node_modules/.keep': '' },
      { filtrar: false, executar, perguntas: { ...perguntasProntas(), interativo: false } },
    )

    assert.equal(await rodarSetup(contexto), 0)

    const texto = contexto.saida.texto()
    assert.ok(chamadas.includes('bun install'))
    assert.match(texto, /Bem-vindo\(a\) à CodifyTech!/)
    assert.match(texto, /\[0\/3\] Conferindo as ferramentas/)
    assert.match(texto, /\[1\/3\] Pacotes de frontend/)
    assert.match(texto, /\[2\/3\] Frontend/)
    assert.match(texto, /\[3\/3\] Check-up final/)
    assert.match(texto, /Tudo pronto! Ambiente do Teste configurado/)
    assert.equal(readFileSync(join(contexto.projeto.raiz, 'frontend', '.env'), 'utf8'), '')
  })

  it('ferramenta faltando para no [0/N] com a dica de instalação', async () => {
    const { executar, chamadas } = executorFalso({ falhar: 'bun' })
    const contexto = contextoFalso({ gerenciador: 'bun', servicos: { web: { preset: 'vite', cwd: 'frontend' } } }, {}, { filtrar: false, executar })

    assert.equal(await rodarSetup(contexto), 1)
    assert.match(contexto.saida.texto(), /Bun +não encontrado/)
    assert.match(contexto.saida.texto(), /Instale o Bun \(https:\/\/bun\.sh\)/)
    assert.ok(!chamadas.includes('bun install'))
  })

  it('instalação que falha mostra as últimas linhas e o "Como resolver"', async () => {
    const contexto = contextoFalso({ gerenciador: 'npm', servicos: { web: { preset: 'vite', cwd: 'frontend' } } }, {}, { filtrar: false, executar: executorFalsoQueFalhaNaInstalacao() })

    assert.equal(await rodarSetup(contexto), 1)
    assert.match(contexto.saida.texto(), /│ ERRO: sem internet/)
    assert.match(contexto.saida.texto(), /Como resolver:/)
    assert.match(contexto.saida.texto(), /Depois rode `codify setup` de novo/)
  })
})

function executorFalsoQueFalhaNaInstalacao() {
  return async (comando, args = []) =>
    args[0] === '--version' ? { ok: true, saida: '10.0.0', erro: '' } : { ok: false, saida: 'linha 1\nERRO: sem internet', erro: '' }
}
