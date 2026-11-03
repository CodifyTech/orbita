/** Espera `ms` milissegundos. Usada pelas animações e pelas esperas do ambiente. */
export const pausa = ms => new Promise(resolve => setTimeout(resolve, ms))
