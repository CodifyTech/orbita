// Só documentação (typedefs JSDoc): o PLANO é o contrato entre a checagem do `dev` e o painel.
//
// O `codify dev` resolve tudo antes (filtros --only/--except, portas ocupadas, doctor) e entrega ao
// painel um plano pronto. O painel não sabe nada de Laravel, Vite ou .env: só sobe, vigia e mostra o
// que o plano manda. É JSON puro (regex vão como texto), então dá para gravar num arquivo e depurar o
// painel com ORBITA_PLANO=<arquivo.json> codify dev.

/** @typedef {[number, number, number]} Cor RGB, 0–255 */

/**
 * @typedef {object} SaudeDoProcesso como saber se o processo está de pé
 * @property {'http' | 'tcp'} tipo  http: GET na url (2xx/3xx/4xx = no ar); tcp: conecta na porta
 * @property {string} [url]         para http (ex.: "http://127.0.0.1:8000/up")
 * @property {number} [porta]       para tcp
 */

/**
 * @typedef {object} ProcessoDoPlano um por aba de serviço, na ordem das abas
 * @property {string} nome            nome do serviço (ex.: "server", "web")
 * @property {string} comando         linha de comando completa, rodada com shell
 * @property {string} cwd             pasta absoluta onde rodar
 * @property {Cor} cor                cor da aba e do prefixo no modo inline
 * @property {string} descricao       linha do cartão (ex.: "API Laravel · servidor embutido do PHP")
 * @property {number | null} porta    porta em que escuta (null se não escuta: fila, scheduler)
 * @property {string | null} url      endereço para mostrar/abrir (ex.: "http://localhost:5173", "ws://127.0.0.1:8080")
 * @property {SaudeDoProcesso | null} saude
 * @property {{ erro: string, aviso: string }} padroes  regex (texto, flag "i") que classificam linhas do log
 * @property {'requisicoes' | 'jobs' | 'hmr' | 'execucoes' | null} metrica  o que contar nas linhas de saída
 *                                    (req/min da API, jobs da fila, atualizações do Vite, tarefas do scheduler)
 * @property {DetalhesDeRequest | null} [detalhesDeRequest]  com isto, ↑↓ e o clique escolhem os requests do log e ⏎ abre os detalhes
 */

/**
 * @typedef {object} DetalhesDeRequest programa que descreve um request do log para o painel
 * @property {string} programa        rodado direto, sem linha de comando montada à mão
 * @property {string[]} args
 * @property {string} cwd             pasta absoluta
 *
 * O painel entrega o request em ORBITA_REQUEST ({ caminho, t, ms, metodo? }; t em epoch ms) e lê um JSON da saída:
 *   { ok: true, resumo: ResumoDoRequest, secoes: SecaoDoRequest[] }
 *   { ok: false, etapa: string, erro: string, dica?: string }
 */

/**
 * @typedef {object} ResumoDoRequest o cabeçalho da tela de detalhes (campos ausentes não aparecem)
 * @property {string} [metodo]
 * @property {string} [caminho]
 * @property {number} [status]
 * @property {number} [duracaoMs]
 * @property {number} [memoriaMb]
 * @property {string} [ip]
 * @property {string} [host]
 * @property {string} [hora]
 * @property {string} [controller]
 * @property {string[]} [middleware]
 */

/**
 * @typedef {object} SecaoDoRequest uma aba da tela de detalhes
 * @property {string} titulo
 * @property {'json' | 'lista'} tipo
 * @property {any} [valor]            tipo json: qualquer valor (texto puro aparece como está)
 * @property {{ texto: string, detalhe?: string, nivel?: 'erro' | 'alerta' | null }[]} [itens]  tipo lista
 */

/**
 * @typedef {object} LogDoPlano arquivo de log vigiado numa aba própria (ex.: storage/logs/laravel*.log)
 * @property {string} nome            nome da aba (ex.: "laravel")
 * @property {string} descricao
 * @property {Cor} cor
 * @property {string} pasta           pasta absoluta dos logs
 * @property {string} arquivos        regex (texto) dos nomes de arquivo (ex.: "^laravel.*\\.log$"); vigia o mais recente
 * @property {'monolog' | 'texto'} formato  monolog: "[data] canal.NÍVEL: mensagem"
 */

/**
 * @typedef {object} AcaoDoPlano ação rápida do menu `a`
 * @property {string} titulo
 * @property {string} detalhe
 * @property {string} comando         rodado com shell; a saída vai para a aba "tarefas"
 * @property {string} cwd             pasta absoluta
 */

/**
 * @typedef {object} AlvoDoPlano onde o comando livre (`:`) pode rodar
 * @property {string} nome            rótulo do alvo (ex.: "backend")
 * @property {string} cwd             pasta absoluta
 * @property {Cor} cor
 * @property {string} exemplo         dica mostrada na caixa (ex.: "ex.: php artisan db:seed")
 * @property {{ de: string, para: string } | null} atalho  reescrita do texto digitado (regex texto → substituição),
 *                                    ex.: { de: "^artisan\\b", para: "php artisan" }
 * @property {string[]} servicos      serviços cuja aba, quando aberta, pré-seleciona este alvo
 */

/**
 * @typedef {object} Plano
 * @property {{ nome: string, slogan: string, logo: string[] | null, raiz: string }} projeto
 * @property {ProcessoDoPlano[]} processos
 * @property {Record<string, string>} env      variáveis herdadas por todos os processos (portas trocadas nesta execução)
 * @property {boolean} reiniciar               reinicia sozinho (até 5 vezes) o processo que cair
 * @property {LogDoPlano[]} logs
 * @property {{ rotulo: string, valor: string }[]} ambiente  linhas do cabeçalho (app, versões, banco, fila…)
 * @property {AcaoDoPlano[]} acoes
 * @property {AlvoDoPlano[]} alvos
 */

export {}
