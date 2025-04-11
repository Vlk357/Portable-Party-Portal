<?php
// src/Entity/RefreshToken.php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Gesdinet\JWTRefreshTokenBundle\Entity\RefreshToken as BaseRefreshToken;

#[ORM\Entity]
#[ORM\Table(name: "refresh_tokens")]
class RefreshToken extends BaseRefreshToken
{
    // The base class already has all the required fields and methods
}