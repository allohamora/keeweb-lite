import userEvent from '@testing-library/user-event';
import { ProviderSetupModal } from '@/components/unlock/provider-setup-modal';
import type { ProviderSetupAction, ProviderSetupModalViewProps } from '@/providers/registry';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { render } from '../utils/render.utils';

describe('provider-setup-modal', () => {
  it('shows loading state and retries a failed modal load', async () => {
    const user = userEvent.setup();
    const SetupView: ComponentType<ProviderSetupModalViewProps> = ({ open }) => <p>{open ? 'Setup loaded' : ''}</p>;
    const load = vi
      .fn<ProviderSetupAction['load']>()
      .mockRejectedValueOnce(new Error('Chunk unavailable'))
      .mockResolvedValueOnce({ default: SetupView });
    const definition: ProviderSetupAction = { label: 'Import', load };

    render(<ProviderSetupModal definition={definition} onComplete={vi.fn()} onOpenChange={vi.fn()} open />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading setup');
    expect(await screen.findByRole('alert')).toHaveTextContent('This setup option could not be loaded.');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Setup loaded')).toBeInTheDocument();
  });
});
