import { BackendMessage } from '../types/BackendMessage';

// Optional: Define an interface for the raw message structure if known
interface RawBackendMessage {
  id: number;
  user_id: number;
  chat_room_id: number;
  content: string;
  created_at: string; // Expecting string date
  server_received?: string; // Optional string date
  deleted_at?: string | null; // Optional string date or null
  deleted_by_user_id?: number | null; // Optional user ID or null
  // Add other raw properties if they exist
}

/**
 * Processes a raw message object received from the WebSocket.
 * Converts date strings to Date objects and maps snake_case properties to camelCase.
 *
 * @param rawMsg - The raw message object (expected to have snake_case and string dates).
 * @returns A processed BackendMessage object with Date objects and camelCase properties, or null if processing fails.
 */
export const processRawMessage = (rawMsg: RawBackendMessage): BackendMessage | null => {
  if (!rawMsg || typeof rawMsg.created_at !== 'string') {
    console.error(
      `processRawMessage: Invalid message structure or missing created_at string for msg id ${rawMsg?.id}. Skipping.`,
      rawMsg
    );
    return null;
  }

  try {
    const createdAtDate = new Date(rawMsg.created_at);

    if (isNaN(createdAtDate.getTime())) {
      console.error(
        `processRawMessage: Invalid date conversion for msg ${rawMsg.id}, value: "${rawMsg.created_at}"`
      );
      return null;
    }

    // Map snake_case to camelCase for BackendMessage type
    const processedMessage: BackendMessage = {
      id: rawMsg.id,
      user_id: rawMsg.user_id,
      chat_room_id: rawMsg.chat_room_id,
      content: rawMsg.content,
      created_at: createdAtDate,
      server_received: // Check if server_received exists and is a string before parsing
        rawMsg.server_received && typeof rawMsg.server_received === 'string'
          ? new Date(rawMsg.server_received)
          : createdAtDate, // Fallback to created_at if missing or invalid type
      deleted_at: // Check if deleted_at exists and is a string before parsing
        rawMsg.deleted_at && typeof rawMsg.deleted_at === 'string'
          ? new Date(rawMsg.deleted_at)
          : undefined, // Use undefined if null or missing, matching the interface
      deleted_by_user_id: rawMsg.deleted_by_user_id ?? undefined, // Use nullish coalescing for optional number
    };

    return processedMessage;
  } catch (e) {
    console.error(
      `processRawMessage: Exception during processing for msg ${rawMsg?.id}:`,
      e
    );
    return null;
  }
};