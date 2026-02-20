import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useAsync } from 'react-use';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { unlockForSession, useSessionStore } from '@/services/session.service';
import { getErrorMessage } from '@/utils/error.utils';
import { getRecords } from '@/services/record.service';
import { toast } from 'sonner';

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
    formState: { isSubmitting },
    handleSubmit,
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
    value: records = [],
  } = useAsync(async () => await getRecords(), [recordsReloadToken]);

  const setSession = useSessionStore((state) => state.setSession);

  const handleUnlockSubmit = handleSubmit(async ({ password, selectedRecordId }) => {
    try {
      const record = records.find(({ id }) => id === selectedRecordId);
      if (!record) {
        throw new Error('Selected record not found.');
      }

      const session = await unlockForSession({
        record,
        password,
      });

      setSession({ session });
    } catch (error) {
      toast.error(
        getErrorMessage({
          error,
          fallback: 'Failed to unlock the database. Please check your password and try again.',
        }),
      );
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
                  <SelectValue
                    placeholder={
                      isLoadingRecords
                        ? 'Loading records...'
                        : records.length === 0
                          ? 'No records available'
                          : 'Select a file'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {records.map((record) => (
                    <SelectItem key={record.id} value={record.id}>
                      {record.kdbx.name} ({record.type === 'google-drive' ? 'Google Drive' : 'Local'})
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
