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

type CreateMenuProps = {
  onRecordCreated: () => void;
};

export const CreateMenu = ({ onRecordCreated }: CreateMenuProps) => {
  const providers = getProvidersWithSetupAction('create');
  const [openProviderId, setOpenProviderId] = useState<string | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 px-3 text-xs" type="button" variant="outline">
            Create
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
        const action = provider.setupActions.create;
        if (!action) return null;

        return (
          <ProviderSetupModal
            key={provider.id}
            action="create"
            definition={action}
            onComplete={onRecordCreated}
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
