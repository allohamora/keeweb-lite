import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UnlockPage } from '@/components/unlock/unlock.page';
import { mockServer } from '../setup-component-context';
import { demoFile } from '../utils/demo-file.utils';
import { render } from '../utils/render.utils';

describe('unlock.page', () => {
  it('starts an in-memory demo session when the Demo button is clicked', async () => {
    mockServer.addHandlers(demoFile.ok());

    const user = userEvent.setup();
    const setSession = vi.fn();

    render(<UnlockPage setSession={setSession} />);
    await user.click(screen.getByRole('button', { name: 'Demo' }));

    await vi.waitFor(() => {
      expect(setSession).toHaveBeenCalledOnce();
    });

    const session = setSession.mock.calls[0]?.[0];
    expect(session.record).toEqual({ id: 'demo', type: 'demo', kdbx: { name: 'Demo' } });
    expect(session.version).toBe(0);
  });
});
