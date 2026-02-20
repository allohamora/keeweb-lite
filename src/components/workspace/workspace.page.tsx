import type kdbx from '@/lib/kdbx.lib';
import { useState } from 'react';
import type { UnlockSession } from '@/services/session.service';
import { MenuPane } from '@/components/workspace/menu-pane.component';
import { EntryList } from '@/components/workspace/entry-list.component';
import { EntryDetails } from '@/components/workspace/entry-details.component';

type WorkspacePageProps = {
  session: UnlockSession;
};

export const WorkspacePage = ({ session: { database } }: WorkspacePageProps) => {
  const [selectedGroup, setSelectedGroup] = useState<kdbx.KdbxGroup | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<kdbx.KdbxEntry | null>(null);

  const handleSelectGroup = (group: kdbx.KdbxGroup | null) => {
    setSelectedGroup(group);
    setSelectedEntry(null);
  };

  const handleSelectEntry = (entry: kdbx.KdbxEntry) => {
    setSelectedEntry(entry);
  };

  return (
    <div className="flex h-dvh min-h-dvh overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <MenuPane
          className="flex"
          database={database}
          onSelectGroup={handleSelectGroup}
          selectedGroup={selectedGroup}
        />
        <EntryList
          className="flex"
          database={database}
          onSelectEntry={handleSelectEntry}
          selectedGroup={selectedGroup}
          selectedEntry={selectedEntry}
        />
        <EntryDetails className="flex" selectedEntry={selectedEntry} />
      </div>
    </div>
  );
};
