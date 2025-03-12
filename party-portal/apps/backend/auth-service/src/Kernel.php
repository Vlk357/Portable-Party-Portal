<?php

namespace App;

use Symfony\Bundle\FrameworkBundle\Kernel\MicroKernelTrait;
use Symfony\Component\HttpKernel\Kernel as BaseKernel;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use App\Service\PasswordService;

class Kernel extends BaseKernel
{
    use MicroKernelTrait;

    public function boot(): void
    {
        parent::boot();

        if (!$this->container) {
            throw new \RuntimeException('Container is not initialized');
        }

        $hasher = $this->container->get('security.user_password_hasher');
        if (!$hasher instanceof UserPasswordHasherInterface) {
            throw new \RuntimeException('Invalid password hasher service');
        }

        PasswordService::initialize($hasher);
    }
}