import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[FYM ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-surface flex flex-col items-center justify-center px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-error/10 flex items-center justify-center mb-5 text-2xl">
            ⚠️
          </div>
          <h1 className="font-display font-semibold text-on-surface text-xl mb-2">
            Algo ha fallado
          </h1>
          <p className="text-body text-on-surface/50 font-body mb-6">
            Tus datos siguen seguros en el dispositivo.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="bg-primary text-on-primary rounded-xl px-6 py-3 font-body font-medium"
          >
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
