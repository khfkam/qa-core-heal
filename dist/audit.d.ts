export interface AuditEntry {
    timestamp: string;
    file: string;
    line: number;
    old: string;
    new: string;
    level: string;
    ambiguous: boolean;
    /** The heal was written to disk (always true for logged entries — a
     *  later revert does not erase the fact that it was applied). */
    applied: boolean;
    verified: boolean;
    /** True when the verify re-run still failed and the edit was undone. */
    reverted: boolean;
}
/** Append one JSON line per applied heal. Creates the log directory if needed. */
export declare function appendAuditLog(logPath: string, entries: AuditEntry[]): void;
