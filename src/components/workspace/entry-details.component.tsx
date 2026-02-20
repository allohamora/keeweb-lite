import type kdbx from '@/lib/kdbx.lib';
import { Field, FieldContent, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { getFieldText } from '@/services/workspace.service';

type EntryDetailsProps = {
  className?: string;
  selectedEntry: kdbx.KdbxEntry | null;
};

export const EntryDetails = ({ className, selectedEntry }: EntryDetailsProps) => {
  if (!selectedEntry) {
    return (
      <aside className={cn('flex h-full min-w-0 flex-1 flex-col bg-background', className)}>
        <div className="border-b border-border px-3 py-2">
          <p className="truncate text-xs font-medium text-foreground">Record</p>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <p className="text-xs text-muted-foreground">Select a record to view its details.</p>
        </div>
      </aside>
    );
  }

  const title = getFieldText(selectedEntry.fields.get('Title'));
  const username = getFieldText(selectedEntry.fields.get('UserName'));
  const password = getFieldText(selectedEntry.fields.get('Password'));
  const url = getFieldText(selectedEntry.fields.get('URL'));
  const notes = getFieldText(selectedEntry.fields.get('Notes'));

  return (
    <aside className={cn('flex h-full min-w-0 flex-1 flex-col bg-background', className)}>
      <div className="border-b border-border px-3 py-2">
        <p className="truncate text-xs font-medium text-foreground">Record</p>
      </div>
      <form className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <section className="space-y-3">
            <Field>
              <FieldLabel htmlFor="entry-title">Title</FieldLabel>
              <FieldContent>
                <Input
                  className="h-8 text-xs"
                  disabled
                  id="entry-title"
                  placeholder="Title"
                  type="text"
                  value={title}
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="entry-username">Username</FieldLabel>
              <FieldContent>
                <Input
                  className="h-8 text-xs"
                  disabled
                  id="entry-username"
                  placeholder="Username"
                  type="text"
                  value={username}
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="entry-password">Password</FieldLabel>
              <FieldContent>
                <Input
                  className="h-8 text-xs"
                  disabled
                  id="entry-password"
                  placeholder="Password"
                  type="password"
                  value={password}
                />
              </FieldContent>
            </Field>
          </section>

          <section className="space-y-3">
            <Field>
              <FieldLabel htmlFor="entry-url">URL</FieldLabel>
              <FieldContent>
                <Input className="h-8 text-xs" disabled id="entry-url" placeholder="https://" type="url" value={url} />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="entry-notes">Notes</FieldLabel>
              <FieldContent>
                <Textarea className="min-h-24 text-xs" disabled id="entry-notes" placeholder="Notes" value={notes} />
              </FieldContent>
            </Field>
          </section>
        </div>
      </form>
    </aside>
  );
};
