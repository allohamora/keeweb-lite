import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useAsync } from 'react-use';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { loadLocalUnlockRecords, unlockSelectedRecordForSession } from '@/services/kdbx.service';
import { useSessionStore } from '@/services/session.service';
import { getErrorMessage } from '@/utils/error.utils';

const unlockFormSchema = z.object({
  selectedRecordId: z.string().min(1, 'Create or select a file before unlocking.'),
  password: z.string().trim().min(1, 'Enter a password to unlock.'),
});

type UnlockFormValues = z.infer<typeof unlockFormSchema>;

export type UnlockFormProps = {
  recordsReloadToken: number;
};

export const UnlockForm = ({ recordsReloadToken }: UnlockFormProps) => {
  const {
    control,
    clearErrors,
    formState: { isSubmitting },
    handleSubmit,
    setError,
    setValue,
  } = useForm<UnlockFormValues>({
    defaultValues: {
      password: '',
      selectedRecordId: '',
    },
    resolver: zodResolver(unlockFormSchema),
  });
  const {
    error: recordsLoadError,
    loading: isLoadingRecords,
    value: loadedRecords,
  } = useAsync(async () => {
    const recordsResult = await loadLocalUnlockRecords();

    setValue('selectedRecordId', recordsResult.selectedRecordId ?? '', {
      shouldDirty: false,
      shouldTouch: false,
    });

    return recordsResult;
  }, [recordsReloadToken, setValue]);
  const records = loadedRecords?.records ?? [];

  const handleUnlockSubmit = handleSubmit(async ({ password: unlockPassword, selectedRecordId: selectedId }) => {
    const recordToUnlock = records.find(({ id }) => id === selectedId);
    if (!recordToUnlock) {
      setError('selectedRecordId', {
        message: 'Create or select a file before unlocking.',
        type: 'manual',
      });
      return;
    }

    clearErrors('password');

    try {
      const { session } = await unlockSelectedRecordForSession({
        password: unlockPassword,
        selectedRecord: recordToUnlock,
      });

      useSessionStore.getState().setSession({ session });
    } catch (error) {
      setError('password', {
        message: getErrorMessage({ error, fallback: 'Unlock failed. Check your password.' }),
        type: 'manual',
      });
    }
  });

  if (isLoadingRecords) {
    return (
      <div aria-live="polite" className="mt-4 min-h-4">
        <p className="text-xs text-zinc-400">Loading records...</p>
      </div>
    );
  }

  if (recordsLoadError) {
    return (
      <div aria-live="polite" className="mt-4 min-h-4">
        <p className="text-xs text-red-400">
          {getErrorMessage({
            error: recordsLoadError,
            fallback: 'Failed to load records. Try reloading the page.',
          })}
        </p>
      </div>
    );
  }

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(event) => {
        void handleUnlockSubmit(event);
      }}
    >
      <Controller
        control={control}
        name="selectedRecordId"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="unlock-selected-file">Selected file</FieldLabel>
            <FieldContent>
              <Select
                {...field}
                disabled={isLoadingRecords || records.length === 0 || isSubmitting}
                onValueChange={field.onChange}
                value={field.value}
              >
                <SelectTrigger
                  aria-invalid={fieldState.invalid}
                  className="h-10 w-full text-xs"
                  id="unlock-selected-file"
                >
                  <SelectValue placeholder={isLoadingRecords ? 'Loading records...' : 'No records available'} />
                </SelectTrigger>
                <SelectContent>
                  {records.map((record) => (
                    <SelectItem key={record.id} value={record.id}>
                      {record.kdbx.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <FieldLabel htmlFor="unlock-password">Password</FieldLabel>
            <FieldContent>
              <Input
                {...field}
                autoComplete="current-password"
                aria-invalid={fieldState.invalid}
                disabled={records.length === 0 || isSubmitting}
                id="unlock-password"
                placeholder="Enter password"
                type="password"
              />
              <FieldError errors={[fieldState.error]} />
            </FieldContent>
          </Field>
        )}
      />

      <div className="flex justify-end pt-3">
        <Button
          className="h-8 px-4 text-xs"
          disabled={records.length === 0 || isSubmitting}
          type="submit"
          variant="outline"
        >
          {isSubmitting ? 'Unlocking...' : 'Unlock'}
        </Button>
      </div>
    </form>
  );
};
