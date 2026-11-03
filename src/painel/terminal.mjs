// Sequências de controle que o painel manda ao terminal: tela alternativa, cursor, mouse, título e
// área de transferência (OSC 52). Ficam aqui, com nome, para o resto do código não ter "\x1b[?1049h"
// solto no meio.

/**
 * Entrar no painel: tela alternativa (o histórico do terminal fica intacto), cursor escondido, sem
 * quebra automática de linha, roda do mouse vira seta (1007) e tela limpa.
 */
export const ENTRAR = '\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[?1007h\x1b[2J'
/** Desfaz tudo do ENTRAR (e o mouse, se estiver ligado). */
export const SAIR = '\x1b[?1000l\x1b[?1006l\x1b[?1007l\x1b[?7h\x1b[?25h\x1b[?1049l'
/** Relato de cliques (1000) no formato SGR (1006), que aceita colunas acima de 223. */
export const LIGAR_MOUSE = '\x1b[?1000h\x1b[?1006h'
export const DESLIGAR_MOUSE = '\x1b[?1000l\x1b[?1006l'
export const LIMPAR_TELA = '\x1b[2J'

/** Título da janela/aba do terminal (OSC 0). */
export const titulo = texto => `\x1b]0;${texto}\x07`

/**
 * Copiar pelo próprio terminal (OSC 52): funciona no Windows Terminal, VS Code, iTerm, kitty e até
 * por SSH, onde o `clip` da máquina local não alcança.
 *
 * @param {string} texto
 */
export const copiarPeloTerminal = texto => `\x1b]52;c;${Buffer.from(texto).toString('base64')}\x07`
