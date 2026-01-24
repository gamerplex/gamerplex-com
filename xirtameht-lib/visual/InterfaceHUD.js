/**
 * Xirtameht: UniversalInterface.js
 * 
 * A cross-genre visual interface for the Attention-Value Calculus.
 * Displays Q-Proof (Focus), AWS (Stake Multiplier), and Reward Kickbacks.
 */

export class UniversalInterface {
    constructor(scene) {
        this.scene = scene;
        this.container = null;
        this.qGauge = null;
        this.awsReadout = null;
        this.rewardLog = null;
        this.vibeBar = null;

        this._createUI();
    }

    _createUI() {
        // Create an HTML overlay for the HUD
        this.container = document.createElement("div");
        this.container.id = "xirtameht-hud";
        this.container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            font-family: 'Courier New', Courier, monospace;
            color: #00ffcc;
            text-shadow: 0 0 10px #00ffcc;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 20px;
            box-sizing: border-box;
            z-index: 100;
        `;

        // 1. Vibe Bar (Top Center)
        this.vibeBar = document.createElement("div");
        this.vibeBar.style.cssText = `
            align-self: center;
            background: rgba(0, 255, 204, 0.1);
            border: 1px solid #00ffcc;
            padding: 10px 40px;
            text-transform: uppercase;
            letter-spacing: 2px;
            font-weight: bold;
        `;
        this.vibeBar.innerHTML = "VIBE: ANALYZING_SHARD...";
        this.container.appendChild(this.vibeBar);

        // Middle Row (Center)
        const middleRow = document.createElement("div");
        middleRow.style.cssText = "display: flex; justify-content: space-between; align-items: center; flex: 1;";

        // 2. Reward Log (Left)
        this.rewardLog = document.createElement("div");
        this.rewardLog.style.cssText = `
            width: 250px;
            height: 150px;
            overflow: hidden;
            display: flex;
            flex-direction: column-reverse;
            font-size: 12px;
            opacity: 0.8;
        `;
        middleRow.appendChild(this.rewardLog);

        // 3. Q-Gauge (Center-Bottom Logic but managed here)
        this.qGauge = document.createElement("div");
        this.qGauge.style.cssText = `
            width: 150px;
            height: 150px;
            border-radius: 50%;
            border: 4px double #00ffcc;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            animation: pulse 2s infinite ease-in-out;
        `;
        this.qGauge.innerHTML = `
            <div style="font-size: 10px;">FOCUS_Q</div>
            <div id="q-value" style="font-size: 24px; font-weight: bold;">0.00</div>
            <div id="q-status" style="font-size: 10px; margin-top: 5px; opacity: 0.8;">SCANNING...</div>
        `;
        // Add pulse and aura animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0% { box-shadow: 0 0 5px #00ffcc; transform: scale(1); }
                50% { box-shadow: 0 0 20px #00ffcc; transform: scale(1.05); }
                100% { box-shadow: 0 0 5px #00ffcc; transform: scale(1); }
            }
            @keyframes lockedAura {
                0% { box-shadow: 0 0 20px #fff, 0 0 40px #fff; border-color: #fff; transform: scale(1.1); }
                50% { box-shadow: 0 0 40px #fff, 0 0 80px #fff; border-color: #fff; transform: scale(1.15); }
                100% { box-shadow: 0 0 20px #fff, 0 0 40px #fff; border-color: #fff; transform: scale(1.1); }
            }
            .locked-on {
                animation: lockedAura 0.5s infinite ease-in-out !important;
                color: #fff !important;
                text-shadow: 0 0 20px #fff !important;
            }
        `;
        document.head.appendChild(style);
        
        // AWS readout (Bottom Right)
        this.awsReadout = document.createElement("div");
        this.awsReadout.style.cssText = `
            align-self: flex-end;
            text-align: right;
            padding: 20px;
        `;
        this.awsReadout.innerHTML = `
            <div style="font-size: 10px; opacity: 0.7;">AWS_MULTIPLIER</div>
            <div id="aws-value" style="font-size: 40px; font-weight: bold;">x0</div>
            <div id="stake-tier" style="font-size: 10px; color: #ff3366; margin-top: 5px;">STAKE_WEIGHT: ANALYZING</div>
        `;

        this.container.appendChild(middleRow);
        
        const bottomRow = document.createElement("div");
        bottomRow.style.cssText = "display: flex; justify-content: center; width: 100%; position: relative;";
        bottomRow.appendChild(this.qGauge);
        
        this.container.appendChild(bottomRow);
        this.container.appendChild(this.awsReadout);

        document.body.appendChild(this.container);
    }

    update(q, aws, rewards = [], tier = "PENDING") {
        const qVal = document.getElementById("q-value");
        const qStatus = document.getElementById("q-status");
        
        if (q >= 0.99) {
            qVal.innerText = "LOCKED ON";
            qVal.style.fontSize = "16px";
            qStatus.innerText = "MAX_STAKE_HARVEST";
            this.qGauge.classList.add("locked-on");
        } else {
            qVal.innerText = q.toFixed(2);
            qVal.style.fontSize = "24px";
            qStatus.innerText = q < 0.3 ? "DECAY_WARNING" : "SCANNING...";
            this.qGauge.classList.remove("locked-on");
        }

        document.getElementById("aws-value").innerText = `x${aws.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
        document.getElementById("stake-tier").innerText = `STAKE_WEIGHT: ${tier}`;

        if (rewards.length > 0) {
            rewards.forEach(r => {
                const entry = document.createElement("div");
                entry.style.color = r.amount > 0 ? "#00ffcc" : "#ff3366";
                entry.innerText = `${r.amount > 0 ? '+' : ''}${r.amount} ${r.type}`;
                this.rewardLog.appendChild(entry);
                if (this.rewardLog.children.length > 8) this.rewardLog.removeChild(this.rewardLog.firstChild);
            });
        }
    }

    setVibe(vibeName) {
        this.vibeBar.innerText = `VIBE: ${vibeName.toUpperCase()}_ACTIVE`;
    }

    showHibernationWarning() {
        this.container.style.border = "2px solid #ff3366";
        const warn = document.createElement("div");
        warn.style.id = "hibernate-msg";
        warn.style.cssText = "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #ff3366; font-size: 24px; font-weight: bold; background: rgba(0,0,0,0.8); padding: 20px;";
        warn.innerText = "FIDELITY DECAY: SECTOR HIBERNATING";
        this.container.appendChild(warn);
    }
}
