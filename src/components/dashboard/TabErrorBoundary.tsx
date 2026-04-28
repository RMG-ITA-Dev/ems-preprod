import { Component, ErrorInfo, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

interface ClassProps {
  fallback: (resetError: () => void, error: Error) => ReactNode;
  children: ReactNode;
}

interface ClassState {
  hasError: boolean;
  error: Error | null;
}

class TabErrorBoundaryClass extends Component<ClassProps, ClassState> {
  state: ClassState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ClassState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('TabErrorBoundary caught an error:', error, info);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback(this.reset, this.state.error);
    }
    return this.props.children;
  }
}

interface TabErrorFallbackProps {
  tabLabel: string;
  error: Error;
  onRetry: () => void;
}

function TabErrorFallback({ tabLabel, error, onRetry }: TabErrorFallbackProps) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
      <h3 className="text-base font-semibold text-foreground">
        {t('dashboard.tabError.title', { tab: tabLabel })}
      </h3>
      <p className="text-sm text-muted-foreground mt-1">
        {t('dashboard.tabError.description')}
      </p>
      {error.message && (
        <pre className="text-xs text-left bg-muted p-3 rounded-lg overflow-auto max-h-24 mt-3">
          {error.message}
        </pre>
      )}
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-3">
        {t('dashboard.tabError.retry')}
      </Button>
    </div>
  );
}

interface TabErrorBoundaryProps {
  tabLabel: string;
  children: ReactNode;
}

export function TabErrorBoundary({ tabLabel, children }: TabErrorBoundaryProps) {
  return (
    <TabErrorBoundaryClass
      fallback={(reset, error) => (
        <TabErrorFallback tabLabel={tabLabel} error={error} onRetry={reset} />
      )}
    >
      {children}
    </TabErrorBoundaryClass>
  );
}
