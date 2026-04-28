import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabErrorBoundary } from '../TabErrorBoundary';

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { tab?: string }) => {
      if (key === 'dashboard.tabError.title' && options?.tab) {
        return `Error in ${options.tab} tab`;
      }
      if (key === 'dashboard.tabError.description') {
        return 'This tab failed to load. Other tabs are unaffected.';
      }
      if (key === 'dashboard.tabError.retry') {
        return 'Try again';
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom');
  return <div data-testid="child-ok">child-ok</div>;
}

function Toggleable({ initialThrow = true }: { initialThrow?: boolean }) {
  const [shouldThrow, setShouldThrow] = useState(initialThrow);
  return (
    <>
      <button data-testid="toggle" onClick={() => setShouldThrow((v) => !v)}>
        toggle
      </button>
      <TabErrorBoundary tabLabel="Practice">
        <ThrowingChild shouldThrow={shouldThrow} />
      </TabErrorBoundary>
    </>
  );
}

describe('TabErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress React's noisy console.error from caught errors
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when no error is thrown', () => {
    render(
      <TabErrorBoundary tabLabel="Practice">
        <ThrowingChild shouldThrow={false} />
      </TabErrorBoundary>
    );
    expect(screen.getByTestId('child-ok')).toBeInTheDocument();
  });

  it('catches an error from a child and renders the fallback UI', () => {
    render(
      <TabErrorBoundary tabLabel="Practice">
        <ThrowingChild shouldThrow={true} />
      </TabErrorBoundary>
    );
    expect(screen.queryByTestId('child-ok')).not.toBeInTheDocument();
    expect(screen.getByText('This tab failed to load. Other tabs are unaffected.')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  it('interpolates the tab label into the localized title', () => {
    render(
      <TabErrorBoundary tabLabel="Practice">
        <ThrowingChild shouldThrow={true} />
      </TabErrorBoundary>
    );
    expect(screen.getByText('Error in Practice tab')).toBeInTheDocument();
  });

  it('logs the error to logger.error when a child throws', async () => {
    const { logger } = await import('@/lib/logger');
    render(
      <TabErrorBoundary tabLabel="Practice">
        <ThrowingChild shouldThrow={true} />
      </TabErrorBoundary>
    );
    expect(logger.error).toHaveBeenCalled();
    const firstArg = (logger.error as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(typeof firstArg).toBe('string');
    expect(firstArg).toContain('TabErrorBoundary');
  });

  it('clicking retry resets the boundary and re-renders children if no longer throwing', () => {
    render(<Toggleable initialThrow={true} />);
    // Confirm fallback first
    expect(screen.getByText('Try again')).toBeInTheDocument();
    expect(screen.queryByTestId('child-ok')).not.toBeInTheDocument();

    // Toggle the child to stop throwing, then click retry
    fireEvent.click(screen.getByTestId('toggle'));
    fireEvent.click(screen.getByText('Try again'));

    // Child should now render normally
    expect(screen.getByTestId('child-ok')).toBeInTheDocument();
    expect(screen.queryByText('Try again')).not.toBeInTheDocument();
  });
});
