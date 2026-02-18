export function isLocalSourcePath(sourcePath: string | null | undefined) {
  return typeof sourcePath === "string" && sourcePath.startsWith("local://");
}

export function toLocalFilePath(sourcePath: string) {
  if (!isLocalSourcePath(sourcePath)) return null;
  return sourcePath.slice("local://".length);
}
