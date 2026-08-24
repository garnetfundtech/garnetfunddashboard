/** Client-side helper for the on-demand signed-URL endpoint (/api/files/sign). */
export async function signFile(
  source: "research" | "resources" | "team-files",
  id: string,
): Promise<{ viewUrl: string | null; downloadUrl: string | null }> {
  try {
    const res = await fetch("/api/files/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, id }),
    });
    const json = await res.json();
    if (!json.ok) return { viewUrl: null, downloadUrl: null };
    return { viewUrl: json.viewUrl ?? null, downloadUrl: json.downloadUrl ?? null };
  } catch {
    return { viewUrl: null, downloadUrl: null };
  }
}
