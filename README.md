# key

Gerenciador de envs criptografadas com TUI, estilo [sops](https://github.com/getsops/sops): apenas quem tem a senha descriptografa. O diferencial é o `key apply`, que preenche os valores reais direto no `.env` do projeto.

```
POSTGRES_DB=placeholder      →  key apply POSTGRES_DB  →  POSTGRES_DB=valor_real
```

## Instalação

Requer [Bun](https://bun.sh) ≥ 1.3.

```bash
bun install
bun link   # disponibiliza o comando `key` no PATH
```

## Uso

```bash
key init                  # cria o cofre (~/.config/key/vault.enc)
key                       # abre o TUI
key set POSTGRES_DB       # grava uma secret (valor via prompt oculto)
key apply POSTGRES_DB     # substitui o valor no ./.env
key apply all             # aplica tudo que existir no cofre
key get POSTGRES_DB       # imprime o valor (bom para pipes)
key list                  # lista grupos e nomes (nunca valores)
key rm POSTGRES_DB        # remove com confirmação
key lock                  # encerra a sessão (volta a pedir senha)
key passwd                # troca a senha (re-criptografa o cofre)
```

### Grupos

As secrets vivem em grupos dentro do cofre (`default` se nada for dito). A resolução do grupo no `apply`/`set`/`get` segue esta ordem:

1. Flag `--group`/`-g`
2. Arquivo `.key` no diretório do projeto contendo o nome do grupo
3. `default`

```bash
echo "meu-projeto" > .key   # todo `key apply` neste diretório usa o grupo meu-projeto
```

### apply

- Edita o `.env` **in-place**, preservando comentários, ordem das linhas, prefixo `export` e CRLF.
- Valores com espaços/`#`/aspas ganham aspas duplas automaticamente.
- `key apply VAR` com variável ausente no `.env` pergunta antes de acrescentar no final.
- `key apply all` mostra um resumo: `✓ 4 aplicadas · − 2 sem valor no cofre (...)`.
- `--env arquivo` aponta para outro arquivo (padrão `./.env`).

### TUI

`key` sem argumentos abre o painel. Teclas:

| Tecla | Ação |
|---|---|
| `↑↓` / `jk` | Navega nas secrets |
| `←→` | Troca de grupo |
| `a` / `e` / `d` | Adiciona / edita / remove (com confirmação) |
| `v` | Revela/mascara o valor selecionado |
| `/` | Busca por nome |
| `g` | Cria grupo |
| `q` | Sai |

## Modelo de segurança

- **Cofre**: arquivo único `~/.config/key/vault.enc`. O payload é JSON criptografado com **AES-256-GCM**; a chave vem da senha via **scrypt** (N=2¹⁵, r=8, p=1, salt aleatório). Senha errada ou arquivo adulterado falham na autenticação GCM.
- **Sessão**: após desbloquear, a **chave derivada** (nunca a senha) fica em `$XDG_RUNTIME_DIR/key/session` (tmpfs, some no reboot, `0600`) por 15 minutos (configurável: `KEY_SESSION_TTL`, em segundos), renovados a cada uso. `key lock` apaga na hora. Sem `XDG_RUNTIME_DIR`, cai para `~/.cache/key/session` com aviso (disco).
- **Escrita atômica**: o cofre é salvo via `.tmp` + rename, mantendo a versão anterior em `vault.enc.bak`.
- Valores nunca passam por argv (`key set` lê via prompt oculto) e o `apply` só imprime nomes, nunca valores.

Variáveis de ambiente: `KEY_VAULT_PATH` (caminho do cofre), `KEY_SESSION_TTL` (TTL em segundos), `KEY_SESSION_PATH` (caminho do cache de sessão, útil em testes).

## Desenvolvimento

```bash
bun test            # crypto, vault, sessão, parser de .env
bun run typecheck   # tsc --noEmit
```

Stack: [TermUI](https://www.termui.io) (`@termuijs/*` 0.1.7) para o TUI; o core (crypto/vault/apply) usa só built-ins do Node/Bun.

### Notas sobre o @termuijs 0.1.7

O framework é novo e a versão publicada tem arestas que este código contorna (procure por comentários nos arquivos de `src/tui/`):

- O layout não mede conteúdo: **todo** `box`/`text` precisa de `width`/`height` explícitos (flexGrow/auto viram 0 e o elemento some).
- `useTerminalSize()` devolve 0×0 — usamos `src/tui/useTermSize.ts` no lugar.
- Cores fora da paleta (ex.: `gray`) derrubam o render inteiro silenciosamente.
- Os widgets `TextInput`/`PasswordInput` capturam o foco global e consomem Tab/Enter — os formulários usam campos próprios (`src/tui/inputs.tsx`).
- Handlers de `useInput` podem reter closures de renders antigos — estado é lido via refs/`getState()` dentro dos handlers.
