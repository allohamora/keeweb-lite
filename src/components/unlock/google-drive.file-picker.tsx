import { useEffect, useState } from 'react';
import { useAsyncFn } from 'react-use';
import { HugeiconsIcon } from '@hugeicons/react';
import { File01Icon, Folder01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getFolderItems, type DriveItem } from '@/repositories/google-drive.repository';
import { getErrorMessage } from '@/utils/error.utils';

export type DriveFile = {
  id: string;
  name: string;
};

type FolderEntry = {
  id: string;
  name: string;
};

const ROOT: FolderEntry = { id: 'root', name: 'My Drive' };

export type GoogleDriveFilePickerProps = {
  value?: DriveFile | null;
  onChange: (file: DriveFile | null) => void;
  id?: string;
  'aria-invalid'?: boolean;
};

export const GoogleDriveFilePicker = ({
  value,
  onChange,
  id,
  'aria-invalid': ariaInvalid,
}: GoogleDriveFilePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [folderStack, setFolderStack] = useState<FolderEntry[]>([ROOT]);

  const currentFolder = folderStack.at(-1) ?? ROOT;

  const [state, fetchFolderItems] = useAsyncFn(async (folderId: string) => getFolderItems(folderId, 'kdbx'), []);

  useEffect(() => {
    if (!isOpen) return;
    void fetchFolderItems(currentFolder.id);
  }, [isOpen, currentFolder.id, fetchFolderItems]);

  const handleFolderClick = (item: DriveItem) => {
    setFolderStack((prev) => [...prev, { id: item.id, name: item.name }]);
  };

  const handleFileClick = (item: DriveItem) => {
    onChange({ id: item.id, name: item.name });
    setIsOpen(false);
  };

  const handleBreadcrumbClick = (index: number) => {
    setFolderStack((prev) => prev.slice(0, index + 1));
  };

  const items = state.value ?? [];
  const folders = items.filter((item) => item.isFolder);
  const files = items.filter((item) => !item.isFolder);
  const error = state.error ? getErrorMessage({ error: state.error, fallback: 'Failed to load Drive files.' }) : null;

  return (
    <>
      <Button
        id={id}
        type="button"
        variant="outline"
        aria-invalid={ariaInvalid}
        className="h-8 w-full justify-start px-2.5 py-1 text-xs font-normal"
        onClick={() => setIsOpen(true)}
      >
        {`Choose file ${value?.name ?? 'No file chosen'}`}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select a file</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-1 text-muted-foreground">
            {folderStack.map((folder, index) => (
              <span key={folder.id} className="flex items-center gap-1">
                {index > 0 && <span>/</span>}
                <button
                  type="button"
                  className={cn(
                    'hover:text-foreground',
                    index === folderStack.length - 1 && 'pointer-events-none font-medium text-foreground',
                  )}
                  onClick={() => handleBreadcrumbClick(index)}
                >
                  {folder.name}
                </button>
              </span>
            ))}
          </div>

          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {state.loading && <p className="py-4 text-center text-muted-foreground">Loading...</p>}
            {!state.loading && error && <p className="py-4 text-center text-destructive">{error}</p>}
            {!state.loading && !error && items.length === 0 && (
              <p className="py-4 text-center text-muted-foreground">No files found.</p>
            )}
            {!state.loading && !error && (
              <>
                {folders.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted"
                    onClick={() => handleFolderClick(item)}
                  >
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      strokeWidth={2}
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    {item.name}
                  </button>
                ))}
                {files.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted"
                    onClick={() => handleFileClick(item)}
                  >
                    <HugeiconsIcon
                      icon={File01Icon}
                      strokeWidth={2}
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    {item.name}
                  </button>
                ))}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
