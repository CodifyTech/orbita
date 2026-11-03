// Escreve o que o `codify init` descobriu: o texto do orbita.config.mjs e os scripts do package.json.
import { BINARIO, NOME_DO_PACOTE } from '../constantes.mjs'

/** Scripts que todo projeto ganha (modelo: a raiz do FoodOS). */
export const SCRIPTS_PADRAO = {
  setup: { comando: `${BINARIO} setup`, descricao: 'Prepara tudo: dependências, .env, chaves, banco (+ seed em banco vazio)' },
  dev: { comando: `${BINARIO} dev`, descricao: 'Sobe todos os serviços num painel de terminal, checando o ambiente antes' },
  'dev:doctor': { comando: `${BINARIO} doctor`, descricao: 'Confere o ambiente e oferece consertar o que estiver errado' },
  'dev:parar': { comando: `${BINARIO} parar`, descricao: 'Derruba o ambiente que ficou rodando. --listar só mostra; --force não pergunta' },
  help: { comando: `${BINARIO} help`, descricao: 'Lista os comandos e scripts do projeto (esta ajuda)' },
}

/**
 * Scripts sugeridos para o projeto. Com backend e frontend, ganha também o `dev:backend`.
 *
 * @param {Record<string, { preset: string }>} servicos
 */
export function scriptsSugeridos(servicos) {
  const frontends = Object.entries(servicos)
    .filter(([, { preset }]) => ['vite', 'nuxt', 'astro', 'next', 'ionic'].includes(preset))
    .map(([nome]) => nome)
  const temBackend = Object.values(servicos).some(({ preset }) => preset.startsWith('laravel') || preset === 'dotnet')

  return {
    ...SCRIPTS_PADRAO,
    ...(frontends.length && temBackend
      ? { 'dev:backend': { comando: `${BINARIO} dev --except=${frontends.join(',')}`, descricao: 'O mesmo que dev (com o painel), sem os frontends' } }
      : {}),
  }
}

/**
 * Texto do orbita.config.mjs.
 *
 * @param {{ nome: string, gerenciador: string, servicos: Record<string, { preset: string, cwd: string }>, descricoes: Record<string, string> }} dados
 */
export function textoDaConfig({ nome, gerenciador, servicos, descricoes }) {
  const texto = valor => `'${String(valor).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  const chave = nomeDaChave => (/^[A-Za-z_$][\w$]*$/.test(nomeDaChave) ? nomeDaChave : texto(nomeDaChave))
  const linhasDosServicos = Object.entries(servicos).map(
    ([nomeDoServico, { preset, cwd }]) => `    ${chave(nomeDoServico)}: { preset: ${texto(preset)}, cwd: ${texto(cwd)} },`,
  )
  const linhasDasDescricoes = Object.entries(descricoes).map(([script, descricao]) => `    ${chave(script)}: ${texto(descricao)},`)

  return [
    `// Gerado pelo \`${BINARIO} init\`. Revise à vontade: o Órbita faz só o que está aqui.`,
    '// Referência de todas as chaves: docs/configuracao.md do @codifytech/orbita.',
    `import { defineConfig } from '${NOME_DO_PACOTE}'`,
    '',
    'export default defineConfig({',
    `  nome: ${texto(nome)},`,
    `  gerenciador: ${texto(gerenciador)},`,
    '  servicos: {',
    ...linhasDosServicos,
    '  },',
    '  descricoes: {',
    ...linhasDasDescricoes,
    '  },',
    '})',
    '',
  ].join('\n')
}

/**
 * Acrescenta ao package.json só os scripts que ainda não existem (nunca troca um script do dev).
 * Preserva a indentação do arquivo.
 *
 * @param {string | null} conteudo  package.json atual (null se não existe)
 * @param {Record<string, string>} scripts
 * @param {string} nome             para um package.json novo
 * @returns {{ texto: string, adicionados: string[] }}
 */
export function acrescentarScripts(conteudo, scripts, nome) {
  const pacote = conteudo ? JSON.parse(conteudo) : { name: nome, private: true }
  const recuo = conteudo ? (/^\{\r?\n([ \t]+)/.exec(conteudo)?.[1] ?? '  ') : '  '
  const adicionados = Object.keys(scripts).filter(script => !pacote.scripts?.[script])

  pacote.scripts = { ...pacote.scripts, ...Object.fromEntries(adicionados.map(script => [script, scripts[script]])) }

  return { texto: `${JSON.stringify(pacote, null, recuo)}\n`, adicionados }
}
