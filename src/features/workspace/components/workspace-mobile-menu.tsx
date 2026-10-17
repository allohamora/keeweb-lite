import type kdbxweb from '@/utils/kdbxweb';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MenuPane } from '@/features/workspace/components/menu-pane';
import type { SelectFilter } from '@/features/workspace/services/entry';

type WorkspaceMobileMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  database: kdbxweb.Kdbx;
  selectFilter: SelectFilter;
  onSelectFilterChange: (selectFilter: SelectFilter) => void;
};

export const WorkspaceMobileMenu = ({
  open,
  onOpenChange,
  database,
  selectFilter,
  onSelectFilterChange,
}: WorkspaceMobileMenuProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 h-svh max-h-svh w-full max-w-72 translate-0 gap-0 overflow-hidden rounded-none border-r border-border p-0 sm:h-dvh sm:max-h-dvh sm:max-w-72"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Menu</DialogTitle>
        </DialogHeader>
        <div className="box-border flex size-full min-h-0 min-w-0 flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:py-0">
          <MenuPane
            className="min-h-0 w-full flex-1 border-r-0"
            database={database}
            selectFilter={selectFilter}
            onSelectFilterChange={onSelectFilterChange}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
