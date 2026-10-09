import {
  createApplicabilityRevision,
  createDraftRevision,
  incrementApplicabilityRevision,
  incrementDraftRevision,
} from './payroll-rule-set-revision';
import type {
  ApplicabilityRevision,
  DraftRevision,
} from './payroll-rule-set-revision';

type AssertFalse<T extends false> = T;
type DistinctRevisions = [
  AssertFalse<DraftRevision extends ApplicabilityRevision ? true : false>,
  AssertFalse<ApplicabilityRevision extends DraftRevision ? true : false>,
];
const distinctRevisions: DistinctRevisions = [false, false];

describe('revision primitives', () => {
  it('has distinct types and starts at one', () => {
    expect(distinctRevisions).toEqual([false, false]);
    expect(createDraftRevision(1)).toBe(1);
    expect(createApplicabilityRevision(1)).toBe(1);
  });
  it.each([
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    '1',
    null,
    undefined,
  ])('rejects invalid revision %s', (value) => {
    for (const create of [createDraftRevision, createApplicabilityRevision]) {
      expect(() => create(value)).toThrow(
        expect.objectContaining({
          code: 'INVALID_REVISION',
        }) as Error,
      );
    }
  });
  it('increments each revision with its own brand', () => {
    const draft: DraftRevision = incrementDraftRevision(createDraftRevision(1));
    const applicability: ApplicabilityRevision = incrementApplicabilityRevision(
      createApplicabilityRevision(1),
    );
    expect(draft).toBe(2);
    expect(applicability).toBe(2);
    expect(
      incrementDraftRevision(createDraftRevision(Number.MAX_SAFE_INTEGER - 1)),
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('rejects overflow before incrementing', () => {
    expect(() =>
      incrementDraftRevision(createDraftRevision(Number.MAX_SAFE_INTEGER)),
    ).toThrow(
      expect.objectContaining({
        code: 'REVISION_OVERFLOW',
      }) as Error,
    );
    expect(() =>
      incrementApplicabilityRevision(
        createApplicabilityRevision(Number.MAX_SAFE_INTEGER),
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'REVISION_OVERFLOW',
      }) as Error,
    );
  });
});
