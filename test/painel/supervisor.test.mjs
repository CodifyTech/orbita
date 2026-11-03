import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { criarEstado, servicoDe, tarefasDe } from '../../src/painel/estado.mjs'
import { criarSupervisor, TENTATIVAS } from '../../src/painel/supervisor.mjs'
import { criarExecutorDeTarefas } from '../../src/painel/tarefas.mjs'
import { criarPlanoFalso, criarProcessoFalso, proximoCiclo } from '../_ajudantes/plano-falso.mjs'

/** Supervisor com processos, relógio, timers e saúde falsos. */
function montar(plano = criarPlanoFalso()) {
  const estado = criarEstado(plano)
  const filhos = []
  const encerrados = []
  const timers = []
  const relogio = { agora: 1_000_000 }
  let proximoPid = 100
  const respostas = []

  const supervisor = criarSupervisor(estado, {
    colunas: () => 100,
    iniciarFilho: (comando, opcoes) => {
      const filho = criarProcessoFalso(proximoPid++)
      filho.comando = comando
      filho.opcoes = opcoes
      filhos.push(filho)

      return filho
    },
    encerrarFilho: filho => encerrados.push(filho.pid),
    encerrarFilhoJa: filho => encerrados.push(`já:${filho.pid}`),
    aguardarPorta: async () => {},
    consultar: async () => respostas.shift() ?? null,
    agendar: (fn, ms) => timers.push({ fn, ms }),
    cancelar: () => {},
    relogio: () => relogio.agora,
  })

  return { estado, supervisor, filhos, encerrados, timers, relogio, respostas }
}

const textos = s => s.linhas.map(l => l.texto)

describe('supervisor: subir', () => {
  it('sobe cada processo com o comando, a pasta e o env do plano (sem cor, com COLUMNS)', () => {
    const { estado, supervisor, filhos } = montar()
    supervisor.iniciarTodos()
    assert.deepEqual(filhos.map(f => f.comando), ['php artisan serve', 'php artisan queue:listen'])
    const { cwd, env } = filhos[0].opcoes
    assert.equal(cwd, '/projeto/backend')
    assert.equal(env.APP_PORT, '8000')
    assert.equal(env.FORCE_COLOR, '0')
    assert.equal(env.NO_COLOR, '1')
    assert.equal(env.COLUMNS, '84')
    const server = servicoDe(estado, 'server')
    assert.equal(server.estado, 'subindo')
    assert.equal(server.pid, 100)
    assert.deepEqual(textos(server), ['▶ php artisan serve'])
  })

  it('a saída do processo vira linha do serviço', async () => {
    const { estado, supervisor, filhos } = montar()
    supervisor.iniciarTodos()
    filhos[0].stdout.write('Server running on [http://127.0.0.1:8000]\n')
    filhos[0].stderr.write('ERROR: algo\n')
    await proximoCiclo()
    const server = servicoDe(estado, 'server')
    assert.deepEqual(textos(server).slice(1), ['Server running on [http://127.0.0.1:8000]', 'ERROR: algo'])
    assert.equal(estado.alertas.length, 1)
  })

  it('sem saúde, fica no ar depois de 2,5 s vivo; com saúde, segue a checagem', async () => {
    const { estado, supervisor, relogio, respostas } = montar()
    supervisor.iniciarTodos()
    relogio.agora += 3000
    respostas.push({ status: 200, ms: 4 })
    supervisor.supervisionar()
    await proximoCiclo()
    assert.equal(servicoDe(estado, 'queue').estado, 'online')
    const server = servicoDe(estado, 'server')
    assert.equal(server.estado, 'online')
    assert.equal(server.latencia, 4)
    assert.match(textos(server).at(-1), /✔ no ar em 3s/)
  })
})

describe('supervisor: quedas', () => {
  it('reinicia sozinho com espera dobrando e desiste depois de 5 tentativas', () => {
    const { estado, supervisor, filhos, timers } = montar()
    const queue = servicoDe(estado, 'queue')
    supervisor.iniciar(queue)
    for (let i = 0; i < TENTATIVAS; i++) {
      filhos.at(-1).sair(1)
      assert.equal(queue.estado, 'reiniciando')
      timers.at(-1).fn()
    }
    assert.deepEqual(timers.map(t => t.ms), [1000, 2000, 4000, 8000, 16000])
    filhos.at(-1).sair(1)
    assert.equal(queue.estado, 'caiu')
    assert.equal(queue.reinicios, TENTATIVAS)
    assert.match(textos(queue).at(-1), /desisti depois de 5 tentativas; r reinicia/)
    assert.equal(estado.alertas.filter(a => a.s === queue).length > 0, true)
  })

  it('processo que viveu mais de 30 s zera as tentativas', () => {
    const { estado, supervisor, filhos, timers, relogio } = montar()
    const queue = servicoDe(estado, 'queue')
    supervisor.iniciar(queue)
    filhos.at(-1).sair(1)
    timers.at(-1).fn()
    relogio.agora += 31_000
    filhos.at(-1).sair(1)
    assert.equal(queue.tentativas, 1)
    assert.equal(timers.at(-1).ms, 1000)
  })

  it('sem `reiniciar` no plano, cai e fica caído', () => {
    const { estado, supervisor, filhos, timers } = montar(criarPlanoFalso({ reiniciar: false }))
    const queue = servicoDe(estado, 'queue')
    supervisor.iniciar(queue)
    filhos.at(-1).sair(null, 'SIGKILL')
    assert.equal(queue.estado, 'caiu')
    assert.equal(timers.length, 0)
    assert.match(textos(queue).at(-1), /queue caiu \(SIGKILL\) depois de 0s — r reinicia/)
  })
})

describe('supervisor: a pedido', () => {
  it('reiniciar: para, espera sair e sobe de novo', async () => {
    const { estado, supervisor, filhos, encerrados } = montar()
    const server = servicoDe(estado, 'server')
    supervisor.iniciar(server)
    supervisor.reiniciar(server)
    assert.equal(server.estado, 'reiniciando')
    assert.deepEqual(encerrados, [100])
    filhos[0].sair(0)
    await proximoCiclo()
    assert.equal(filhos.length, 2)
    assert.equal(server.estado, 'subindo')
    assert.equal(server.reinicios, 1)
  })

  it('alternar: para o que está de pé e sobe o parado', () => {
    const { estado, supervisor, filhos } = montar()
    const queue = servicoDe(estado, 'queue')
    supervisor.iniciar(queue)
    supervisor.alternar(queue)
    assert.equal(queue.estado, 'parando')
    filhos[0].sair(0)
    assert.equal(queue.estado, 'parado')
    supervisor.alternar(queue)
    assert.equal(filhos.length, 2)
  })

  it('aba que não é processo não reinicia', () => {
    const { estado, supervisor } = montar()
    supervisor.reiniciar(servicoDe(estado, 'laravel'))
    assert.match(estado.toast.texto, /não é um processo/)
  })

  it('falha ao criar o processo não deixa o serviço "subindo" para sempre', () => {
    const { estado, supervisor, filhos } = montar(criarPlanoFalso({ reiniciar: false }))
    const queue = servicoDe(estado, 'queue')
    supervisor.iniciar(queue)
    filhos[0].pid = undefined
    filhos[0].emit('error', new Error('spawn ENOENT'))
    assert.equal(queue.estado, 'caiu')
    assert.ok(textos(queue).some(t => t.includes('Não consegui iniciar: spawn ENOENT')))
  })
})

describe('supervisor: encerrar', () => {
  it('pede para todos pararem, não reinicia ninguém e não sobe nada novo', () => {
    const { estado, supervisor, filhos, encerrados, timers } = montar()
    supervisor.iniciarTodos()
    estado.encerrando = true
    supervisor.encerrarTodos()
    assert.deepEqual(encerrados, [100, 101])
    assert.equal(supervisor.todosParados(), false)
    filhos.forEach(f => f.sair(1))
    assert.equal(supervisor.todosParados(), true)
    assert.equal(timers.length, 0)
    supervisor.iniciar(servicoDe(estado, 'server'))
    assert.equal(filhos.length, 2)
  })

  it('matarTudoAgora mata serviços e tarefas que ainda estão vivos', () => {
    const { estado, supervisor, encerrados } = montar()
    supervisor.iniciarTodos()
    estado.tarefas.add(criarProcessoFalso(999))
    supervisor.matarTudoAgora()
    assert.deepEqual(encerrados, ['já:100', 'já:101', 'já:999'])
  })
})

describe('tarefas', () => {
  it('roda na pasta pedida, mostra a aba tarefas e avisa o resultado', async () => {
    const estado = criarEstado(criarPlanoFalso())
    const filhos = []
    const rodar = criarExecutorDeTarefas(estado, {
      envFilhos: () => ({ X: '1' }),
      iniciarFilho: (comando, opcoes) => {
        const filho = criarProcessoFalso(500 + filhos.length)
        filho.opcoes = { comando, ...opcoes }
        filhos.push(filho)

        return filho
      },
      relogio: () => 0,
    })
    rodar({ titulo: 'Limpar caches', comando: 'php artisan optimize:clear', cwd: '/projeto/backend' })
    rodar({ titulo: 'na raiz', comando: 'ls' })
    const tarefas = tarefasDe(estado)
    assert.equal(estado.abaId, 'tarefas')
    assert.equal(tarefas.estado, 'rodando')
    assert.deepEqual(filhos.map(f => f.opcoes.cwd), ['/projeto/backend', '/projeto'])
    filhos[0].stdout.write('Cache limpo\n')
    await proximoCiclo()
    filhos[0].sair(0)
    assert.equal(tarefas.estado, 'rodando')
    filhos[1].sair(2)
    assert.equal(tarefas.estado, 'ocioso')
    assert.deepEqual(textos(tarefas), [
      '▶ Limpar caches — php artisan optimize:clear',
      '▶ na raiz — ls',
      'Cache limpo',
      '✔ Limpar caches: concluído em 0s',
      'na raiz falhou (código 2)',
    ])
    assert.equal(estado.tarefas.size, 0)
    assert.equal(tarefas.metricas.total, 2)
  })
})
