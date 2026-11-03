// Família "generico": serviço da config que só tem `cmd` (sem preset). O Órbita sobe o comando como
// está e só confere se a pasta existe; não sabe instalar nem diagnosticar mais nada.
import { existsSync } from 'node:fs'

/** @type {import('./tipos.mjs').Familia} */
export const familiaGenerica = {
  nome: 'generico',
  ferramentas: () => [],
  diagnosticar: async grupo =>
    existsSync(grupo.cwd) ? [] : [{ estado: 'erro', item: `Pasta ${grupo.pasta}`, detalhe: 'não encontrada', reparo: null }],
  instalacao: () => null,
  paraOPlano: grupo => ({
    alvos: [
      {
        nome: grupo.pasta,
        cwd: grupo.cwd,
        cor: [148, 163, 184],
        exemplo: 'ex.: o comando que você rodaria nesta pasta',
        atalho: null,
        servicos: grupo.servicos.map(servico => servico.nome),
      },
    ],
  }),
}
