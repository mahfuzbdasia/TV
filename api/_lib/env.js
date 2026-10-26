export function requireEnv(...names) {
  const missing = names.filter(n => !process.env[n]);
  if (missing.length) throw new Error(`Missing server environment variables: ${missing.join(', ')}`);
}
