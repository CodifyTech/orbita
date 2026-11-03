import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { lerEnv } from '../../src/ambiente/env.mjs'
import { comandoDoScript, prepararEnvDoFrontend } from '../../src/presets/node.mjs'
import { buscarPreset, NOMES_DOS_PRESETS } from '../../src/presets/index.mjs'
import { contextoFalso } from '../_ajudantes/projeto-falso.mjs'

const API_E_WEB = {
  gerenciador: 'bun',
  servicos: { server: { preset: 'laravel', cwd: 'backend' }, web: { preset: 'vite', cwd: 'frontend' } },
}

describe('presets registrados', () => {
  it('tem todos os obrigatórios do CLAUDE.md', () => {
    for (const nome of ['laravel', 'laravel:queue', 'laravel:horizon', 'laravel:schedule', 'laravel:reverb', 'vite', 'nuxt', 'astro', 'next', 'ionic', 'dotnet']) {
      assert.ok(NOMES_DOS_PRESETS.includes(nome), nome)
    }
  })

  it('cada preset passa a porta do jeito do framework', () => {
    const contexto = contextoFalso({ gerenciador: 'pnpm' }, {}, { filtrar: false })
    const comando = (nome, porta) => buscarPreset(nome).comando({ porta }, contexto)

    assert.equal(comando('vite', 5173), 'pnpm run dev --port 5173 --strictPort')
    assert.equal(comando('nuxt', 3000), 'pnpm run dev --port 3000')
    assert.equal(comando('next', 3001), 'pnpm run dev -p 3001')
    assert.equal(comando('dotnet', 5000), 'dotnet watch run --urls http://127.0.0.1:5000')
  })
})

describe('comandoDoScript', () => {
  it('npm precisa de "--" antes dos argumentos; os outros não', () => {
    assert.equal(comandoDoScript('npm', 'dev', ['--port', '3000']), 'npm run dev -- --port 3000')
    assert.equal(comandoDoScript('bun', 'dev', ['--port', '3000']), 'bun run dev --port 3000')
    assert.equal(comandoDoScript('npm', 'lint'), 'npm run lint')
  })
})

describe('diagnóstico do app Node', () => {
  const doWeb = async (arquivos, extras) => {
    const contexto = contextoFalso(API_E_WEB, arquivos, extras)
    const executar = async () => ({ ok: true, saida: '1.4.4', erro: '' })
    const grupo = contexto.grupos.find(g => g.familia.nome === 'node')

    return grupo.familia.diagnosticar(grupo, { ...contexto, executar })
  }

  it('sem node_modules manda rodar o setup', async () => {
    const itens = await doWeb({ 'frontend/package.json': '{}' })

    assert.deepEqual(itens.map(i => [i.estado, i.detalhe]), [['erro', 'sem node_modules — rode `codify setup`']])
  })

  it('VITE_API_URL: vazia, outra API ou a local', async () => {
    const base = { 'frontend/node_modules/.keep': '' }
    const detalhe = async env => (await doWeb({ ...base, 'frontend/.env': env })).find(i => i.item === 'VITE_API_URL')

    assert.match((await detalhe('VITE_API_URL=\n')).detalhe, /vazia em frontend\/\.env — use http:\/\/127\.0\.0\.1:8000/)
    assert.match((await detalhe('VITE_API_URL=https://api.loja.com\n')).detalhe, /crie frontend\/\.env\.local com VITE_API_URL=http:\/\/127\.0\.0\.1:8000/)
    assert.equal((await detalhe('VITE_API_URL=http://localhost:8000\n')).estado, 'ok')
  })

  it('o .env.local vence o .env', async () => {
    const itens = await doWeb({ 'frontend/node_modules/.keep': '', 'frontend/.env': 'VITE_API_URL=https://prod\n', 'frontend/.env.local': 'VITE_API_URL=http://127.0.0.1:8000\n' })

    assert.equal(itens.find(i => i.item === 'VITE_API_URL').estado, 'ok')
  })

  it('pasta inexistente é erro', async () => {
    const contexto = contextoFalso({ servicos: { web: { preset: 'vite', cwd: 'nao-existe' } } })

    assert.match((await contexto.grupos[0].familia.diagnosticar(contexto.grupos[0], contexto))[0].detalhe, /pasta não encontrada/)
  })
})

describe('prepararEnvDoFrontend', () => {
  it('.env novo: copia o exemplo e grava todos os valores locais', () => {
    const contexto = contextoFalso(API_E_WEB, { 'frontend/.env.example': '# app\nVITE_APP_NAME=\nVITE_API_URL=\n' })
    const frontend = contexto.grupos[1]
    const feito = prepararEnvDoFrontend(frontend, contexto, { VITE_REVERB_APP_KEY: 'k' })

    assert.match(feito[0], /frontend\/\.env criado/)
    assert.deepEqual(lerEnv(join(frontend.cwd, '.env')), { VITE_APP_NAME: 'Teste', VITE_API_URL: 'http://127.0.0.1:8000', VITE_REVERB_APP_KEY: 'k' })
    assert.ok(!existsSync(join(frontend.cwd, '.env.local')))
  })

  it('.env existente: só preenche os vazios e, se aponta para outra API, cria o .env.local', () => {
    const contexto = contextoFalso(API_E_WEB, { 'frontend/.env': 'VITE_API_URL=https://homolog.loja.com\nVITE_REVERB_APP_KEY=\n' })
    const frontend = contexto.grupos[1]
    const feito = prepararEnvDoFrontend(frontend, contexto, { VITE_REVERB_APP_KEY: 'k' })

    assert.equal(lerEnv(join(frontend.cwd, '.env')).VITE_API_URL, 'https://homolog.loja.com')
    assert.equal(lerEnv(join(frontend.cwd, '.env')).VITE_REVERB_APP_KEY, 'k')
    assert.match(feito.join('\n'), /\.env\.local criado/)
    assert.match(readFileSync(join(frontend.cwd, '.env.local'), 'utf8'), /^VITE_API_URL=http:\/\/127\.0\.0\.1:8000$/m)
  })

  it('rodar de novo não muda nada', () => {
    const contexto = contextoFalso(API_E_WEB, { 'frontend/.env': 'VITE_API_URL=http://127.0.0.1:8000\n' })

    assert.deepEqual(prepararEnvDoFrontend(contexto.grupos[1], contexto), [])
  })
})
