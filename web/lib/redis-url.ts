/**
 * Puts the REDIS_URL setting right when it was pasted a little wrong, which is easy to do from a provider's page: a space or
 * line break at either end, quotes around it, the whole `redis-cli --tls -u ...` command copied instead of just the address, or
 * plain `redis://` for a host that only speaks over TLS (Upstash). The address itself, and its password, are never logged.
 */
export function cleanRedisUrl(raw: string | undefined): string {
  if (!raw) return "redis://localhost:6379";
  let value = raw.trim().replace(/^["']|["']$/g, "").trim();
  // The command the provider shows for the command line: keep only the address in it.
  const inCommand = /rediss?:\/\/[^\s"']+/.exec(value);
  if (inCommand) value = inCommand[0];
  // Upstash hosts accept TLS only.
  if (/^redis:\/\/[^/]*\.upstash\.io(?::\d+)?(\/|$)/i.test(value)) value = value.replace(/^redis:/i, "rediss:");
  return value;
}

/**
 * A fixed word for what is wrong with the setting, or null when it looks fine. It is chosen from the shape of the value and
 * says nothing of what the value holds, so it is safe to put in a log.
 */
export function redisUrlProblem(raw: string | undefined): string | null {
  if (!raw || raw.trim() === "") return "not set";
  const value = cleanRedisUrl(raw);
  if (!/^rediss?:\/\//i.test(value)) return "does not start with redis:// or rediss://";
  try {
    const url = new URL(value);
    if (!url.hostname) return "has no host";
    if (!/^[a-z0-9.-]+$/i.test(url.hostname)) return "host has unusual characters";
    if (url.port && !/^\d{1,5}$/.test(url.port)) return "port is not a number";
  } catch {
    return "is not a valid address";
  }
  return null;
}
