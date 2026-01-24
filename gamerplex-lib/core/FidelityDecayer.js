/**
 * Xirtameht: FidelityDecayer.js
 * 
 * The core logic for sector hibernation and reality upscaling.
 * Manages the transition between Vector/LiDAR (low-fidelity) and WebGPU Ultra (100x fidelity) 
 * based on Attention Weighted by Stake (AWS).
 */

export class FidelityDecayer {
    constructor(scene, hud, mcpBridge) {
        this.scene = scene;
        this.hud = hud;
        this.mcpBridge = mcpBridge;
        
        this.awsThreshold = 500.0; // AWS required for 100x Fidelity
        this.isHibernating = false;
        
        console.log("XIRTAMEHT_CORE: FIDELITY_DECAYER_INITIALIZED");
    }

    update(currentAWS) {
        if (currentAWS < this.awsThreshold && !this.isHibernating) {
            this._enterHibernation();
        } else if (currentAWS >= this.awsThreshold && this.isHibernating) {
            this._triggerUpscale();
        }
    }

    _enterHibernation() {
        console.log("FIDELITY_DECAY: UNOSERVED_SECTOR_HIBERNATING");
        this.isHibernating = true;
        this.hud.showHibernationWarning();

        // 1. Decimate non-essential meshes (Simulation)
        this.scene.fogDensity = 0.05; // Dense fog to hide "dead" reality
        
        // 2. Disable high-fidelity FX
        const glow = this.scene.getLayerByName("glow");
        if (glow) glow.intensity = 0.2;

        // 3. Inform MCP Bridge to throttle agent calls
        this.mcpBridge.processMCPCall({
            method: "xirtameht.broadcast_vibe",
            params: { intent: "HIBERNATE_MODE" },
            agentId: "KERNEL",
            attentionWeight: 1.0
        });
    }

    _triggerUpscale() {
        console.log("REALITY_UPSCALE: HIGH_VALUE_ATTENTION_DETECTED");
        this.isHibernating = false;
        
        // 1. Reset atmosphere
        this.scene.fogDensity = 0.0012;
        
        // 2. Re-enable 100x Fidelity FX
        const glow = this.scene.getLayerByName("glow");
        if (glow) glow.intensity = 1.8;

        // 3. Clear HUD warnings
        const hudEl = document.getElementById("xirtameht-hud");
        if(hudEl) {
            hudEl.style.border = "none";
            // Remove the warning text if it exists
            const warns = hudEl.querySelectorAll('div');
            warns.forEach(w => { if(w.innerText.includes("HIBERNATING")) w.remove(); });
        }
    }
}
