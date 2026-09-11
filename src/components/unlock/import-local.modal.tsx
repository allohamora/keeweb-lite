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
import { importLocalRecord } from '@/services/record.service';

export type ImportLocalModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecordImported: () => void;
};

const importLocalModalSchema = z.object({
  databaseFile: z
    .instanceof(FileList, { message: 'Select a .kdbx file to import.' })
    .refine((files) => files.length > 0, {
      message: 'Select a .kdbx file to import.',
    })
    .refine((files) => files.length === 0 || files[0]?.name.toLowerCase().endsWith('.kdbx'), {
      message: 'Only .kdbx files are supported.',
    }),
  keyFile: z.instanceof(FileList, { message: 'Select a key file.' }).optional(),
});

type ImportLocalModalFormValues = z.infer<typeof importLocalModalSchema>;

export const ImportLocalModal = ({ open, onOpenChange, onRecordImported }: ImportLocalModalProps) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    reset,
  } = useForm<ImportLocalModalFormValues>({
    resolver: zodResolver(importLocalModalSchema),
  });

  const handleImportRecordSubmit = handleSubmit(async ({ databaseFile, keyFile }) => {
    try {
      await importLocalRecord({ databaseFile, keyFile });

      onRecordImported();
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
      >
        <DialogHeader>
          <DialogTitle>Import File Record</DialogTitle>
          <DialogDescription>
            Choose a local .kdbx file and optional key file. The new record becomes selected immediately.
          </DialogDescription>
        </DialogHeader>

        <form
          className="max-h-[calc(100dvh-12rem)] space-y-3 overflow-y-auto pr-1"
          onSubmit={(event) => {
            void handleImportRecordSubmit(event);
          }}
        >
          <Controller
            control={control}
            name="databaseFile"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="import-database-file">File</FieldLabel>
                <Input
                  {...field}
                  value={undefined}
                  onChange={(event) => field.onChange(event.target.files)}
                  accept=".kdbx"
                  aria-invalid={fieldState.invalid}
                  id="import-database-file"
                  type="file"
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
                <FieldLabel htmlFor="import-key-file">Key file (optional)</FieldLabel>
                <Input
                  {...field}
                  value={undefined}
                  onChange={(event) => field.onChange(event.target.files)}
                  aria-invalid={fieldState.invalid}
                  id="import-key-file"
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
