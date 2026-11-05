// Copies of one passage: page markers and paragraph numbers don't split them; equal authority keeps the OceanLibrary copy.
import { describe, it, expect } from 'vitest';
import { copyKey, publisherRank } from '../../api/lib/search/copy-key.js';

const BODY = 'that mercy consists in giving to each more than is due. For example, when a gardener tends a field from dawn until dusk, mercy gives him a harvest';
describe('copyKey', () => {
  it('a page marker or a leading paragraph number leaves the same key', () => {
    expect(copyKey(`KNOW[pg 12]  THAT ${BODY}`)).toBe(copyKey(`Know that ${BODY}`));
    expect(copyKey(`3 \tKnow that ${BODY}`)).toBe(copyKey(`Know that ${BODY}`));
    expect(copyKey(`Know [page 7] that ${BODY}`)).toBe(copyKey(`Know that ${BODY}`));
  });
  it('different passages keep different keys', () => {
    expect(copyKey(`Know that ${BODY}`)).not.toBe(copyKey(`Know that justice ${BODY}`));
  });
});
describe('publisherRank', () => {
  it('the OceanLibrary document beats a copy that only links to the OL book, which beats other publishers and ours', () => {
    const ol = publisherRank({ source_site: 'oceanlibrary.com', source_url: 'https://oceanlibrary.com/a-work/?paraId=para_1' });
    const pointer = publisherRank({ source_site: null, source_url: 'https://oceanlibrary.com/a-work' });
    const bl = publisherRank({ source_url: 'https://bahai-library.com/x' });
    const ours = publisherRank({});
    expect(ol).toBeLessThan(pointer);
    expect(pointer).toBeLessThan(bl);
    expect(bl).toBeLessThan(ours);
  });
});
