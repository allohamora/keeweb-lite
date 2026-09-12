import { zodResolver } from '@hookform/resolvers/zod';
import { HugeiconsIcon } from '@hugeicons/react';
import { InformationCircleIcon } from '@hugeicons/core-free-icons';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { createGoogleDriveRecord } from '@/services/record.service';
import { downloadBytes } from '@/utils/download.utils';
import { getErrorMessage } from '@/utils/error.utils';

export type CreateGoogleDriveModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecordCreated: () => void;
};

const createGoogleDriveModalSchema = z
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

type CreateGoogleDriveModalFormValues = z.infer<typeof createGoogleDriveModalSchema>;

export const CreateGoogleDriveModal = ({ open, onOpenChange, onRecordCreated }: CreateGoogleDriveModalProps) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    reset,
  } = useForm<CreateGoogleDriveModalFormValues>({
    defaultValues: { databaseName: '', password: '', confirmPassword: '', useKeyFile: false },
    resolver: zodResolver(createGoogleDriveModalSchema),
  });

  const handleCreateRecordSubmit = handleSubmit(async ({ databaseName, password, useKeyFile }) => {
    try {
      const { keyFileBytes, keyFileName } = await createGoogleDriveRecord({ databaseName, password, useKeyFile });

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
          <DialogTitle className="flex items-center gap-1.5">
            Create Google Drive Record
            <Popover>
              <PopoverTrigger
                aria-label="Drive destination info"
                className="cursor-default text-muted-foreground"
                type="button"
              >
                <HugeiconsIcon icon={InformationCircleIcon} size={14} />
              </PopoverTrigger>
              <PopoverContent className="w-64 text-xs font-normal">
                Files are always created in Drive root — intentional, matching Google's own Save to Drive behavior. Move
                it to a folder from Drive afterward.
              </PopoverContent>
            </Popover>
          </DialogTitle>
          <DialogDescription>Create a new empty database on Google Drive.</DialogDescription>
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
                <FieldLabel htmlFor="create-drive-database-name">Database name</FieldLabel>
                <Input {...field} aria-invalid={fieldState.invalid} id="create-drive-database-name" type="text" />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="create-drive-password">Password</FieldLabel>
                <Input {...field} aria-invalid={fieldState.invalid} id="create-drive-password" type="password" />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="confirmPassword"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="create-drive-confirm-password">Confirm password</FieldLabel>
                <Input
                  {...field}
                  aria-invalid={fieldState.invalid}
                  id="create-drive-confirm-password"
                  type="password"
                />
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
                  id="create-drive-use-key-file"
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
                <Label className="cursor-pointer text-xs" htmlFor="create-drive-use-key-file">
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
