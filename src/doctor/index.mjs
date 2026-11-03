// O doctor: diagnostica, mostra, oferece consertar e confere de novo, até 6 rodadas (o conserto de
// um item costuma revelar o próximo: host errado, depois a senha, depois o banco que não existe).
import { criarMensagens } from '../ui/mensagens.mjs'
import { corDoEstado, iconeDoEstado, larguraDoTerminal, linhaDeDetalhe } from '../ui/tabela.mjs'
import { diagnosticar } from './diagnostico.mjs'
import { reparar } from './reparo.mjs'

const RODADAS = 6

/**
 * @param {import('../presets/tipos.mjs').Contexto} contexto  já consultado (consultarFamilias)
 * @param {{ perguntar: boolean }} opcoes  false = só diagnostica (--sem-perguntas ou sem terminal)
 * @returns {Promise<{ ok: boolean, alterou: boolean }>}
 */
export async function rodarDoctor(contexto, { perguntar }) {
  let alterou = false
  let itens = []

  for (let rodada = 1; ; rodada++) {
    itens = await diagnosticar(contexto)
    exibir(itens, contexto)

    const temConserto = itens.some(item => item.reparo)

    if (!perguntar || !temConserto || rodada >= RODADAS || !(await reparar(itens, contexto))) {
      break
    }

    alterou = true
    // O .env mudou: o estado que as famílias leram antes não vale mais.
    await Promise.all(contexto.grupos.map(grupo => grupo.familia.consultar?.(grupo, contexto)))
  }

  const erros = itens.filter(item => item.estado === 'erro').length
  const mensagens = criarMensagens(contexto.saida, contexto.estilo)

  mensagens.linha()
  if (erros > 0) {
    mensagens.erro(contexto.estilo.vermelho(`${erros} problema(s) impedem o ambiente de subir.`))
  } else {
    mensagens.ok(contexto.estilo.verde('Ambiente pronto.'))
  }

  return { ok: erros === 0, alterou }
}

/** Tabela de duas colunas: "✓ APP_KEY ........ definida". */
export function exibir(itens, { saida, estilo, servicos }) {
  const largura = larguraDoTerminal(saida)
  const linhas = [
    '',
    linhaDeDetalhe(estilo.suave('Serviços'), servicos.map(servico => servico.nome).join(', '), { largura, estilo }),
    ...itens.map(({ estado, item, detalhe }) =>
      linhaDeDetalhe(`${iconeDoEstado(estado, estilo)} ${item}`, corDoEstado(estado, estilo, detalhe), { largura, estilo }),
    ),
  ]

  saida.write(`${linhas.join('\n')}\n`)
}
