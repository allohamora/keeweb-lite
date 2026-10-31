import * as z from 'zod/mini';
import type { ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { InfoPopover } from '@/components/ui/info-popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DialogProps } from '@/services/provider';
import { downloadBytes } from '@/utils/download';
import { getErrorMessage } from '@/utils/error';

type NewDatabaseInput = {
  databaseName: string;
  password: string;
  useKeyFile: boolean;
};

type NewDatabaseDialogProps = DialogProps & {
  title: string;
  description: string;
  info?: ReactNode;
  onCreate: (input: NewDatabaseInput) => Promise<{ keyFileBytes?: Uint8Array; keyFileName?: string }>;
};

const newDatabaseDialogSchema = z
  .object({
    databaseName: z.string().check(z.trim(), z.minLength(1, 'Enter a database name.')),
    password: z.string().check(z.minLength(1, 'Enter a master password.')),
    confirmPassword: z.string().check(z.minLength(1, 'Confirm your master password.')),
    useKeyFile: z.boolean(),
  })
  .check(
    z.refine((values) => values.password === values.confirmPassword, {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    }),
  );

type NewDatabaseDialogFormValues = z.infer<typeof newDatabaseDialogSchema>;

export const NewDatabaseDialog = ({
  open,
  onOpenChange,
  onSuccess,
  title,
  description,
  info,
  onCreate,
}: NewDatabaseDialogProps) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    reset,
  } = useForm<NewDatabaseDialogFormValues>({
    defaultValues: { databaseName: '', password: '', confirmPassword: '', useKeyFile: false },
    resolver: zodResolver(newDatabaseDialogSchema),
  });

  const handleCreateRecordSubmit = handleSubmit(async ({ databaseName, password, useKeyFile }) => {
    try {
      const { keyFileBytes, keyFileName } = await onCreate({ databaseName, password, useKeyFile });

      if (keyFileBytes && keyFileName) {
        downloadBytes({ bytes: keyFileBytes, fileName: keyFileName });
      }

      onSuccess();
      onOpenChange(false);

      toast.success('Record created.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Record creation failed.' }));
    }
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-lg"
        // Reset form after the close animation finishes so the stale state
        // isn't visible while the dialog is still animating out.
        onAnimationEnd={(event) => {
          if (event.currentTarget.dataset.state === 'closed') reset();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            {title}
            {info && (
              <InfoPopover ariaLabel="Destination info" contentClassName="w-64">
                {info}
              </InfoPopover>
            )}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          className="max-h-[calc(100dvh-12rem)] space-y-3 overflow-y-auto pr-1"
          onSubmit={(event) => {
            void handleCreateRecordSubmit(event);
          }}
        >
          <Controller
            control={control}
            name="databaseName"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="create-database-name">Database name</FieldLabel>
                <Input {...field} aria-invalid={fieldState.invalid} id="create-database-name" type="text" />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="create-password">Password</FieldLabel>
                <Input {...field} aria-invalid={fieldState.invalid} id="create-password" type="password" />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="confirmPassword"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="create-confirm-password">Confirm password</FieldLabel>
                <Input {...field} aria-invalid={fieldState.invalid} id="create-confirm-password" type="password" />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="useKeyFile"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={field.value}
                  id="create-use-key-file"
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
                <Label className="cursor-pointer text-xs" htmlFor="create-use-key-file">
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
