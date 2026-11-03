// Interpreta a saída de texto dos programas do sistema. São funções puras (texto entra, dados saem),
// separadas de quem roda os programas para poderem ser testadas com amostras de qualquer sistema.

/**
 * @typedef {object} Processo
 * @property {number} pid
 * @property {number} ppid     PID do pai
 * @property {string} nome
 * @property {string} comando  linha de comando completa
 */

const porta = endereco => Number(endereco.slice(endereco.lastIndexOf(':') + 1))

/**
 * JSON do `Get-NetTCPConnection | ConvertTo-Json` (Windows), já filtrado por `RemotePort -eq 0`.
 * É a fonte preferida no Windows: dado estruturado, sem depender do idioma, e o `netstat` de
 * algumas builds do Windows 11 não lista sockets recém-abertos. Com um único item o PowerShell
 * devolve objeto em vez de lista. PID 0 (sem dono identificável) é ignorado.
 *
 * @returns {Map<number, number>} porta → PID
 */
export function lerNetTcpConnection(json) {
  const portas = new Map()
  let itens

  try {
    itens = JSON.parse(json)
  } catch {
    return portas
  }

  for (const { LocalPort, OwningProcess, RemoteAddress, RemotePort } of [itens ?? []].flat()) {
    const escuta = RemotePort === 0 && ['0.0.0.0', '::'].includes(RemoteAddress)

    if (escuta && OwningProcess > 0 && !portas.has(LocalPort)) {
      portas.set(LocalPort, OwningProcess)
    }
  }

  return portas
}

/**
 * `netstat -ano` (Windows, fallback). Escuta = endereço remoto zerado; o texto do estado
 * (LISTENING) muda com o idioma do Windows, então não serve de critério.
 *
 * @returns {Map<number, number>} porta → PID
 */
export function lerNetstat(texto) {
  const portas = new Map()

  for (const linha of texto.split('\n')) {
    const colunas = linha.trim().split(/\s+/)

    if (colunas.length >= 5 && ['0.0.0.0:0', '[::]:0'].includes(colunas[2]) && !portas.has(porta(colunas[1]))) {
      portas.set(porta(colunas[1]), Number(colunas[4]))
    }
  }

  return portas
}

/**
 * `lsof -nP -iTCP -sTCP:LISTEN -Fpn` (macOS e Linux): linhas `p<PID>` seguidas de `n<endereço>`.
 *
 * @returns {Map<number, number>} porta → PID
 */
export function lerLsof(texto) {
  const portas = new Map()
  let pid = null

  for (const linha of texto.split('\n')) {
    if (linha.startsWith('p')) {
      pid = Number(linha.slice(1))
    } else if (linha.startsWith('n') && pid !== null && !portas.has(porta(linha))) {
      portas.set(porta(linha), pid)
    }
  }

  return portas
}

/**
 * `ss -ltnpH` (Linux sem lsof).
 *
 * @returns {Map<number, number>} porta → PID
 */
export function lerSs(texto) {
  const portas = new Map()

  for (const [, numero, pid] of texto.matchAll(/:(\d+)\s.*users:\(\("[^"]+",pid=(\d+)/g)) {
    if (!portas.has(Number(numero))) {
      portas.set(Number(numero), Number(pid))
    }
  }

  return portas
}

/**
 * `ps -axo pid=,ppid=,args=` (macOS e Linux). O nome sai do `args`, não da coluna `comm`,
 * porque `comm` pode ter espaços e desalinhar a divisão.
 *
 * @returns {Map<number, Processo>}
 */
export function lerPs(texto) {
  const processos = new Map()

  for (const linha of texto.split('\n')) {
    const colunas = linha.trim().split(/\s+/)

    if (colunas.length < 3) {
      continue
    }
    const [pid, ppid, ...resto] = colunas
    const comando = resto.join(' ')
    const primeiro = resto[0]

    processos.set(Number(pid), {
      pid: Number(pid),
      ppid: Number(ppid),
      nome: primeiro.slice(primeiro.lastIndexOf('/') + 1),
      comando,
    })
  }

  return processos
}

/**
 * JSON do `Get-CimInstance Win32_Process | ConvertTo-Json`. Com um único processo o PowerShell
 * devolve um objeto em vez de uma lista, e `CommandLine` vem null em processos protegidos.
 *
 * @returns {Map<number, Processo>}
 */
export function lerProcessosDoPowerShell(json) {
  let itens

  try {
    itens = JSON.parse(json)
  } catch {
    return new Map()
  }

  return new Map(
    [itens ?? []].flat().map(item => [
      Number(item.ProcessId),
      {
        pid: Number(item.ProcessId),
        ppid: Number(item.ParentProcessId),
        nome: String(item.Name ?? ''),
        comando: String(item.CommandLine ?? ''),
      },
    ]),
  )
}

/**
 * `tasklist /FO CSV /NH`: o nome é a primeira coluna, entre aspas. Sem o processo, o tasklist
 * responde uma frase ("INFORMAÇÕES: …"), não um CSV.
 *
 * @returns {string | null}
 */
export function lerNomeDoTasklist(texto) {
  return /^"([^"]*)"/.exec(texto.trim())?.[1] ?? null
}
