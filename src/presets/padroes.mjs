// Regex (como texto, para caberem no plano JSON) que classificam as linhas do log de cada serviço.

export const PADROES_PHP = {
  erro: 'ERROR|CRITICAL|FAIL|Fatal error|Uncaught|SQLSTATE|ECONNREFUSED|EADDRINUSE|Exception|\\bError\\b|\\bErro\\b',
  aviso: 'WARN|Warning|DEPRECATED|NOTICE',
}

export const PADROES_NODE = {
  erro: '\\berror\\b|ERR!|Failed to|EADDRINUSE|ECONNREFUSED|Uncaught|Exception|\\bErro\\b',
  aviso: '\\bwarn(ing)?\\b|deprecated',
}

export const PADROES_DOTNET = {
  erro: '\\bfail\\b|\\berror\\b|Unhandled exception|Exception',
  aviso: '\\bwarn\\b|warning',
}
