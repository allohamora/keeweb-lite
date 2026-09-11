import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBytes } from '@/utils/download.utils';

describe('download.utils', () => {
  describe('downloadBytes', () => {
    let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
    let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
    let clickSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('creates an object URL for the given bytes', () => {
      downloadBytes({ bytes: new Uint8Array([1, 2, 3]), fileName: 'vault.kdbx' });

      expect(createObjectURLSpy).toHaveBeenCalledOnce();
    });

    it('creates a download anchor with the given file name and clicks it', () => {
      downloadBytes({ bytes: new Uint8Array([1, 2, 3]), fileName: 'vault.keyx' });

      expect(clickSpy).toHaveBeenCalledOnce();
    });

    it('does not leave the anchor attached to the document', () => {
      downloadBytes({ bytes: new Uint8Array([1, 2, 3]), fileName: 'vault.kdbx' });

      expect(document.querySelector('a[download="vault.kdbx"]')).not.toBeInTheDocument();
    });

    it('revokes the object URL after triggering the download', () => {
      vi.useFakeTimers();

      downloadBytes({ bytes: new Uint8Array([1, 2, 3]), fileName: 'vault.kdbx' });
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();

      vi.runAllTimers();

      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
    });
  });
});
