import { Ability } from './ability.interface';

export interface Role {
  id: number;
  name: string;
  description?: string | null;
  abilities: Ability[];
}
