export function validPublicConfig(url: string, key: string): boolean {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) return false;
  if (key.startsWith("sb_publishable_") && key.length >= 20) return true;
  try {
    const payload = JSON.parse(
      atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return payload.role === "anon";
  } catch {
    return false;
  }
}
