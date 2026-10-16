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

type ImportMenuProps = {
  onRecordImported: () => void;
};

export const ImportMenu = ({ onRecordImported }: ImportMenuProps) => {
  const providers = getProvidersWithSetupAction('import');
  const [openProviderId, setOpenProviderId] = useState<string | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 px-3 text-xs" type="button" variant="outline">
            Import
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {providers.map((provider) => (
            <DropdownMenuItem key={provider.id} onSelect={() => setOpenProviderId(provider.id)}>
              {provider.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {providers.map((provider) => {
        const action = provider.setupActions.import;
        if (!action) return null;

        return (
          <ProviderSetupModal
            key={provider.id}
            action="import"
            definition={action}
            onComplete={onRecordImported}
            onOpenChange={(open) => {
              if (!open) setOpenProviderId(null);
            }}
            open={openProviderId === provider.id}
          />
        );
      })}
    </>
  );
};
