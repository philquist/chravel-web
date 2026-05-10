import { SignJWT, jwtVerify } from 'https://deno.land/x/jose@v5.2.0/index.ts';

export interface AgentAssertionPayload {
  user_id: string;
  trip_id: string;
  allowed_tools: string[];
  exp?: number;
}

function getAgentAssertionSecret(): Uint8Array {
  const secret = Deno.env.get('AGENT_ASSERTION_SECRET');
  if (!secret) {
    throw new Error('AGENT_ASSERTION_SECRET is required');
  }
  return new TextEncoder().encode(secret);
}

export async function generateAgentAssertion(
  payload: Omit<AgentAssertionPayload, 'exp'>,
  expiresInSeconds = 90,
): Promise<string> {
  const secretKey = getAgentAssertionSecret();
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(secretKey);
}

export async function verifyAgentAssertion(token: string): Promise<AgentAssertionPayload> {
  const secretKey = getAgentAssertionSecret();
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload as unknown as AgentAssertionPayload;
  } catch (error) {
    throw new Error(
      `Invalid or expired agent assertion: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
