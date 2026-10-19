import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getDialogItems } from '@/services/provider-registry';
import type { Provider } from '@/services/provider';

type ProviderMenuProps = {
  label: string;
  dialog: 'ImportDialog' | 'CreateDialog';
  onSuccess: () => void;
  disabled?: boolean;
};

export const ProviderMenu = ({ label, dialog, onSuccess, disabled = false }: ProviderMenuProps) => {
  const [openType, setOpenType] = useState<Provider['type'] | null>(null);
  const items = getDialogItems(dialog);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 px-3 text-xs" disabled={disabled} type="button" variant="outline">
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map(({ type, label: itemLabel }) => (
            <DropdownMenuItem key={type} onSelect={() => setOpenType(type)}>
              {itemLabel}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {items.map(({ type, Dialog }) => (
        <Dialog
          key={type}
          open={openType === type}
          onOpenChange={(open) => setOpenType(open ? type : null)}
          onSuccess={onSuccess}
        />
      ))}
    </>
  );
};
