type PickedDoc = { id: string; name: string };

type PickerCallback = (data: { action: string; docs?: PickedDoc[] }) => void;

const PICKED = 'picked';

class DocsView {
  public setQuery() {}
  public setMimeTypes() {}
  public setMode() {}
}

// replaces gapi and google.picker with a picker that selects `doc` as soon as it's shown
export const mockGooglePicker = (doc: PickedDoc) => {
  class PickerBuilder {
    private callback: PickerCallback = () => {};

    public setOAuthToken() {
      return this;
    }
    public setAppId() {
      return this;
    }
    public addView() {
      return this;
    }
    public hideTitleBar() {
      return this;
    }
    public setSelectableMimeTypes() {
      return this;
    }
    public setCallback(callback: PickerCallback) {
      this.callback = callback;
      return this;
    }
    public build() {
      return { setVisible: () => this.callback({ action: PICKED, docs: [doc] }) };
    }
  }

  Object.assign(globalThis, { gapi: { load: (_api: string, callback: () => void) => callback() } });
  Object.assign(globalThis.google, {
    picker: { Action: { PICKED }, DocsView, DocsViewMode: { LIST: 'list' }, PickerBuilder },
  });

  return {
    [Symbol.dispose]: () => {
      Reflect.deleteProperty(globalThis, 'gapi');
      Reflect.deleteProperty(globalThis.google, 'picker');
    },
  };
};
