import { verifyCapabilityToken } from './capabilityTokens.ts';
import { executeFunctionCall } from '../functionExecutor.ts';
import { normalizeToolResult } from '../concierge/toolResultContracts.ts';
import {
  DESTRUCTIVE_MUTATION_ALLOWLIST,
  requiresConfirmationGate,
  enforceToolSchema,
  redactSensitiveFields,
  toolMutationMode,
  validateToolArgsStrict,
} from './aiSecurityBoundary.ts';

export async function executeToolSecurely(
  supabase: any,
  capabilityToken: string,
  toolName: string,
  args: Record<string, any>,
  locationContext?: any,
) {
  const trace = {
    promptVersion: 'concierge-security-v2',
    toolName,
    mode: toolMutationMode(toolName),
  };

  // 1. Verify capability token signature + TTL
  const cap = await verifyCapabilityToken(capabilityToken);

  // 2. Verify tool is allowed
  if (!cap.allowed_tools.includes(toolName)) {
    throw new Error(
      `Permission denied: Tool '${toolName}' is not allowed by this capability token.`,
    );
  }

  // 3. Enforce argument constraints (trip_id immutability, IDs belong to trip, etc.)
  // Force the trip_id and user_id to match the capability token, ignoring whatever the model provided.
  const enforcedArgs = enforceToolSchema(toolName, { ...args });
  const strictValidation = validateToolArgsStrict(toolName, enforcedArgs);
  if (!strictValidation.ok) {
    return {
      success: false,
      error: `Invalid tool arguments: ${strictValidation.errors.join('; ')}`,
      confidence: 'low',
      fail_closed: true,
      trace,
    };
  }

  if (enforcedArgs.trip_id && enforcedArgs.trip_id !== cap.trip_id) {
    console.warn(
      `[Security] LLM attempted to use trip_id ${enforcedArgs.trip_id}, forcing capability trip_id ${cap.trip_id}`,
    );
  }
  enforcedArgs.trip_id = cap.trip_id; // Explicitly override

  // Destructive writes AND non-destructive mutations whose contract promises confirmation
  // require an explicit human confirmation gate before any write.
  if (requiresConfirmationGate(toolName) && enforcedArgs.confirmation_gate !== true) {
    const destructive = DESTRUCTIVE_MUTATION_ALLOWLIST.has(toolName);
    return {
      success: false,
      error: destructive
        ? `Tool "${toolName}" requires explicit confirmation before destructive mutation`
        : `Tool "${toolName}" requires explicit user confirmation before applying changes`,
      pending_confirmation: true,
      confidence: 'low',
      fail_closed: true,
      rollback_path:
        'No mutation performed; request user confirmation and retry with confirmation_gate=true.',
      trace,
    };
  }

  // 4. Execute the tool
  const result = await executeFunctionCall(
    supabase,
    toolName,
    enforcedArgs,
    cap.trip_id,
    cap.user_id,
    locationContext,
  );

  // 5. Normalize + sanitize output before it is shown to users or fed back to the model.
  const normalized = normalizeToolResult(toolName, redactSensitiveFields(result));
  return sanitizeToolOutput(toolName, {
    ...normalized,
    trace,
    rollback_path:
      normalized.success === true
        ? 'For pending writes: reject in trip_pending_actions. For promoted/direct writes: revert via matching delete/update tool.'
        : 'No mutation committed.',
  });
}

function sanitizeToolOutput(toolName: string, result: any): any {
  if (!result) return result;

  if (result.error) {
    // Basic error redaction if necessary
    return { error: result.error };
  }

  // Copy result to avoid mutating original
  const sanitized = JSON.parse(JSON.stringify(result));

  // Redact PII or sensitive info based on tool and returned data
  if (sanitized.event) {
    delete sanitized.event.created_by;
    delete sanitized.event.trip_id; // Implicit from context
  }
  if (sanitized.task) {
    delete sanitized.task.creator_id;
    delete sanitized.task.trip_id;
  }
  if (sanitized.poll) {
    delete sanitized.poll.created_by;
    delete sanitized.poll.trip_id;
  }
  if (sanitized.link) {
    delete sanitized.link.added_by;
    delete sanitized.link.trip_id;
  }

  // If a tool returns users/members, strip out emails and phone numbers.
  // This ensures they don't leak into the LLM context.
  if (sanitized.users && Array.isArray(sanitized.users)) {
    sanitized.users = sanitized.users.map((u: any) => ({
      id: u.id,
      display_name: u.display_name || u.first_name,
      role: u.role,
      // omitted: email, phone_number, etc.
    }));
  }

  return sanitized;
}
