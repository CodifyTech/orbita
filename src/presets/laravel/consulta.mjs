// Ponte com o ambiente.php: roda o script com o PHP do projeto e devolve o JSON já lido.
// O PHP escolhido é o do PATH ou, se o dev precisar de outra versão, o de ORBITA_PHP.
import { fileURLToPath } from 'node:url'
import { precisaDeShell } from '../../ambiente/executar.mjs'

export const SCRIPT = fileURLToPath(new URL('./ambiente.php', import.meta.url))
export const ROTEADOR = fileURLToPath(new URL('./servidor.php', import.meta.url))

/** PHP a usar: ORBITA_PHP (caminho completo) ou o `php` do PATH. */
export const binarioDoPhp = (env = process.env) => env.ORBITA_PHP || 'php'

/**
 * @param {string} cwd pasta do app Laravel
 * @param {string[]} args ação e opções (ex.: ['info', '--redis'], ['criar-banco', 'loja'])
 * @param {{ executar: import('../../ambiente/executar.mjs').Executor, php: string }} contexto
 * @returns {Promise<{ ok: true } & Record<string, any> | { ok: false, etapa: string, erro: string }>}
 */
export async function consultarLaravel(cwd, args, { executar, php }) {
  const resultado = await executar(php, [SCRIPT, cwd, ...args], { shell: precisaDeShell(), timeout: 120_000 })

  return interpretarResposta(resultado, php)
}

/**
 * Lê a resposta do ambiente.php. Sem JSON, o PHP nem rodou (não está no PATH) ou quebrou antes.
 *
 * @param {import('../../ambiente/executar.mjs').Resultado} resultado
 * @param {string} php
 */
export function interpretarResposta({ saida, erro }, php = 'php') {
  const inicio = saida.indexOf('{')

  if (inicio !== -1) {
    try {
      return JSON.parse(saida.slice(inicio))
    } catch {
      // cai no erro abaixo
    }
  }

  const texto = (erro || saida).trim()
  const ausente = /not recognized|não é reconhecido|ENOENT|not found|command not found/i.test(texto)

  return ausente
    ? { ok: false, etapa: 'php-ausente', erro: `"${php}" não está no PATH` }
    : { ok: false, etapa: 'php', erro: texto.split('\n')[0]?.slice(0, 300) || 'o PHP não respondeu' }
}

/**
 * Explicação, em português, de uma falha da consulta (para o doctor e o setup).
 *
 * @param {{ etapa: string, erro: string }} falha
 * @param {string} pasta
 * @returns {{ detalhe: string, passos: string[] }}
 */
export function explicarFalha(falha, pasta) {
  const versao = /require a PHP version "?>=\s*(\d+(?:\.\d+)*)"?.*running (\d+(?:\.\d+)*)/i.exec(falha.erro)

  if (versao) {
    return {
      detalhe: `o projeto pede PHP ${versao[1]} ou mais novo, mas o php usado é o ${versao[2]}`,
      passos: [
        `Instale o PHP ${versao[1]} e deixe-o primeiro no PATH (Herd, WAMP, php.net).`,
        'Ou aponte o Órbita para ele sem mexer no PATH: ORBITA_PHP=<caminho do php.exe>.',
      ],
    }
  }
  if (falha.etapa === 'php-ausente') {
    return {
      detalhe: 'o PHP não está no PATH',
      passos: ['Instale o PHP (https://www.php.net/downloads ou Laravel Herd) e deixe-o no PATH, ou defina ORBITA_PHP.'],
    }
  }
  if (falha.etapa === 'vendor') {
    return { detalhe: `sem ${pasta}/vendor — rode \`codify setup\``, passos: [`Rode \`codify setup\` (ou \`composer install\` em ${pasta}/).`] }
  }

  return {
    detalhe: `o Laravel não iniciou: ${falha.erro}`,
    passos: [`Rode \`php artisan about\` em ${pasta}/ para ver o erro completo.`],
  }
}
