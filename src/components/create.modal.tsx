import { useState } from 'react';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/utils/error.utils';
import { createLocalRecord } from '@/services/record.service';

export type CreateModalProps = {
  onRecordCreated: () => Promise<void>;
};

const createModalSchema = z.object({
  databaseFile: z
    .instanceof(FileList)
    .refine((files) => files.length > 0, {
      message: 'Select a .kdbx file to create a record.',
    })
    .refine((files) => files[0]?.name.toLowerCase().endsWith('.kdbx'), {
      message: 'Only .kdbx files are supported.',
    }),
  keyFile: z.instanceof(FileList).optional(),
});

type CreateModalFormValues = z.infer<typeof createModalSchema>;

const DEFAULT_VALUES: Partial<CreateModalFormValues> = {
  databaseFile: undefined,
  keyFile: undefined,
};

export const CreateModal = ({ onRecordCreated }: CreateModalProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    reset,
  } = useForm<CreateModalFormValues>({
    resolver: zodResolver(createModalSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const handleCreateRecordSubmit = handleSubmit(async ({ databaseFile, keyFile }) => {
    try {
      await createLocalRecord({ databaseFile, keyFile });

      await onRecordCreated();
      reset(DEFAULT_VALUES);
      setIsOpen(false);

      toast.success('Record has been created.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'An unexpected error occurred.' }));
    }
  });

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger asChild>
        <Button className="h-8 px-3 text-xs" type="button" variant="outline">
          Create
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create File Record</DialogTitle>
          <DialogDescription>
            Choose a local .kdbx file and optional key file. The new record becomes selected immediately.
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
            name="databaseFile"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="create-database-file">File</FieldLabel>
                <Input
                  {...field}
                  value={undefined}
                  onChange={(event) => field.onChange(event.target.files)}
                  accept=".kdbx"
                  aria-invalid={fieldState.invalid}
                  id="create-database-file"
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
                <FieldLabel htmlFor="create-key-file">Key file (optional)</FieldLabel>
                <Input
                  {...field}
                  value={undefined}
                  onChange={(event) => field.onChange(event.target.files)}
                  aria-invalid={fieldState.invalid}
                  id="create-key-file"
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
