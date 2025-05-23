export interface CreateRoomPayload {
  name: string;
  description?: string;
  users: number[];
}