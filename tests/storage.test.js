import { buildObjectKey } from '../src/utils/storage.js';

describe('Unit Test - R2 object keys', () => {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

  it('uses a random name and keeps only the extension', () => {
    const key = buildObjectKey('payments', 'Comprobante Juan Pérez.JPG');
    expect(key).toMatch(new RegExp(`^payments/${uuid}\\.jpg$`));
    expect(key).not.toMatch(/Juan|Comprobante/);
  });

  it('gives different keys for the same file', () => {
    expect(buildObjectKey('lots/1', 'a.png')).not.toBe(buildObjectKey('lots/1', 'a.png'));
  });

  it('drops missing or unsafe extensions', () => {
    expect(buildObjectKey('payments', 'sin-extension')).toMatch(new RegExp(`^payments/${uuid}$`));
    expect(buildObjectKey('payments', 'x.p/../hp')).toMatch(new RegExp(`^payments/${uuid}$`));
  });
});
