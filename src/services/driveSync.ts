import { ProjectAssetFile } from '../types/automation';

export interface DriveFileEntry {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
}

export interface DriveSyncPlan {
  rootFolderId: string;
  inputFolderId: string;
  existingNamesToOverwrite: string[];
  existingByName: Map<string, DriveFileEntry>;
}

export interface DriveSyncResult {
  rootFolderId: string;
  rootFolderUrl: string;
  notebookFileId: string;
  notebookUrl: string;
  colabLaunchUrl: string;
  uploadedCount: number;
  overwrittenCount: number;
}

const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

function escapeQueryValue(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function listFolderChildren(
  token: string,
  parentId?: string
): Promise<DriveFileEntry[]> {
  const parentClause = parentId
    ? `'${escapeQueryValue(parentId)}' in parents and `
    : `'root' in parents and `;
  const q = `${parentClause}trashed=false`;
  const url = `${DRIVE_FILES_API}?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink)&pageSize=200`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Drive listeleme hatası (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { files?: DriveFileEntry[] };
  return data.files ?? [];
}

export async function findOrCreateDriveFolder(
  token: string,
  folderName: string,
  parentId?: string
): Promise<DriveFileEntry> {
  const parentClause = parentId
    ? `'${escapeQueryValue(parentId)}' in parents and `
    : `'root' in parents and `;
  const q = `${parentClause}name='${escapeQueryValue(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchUrl = `${DRIVE_FILES_API}?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!searchRes.ok) {
    throw new Error(`Drive klasörü aranırken hata (${searchRes.status})`);
  }
  const searchJson = (await searchRes.json()) as { files?: DriveFileEntry[] };
  if (searchJson.files && searchJson.files.length > 0) {
    return searchJson.files[0];
  }

  const createRes = await fetch(`${DRIVE_FILES_API}?fields=id,name,mimeType,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Drive klasörü oluşturulamadı (${createRes.status}): ${errText}`);
  }
  return (await createRes.json()) as DriveFileEntry;
}

async function uploadMultipartToDrive(
  token: string,
  fileName: string,
  mimeType: string,
  content: Blob | string,
  parentId: string,
  existingFileId?: string
): Promise<DriveFileEntry> {
  const metadata = existingFileId
    ? { name: fileName, mimeType }
    : { name: fileName, mimeType, parents: [parentId] };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  const bodyBlob =
    typeof content === 'string'
      ? new Blob([content], { type: mimeType })
      : content;
  form.append('file', bodyBlob);

  const method = existingFileId ? 'PATCH' : 'POST';
  const endpoint = existingFileId
    ? `${DRIVE_UPLOAD_API}/${existingFileId}?uploadType=multipart&fields=id,name,mimeType,webViewLink`
    : `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,webViewLink`;

  const res = await fetch(endpoint, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${fileName} yüklenemedi (${res.status}): ${text}`);
  }
  return (await res.json()) as DriveFileEntry;
}

export async function prepareDriveSyncPlan(
  token: string,
  driveFolderName: string,
  assets: ProjectAssetFile[]
): Promise<DriveSyncPlan> {
  const rootFolder = await findOrCreateDriveFolder(token, driveFolderName);
  const inputFolder = await findOrCreateDriveFolder(token, 'input_project', rootFolder.id);

  const rootChildren = await listFolderChildren(token, rootFolder.id);
  const inputChildren = await listFolderChildren(token, inputFolder.id);

  const existingByName = new Map<string, DriveFileEntry>();
  for (const f of rootChildren) {
    existingByName.set(`root:${f.name}`, f);
  }
  for (const f of inputChildren) {
    existingByName.set(`input:${f.name}`, f);
  }

  const candidateRootNames = [
    'minimax_h3_colab_automation.ipynb',
    'workspace_manifest.json',
    'preflight_guard.py',
  ];
  const existingNamesToOverwrite: string[] = [];

  for (const name of candidateRootNames) {
    if (existingByName.has(`root:${name}`)) {
      existingNamesToOverwrite.push(name);
    }
  }
  for (const asset of assets.filter((a) => a.included)) {
    if (existingByName.has(`input:${asset.name}`)) {
      existingNamesToOverwrite.push(`input_project/${asset.name}`);
    }
  }

  return {
    rootFolderId: rootFolder.id,
    inputFolderId: inputFolder.id,
    existingNamesToOverwrite,
    existingByName,
  };
}

export async function executeDriveSync(
  token: string,
  plan: DriveSyncPlan,
  notebookJson: string,
  manifestJson: string,
  preflightPy: string,
  assets: ProjectAssetFile[],
  onProgress?: (label: string, completed: number, total: number) => void
): Promise<DriveSyncResult> {
  const activeAssets = assets.filter((a) => a.included);
  const totalSteps = 3 + activeAssets.length;
  let completed = 0;
  let overwrittenCount = 0;

  const uploadRootFile = async (name: string, content: string, mime: string) => {
    const existing = plan.existingByName.get(`root:${name}`);
    if (existing) overwrittenCount += 1;
    onProgress?.(name, completed, totalSteps);
    const entry = await uploadMultipartToDrive(
      token,
      name,
      mime,
      content,
      plan.rootFolderId,
      existing?.id
    );
    completed += 1;
    onProgress?.(name, completed, totalSteps);
    return entry;
  };

  const notebookEntry = await uploadRootFile(
    'minimax_h3_colab_automation.ipynb',
    notebookJson,
    'application/x-ipynb+json'
  );
  await uploadRootFile('workspace_manifest.json', manifestJson, 'application/json');
  await uploadRootFile('preflight_guard.py', preflightPy, 'text/x-python');

  for (const asset of activeAssets) {
    const existing = plan.existingByName.get(`input:${asset.name}`);
    if (existing) overwrittenCount += 1;
    onProgress?.(asset.name, completed, totalSteps);

    const payload: Blob | string = asset.rawFile
      ? asset.rawFile
      : asset.previewText || `# Placeholder metadata for ${asset.name}\n`;

    await uploadMultipartToDrive(
      token,
      asset.name,
      asset.mimeType || 'application/octet-stream',
      payload,
      plan.inputFolderId,
      existing?.id
    );
    completed += 1;
    onProgress?.(asset.name, completed, totalSteps);
  }

  return {
    rootFolderId: plan.rootFolderId,
    rootFolderUrl: `https://drive.google.com/drive/folders/${plan.rootFolderId}`,
    notebookFileId: notebookEntry.id,
    notebookUrl:
      notebookEntry.webViewLink || `https://drive.google.com/file/d/${notebookEntry.id}/view`,
    colabLaunchUrl: `https://colab.research.google.com/drive/${notebookEntry.id}`,
    uploadedCount: totalSteps,
    overwrittenCount,
  };
}
