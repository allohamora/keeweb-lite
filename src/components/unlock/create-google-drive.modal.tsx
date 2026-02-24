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
import { getErrorMessage } from '@/utils/error.utils';
import { createGoogleDriveRecord } from '@/services/record.service';
import { GoogleDriveFilePicker } from './google-drive.file-picker';

export type CreateGoogleDriveModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecordCreated: () => void;
};

const driveFileSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const createGoogleDriveModalSchema = z.object({
  driveFile: driveFileSchema,
  keyFile: z.instanceof(FileList, { message: 'Select a key file.' }).optional(),
});

type CreateGoogleDriveModalFormValues = z.infer<typeof createGoogleDriveModalSchema>;

export const CreateGoogleDriveModal = ({ open, onOpenChange, onRecordCreated }: CreateGoogleDriveModalProps) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
  } = useForm<CreateGoogleDriveModalFormValues>({
    resolver: zodResolver(createGoogleDriveModalSchema),
  });

  const handleCreateRecordSubmit = handleSubmit(async ({ driveFile, keyFile }) => {
    try {
      await createGoogleDriveRecord({ fileId: driveFile.id, fileName: driveFile.name, keyFile });

      onRecordCreated();
      onOpenChange(false);

      toast.success('Record created.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Record creation failed.' }));
    }
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Google Drive Record</DialogTitle>
          <DialogDescription>
            Browse your Google Drive and select a .kdbx file. The new record becomes selected immediately.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            void handleCreateRecordSubmit(event);
          }}
        >
          <Controller
            control={control}
            name="driveFile"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="create-drive-file">File</FieldLabel>
                <GoogleDriveFilePicker
                  id="create-drive-file"
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
                <FieldLabel htmlFor="create-drive-key-file">Key file (optional)</FieldLabel>
                <Input
                  {...field}
                  value={undefined}
                  onChange={(event) => field.onChange(event.target.files)}
                  aria-invalid={fieldState.invalid}
                  id="create-drive-key-file"
                  type="file"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
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
