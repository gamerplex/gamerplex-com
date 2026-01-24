export class GPUComputeSwarm {
    constructor(scene, count) {
        this.scene = scene;
        this.count = count;
        this.entities = [];
        this.init();
    }

    init() {
        this.mesh = BABYLON.MeshBuilder.CreatePolyhedron("entity-boid", {type: 0, size: 0.5}, this.scene);
        this.mesh.isVisible = false;
        this.matrixData = new Float32Array(16 * this.count);
        this.mesh.thinInstanceSetBuffer("matrix", this.matrixData, 16);
        
        const mat = new BABYLON.StandardMaterial("boidMat", this.scene);
        mat.emissiveColor = new BABYLON.Color3(0, 1, 1);
        this.mesh.material = mat;

        for(let i=0; i<this.count; i++) {
            this.entities.push({
                pos: new BABYLON.Vector3(0,0,0),
                target: new BABYLON.Vector3(0,0,0)
            });
        }
    }

    update(centerPos, behaviorMode, time) {
        for (let i = 0; i < this.count; i++) {
            const e = this.entities[i];
            if (behaviorMode === "AGGRESSIVE") {
                const angle = (i / this.count) * Math.PI * 2 + time;
                e.target.set(centerPos.x + Math.cos(angle) * 40, centerPos.y + Math.sin(angle * 2) * 20, -10);
            } else {
                const hIndex = i / this.count;
                e.target.set(centerPos.x + Math.sin(hIndex * 30 + time) * 20, centerPos.y + hIndex * 200 - 30, -60 + Math.cos(hIndex * 30 + time) * 20);
            }
            e.pos = BABYLON.Vector3.Lerp(e.pos, e.target, 0.08);
            const matrix = BABYLON.Matrix.Translation(e.pos.x, e.pos.y, e.pos.z);
            matrix.copyToArray(this.matrixData, i * 16);
        }
        this.mesh.thinInstanceBufferUpdated("matrix");
    }
}
