import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '@/app';
import { mockServer } from '@tests/setup-component-context';
import { demoFile } from '@tests/utils/demo-file';
import { render } from '@tests/utils/render';

describe('app', () => {
  describe('workspace loading', () => {
    it('shows the workspace after the demo starts', async () => {
      mockServer.addHandlers(demoFile.ok());

      const user = userEvent.setup();

      render(<App />);
      await user.click(screen.getByRole('button', { name: 'Demo' }));

      expect(await screen.findByRole('button', { name: 'All Items' }, { timeout: 5000 })).toBeInTheDocument();
      expect(document.title).toBe('Workspace - Keeweb Lite');
    });
  });
});
