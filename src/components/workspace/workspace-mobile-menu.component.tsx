import type kdbx from '@/lib/kdbx.lib';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MenuPane } from '@/components/workspace/menu-pane.component';
import type { SelectFilter } from '@/services/workspace.service';

type WorkspaceMobileMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  database: kdbx.Kdbx;
  selectFilter: SelectFilter;
  onSelectFilter: (selectFilter: SelectFilter) => void;
};

export const WorkspaceMobileMenu = ({
  open,
  onOpenChange,
  database,
  selectFilter,
  onSelectFilter,
}: WorkspaceMobileMenuProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 h-dvh max-h-dvh w-full max-w-72 -translate-x-0 -translate-y-0 gap-0 overflow-hidden rounded-none border-r border-border p-0 sm:max-w-72"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Menu</DialogTitle>
        </DialogHeader>
        <MenuPane
          className="h-full w-full border-r-0"
          database={database}
          selectFilter={selectFilter}
          onSelectFilter={onSelectFilter}
        />
      </DialogContent>
    </Dialog>
  );
};
