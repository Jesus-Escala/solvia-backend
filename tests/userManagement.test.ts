import { describe, expect, it } from 'vitest';
import { checkPasswordReset, checkUserChange } from '../src/domain/userManagement';

const admin = { id: 'admin-1', role: 'admin' as const, active: true };
const collector = { id: 'collector-1', role: 'collector' as const, active: true };

describe('checkUserChange', () => {
  it('lets an admin rename themselves', () => {
    expect(
      checkUserChange({ actorId: 'admin-1', target: admin, changes: {}, activeAdmins: 1 }),
    ).toBeNull();
  });

  it('rejects changing your own role', () => {
    expect(
      checkUserChange({
        actorId: 'admin-1',
        target: admin,
        changes: { role: 'collector' },
        activeAdmins: 3,
      }),
    ).toBe('CANNOT_MODIFY_SELF');
  });

  it('rejects deactivating yourself', () => {
    expect(
      checkUserChange({
        actorId: 'admin-1',
        target: admin,
        changes: { active: false },
        activeAdmins: 3,
      }),
    ).toBe('CANNOT_MODIFY_SELF');
  });

  it('accepts no-op self changes (same role, still active)', () => {
    expect(
      checkUserChange({
        actorId: 'admin-1',
        target: admin,
        changes: { role: 'admin', active: true },
        activeAdmins: 1,
      }),
    ).toBeNull();
  });

  it('rejects demoting or deactivating the last active admin', () => {
    for (const changes of [{ role: 'collector' as const }, { active: false }]) {
      expect(checkUserChange({ actorId: null, target: admin, changes, activeAdmins: 1 })).toBe(
        'LAST_ADMIN',
      );
    }
  });

  it('allows demoting an admin when another active admin remains', () => {
    expect(
      checkUserChange({
        actorId: 'admin-2',
        target: admin,
        changes: { role: 'collector' },
        activeAdmins: 2,
      }),
    ).toBeNull();
  });

  it('does not apply the last-admin rule to collectors or inactive admins', () => {
    expect(
      checkUserChange({
        actorId: 'admin-1',
        target: collector,
        changes: { active: false },
        activeAdmins: 1,
      }),
    ).toBeNull();
    expect(
      checkUserChange({
        actorId: null,
        target: { ...admin, active: false },
        changes: { role: 'collector' },
        activeAdmins: 1,
      }),
    ).toBeNull();
  });

  it('lets platform admins (no actor) deactivate an admin when another one remains', () => {
    expect(
      checkUserChange({
        actorId: null,
        target: admin,
        changes: { active: false },
        activeAdmins: 2,
      }),
    ).toBeNull();
  });
});

describe('checkPasswordReset', () => {
  it('rejects resetting your own password', () => {
    expect(checkPasswordReset({ actorId: 'u1', targetId: 'u1' })).toBe('CANNOT_MODIFY_SELF');
  });

  it('allows resetting another user or as a platform admin', () => {
    expect(checkPasswordReset({ actorId: 'u1', targetId: 'u2' })).toBeNull();
    expect(checkPasswordReset({ actorId: null, targetId: 'u2' })).toBeNull();
  });
});
