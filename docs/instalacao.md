# Instalação

O `@codifytech/orbita` é um pacote **privado**, publicado no **GitHub Packages** da organização
CodifyTech. Isso significa que o npm precisa saber (1) onde procurar os pacotes `@codifytech/*` e
(2) quem é você. Você faz isso uma única vez por máquina.

> **Versões:** a `0.1.0` tem só a base (banner, `help`, config). `dev`, `doctor`, `parar`, `setup` e
> `init` chegam na `0.2.0`.

## 1. Criar o token

1. No GitHub, abra **Settings → Developer settings → Personal access tokens → Tokens (classic)**.
2. **Generate new token (classic)** e marque apenas o escopo **`read:packages`**.
3. Copie o token (`ghp_…`). Ele só aparece uma vez.
4. Se a organização usa SSO, clique em **Configure SSO** ao lado do token e autorize a CodifyTech.

## 2. Configurar o `~/.npmrc`

Na sua pasta de usuário (`C:\Users\<você>\.npmrc` no Windows, `~/.npmrc` no Linux e no macOS), adicione:

```ini
@codifytech:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=SEU_TOKEN_AQUI
```

- A primeira linha manda **só** os pacotes `@codifytech/*` para o GitHub Packages. O resto do npm
  continua igual.
- A segunda linha é a sua autenticação. **Nunca** coloque o token num `.npmrc` que vai para o git.

## 3. Instalar

```bash
# No projeto (recomendado): fixa a versão do Órbita no lockfile, para o time todo
npm install --save-dev @codifytech/orbita

# Opcional: o comando `codify` disponível em qualquer pasta
npm install --global @codifytech/orbita
```

O `codify` global procura o Órbita instalado no `node_modules` do projeto e, se achar, delega a ele.
Por isso o `orbita.config.mjs` do projeto sempre usa a versão que está no lockfile dele.

Confira:

```bash
codify --version
codify help
```

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `401 Unauthorized` | Token ausente, expirado ou sem `read:packages` | Gere outro token e atualize o `~/.npmrc` |
| `403 Forbidden` | Token sem autorização da organização (SSO) | **Configure SSO** no token e autorize a CodifyTech |
| `404 Not Found` | Falta a linha `@codifytech:registry=…` | Adicione-a ao `~/.npmrc` |
| `codify` não é reconhecido | Instalou só no projeto | Use `npx codify` ou um script do `package.json`, ou instale global |
| `O orbita.config.mjs importa @codifytech/orbita, mas o pacote não está instalado` | Só tem o `codify` global | Rode `npm install --save-dev @codifytech/orbita` no projeto |

## Publicar uma versão (mantenedores)

A publicação usa o registry configurado em `publishConfig` do `package.json`. Ela precisa de um token
com o escopo **`write:packages`**.

```bash
npm test                  # nunca publique com teste quebrado
npm version minor         # ajusta a versão (e cria a tag, se for um repositório git)
npm publish
```

O campo `files` do `package.json` já limita o que vai no pacote: `bin/`, `src/` e `docs/`.
