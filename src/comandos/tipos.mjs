// Só documentação (typedefs JSDoc): o contrato que todo comando segue.
//
// Um comando é um módulo em src/comandos/<nome>.mjs com `export default` de um objeto `Comando`.
// Para criar um novo: escreva o arquivo e registre-o na lista de src/comandos/index.mjs.

/**
 * @typedef {object} Contexto o que a CLI entrega a cada comando
 * @property {import('../argumentos.mjs').Argumentos} argumentos  já sem o nome do comando
 * @property {import('../config/carregar-config.mjs').Projeto} projeto
 * @property {import('./tipos.mjs').Comando[]} comandos           todos os comandos registrados
 * @property {NodeJS.ReadableStream & { isTTY?: boolean }} entrada  de onde ler as teclas (stdin)
 * @property {{ write(texto: string): unknown }} saida            onde escrever (stdout, ou um falso nos testes)
 * @property {ReturnType<typeof import('../ui/perguntas.mjs').criarPerguntas>} perguntas  confirmar, escolher, texto, senha
 * @property {ReturnType<typeof import('../ui/estilo.mjs').criarEstilo>} estilo
 * @property {import('../ui/terminal.mjs').Terminal} terminal
 * @property {Record<string, string | undefined>} env
 */

/**
 * @typedef {object} Comando
 * @property {string} nome        o que se digita depois de `codify`
 * @property {string} descricao   uma frase; aparece no `help` e no banner
 * @property {boolean} [banner]   mostra o cabeçalho antes de executar (padrão: sim)
 * @property {boolean} [oculto]   não aparece no `help` (comandos de infraestrutura)
 * @property {boolean} [usaConfig] false = não importa o orbita.config.mjs (o `init`, que o cria)
 * @property {(contexto: Contexto) => Promise<number | void>} executar  devolve o código de saída (0 = ok)
 */

export {}
