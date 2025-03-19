<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'login_log')]
class LoginLog
{
    #[ORM\Id]
    #[ORM\GeneratedValue(strategy: 'IDENTITY')]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'user_id', referencedColumnName: 'id', nullable: false)]
    private User $user;

    #[ORM\Column(name: 'ip_address', length: 45)]
    private string $ipAddress;

    #[ORM\Column(name: 'logged_at', type: 'datetime_immutable', insertable: false, updatable: false, options: ['default' => 'CURRENT_TIMESTAMP'])]
    private \DateTimeImmutable $loggedAt;

    #[ORM\Column(type: 'boolean')]
    private bool $success;

    #[ORM\Column(name: 'failure_reason', type: 'text', nullable: true)]
    private ?string $failureReason;

    #[ORM\Column(name: 'user_agent', type: 'text', nullable: true)]
    private ?string $userAgent;

    public function __construct(
        User $user,
        string $ipAddress,
        bool $success,
        ?string $failureReason = null,
        ?string $userAgent = null
    ) {
        $this->user = $user;
        $this->ipAddress = $ipAddress;
        $this->success = $success;
        $this->failureReason = $failureReason;
        $this->userAgent = $userAgent;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUser(): User
    {
        return $this->user;
    }

    public function getIpAddress(): string
    {
        return $this->ipAddress;
    }

    public function getLoggedAt(): \DateTimeImmutable
    {
        return $this->loggedAt;
    }

    public function isSuccess(): bool
    {
        return $this->success;
    }

    public function getFailureReason(): ?string
    {
        return $this->failureReason;
    }

    public function getUserAgent(): ?string
    {
        return $this->userAgent;
    }

    /**
     * @param array{
     *   id: int,
     *  user: User,
     * ipAddress: string,
     * loggedAt: \DateTimeImmutable,
     * success: bool,
     * failureReason: ?string,
     * userAgent: ?string
     * } $data
     * @return void
     */
    public function __unserialize(array $data)
    {
        $this->id = $data['id'];
        $this->user = $data['user'];
        $this->ipAddress = $data['ipAddress'];
        $this->loggedAt = $data['loggedAt'];
        $this->success = $data['success'];
        $this->failureReason = $data['failureReason'];
        $this->userAgent = $data['userAgent'];
    }
}