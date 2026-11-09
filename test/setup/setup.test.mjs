import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { chavesDeTestes, chavesVaziasDeTestes } from '../../src/presets/laravel/setup.mjs'
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

describe('etapa do .env.testing (Laravel)', () => {
  const TITULO = 'Ambiente de testes (backend)'
  const API = { servicos: { api: { preset: 'laravel', cwd: 'backend', porta: 8000 } } }
  const etapaDe = contexto => {
    const [grupo] = contexto.grupos

    return grupo.familia.configuracao(grupo, contexto).find(({ titulo }) => titulo === TITULO)
  }

  it('copia o .env.testing.example quando o .env.testing não existe', async () => {
    const contexto = contextoFalso(API, { 'backend/.env.testing.example': 'APP_ENV=testing\n' })
    const etapa = etapaDe(contexto)

    assert.equal(etapa.pular(), false)
    assert.equal(await etapa.executar(contexto), true)
    assert.equal(readFileSync(join(contexto.projeto.raiz, 'backend', '.env.testing'), 'utf8'), 'APP_ENV=testing\n')
    assert.match(contexto.saida.texto(), /backend\/\.env\.testing criado/)
  })

  it('pula quando o .env.testing já existe', () => {
    const contexto = contextoFalso(API, { 'backend/.env.testing.example': 'A=exemplo\n', 'backend/.env.testing': 'A=meu\n' })

    assert.equal(etapaDe(contexto).pular(), true)
    assert.equal(readFileSync(join(contexto.projeto.raiz, 'backend', '.env.testing'), 'utf8'), 'A=meu\n')
  })

  it('pula quando o projeto não tem .env.testing.example', () => {
    const contexto = contextoFalso(API, { 'backend/.env.example': 'A=1\n' })

    assert.equal(etapaDe(contexto).pular(), true)
    assert.equal(existsSync(join(contexto.projeto.raiz, 'backend', '.env.testing')), false)
  })
})

describe('chaves do .env.testing (Laravel)', () => {
  const API = { servicos: { api: { preset: 'laravel', cwd: 'backend', porta: 8000 } } }
  const arquivoDe = contexto => join(contexto.projeto.raiz, 'backend', '.env.testing')
  const comEnv = texto => contextoFalso(API, { 'backend/.env.testing': texto })

  it('pede as duas chaves quando estão vazias', () => {
    assert.deepEqual(chavesVaziasDeTestes(arquivoDe(comEnv('APP_KEY=\nJWT_SECRET=\n')), true), ['key:generate', 'jwt:secret'])
  })

  it('não mexe nas chaves já preenchidas', () => {
    const arquivo = arquivoDe(comEnv('APP_KEY=base64:abc\nJWT_SECRET=segredo\n'))

    assert.deepEqual(chavesVaziasDeTestes(arquivo, true), [])
    assert.equal(readFileSync(arquivo, 'utf8'), 'APP_KEY=base64:abc\nJWT_SECRET=segredo\n')
  })

  it('sem JWT no projeto, não pede nem grava o JWT_SECRET', () => {
    const arquivo = arquivoDe(comEnv('APP_KEY=base64:abc\n'))

    assert.deepEqual(chavesVaziasDeTestes(arquivo, false), [])
    assert.equal(readFileSync(arquivo, 'utf8'), 'APP_KEY=base64:abc\n')
  })

  it('normaliza valor entre aspas e cria a linha que falta, para o artisan conseguir gravar', () => {
    const arquivo = arquivoDe(comEnv('APP_KEY=""\n'))

    assert.deepEqual(chavesVaziasDeTestes(arquivo, true), ['key:generate', 'jwt:secret'])
    assert.equal(readFileSync(arquivo, 'utf8'), 'APP_KEY=\nJWT_SECRET=\n')
  })

  it('sem .env.testing, segue sem fazer nada', async () => {
    const contexto = contextoFalso(API)
    const [grupo] = contexto.grupos
    grupo.info = { jwt: { usa: true } }

    assert.equal(await chavesDeTestes(grupo, contexto), true)
    assert.equal(existsSync(arquivoDe(contexto)), false)
  })

  it('com a config em cache, avisa e não gera (o --env seria ignorado)', async () => {
    const contexto = contextoFalso(API, { 'backend/.env.testing': 'APP_KEY=\n', 'backend/bootstrap/cache/config.php': '<?php return [];' })
    const [grupo] = contexto.grupos
    grupo.info = { jwt: { usa: false } }

    assert.equal(await chavesDeTestes(grupo, contexto), true)
    assert.match(contexto.saida.texto(), /Config em cache/)
    assert.equal(readFileSync(arquivoDe(contexto), 'utf8'), 'APP_KEY=\n')
  })
})

function executorFalsoQueFalhaNaInstalacao() {
  return async (comando, args = []) =>
    args[0] === '--version' ? { ok: true, saida: '10.0.0', erro: '' } : { ok: false, saida: 'linha 1\nERRO: sem internet', erro: '' }
}
