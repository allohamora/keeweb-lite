import { toast } from 'sonner';
import { useAsyncFn } from 'react-use';
import { PUBLIC_GOOGLE_APP_ID } from 'astro:env/client';
import { Button } from '@/components/ui/button';
import { auth } from '@/repositories/google-drive.repository';
import { getErrorMessage } from '@/utils/error.utils';

export type DriveFile = {
  id: string;
  name: string;
};

export type GoogleDriveFilePickerProps = {
  value?: DriveFile | null;
  onChange: (file: DriveFile | null) => void;
  id?: string;
  'aria-invalid'?: boolean;
};

export const GoogleDriveFilePicker = ({
  value,
  onChange,
  id,
  'aria-invalid': ariaInvalid,
}: GoogleDriveFilePickerProps) => {
  const [{ loading: isLoading }, openPicker] = useAsyncFn(async () => {
    try {
      const token = await auth.getAccessToken();

      await new Promise<void>((resolve) => gapi.load('picker', resolve));

      const view = new google.picker.DocsView();
      view.setQuery('.kdbx');
      view.setMimeTypes('application/octet-stream');
      view.setMode(google.picker.DocsViewMode.LIST);

      const picker = new google.picker.PickerBuilder()
        .setOAuthToken(token)
        .setAppId(PUBLIC_GOOGLE_APP_ID)
        .addView(view)
        .hideTitleBar()
        .setSelectableMimeTypes('application/octet-stream')
        .setCallback((data) => {
          switch (data.action) {
            case google.picker.Action.PICKED: {
              const [doc] = data.docs ?? [];
              if (doc && doc.id && doc.name) {
                onChange({ id: doc.id, name: doc.name });
              }
              break;
            }
          }
        })
        .build();

      picker.setVisible(true);
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'File picker open failed.' }));
    }
  });

  return (
    <Button
      id={id}
      type="button"
      variant="outline"
      aria-invalid={ariaInvalid}
      className="h-9 w-full justify-start px-2.5 py-1 text-xs font-normal sm:h-8"
      disabled={isLoading}
      onClick={() => {
        void openPicker();
      }}
    >
      {`Choose file ${value?.name ?? 'No file chosen'}`}
    </Button>
  );
};
