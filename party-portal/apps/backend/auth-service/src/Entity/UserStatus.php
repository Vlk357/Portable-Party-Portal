<?php

namespace App\Entity;

enum UserStatus: string
{
    case ACTIVE = 'ACTIVE';
    case SUSPENDED = 'SUSPENDED';
    case LOCKED = 'LOCKED';
    case PENDING_ACTIVATION = 'PENDING_ACTIVATION';
}
