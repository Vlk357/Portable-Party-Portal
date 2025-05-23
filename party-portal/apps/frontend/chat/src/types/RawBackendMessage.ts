export interface RawBackendMessage {
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