// Consertos do Laravel que o doctor oferece: banco inacessível (host/porta, usuário/senha, banco
// inexistente) e migrations. Cada "sim" grava no .env do app; o doctor então confere tudo de novo.
// Porta do `ReparoDev.php` do FoodOS.
import { join } from 'node:path'
import { gravarEnv } from '../../ambiente/env.mjs'
import { explicarErroDeBanco, TIPOS, tipoDoErro } from '../../ambiente/erro-de-banco.mjs'
import { executarVisivel, precisaDeShell } from '../../ambiente/executar.mjs'
import { criarMensagens } from '../../ui/mensagens.mjs'
import { consultarLaravel } from './consulta.mjs'

/**
 * @param {import('../tipos.mjs').Item} item
 * @param {import('../tipos.mjs').Contexto} contexto
 * @returns {Promise<boolean>} true se mudou algo (vale conferir de novo)
 */
export async function repararLaravel(item, contexto) {
  if (item.reparo.tipo === 'banco') {
    return repararBanco(item.grupo, item.reparo.mensagem, contexto)
  }
  if (item.reparo.tipo === 'migrar') {
    return migrar(item.grupo, item.reparo.semente, contexto)
  }

  return false
}

/**
 * Oferece consertar a falha de conexão (também usado pelo `codify setup`).
 *
 * @returns {Promise<boolean>} true se mudou algo e vale tentar conectar de novo
 */
export async function repararBanco(grupo, mensagem, contexto) {
  const conexao = grupo.info.banco

  switch (tipoDoErro(mensagem, conexao.driver)) {
    case TIPOS.RECUSADA:
    case TIPOS.HOST_INEXISTENTE:
      return endereco(grupo, conexao, contexto)
    case TIPOS.ACESSO_NEGADO:
      return credenciais(grupo, conexao, contexto)
    case TIPOS.BANCO_INEXISTENTE:
      return bancoInexistente(grupo, conexao, contexto)
    default:
      return false
  }
}

async function endereco(grupo, conexao, { perguntas, saida, estilo }) {
  const mensagens = criarMensagens(saida, estilo)
  mensagens.titulo(`Nenhum banco respondeu em ${conexao.host}:${conexao.porta}`)

  if (!(await perguntas.confirmar('Deseja alterar o host e a porta do banco?'))) {
    return false
  }

  const host = await perguntas.texto('Host do banco', { padrao: conexao.host ?? '127.0.0.1', obrigatorio: true })
  const porta = await perguntas.texto('Porta do banco', {
    padrao: conexao.porta ?? '',
    obrigatorio: true,
    validar: valor => (/^\d+$/.test(valor) && Number(valor) >= 1 && Number(valor) <= 65535 ? null : 'Informe um número de 1 a 65535.'),
  })

  gravarNoEnv(grupo, { DB_HOST: host, DB_PORT: porta })
  mensagens.ok(`Banco: ${host}:${porta} gravado no ${grupo.pasta}/.env.`)

  return true
}

async function credenciais(grupo, conexao, { perguntas, saida, estilo }) {
  const mensagens = criarMensagens(saida, estilo)
  mensagens.titulo(`O banco recusou o usuário '${conexao.usuario}'`)

  if (!(await perguntas.confirmar('Deseja informar outro usuário e senha?'))) {
    return false
  }

  const usuario = await perguntas.texto('Usuário do banco', { padrao: conexao.usuario ?? '', obrigatorio: true })
  const senha = await perguntas.senha('Senha do usuário (deixe vazia se não tiver)')

  gravarNoEnv(grupo, { DB_USERNAME: usuario, DB_PASSWORD: senha })
  mensagens.ok(`Banco: usuário '${usuario}' gravado no ${grupo.pasta}/.env.`)

  return true
}

async function bancoInexistente(grupo, conexao, contexto) {
  const { perguntas, saida, estilo } = contexto
  const mensagens = criarMensagens(saida, estilo)
  let banco = conexao.banco

  mensagens.titulo(`O banco '${banco}' não existe`)

  const acao = await perguntas.escolher(
    'O que deseja fazer?',
    [
      { valor: 'criar', rotulo: `Criar o banco '${banco}'` },
      { valor: 'outro', rotulo: 'Configurar outro banco de dados' },
      { valor: 'nada', rotulo: 'Nada, eu resolvo' },
    ],
    { padrao: 'criar' },
  )

  if (acao === 'nada') {
    return false
  }
  if (acao === 'outro') {
    banco = await perguntas.texto('Nome do banco de dados', {
      obrigatorio: true,
      validar: valor => (/^[A-Za-z0-9_-]+$/.test(valor) ? null : 'Use só letras, números, _ ou -.'),
    })
    gravarNoEnv(grupo, { DB_DATABASE: banco })
  }

  const resultado = await consultarLaravel(grupo.cwd, ['criar-banco', banco], contexto)

  if (!resultado.ok) {
    mensagens.erro(`Não consegui criar o banco '${banco}': ${resultado.erro}`)

    return false
  }
  mensagens.ok(`Banco '${banco}' pronto.`)

  return true
}

async function migrar(grupo, semente, contexto) {
  const { perguntas, saida, estilo, php } = contexto
  const mensagens = criarMensagens(saida, estilo)

  mensagens.titulo(semente ? 'O banco nunca foi migrado' : 'Há migrations pendentes')

  const pergunta = semente
    ? 'Rodar as migrations e o seed agora (php artisan migrate --seed)?'
    : 'Rodar as migrations pendentes agora (php artisan migrate)?'

  if (!(await perguntas.confirmar(pergunta))) {
    return false
  }

  const ok = (await artisan(grupo, php, ['migrate', '--force'])) && (!semente || (await artisan(grupo, php, ['db:seed', '--force'])))

  if (!ok) {
    const { passos } = explicarErroDeBanco('', grupo.info.banco, grupo.pasta)
    mensagens.comoResolver('As migrations falharam (o erro está logo acima).', passos)
  }

  return ok
}

/** Roda `php artisan …` com a saída no terminal; true se deu certo. */
export async function artisan(grupo, php, args) {
  return (await executarVisivel(php, ['artisan', ...args], { cwd: grupo.cwd, shell: precisaDeShell() })) === 0
}

function gravarNoEnv(grupo, valores) {
  for (const [chave, valor] of Object.entries(valores)) {
    gravarEnv(join(grupo.cwd, '.env'), chave, valor)
  }
}
