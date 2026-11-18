export type LoginRole = "student" | "university" | "admin";

const storagePrefix = "diplomachain.remembered-email.";

export function readRememberedEmail(role: LoginRole): string | null {
  try {
    return window.localStorage.getItem(storagePrefix + role);
  } catch {
    return null;
  }
}

export function saveRememberedEmail(role: LoginRole, email: string): void {
  try {
    window.localStorage.setItem(storagePrefix + role, email.trim());
  } catch {
    return;
  }
}

export function clearRememberedEmail(role: LoginRole): void {
  try {
    window.localStorage.removeItem(storagePrefix + role);
  } catch {
    return;
  }
}
