import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { explicarErroDeBanco, TIPOS, tipoDoErro } from '../../src/ambiente/erro-de-banco.mjs'

const mysql = { driver: 'mariadb', host: '127.0.0.1', porta: '3306', banco: 'loja', usuario: 'root' }

describe('tipoDoErro', () => {
  it('reconhece as mensagens do PDO (MySQL/MariaDB e Postgres)', () => {
    assert.equal(tipoDoErro('SQLSTATE[HY000] [2002] Connection refused'), TIPOS.RECUSADA)
    assert.equal(tipoDoErro('SQLSTATE[HY000] [2002] Nenhuma conexão pôde ser feita porque a máquina de destino as recusou ativamente'), TIPOS.RECUSADA)
    assert.equal(tipoDoErro("SQLSTATE[HY000] [1045] Access denied for user 'root'@'localhost'"), TIPOS.ACESSO_NEGADO)
    assert.equal(tipoDoErro("SQLSTATE[HY000] [1049] Unknown database 'loja'"), TIPOS.BANCO_INEXISTENTE)
    assert.equal(tipoDoErro('php_network_getaddresses: getaddrinfo for mariadb failed'), TIPOS.HOST_INEXISTENTE)
    assert.equal(tipoDoErro('FATAL: password authentication failed for user "x"'), TIPOS.ACESSO_NEGADO)
    assert.equal(tipoDoErro('FATAL: database "loja" does not exist'), TIPOS.BANCO_INEXISTENTE)
  })

  it('reconhece os equivalentes dos clientes Node', () => {
    assert.equal(tipoDoErro('connect ECONNREFUSED 127.0.0.1:3306'), TIPOS.RECUSADA)
    assert.equal(tipoDoErro('getaddrinfo ENOTFOUND db'), TIPOS.HOST_INEXISTENTE)
    assert.equal(tipoDoErro('ER_BAD_DB_ERROR: Unknown database'), TIPOS.BANCO_INEXISTENTE)
  })

  it('não confunde caixa', () => {
    assert.equal(tipoDoErro('CONNECTION REFUSED'), TIPOS.RECUSADA)
  })

  it('no sqlite, "does not exist" não é banco inexistente', () => {
    assert.equal(tipoDoErro('Database file at path x does not exist', 'sqlite'), null)
  })

  it('erro desconhecido dá null', () => {
    assert.equal(tipoDoErro('syntax error near SELECT'), null)
  })
})

describe('explicarErroDeBanco', () => {
  it('extensão faltando aponta a linha do php.ini', () => {
    const { problema, passos } = explicarErroDeBanco('could not find driver', mysql)

    assert.match(problema, /extensão do banco 'mariadb'/)
    assert.match(passos[1], /extension=pdo_mysql/)
  })

  it('conexão recusada traz o servidor e os caminhos (WAMP, Docker, SQLite)', () => {
    const { problema, passos } = explicarErroDeBanco('[2002] Connection refused', mysql, 'backend')

    assert.match(problema, /127\.0\.0\.1:3306/)
    assert.equal(passos.length, 3)
    assert.match(passos[1], /backend\/\.env/)
  })

  it('banco inexistente sugere o CREATE DATABASE', () => {
    assert.match(explicarErroDeBanco('Unknown database', mysql).passos[0], /CREATE DATABASE `loja`/)
  })

  it('sqlite que não abre fala do caminho relativo', () => {
    const { problema } = explicarErroDeBanco('unable to open database file', { driver: 'sqlite', banco: 'x.sqlite' })

    assert.match(problema, /arquivo SQLite 'x\.sqlite'/)
  })

  it('o resto mostra a primeira linha e sugere migrate:fresh', () => {
    const { problema, passos } = explicarErroDeBanco('Algo estranho\nstack trace', mysql, 'api')

    assert.equal(problema, 'Erro do banco: Algo estranho')
    assert.match(passos[0], /migrate:fresh --seed/)
    assert.match(passos[1], /api\/storage\/logs\/laravel\.log/)
  })
})
