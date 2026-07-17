/** @jsxImportSource @termuijs/jsx */
import type { KeyEvent } from '@termuijs/core'
import { useInput, useRef, useState } from '@termuijs/jsx'
import { WrongPasswordError } from '../core/crypto.ts'
import { storeSessionKey } from '../core/session.ts'
import { openVaultWithPassword } from '../core/vault.ts'
import { Field, editValue } from './inputs.tsx'
import { useTuiStore } from './store.ts'

const MAX_ATTEMPTS = 3
const BOX_WIDTH = 56

export function UnlockScreen() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const setVault = useTuiStore((s) => s.setVault)

  // O handler do useInput pode ficar com closure de um render antigo; o ref
  // garante leitura do valor atual na hora do Enter.
  const passwordRef = useRef('')
  passwordRef.current = password
  const attemptsRef = useRef(0)
  attemptsRef.current = attempts

  const tryUnlock = () => {
    const current = passwordRef.current
    if (current === '') return
    try {
      const vault = openVaultWithPassword(current)
      storeSessionKey(vault.key)
      setVault(vault)
    } catch (err) {
      if (err instanceof WrongPasswordError) {
        const attempt = attemptsRef.current + 1
        if (attempt >= MAX_ATTEMPTS) process.exit(1)
        setAttempts(attempt)
        setPassword('')
        setError(`Senha incorreta (${attempt}/${MAX_ATTEMPTS}).`)
      } else {
        throw err
      }
    }
  }

  useInput((key: string, event: KeyEvent) => {
    if (event.ctrl && key === 'c') process.exit(0)
    if (key === 'enter' || key === 'return') {
      tryUnlock()
      return
    }
    setPassword((current: string) => {
      const edited = editValue(current, key, event)
      return edited !== null ? edited : current
    })
  })

  const innerWidth = BOX_WIDTH - 6

  return (
    <box flexDirection="row" height={9}>
      <box flexDirection="column" padding={1} border="round" borderColor="cyan" gap={1} width={BOX_WIDTH} height={9}>
        <text height={1} width={innerWidth} bold color="cyan">🔐 key — cofre bloqueado</text>
        <Field label="Senha:" labelWidth={7} value={password} width={innerWidth} isFocused={true} mask />
        <text height={1} width={innerWidth} color="red">{error || ' '}</text>
        <text height={1} width={innerWidth} dim>Enter desbloqueia · Ctrl+C sai</text>
      </box>
    </box>
  )
}
