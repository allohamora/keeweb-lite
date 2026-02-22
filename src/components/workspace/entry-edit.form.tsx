import type kdbx from '@/lib/kdbx.lib';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import { Copy01Icon, ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Field, FieldContent, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { TagSelect } from '@/components/ui/tag-select';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/utils/error.utils';
import { getAllTags, getEntryValues, isEntryInRecycleBin, saveEntry } from '@/services/workspace.service';
import { EntryHistory } from '@/components/workspace/entry-history.component';
import { EntryRemove } from '@/components/workspace/entry-remove.component';
import { EntryRestore } from '@/components/workspace/entry-restore.component';

const entryEditSchema = z.object({
  title: z.string(),
  username: z.string(),
  password: z.string(),
  url: z.string(),
  notes: z.string(),
  tags: z.array(z.string()),
});

type EntryEditValues = z.infer<typeof entryEditSchema>;

type EntryEditFormProps = {
  database: kdbx.Kdbx;
  entry: kdbx.KdbxEntry;
  recordId: string;
  onSave: (payload: { nextDatabase: kdbx.Kdbx; nextEntryUuid?: kdbx.KdbxUuid | null }) => void;
};

export const EntryEditForm = ({ database, entry, recordId, onSave }: EntryEditFormProps) => {
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { isDirty, isSubmitting },
  } = useForm<EntryEditValues>({
    defaultValues: getEntryValues(entry),
    resolver: zodResolver(entryEditSchema),
  });

  const handleSaveSubmit = handleSubmit(async (values) => {
    try {
      const entryUuid = entry.uuid.toString();
      const result = await saveEntry({
        database,
        recordId,
        entryUuid,
        values,
      });

      reset(values); // Reset the form state after the successful saving (isDirty, touched state, etc)
      onSave?.(result);
      toast.success('Entry saved.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Entry save failed.' }));
    }
  });

  const handleApplyHistory = (values: EntryEditValues) => {
    for (const [field, value] of Object.entries(values)) {
      setValue(field as keyof EntryEditValues, value, { shouldDirty: true });
    }
  };

  const copy = (value: string, message: string) => () => {
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(message))
      .catch((error) => toast.error(getErrorMessage({ error, fallback: 'Password copy failed.' })));
  };

  const [showPassword, setShowPassword] = useState(false);

  const tagOptions = getAllTags(database);
  const isInTrash = isEntryInRecycleBin(database, entry);

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        void handleSaveSubmit(e);
      }}
    >
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <section className="space-y-3">
          <Controller
            control={control}
            name="title"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="entry-title">Title</FieldLabel>
                <FieldContent>
                  <div className="relative">
                    <Input {...field} className="h-8 pr-8 text-xs" id="entry-title" placeholder="Title" type="text" />
                    <div className="absolute inset-y-0 right-0 flex items-center">
                      <button
                        type="button"
                        className="flex items-center px-2 text-muted-foreground hover:text-foreground"
                        onClick={copy(field.value, 'Title copied.')}
                        aria-label="Copy title"
                      >
                        <HugeiconsIcon icon={Copy01Icon} size={14} />
                      </button>
                    </div>
                  </div>
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="username"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="entry-username">Username</FieldLabel>
                <FieldContent>
                  <div className="relative">
                    <Input
                      {...field}
                      className="h-8 pr-8 text-xs"
                      id="entry-username"
                      placeholder="Username"
                      type="text"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center">
                      <button
                        type="button"
                        className="flex items-center px-2 text-muted-foreground hover:text-foreground"
                        onClick={copy(field.value, 'Username copied.')}
                        aria-label="Copy username"
                      >
                        <HugeiconsIcon icon={Copy01Icon} size={14} />
                      </button>
                    </div>
                  </div>
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="entry-password">Password</FieldLabel>
                <FieldContent>
                  <div className="relative">
                    <Input
                      {...field}
                      className="h-8 pr-16 text-xs"
                      id="entry-password"
                      placeholder="Password"
                      type={showPassword ? 'text' : 'password'}
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center">
                      <button
                        type="button"
                        className="flex items-center px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <HugeiconsIcon icon={showPassword ? ViewOffIcon : ViewIcon} size={14} />
                      </button>
                      <button
                        type="button"
                        className="flex items-center px-2 text-muted-foreground hover:text-foreground"
                        onClick={copy(field.value, 'Password copied.')}
                        aria-label="Copy password"
                      >
                        <HugeiconsIcon icon={Copy01Icon} size={14} />
                      </button>
                    </div>
                  </div>
                </FieldContent>
              </Field>
            )}
          />
        </section>

        <section className="space-y-3">
          <Controller
            control={control}
            name="url"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="entry-url">URL</FieldLabel>
                <FieldContent>
                  <div className="relative">
                    <Input {...field} className="h-8 pr-8 text-xs" id="entry-url" placeholder="https://" type="text" />
                    <div className="absolute inset-y-0 right-0 flex items-center">
                      <button
                        type="button"
                        className="flex items-center px-2 text-muted-foreground hover:text-foreground"
                        onClick={copy(field.value, 'URL copied.')}
                        aria-label="Copy URL"
                      >
                        <HugeiconsIcon icon={Copy01Icon} size={14} />
                      </button>
                    </div>
                  </div>
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="tags"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor="entry-tags" id="entry-tags-label">
                  Tags
                </FieldLabel>
                <FieldContent>
                  <TagSelect
                    ariaLabelledBy="entry-tags-label"
                    invalid={fieldState.invalid}
                    inputId="entry-tags"
                    options={tagOptions}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Add tags..."
                  />
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="notes"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="entry-notes">Notes</FieldLabel>
                <FieldContent>
                  <Textarea {...field} className="min-h-24 text-xs" id="entry-notes" placeholder="Notes" />
                </FieldContent>
              </Field>
            )}
          />
        </section>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <EntryRemove database={database} entry={entry} recordId={recordId} onRemove={onSave} />
            {isInTrash && <EntryRestore database={database} entry={entry} recordId={recordId} onRestore={onSave} />}
          </div>
          <Button className="h-8 px-4 text-xs" disabled={!isDirty || isSubmitting} type="submit" variant="outline">
            {isSubmitting ? 'Saving...' : 'Save'}
          </Button>
        </div>

        <Separator className="my-3" />

        <EntryHistory history={entry.history} onApply={handleApplyHistory} />
      </div>
    </form>
  );
};
