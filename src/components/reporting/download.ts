'use client'

// Client helpers for file downloads (blob + <a download>) and FormData posts.

export async function downloadFile(url: string): Promise<string> {
  const res = await fetch(url)
  const blob = await res.blob()
  if (!res.ok) {
    let message = `Gagal mengunduh (${res.status})`
    try {
      const parsed = JSON.parse(await blob.text()) as { error?: unknown }
      if (typeof parsed.error === 'string' && parsed.error) message = parsed.error
    } catch {
      /* binary or empty body */
    }
    throw new Error(message)
  }
  const cd = res.headers.get('content-disposition') ?? ''
  const match = /filename="?([^";]+)"?/i.exec(cd)
  const filename = match?.[1] ?? 'unduhan.xlsx'
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)
  return filename
}

/** POST FormData without the JSON content-type (apiFetch forces JSON headers). */
export async function apiFetchForm<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', body: form })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Terjadi kesalahan (${res.status})`
    throw new Error(msg)
  }
  return (body as { data: T }).data
}

/** Trigger a client-side CSV download (used for import error reports). */
export function downloadCsv(filename: string, lines: string[]): void {
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)
}

/** Sonner toast helper: loading -> success/error around a download promise. */
export async function toastDownload(url: string, loadingText: string): Promise<void> {
  const { toast } = await import('sonner')
  const id = toast.loading(loadingText)
  try {
    const filename = await downloadFile(url)
    toast.success(`"${filename}" terunduh`, { id })
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Gagal mengunduh berkas', { id })
  }
}
