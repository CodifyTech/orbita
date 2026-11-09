// As caixas que abrem por cima da tela: ajuda (`?`), ações rápidas (`a`), comando livre (`:`) e a de
// encerramento, que mostra cada serviço terminando.
import { relative } from 'node:path'
import { SITE } from '../../constantes.mjs'
import { listarAcoes } from '../acoes.mjs'
import { descreverAtalho } from '../comando-livre.mjs'
import {
  AMARELO,
  APAGADO,
  BRANCO,
  CIANO,
  compor,
  degrade,
  escurecer,
  forte,
  FUNDO_CAIXA,
  FUNDO_SEL,
  LARANJA,
  MAGENTA,
  marcaCodifyTech,
  NEGRITO,
  pinta,
  SUAVE,
  SUBLINHADO,
  TEXTO,
  VERDE,
} from '../cores.mjs'
import { processos } from '../estado.mjs'
import { cortar, fatiarPlano } from '../texto.mjs'
import { caixa, spinner } from './pecas.mjs'
import { cursor } from './rodape.mjs'

/**
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w largura da tela
 * @param {number} t agora
 */
export function caixaAjuda(estado, w, t) {
  const k = texto => forte(AMARELO, texto.padEnd(15))
  const d = texto => pinta(TEXTO, texto)
  const largura = Math.min(76, w - 4)
  const nomesDosAlvos = estado.alvos.map(a => a.nome).join(' / ')
  const linhas = [
    '',
    `${k('← → Tab')}${d('trocar de aba')}`,
    `${k('↓ ⏎')}${d('visão geral: descer para os serviços (← → escolhem)')}`,
    `${k('↑')}${d('visão geral: voltar a navegar pelas abas')}`,
    `${k('1 … 9')}${d('ir direto para a aba')}  ${pinta(SUAVE, '·')}  ${k('e')}${d('alertas')}`,
    `${k('↑ ↓ PgUp PgDn')}${d('rolar o log / escolher o alerta')}`,
    `${k('Home End')}${d('início do log / voltar a seguir o fim')}`,
    `${k('⏎')}${d('abrir os logs do serviço / ver o alerta no log')}`,
    `${k('↑ ↓ ⏎')}${d('aba do servidor: escolher o request e ver os detalhes')}`,
    '',
    `${k('r')}${d('reiniciar o serviço')}       ${k('R')}${d('reiniciar todos')}`,
    `${k('s')}${d('parar / subir o serviço')}`,
    `${k('o')}${d('abrir o endereço do serviço no navegador ou o arquivo do log')}`,
    `${k('/')}${d('filtrar o log')}            ${k('Esc')}${d('limpar o filtro')}`,
    `${k('c')}${d('limpar o log / os alertas')}`,
    `${k('y')}${d('copiar as linhas visíveis ou o alerta escolhido')}`,
    `${k('a')}${d('ações rápidas do projeto')}`,
    `${k(': ou x')}${d(`rodar um comando em ${nomesDosAlvos}`)}`,
    `${k('m')}${d('liga/desliga o mouse (clique e roda)')}${pinta(SUAVE, ' · Shift+arrastar seleciona texto')}`,
    `${k('q Ctrl+C')}${d('sair, encerrando todos os serviços')}`,
    '',
    pinta(APAGADO, '─'.repeat(largura - 4)),
    `${degrade(`◆ ${estado.plano.projeto.nome}`, LARANJA, MAGENTA, 0, NEGRITO)}  ${pinta(SUAVE, 'desenvolvido e mantido por')} ${marcaCodifyTech(t)}`,
    pinta(CIANO, SITE, SUBLINHADO),
    '',
    pinta(APAGADO, 'qualquer tecla fecha'),
  ]

  return caixa(forte(BRANCO, 'Atalhos do painel'), linhas, largura, LARANJA)
}

/**
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w largura da tela
 */
export function caixaAcoes(estado, w) {
  const lista = listarAcoes(estado)
  estado.selAcao = Math.max(0, Math.min(estado.selAcao, lista.length - 1))
  const largura = Math.min(72, w - 4)
  const coluna = Math.min(34, Math.max(...lista.map(a => a.titulo.length)))
  const linhas = [
    '',
    ...lista.map((a, i) => {
      const numero = i < 9 ? `${i + 1}` : ' '
      if (i === estado.selAcao) {
        return compor([[BRANCO, fatiarPlano(`› ${numero}  ${a.titulo.padEnd(coluna)} ${a.detalhe}`, 0, largura - 4), true]], FUNDO_SEL)
      }

      return `${pinta(APAGADO, `  ${numero}  `)}${pinta(TEXTO, a.titulo.padEnd(coluna))} ${pinta(SUAVE, a.detalhe)}`
    }),
    '',
    pinta(SUAVE, '↑↓ escolher · ⏎ ou número roda · Esc fecha · a saída vai para a aba tarefas'),
  ]

  return caixa(forte(BRANCO, 'Ações rápidas'), linhas, largura, CIANO)
}

/**
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w largura da tela
 * @param {number} t agora
 */
export function caixaComando(estado, w, t) {
  const c = estado.cmd
  const alvo = estado.alvos[c.alvo]
  const largura = Math.min(96, w - 4)
  const interno = largura - 8
  const aba = (a, i) => (i === c.alvo ? compor([[BRANCO, ` ${a.nome} `, true]], escurecer(a.cor, 0.45)) : pinta(SUAVE, ` ${a.nome} `))
  const pasta = relative(estado.plano.projeto.raiz, alvo.cwd) || '.'
  // Só o fim do que foi digitado, se não couber: é onde o cursor está.
  const digitado = [...c.texto].slice(-interno).join('')
  const atalho = descreverAtalho(alvo.atalho)
  const varios = estado.alvos.length > 1
  const linhas = [
    '',
    `${pinta(SUAVE, 'onde:')} ${estado.alvos.map(aba).join(' ')}  ${pinta(APAGADO, `pasta ${pasta.replaceAll('\\', '/')}/`)}`,
    '',
    compor([[AMARELO, '$ ', true], [BRANCO, digitado], [AMARELO, cursor(t)]], FUNDO_CAIXA),
    c.texto || !alvo.exemplo ? '' : pinta(APAGADO, cortar(alvo.exemplo, interno)),
    '',
    pinta(SUAVE, `${varios ? 'Tab troca o alvo · ' : ''}⏎ roda · ↑↓ histórico · Ctrl+U limpa · Esc fecha`),
    pinta(SUAVE, `${atalho ? `${atalho} · ` : ''}a saída vai para a aba tarefas`),
  ]

  return caixa(forte(BRANCO, 'Rodar comando'), linhas, largura, AMARELO)
}

/**
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w largura da tela
 * @param {number} t agora
 */
export function caixaEncerrando(estado, w, t) {
  const largura = Math.min(56, w - 4)
  const coluna = Math.max(10, ...processos(estado).map(s => s.nome.length + 1))
  const linhas = [
    '',
    ...processos(estado).map(s =>
      compor([s.filho ? [AMARELO, spinner(t)] : [VERDE, '✔'], [TEXTO, ` ${s.nome.padEnd(coluna)}`], [SUAVE, s.filho ? 'encerrando…' : 'encerrado']]),
    ),
    '',
    `${pinta(SUAVE, 'até a próxima! —')} ${marcaCodifyTech(t, 900)}`,
  ]

  return caixa(forte(BRANCO, `Encerrando o ${estado.plano.projeto.nome}`), linhas, largura, MAGENTA)
}
