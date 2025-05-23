import { Role } from './role.interface';
import { Ability } from './ability.interface';

export interface UserPermissions {
  id: number;
  username: string;
  roles: Role[];
  abilities: Ability[];
}
