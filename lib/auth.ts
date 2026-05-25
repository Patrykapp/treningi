import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export interface AuthPayload {
  userId: string;
  email: string;
  name: string;
}

export async function getAuthUser(): Promise<AuthPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('workout_token')?.value;
    if (!token) return null;
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    if (!payload.userId) return null;
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}

export async function getAuthUserId(): Promise<string | null> {
  const user = await getAuthUser();
  return user?.userId ?? null;
}
