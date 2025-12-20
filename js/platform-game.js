// Platform Game Visualization for Typing Practice

class PlatformGame {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // Set canvas size
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = 150;

        // Game state
        this.characterX = 50;
        this.characterY = this.canvas.height - 70;
        this.characterWidth = 40;
        this.characterHeight = 50;
        this.progress = 0; // 0 to 1
        this.accuracy = 1; // 0 to 1
        this.avatarImage = null;
        this.finishLineX = this.canvas.width - 80;

        // Animation
        this.isJumping = false;
        this.jumpHeight = 0;
        this.animationFrame = null;

        // Platform elements
        this.platforms = [];
        this.clouds = [];
        this.generateScenery();

        this.draw();
    }

    generateScenery() {
        // Generate platforms
        const numPlatforms = 10;
        for (let i = 0; i < numPlatforms; i++) {
            this.platforms.push({
                x: (this.canvas.width / numPlatforms) * i,
                y: this.canvas.height - 50 + Math.random() * 20 - 10,
                width: this.canvas.width / numPlatforms + 10,
                height: 15
            });
        }

        // Generate clouds
        for (let i = 0; i < 5; i++) {
            this.clouds.push({
                x: Math.random() * this.canvas.width,
                y: 20 + Math.random() * 40,
                width: 60 + Math.random() * 40,
                height: 30
            });
        }
    }

    setAvatar(avatarUrl) {
        this.avatarImage = new Image();
        this.avatarImage.crossOrigin = "anonymous";
        this.avatarImage.src = avatarUrl;
        this.avatarImage.onload = () => {
            this.draw();
        };
    }

    updateProgress(progress, accuracy) {
        // This is called on every update with general stats
        this.progress = progress;
        this.accuracy = accuracy;
        // Don't move here - movement happens in onCorrectKey
    }

    updatePosition(correctKeysCount, totalKeys) {
        // Calculate position based on correct keys only
        if (totalKeys === 0) return;

        const progressRatio = correctKeysCount / totalKeys;
        const distance = this.finishLineX - 50;

        // Character position: start + (distance * progress)
        // With 90% accuracy, progressRatio should be ~0.9, so character reaches finish
        this.characterX = 50 + (distance * progressRatio);

        this.draw();
    }

    onCorrectKey() {
        // Small jump animation
        if (!this.isJumping) {
            this.isJumping = true;
            this.animateJump();
        }
    }

    animateJump() {
        let jumpProgress = 0;
        const jumpDuration = 200; // ms
        const maxJump = 15;
        const startTime = Date.now();

        const jump = () => {
            const elapsed = Date.now() - startTime;
            jumpProgress = elapsed / jumpDuration;

            if (jumpProgress < 1) {
                // Parabolic jump
                this.jumpHeight = Math.sin(jumpProgress * Math.PI) * maxJump;
                this.draw();
                requestAnimationFrame(jump);
            } else {
                this.jumpHeight = 0;
                this.isJumping = false;
                this.draw();
            }
        };

        jump();
    }

    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Beautiful sky gradient (sunset/sunrise theme)
        const skyGradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        skyGradient.addColorStop(0, '#87CEEB'); // Sky blue
        skyGradient.addColorStop(0.5, '#B0E0E6'); // Powder blue
        skyGradient.addColorStop(0.8, '#FFB347'); // Sunset orange
        skyGradient.addColorStop(1, '#FF7F50'); // Coral
        this.ctx.fillStyle = skyGradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw sun with glow
        const sunX = this.canvas.width - 70;
        const sunY = 35;
        const sunGradient = this.ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 30);
        sunGradient.addColorStop(0, '#FFF9E6');
        sunGradient.addColorStop(0.5, '#FFD700');
        sunGradient.addColorStop(1, 'rgba(255, 165, 0, 0.3)');
        this.ctx.fillStyle = sunGradient;
        this.ctx.beginPath();
        this.ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw distant mountains
        this.ctx.fillStyle = 'rgba(106, 90, 205, 0.4)';
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.canvas.height - 55);
        this.ctx.lineTo(this.canvas.width * 0.2, this.canvas.height - 90);
        this.ctx.lineTo(this.canvas.width * 0.5, this.canvas.height - 70);
        this.ctx.lineTo(this.canvas.width * 0.8, this.canvas.height - 95);
        this.ctx.lineTo(this.canvas.width, this.canvas.height - 60);
        this.ctx.lineTo(this.canvas.width, this.canvas.height - 50);
        this.ctx.lineTo(0, this.canvas.height - 50);
        this.ctx.closePath();
        this.ctx.fill();

        // Draw fluffy clouds
        this.clouds.forEach(cloud => {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
            this.ctx.shadowBlur = 10;
            this.ctx.beginPath();
            this.ctx.arc(cloud.x, cloud.y, cloud.width / 3.5, 0, Math.PI * 2);
            this.ctx.arc(cloud.x + cloud.width / 3, cloud.y - 5, cloud.width / 3, 0, Math.PI * 2);
            this.ctx.arc(cloud.x + cloud.width / 1.8, cloud.y, cloud.width / 3.2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        });

        // Draw platforms
        this.ctx.fillStyle = '#4ade80';
        this.platforms.forEach(platform => {
            this.ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
            // Grass texture
            this.ctx.fillStyle = '#22c55e';
            for (let i = 0; i < platform.width; i += 5) {
                this.ctx.fillRect(platform.x + i, platform.y, 2, 3);
            }
            this.ctx.fillStyle = '#4ade80';
        });

        // Draw finish line
        this.ctx.strokeStyle = '#fbbf24';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([10, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.finishLineX, 0);
        this.ctx.lineTo(this.finishLineX, this.canvas.height - 50);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Draw flag at finish
        this.ctx.fillStyle = '#fbbf24';
        this.ctx.beginPath();
        this.ctx.moveTo(this.finishLineX, 10);
        this.ctx.lineTo(this.finishLineX + 30, 25);
        this.ctx.lineTo(this.finishLineX, 40);
        this.ctx.fill();

        // Draw character
        const charY = this.characterY - this.jumpHeight;

        // Character body (simple stick figure with avatar head)
        this.ctx.strokeStyle = '#60a5fa';
        this.ctx.lineWidth = 4;
        this.ctx.lineCap = 'round';

        // Body
        this.ctx.beginPath();
        this.ctx.moveTo(this.characterX + 20, charY + 20);
        this.ctx.lineTo(this.characterX + 20, charY + 35);
        this.ctx.stroke();

        // Arms
        this.ctx.beginPath();
        this.ctx.moveTo(this.characterX + 10, charY + 25);
        this.ctx.lineTo(this.characterX + 30, charY + 25);
        this.ctx.stroke();

        // Legs
        this.ctx.beginPath();
        this.ctx.moveTo(this.characterX + 20, charY + 35);
        this.ctx.lineTo(this.characterX + 15, charY + 50);
        this.ctx.moveTo(this.characterX + 20, charY + 35);
        this.ctx.lineTo(this.characterX + 25, charY + 50);
        this.ctx.stroke();

        // Head (avatar or circle)
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(this.characterX + 20, charY + 10, 15, 0, Math.PI * 2);
        this.ctx.closePath();
        this.ctx.clip();

        if (this.avatarImage && this.avatarImage.complete) {
            this.ctx.drawImage(
                this.avatarImage,
                this.characterX + 5,
                charY - 5,
                30,
                30
            );
        } else {
            this.ctx.fillStyle = '#60a5fa';
            this.ctx.fill();
        }
        this.ctx.restore();

        // Progress bar at top
        const barWidth = this.canvas.width - 100;
        const barX = 50;
        const barY = 10;

        // Progress bar background
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.fillRect(barX, barY, barWidth, 15);

        // Progress bar fill
        const progressColor = this.accuracy >= 0.9 ? '#4ade80' : this.accuracy >= 0.7 ? '#fbbf24' : '#f87171';
        this.ctx.fillStyle = progressColor;
        this.ctx.fillRect(barX, barY, barWidth * this.progress, 15);

        // Progress text
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 12px Inter, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
            `${Math.round(this.progress * 100)}% - ${Math.round(this.accuracy * 100)}% precisión`,
            this.canvas.width / 2,
            barY + 12
        );
    }

    reset() {
        this.characterX = 50;
        this.progress = 0;
        this.accuracy = 1;
        this.jumpHeight = 0;
        this.isJumping = false;
        this.draw();
    }
}
