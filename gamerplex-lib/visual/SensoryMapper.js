/**
 * Xirtameht: SensoryMapper.js
 * 
 * Maps Natural Language "Vibes" into high-fidelity atmospheric presets.
 * Controls Fog, Lighting, and Geometric Density.
 */

export class SensoryMapper {
    constructor(scene) {
        this.scene = scene;
        this.init();
    }

    init() {
        this.scene.fogEnabled = false; // Start crystal clear
        this.glow = new BABYLON.GlowLayer("glow", this.scene);
        this.glow.intensity = 1.5;

        this.grid = BABYLON.MeshBuilder.CreateGround("vibe-grid", {width: 5000, height: 100000}, this.scene);
        this.grid.position.y = -100;
        const gridMat = new BABYLON.PBRMaterial("gridMat", this.scene);
        gridMat.emissiveColor = new BABYLON.Color3(0, 0.4, 0.8);
        gridMat.wireframe = true;
        this.grid.material = gridMat;
    }

    applyVibe(vibeIntent) {
        switch (vibeIntent) {
            case "NOIR":
                this.scene.fogEnabled = true;
                this.scene.fogDensity = 0.05;
                this.glow.intensity = 0.5;
                break;
            case "UPSCALE":
                this.scene.fogEnabled = false;
                this.glow.intensity = 2.0;
                break;
            default:
                this.scene.fogEnabled = false;
                this.glow.intensity = 1.5;
        }
    }
}
