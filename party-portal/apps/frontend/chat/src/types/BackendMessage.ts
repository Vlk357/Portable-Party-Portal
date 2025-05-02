export interface BackendMessage {
  id: number;
  roomId: number;
  userId: number;
  content: string;
  createdAt: string; // Assuming ISO string format
}