// Adapted from termcn (github.com/shadcn-labs/termcn) registry/bases/ink/ui/error-boundary.tsx.
// Unchanged apart from import paths (no `@/` aliases in kv).
import { Box, Text } from 'ink'
import { Component } from 'react'
import type { ReactNode } from 'react'

export interface ErrorBoundaryProps {
  children: ReactNode
  title?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null, hasError: false }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error, hasError: true }
  }

  override render() {
    const { hasError, error } = this.state
    const { children, title = 'Error' } = this.props

    if (hasError) {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1}>
          <Text color="red" bold>
            ✖ {title}
          </Text>
          <Text color="white" bold>
            {error?.message ?? 'An unknown error occurred'}
          </Text>
        </Box>
      )
    }

    return children
  }
}
