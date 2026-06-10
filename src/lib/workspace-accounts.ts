import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { compactError, enterExecutionLogOwner, recordExecutionLog } from "./activity-log";
import {
  countWorkspaceAccountsInDb,
  getWorkspaceAccountByIdFromDb,
  getWorkspaceAccountByUsernameFromDb,
  getWorkspaceSessionByTokenHashFromDb,
  readWorkspaceAccountsFromDb,
  revokeWorkspaceSessionByTokenHashInDb,
  revokeWorkspaceSessionsByAccountIdInDb,
  saveWorkspaceAccountToDb,
  saveWorkspaceSessionToDb,
  touchWorkspaceSessionInDb,
} from "./database";
import { isWorkspaceAdmin as isWorkspaceAdminActor } from "./workspace-ownership";
import type { WorkspaceAccount, WorkspaceAccountRecord, WorkspaceAccountRole, WorkspaceAccountStatus, WorkspaceSession } from "./types";

export const workspaceSessionCookieName = "fluxpost_session";
export const workspaceSessionMaxAgeSeconds = 60 * 60 * 24 * 30;
export type WorkspaceAuthMode = "accounts" | "whitelist";

const passwordScheme = "scrypt";
const passwordKeyLength = 64;
const scryptN = 16384;
const scryptR = 8;
const scryptP = 1;
const scryptMaxmem = 64 * 1024 * 1024;
const whitelistAccountIdPrefix = "whitelist:";

export type WorkspaceSessionToken = {
  token: string;
  session: WorkspaceSession;
};

export function toPublicWorkspaceAccount(account: WorkspaceAccountRecord | WorkspaceAccount): WorkspaceAccount {
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    role: resolveEffectiveWorkspaceRole(account.username, account.role),
    status: account.status,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    lastLoginAt: account.lastLoginAt,
    passwordSet: "passwordHash" in account ? Boolean(account.passwordHash) : account.passwordSet,
  };
}

export async function getWorkspaceAccountBootstrapState() {
  const authMode = getWorkspaceAuthMode();
  if (authMode === "whitelist") {
    const users = getWorkspaceWhitelistUsers();
    const records = await readWorkspaceAccountsFromDb();
    const allowedUsernames = new Set(users.map((user) => user.username));
    const activeAllowedAccounts = records
      .map(toPublicWorkspaceAccount)
      .filter((account) => allowedUsernames.has(account.username) && account.status === "active");
    const activeAdminAccounts = activeAllowedAccounts.filter((account) => account.role === "admin");
    return {
      authMode,
      hasAccounts: activeAllowedAccounts.length > 0,
      hasAdminAccount: activeAdminAccounts.length > 0,
      accountCount: users.length,
      activeAccountCount: activeAllowedAccounts.length,
      whitelistConfigured: users.length > 0,
      adminConfigured: getWorkspaceAdminUsernames().size > 0,
      setupPasswordConfigured: Boolean(process.env.WORKSPACE_ACCESS_PASSWORD),
    };
  }

  const accounts = await readWorkspaceAccountsFromDb();
  const activeAccounts = accounts.filter((account) => account.status === "active");
  const activeAdminAccounts = activeAccounts.map(toPublicWorkspaceAccount).filter((account) => account.role === "admin");
  return {
    authMode,
    hasAccounts: activeAccounts.length > 0,
    hasAdminAccount: activeAdminAccounts.length > 0,
    accountCount: accounts.length,
    activeAccountCount: activeAccounts.length,
    whitelistConfigured: false,
    adminConfigured: false,
    setupPasswordConfigured: false,
  };
}

export async function listWorkspaceAccounts() {
  if (getWorkspaceAuthMode() === "whitelist") {
    const records = await readWorkspaceAccountsFromDb();
    const recordByUsername = new Map(records.map((account) => [account.username, account]));
    const now = new Date().toISOString();
    return getWorkspaceWhitelistUsers().map((user) => {
      const record = recordByUsername.get(user.username);
      if (record) return toPublicWorkspaceAccount(record);
      return toPublicWorkspaceAccount({
        id: whitelistAccountId(user.username),
        username: user.username,
        displayName: user.displayName,
        role: resolveEffectiveWorkspaceRole(user.username, "operator"),
        status: "disabled",
        createdAt: now,
        updatedAt: now,
        passwordSet: false,
      });
    });
  }

  const accounts = await readWorkspaceAccountsFromDb();
  return accounts.map(toPublicWorkspaceAccount);
}

export async function createWorkspaceAccount(input: {
  username?: string;
  displayName?: string;
  password?: string;
  role?: WorkspaceAccountRole;
  status?: WorkspaceAccountStatus;
}) {
  const username = normalizeUsername(input.username);
  assertUsernameAllowedForAuthMode(username);

  const displayName = normalizeDisplayName(input.displayName, username);
  const password = normalizePassword(input.password);
  const existing = await getWorkspaceAccountByUsernameFromDb(username);
  if (existing) throw new Error("Workspace account already exists.");

  const accountCount = await countWorkspaceAccountsInDb();
  const now = new Date().toISOString();
  const account: WorkspaceAccountRecord = {
    id: getWorkspaceAuthMode() === "whitelist" ? whitelistAccountId(username) : `acct-${Date.now()}-${randomBytes(4).toString("hex")}`,
    username,
    displayName,
    passwordHash: await hashPassword(password),
    role: resolveStoredWorkspaceRole(username, accountCount === 0 ? "admin" : input.role),
    status: input.status === "disabled" ? "disabled" : "active",
    createdAt: now,
    updatedAt: now,
  };

  await saveWorkspaceAccountToDb(account);
  await recordExecutionLog({
    scope: "workspace/accounts",
    action: accountCount === 0 ? "Workspace account bootstrap" : "Workspace account created",
    status: "success",
    message: `Workspace account ${account.username} is ready.`,
    details: {
      accountId: account.id,
      role: toPublicWorkspaceAccount(account).role,
    },
  });
  return toPublicWorkspaceAccount(account);
}

export async function updateWorkspaceAccount(input: {
  id?: string;
  username?: string;
  displayName?: string;
  password?: string;
  role?: WorkspaceAccountRole;
  status?: WorkspaceAccountStatus;
}) {
  const account = await findWorkspaceAccountForUpdate(input);
  if (!account) throw new Error("Workspace account not found.");
  assertUsernameAllowedForAuthMode(account.username);

  const passwordHash = input.password === undefined ? account.passwordHash : await hashPassword(normalizePassword(input.password));
  const now = new Date().toISOString();
  const nextAccount: WorkspaceAccountRecord = {
    ...account,
    displayName: input.displayName === undefined ? account.displayName : normalizeDisplayName(input.displayName, account.username),
    passwordHash,
    role: resolveStoredWorkspaceRole(account.username, input.role || account.role),
    status: input.status === "disabled" ? "disabled" : "active",
    updatedAt: now,
  };

  await saveWorkspaceAccountToDb(nextAccount);
  if (input.password !== undefined || nextAccount.status === "disabled") {
    await revokeWorkspaceSessionsByAccountIdInDb(nextAccount.id);
  }

  await recordExecutionLog({
    scope: "workspace/accounts",
    action: "Workspace account updated",
    status: "info",
    message: `Workspace account ${nextAccount.username} was updated.`,
    details: {
      accountId: nextAccount.id,
      role: toPublicWorkspaceAccount(nextAccount).role,
      status: nextAccount.status,
      passwordReset: input.password !== undefined,
    },
  });
  return toPublicWorkspaceAccount(nextAccount);
}

export async function authenticateWorkspaceAccount(usernameInput: string | undefined, passwordInput: string | undefined) {
  if (getWorkspaceAuthMode() === "whitelist") {
    return authenticateWhitelistedWorkspaceAccount(usernameInput, passwordInput);
  }

  const username = normalizeUsername(usernameInput);
  const password = normalizePassword(passwordInput);
  const account = await getWorkspaceAccountByUsernameFromDb(username);
  if (!account || account.status !== "active") throw new Error("Invalid username or password.");

  const valid = await verifyPassword(password, account.passwordHash);
  if (!valid) throw new Error("Invalid username or password.");

  const nextAccount = await persistSuccessfulLogin(account);
  return {
    account: toPublicWorkspaceAccount(nextAccount),
    session: await createWorkspaceSession(nextAccount.id),
  };
}

export async function createWorkspaceSession(accountId: string): Promise<WorkspaceSessionToken> {
  const now = new Date();
  const token = randomBytes(32).toString("base64url");
  const session: WorkspaceSession = {
    id: `sess-${Date.now()}-${randomBytes(4).toString("hex")}`,
    accountId,
    tokenHash: hashSessionToken(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + workspaceSessionMaxAgeSeconds * 1000).toISOString(),
    lastSeenAt: now.toISOString(),
  };
  await saveWorkspaceSessionToDb(session);
  return { token, session };
}

export async function getCurrentWorkspaceAccount(request: Request) {
  const token = getWorkspaceSessionTokenFromRequest(request);
  if (!token) return undefined;
  const session = await getWorkspaceSessionByTokenHashFromDb(hashSessionToken(token));
  if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) return undefined;

  const account = getWorkspaceAuthMode() === "whitelist"
    ? await getWhitelistAccountFromSession(session)
    : await getAccountTableAccountFromSession(session);
  if (!account) return undefined;
  await touchWorkspaceSessionInDb(session.id);
  return account;
}

export async function requireWorkspaceAccount(request: Request) {
  const account = await getCurrentWorkspaceAccount(request);
  if (!account) throw new Error("Workspace account sign-in is required.");
  enterExecutionLogOwner(account);
  return account;
}

export function isWorkspaceSignInError(error: unknown) {
  return error instanceof Error && /workspace account sign-in is required/i.test(error.message);
}

export function isWorkspaceAdmin(account?: Pick<WorkspaceAccount, "role"> | null) {
  return isWorkspaceAdminActor(account as WorkspaceAccount | undefined | null);
}

export function getWorkspaceSessionTokenFromRequest(request: Request) {
  return readCookie(request.headers.get("cookie") || "", workspaceSessionCookieName);
}

export async function revokeCurrentWorkspaceSession(request: Request) {
  const token = getWorkspaceSessionTokenFromRequest(request);
  if (!token) return;
  await revokeWorkspaceSessionByTokenHashInDb(hashSessionToken(token));
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export function getWorkspaceAuthMode(): WorkspaceAuthMode {
  return process.env.WORKSPACE_AUTH_MODE?.trim().toLowerCase() === "accounts" ? "accounts" : "whitelist";
}

export function getWorkspaceWhitelistUsers() {
  const raw = process.env.WORKSPACE_ALLOWED_USERS || "";
  const seen = new Set<string>();
  const users: Array<{ username: string; displayName: string }> = [];

  for (const entry of raw.split(",")) {
    const [usernamePart, displayNamePart] = entry.split(":");
    try {
      const username = normalizeUsername(usernamePart);
      if (seen.has(username)) continue;
      seen.add(username);
      users.push({
        username,
        displayName: normalizeDisplayName(displayNamePart, username),
      });
    } catch {
      // Ignore malformed whitelist entries so one typo does not expose access.
    }
  }

  return users.slice(0, 20);
}

export function isWorkspaceWhitelistUsername(usernameInput: unknown) {
  try {
    const username = normalizeUsername(usernameInput);
    return getWorkspaceWhitelistUsers().some((user) => user.username === username);
  } catch {
    return false;
  }
}

export function isWorkspaceWhitelistAdminUsername(usernameInput: unknown) {
  try {
    return getWorkspaceAdminUsernames().has(normalizeUsername(usernameInput));
  } catch {
    return false;
  }
}

export function isWorkspaceSetupPasswordValid(passwordInput: unknown) {
  try {
    const password = normalizePassword(passwordInput);
    return isSharedAccessPasswordValid(password);
  } catch {
    return false;
  }
}

async function authenticateWhitelistedWorkspaceAccount(usernameInput: string | undefined, passwordInput: string | undefined) {
  const username = normalizeUsername(usernameInput);
  const password = normalizePassword(passwordInput);
  if (!isWorkspaceWhitelistUsername(username)) throw new Error("Invalid username or password.");

  const account = await getWorkspaceAccountByUsernameFromDb(username);
  if (!account || account.status !== "active") throw new Error("Invalid username or password.");
  const valid = await verifyPassword(password, account.passwordHash);
  if (!valid) throw new Error("Invalid username or password.");

  const nextAccount = await persistSuccessfulLogin(account);
  return {
    account: toPublicWorkspaceAccount(nextAccount),
    session: await createWorkspaceSession(nextAccount.id),
  };
}

async function getWhitelistAccountFromSession(session: WorkspaceSession) {
  const account = await getWorkspaceAccountByIdFromDb(session.accountId);
  if (!account || account.status !== "active") return undefined;
  if (!isWorkspaceWhitelistUsername(account.username)) return undefined;
  return toPublicWorkspaceAccount(account);
}

async function getAccountTableAccountFromSession(session: WorkspaceSession) {
  const account = await getWorkspaceAccountByIdFromDb(session.accountId);
  if (!account || account.status !== "active") return undefined;
  return toPublicWorkspaceAccount(account);
}

async function persistSuccessfulLogin(account: WorkspaceAccountRecord) {
  const now = new Date().toISOString();
  const nextAccount: WorkspaceAccountRecord = {
    ...account,
    role: resolveStoredWorkspaceRole(account.username, account.role),
    lastLoginAt: now,
    updatedAt: now,
  };
  await saveWorkspaceAccountToDb(nextAccount);

  await recordExecutionLog({
    scope: "workspace/accounts",
    action: getWorkspaceAuthMode() === "whitelist" ? "Workspace whitelist account signed in" : "Workspace account signed in",
    status: "info",
    message: `Workspace account ${nextAccount.username} signed in.`,
    details: {
      accountId: nextAccount.id,
      role: toPublicWorkspaceAccount(nextAccount).role,
    },
  });
  return nextAccount;
}

async function findWorkspaceAccountForUpdate(input: { id?: string; username?: string }) {
  if (input.id) return getWorkspaceAccountByIdFromDb(input.id);
  if (input.username) return getWorkspaceAccountByUsernameFromDb(normalizeUsername(input.username));
  return undefined;
}

function assertUsernameAllowedForAuthMode(username: string) {
  if (getWorkspaceAuthMode() !== "whitelist") return;
  if (!isWorkspaceWhitelistUsername(username)) {
    throw new Error("Workspace account username must be listed in WORKSPACE_ALLOWED_USERS.");
  }
}

function resolveStoredWorkspaceRole(username: string, requestedRole?: WorkspaceAccountRole) {
  if (getWorkspaceAuthMode() === "whitelist" && isWorkspaceWhitelistAdminUsername(username)) return "admin";
  return requestedRole === "admin" ? "admin" : "operator";
}

function resolveEffectiveWorkspaceRole(username: string, storedRole?: WorkspaceAccountRole) {
  if (getWorkspaceAuthMode() === "whitelist" && isWorkspaceWhitelistAdminUsername(username)) return "admin";
  return storedRole === "admin" ? "admin" : "operator";
}

function getWorkspaceAdminUsernames() {
  const usernames = new Set<string>();
  for (const entry of (process.env.WORKSPACE_ADMIN_USERS || "").split(",")) {
    try {
      usernames.add(normalizeUsername(entry));
    } catch {
      // Ignore malformed admin entries; they should not grant access.
    }
  }
  return usernames;
}

function whitelistAccountId(username: string) {
  return `${whitelistAccountIdPrefix}${username}`;
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await deriveScrypt(password, salt, passwordKeyLength, {
    N: scryptN,
    r: scryptR,
    p: scryptP,
    maxmem: scryptMaxmem,
  });
  return [passwordScheme, scryptN, scryptR, scryptP, salt, derived.toString("base64url")].join("$");
}

async function verifyPassword(password: string, storedHash: string) {
  try {
    const [scheme, nValue, rValue, pValue, salt, expectedValue] = storedHash.split("$");
    if (scheme !== passwordScheme || !salt || !expectedValue) return false;
    const expected = Buffer.from(expectedValue, "base64url");
    const actual = await deriveScrypt(password, salt, expected.length, {
      N: Number(nValue),
      r: Number(rValue),
      p: Number(pValue),
      maxmem: scryptMaxmem,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch (error) {
    await recordExecutionLog({
      scope: "workspace/accounts",
      action: "Workspace password verification failed",
      status: "error",
      message: compactError(error),
    });
    return false;
  }
}

function isSharedAccessPasswordValid(password: string) {
  const expected = process.env.WORKSPACE_ACCESS_PASSWORD || "";
  const actual = Buffer.from(password);
  const expectedBuffer = Buffer.from(expected);
  return expectedBuffer.length > 0 && actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function deriveScrypt(
  password: string,
  salt: string,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

function normalizeUsername(value: unknown) {
  const username = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-z0-9._@-]{2,48}$/.test(username)) {
    throw new Error("Username must be 2-48 characters and use letters, numbers, dot, underscore, at, or hyphen.");
  }
  return username;
}

function normalizeDisplayName(value: unknown, fallback: string) {
  const displayName = typeof value === "string" ? value.trim() : "";
  return displayName.slice(0, 40) || fallback;
}

function normalizePassword(value: unknown) {
  const password = typeof value === "string" ? value : "";
  if (password.length < 6 || password.length > 128) {
    throw new Error("Password must be 6-128 characters.");
  }
  return password;
}

function readCookie(header: string, name: string) {
  const pairs = header.split(";").map((part) => part.trim()).filter(Boolean);
  for (const pair of pairs) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    const key = decodeURIComponent(pair.slice(0, separator).trim());
    if (key !== name) continue;
    return decodeURIComponent(pair.slice(separator + 1));
  }
  return undefined;
}
