// Comando livre (`:` ou `x`): uma caixa para digitar um comando e rodá-lo na pasta de um dos alvos do
// plano (Tab alterna). O alvo pode ter um atalho que reescreve o texto ("artisan migrate" vira
// "php artisan migrate"). Guarda as últimas 50 linhas num histórico navegável com ↑↓.

const MAX_HISTORICO = 50

/**
 * O alvo pré-selecionado ao abrir a caixa numa aba: o que lista aquele serviço, senão o primeiro.
 *
 * @param {{ servicos?: string[] }[]} alvos
 * @param {string} abaId
 * @returns {number} índice em `alvos`
 */
export const alvoDaAba = (alvos, abaId) => Math.max(0, alvos.findIndex(a => a.servicos?.includes(abaId)))

/**
 * Aplica o atalho do alvo ao texto digitado (ex.: "^artisan\\b" → "php artisan").
 *
 * @param {{ atalho?: { de: string, para: string } | null }} alvo
 * @param {string} texto
 */
export function aplicarAtalho(alvo, texto) {
  if (!alvo.atalho?.de) {
    return texto
  }
  try {
    return texto.replace(new RegExp(alvo.atalho.de), alvo.atalho.para)
  } catch {
    return texto
  }
}

/**
 * Explicação do atalho para a caixa: `"artisan …" vira "php artisan …"`. A regex vira texto legível
 * tirando âncoras e \b; se ainda sobrar sintaxe de regex, mostra a regex como está.
 *
 * @param {{ de: string, para: string } | null | undefined} atalho
 * @returns {string | null}
 */
export function descreverAtalho(atalho) {
  if (!atalho?.de) {
    return null
  }
  const de = atalho.de.replace(/^\^/, '').replace(/\\b|\\s\*|\\s\+|\$$/g, '').trim()
  if (/[\\[\](){}|*+?.^$]/.test(de)) {
    return `/${atalho.de}/ vira "${atalho.para}"`
  }

  return `"${de} …" vira "${atalho.para} …"`
}

/**
 * Abre a caixa já com o alvo da aba atual.
 *
 * @param {import('./estado.mjs').Estado} estado
 * @param {string} abaId
 */
export function abrirComando(estado, abaId) {
  estado.cmd.alvo = alvoDaAba(estado.alvos, abaId)
  estado.cmd.pos = -1
  estado.overlay = 'comando'
}

/** Tecla imprimível (não é sequência de escape nem caractere de controle)? */
export const imprimivel = k => k.length >= 1 && !k.startsWith('\x1b') && k >= ' '

/**
 * Teclas com a caixa aberta.
 *
 * @param {import('./teclas.mjs').Contexto} ctx
 * @param {string} nome nome da tecla (teclas.mjs)
 * @param {string} k a tecla crua
 */
export function teclaComando(ctx, nome, k) {
  const { estado } = ctx
  const c = estado.cmd
  const alvos = estado.alvos

  if (nome === 'esc') {
    estado.overlay = null
  } else if (nome === 'tab') {
    c.alvo = (c.alvo + 1) % alvos.length
  } else if (nome === 'shifttab') {
    c.alvo = (c.alvo - 1 + alvos.length) % alvos.length
  } else if (nome === 'enter') {
    const texto = c.texto.trim()
    estado.overlay = null
    if (texto) {
      c.hist = [{ alvo: c.alvo, texto }, ...c.hist.filter(h => h.alvo !== c.alvo || h.texto !== texto)].slice(0, MAX_HISTORICO)
      c.texto = ''
      c.pos = -1
      const alvo = alvos[c.alvo]
      ctx.rodarTarefa({ titulo: `${alvo.nome}$ ${texto}`, comando: aplicarAtalho(alvo, texto), cwd: alvo.cwd })
    }
  } else if (nome === 'cima' || nome === 'baixo') {
    const novo = c.pos + (nome === 'cima' ? 1 : -1)
    if (novo < -1 || novo >= c.hist.length) {
      return
    }
    // Ao sair do que estava digitando, guarda como rascunho para voltar a ele.
    if (c.pos === -1) {
      c.rascunho = c.texto
    }
    c.pos = novo
    if (novo === -1) {
      c.texto = c.rascunho
    } else {
      c.alvo = Math.min(c.hist[novo].alvo, alvos.length - 1)
      c.texto = c.hist[novo].texto
    }
  } else if (nome === 'backspace') {
    c.texto = [...c.texto].slice(0, -1).join('')
  } else if (nome === 'ctrlu') {
    c.texto = ''
  } else if (imprimivel(k)) {
    c.texto += k
    c.pos = -1
  }
}
