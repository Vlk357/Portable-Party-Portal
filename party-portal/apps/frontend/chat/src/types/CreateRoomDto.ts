export interface CreateRoomDto {
  name: string;
  description?: string;
  users: number[];
}