/** Barrel del subsistema de sincronización. */
export * from "./types";
export * from "./entities";
export * from "./RemotePort";
export * from "./stubRemote";
// `supabaseRemote` se importa de forma diferida (arrastra @supabase/supabase-js);
// no se re-exporta acá a propósito para no inflar bundles que importen el barrel.
export * from "./applyRemoteChanges";
export * from "./queue";
export * from "./SyncEngine";
