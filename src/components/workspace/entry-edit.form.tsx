import type kdbx from '@/lib/kdbx.lib';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { TagSelect } from '@/components/ui/tag-select';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/utils/error.utils';
import { getAllTags, getFieldText, getTags, saveEntry, type EntryUpdateFields } from '@/services/workspace.service';

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
  onSave?: (nextDatabase: kdbx.Kdbx) => void;
};

export const EntryEditForm = ({ database, entry, recordId, onSave }: EntryEditFormProps) => {
  const title = getFieldText(entry.fields.get('Title'));
  const username = getFieldText(entry.fields.get('UserName'));
  const password = getFieldText(entry.fields.get('Password'));
  const url = getFieldText(entry.fields.get('URL'));
  const notes = getFieldText(entry.fields.get('Notes'));
  const tags = getTags(entry);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting },
  } = useForm<EntryEditValues>({
    defaultValues: { title, username, password, url, notes, tags },
    resolver: zodResolver(entryEditSchema),
  });

  const handleSaveSubmit = handleSubmit(async (values) => {
    try {
      const fields: EntryUpdateFields = {
        title: values.title,
        username: values.username,
        password: values.password,
        url: values.url,
        notes: values.notes,
        tags: values.tags,
      };

      const entryUuid = entry.uuid.toString();
      const updatedDatabase = await saveEntry({
        database,
        recordId,
        entryUuid,
        fields,
      });

      reset(values); // Reset form state after successful save (isDirty, touched state, etc)
      onSave?.(updatedDatabase);
      toast.success('Entry saved.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Failed to save entry.' }));
    }
  });

  const tagOptions = getAllTags(database);

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
                  <Input {...field} className="h-8 text-xs" id="entry-title" placeholder="Title" type="text" />
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
                  <Input {...field} className="h-8 text-xs" id="entry-username" placeholder="Username" type="text" />
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
                  <Input
                    {...field}
                    className="h-8 text-xs"
                    id="entry-password"
                    placeholder="Password"
                    type="password"
                  />
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
                  <Input {...field} className="h-8 text-xs" id="entry-url" placeholder="https://" type="url" />
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
      </div>

      <div className="flex justify-end px-4 pt-2 pb-4">
        <Button className="h-8 px-4 text-xs" disabled={!isDirty || isSubmitting} type="submit" variant="outline">
          {isSubmitting ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  );
};
