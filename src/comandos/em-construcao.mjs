// Comandos do roadmap que ainda não foram escritos. Aparecem no `help` (o desenho final já está
// valendo) e respondem com um erro claro em vez de "comando desconhecido".
import { ErroDeUso } from '../erros.mjs'

/**
 * @param {{ nome: string, descricao: string, etapa: number }} dados `etapa` é a do roadmap no README
 * @returns {import('./tipos.mjs').Comando}
 */
export function emConstrucao({ nome, descricao, etapa }) {
  return {
    nome,
    descricao,
    banner: false,
    async executar() {
      throw new ErroDeUso(
        `O comando "${nome}" ainda não foi implementado (etapa ${etapa} do roadmap).`,
        'Acompanhe o andamento na seção "Roadmap" do README.',
      )
    },
  }
}
