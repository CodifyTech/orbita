// Registro dos comandos. A ordem daqui é a ordem em que o `help` os mostra.
import banner from './banner.mjs'
import dev from './dev.mjs'
import doctor from './doctor.mjs'
import help from './help.mjs'
import init from './init.mjs'
import parar from './parar.mjs'
import setup from './setup.mjs'

/** @type {import('./tipos.mjs').Comando[]} */
export const COMANDOS = [dev, parar, doctor, setup, init, help, banner]

/** @returns {import('./tipos.mjs').Comando | undefined} */
export const buscarComando = nome => COMANDOS.find(comando => comando.nome === nome)
