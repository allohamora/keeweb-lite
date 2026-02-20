import type kdbx from '@/lib/kdbx.lib';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete01Icon, GridViewIcon, Tag01Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import { filterGroups } from '@/services/workspace.service';

type MenuPaneProps = {
  className?: string;
  database: kdbx.Kdbx;
  selectedGroup: kdbx.KdbxGroup | null;
  onSelectGroup: (group: kdbx.KdbxGroup | null) => void;
};

const navItemClass = (isSelected: boolean) => {
  return cn(
    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    isSelected ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );
};

export const MenuPane = ({ className, database, selectedGroup, onSelectGroup }: MenuPaneProps) => {
  const { groups, trash } = filterGroups(database);

  return (
    <nav className={cn('flex h-full w-60 min-w-0 flex-col border-r border-border bg-card', className)}>
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs font-medium text-foreground">Groups</p>
      </div>

      <div aria-label="Workspace groups" className="flex min-h-0 flex-1 flex-col" role="listbox">
        <div className="p-2 pb-1">
          <button
            aria-selected={selectedGroup === null}
            className={navItemClass(selectedGroup === null)}
            onClick={() => onSelectGroup(null)}
            role="option"
            type="button"
          >
            <HugeiconsIcon className="shrink-0" icon={GridViewIcon} size={14} strokeWidth={1.5} />
            <span className="truncate">All Items</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 pt-1">
          <div className="mb-1 px-2 text-[11px] text-muted-foreground">Collections</div>
          <div className="flex flex-col gap-0.5">
            {groups.map((group) => (
              <button
                aria-selected={group === selectedGroup}
                className={navItemClass(group === selectedGroup)}
                key={group.uuid.toString()}
                onClick={() => onSelectGroup(group)}
                role="option"
                type="button"
              >
                <HugeiconsIcon className="shrink-0" icon={Tag01Icon} size={14} strokeWidth={1.5} />
                <span className="truncate">{group.name}</span>
              </button>
            ))}
          </div>
        </div>

        {trash && (
          <div className="border-t border-border p-2">
            <button
              aria-selected={trash === selectedGroup}
              className={navItemClass(trash === selectedGroup)}
              onClick={() => onSelectGroup(trash)}
              role="option"
              type="button"
            >
              <HugeiconsIcon className="shrink-0" icon={Delete01Icon} size={14} strokeWidth={1.5} />
              <span className="truncate">Trash</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};
