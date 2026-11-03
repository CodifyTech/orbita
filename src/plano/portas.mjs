// Antes de subir, cada porta ocupada vira uma pergunta: usar outra nesta execução, encerrar o
// processo que sobrou de outro `dev`, deixar o serviço de fora ou cancelar. Sem terminal interativo,
// troca de porta sozinho. Porta do `SubirCommand::resolverPortas` do FoodOS.
import { aguardarLiberar, descrever, dono, emUso, proximaLivre } from '../ambiente/portas.mjs'
import { encerrar } from '../ambiente/processos.mjs'
import { removerServicos } from '../projeto/contexto.mjs'
import { trocarPortaNaExecucao } from '../projeto/troca-de-porta.mjs'
import { apiLocal } from '../projeto/urls.mjs'
import { criarMensagens } from '../ui/mensagens.mjs'

/**
 * @param {import('../presets/tipos.mjs').Contexto} contexto
 * @returns {Promise<boolean>} false = cancelar
 */
export async function resolverPortas(contexto) {
  const mensagens = criarMensagens(contexto.saida, contexto.estilo)
  const reservadas = []

  for (const servico of [...contexto.servicos]) {
    const porta = servico.porta

    if (!porta) {
      continue
    }
    if (!(await emUso(porta))) {
      reservadas.push(porta)
      continue
    }

    const [quem, nova] = await Promise.all([dono(porta), proximaLivre(porta, reservadas)])
    let acao = await escolherAcao(servico, porta, nova, quem, contexto)

    if (acao === 'encerrar') {
      if (quem && (await encerrar(quem.pid)) && (await aguardarLiberar(porta))) {
        mensagens.ok(`${quem.nome} encerrado: o ${servico.nome} usa a porta ${porta}.`)
        reservadas.push(porta)
        continue
      }
      mensagens.aviso(`Não consegui encerrar ${descrever(quem)}.`)
      acao = nova === null ? 'cancelar' : 'trocar'
    }

    if (acao === 'cancelar') {
      return false
    }
    if (acao === 'pular') {
      removerServicos(contexto, [servico.nome])
      mensagens.ok(`O ${servico.nome} fica de fora desta execução.`)
      continue
    }

    const detalhe = trocarPortaNaExecucao(servico, nova, contexto)
    reservadas.push(nova)
    mensagens.ok(`${servico.nome}: porta ${porta} ocupada, usando a ${nova} nesta execução${detalhe}.`)
  }

  if (!contexto.servicos.length) {
    mensagens.erro('Nenhum serviço sobrou para subir.')

    return false
  }

  return true
}

async function escolherAcao(servico, porta, nova, quem, contexto) {
  const descricao = descrever(quem)

  if (!contexto.perguntas.interativo) {
    if (nova === null) {
      criarMensagens(contexto.saida, contexto.estilo).erro(`A porta ${porta} (${servico.nome}) está em uso por ${descricao} e não achei outra livre.`)

      return 'cancelar'
    }

    return 'trocar'
  }

  const ehApi = apiLocal(contexto.servicos)?.servico === servico
  const opcoes = [
    ...(nova !== null ? [{ valor: 'trocar', rotulo: `Usar a porta ${nova} nesta execução${ehApi ? ' (o frontend acompanha)' : ''}` }] : []),
    ...(quem?.encerravel ? [{ valor: 'encerrar', rotulo: `Encerrar ${descricao} e usar a ${porta}` }] : []),
    { valor: 'pular', rotulo: `Não subir o ${servico.nome} agora` },
    { valor: 'cancelar', rotulo: 'Cancelar' },
  ]

  return contexto.perguntas.escolher(`A porta ${porta} (${servico.nome}) está em uso por ${descricao}.`, opcoes, {
    padrao: opcoes[0].valor,
    dica: quem?.dica ?? '',
  })
}
