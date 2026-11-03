import assert from 'node:assert/strict'
import { mkdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { localizarInstalacaoLocal } from '../src/repasse.mjs'
import { criarProjetoTemporario } from './_ajudantes/saida-falsa.mjs'

const CLI_LOCAL = 'node_modules/@codifytech/orbita/src/cli.mjs'

describe('localizarInstalacaoLocal', () => {
  it('acha o Órbita instalado no projeto, mesmo rodando de uma subpasta', () => {
    const projeto = criarProjetoTemporario({ [CLI_LOCAL]: '', 'backend/app/.gitkeep': '' })
    const global = criarProjetoTemporario({ 'cli.mjs': '' })

    assert.equal(localizarInstalacaoLocal(join(projeto, 'backend', 'app'), join(global, 'cli.mjs')), join(projeto, CLI_LOCAL))
  })

  it('sem instalação local, devolve null (roda o global)', () => {
    const projeto = criarProjetoTemporario({ 'package.json': '{}' })
    const global = criarProjetoTemporario({ 'cli.mjs': '' })

    assert.equal(localizarInstalacaoLocal(projeto, join(global, 'cli.mjs')), null)
  })

  it('se o cli atual já é o local, devolve null (evita delegar para si mesmo)', () => {
    const projeto = criarProjetoTemporario({ [CLI_LOCAL]: '' })

    assert.equal(localizarInstalacaoLocal(projeto, join(projeto, CLI_LOCAL)), null)
  })

  it('reconhece o mesmo arquivo por um link simbólico (npm link)', t => {
    const repositorio = criarProjetoTemporario({ 'src/cli.mjs': '' })
    const projeto = criarProjetoTemporario()
    mkdirSync(join(projeto, 'node_modules', '@codifytech'), { recursive: true })

    try {
      symlinkSync(repositorio, join(projeto, 'node_modules', '@codifytech', 'orbita'), 'junction')
    } catch {
      return t.skip('sem permissão para criar link simbólico')
    }

    assert.equal(localizarInstalacaoLocal(projeto, join(repositorio, 'src', 'cli.mjs')), null)
  })
})
