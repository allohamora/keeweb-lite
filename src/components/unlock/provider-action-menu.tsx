import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getProvidersWithSetupAction } from '@/providers/registry';
import { ProviderSetupModal } from './provider-setup-modal';

type ProviderActionMenuProps = {
  action: 'import' | 'create';
  onComplete: () => void;
};

export const ProviderActionMenu = ({ action, onComplete }: ProviderActionMenuProps) => {
  const providers = getProvidersWithSetupAction(action);
  const [openProviderId, setOpenProviderId] = useState<string | null>(null);
  const label = action === 'import' ? 'Import' : 'Create';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 px-3 text-xs" type="button" variant="outline">
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {providers.map(({ provider }) => (
            <DropdownMenuItem key={provider.id} onSelect={() => setOpenProviderId(provider.id)}>
              {provider.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {providers.map(({ provider, action: setupAction }) => (
        <ProviderSetupModal
          key={provider.id}
          definition={setupAction}
          onComplete={onComplete}
          onOpenChange={(open) => {
            if (!open) setOpenProviderId(null);
          }}
          open={openProviderId === provider.id}
        />
      ))}
    </>
  );
};
