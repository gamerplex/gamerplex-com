/**
 * Xirtameht: SensorySystem.js
 * 
 * REDESIGN: PURE SYSTEM
 * No side-effects in constructor. 
 * AI agents use specific static methods to "inject" logic into existing scenes.
 */

export class SensorySystem {
    /**
     * Applies an atmospheric "Vibe" without overwriting the entire scene.
     * @param {BABYLON.Scene} scene 
     * @param {string} vibe - e.g., "NOIR", "REZ", "NEON"
     */
    static applyAtmosphere(scene, vibe) {
        if (!scene) return;
        
        // Use an existing glow layer or create one only if missing
        let glow = scene.getEffectLayerByName("xirtameht-glow");
        if (!glow) {
            glow = new BABYLON.GlowLayer("xirtameht-glow", scene);
        }

        switch (vibe) {
            case "NOIR":
                scene.fogEnabled = true;
                scene.fogDensity = 0.05;
                glow.intensity = 0.5;
                break;
            case "REZ":
                scene.fogEnabled = false;
                glow.intensity = 1.5;
                break;
            default:
                glow.intensity = 1.0;
        }
    }

    /**
     * Creates a standardized architect grid based on the manifest.
     * @param {BABYLON.Scene} scene 
     */
    static injectCoordinateGrid(scene) {
        const grid = BABYLON.MeshBuilder.CreateGround("vibe-grid", {width: 5000, height: 5000, subdivisions: 100}, scene);
        const gridMat = new BABYLON.StandardMaterial("xirtameht-grid-mat", scene);
        gridMat.emissiveColor = new BABYLON.Color3(0, 1, 0);
        gridMat.wireframe = true;
        gridMat.disableLighting = true;
        grid.material = gridMat;
        return grid;
    }
}
