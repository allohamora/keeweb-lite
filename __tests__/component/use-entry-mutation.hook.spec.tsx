import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import { useEntryMutation } from '@/hooks/use-entry-mutation.hook';
import { render } from '../utils/render.utils';

const EntryMutationHarness = () => {
  const { isMutating, setMutating } = useEntryMutation();

  return (
    <div>
      <span data-testid="is-mutating">{isMutating ? 'mutating' : 'idle'}</span>
      <button onClick={() => setMutating(true)}>Start mutation</button>
      <button onClick={() => setMutating(false)}>Finish mutation</button>
    </div>
  );
};

describe('use-entry-mutation.hook', () => {
  describe('useEntryMutation', () => {
    it('throws when used outside an EntryMutationProvider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const Consumer = () => {
        useEntryMutation();
        return null;
      };

      expect(() => rtlRender(<Consumer />)).toThrow('useEntryMutation must be used within an EntryMutationProvider');

      consoleError.mockRestore();
    });

    it('defaults to not mutating', () => {
      render(<EntryMutationHarness />);

      expect(screen.getByTestId('is-mutating')).toHaveTextContent('idle');
    });

    it('reflects updates made through setMutating', async () => {
      const user = userEvent.setup();

      render(<EntryMutationHarness />);
      await user.click(screen.getByRole('button', { name: 'Start mutation' }));

      expect(screen.getByTestId('is-mutating')).toHaveTextContent('mutating');

      await user.click(screen.getByRole('button', { name: 'Finish mutation' }));

      expect(screen.getByTestId('is-mutating')).toHaveTextContent('idle');
    });
  });
});
