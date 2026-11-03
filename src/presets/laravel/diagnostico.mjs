// Doctor do Laravel: chaves, banco (conexão e migrations), Redis, fila e a chave do Reverb no frontend.
// Porta do `DiagnosticoDev.php` do FoodOS; o estado vem do ambiente.php (grupo.info).
import { envDoFrontend } from '../../projeto/urls.mjs'
import { ehFrontendVite } from '../node.mjs'
import { explicarFalha } from './consulta.mjs'

const tem = (grupo, preset) => grupo.servicos.some(servico => servico.preset?.nome === preset)

/**
 * @param {import('../tipos.mjs').Grupo} grupo
 * @param {import('../tipos.mjs').Contexto} contexto
 * @returns {Promise<import('../tipos.mjs').Item[]>}
 */
export async function diagnosticarLaravel(grupo, contexto) {
  if (grupo.falha) {
    return [{ estado: 'erro', item: `Laravel (${grupo.pasta})`, detalhe: explicarFalha(grupo.falha, grupo.pasta).detalhe, reparo: null }]
  }

  const { info } = grupo
  const itens = []
  const ok = (item, detalhe) => itens.push({ estado: 'ok', item, detalhe, reparo: null })
  const aviso = (item, detalhe, reparo = null) => itens.push({ estado: 'aviso', item, detalhe, reparo, grupo })
  const erro = (item, detalhe, reparo = null) => itens.push({ estado: 'erro', item, detalhe, reparo, grupo })

  info.app.chave ? ok('APP_KEY', 'definida') : erro('APP_KEY', 'vazia — rode `codify setup` (ou `php artisan key:generate`)')

  if (info.jwt.usa) {
    info.jwt.segredo ? ok('JWT_SECRET', 'definido') : erro('JWT_SECRET', 'vazio, o login falha — rode `php artisan jwt:secret`')
  }

  diagnosticarBanco(info.banco, { ok, aviso, erro })

  // O ambiente.php testa o Redis quando o Horizon foi declarado, mas ele pode ter saído no ajuste
  // (sem pcntl): aí o Redis só importa se a fila ou o cache usam.
  const usaRedis = tem(grupo, 'laravel:horizon') || info.fila.conexao === 'redis' || info.cache === 'redis'

  if (!usaRedis) {
    // nada a checar
  } else if (info.redis.estado === 'ok') {
    ok('Redis', info.redis.endereco)
  } else if (info.redis.estado === 'erro') {
    erro('Redis', `sem conexão: ${info.redis.erro.slice(0, 100)} — suba o Redis (ex.: \`docker compose up -d redis\`)`)
  }

  diagnosticarFila(grupo, { ok, aviso })

  if (tem(grupo, 'laravel:reverb') && info.reverb) {
    diagnosticarChaveDoReverb(info.reverb.chave, contexto, { ok, aviso })
  }

  return itens
}

function diagnosticarBanco(banco, { ok, aviso, erro }) {
  const item = `Banco (${banco.conexao})`

  switch (banco.estado) {
    case 'sqlite-inexistente':
      return erro(item, `arquivo SQLite não existe ('${banco.banco}') — rode \`codify setup\``)
    case 'sem-conexao':
      return erro(item, `sem conexão: ${banco.erro.slice(0, 120)}`, { tipo: 'banco', mensagem: banco.erro })
    case 'nunca-migrado':
      return aviso(item, 'conecta, mas nunca foi migrado — rode `php artisan migrate --seed`', { tipo: 'migrar', semente: true })
    case 'pendentes':
      return aviso(item, `${banco.pendentes} migration(s) pendente(s) — rode \`php artisan migrate\``, { tipo: 'migrar', semente: false })
    default:
      return ok(item, 'conectado, migrations em dia')
  }
}

function diagnosticarFila(grupo, { ok, aviso }) {
  const { conexao, filas } = grupo.info.fila

  if (conexao === 'sync') {
    aviso('Fila', 'QUEUE_CONNECTION=sync: jobs rodam na requisição e o worker fica ocioso')
  } else if (tem(grupo, 'laravel:horizon')) {
    ok('Fila', `Horizon (${conexao})`)
  } else if (tem(grupo, 'laravel:queue')) {
    const motivo = conexao === 'redis' && !grupo.info.pcntl ? ', sem pcntl para o Horizon' : ''
    ok('Fila', `queue:listen (${conexao}${motivo}), ${filas.length} filas`)
  }
}

/** O frontend (Vite) precisa da mesma chave do Reverb, senão o websocket é recusado. */
function diagnosticarChaveDoReverb(chave, contexto, { ok, aviso }) {
  const pastas = new Map(contexto.servicos.filter(ehFrontendVite).map(servico => [servico.cwd, servico.pasta]))

  for (const [cwd, pasta] of pastas) {
    const doFrontend = envDoFrontend(cwd).VITE_REVERB_APP_KEY ?? ''
    const item = `VITE_REVERB_APP_KEY (${pasta})`

    if (doFrontend === '') {
      aviso(item, 'vazia: o app funciona, mas sem tempo real')
    } else if (doFrontend !== chave) {
      aviso(item, 'diferente da REVERB_APP_KEY do backend: o websocket será recusado')
    } else {
      ok(item, 'igual à do backend')
    }
  }
}
