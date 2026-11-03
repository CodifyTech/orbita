// Erros "esperados": o problema é do uso ou do ambiente, não do código. A CLI mostra só a mensagem
// (sem stack trace) e sai com código 1. Qualquer outro erro é bug e mostra o stack completo.

export class ErroDeUso extends Error {
  /**
   * @param {string} mensagem o que deu errado, em português simples
   * @param {string} [dica] o que o dev pode fazer para resolver
   */
  constructor(mensagem, dica = '') {
    super(mensagem)
    this.name = 'ErroDeUso'
    this.dica = dica
  }
}

/** O dev cancelou (Ctrl+C numa pergunta). A CLI sai com 130, o código padrão de interrupção. */
export class ErroCancelado extends ErroDeUso {
  constructor() {
    super('Cancelado.')
    this.name = 'ErroCancelado'
  }
}

export class ErroDeConfig extends ErroDeUso {
  /**
   * @param {string[]} problemas um item por problema encontrado na configuração
   * @param {string} [arquivo] caminho do orbita.config.mjs, quando já se sabe qual é
   */
  constructor(problemas, arquivo = '') {
    const onde = arquivo ? ` em ${arquivo}` : ''
    super(`Configuração inválida${onde}:\n${problemas.map(p => `  - ${p}`).join('\n')}`)
    this.name = 'ErroDeConfig'
    this.problemas = problemas
  }
}
