// src/entities/ability.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  Index,
} from 'typeorm';
import { ActionEnum } from '../enums/action.enum';
import { ModuleEnum } from '../enums/module.enum';
import { UserAbility } from './user-ability.entity';
import { RoleAbility } from './role-ability.entity';
import { ResourceEnum } from 'src/enums/resource.enum';

@Entity('abilities')
@Index(
  'UQ_ability_module_resource_action_constraint_not_null', // Explicit index name
  ['module', 'resource', 'action', 'resourceConstraint'],
  {
    unique: true,
    where: '"resourceConstraint" IS NOT NULL', // Partial index condition
  },
)
// Index for null constraints: Ensures uniqueness when resourceConstraint is NULL
@Index(
  'UQ_ability_module_resource_action_constraint_null', // Explicit index name
  ['module', 'resource', 'action'], // resourceConstraint is implicitly NULL here
  {
    unique: true,
    where: '"resourceConstraint" IS NULL', // Partial index condition
  },
)
export class Ability {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: ModuleEnum, default: ModuleEnum.CHAT })
  module: ModuleEnum;

  @Column({ type: 'enum', enum: ResourceEnum })
  resource: ResourceEnum;

  @Column({ type: 'int', nullable: true })
  resourceConstraint: number | null;

  @Column({ type: 'enum', enum: ActionEnum })
  action: ActionEnum;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @OneToMany(() => UserAbility, (userAbility) => userAbility.ability)
  userAbilities: UserAbility[];

  @OneToMany(() => RoleAbility, (roleAbility) => roleAbility.ability)
  roleAbilities: RoleAbility[];

  toPermissionString(): string {
    return `${this.module}:${this.resource}:${this.action}${
      this.resourceConstraint ? ':' + this.resourceConstraint : ''
    }`;
  }
}
