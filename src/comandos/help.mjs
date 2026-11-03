// `codify help [filtro]`: lista os comandos do Órbita e os scripts do projeto, agrupados.
// Lê o package.json e o orbita.config.mjs a cada execução, então nunca fica desatualizada.
import { BINARIO } from '../constantes.mjs'

const GRUPOS_DE_SCRIPTS = [
  { titulo: 'Ambiente local', pertence: nome => nome === 'setup' || nome === 'dev' || nome.startsWith('dev:') },
  { titulo: 'Qualidade', pertence: nome => /^(test|lint|typecheck|build|verificar)/.test(nome) },
]

/** `dev` casa com `dev` e com `dev:*`; sem filtro, tudo casa. */
export const casaComFiltro = (nome, filtro) => !filtro || nome === filtro || nome.startsWith(`${filtro}:`)

/**
 * Separa os scripts nos grupos de GRUPOS_DE_SCRIPTS; o que não cabe em nenhum vai para `outros`
 * (e só aparece quando não há filtro).
 *
 * @param {string[]} nomes
 * @param {string} [filtro]
 * @returns {{ grupos: { titulo: string, nomes: string[] }[], outros: string[] }}
 */
export function agruparScripts(nomes, filtro) {
  const mostrados = new Set()
  const grupos = []

  for (const { titulo, pertence } of GRUPOS_DE_SCRIPTS) {
    const doGrupo = nomes.filter(nome => pertence(nome) && casaComFiltro(nome, filtro))
    doGrupo.forEach(nome => mostrados.add(nome))
    if (doGrupo.length) {
      grupos.push({ titulo, nomes: doGrupo })
    }
  }

  return { grupos, outros: filtro ? [] : nomes.filter(nome => !mostrados.has(nome)) }
}

/**
 * Monta o texto da ajuda (uma string por linha).
 *
 * @param {object} dados
 * @param {import('../config/carregar-config.mjs').Projeto} dados.projeto
 * @param {import('./tipos.mjs').Comando[]} dados.comandos
 * @param {ReturnType<typeof import('../ui/estilo.mjs').criarEstilo>} dados.estilo
 * @param {string} [dados.filtro]
 * @returns {string[]}
 */
export function montarAjuda({ projeto, comandos, estilo, filtro }) {
  const { config, scripts, descricoes } = projeto
  const executar = nome => `${config.gerenciador} run ${nome}`
  const semDescricao = estilo.vermelho('(sem descrição: adicione em "descricoes" no orbita.config.mjs)')

  const doOrbita = comandos
    .filter(comando => !comando.oculto && casaComFiltro(comando.nome, filtro))
    .map(comando => ({ rotulo: `${BINARIO} ${comando.nome}`, texto: comando.descricao }))

  const nomesDeScripts = Object.keys(scripts).filter(nome => nome !== 'help')
  const { grupos, outros } = agruparScripts(nomesDeScripts, filtro)
  const doProjeto = nome => ({ rotulo: executar(nome), texto: descricoes[nome] ?? semDescricao })

  const secoes = [
    ...(doOrbita.length ? [{ titulo: 'Comandos do Órbita', linhas: doOrbita }] : []),
    ...grupos.map(({ titulo, nomes }) => ({ titulo, linhas: nomes.map(doProjeto) })),
    ...(outros.length ? [{ titulo: 'Outros', linhas: outros.map(doProjeto) }] : []),
  ]

  if (!secoes.length) {
    return ['', `Nenhum comando ou script começa com "${filtro}". Rode ${estilo.verde(`${BINARIO} help`)} para ver todos.`, '']
  }

  const largura = Math.max(...secoes.flatMap(({ linhas }) => linhas.map(({ rotulo }) => rotulo.length))) + 2

  return [
    '',
    `${estilo.negrito(config.nome)} — comandos do projeto (${estilo.ciano(`${BINARIO} <comando>`)})`,
    '',
    ...secoes.flatMap(({ titulo, linhas }) => [
      estilo.amarelo(titulo),
      ...linhas.map(({ rotulo, texto }) => `  ${estilo.verde(rotulo.padEnd(largura))}${texto}`),
      '',
    ]),
    ...(!filtro || filtro === 'dev' ? montarDicas(projeto, estilo) : []),
  ]
}

function montarDicas({ config }, estilo) {
  const servicos = Object.entries(config.servicos)
  const dicas = [
    `Primeira vez: ${BINARIO} setup  →  ${BINARIO} dev`,
    servicos.length
      ? `Opções do dev: ${BINARIO} dev --only=${servicos[0][0]}   (serviços: ${servicos.map(([nome]) => nome).join(', ')})`
      : null,
    'Painel do dev: ? mostra os atalhos · r reinicia · s para/sobe · a ações rápidas · --inline sobe sem o painel',
    servicos.some(([, servico]) => servico.preset?.startsWith('laravel'))
      ? 'Preferência fixa da máquina: DEV_EXCEPT / DEV_ONLY / DEV_SERVER_HOST no .env do backend'
      : null,
    `Se algo ficou rodando: ${BINARIO} parar   ·   se o ambiente não sobe: ${BINARIO} doctor`,
  ].filter(Boolean)

  return [estilo.amarelo('Dicas'), ...dicas.map(dica => `  ${dica}`), '']
}

/** @type {import('./tipos.mjs').Comando} */
export default {
  nome: 'help',
  descricao: 'Lista os comandos do Órbita e os scripts do projeto (esta ajuda)',
  async executar({ argumentos, projeto, comandos, estilo, saida }) {
    const [filtro] = argumentos.posicionais

    saida.write(`${montarAjuda({ projeto, comandos, estilo, filtro }).join('\n')}\n`)
  },
}
