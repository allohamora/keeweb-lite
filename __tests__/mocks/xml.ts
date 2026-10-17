import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

// kdbxweb uses the global DOMParser/XMLSerializer when they exist, and falls back to xmldom otherwise.
// happy-dom's versions create kdbx elements as lowercase XHTML (<meta> instead of <Meta>), so a database
// created in the component project can't be loaded back. Use xmldom everywhere, like plain Node does.
Object.assign(globalThis, { DOMParser, XMLSerializer });
