import { Entity, Column, ManyToOne, PrimaryColumn, JoinColumn } from 'typeorm';
import { Ability } from './ability.entity';

// user-ability.entity.ts
@Entity('user_abilities')
export class UserAbility {
  @PrimaryColumn()
  userId: number; // We only store IDs since we don't have User table

  @ManyToOne(() => Ability, (ability) => ability.userAbilities)
  @JoinColumn({ name: 'ability_id' })
  ability: Ability;

  @PrimaryColumn({ name: 'ability_id' })
  abilityId: number;

  @Column({ name: 'expires_at', nullable: true })
  expiresAt: Date | null;
}
