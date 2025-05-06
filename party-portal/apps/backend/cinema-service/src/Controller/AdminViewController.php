<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class AdminViewController extends AbstractController
{
    #[Route('/admin/panel', name: 'admin_panel')]
    public function adminPanel(): Response
    {
        // Try to load the admin HTML directly
        $adminPanelPath = __DIR__ . '/../../public/admin/index.html';
        
        if (file_exists($adminPanelPath)) {
            $content = file_get_contents($adminPanelPath);
            return new Response($content, Response::HTTP_OK, ['Content-Type' => 'text/html']);
        }
        
        // Fallback if file doesn't exist
        return new Response(
            '<html><body>
                <h1>Cinema Admin Panel</h1>
                <p>The admin panel file could not be found.</p>
                <p>Path checked: ' . $adminPanelPath . '</p>
            </body></html>',
            Response::HTTP_OK,
            ['Content-Type' => 'text/html']
        );
    }
}