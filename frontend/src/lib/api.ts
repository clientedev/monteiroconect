const API_BASE = '/api';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('wa_token', token);
    } else {
      localStorage.removeItem('wa_token');
    }
  }

  loadToken() {
    this.token = localStorage.getItem('wa_token');
  }

  private headers(): HeadersInit {
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, { headers: this.headers() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Erro na requisição');
    }
    return res.json();
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Erro na requisição');
    }
    return res.json();
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Erro na requisição');
    }
    return res.json();
  }

  async del<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Erro na requisição');
    }
    return res.json();
  }

  async upload<T>(path: string, file: File): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);
    const h: HeadersInit = {};
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: h,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Erro no upload');
    }
    return res.json();
  }
}

export const api = new ApiClient();

// Auth
export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string; user: { id: string; username: string; email: string; role: string } }>('/auth/login', { username, password }),
  me: () => api.get<{ id: string; username: string; role: string }>('/auth/me'),
  listUsers: () => api.get<any[]>('/auth/users'),
  createUser: (data: { username: string; email: string; password: string; role: string }) =>
    api.post('/auth/users', data),
  updateUser: (id: string, data: { role?: string; isActive?: boolean }) =>
    api.put(`/auth/users/${id}`, data),
  deleteUser: (id: string) => api.del(`/auth/users/${id}`),
  setWhatsApps: (id: string, whatsappIds: string[]) => api.put(`/auth/users/${id}/whatsapps`, { whatsappIds }),
};

// WhatsApp
export const whatsappApi = {
  list: () => api.get<any[]>('/whatsapp'),
  get: (id: string) => api.get<any>(`/whatsapp/${id}`),
  create: (name: string) => api.post<any>('/whatsapp', { name }),
  disconnect: (id: string) => api.post(`/whatsapp/${id}/disconnect`),
  remove: (id: string) => api.del(`/whatsapp/${id}`),
  refreshQR: (id: string) => api.post<{ qrCode: string }>(`/whatsapp/${id}/refresh-qr`),
  reconnect: (id: string) => api.post<{ status: string; qrCode: string | null }>(`/whatsapp/${id}/reconnect`),
  sync: (id: string) => api.post<{ contacts: number; groups: number }>(`/whatsapp/${id}/sync`),
  syncProgress: (id: string) => api.get<any>(`/whatsapp/${id}/sync-progress`),
};

// Conversations
export const conversationApi = {
  list: (whatsappId: string, search?: string, page?: number, includeGroups = true, limit = 50) =>
    api.get<any>(`/conversations?whatsappId=${encodeURIComponent(whatsappId)}&search=${encodeURIComponent(search || '')}&page=${page || 1}&limit=${limit}&includeGroups=${includeGroups}`),
  get: (id: string) => api.get<any>(`/conversations/${id}`),
  messages: (id: string, page?: number) =>
    api.get<any>(`/conversations/${id}/messages?page=${page || 1}`),
  assign: (id: string, userId: string | null) =>
    api.put<{ assignedUser: { id: string; username: string; role: string } | null }>(`/conversations/${id}/assignment`, { userId }),
  markRead: (id: string) => api.post(`/conversations/${id}/read`),
  send: (
    accountId: string,
    to: string,
    content: string,
    type?: string,
    mediaUrl?: string,
    mediaMimeType?: string,
    mediaFileName?: string,
    senderName?: string,
  ) => api.post('/conversations/send', { accountId, to, content, type, mediaUrl, mediaMimeType, mediaFileName, senderName }),
  broadcast: (
    accountId: string,
    recipients: string[],
    content: string,
    type?: string,
    mediaUrl?: string,
    mediaMimeType?: string,
    mediaFileName?: string,
  ) => api.post<{
    success: boolean;
    total: number;
    sent: number;
    failed: number;
    results: Array<{ to: string; ok: boolean; error?: string }>;
  }>('/conversations/broadcast', {
    accountId,
    recipients,
    content,
    type,
    mediaUrl,
    mediaMimeType,
    mediaFileName,
  }),
};

// Contacts
export const contactApi = {
  list: (whatsappId: string, search?: string, page = 1, limit = 50) =>
    api.get<any>(`/contacts?whatsappId=${encodeURIComponent(whatsappId)}&search=${encodeURIComponent(search || '')}&page=${page}&limit=${limit}`),
  update: (id: string, data: {
    name?: string;
    notes?: string;
  }) =>
    api.put(`/contacts/${id}`, data),
};

// Tags
export const tagApi = {
  list: () => api.get<any[]>('/tags'),
  create: (name: string, color: string) => api.post('/tags', { name, color }),
  update: (id: string, data: { name?: string; color?: string }) =>
    api.put(`/tags/${id}`, data),
  delete: (id: string) => api.del(`/tags/${id}`),
  add: (conversationId: string, contactId: string, tagId: string) =>
    api.post('/tags/conversation', { conversationId, contactId, tagId }),
  remove: (conversationId: string, contactId: string, tagId: string) =>
    api.del(`/tags/conversation?conversationId=${conversationId}&contactId=${contactId}&tagId=${tagId}`),
};

// Dashboard
export const dashboardApi = {
  stats: () => api.get<any>('/dashboard/stats'),
};

// Logs
export const logApi = {
  list: (level?: string, page?: number) =>
    api.get<any>(`/logs?level=${level || ''}&page=${page || 1}`),
  clear: () => api.del('/logs'),
};

// Search
export const searchApi = {
  search: (q: string) => api.get<any>(`/search?q=${encodeURIComponent(q)}`),
};

// Chatbots
export const chatbotApi = {
  list: (whatsappAccountId?: string) =>
    api.get<any[]>(`/chatbots${whatsappAccountId ? `?whatsappAccountId=${whatsappAccountId}` : ''}`),
  get: (id: string) => api.get<any>(`/chatbots/${id}`),
  create: (data: any) => api.post('/chatbots', data),
  update: (id: string, data: any) => api.put(`/chatbots/${id}`, data),
  delete: (id: string) => api.del(`/chatbots/${id}`),
  toggle: (id: string) => api.post(`/chatbots/${id}/toggle`),
  testAi: () => api.post<{ ok: boolean; model?: string; error?: string }>('/chatbots/test-ai'),
  addReply: (chatbotId: string, data: any) => api.post(`/chatbots/${chatbotId}/replies`, data),
  updateReply: (replyId: string, data: any) => api.put(`/chatbots/replies/${replyId}`, data),
  deleteReply: (replyId: string) => api.del(`/chatbots/replies/${replyId}`),
};
