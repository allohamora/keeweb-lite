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
import { createLocalRecord } from '@/services/record.service';
import { downloadBytes } from '@/utils/download.utils';
import { getErrorMessage } from '@/utils/error.utils';

export type CreateLocalModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecordCreated: () => void;
};

const createLocalModalSchema = z
  .object({
    databaseName: z.string().trim().min(1, 'Enter a database name.'),
    password: z.string().min(1, 'Enter a master password.'),
    confirmPassword: z.string().min(1, 'Confirm your master password.'),
    useKeyFile: z.boolean(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

type CreateLocalModalFormValues = z.infer<typeof createLocalModalSchema>;

export const CreateLocalModal = ({ open, onOpenChange, onRecordCreated }: CreateLocalModalProps) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    reset,
  } = useForm<CreateLocalModalFormValues>({
    defaultValues: { databaseName: '', password: '', confirmPassword: '', useKeyFile: false },
    resolver: zodResolver(createLocalModalSchema),
  });

  const handleCreateRecordSubmit = handleSubmit(async ({ databaseName, password, useKeyFile }) => {
    try {
      const { keyFileBytes, keyFileName } = await createLocalRecord({ databaseName, password, useKeyFile });

      if (keyFileBytes && keyFileName) {
        downloadBytes({ bytes: keyFileBytes, fileName: keyFileName });
      }

      onRecordCreated();
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
          <DialogTitle>Create Local Record</DialogTitle>
          <DialogDescription>Create a new empty local database.</DialogDescription>
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
