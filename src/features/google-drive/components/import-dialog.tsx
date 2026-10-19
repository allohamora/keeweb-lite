import * as z from 'zod/mini';
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
import type { DialogProps } from '@/services/provider';
import { fileListSchema } from '@/utils/zod';
import { getErrorMessage } from '@/utils/error';
import { isKdbxFileName } from '@/utils/kdbx-file-name';
import { importGoogleDriveRecord } from '@/features/google-drive/services/record';
import { driveFileSchema } from '@/features/google-drive/repositories/google-drive';
import { GoogleDriveFilePicker } from '@/features/google-drive/components/file-picker';

const importGoogleDriveDialogSchema = z.object({
  driveFile: z.pick(driveFileSchema, { id: true, name: true }).check(
    z.refine((file) => isKdbxFileName(file.name), {
      message: 'Only .kdbx files are supported.',
    }),
  ),
  keyFile: z.optional(fileListSchema('Select a key file.')),
});

type ImportGoogleDriveDialogFormValues = z.infer<typeof importGoogleDriveDialogSchema>;

export const ImportGoogleDriveDialog = ({ open, onOpenChange, onSuccess }: DialogProps) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    reset,
  } = useForm<ImportGoogleDriveDialogFormValues>({
    resolver: zodResolver(importGoogleDriveDialogSchema),
  });

  const handleImportRecordSubmit = handleSubmit(async ({ driveFile, keyFile }) => {
    try {
      await importGoogleDriveRecord({ fileId: driveFile.id, fileName: driveFile.name, keyFile });

      onSuccess();
      onOpenChange(false);

      toast.success('Record imported.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Record import failed.' }));
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
        onInteractOutside={(event) => {
          // Prevent the dialog from closing when interacting with the Google Picker,
          // which is injected into <body> outside the dialog. All Picker elements
          // (backdrop, dialog, inner content) share the .picker class.
          if (event.target instanceof Element && event.target.closest('.picker')) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Import Google Drive Record</DialogTitle>
          <DialogDescription>Select a .kdbx file from Google Drive.</DialogDescription>
        </DialogHeader>

        <form
          className="max-h-[calc(100dvh-12rem)] space-y-3 overflow-y-auto pr-1"
          onSubmit={(event) => {
            void handleImportRecordSubmit(event);
          }}
        >
          <Controller
            control={control}
            name="driveFile"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="import-drive-file">File</FieldLabel>
                <GoogleDriveFilePicker
                  id="import-drive-file"
                  value={field.value}
                  onChange={field.onChange}
                  aria-invalid={fieldState.invalid}
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
                <FieldLabel htmlFor="import-drive-key-file">Key file (optional)</FieldLabel>
                <Input
                  {...field}
                  value={undefined}
                  onChange={(event) => field.onChange(event.target.files)}
                  aria-invalid={fieldState.invalid}
                  id="import-drive-key-file"
                  type="file"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <DialogFooter className="pt-3">
            <Button className="h-8 px-4 text-xs" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Importing...' : 'Import'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
