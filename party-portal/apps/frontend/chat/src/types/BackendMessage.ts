export interface BackendMessage {
  id: number;
  chat_room_id: number;
  user_id: number;
  content: string;
  created_at: Date;
  server_received: Date;
  deleted_at?: Date;
  deleted_by_user_id?: number;
}