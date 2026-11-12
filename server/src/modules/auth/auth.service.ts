import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { pool, query, withTransaction, Queryable } from "../../db/pool";
import { AppError } from "../../utils/AppError";
import { audit } from "../../services/audit";
import { sendMail } from "../../services/mailer";
import type { Role } from "../users/roles";

const sha256 = (v: string) =>
  crypto.createHash("sha256").update(v).digest("hex");
const newToken = () => crypto.randomBytes(32).toString("base64url");
// Compared against when the email is unknown so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("timing-equaliser", 12);

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  status: string;
  firstName: string;
  lastName: string;
}

const toPublic = (u: any): PublicUser => ({
  id: u.id,
  email: u.email,
  role: u.role,
  status: u.status,
  firstName: u.first_name,
  lastName: u.last_name,
});

const signAccess = (u: { id: string; role: Role }) =>
  jwt.sign({ role: u.role }, env.JWT_ACCESS_SECRET, {
    subject: u.id,
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
  });

async function createRefresh(
  db: Queryable,
  userId: string,
  familyId: string,
  meta: SessionMeta,
) {
  const raw = newToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000);
  const { rows } = await db.query(
    `insert into refresh_tokens (user_id, family_id, token_hash, expires_at, ip, user_agent)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [
      userId,
      familyId,
      sha256(raw),
      expiresAt,
      meta.ip ?? null,
      meta.userAgent?.slice(0, 300) ?? null,
    ],
  );
  return { raw, id: rows[0].id as string, expiresAt };
}

export async function login(email: string, pw: string, meta: SessionMeta) {
  const { rows } = await query(
    "select id, email, role, status, first_name, last_name, password_hash from users where email = $1",
    [email],
  );
  const user = rows[0];
  const match = await bcrypt.compare(pw, user?.password_hash ?? DUMMY_HASH);
  if (!user || !user.password_hash || !match) {
    throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }
  if (user.status !== "active") {
    throw new AppError(
      403,
      "This account is not active. Please contact the school office.",
      "ACCOUNT_INACTIVE",
    );
  }
  const refresh = await createRefresh(pool, user.id, crypto.randomUUID(), meta);
  await query("update users set last_login_at = now() where id = $1", [
    user.id,
  ]);
  return { user: toPublic(user), accessToken: signAccess(user), refresh };
}

export async function refresh(raw: string | undefined, meta: SessionMeta) {
  if (!raw)
    throw new AppError(401, "Please sign in to continue", "UNAUTHENTICATED");

  const result = await withTransaction(async (c) => {
    const { rows } = await c.query(
      `select rt.id, rt.user_id, rt.family_id, rt.expires_at, rt.revoked_at,
              (rt.revoked_at is not null and rt.revoked_at > now() - interval '10 seconds') as just_rotated,
              u.id as uid, u.email, u.role, u.status, u.first_name, u.last_name
         from refresh_tokens rt join users u on u.id = rt.user_id
        where rt.token_hash = $1 for update of rt`,
      [sha256(raw)],
    );
    const t = rows[0];
    if (!t) return { error: "invalid" as const };

    if (t.revoked_at) {
      // A second tab refreshing within seconds is normal; anything later looks like token theft.
      if (t.just_rotated) return { error: "rotated" as const };
      await c.query(
        "update refresh_tokens set revoked_at = now() where family_id = $1 and revoked_at is null",
        [t.family_id],
      );
      await audit(
        {
          actorId: t.user_id,
          action: "auth.refresh_reuse_detected",
          ip: meta.ip,
        },
        c,
      );
      return { error: "reuse" as const };
    }
    if (new Date(t.expires_at) < new Date() || t.status !== "active")
      return { error: "invalid" as const };

    const next = await createRefresh(c, t.user_id, t.family_id, meta);
    await c.query(
      "update refresh_tokens set revoked_at = now(), replaced_by = $2 where id = $1",
      [t.id, next.id],
    );
    return {
      user: toPublic({ ...t, id: t.uid }),
      accessToken: signAccess({ id: t.uid, role: t.role }),
      refresh: next,
    };
  });

  if ("error" in result)
    throw new AppError(401, "Please sign in to continue", "UNAUTHENTICATED");
  return result;
}

export async function logout(raw: string | undefined) {
  if (!raw) return;
  await query(
    `update refresh_tokens set revoked_at = now()
      where revoked_at is null and family_id = (select family_id from refresh_tokens where token_hash = $1)`,
    [sha256(raw)],
  );
}

export async function getMe(userId: string) {
  const { rows } = await query(
    "select id, email, role, status, first_name, last_name from users where id = $1",
    [userId],
  );
  if (!rows[0]) throw new AppError(404, "User not found", "NOT_FOUND");
  return toPublic(rows[0]);
}

// ---- one-time tokens (activation and password reset) ----

export async function createOneTimeToken(
  db: Queryable,
  userId: string,
  purpose: "activation" | "password_reset",
  ttlHours: number,
) {
  await db.query(
    "update auth_tokens set used_at = now() where user_id = $1 and purpose = $2 and used_at is null",
    [userId, purpose],
  );
  const raw = newToken();
  await db.query(
    "insert into auth_tokens (user_id, purpose, token_hash, expires_at) values ($1,$2,$3, now() + make_interval(hours => $4))",
    [userId, purpose, sha256(raw), ttlHours],
  );
  return raw;
}

async function consumeToken(
  db: Queryable,
  raw: string,
  purpose: "activation" | "password_reset",
) {
  const { rows } = await db.query(
    `update auth_tokens set used_at = now()
      where token_hash = $1 and purpose = $2 and used_at is null and expires_at > now()
      returning user_id`,
    [sha256(raw), purpose],
  );
  if (!rows[0])
    throw new AppError(
      400,
      "This link is invalid or has expired. Please request a new one.",
      "TOKEN_INVALID",
    );
  return rows[0].user_id as string;
}

export const activationLink = (token: string) =>
  `${env.CLIENT_ORIGIN}/activate?token=${token}`;
export const resetLink = (token: string) =>
  `${env.CLIENT_ORIGIN}/reset-password?token=${token}`;

export async function activate(token: string, pw: string, meta: SessionMeta) {
  await withTransaction(async (c) => {
    const userId = await consumeToken(c, token, "activation");
    const hash = await bcrypt.hash(pw, 12);
    const { rowCount } = await c.query(
      `update users set password_hash = $2, status = 'active', updated_at = now()
        where id = $1 and status = 'pending'`,
      [userId, hash],
    );
    if (!rowCount)
      throw new AppError(
        400,
        "This account cannot be activated.",
        "TOKEN_INVALID",
      );
    await audit(
      {
        actorId: userId,
        action: "auth.account_activated",
        entityType: "user",
        entityId: userId,
        ip: meta.ip,
      },
      c,
    );
  });
}

export async function forgotPassword(email: string, meta: SessionMeta) {
  const { rows } = await query(
    "select id, email, first_name from users where email = $1 and status = 'active'",
    [email],
  );
  const user = rows[0];
  if (!user) return; // same response either way
  const token = await createOneTimeToken(pool, user.id, "password_reset", 1);
  await audit({
    actorId: user.id,
    action: "auth.password_reset_requested",
    ip: meta.ip,
  });
  await sendMail({
    to: user.email,
    subject: "Reset your [School Name] password",
    text: `Hello ${user.first_name},\n\nUse this link within 1 hour to choose a new password:\n${resetLink(token)}\n\nIf you did not ask for this, you can ignore this email.`,
  });
}

export async function resetPassword(
  token: string,
  pw: string,
  meta: SessionMeta,
) {
  await withTransaction(async (c) => {
    const userId = await consumeToken(c, token, "password_reset");
    const hash = await bcrypt.hash(pw, 12);
    const { rowCount } = await c.query(
      "update users set password_hash = $2, updated_at = now() where id = $1 and status = 'active'",
      [userId, hash],
    );
    if (!rowCount)
      throw new AppError(400, "This account cannot be reset.", "TOKEN_INVALID");
    await c.query(
      "update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null",
      [userId],
    );
    await audit(
      { actorId: userId, action: "auth.password_reset_completed", ip: meta.ip },
      c,
    );
  });
}
