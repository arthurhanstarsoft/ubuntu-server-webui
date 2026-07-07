/** Uploads via XHR (fetch has no upload progress). Resolves on 2xx, rejects with the server's error message. */
export function uploadFile(
  destDir: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/files/upload?path=${encodeURIComponent(destDir)}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let msg = `upload failed (${xhr.status})`;
        try {
          msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg;
        } catch {
          // non-JSON body
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('upload failed — network error'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
