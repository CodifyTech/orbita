// Junta o diagnóstico das famílias com o das portas. Cada item é ok, aviso ou erro: erro impede o
// ambiente de subir; aviso sobe, mas funciona errado. Só checa os serviços que vão subir.
import { descrever, dono, emUso } from '../ambiente/portas.mjs'

/**
 * @param {import('../presets/tipos.mjs').Contexto} contexto
 * @returns {Promise<import('../presets/tipos.mjs').Item[]>}
 */
export async function diagnosticar(contexto) {
  // Backends primeiro, depois as portas, depois os frontends (que dependem da API e das portas).
  const backends = contexto.grupos.filter(grupo => grupo.familia.nome !== 'node')
  const frontends = contexto.grupos.filter(grupo => grupo.familia.nome === 'node')
  const dosGrupos = async grupos => (await Promise.all(grupos.map(grupo => grupo.familia.diagnosticar(grupo, contexto)))).flat()

  return [...(await dosGrupos(backends)), ...(await diagnosticarPortas(contexto.servicos)), ...(await dosGrupos(frontends))]
}

/**
 * @param {import('../presets/tipos.mjs').Servico[]} servicos
 * @returns {Promise<import('../presets/tipos.mjs').Item[]>}
 */
export async function diagnosticarPortas(servicos) {
  const comPorta = servicos.filter(servico => servico.porta)
  const ocupadas = await Promise.all(comPorta.map(servico => emUso(servico.porta)))
  const itens = []

  for (const [i, servico] of comPorta.entries()) {
    const item = `Porta ${servico.porta} (${servico.nome})`

    if (!ocupadas[i]) {
      itens.push({ estado: 'ok', item, detalhe: 'livre', reparo: null })
      continue
    }

    const quem = await dono(servico.porta)
    const dica = quem ? ` — ${quem.dica}` : ''

    itens.push({
      estado: 'aviso',
      item,
      detalhe: `em uso por ${descrever(quem)}${dica}. O \`codify dev\` oferece outra porta`,
      reparo: { tipo: 'porta', servico },
    })
  }

  return itens
}
