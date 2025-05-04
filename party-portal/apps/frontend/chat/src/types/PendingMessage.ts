export interface PendingMessage {
  tempId: number;
  chat_room_id: number;
  user_id: number | null; // The sender's ID
  content: string;
  created_at: Date; // Timestamp when the user tried to send
  status: 'pending' | 'failed'; // Status of the message
}