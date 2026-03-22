import pygame
import sys

# Initialize Pygame
pygame.init()

# Screen
WIDTH, HEIGHT = 800, 600
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Verilog Logic Hero")

# Colors
WHITE = (255,255,255)
BLACK = (0,0,0)
RED = (255,0,0)
BLUE = (0,0,255)

# Load images
hamza_img = pygame.image.load("hamza.png")  # character sprite
gate_img = pygame.image.load("and_gate.png")  # logic gate sprite
bg_img = pygame.image.load("circuit_bg.png")  # background

# Character position
hamza_x, hamza_y = 100, 400
speed = 5

# Font
font = pygame.font.SysFont('Arial', 24)

# Game loop
running = True
while running:
    screen.fill(WHITE)
    screen.blit(bg_img, (0,0))
    
    # Draw sprites
    screen.blit(hamza_img, (hamza_x, hamza_y))
    screen.blit(gate_img, (500, 400))
    
    # Events
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
    
    # Key press
    keys = pygame.key.get_pressed()
    if keys[pygame.K_LEFT]:
        hamza_x -= speed
    if keys[pygame.K_RIGHT]:
        hamza_x += speed
    if keys[pygame.K_UP]:
        hamza_y -= speed
    if keys[pygame.K_DOWN]:
        hamza_y += speed
    
    # Collision with gate → Show puzzle
    if pygame.Rect(hamza_x, hamza_y, hamza_img.get_width(), hamza_img.get_height()).colliderect(
        pygame.Rect(500, 400, gate_img.get_width(), gate_img.get_height())):
        text = font.render("Solve: AND Gate Truth Table!", True, RED)
        screen.blit(text, (200, 50))
    
    pygame.display.update()
    pygame.time.Clock().tick(60)

pygame.quit()
sys.exit()
