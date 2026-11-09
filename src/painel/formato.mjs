// Formatos curtos de tempo e memória mostrados nos cartões, nas barras e no resumo final.
import { SITE } from '../constantes.mjs'

/** "codifytech.com.br": o site como cabe num rodapé. */
export const SITE_SEM_PROTOCOLO = SITE.replace(/^https?:\/\//, '')

/**
 * "42s", "3m07s", "2h05m".
 *
 * @param {number} ms
 */
export function duracao(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) {
    return `${s}s`
  }
  const m = Math.floor(s / 60)
  if (m < 60) {
    return `${m}m${String(s % 60).padStart(2, '0')}s`
  }

  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

/**
 * Há quanto tempo, em poucas colunas: "agora", "há 42s", "há 3min", "há 2h", "há 5d".
 *
 * @param {number} ms
 */
export function haQuanto(ms) {
  const s = Math.floor(ms / 1000)
  if (s < 1) {
    return 'agora'
  }
  if (s < 60) {
    return `há ${s}s`
  }
  const m = Math.floor(s / 60)
  if (m < 60) {
    return `há ${m}min`
  }
  const h = Math.floor(m / 60)

  return h < 24 ? `há ${h}h` : `há ${Math.floor(h / 24)}d`
}

/** "14:03:59" no fuso local. */
export const horaDe = t => new Date(t).toTimeString().slice(0, 8)

/** "512 MB" ou "1.3 GB". */
export const mb = bytes => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`)

/** "1 erro", "3 erros" (o plural simples do português basta para o painel). */
export const plural = (n, palavra, plural = `${palavra}s`) => `${n} ${n === 1 ? palavra : plural}`
