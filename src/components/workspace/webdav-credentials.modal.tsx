import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import { getErrorMessage } from '@/utils/error.utils';

export type WebDavCredentialsModalProps = {
  open: boolean;
  currentUrl: string;
  allowUrlChange: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { url: string; username: string; password: string }) => Promise<void>;
};

const schema = z.object({
  url: z.url({ error: 'Enter a valid WebDAV file URL.' }),
  username: z.string().trim().min(1, 'Enter a WebDAV username.'),
  password: z.string().min(1, 'Enter a WebDAV password or app password.'),
});

type FormValues = z.infer<typeof schema>;

export const WebDavCredentialsModal = ({
  open,
  currentUrl,
  allowUrlChange,
  onOpenChange,
  onSubmit,
}: WebDavCredentialsModalProps) => {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    reset,
  } = useForm<FormValues>({
    defaultValues: { url: currentUrl, username: '', password: '' },
    resolver: zodResolver(schema),
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      reset({ url: currentUrl, username: '', password: '' });
      setSubmitError(null);
    }
    onOpenChange(nextOpen);
  };

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit(values);
      reset();
      onOpenChange(false);
    } catch (error) {
      setSubmitError(getErrorMessage({ error, fallback: 'WebDAV credentials could not be replaced.' }));
    }
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        onAnimationEnd={(event) => {
          if (event.currentTarget.dataset.state === 'closed') {
            reset({ url: currentUrl, username: '', password: '' });
            setSubmitError(null);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{allowUrlChange ? 'Update WebDAV Connection' : 'Replace WebDAV Credentials'}</DialogTitle>
          <DialogDescription>
            {allowUrlChange
              ? 'We will check this URL and these credentials against the same database before saving the connection encrypted on this device.'
              : 'We will check these credentials against this database before saving them encrypted on this device.'}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(event) => void submit(event)}>
          {submitError && (
            <p role="alert" className="text-xs text-destructive">
              {submitError}
            </p>
          )}
          {allowUrlChange && (
            <Controller
              control={control}
              name="url"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="replace-webdav-url">Full HTTPS WebDAV file URL</FieldLabel>
                  <Input
                    {...field}
                    autoComplete="url"
                    aria-invalid={fieldState.invalid}
                    id="replace-webdav-url"
                    type="url"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          )}
          <Controller
            control={control}
            name="username"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="replace-webdav-username">Username</FieldLabel>
                <Input
                  {...field}
                  autoComplete="username"
                  aria-invalid={fieldState.invalid}
                  id="replace-webdav-username"
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
                <FieldLabel htmlFor="replace-webdav-password">Password or app password</FieldLabel>
                <Input
                  {...field}
                  autoComplete="new-password"
                  aria-invalid={fieldState.invalid}
                  id="replace-webdav-password"
                  type="password"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <DialogFooter className="pt-3">
            <Button className="h-8 px-4 text-xs" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Checking...' : allowUrlChange ? 'Update connection' : 'Save credentials'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
