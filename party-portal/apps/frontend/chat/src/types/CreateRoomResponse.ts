import { BackendRoom } from "./BackendRoom";

export interface CreateRoomResponse {
  success: boolean;
  room?: BackendRoom;
  error?: string;
  message?: string;
  cause?: any;
}