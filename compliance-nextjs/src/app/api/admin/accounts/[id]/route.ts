import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { findAll, findByUsername, saveAdmin, deleteAdmin } from '@/lib/db/admin-repo';
import { runMigrations } from '@/lib/db/migrate';

export const dynamic = 'force-dynamic';

function toPublic(admin: Awaited<ReturnType<typeof findAll>>[number]) {
  return {
    id:                 admin.id,
    username:           admin.username,
    email:              admin.email,
    active:             admin.active,
    role:               admin.role ?? 'Admin',
    teams:              (() => { try { return JSON.parse(admin.teams ?? '[]') as string[]; } catch { return []; } })(),
    mustChangePassword: admin.mustChangePassword ?? false,
  };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  await runMigrations();
  try {
    const { id } = await params;
    const allAdmins = await findAll();
    const target = allAdmins.find(a => a.id === id);
    if (!target) {
      return NextResponse.json({ message: 'Account not found' }, { status: 404 });
    }

    const body = await req.json() as {
      email?: string;
      role?: string;
      teams?: string[];
      active?: boolean;
      resetPassword?: boolean;
    };

    const role = body.role !== undefined
      ? (body.role === 'Teamlead' ? 'Teamlead' : 'Admin')
      : target.role;

    // Prevent removing the last Admin
    if (target.role === 'Admin' && role !== 'Admin') {
      const adminCount = allAdmins.filter(a => a.role === 'Admin' && a.id !== id).length;
      if (adminCount === 0) {
        return NextResponse.json({ message: 'Cannot remove Admin role from the last admin account' }, { status: 400 });
      }
    }

    const teams = body.teams !== undefined
      ? JSON.stringify(body.teams.map(t => String(t).trim()).filter(Boolean))
      : target.teams;

    const active = body.active !== undefined ? body.active : target.active;

    let password = target.password;
    let mustChangePassword = target.mustChangePassword;
    if (body.resetPassword) {
      password = bcrypt.hashSync(`${target.username.toUpperCase()}@123`, 10);
      mustChangePassword = true;
    }

    const updated = await saveAdmin({
      id: target.id,
      username: target.username,
      password,
      email: body.email !== undefined ? (body.email ?? '').trim() : target.email,
      active,
      role,
      teams,
      mustChangePassword,
    });

    return NextResponse.json(toPublic(updated));
  } catch (err) {
    console.error('[accounts-put]', err);
    return NextResponse.json({ message: 'Failed to update account' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  await runMigrations();
  try {
    const { id } = await params;
    const allAdmins = await findAll();
    const target = allAdmins.find(a => a.id === id);
    if (!target) {
      return NextResponse.json({ message: 'Account not found' }, { status: 404 });
    }

    // Prevent deleting the last Admin
    if (target.role === 'Admin') {
      const remainingAdmins = allAdmins.filter(a => a.role === 'Admin' && a.id !== id);
      if (remainingAdmins.length === 0) {
        return NextResponse.json({ message: 'Cannot delete the last admin account' }, { status: 400 });
      }
    }

    const ok = await deleteAdmin(id);
    if (!ok) {
      return NextResponse.json({ message: 'Account not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Account deleted', id });
  } catch (err) {
    console.error('[accounts-delete]', err);
    return NextResponse.json({ message: 'Failed to delete account' }, { status: 500 });
  }
}
