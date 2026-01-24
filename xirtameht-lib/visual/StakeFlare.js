/**
 * Xirtameht: StakeFlare.js
 * 
 * Visual emissive trail system representing the user's economic stake.
 * Color and density shift based on wallet net-worth tiers.
 */

export class StakeFlare {
    constructor(scene, parent) {
        this.scene = scene;
        this.parent = parent;
        this.particleSystem = null;
        this.trail = null;

        this._initParticles();
    }

    _initParticles() {
        // Create GPU particle system for the exhaust flare
        this.particleSystem = new BABYLON.GPUParticleSystem("stakeFlare", { capacity: 2000 }, this.scene);
        this.particleSystem.particleTexture = new BABYLON.Texture("https://www.babylonjs.com/assets/flare.png", this.scene);
        
        this.particleSystem.emitter = this.parent;
        this.particleSystem.minEmitBox = new BABYLON.Vector3(-0.5, -0.5, -25);
        this.particleSystem.maxEmitBox = new BABYLON.Vector3(0.5, 0.5, -25);

        this.particleSystem.color1 = new BABYLON.Color4(0, 1, 1, 1);
        this.particleSystem.color2 = new BABYLON.Color4(0, 0.5, 1, 1);
        
        this.particleSystem.minSize = 0.1;
        this.particleSystem.maxSize = 0.5;
        this.particleSystem.minLifeTime = 0.3;
        this.particleSystem.maxLifeTime = 1.0;
        this.particleSystem.emitRate = 500;
        
        this.particleSystem.direction1 = new BABYLON.Vector3(0, 0, -1);
        this.particleSystem.direction2 = new BABYLON.Vector3(0, 0, -1);
        this.particleSystem.minEmitPower = 5;
        this.particleSystem.maxEmitPower = 10;
        
        this.particleSystem.start();
    }

    update(tier) {
        switch (tier) {
            case "ARCHITECT": // Whale (>$1M)
                this.particleSystem.color1 = new BABYLON.Color4(1, 1, 1, 1);
                this.particleSystem.color2 = new BABYLON.Color4(1, 0.5, 0, 1);
                this.particleSystem.emitRate = 2000;
                this.particleSystem.minSize = 0.5;
                this.particleSystem.maxSize = 2.0;
                break;
            case "CONDUCTOR": // (>$10k)
                this.particleSystem.color1 = new BABYLON.Color4(1, 0.8, 0, 1);
                this.particleSystem.color2 = new BABYLON.Color4(1, 0.4, 0, 1);
                this.particleSystem.emitRate = 1200;
                this.particleSystem.minSize = 0.3;
                this.particleSystem.maxSize = 1.0;
                break;
            case "PARTICIPANT": // (>$100)
                this.particleSystem.color1 = new BABYLON.Color4(1, 0, 1, 1);
                this.particleSystem.color2 = new BABYLON.Color4(0.5, 0, 1, 1);
                this.particleSystem.emitRate = 800;
                break;
            default: // OBSERVER (<$100)
                this.particleSystem.color1 = new BABYLON.Color4(0, 1, 1, 1);
                this.particleSystem.color2 = new BABYLON.Color4(0, 0.5, 1, 1);
                this.particleSystem.emitRate = 300;
                this.particleSystem.minSize = 0.1;
                this.particleSystem.maxSize = 0.4;
        }
    }
}
