import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getImportItems } from '@/services/provider-registry';
import type { Provider } from '@/services/provider';

type ImportMenuProps = {
  onRecordImport: () => void;
  disabled?: boolean;
};

export const ImportMenu = ({ onRecordImport, disabled = false }: ImportMenuProps) => {
  const [openType, setOpenType] = useState<Provider['type'] | null>(null);
  const items = getImportItems();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 px-3 text-xs" disabled={disabled} type="button" variant="outline">
            Import
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map(({ type, label }) => (
            <DropdownMenuItem key={type} onSelect={() => setOpenType(type)}>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {items.map(({ type, Dialog }) => (
        <Dialog
          key={type}
          open={openType === type}
          onOpenChange={(open) => setOpenType(open ? type : null)}
          onSuccess={onRecordImport}
        />
      ))}
    </>
  );
};
