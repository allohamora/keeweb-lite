import type kdbx from '@/lib/kdbx.lib';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete01Icon, GridViewIcon, Tag01Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import { getGroupIcon, resolveStandardIcon } from '@/services/icon.service';
import {
  getAllColors,
  getAllTags,
  getGroupTree,
  isColorSelect,
  isGroupSelect,
  isTagSelect,
  type SelectFilter,
} from '@/services/workspace.service';
import { ColorSwatch } from '@/components/workspace/color-swatch.component';

type MenuPaneProps = {
  className?: string;
  database: kdbx.Kdbx;
  selectFilter: SelectFilter;
  onSelectFilter: (selectFilter: SelectFilter) => void;
};

const navItemClass = (isSelected: boolean) => {
  return cn(
    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
    isSelected ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );
};

export const MenuPane = ({ className, database, selectFilter, onSelectFilter }: MenuPaneProps) => {
  const { items, recycleBinGroup } = getGroupTree(database);
  const tags = getAllTags(database);
  const colors = getAllColors(database);

  return (
    <nav className={cn('flex h-full w-60 min-w-0 flex-col border-r border-border bg-card', className)}>
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs font-medium text-foreground">Categories</p>
      </div>

      <div aria-label="Workspace groups" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="p-2 pb-1">
          <button className={navItemClass(selectFilter === null)} onClick={() => onSelectFilter(null)} type="button">
            <HugeiconsIcon className="shrink-0" icon={GridViewIcon} size={14} strokeWidth={1.5} />
            <span className="truncate">All Items</span>
          </button>
        </div>

        {colors.length > 0 && (
          <div className="px-2 pb-1">
            <div className="mb-1 px-2 text-[11px] text-muted-foreground">Colors</div>
            <div aria-label="Workspace colors" className="flex flex-wrap gap-1 px-2">
              <button
                aria-label="No color"
                aria-pressed={isColorSelect(selectFilter) && selectFilter.color === null}
                className={cn(
                  'flex items-center justify-center rounded-none border p-0.5',
                  isColorSelect(selectFilter) && selectFilter.color === null ? 'border-ring' : 'border-transparent',
                )}
                onClick={() => onSelectFilter({ color: null })}
                type="button"
              >
                <ColorSwatch color={null} size={14} />
              </button>
              {colors.map((color) => (
                <button
                  aria-label={`Color ${color}`}
                  aria-pressed={isColorSelect(selectFilter) && selectFilter.color === color}
                  className={cn(
                    'flex items-center justify-center rounded-none border p-0.5',
                    isColorSelect(selectFilter) && selectFilter.color === color ? 'border-ring' : 'border-transparent',
                  )}
                  key={color}
                  onClick={() => onSelectFilter({ color })}
                  type="button"
                >
                  <ColorSwatch color={color} size={14} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="min-h-0 min-w-0 flex-1 overflow-auto p-2 pt-1">
          {tags.length > 0 ? (
            <div className="mb-2">
              <div className="mb-1 px-2 text-[11px] text-muted-foreground">Tags</div>
              <div aria-label="Workspace tags" className="flex flex-col gap-0.5">
                {tags.map((tag) => (
                  <button
                    className={navItemClass(isTagSelect(selectFilter) && selectFilter.tag === tag)}
                    key={tag}
                    onClick={() => onSelectFilter({ tag })}
                    type="button"
                  >
                    <HugeiconsIcon className="shrink-0" icon={Tag01Icon} size={14} strokeWidth={1.5} />
                    <span className="truncate">{tag}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mb-1 px-2 text-[11px] text-muted-foreground">Groups</div>
          <div className="flex flex-col items-start gap-0.5">
            {items.map(({ group, depth }) => {
              return (
                <button
                  className={cn(
                    navItemClass(isGroupSelect(selectFilter) && group.uuid.equals(selectFilter)),
                    'w-max min-w-full',
                  )}
                  key={group.uuid.toString()}
                  onClick={() => onSelectFilter(group.uuid)}
                  style={{ paddingLeft: `${8 + depth * 12}px` }}
                  type="button"
                >
                  <HugeiconsIcon
                    className="shrink-0"
                    icon={resolveStandardIcon(getGroupIcon(group))}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <span className="whitespace-nowrap">{group.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {recycleBinGroup && (
          <div className="border-t border-border p-2">
            <button
              className={navItemClass(isGroupSelect(selectFilter) && recycleBinGroup.uuid.equals(selectFilter))}
              onClick={() => onSelectFilter(recycleBinGroup.uuid)}
              type="button"
            >
              <HugeiconsIcon className="shrink-0" icon={Delete01Icon} size={14} strokeWidth={1.5} />
              <span className="truncate">{recycleBinGroup.name}</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};
