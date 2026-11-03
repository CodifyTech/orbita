// Registro dos presets e das famílias. Para criar um preset novo, escreva-o na família certa e ele
// aparece aqui pela lista da família.
import { familiaDotnet, PRESETS_DOTNET } from './dotnet.mjs'
import { familiaGenerica } from './generico.mjs'
import { familiaLaravel, PRESETS_LARAVEL } from './laravel/index.mjs'
import { familiaNode, PRESETS_NODE } from './node.mjs'

/** @type {import('./tipos.mjs').Preset[]} */
export const PRESETS = [...PRESETS_LARAVEL, ...PRESETS_NODE, ...PRESETS_DOTNET]

/** @type {Record<string, import('./tipos.mjs').Familia>} */
export const FAMILIAS = {
  laravel: familiaLaravel,
  node: familiaNode,
  dotnet: familiaDotnet,
  generico: familiaGenerica,
}

export const NOMES_DOS_PRESETS = PRESETS.map(preset => preset.nome)

/** @returns {import('./tipos.mjs').Preset | undefined} */
export const buscarPreset = nome => PRESETS.find(preset => preset.nome === nome)
