import { formatBytes, type RawFileInput } from './guardrailEngine';

export function isTextImportableFile(file: File): boolean {
  return (
    file.type.startsWith('text/') ||
    file.type === 'application/json' ||
    /\.(json|ya?ml|txt|md|toml|py|cfg|ini)$/i.test(file.name)
  );
}

export async function filesToRawInputs(fileList: FileList): Promise<RawFileInput[]> {
  return Promise.all(
    Array.from(fileList).map(async (file) => {
      const previewText =
        isTextImportableFile(file) && file.size <= 300_000
          ? await file.text()
          : `${file.type || 'binary'} · ${formatBytes(file.size)}`;
      const objectUrl =
        file.type.startsWith('image/') || file.type.startsWith('video/')
          ? URL.createObjectURL(file)
          : undefined;
      const rel =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      return {
        name: file.name,
        relativePath: rel,
        sizeBytes: file.size,
        mimeType: file.type,
        previewText,
        objectUrl,
        rawFile: file,
      };
    })
  );
}

export async function readDroppedEntryFiles(
  entry: FileSystemEntry,
  prefix = ''
): Promise<RawFileInput[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) =>
      fileEntry.file(resolve, reject)
    );
    const rel = prefix ? `${prefix}/${file.name}` : file.name;
    const previewText =
      isTextImportableFile(file) && file.size <= 300_000
        ? await file.text()
        : `${file.type || 'binary'} · ${formatBytes(file.size)}`;
    const objectUrl =
      file.type.startsWith('image/') || file.type.startsWith('video/')
        ? URL.createObjectURL(file)
        : undefined;
    return [
      {
        name: file.name,
        relativePath: rel,
        sizeBytes: file.size,
        mimeType: file.type,
        previewText,
        objectUrl,
        rawFile: file,
      },
    ];
  }
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      const all: FileSystemEntry[] = [];
      const readBatch = () => {
        reader.readEntries((batch) => {
          if (batch.length === 0) resolve(all);
          else {
            all.push(...batch);
            readBatch();
          }
        }, reject);
      };
      readBatch();
    });
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    const nested = await Promise.all(
      entries.map((child) => readDroppedEntryFiles(child, nextPrefix))
    );
    return nested.flat();
  }
  return [];
}
