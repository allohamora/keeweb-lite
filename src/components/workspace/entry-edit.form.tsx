import type kdbx from '@/lib/kdbx.lib';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import { Copy01Icon, LinkSquare02Icon, ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Field, FieldContent, FieldError, FieldLabel } from '@/components/ui/field';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Input } from '@/components/ui/input';
import { InputGroupAddon, InputGroupButton } from '@/components/ui/input-group';
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from '@/components/ui/autocomplete';
import { TagSelect } from '@/components/ui/tag-select';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/utils/error.utils';
import { getEntryColor } from '@/services/color.service';
import {
  getAllColors,
  getAllTags,
  getAllUsernames,
  getEntryValues,
  findEntryByUuid,
  isEntryInRecycleBin,
  saveEntry,
} from '@/services/workspace.service';
import { entriesHaveSameContent } from '@/services/conflict-copy.service';
import type { FileRecord } from '@/repositories/record.repository';
import { EntryHistory } from '@/components/workspace/entry-history.component';
import { EntryRemove } from '@/components/workspace/entry-remove.component';
import { EntryRestore } from '@/components/workspace/entry-restore.component';
import { PasswordGenerator } from '@/components/workspace/password-generator.component';
import { IconColorPicker } from '@/components/workspace/icon-color-picker.component';
import { useSafeNet } from '@/hooks/use-safe-net.hook';
import { useEntryMutation } from '@/hooks/use-entry-mutation.hook';

const entryEditSchema = z.object({
  title: z.string(),
  username: z.string(),
  password: z.string(),
  url: z.string(),
  notes: z.string(),
  tags: z.array(z.string()),
  expiryTime: z.string(),
  icon: z.number().int().min(0).max(68),
  color: z.string().nullable(),
});

type EntryEditValues = z.infer<typeof entryEditSchema>;

type EntryEditFormProps = {
  database: kdbx.Kdbx;
  entry: kdbx.KdbxEntry;
  record: FileRecord;
  onSave: (payload: { nextDatabase: kdbx.Kdbx; nextEntryUuid?: kdbx.KdbxUuid | null; nextRecord: FileRecord }) => void;
  onDraftChange?: (isDirty: boolean, entry?: kdbx.KdbxEntry) => void;
};

export const EntryEditForm = ({ database, entry, record, onSave, onDraftChange }: EntryEditFormProps) => {
  const { setDirty, registerDiscard } = useSafeNet();
  const { isMutating, setMutating } = useEntryMutation();
  const [baseline, setBaseline] = useState(() => ({ database, entry }));
  const latestPropsRef = useRef({ database, entry });
  const hasDeferredRemoteUpdate = useRef(false);
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

  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setDirty(isDirty);
    onDraftChange?.(isDirty, isDirty ? entry : undefined);
  }, [entry, isDirty, onDraftChange, setDirty]);

  useEffect(() => {
    const propsChanged = latestPropsRef.current.database !== database || latestPropsRef.current.entry !== entry;
    latestPropsRef.current = { database, entry };
    if (propsChanged && isDirty) {
      hasDeferredRemoteUpdate.current = true;
      return;
    }
    if (isDirty || (!propsChanged && !hasDeferredRemoteUpdate.current)) return;
    const latestEntry = findEntryByUuid(database, entry.uuid);
    if (!latestEntry) {
      hasDeferredRemoteUpdate.current = false;
      return;
    }
    reset(getEntryValues(latestEntry));
    hasDeferredRemoteUpdate.current = false;
  }, [database, entry, isDirty, reset]);

  useEffect(() => {
    return () => setDirty(false);
  }, [setDirty]);

  const discardDraft = useCallback(() => {
    const latestEntry = findEntryByUuid(database, entry.uuid);
    if (latestEntry) {
      reset(getEntryValues(latestEntry));
      setBaseline({ database, entry: latestEntry });
      hasDeferredRemoteUpdate.current = false;
    } else {
      reset(getEntryValues(baseline.entry));
      hasDeferredRemoteUpdate.current = false;
    }
  }, [baseline.entry, database, entry.uuid, reset]);

  useEffect(() => {
    registerDiscard(discardDraft);

    return () => registerDiscard(null);
  }, [discardDraft, registerDiscard]);

  const remoteEntry = findEntryByUuid(database, entry.uuid);
  const baselineWasInRecycleBin = isEntryInRecycleBin(baseline.database, baseline.entry);
  const remoteIsDeleted = !remoteEntry || (!baselineWasInRecycleBin && isEntryInRecycleBin(database, remoteEntry));
  const remoteChanged = Boolean(remoteEntry && !entriesHaveSameContent(baseline.entry, remoteEntry));
  const needsConflictCopy = isDirty && (remoteIsDeleted || remoteChanged);

  const handleSaveSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSubmit(async (values) => {
      setMutating(true);
      try {
        const entryUuid = entry.uuid.toString();
        const result = await saveEntry({
          database,
          record,
          entryUuid,
          values,
          ...(needsConflictCopy ? { draftBaseline: { database: baseline.database, entryUuid } } : {}),
        });

        reset(values); // Reset the form state after the successful saving (isDirty, touched state, etc)
        setBaseline({
          database: result.nextDatabase,
          entry: findEntryByUuid(result.nextDatabase, result.nextEntryUuid) ?? baseline.entry,
        });
        hasDeferredRemoteUpdate.current = false;
        onSave?.(result);
        toast.success(needsConflictCopy ? 'Draft saved as a conflict copy.' : 'Entry saved.');
      } catch (error) {
        toast.error(getErrorMessage({ error, fallback: 'Entry save failed.' }));
      } finally {
        setMutating(false);
      }
    })(event);
  };

  const handleSave = (payload: {
    nextDatabase: kdbx.Kdbx;
    nextEntryUuid?: kdbx.KdbxUuid | null;
    nextRecord: FileRecord;
  }) => {
    reset(); // Reset the form state after remove/restore (isDirty, touched state, etc)
    setBaseline({ database: payload.nextDatabase, entry: findEntryByUuid(payload.nextDatabase, entry.uuid) ?? entry });
    hasDeferredRemoteUpdate.current = false;
    onSave?.(payload);
  };

  const handleApplyHistory = (values: EntryEditValues) => {
    for (const [field, value] of Object.entries(values)) {
      setValue(field as keyof EntryEditValues, value, { shouldDirty: true });
    }
  };

  const copy = (value: string, name: string) => () => {
    if (!navigator.clipboard) {
      toast.error('Clipboard is not available.');
      return;
    }

    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(`${name} copied.`))
      .catch((error) => toast.error(getErrorMessage({ error, fallback: `${name} copy failed.` })));
  };

  const openUrl = (value: string) => () => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      toast.error('URL open failed. Please enter URL and try again.');
      return;
    }

    try {
      const hasProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmedValue);
      const url = new URL(hasProtocol ? trimmedValue : `https://${trimmedValue}`);

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        toast.error('URL open failed. Only HTTP and HTTPS URLs are supported.');
        return;
      }

      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'URL open failed.' }));
    }
  };

  const tagOptions = getAllTags(database);
  const usernameOptions = getAllUsernames(database);
  const currentColor = getEntryColor(entry);
  // getAllColors excludes the recycle bin (for filter navigation), so add this entry's own
  // color back in here, otherwise a trashed entry's unique color has no swatch in its own picker
  const colorOptions = currentColor ? [...new Set([...getAllColors(database), currentColor])] : getAllColors(database);
  const isInTrash = isEntryInRecycleBin(database, entry);

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onChangeCapture={() => {
        if (!isDirty) setBaseline({ database, entry });
      }}
      onSubmit={handleSaveSubmit}
    >
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {needsConflictCopy && (
          <div
            role="status"
            className="flex items-start justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs"
          >
            <p>
              {remoteIsDeleted
                ? 'This entry was deleted remotely. Saving keeps your draft as a conflict copy.'
                : 'This entry changed remotely. Saving keeps your draft as a conflict copy.'}
            </p>
            <Button className="h-7 shrink-0 px-2 text-xs" onClick={discardDraft} type="button" variant="outline">
              Discard draft
            </Button>
          </div>
        )}
        <section className="space-y-3">
          <Controller
            control={control}
            name="title"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="entry-title">Title</FieldLabel>
                <FieldContent>
                  <div className="relative">
                    <Input
                      {...field}
                      aria-invalid={fieldState.invalid}
                      className="h-8 px-8 text-xs"
                      id="entry-title"
                      placeholder="Title"
                      type="text"
                    />
                    <div className="absolute inset-y-0 left-0 flex items-center pl-1">
                      <Controller
                        control={control}
                        name="icon"
                        render={({ field: iconField }) => (
                          <Controller
                            control={control}
                            name="color"
                            render={({ field: colorField }) => (
                              <IconColorPicker
                                iconValue={iconField.value}
                                onIconChange={iconField.onChange}
                                colorValue={colorField.value}
                                onColorChange={colorField.onChange}
                                databaseColors={colorOptions}
                                className="text-muted-foreground hover:text-foreground"
                              />
                            )}
                          />
                        )}
                      />
                    </div>
                    <div className="absolute inset-y-0 right-0 flex items-center">
                      <button
                        type="button"
                        className="flex items-center px-2 text-muted-foreground hover:text-foreground"
                        onClick={copy(field.value, 'Title')}
                        aria-label="Copy title"
                      >
                        <HugeiconsIcon icon={Copy01Icon} size={14} />
                      </button>
                    </div>
                  </div>
                  <FieldError errors={[fieldState.error]} />
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="username"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="entry-username">Username</FieldLabel>
                <FieldContent>
                  <Autocomplete
                    items={usernameOptions}
                    value={field.value}
                    onValueChange={field.onChange}
                    openOnInputClick
                  >
                    <AutocompleteInput
                      aria-invalid={fieldState.invalid}
                      className="h-8 text-xs"
                      id="entry-username"
                      name={field.name}
                      placeholder="Username"
                      onBlur={field.onBlur}
                    >
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          size="icon-xs"
                          variant="ghost"
                          aria-label="Copy username"
                          onClick={copy(field.value, 'Username')}
                        >
                          <HugeiconsIcon icon={Copy01Icon} size={14} />
                        </InputGroupButton>
                      </InputGroupAddon>
                    </AutocompleteInput>
                    <AutocompleteContent>
                      <AutocompleteList>
                        {(item: string) => (
                          <AutocompleteItem key={item} value={item}>
                            {item}
                          </AutocompleteItem>
                        )}
                      </AutocompleteList>
                    </AutocompleteContent>
                  </Autocomplete>
                  <FieldError errors={[fieldState.error]} />
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="entry-password">Password</FieldLabel>
                <FieldContent>
                  <div className="relative">
                    <Input
                      {...field}
                      autoComplete="off"
                      aria-invalid={fieldState.invalid}
                      className="h-8 pr-24 text-xs"
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
                      <PasswordGenerator
                        currentPassword={field.value}
                        onApply={(password) => setValue('password', password, { shouldDirty: true })}
                      />
                      <button
                        type="button"
                        className="flex items-center px-2 text-muted-foreground hover:text-foreground"
                        onClick={copy(field.value, 'Password')}
                        aria-label="Copy password"
                      >
                        <HugeiconsIcon icon={Copy01Icon} size={14} />
                      </button>
                    </div>
                  </div>
                  <FieldError errors={[fieldState.error]} />
                </FieldContent>
              </Field>
            )}
          />
        </section>

        <section className="space-y-3">
          <Controller
            control={control}
            name="url"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="entry-url">URL</FieldLabel>
                <FieldContent>
                  <div className="relative">
                    <Input
                      {...field}
                      aria-invalid={fieldState.invalid}
                      className="h-8 pr-16 text-xs"
                      id="entry-url"
                      placeholder="https://"
                      type="text"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center">
                      <button
                        type="button"
                        className="flex items-center px-2 text-muted-foreground hover:text-foreground"
                        onClick={openUrl(field.value)}
                        aria-label="Open URL"
                      >
                        <HugeiconsIcon icon={LinkSquare02Icon} size={14} />
                      </button>
                      <button
                        type="button"
                        className="flex items-center px-2 text-muted-foreground hover:text-foreground"
                        onClick={copy(field.value, 'URL')}
                        aria-label="Copy URL"
                      >
                        <HugeiconsIcon icon={Copy01Icon} size={14} />
                      </button>
                    </div>
                  </div>
                  <FieldError errors={[fieldState.error]} />
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="tags"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
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
                  <FieldError errors={[fieldState.error]} />
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="expiryTime"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="entry-expires">Expires</FieldLabel>
                <FieldContent>
                  <DateTimePicker id="entry-expires" value={field.value} onChange={field.onChange} />
                  <FieldError errors={[fieldState.error]} />
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="notes"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="entry-notes">Notes</FieldLabel>
                <FieldContent>
                  <Textarea
                    {...field}
                    aria-invalid={fieldState.invalid}
                    className="min-h-24 resize-none text-xs"
                    id="entry-notes"
                    placeholder="Notes"
                  />
                  <FieldError errors={[fieldState.error]} />
                </FieldContent>
              </Field>
            )}
          />
        </section>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            {!needsConflictCopy && (
              <EntryRemove database={database} entry={entry} record={record} onRemove={handleSave} />
            )}
            {!needsConflictCopy && isInTrash && (
              <EntryRestore database={database} entry={entry} record={record} onRestore={handleSave} />
            )}
          </div>
          <Button className="h-8 px-4 text-xs" disabled={!isDirty || isMutating} type="submit" variant="outline">
            {isSubmitting ? 'Saving...' : needsConflictCopy ? 'Save as conflict copy' : 'Save'}
          </Button>
        </div>

        <Separator className="my-3" />

        <EntryHistory history={entry.history} onApply={handleApplyHistory} />
      </div>
    </form>
  );
};
