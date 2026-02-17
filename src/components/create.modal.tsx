import { useState } from 'react';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { hashKeyFileBytesToBase64 } from '@/services/kdbx.service';
import { createLocalRecordForUnlock, validateLocalKdbxFile } from '@/services/kdbx.service';
import { getErrorMessage } from '@/utils/error.utils';

export type CreateModalProps = {
  onRecordCreated: () => Promise<void>;
};

type CreateModalFormValues = {
  createDatabaseFile?: FileList;
  createKeyFile?: FileList;
};

export const CreateModal = ({ onRecordCreated }: CreateModalProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    reset,
    setError,
  } = useForm<CreateModalFormValues>({
    defaultValues: {
      createDatabaseFile: undefined,
      createKeyFile: undefined,
    },
  });

  const handleCreateRecordSubmit = handleSubmit(async ({ createDatabaseFile, createKeyFile }) => {
    const selectedDatabaseFile = createDatabaseFile?.item(0);
    if (!selectedDatabaseFile) {
      setError('createDatabaseFile', {
        message: 'Select a .kdbx file to create a record.',
        type: 'manual',
      });
      return;
    }

    const localKdbxValidationResult = validateLocalKdbxFile({ name: selectedDatabaseFile.name });
    if (!localKdbxValidationResult.isValid) {
      setError('createDatabaseFile', {
        message: localKdbxValidationResult.error,
        type: 'manual',
      });
      return;
    }

    let createKeyFileHashBase64: string | undefined;
    let createKeyFileName: string | undefined;
    const selectedKeyFile = createKeyFile?.item(0);
    if (selectedKeyFile) {
      const keyFileBytes = new Uint8Array(await selectedKeyFile.arrayBuffer());
      try {
        createKeyFileHashBase64 = await hashKeyFileBytesToBase64({ keyFileBytes });
        createKeyFileName = selectedKeyFile.name;
      } catch (error) {
        setError('createKeyFile', {
          message: getErrorMessage({ error, fallback: 'Failed to read create key file.' }),
          type: 'manual',
        });
        return;
      }
    }

    try {
      const encryptedBytes = new Uint8Array(await selectedDatabaseFile.arrayBuffer());

      await createLocalRecordForUnlock({
        createDatabaseFileName: selectedDatabaseFile.name,
        createKeyFileHashBase64,
        createKeyFileName,
        encryptedBytes,
      });

      await onRecordCreated();
      reset({ createDatabaseFile: undefined, createKeyFile: undefined });
      setIsOpen(false);
      toast.success(`${selectedDatabaseFile.name} created and selected.`);
    } catch (error) {
      setError('createDatabaseFile', {
        message: getErrorMessage({ error, fallback: 'Failed to create record.' }),
        type: 'manual',
      });
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
            name="createDatabaseFile"
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
            name="createKeyFile"
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
