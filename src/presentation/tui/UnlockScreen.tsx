import { Box, Text, useInput } from 'ink'
import { useState } from 'react'
import { vaultAccess } from '../../composition.ts'
import { WrongPasswordError } from '../../domain/errors.ts'
import { PasswordInput } from './components/password-input.tsx'
import { useTuiStore } from './store.ts'

const MAX_ATTEMPTS = 3
const BOX_WIDTH = 56

export function UnlockScreen() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const setVault = useTuiStore((s) => s.setVault)

  const tryUnlock = async (current: string) => {
    if (current === '') return
    try {
      const vault = await vaultAccess.openWithPassword(current)
      vaultAccess.startSession(vault)
      setVault(vault)
    } catch (err) {
      if (err instanceof WrongPasswordError) {
        const attempt = attempts + 1
        if (attempt >= MAX_ATTEMPTS) process.exit(1)
        setAttempts(attempt)
        setPassword('')
        setError(`Wrong password (${attempt}/${MAX_ATTEMPTS}).`)
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  useInput((input, key) => {
    if (key.ctrl && input === 'c') process.exit(0)
  })

  const innerWidth = BOX_WIDTH - 6

  return (
    <Box flexDirection="row" height={10}>
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan" gap={1} width={BOX_WIDTH}>
        <Text bold color="cyan">🔐 kv — vault locked</Text>
        <PasswordInput
          label="Password"
          value={password}
          onChange={setPassword}
          onSubmit={tryUnlock}
          autoFocus
          bordered={false}
          width={innerWidth}
        />
        <Text color="red">{error || ' '}</Text>
        <Text dimColor>Enter unlocks · Ctrl+C quits</Text>
      </Box>
    </Box>
  )
}
