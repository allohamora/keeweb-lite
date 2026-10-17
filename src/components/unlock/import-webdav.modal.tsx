import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
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
import { importWebDavRecord } from '@/services/record.service';
import { getErrorMessage } from '@/utils/error.utils';
import { webdavConnectionSchema } from '@/providers/webdav.provider';
import { useSetupOperation } from '@/hooks/use-setup-operation.hook';

export type ImportWebDavModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecordImported: () => void;
};

const schema = webdavConnectionSchema.extend({
  databasePassword: z.string().min(1, 'Enter the database password.'),
  keyFile: z.instanceof(FileList).optional(),
});

type FormValues = z.infer<typeof schema>;

export const ImportWebDavModal = ({ open, onOpenChange, onRecordImported }: ImportWebDavModalProps) => {
  const { abort, begin, finish } = useSetupOperation(open);
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
    if (!nextOpen) abort();
    onOpenChange(nextOpen);
  };

  const submit = handleSubmit(async ({ url, username, password, databasePassword, keyFile }) => {
    const controller = begin();
    try {
      await importWebDavRecord({ url, username, password, databasePassword, keyFile, signal: controller.signal });
      onRecordImported();
      handleOpenChange(false);
      toast.success('WebDAV database imported.');
    } catch (error) {
      if (!controller.signal.aborted) toast.error(getErrorMessage({ error, fallback: 'WebDAV import failed.' }));
    } finally {
      finish(controller);
    }
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-lg"
        onAnimationEnd={(event) => {
          if (event.currentTarget.dataset.state === 'closed') reset();
        }}
      >
        <DialogHeader>
          <DialogTitle>Import WebDAV Database</DialogTitle>
          <DialogDescription>
            Connect to a full HTTPS file URL. Connection details are saved in a separate encrypted local database.
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
                <FieldLabel htmlFor="import-webdav-username">Username</FieldLabel>
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
                <FieldLabel htmlFor="import-webdav-password">Password or app password</FieldLabel>
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
