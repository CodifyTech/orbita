// Traduz a mensagem de erro do banco em "o que aconteceu" e "o que fazer", para o dev não receber um
// SQLSTATE cru. Porta do `ErroDeBanco.php` do FoodOS. A mensagem vem do PDO (via ambiente.php do
// preset laravel), mas os trechos dos clientes Node (mysql2, pg) também são reconhecidos.

export const TIPOS = Object.freeze({
  HOST_INEXISTENTE: 'host-inexistente',
  RECUSADA: 'recusada',
  ACESSO_NEGADO: 'acesso-negado',
  BANCO_INEXISTENTE: 'banco-inexistente',
})

const TRECHOS = {
  [TIPOS.HOST_INEXISTENTE]: ['getaddrinfo', 'php_network_getaddresses', 'Name or service not known', 'No such host', 'ENOTFOUND'],
  [TIPOS.RECUSADA]: ['[2002]', 'Connection refused', 'actively refused', 'recusou', 'could not connect to server', 'ECONNREFUSED'],
  [TIPOS.ACESSO_NEGADO]: ['[1045]', 'Access denied', 'password authentication failed', 'ER_ACCESS_DENIED_ERROR'],
  [TIPOS.BANCO_INEXISTENTE]: ['[1049]', 'Unknown database', 'does not exist', 'ER_BAD_DB_ERROR'],
}

const contem = (mensagem, trechos) => trechos.some(trecho => mensagem.toLowerCase().includes(trecho.toLowerCase()))

/**
 * Qual dos erros de conexão que o doctor sabe consertar é este (null: outro erro).
 *
 * @param {string} mensagem
 * @param {string} [driver] no sqlite, "does not exist" é arquivo faltando, não banco inexistente
 * @returns {string | null} um dos valores de TIPOS
 */
export function tipoDoErro(mensagem, driver = '') {
  for (const [tipo, trechos] of Object.entries(TRECHOS)) {
    if (tipo === TIPOS.BANCO_INEXISTENTE && driver === 'sqlite') {
      continue
    }
    if (contem(mensagem, trechos)) {
      return tipo
    }
  }

  return null
}

const EXTENSOES = { mysql: 'pdo_mysql', mariadb: 'pdo_mysql', pgsql: 'pdo_pgsql', sqlsrv: 'pdo_sqlsrv' }

/**
 * @typedef {object} Conexao como o ambiente.php descreve a conexão padrão
 * @property {string} [driver]
 * @property {string} [host]
 * @property {string} [porta]
 * @property {string} [banco]
 * @property {string} [usuario]
 */

/**
 * @param {string} mensagem
 * @param {Conexao} conexao
 * @param {string} [pasta] pasta do app, como o dev a enxerga (ex.: "backend")
 * @returns {{ problema: string, passos: string[] }}
 */
export function explicarErroDeBanco(mensagem, conexao = {}, pasta = '.') {
  const { driver = '?', host = '?', porta = '?', banco = '?', usuario = '?' } = conexao
  const env = `${pasta}/.env`
  const servidor = `${host}:${porta}`

  if (mensagem.includes('could not find driver')) {
    return {
      problema: `O PHP não tem a extensão do banco '${driver}' habilitada.`,
      passos: [
        'Rode `php --ini` para ver qual php.ini o terminal usa.',
        `Nele, descomente (tire o ;) a linha extension=${EXTENSOES[driver] ?? 'pdo_sqlite'} e abra um terminal novo.`,
      ],
    }
  }
  if (contem(mensagem, TRECHOS[TIPOS.HOST_INEXISTENTE])) {
    return {
      problema: `O host do banco (${servidor}) não foi encontrado.`,
      passos: [`Fora do Docker, use DB_HOST=127.0.0.1 no ${env} (o nome do container só vale dentro do compose).`],
    }
  }
  if (contem(mensagem, TRECHOS[TIPOS.RECUSADA])) {
    return {
      problema: `Nenhum servidor de banco respondeu em ${servidor}.`,
      passos: [
        'Inicie o banco: no WAMP, deixe o ícone verde; com Docker, `docker compose up -d` com o serviço do banco.',
        `Ou confira DB_HOST e DB_PORT no ${env}.`,
        'Ou, para começar sem servidor, use SQLite: DB_CONNECTION=sqlite e DB_DATABASE=database/database.sqlite.',
      ],
    }
  }
  if (contem(mensagem, TRECHOS[TIPOS.ACESSO_NEGADO])) {
    return {
      problema: `O banco recusou o usuário '${usuario}'.`,
      passos: [`Corrija DB_USERNAME e DB_PASSWORD no ${env}.`],
    }
  }
  if (contem(mensagem, TRECHOS[TIPOS.BANCO_INEXISTENTE]) && driver !== 'sqlite') {
    return {
      problema: `O banco '${banco}' não existe e o usuário não tem permissão para criá-lo.`,
      passos: [
        `Crie o banco: CREATE DATABASE \`${banco}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
        'Ou use um usuário com permissão de CREATE em DB_USERNAME.',
      ],
    }
  }
  if (driver === 'sqlite' && contem(mensagem, ['unable to open database file', 'does not exist'])) {
    return {
      problema: `Não foi possível abrir o arquivo SQLite '${banco}'.`,
      passos: [
        `Use DB_DATABASE=database/database.sqlite no ${env} (relativo à pasta ${pasta}/).`,
        'Confira se a pasta existe e se você tem permissão de escrita nela.',
      ],
    }
  }

  return {
    problema: `Erro do banco: ${(mensagem.split('\n')[0] ?? '').slice(0, 300)}`,
    passos: [
      'Se uma migration ficou pela metade, recrie o banco do zero: `php artisan migrate:fresh --seed` (apaga todos os dados).',
      `Detalhes completos em ${pasta}/storage/logs/laravel.log.`,
    ],
  }
}
