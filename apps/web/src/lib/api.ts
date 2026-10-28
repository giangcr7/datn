const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

export async function apiCall(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: any,
  token?: string,
) {
  const headers: any = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join('; ')
      : data.message || data.error || "Lỗi server";
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return data;
}
