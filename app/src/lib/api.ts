import { Platform } from 'react-native';
import type { Order, Product, User } from './types';

// The web build is served by the API, so it uses relative URLs. Native builds need
// EXPO_PUBLIC_API_URL; 10.0.2.2 is the host machine as seen from the Android emulator.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'web' ? '' : 'http://10.0.2.2:8080');

let token: string | null = null;
export const setToken = (t: string | null) => {
  token = t;
};

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  }).catch(() => {
    throw new Error('Network error, please try again');
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Request failed, please try again');
  return body as T;
}

export const api = {
  login: (name: string, role: User['role']) =>
    req<{ token: string; user: User }>('/api/auth/demo', {
      method: 'POST',
      body: JSON.stringify({ name, role }),
    }),

  createProduct: (input: {
    title: string;
    description: string;
    price: number;
    tags: string[];
    fileName: string;
    contentType: string;
    fileSize?: number;
    durationSec?: number;
  }) =>
    req<{ product: Product; uploadUrl: string }>('/api/products', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  completeUpload: (id: string) => req<{ status: string }>(`/api/products/${id}/complete`, { method: 'POST' }),
  myProducts: () => req<{ products: Product[] }>('/api/products/mine'),
  search: (q: string, tag?: string) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (tag) p.set('tag', tag);
    return req<{ products: Product[] }>(`/api/products?${p.toString()}`);
  },
  tags: () => req<{ tags: string[] }>('/api/products/tags'),
  product: (id: string) => req<{ product: Product }>(`/api/products/${id}`),
  placeOrder: (productId: string, quantity: number) =>
    req<{ order: Order }>('/api/orders', { method: 'POST', body: JSON.stringify({ productId, quantity }) }),
  myOrders: () => req<{ orders: Order[] }>('/api/orders/mine'),
};
