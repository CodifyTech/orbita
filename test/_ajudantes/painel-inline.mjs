// Roda o painel de verdade no modo inline com o plano recebido em JSON (argv[2]) e, depois de
// argv[3] ms, encerra como se o dev tivesse apertado Ctrl+C. Roda num processo próprio porque o
// painel registra ouvintes de sinal no processo inteiro (não é executado como teste).
import { iniciarPainel } from '../../src/painel/index.mjs'

const plano = JSON.parse(process.argv[2])
setTimeout(() => process.emit('SIGINT'), Number(process.argv[3] ?? 1500))

process.exit(await iniciarPainel(plano, { modo: 'inline' }))
