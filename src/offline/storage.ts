import { Capacitor } from "@capacitor/core";
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
import { openDB } from "idb";
import { empty, type State } from "./model";

export const native = Capacitor.isNativePlatform();
export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!native) return localStorage.getItem(key);
    try {
      return (await SecureStoragePlugin.get({ key })).value;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string) {
    if (native) await SecureStoragePlugin.set({ key, value });
    else localStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    if (native) {
      if (await this.getItem(key)) await SecureStoragePlugin.remove({ key });
    } else localStorage.removeItem(key);
  },
};
let sqlite: Promise<SQLiteDBConnection> | undefined;
async function nativeDB() {
  if (!sqlite)
    sqlite = (async () => {
      const connection = new SQLiteConnection(CapacitorSQLite);
      if (!(await connection.isSecretStored()).result) {
        const passphrase = Array.from(
          crypto.getRandomValues(new Uint8Array(32)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        await connection.setEncryptionSecret(passphrase);
      }
      const db = await connection.createConnection(
        "moismety",
        true,
        "secret",
        1,
        false,
      );
      await db.open();
      await db.execute(
        "CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY NOT NULL, state TEXT NOT NULL);",
      );
      return db;
    })();
  return sqlite;
}
const webDB = () =>
  openDB("moismety-v1", 1, {
    upgrade(db) {
      db.createObjectStore("accounts");
    },
  });
export async function readState(user: string): Promise<State> {
  if (native) {
    const rows = await (
      await nativeDB()
    ).query("SELECT state FROM accounts WHERE id = ?", [user]);
    return rows.values?.[0]
      ? JSON.parse(rows.values[0].state)
      : { data: empty(), base: empty() };
  }
  return (
    (await (await webDB()).get("accounts", user)) ?? {
      data: empty(),
      base: empty(),
    }
  );
}
async function writeState(user: string, state: State) {
  if (native)
    await (
      await nativeDB()
    ).run("INSERT OR REPLACE INTO accounts (id,state) VALUES (?,?)", [
      user,
      JSON.stringify(state),
    ]);
  else await (await webDB()).put("accounts", state, user);
}
let tail = Promise.resolve();
export function editState(
  user: string,
  edit: (state: State) => State,
): Promise<State> {
  const execute = async () => {
    const state = edit(await readState(user));
    await writeState(user, state);
    return state;
  };
  const operation = tail.then(async () => {
    if (navigator.locks)
      return await navigator.locks.request("moismety-store", execute);
    return await execute();
  });
  tail = operation.then(
    () => {},
    () => {},
  );
  return operation;
}
