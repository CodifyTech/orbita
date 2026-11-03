// Configuração do próprio Órbita: serve de exemplo vivo do formato (veja docs/configuracao.md).
import { defineConfig } from '@codifytech/orbita'

export default defineConfig({
  nome: 'Codify Órbita',
  slogan: 'Ambiente local de qualquer projeto da casa, num comando só',
  gerenciador: 'npm',
  descricoes: {
    test: 'Roda os testes (node:test, sem framework externo)',
  },
})
