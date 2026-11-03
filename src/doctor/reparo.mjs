// Oferece, item a item, o conserto do que o diagnóstico encontrou. A porta é genérica (mora aqui);
// o resto (banco, migrations…) é da família que sabe consertar.
import { descrever, dono, proximaLivre } from '../ambiente/portas.mjs'
import { gravarPortaPermanente, ondeFicaAPorta } from '../projeto/troca-de-porta.mjs'
import { criarMensagens } from '../ui/mensagens.mjs'

/**
 * @param {import('../presets/tipos.mjs').Item[]} itens
 * @param {import('../presets/tipos.mjs').Contexto} contexto
 * @returns {Promise<boolean>} true se algo mudou (vale conferir o ambiente de novo)
 */
export async function reparar(itens, contexto) {
  let alterou = false

  for (const item of itens.filter(item => item.reparo)) {
    const feito =
      item.reparo.tipo === 'porta'
        ? await repararPorta(item.reparo.servico, contexto)
        : await (item.grupo?.familia.reparar?.(item, contexto) ?? false)

    alterou = feito || alterou
  }

  return alterou
}

async function repararPorta(servico, contexto) {
  const { perguntas, saida, estilo } = contexto
  const mensagens = criarMensagens(saida, estilo)
  const antiga = servico.porta
  const reservadas = contexto.servicos.filter(outro => outro !== servico && outro.porta).map(outro => outro.porta)
  const [quem, nova] = await Promise.all([dono(antiga), proximaLivre(antiga, reservadas)])

  mensagens.titulo(`Porta ${antiga} (${servico.nome}) em uso por ${descrever(quem)}`)

  if (nova === null) {
    mensagens.erro(`Não achei porta livre perto da ${antiga}. Libere-a ou defina ${ondeFicaAPorta(servico, contexto).chave} no .env.`)

    return false
  }

  mensagens.linha(`  Sugestão: trocar de ${estilo.vermelho(String(antiga))} para ${estilo.verde(String(nova))}`)

  if (!(await perguntas.confirmar(`Trocar a porta do ${servico.nome} para a ${nova} (grava no .env)?`))) {
    return false
  }

  const arquivo = gravarPortaPermanente(servico, nova, contexto)
  mensagens.ok(`${servico.nome}: porta ${nova} gravada em ${arquivo}.`)

  return true
}
