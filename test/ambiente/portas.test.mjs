import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { describe, it } from 'node:test'
import { aguardarLiberar, descrever, dono, emUso, escutando, identificar, proximaLivre } from '../../src/ambiente/portas.mjs'

/** Abre um servidor numa porta livre escolhida pelo sistema e devolve { porta, fechar }. */
function abrirServidor(host = '127.0.0.1', porta = 0) {
  return new Promise((resolve, reject) => {
    const servidor = createServer()
    servidor.once('error', reject)
    servidor.listen(porta, host, () => {
      resolve({
        porta: servidor.address().port,
        fechar: () => new Promise(ok => servidor.close(ok)),
      })
    })
  })
}

describe('identificar', () => {
  it('node, php e bun são encerráveis; o resto não', () => {
    assert.equal(identificar(1, 'node.exe').encerravel, true)
    assert.equal(identificar(1, 'PHP.EXE').encerravel, true)
    assert.equal(identificar(1, 'bun').encerravel, true)
    assert.equal(identificar(1, 'wslrelay.exe').encerravel, false)
    assert.equal(identificar(1, 'docker-proxy').encerravel, false)
  })

  it('dá a dica certa para cada tipo de dono', () => {
    assert.match(identificar(1, 'wslrelay.exe').dica, /WSL/)
    assert.match(identificar(1, 'php.exe').dica, /artisan serve/)
    assert.match(identificar(1, 'node').dica, /Vite/)
    assert.match(identificar(1, 'com.docker.backend.exe').dica, /Docker/)
    assert.match(identificar(1, 'vpnkit.exe').dica, /Docker/)
    assert.match(identificar(1, 'skype.exe').dica, /outro programa/)
  })

  it('sem nome, usa o PID', () => {
    assert.equal(identificar(42, null).nome, 'PID 42')
  })
})

describe('descrever', () => {
  it('mostra nome e PID, ou "outro processo"', () => {
    assert.equal(descrever({ nome: 'node.exe', pid: 7 }), 'node.exe (PID 7)')
    assert.equal(descrever(null), 'outro processo')
  })
})

describe('portas (sistema real)', () => {
  it('emUso: verdadeiro com servidor ouvindo, falso depois que ele fecha', async () => {
    const { porta, fechar } = await abrirServidor()

    assert.equal(await emUso(porta), true)
    await fechar()
    assert.equal(await emUso(porta), false)
  })

  it('emUso enxerga servidor que escuta só no IPv6 (caso do Vite no Windows)', async t => {
    let servidor

    try {
      servidor = await abrirServidor('::1')
    } catch {
      return t.skip('máquina sem IPv6')
    }

    assert.equal(await emUso(servidor.porta), true)
    await servidor.fechar()
  })

  it('proximaLivre pula a porta ocupada e as reservadas', async () => {
    const { porta, fechar } = await abrirServidor()

    try {
      const proxima = await proximaLivre(porta - 1, [porta + 1])

      assert.notEqual(proxima, porta)
      assert.notEqual(proxima, porta + 1)
      assert.ok(proxima > porta - 1)
    } finally {
      await fechar()
    }
  })

  it('escutando e dono: apontam este processo como dono da porta aberta', async () => {
    const { porta, fechar } = await abrirServidor()

    try {
      const portas = await escutando()
      assert.equal(portas.get(porta), process.pid)

      const quem = await dono(porta)
      assert.equal(quem.pid, process.pid)
      assert.match(quem.nome, /node|bun/i)
      assert.equal(quem.encerravel, true)
    } finally {
      await fechar()
    }
  })

  it('dono de porta livre é null', async () => {
    const { porta, fechar } = await abrirServidor()
    await fechar()

    assert.equal(await dono(porta), null)
  })

  it('aguardarLiberar devolve true quando a porta já está livre e false quando não libera', async () => {
    const livre = await abrirServidor()
    await livre.fechar()
    assert.equal(await aguardarLiberar(livre.porta, 2, 10), true)

    const ocupada = await abrirServidor()
    try {
      assert.equal(await aguardarLiberar(ocupada.porta, 2, 10), false)
    } finally {
      await ocupada.fechar()
    }
  })
})

describe('escutando (executor falso)', () => {
  const executor = respostas => async comando => respostas[comando] ?? { ok: false, saida: '', erro: '' }

  const ok = saida => ({ ok: true, saida, erro: '' })
  const falha = { ok: false, saida: '', erro: '' }

  const netstat = async (comando, args) => {
    if (comando !== 'netstat') {
      return falha
    }

    return ok(
      args.includes('TCPv6')
        ? '  TCP    [::]:5173    [::]:0    LISTENING    50'
        : '  TCP    0.0.0.0:8000    0.0.0.0:0    LISTENING    40',
    )
  }

  it('Windows: prefere o Get-NetTCPConnection do PowerShell', async () => {
    const powershell = async comando =>
      comando === 'powershell'
        ? ok(JSON.stringify([{ LocalPort: 7000, OwningProcess: 70, RemoteAddress: '0.0.0.0', RemotePort: 0 }]))
        : assert.fail('não deveria cair no netstat')

    assert.deepEqual([...(await escutando({ executar: powershell, plataforma: 'win32' }))], [[7000, 70]])
  })

  it('Windows: sem resposta do PowerShell, cai para o netstat (TCP e TCPv6)', async () => {
    assert.deepEqual([...(await escutando({ executar: netstat, plataforma: 'win32' }))].sort(), [
      [5173, 50],
      [8000, 40],
    ])
  })

  it('Linux: usa o lsof; sem lsof, cai para o ss', async () => {
    const comLsof = executor({ lsof: { ok: true, saida: 'p9\nn*:3000\n', erro: '' } })
    const semLsof = executor({ ss: { ok: true, saida: 'LISTEN 0 1 *:4000 *:* users:(("node",pid=8,fd=1))', erro: '' } })

    assert.deepEqual([...(await escutando({ executar: comLsof, plataforma: 'linux' }))], [[3000, 9]])
    assert.deepEqual([...(await escutando({ executar: semLsof, plataforma: 'linux' }))], [[4000, 8]])
  })
})
