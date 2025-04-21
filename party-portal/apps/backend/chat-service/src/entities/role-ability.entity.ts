// src/entities/role-ability.entity.ts
import { Entity, Column, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { Role } from './role.entity';
import { Ability } from './ability.entity';

@Entity('role_abilities')
export class RoleAbility {
  @PrimaryColumn({ name: 'role_id' })
  roleId: number;

  @ManyToOne(() => Role, (role) => role.roleAbilities)
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @PrimaryColumn({ name: 'ability_id' })
  abilityId: number;

  @ManyToOne(() => Ability, (ability) => ability.roleAbilities, { eager: true })
  @JoinColumn({ name: 'ability_id' })
  ability: Ability;

  @Column({ name: 'expires_at', nullable: true })
  expiresAt: Date | null;
}
