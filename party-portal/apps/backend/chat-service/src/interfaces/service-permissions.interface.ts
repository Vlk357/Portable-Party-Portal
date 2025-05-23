import { RoleDTO } from './role-dto.interface';
import { AbilityDTO } from './ability-dto.interface';
import { UserDTO } from './user-dto.interface';

export interface ServicePermissions {
  roles: RoleDTO[];
  abilities: AbilityDTO[];
  users: UserDTO[];
}
