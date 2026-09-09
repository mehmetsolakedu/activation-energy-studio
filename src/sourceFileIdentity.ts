export interface HashedSourceFileIdentity {
  readonly sourceFileId: string;
  readonly sha256: string;
}

export function sourceFileIdFromSha256(sha256: string): string {
  const normalized = sha256.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('A source-file identity requires a complete 64-character SHA-256 digest.');
  }
  return `sha256:${normalized}`;
}

export async function hashSourceFile(file: File): Promise<HashedSourceFileIdentity> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const sha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return {
    sourceFileId: sourceFileIdFromSha256(sha256),
    sha256,
  };
}
