import * as z from 'zod/mini';
import { fileListSchema } from '@/utils/zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { importWebDavRecord } from '@/features/webdav/services/webdav';
import { getErrorMessage } from '@/utils/error';
import { webdavConnectionSchema } from '@/features/webdav/repositories/webdav';
import type { DialogProps } from '@/services/provider';

const schema = z.object({
  ...webdavConnectionSchema.shape,
  databasePassword: z.string().check(z.minLength(1, 'Enter the database password.')),
  keyFile: z.optional(fileListSchema('Select a key file.')),
});

type FormValues = z.infer<typeof schema>;

export const ImportWebDavDialog = ({ open, onOpenChange, onSuccess }: DialogProps) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    reset,
  } = useForm<FormValues>({
    defaultValues: { url: '', username: '', password: '', databasePassword: '', keyFile: undefined },
    resolver: zodResolver(schema),
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!isSubmitting) {
      onOpenChange(nextOpen);
    }
  };

  const submit = handleSubmit(async ({ url, username, password, databasePassword, keyFile }) => {
    try {
      await importWebDavRecord({ url, username, password, databasePassword, keyFile });
      onSuccess();
      onOpenChange(false);
      toast.success('WebDAV database imported.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'WebDAV import failed.' }));
    }
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isSubmitting}
        className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-lg"
        onAnimationEnd={(event) => {
          if (event.currentTarget.dataset.state === 'closed') {
            reset();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Import WebDAV Database</DialogTitle>
          <DialogDescription>
            Connect to a full HTTPS file URL. Connection details are stored encrypted on this device.
          </DialogDescription>
        </DialogHeader>

        <form
          className="max-h-[calc(100dvh-12rem)] space-y-3 overflow-y-auto pr-1"
          onSubmit={(event) => void submit(event)}
        >
          <Controller
            control={control}
            name="url"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="import-webdav-url">HTTPS file URL</FieldLabel>
                <Input
                  {...field}
                  aria-invalid={fieldState.invalid}
                  autoComplete="url"
                  id="import-webdav-url"
                  placeholder="https://files.example.com/path/vault.kdbx"
                  type="url"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="username"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="import-webdav-username">WebDAV username</FieldLabel>
                <Input
                  {...field}
                  aria-invalid={fieldState.invalid}
                  autoComplete="username"
                  id="import-webdav-username"
                  type="text"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="import-webdav-password">WebDAV password</FieldLabel>
                <Input
                  {...field}
                  aria-invalid={fieldState.invalid}
                  autoComplete="new-password"
                  id="import-webdav-password"
                  type="password"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="databasePassword"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="import-webdav-database-password">Database master password</FieldLabel>
                <Input
                  {...field}
                  aria-invalid={fieldState.invalid}
                  autoComplete="current-password"
                  id="import-webdav-database-password"
                  type="password"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="keyFile"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="import-webdav-key-file">Key file (optional)</FieldLabel>
                <Input
                  {...field}
                  value={undefined}
                  onChange={(event) => field.onChange(event.target.files)}
                  accept=".key,.keyx"
                  aria-invalid={fieldState.invalid}
                  id="import-webdav-key-file"
                  type="file"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <DialogFooter className="pt-3">
            <Button className="h-8 px-4 text-xs" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Connecting...' : 'Import'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
