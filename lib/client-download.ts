export async function downloadResponseFile(response: Response, fallbackFileName: string) {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? "Export nije uspeo.");
  }

  const blob = await response.blob();
  const fileName = responseFileName(response.headers.get("Content-Disposition")) ?? fallbackFileName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function responseFileName(contentDisposition: string | null) {
  const encoded = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  }

  return contentDisposition?.match(/filename="([^"]+)"/i)?.[1] ?? null;
}
