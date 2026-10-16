import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Label } from '@/components/ui/label';
import { createDatabaseRecord, LocalRecoveryRecordSavedError } from '@/services/record.service';
import { downloadBytes } from '@/utils/download.utils';
import { getErrorMessage } from '@/utils/error.utils';

export type CreateWebDavModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecordCreated: () => void;
};

const schema = z
  .object({
    databaseName: z.string().trim().min(1, 'Enter a database name.'),
    url: z.string().trim().min(1, 'Enter the full HTTPS WebDAV destination file URL.'),
    username: z.string().trim().min(1, 'Enter a WebDAV username.'),
    serverPassword: z.string().min(1, 'Enter a WebDAV password or app password.'),
    password: z.string().min(1, 'Enter a master password.'),
    confirmPassword: z.string().min(1, 'Confirm your master password.'),
    useKeyFile: z.boolean(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export const CreateWebDavModal = ({ open, onOpenChange, onRecordCreated }: CreateWebDavModalProps) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    reset,
  } = useForm<FormValues>({
    defaultValues: {
      databaseName: '',
      url: '',
      username: '',
      serverPassword: '',
      password: '',
      confirmPassword: '',
      useKeyFile: false,
    },
    resolver: zodResolver(schema),
  });

  const submit = handleSubmit(async ({ databaseName, url, username, serverPassword, password, useKeyFile }) => {
    try {
      const result = await createDatabaseRecord({
        providerId: 'webdav',
        databaseName,
        password,
        useKeyFile,
        setupInput: { url, username, password: serverPassword },
      });

      if (result.keyFileBytes && result.keyFileName)
        downloadBytes({ bytes: result.keyFileBytes, fileName: result.keyFileName });
      onRecordCreated();
      onOpenChange(false);
      toast.success('WebDAV database created.');
    } catch (error) {
      if (error instanceof LocalRecoveryRecordSavedError) onRecordCreated();
      toast.error(getErrorMessage({ error, fallback: 'WebDAV database creation failed.' }));
    }
  });

  const textFields: Array<{
    name: 'databaseName' | 'url' | 'username' | 'serverPassword' | 'password' | 'confirmPassword';
    label: string;
    type: string;
    autoComplete?: string;
  }> = [
    { name: 'databaseName', label: 'Database name', type: 'text' },
    { name: 'url', label: 'HTTPS destination file URL', type: 'url', autoComplete: 'url' },
    { name: 'username', label: 'WebDAV username', type: 'text', autoComplete: 'username' },
    {
      name: 'serverPassword',
      label: 'WebDAV password or app password',
      type: 'password',
      autoComplete: 'new-password',
    },
    { name: 'password', label: 'Database master password', type: 'password', autoComplete: 'new-password' },
    { name: 'confirmPassword', label: 'Confirm master password', type: 'password', autoComplete: 'new-password' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-lg"
        onAnimationEnd={(event) => {
          if (event.currentTarget.dataset.state === 'closed') reset();
        }}
      >
        <DialogHeader>
          <DialogTitle>Create WebDAV Database</DialogTitle>
          <DialogDescription>
            Create the encrypted database at the given URL. The destination collection must already exist.
          </DialogDescription>
        </DialogHeader>

        <form
          className="max-h-[calc(100dvh-12rem)] space-y-3 overflow-y-auto pr-1"
          onSubmit={(event) => void submit(event)}
        >
          {textFields.map(({ name, label, type, autoComplete }) => (
            <Controller
              key={name}
              control={control}
              name={name}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`create-webdav-${name}`}>{label}</FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    autoComplete={autoComplete}
                    id={`create-webdav-${name}`}
                    type={type}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          ))}
          <Controller
            control={control}
            name="useKeyFile"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={field.value}
                  id="create-webdav-use-key-file"
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
                <Label className="cursor-pointer text-xs" htmlFor="create-webdav-use-key-file">
                  Use key file (generated and downloaded automatically)
                </Label>
              </div>
            )}
          />
          <DialogFooter className="pt-3">
            <Button className="h-8 px-4 text-xs" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
