// Etapas do `codify setup` para um app Laravel: .env, chaves, banco (migrate e, se vazio, seed).
// Porta do `SetupCommand.php` do FoodOS. Pode rodar de novo sem estragar nada.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { gravarEnv } from '../../ambiente/env.mjs'
import { explicarErroDeBanco, TIPOS, tipoDoErro } from '../../ambiente/erro-de-banco.mjs'
import { criarMensagens } from '../../ui/mensagens.mjs'
import { consultarLaravel, explicarFalha } from './consulta.mjs'
import { artisan, repararBanco } from './reparo.mjs'

const TENTATIVAS_DE_CONEXAO = 6
const RODAPE = 'Depois rode `codify setup` de novo.'

/**
 * @param {import('../tipos.mjs').Grupo} grupo
 * @param {import('../tipos.mjs').Contexto} contexto
 * @returns {import('../tipos.mjs').Etapa[]}
 */
export function configuracaoLaravel(grupo) {
  const env = join(grupo.cwd, '.env')

  return [
    {
      titulo: `Arquivo de configuração (${grupo.pasta})`,
      porque: `Criando o ${grupo.pasta}/.env, onde ficam banco, chaves e portas da sua máquina.`,
      pular: () => existsSync(env),
      executar: async contexto => criarEnv(grupo, contexto),
    },
    {
      titulo: 'Chaves de segurança',
      porque: 'Gerando a chave da aplicação e o segredo do JWT, que protegem o login e os tokens da API.',
      executar: async contexto => chaves(grupo, contexto),
    },
    {
      titulo: 'Banco de dados',
      porque: 'Conectando no banco, criando as tabelas (migrations) e, se ele estiver vazio, carregando os dados de exemplo (seed).',
      executar: async contexto => banco(grupo, contexto),
    },
  ]
}

async function criarEnv(grupo, { saida, estilo }) {
  const mensagens = criarMensagens(saida, estilo)
  const exemplo = join(grupo.cwd, '.env.example')

  if (!existsSync(exemplo)) {
    mensagens.comoResolver(`Não achei ${grupo.pasta}/.env.example para criar o .env.`, [`Crie o ${grupo.pasta}/.env (o README do projeto costuma dizer o que vai nele).`], RODAPE)

    return false
  }

  copyFileSync(exemplo, join(grupo.cwd, '.env'))
  mensagens.ok(`${grupo.pasta}/.env criado a partir do .env.example.`)

  return true
}

/** Relê o estado do app (o .env pode ter mudado na etapa anterior). */
async function atualizar(grupo, contexto) {
  const resposta = await consultarLaravel(grupo.cwd, ['info'], contexto)
  grupo.info = resposta.ok ? resposta : null
  grupo.falha = resposta.ok ? null : resposta

  return resposta.ok
}

async function chaves(grupo, contexto) {
  const mensagens = criarMensagens(contexto.saida, contexto.estilo)

  if (!(await atualizar(grupo, contexto))) {
    const { detalhe, passos } = explicarFalha(grupo.falha, grupo.pasta)
    mensagens.comoResolver(`O Laravel de ${grupo.pasta}/ não iniciou: ${detalhe}.`, passos, RODAPE)

    return false
  }

  if (!grupo.info.app.chave && !(await artisan(grupo, contexto.php, ['key:generate', '--force']))) {
    mensagens.comoResolver('O key:generate falhou (o erro está logo acima).', [`Rode \`php artisan key:generate\` em ${grupo.pasta}/.`], RODAPE)

    return false
  }
  if (grupo.info.jwt.usa && !grupo.info.jwt.segredo && !(await artisan(grupo, contexto.php, ['jwt:secret', '--force']))) {
    mensagens.comoResolver('O jwt:secret falhou (o erro está logo acima).', [`Rode \`php artisan jwt:secret\` em ${grupo.pasta}/.`], RODAPE)

    return false
  }

  mensagens.ok('Chaves prontas.')

  return true
}

async function banco(grupo, contexto) {
  const mensagens = criarMensagens(contexto.saida, contexto.estilo)
  const falhar = (titulo, mensagem) => {
    const { problema, passos } = explicarErroDeBanco(mensagem, grupo.info?.banco ?? {}, grupo.pasta)
    mensagens.comoResolver(`${titulo}. ${problema}`, passos, RODAPE)

    return false
  }

  if (!(await atualizar(grupo, contexto))) {
    return falhar('Não consegui ler a configuração do banco', grupo.falha.erro)
  }

  if (grupo.info.banco.driver === 'sqlite' && prepararSqlite(grupo, mensagens) && !(await atualizar(grupo, contexto))) {
    return falhar('Não consegui ler a configuração do banco', grupo.falha.erro)
  }

  let vazio = true

  for (let tentativa = 1; ; tentativa++) {
    const { estado, erro, rodadas } = grupo.info.banco

    if (estado !== 'sem-conexao') {
      vazio = estado !== 'ok' && estado !== 'pendentes' ? true : rodadas === 0
      break
    }

    // Com terminal, oferece consertar (host/porta, usuário/senha, criar o banco) e tenta de novo.
    if (contexto.perguntas.interativo && tentativa < TENTATIVAS_DE_CONEXAO && (await repararBanco(grupo, erro, contexto))) {
      await atualizar(grupo, contexto)
      continue
    }

    // Banco MySQL/Postgres que ainda não existe: o `migrate --force` cria.
    if (tipoDoErro(erro, grupo.info.banco.driver) !== TIPOS.BANCO_INEXISTENTE) {
      return falhar(`Não consegui conectar no banco (${grupo.info.banco.conexao})`, erro)
    }
    break
  }

  if (!(await artisan(grupo, contexto.php, ['migrate', '--force']))) {
    return falhar('As migrations falharam (o erro está logo acima)', '')
  }

  if (!vazio) {
    mensagens.ok('O banco já tinha dados: rodei só as migrations novas, sem o seed.')
    mensagens.linha(`    Para recriar do zero com os dados de exemplo: ${contexto.estilo.amarelo('php artisan migrate:fresh --seed')} (apaga tudo).`)

    return true
  }

  if (!(await artisan(grupo, contexto.php, ['db:seed', '--force']))) {
    return falhar('O seed (dados de exemplo) falhou (o erro está logo acima)', '')
  }

  mensagens.ok('Banco pronto, com os dados de exemplo.')

  return true
}

/**
 * DB_DATABASE vazio vira database/database.sqlite (relativo à pasta do app) e o arquivo é criado
 * se faltar. Devolve true se mudou algo.
 */
function prepararSqlite(grupo, mensagens) {
  let caminho = grupo.info.banco.banco ?? ''

  if (caminho === ':memory:') {
    return false
  }

  let mudou = false

  if (caminho === '') {
    caminho = 'database/database.sqlite'
    gravarEnv(join(grupo.cwd, '.env'), 'DB_DATABASE', caminho)
    mensagens.ok(`DB_DATABASE estava vazio: usando ${caminho}.`)
    mudou = true
  }

  const absoluto = isAbsolute(caminho) ? caminho : join(grupo.cwd, caminho)

  if (!existsSync(absoluto)) {
    mkdirSync(dirname(absoluto), { recursive: true })
    writeFileSync(absoluto, '')
    mensagens.ok(`Banco SQLite criado em ${caminho}.`)
    mudou = true
  }

  return mudou
}
