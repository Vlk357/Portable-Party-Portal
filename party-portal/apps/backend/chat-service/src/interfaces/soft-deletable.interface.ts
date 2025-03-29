import { HasId } from '../interfaces/has-id.interface';

export interface SoftDeletable extends HasId {
  deleted_at: Date | null;
}
