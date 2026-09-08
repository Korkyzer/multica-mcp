// `multica attachment download` always prints a JSON object (e.g.
// `{"filename":...,"id":...,"path":...,"size":...}`), never a bare path —
// it has no plain-text mode and ignores --output.
export function parseAttachmentDownloadPath(output: string): string {
  const parsed = JSON.parse(output.trim()) as { path?: unknown };
  if (typeof parsed.path !== "string" || parsed.path === "") {
    throw new Error(
      `multica attachment download output had no "path" field: ${output.slice(0, 200)}`,
    );
  }
  return parsed.path;
}
