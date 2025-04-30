// src/entities/ability.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { ActionEnum } from '../enums/action.enum';
import { ModuleEnum } from '../enums/module.enum';
import { UserAbility } from './user-ability.entity';
import { RoleAbility } from './role-ability.entity';
import { ResourceEnum } from 'src/enums/resource.enum';

@Entity('abilities')
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
