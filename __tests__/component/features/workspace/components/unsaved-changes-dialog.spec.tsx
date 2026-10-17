import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnsavedChangesDialog } from '@/features/workspace/components/unsaved-changes-dialog';

describe('unsaved-changes-dialog', () => {
  describe('UnsavedChangesDialog', () => {
    it('renders nothing when closed', () => {
      render(<UnsavedChangesDialog open={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);

      expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
    });

    it('shows the discard prompt when open', () => {
      render(<UnsavedChangesDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />);

      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
      expect(screen.getByText('Your changes have not been saved and will be lost.')).toBeInTheDocument();
    });

    it('calls onOpenChange(false) when Cancel is clicked', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      render(<UnsavedChangesDialog open onOpenChange={onOpenChange} onConfirm={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('calls onConfirm when Discard is clicked', async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();

      render(<UnsavedChangesDialog open onOpenChange={vi.fn()} onConfirm={onConfirm} />);
      await user.click(screen.getByRole('button', { name: 'Discard' }));

      expect(onConfirm).toHaveBeenCalledOnce();
    });
  });
});
