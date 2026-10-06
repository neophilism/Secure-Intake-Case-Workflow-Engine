import type { MalwareScanStatus } from "./policy";

export interface MalwareScanResult {
  status: Exclude<MalwareScanStatus, "pending">;
  details?: Record<string, unknown>;
}

export interface MalwareScanner {
  readonly provider: string;
  scan(input: {
    data: Uint8Array;
    filename: string;
    mimeType: string;
    sha256: string;
  }): Promise<MalwareScanResult>;
}

export function getMalwareScanner(): MalwareScanner | null {
  // Intentionally no implicit "clean" scanner. A production deployment should
  // register a real scanner adapter. Until then, uploads remain quarantined.
  return null;
}
