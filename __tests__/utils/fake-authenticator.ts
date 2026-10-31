const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const hmac = async (secret: Uint8Array<ArrayBuffer>, input: ArrayBuffer) => {
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  return crypto.subtle.sign('HMAC', key, input);
};

class FakePublicKeyCredential {
  static isUserVerifyingPlatformAuthenticatorAvailable = async () => true;

  constructor(
    public rawId: ArrayBuffer,
    private prfEnabled: boolean,
    private prfOutput?: ArrayBuffer,
  ) {}

  getClientExtensionResults() {
    if (!this.prfEnabled) {
      return {};
    }

    return { prf: { enabled: true, ...(this.prfOutput && { results: { first: this.prfOutput } }) } };
  }
}

// a software passkey: the PRF output is an HMAC of the stored secret and the input, like a real authenticator
export const installFakeAuthenticator = ({
  supportsPrf: initialSupportsPrf = true,
  prfOnCreate = false,
  supportsSignal = true,
  failSignal = false,
} = {}) => {
  let supportsPrf = initialSupportsPrf;
  const secrets = new Map<string, Uint8Array<ArrayBuffer>>();
  let cancelNext = false;
  const createdUsers: { id: string; name: string }[] = [];
  const signals: AllAcceptedCredentialsOptions[] = [];

  const evaluate = async (secret: Uint8Array<ArrayBuffer>, input?: BufferSource) => {
    if (!supportsPrf || !input) {
      return undefined;
    }

    const buffer = input instanceof ArrayBuffer ? input : new Uint8Array(input.buffer).slice().buffer;

    return hmac(secret, buffer);
  };

  const credentials = {
    create: async (options?: CredentialCreationOptions) => {
      if (cancelNext) {
        cancelNext = false;
        throw new DOMException('cancelled', 'NotAllowedError');
      }

      const user = options?.publicKey?.user;
      if (user) {
        createdUsers.push({ id: toHex(new Uint8Array(user.id as ArrayBuffer)), name: user.name });
      }

      const secret = crypto.getRandomValues(new Uint8Array(32));
      const rawId = crypto.getRandomValues(new Uint8Array(16));
      secrets.set(toHex(rawId), secret);

      const prfOutput = prfOnCreate
        ? await evaluate(secret, options?.publicKey?.extensions?.prf?.eval?.first)
        : undefined;

      return new FakePublicKeyCredential(rawId.buffer, supportsPrf, prfOutput);
    },
    get: async (options?: CredentialRequestOptions) => {
      if (cancelNext) {
        cancelNext = false;
        throw new DOMException('cancelled', 'NotAllowedError');
      }

      const allowed = options?.publicKey?.allowCredentials?.[0];
      const secret = allowed && secrets.get(toHex(new Uint8Array(allowed.id as ArrayBuffer)));
      if (!allowed || !secret) {
        throw new DOMException('unknown credential', 'NotAllowedError');
      }

      const prfOutput = await evaluate(secret, options.publicKey?.extensions?.prf?.eval?.first);

      return new FakePublicKeyCredential(allowed.id as ArrayBuffer, supportsPrf, prfOutput);
    },
  };

  const previousCredentials = Object.getOwnPropertyDescriptor(navigator, 'credentials');
  const previousPublicKeyCredential = Object.getOwnPropertyDescriptor(globalThis, 'PublicKeyCredential');

  Object.defineProperty(navigator, 'credentials', { value: credentials, configurable: true });
  Object.defineProperty(globalThis, 'PublicKeyCredential', { value: FakePublicKeyCredential, configurable: true });
  if (supportsSignal) {
    Object.defineProperty(FakePublicKeyCredential, 'signalAllAcceptedCredentials', {
      value: async (options: AllAcceptedCredentialsOptions) => {
        if (failSignal) {
          throw new DOMException('signal failed', 'NotSupportedError');
        }

        signals.push(options);
      },
      configurable: true,
    });
  }

  return {
    createdUsers,
    signals,
    cancelNext: () => {
      cancelNext = true;
    },
    disablePrf: () => {
      supportsPrf = false;
    },
    [Symbol.dispose]: () => {
      Reflect.deleteProperty(FakePublicKeyCredential, 'signalAllAcceptedCredentials');

      if (previousCredentials) {
        Object.defineProperty(navigator, 'credentials', previousCredentials);
      } else {
        Reflect.deleteProperty(navigator, 'credentials');
      }

      if (previousPublicKeyCredential) {
        Object.defineProperty(globalThis, 'PublicKeyCredential', previousPublicKeyCredential);
      } else {
        Reflect.deleteProperty(globalThis, 'PublicKeyCredential');
      }
    },
  };
};
