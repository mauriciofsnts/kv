// ANSI styling for the CLI. Color is decided per stream: only when it is a
// TTY and NO_COLOR is unset, so pipes and scripts keep getting plain text.

type Paint = (text: string) => string

export interface Ui {
  bold: Paint
  dim: Paint
  cyan: Paint
  green: Paint
  red: Paint
  yellow: Paint
  /** Green ✓ prefix — completed action. */
  ok: Paint
  /** Red ✗ prefix — failure or skipped-with-reason. */
  bad: Paint
  /** Yellow ↷ prefix — skipped, nothing done. */
  skip: Paint
  /** Green + prefix — something new. */
  add: Paint
  /** Yellow ~ prefix — something will change / differs. */
  change: Paint
  /** Red − prefix — something absent. */
  minus: Paint
  /** Dim = prefix — already in sync. */
  same: Paint
  /** Dim `[group: name]` suffix (with leading space), '' for no group. */
  group: (name: string | undefined) => string
}

function makeUi(stream: NodeJS.WriteStream): Ui {
  const on = stream.isTTY === true && process.env.NO_COLOR === undefined
  const paint =
    (open: string): Paint =>
    (text) =>
      on ? `\x1b[${open}m${text}\x1b[0m` : text
  const bold = paint('1')
  const dim = paint('2')
  const cyan = paint('36')
  const green = paint('32')
  const red = paint('31')
  const yellow = paint('33')
  const prefix =
    (symbol: string, color: Paint): Paint =>
    (text) =>
      `${color(symbol)} ${text}`
  return {
    bold,
    dim,
    cyan,
    green,
    red,
    yellow,
    ok: prefix('✓', green),
    bad: prefix('✗', red),
    skip: prefix('↷', yellow),
    add: prefix('+', green),
    change: prefix('~', yellow),
    minus: prefix('−', red),
    same: prefix('=', dim),
    group: (name) => (name ? ' ' + dim(`[group: ${name}]`) : ''),
  }
}

/** Styles for stdout (results, listings). */
export const ui: Ui = makeUi(process.stdout)
/** Styles for stderr (errors, prompts, status lines). */
export const uiErr: Ui = makeUi(process.stderr)

/**
 * Transient status line on stderr while a blocking step runs (e.g. the scrypt
 * derivation, which is CPU-bound and can't animate a spinner). Returns a
 * function that erases the line; no-ops when stderr is not a TTY.
 */
export function statusLine(text: string): () => void {
  if (process.stderr.isTTY !== true) return () => {}
  process.stderr.write(uiErr.dim(`◌ ${text}`))
  return () => {
    process.stderr.write('\r\x1b[K')
  }
}
