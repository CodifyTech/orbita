// O roteador de verdade, num `php -S` de verdade, contra um app de mentira (sem Laravel: pasta temporária
// com um public/index.php). Sem PHP com pdo_sqlite na máquina, os testes são pulados.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { ROTEADOR, SCRIPT } from '../../src/presets/laravel/consulta.mjs'
import { lerRequisicao } from '../../src/painel/metricas.mjs'

const PHP = process.env.ORBITA_PHP || 'php'
const disponivel = spawnSync(PHP, ['-r', 'echo extension_loaded("pdo_sqlite") ? "sim" : "nao";'], { encoding: 'utf8' }).stdout?.includes('sim')
const descrever = disponivel ? describe : describe.skip

const APP = String.raw`<?php
$caminho = strtok($_SERVER['REQUEST_URI'], '?');
header('X-Teste: 1');
if ($caminho === '/login') {
    http_response_code(201);
    header('Content-Type: application/json');
    header('Set-Cookie: sessao=abc');
    echo json_encode(['access_token' => 'segredo', 'ok' => true]);
    return;
}
if ($caminho === '/binario') { echo "\xff\xfe\x00"; return; }
if ($caminho === '/grande') { echo str_repeat("\u{E1}", 40000); return; }
if ($caminho === '/morre') { http_response_code(500); echo 'antes'; exit; }
echo 'oi';
`

const portaLivre = () =>
  new Promise(resolve => {
    const servidor = createServer().listen(0, '127.0.0.1', () => {
      const { port } = servidor.address()
      servidor.close(() => resolve(port))
    })
  })

descrever('roteador do php -S', () => {
  let pasta
  let filho
  let base
  let saida = ''

  /** Faz o request e devolve o que o painel leu da linha que ele gerou. */
  async function pedir(caminho, opcoes = {}) {
    const antes = saida.length
    const resposta = await fetch(base + caminho, opcoes)
    const corpo = await resposta.text()
    for (let i = 0; i < 100 && !saida.slice(antes).includes(' ~ '); i++) {
      await new Promise(r => setTimeout(r, 30))
    }
    const linha = saida.slice(antes).split('\n').find(l => l.includes(' ~ '))

    return { resposta, corpo, req: linha ? lerRequisicao(linha.trim()) : null }
  }

  const detalhe = id =>
    JSON.parse(spawnSync(PHP, [SCRIPT, pasta, 'request-gravado'], { encoding: 'utf8', env: { ...process.env, ORBITA_REQUEST: JSON.stringify({ id }) } }).stdout.match(/\{"ok".*/s)[0])
  const secao = (dados, titulo) => dados.secoes.find(s => s.titulo === titulo).valor

  before(async () => {
    pasta = mkdtempSync(join(tmpdir(), 'orbita-servidor-'))
    mkdirSync(join(pasta, 'public'))
    mkdirSync(join(pasta, 'storage', 'logs'), { recursive: true })
    writeFileSync(join(pasta, 'public', 'index.php'), APP)
    writeFileSync(join(pasta, 'public', 'estatico.txt'), 'arquivo')
    const porta = await portaLivre()
    base = `http://127.0.0.1:${porta}`
    filho = spawn(PHP, ['-S', `127.0.0.1:${porta}`, '-t', 'public', ROTEADOR], { cwd: pasta })
    filho.stdout.on('data', d => (saida += d))
    filho.stderr.on('data', d => (saida += d))
    for (let i = 0; i < 100; i++) {
      if (await fetch(base, { headers: { 'user-agent': 'codify-orbita' } }).catch(() => null)) {
        return
      }
      await new Promise(r => setTimeout(r, 50))
    }
  })

  after(async () => {
    const saiu = new Promise(resolve => filho.once('exit', resolve))
    filho.kill()
    await saiu
    rmSync(pasta, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })

  it('escreve verbo, status e id, e grava o request', async () => {
    const { resposta, corpo, req } = await pedir('/login?origem=app', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer abc' },
      body: JSON.stringify({ email: 'a@b.c', password: 'minha-senha', perfil: { token: 't' } }),
    })
    assert.equal(resposta.status, 201)
    assert.equal(resposta.headers.get('x-teste'), '1')
    assert.equal(corpo, '{"access_token":"segredo","ok":true}', 'o cliente recebe a resposta intacta')
    assert.equal(req.metodo, 'POST')
    assert.equal(req.status, 201)
    assert.equal(req.caminho, '/login')

    const dados = detalhe(req.id)
    assert.equal(dados.ok, true)
    assert.equal(dados.resumo.caminho, '/login?origem=app')
    assert.equal(dados.resumo.status, 201)
    assert.deepEqual(dados.secoes.map(s => s.titulo), ['Payload', 'Headers', 'Response', 'Resp. Headers'])
    assert.deepEqual(secao(dados, 'Payload'), { origem: 'app', email: 'a@b.c', password: '********', perfil: { token: '********' } })
    assert.equal(secao(dados, 'Headers').authorization, '********')
    assert.deepEqual(secao(dados, 'Response'), { access_token: '********', ok: true })
    assert.equal(secao(dados, 'Resp. Headers')['set-cookie'], '********')
    assert.equal(secao(dados, 'Resp. Headers')['x-teste'], '1')
  })

  it('não grava senha nenhuma no disco', async () => {
    const { req } = await pedir('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"nao-pode-vazar"}' })
    assert.ok(!JSON.stringify(detalhe(req.id)).includes('nao-pode-vazar'))
  })

  it('OPTIONS responde, mas não aparece nem é gravado', async () => {
    const antes = saida
    const { resposta } = await pedir('/login', { method: 'OPTIONS' }).catch(() => ({}))
    assert.ok(resposta)
    assert.equal(saida.slice(antes.length).includes('OPTIONS'), false)
  })

  it('a checagem de saúde do painel aparece sem id (não é gravada)', async () => {
    const { req } = await pedir('/up', { headers: { 'user-agent': 'codify-orbita' } })
    assert.equal(req.status, 200)
    assert.equal(req.id, undefined)
  })

  it('status de erro com `exit` no meio é registrado', async () => {
    const { req, corpo } = await pedir('/morre')
    assert.equal(corpo, 'antes')
    assert.equal(req.status, 500)
    assert.equal(secao(detalhe(req.id), 'Response'), 'antes')
  })

  it('binário vira aviso; resposta grande é cortada sem quebrar acento', async () => {
    assert.equal(secao(detalhe((await pedir('/binario')).req.id), 'Response'), '(conteúdo binário)')
    const grande = secao(detalhe((await pedir('/grande')).req.id), 'Response')
    assert.match(grande, /^á+\n… \(cortado em 64 KB\)$/)
  })

  it('arquivo estático continua sendo servido pelo PHP', async () => {
    const { corpo, req } = await pedir('/estatico.txt')
    assert.equal(corpo, 'arquivo')
    assert.equal(req.metodo, 'GET')
  })

  it('id desconhecido responde com a mensagem combinada', () => {
    const dados = detalhe('naoexiste')
    assert.equal(dados.ok, false)
    assert.equal(dados.etapa, 'nao-encontrado')
  })
})
