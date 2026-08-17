export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 13 && cleaned.startsWith('55')) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  if (cleaned.length === 11) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  return phone;
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function calculateBackoff(attempt: number, initialDelay: number, maxDelay: number): number {
  const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
  const jitter = delay * 0.1 * Math.random();
  return Math.floor(delay + jitter);
}
