import { describe, expect, it, vi } from 'vitest';
import { downloadBytes } from '@/utils/download.utils';

describe('download.utils', () => {
  describe('downloadBytes', () => {
    it('creates an object URL for the given bytes', () => {
      using createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      using _revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      using _click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      downloadBytes({ bytes: new Uint8Array([1, 2, 3]), fileName: 'vault.kdbx' });

      expect(createObjectURL).toHaveBeenCalledOnce();
    });

    it('creates a download anchor with the given file name and clicks it', () => {
      using _createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      using _revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      using click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      downloadBytes({ bytes: new Uint8Array([1, 2, 3]), fileName: 'vault.keyx' });

      expect(click).toHaveBeenCalledOnce();
    });

    it('does not leave the anchor attached to the document', () => {
      using _createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      using _revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      using _click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      downloadBytes({ bytes: new Uint8Array([1, 2, 3]), fileName: 'vault.kdbx' });

      expect(document.querySelector('a[download="vault.kdbx"]')).not.toBeInTheDocument();
    });

    it('revokes the object URL after triggering the download', () => {
      vi.useFakeTimers();
      using _createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      using revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      using _click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      downloadBytes({ bytes: new Uint8Array([1, 2, 3]), fileName: 'vault.kdbx' });
      expect(revokeObjectURL).not.toHaveBeenCalled();

      vi.runAllTimers();

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

      vi.useRealTimers();
    });
  });
});
