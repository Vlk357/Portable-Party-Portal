import { BackendMessage } from "./BackendMessage";

export interface BackendRoom {
    id: number;
    name: string;
    description: string;
    created_at: Date;
    created_by_user_id: number;
    deleted_at: Date | null;
    deleted_by_user_id: number | null;
    userCount: number,
    messages: BackendMessage[];
}