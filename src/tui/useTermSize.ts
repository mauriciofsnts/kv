// useTerminalSize do @termuijs/jsx 0.1.7 devolve 0x0; este hook lê o
// tamanho real do TTY e acompanha resizes.
import { useEffect, useState } from '@termuijs/jsx'

export function useTermSize(): { cols: number; rows: number } {
  const [size, setSize] = useState({
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  })

  useEffect(() => {
    const onResize = () =>
      setSize({ cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 })
    process.stdout.on('resize', onResize)
    return () => {
      process.stdout.off('resize', onResize)
    }
  }, [])

  return size
}
