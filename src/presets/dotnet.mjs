// Família "dotnet": APIs ASP.NET Core. Sobe com `dotnet watch run` (recompila ao salvar) na porta
// escolhida pelo Órbita.
import { existsSync } from 'node:fs'
import { versaoDe } from '../ambiente/ferramentas.mjs'
import { PADROES_DOTNET } from './padroes.mjs'

const DICA = 'Instale o SDK do .NET (https://dotnet.microsoft.com/download).'

/** @type {import('./tipos.mjs').Preset[]} */
export const PRESETS_DOTNET = [
  {
    nome: 'dotnet',
    familia: 'dotnet',
    descricao: 'API .NET · dotnet watch',
    cor: [167, 139, 250],
    porta: 5000,
    health: null,
    protocolo: 'http',
    padroes: PADROES_DOTNET,
    metrica: null,
    comando: servico => `dotnet watch run --urls http://127.0.0.1:${servico.porta}`,
  },
]

/** @type {import('./tipos.mjs').Familia} */
export const familiaDotnet = {
  nome: 'dotnet',

  ferramentas: () => [{ nome: '.NET SDK', comando: 'dotnet', dica: DICA }],

  async diagnosticar(grupo, contexto) {
    if (!existsSync(grupo.cwd)) {
      return [{ estado: 'erro', item: `App ${grupo.pasta}`, detalhe: `pasta não encontrada: ${grupo.pasta}`, reparo: null }]
    }

    contexto.cacheDeVersoes ??= {}
    contexto.cacheDeVersoes.dotnet ??= await versaoDe('dotnet', ['--version'], contexto)

    return contexto.cacheDeVersoes.dotnet
      ? [{ estado: 'ok', item: '.NET SDK', detalhe: contexto.cacheDeVersoes.dotnet, reparo: null }]
      : [{ estado: 'erro', item: 'dotnet', detalhe: `não está no PATH — ${DICA}`, reparo: null }]
  },

  instalacao: grupo => ({
    titulo: `Pacotes do .NET (${grupo.pasta})`,
    porque: `O dotnet restore baixa os pacotes NuGet que o projeto de ${grupo.pasta}/ usa.`,
    comando: 'dotnet',
    args: ['restore'],
    texto: `Restaurando os pacotes NuGet em ${grupo.pasta}/`,
    passosSeFalhar: [
      'Confira sua conexão com a internet e se o `dotnet --version` funciona.',
      `Rode \`dotnet restore\` dentro de ${grupo.pasta}/ para ver a saída completa.`,
    ],
  }),

  paraOPlano: grupo => ({
    acoes: [
      { titulo: `Compilar (${grupo.pasta})`, detalhe: 'dotnet build', comando: 'dotnet build', cwd: grupo.cwd },
      { titulo: `Testes (${grupo.pasta})`, detalhe: 'dotnet test', comando: 'dotnet test', cwd: grupo.cwd },
    ],
    alvos: [
      {
        nome: grupo.pasta,
        cwd: grupo.cwd,
        cor: [167, 139, 250],
        exemplo: 'ex.: dotnet ef database update',
        atalho: null,
        servicos: grupo.servicos.map(servico => servico.nome),
      },
    ],
  }),
}
