import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { PasswordGenerator } from '@/components/workspace/password-generator.component';
import { render } from '../utils/render.utils';

describe('password-generator.component', () => {
  describe('PasswordGenerator', () => {
    it('derives the options from the current password', async () => {
      const user = userEvent.setup();

      render(<PasswordGenerator currentPassword="Abc123" onApply={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Generate password' }));

      expect(screen.getByLabelText('Length')).toHaveValue('6');
      expect(screen.getByRole('checkbox', { name: 'Uppercase' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Lowercase' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Numbers' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Symbols' })).not.toBeChecked();
      expect(screen.getByLabelText('Generated password')).toHaveValue('Abc123');
    });

    it('generates a password from the options and applies it', async () => {
      const user = userEvent.setup();
      const onApply = vi.fn();

      render(<PasswordGenerator currentPassword="abcd" onApply={onApply} />);
      await user.click(screen.getByRole('button', { name: 'Generate password' }));
      await user.clear(screen.getByLabelText('Length'));
      await user.type(screen.getByLabelText('Length'), '12');
      await user.click(screen.getByRole('button', { name: 'Generate' }));

      const generated = screen.getByLabelText<HTMLInputElement>('Generated password').value;
      expect(generated).toMatch(/^[a-z]{12}$/);

      await user.click(screen.getByRole('button', { name: 'Apply' }));

      expect(onApply).toHaveBeenCalledWith(generated);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not generate with a length below the minimum', async () => {
      const user = userEvent.setup();

      render(<PasswordGenerator currentPassword="abcd" onApply={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Generate password' }));
      await user.clear(screen.getByLabelText('Length'));
      await user.type(screen.getByLabelText('Length'), '3');
      await user.click(screen.getByRole('button', { name: 'Generate' }));

      expect(await screen.findByText('Length must be at least 4.')).toBeInTheDocument();
      expect(screen.getByLabelText('Generated password')).toHaveValue('abcd');
    });
  });
});
