<?php

namespace App\Enum;

enum ActionEnum: string
{
    case CREATE = 'CREATE';
    case READ = 'READ';
    case UPDATE = 'UPDATE';
    case DELETE = 'DELETE';
    case MANAGE = 'MANAGE';
}
