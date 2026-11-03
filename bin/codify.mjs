#!/usr/bin/env node
// Porta de entrada do `codify`. Só decide *qual* Órbita roda (o do projeto ou este) e entrega a ele.
// Toda a lógica está em src/cli.mjs.
import { fileURLToPath, pathToFileURL } from 'node:url'
import { localizarInstalacaoLocal } from '../src/repasse.mjs'

const cliAtual = fileURLToPath(new URL('../src/cli.mjs', import.meta.url))
const cli = localizarInstalacaoLocal(process.cwd(), cliAtual) ?? cliAtual

const { executarCli } = await import(pathToFileURL(cli).href)

process.exitCode = await executarCli(process.argv.slice(2))
