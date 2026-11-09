// Só documentação (typedefs JSDoc): o contrato dos presets e das famílias.
//
// PRESET  = o que o Órbita sabe de UM tipo de serviço: porta padrão, como subir, saúde, cor, regex do log.
// FAMÍLIA = o que vale para todos os serviços de uma stack que moram na mesma pasta (um "grupo"):
//           consultar o estado, diagnosticar, consertar, instalar e o que vai para o plano do painel.
//           Ex.: os presets laravel, laravel:queue e laravel:reverb são da família "laravel", e o
//           APP_KEY é checado uma vez para a pasta backend/, não uma vez por serviço.
//
// Para criar um preset: escreva-o na família certa (ou crie a família) e registre em src/presets/index.mjs.

/**
 * @typedef {object} Preset
 * @property {string} nome                         como aparece na config (ex.: "vite", "laravel:queue")
 * @property {string} familia                      nome da família (ex.: "laravel")
 * @property {string} descricao                    linha do cartão no painel
 * @property {import('../plano/tipos.mjs').Cor} cor
 * @property {number | null} porta                 porta padrão; null = não escuta (fila, scheduler)
 * @property {string | null} health                caminho HTTP padrão da saúde (ex.: "/up"); null = sem HTTP
 * @property {'http' | 'ws'} protocolo             esquema da URL mostrada no painel
 * @property {{ erro: string, aviso: string }} padroes  regex (texto, flag "i") para classificar o log
 * @property {'requisicoes' | 'jobs' | 'hmr' | 'execucoes' | null} metrica
 * @property {(servico: Servico, contexto: Contexto) => string} comando  linha de comando quando o serviço não tem `cmd`
 * @property {(servico: Servico, contexto: Contexto) => string} [descrever]  descrição calculada (ex.: quantas filas)
 * @property {(servico: Servico, contexto: Contexto) => import('../plano/tipos.mjs').DetalhesDeRequest} [detalhesDeRequest]
 *           como buscar os detalhes de um request do log; sem isto, a aba só rola
 */

/**
 * @typedef {object} Servico um serviço da config já resolvido (preset aplicado, porta decidida)
 * @property {string} nome
 * @property {Preset | null} preset                null quando o serviço só tem `cmd`
 * @property {Familia} familia
 * @property {string} cwd                          pasta absoluta
 * @property {string} pasta                        pasta relativa à raiz, para mensagens (ex.: "backend")
 * @property {number | null} porta
 * @property {string} host                         onde escuta (ex.: "127.0.0.1")
 * @property {string | null} cmd                   comando próprio da config
 * @property {string | null} health
 * @property {Grupo} grupo                         o grupo (família + pasta) a que pertence
 */

/**
 * @typedef {object} Grupo serviços da mesma família na mesma pasta
 * @property {Familia} familia
 * @property {string} cwd
 * @property {string} pasta
 * @property {Servico[]} servicos
 * @property {any} [info]                          o que `consultar` descobriu (ex.: JSON do ambiente.php)
 * @property {{ etapa: string, erro: string } | null} [falha]  `consultar` não conseguiu ler o estado
 */

/**
 * @typedef {object} Item uma linha do diagnóstico
 * @property {'ok' | 'aviso' | 'erro'} estado      erro impede subir; aviso sobe, mas funciona errado
 * @property {string} item
 * @property {string} detalhe
 * @property {({ tipo: string } & Record<string, any>) | null} reparo  o que o doctor pode oferecer para consertar
 * @property {Grupo} [grupo]                       quem sabe consertar (reparos que não são de porta)
 */

/**
 * @typedef {object} Etapa uma etapa de configuração do `codify setup`
 * @property {string} titulo
 * @property {string} porque                       uma frase em português simples dizendo o que acontece
 * @property {() => boolean} [pular]              true = nada a fazer (a etapa nem aparece)
 * @property {(contexto: Contexto) => Promise<boolean>} executar  false = parou (já explicou o motivo)
 */

/**
 * @typedef {object} Instalacao a etapa de baixar dependências (roda com spinner; a saída só aparece se falhar)
 * @property {string} titulo
 * @property {string} porque
 * @property {string} comando                      ex.: "composer"
 * @property {string[]} args
 * @property {string} texto                        o que o spinner diz enquanto roda
 * @property {string[]} passosSeFalhar             "Como resolver", numerado
 */

/**
 * @typedef {object} Ferramenta programa que precisa estar no PATH
 * @property {string} nome                         ex.: "PHP"
 * @property {string} comando                      ex.: "php"
 * @property {string[]} [args]                     para mostrar a versão (padrão: --version)
 * @property {string} dica                         como instalar
 */

/**
 * @typedef {object} Familia
 * @property {string} nome
 * @property {(grupo: Grupo, contexto: Contexto) => Ferramenta[]} ferramentas
 * @property {(grupo: Grupo, contexto: Contexto) => Promise<void>} [consultar]
 * @property {(grupo: Grupo, contexto: Contexto) => { removidos: { nome: string, motivo: string }[] }} [ajustar]
 * @property {(servico: Servico, contexto: Contexto) => { arquivo: string, chave: string } | null} [preferenciaDePorta]
 * @property {(servico: Servico, contexto: Contexto) => string | null} [hostPreferido]
 * @property {(grupo: Grupo, contexto: Contexto) => Promise<Item[]>} diagnosticar
 * @property {(item: Item, contexto: Contexto) => Promise<boolean>} [reparar]  true = mudou algo, vale conferir de novo
 * @property {(servico: Servico, nova: number, contexto: Contexto) => void} [gravarPorta]  efeitos extras da troca permanente
 * @property {(servico: Servico, nova: number, contexto: Contexto) => { env: Record<string, string>, detalhe: string }} [envDaTroca]
 * @property {(grupo: Grupo, contexto: Contexto) => Instalacao | null} instalacao
 * @property {(grupo: Grupo, contexto: Contexto) => Etapa[]} [configuracao]
 * @property {(frontend: Servico, grupo: Grupo, contexto: Contexto) => Record<string, string>} [extrasDoFrontend]
 *           variáveis que um frontend precisa deste backend (ex.: as do Reverb para o Vite)
 * @property {(grupo: Grupo, contexto: Contexto) => Partial<Pick<import('../plano/tipos.mjs').Plano, 'env' | 'logs' | 'ambiente' | 'acoes' | 'alvos'>>} paraOPlano
 */

/**
 * @typedef {object} Contexto o projeto resolvido, compartilhado por doctor, dev, parar e setup
 * @property {import('../config/carregar-config.mjs').Projeto} projeto
 * @property {Servico[]} servicos                  só os que vão subir (depois de --only/--except)
 * @property {Servico[]} todos                     todos os da config
 * @property {Grupo[]} grupos
 * @property {{ arquivo: string, valores: Record<string, string> }} preferencias  DEV_* desta máquina
 * @property {string} php                          binário do PHP (ORBITA_PHP ou "php")
 * @property {import('../ambiente/executar.mjs').Executor} executar
 * @property {ReturnType<typeof import('../ui/perguntas.mjs').criarPerguntas>} perguntas
 * @property {{ write(texto: string): unknown, columns?: number }} saida
 * @property {ReturnType<typeof import('../ui/estilo.mjs').criarEstilo>} estilo
 * @property {import('../ui/terminal.mjs').Terminal} terminal
 * @property {Record<string, string>} envDaExecucao variáveis trocadas só nesta execução (portas)
 */

export {}
