export class RailSlideKinetic {
    constructor(scene, parent) {
        this.scene = scene;
        this.parent = parent;
        this.xOff = 0;
        this.yOff = 0;
        this.inputMap = {};
        this.init();
    }

    init() {
        this.mesh = new BABYLON.TransformNode("kinetic-entity", this.scene);
        this.mesh.parent = this.parent;

        const deck = BABYLON.MeshBuilder.CreateBox("deck", {width: 15, height: 2, depth: 40}, this.scene);
        deck.parent = this.mesh;
        const mat = new BABYLON.PBRMaterial("cm", this.scene);
        mat.albedoColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        mat.emissiveColor = new BABYLON.Color3(0, 0.5, 1);
        mat.metallic = 1.0; mat.roughness = 0.2;
        deck.material = mat;

        const tower = BABYLON.MeshBuilder.CreateBox("tower", {width: 4, height: 8, depth: 10}, this.scene);
        tower.parent = this.mesh; tower.position.set(4, 5, -5);
        tower.material = mat;

        // Input registration
        this.scene.actionManager = new BABYLON.ActionManager(this.scene);
        this.scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyDownTrigger, (evt) => {
            this.inputMap[evt.sourceEvent.key.toLowerCase()] = true;
        }));
        this.scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyUpTrigger, (evt) => {
            this.inputMap[evt.sourceEvent.key.toLowerCase()] = false;
        }));
    }

    update() {
        if(this.inputMap["a"]) this.xOff -= 1.8;
        if(this.inputMap["d"]) this.xOff += 1.8;
        if(this.inputMap["w"]) this.yOff += 1.5;
        if(this.inputMap["s"]) this.yOff -= 1.5;

        this.xOff *= 0.95;
        this.yOff *= 0.95;

        this.mesh.position.x = BABYLON.Scalar.Lerp(this.mesh.position.x, this.xOff, 0.1);
        this.mesh.position.y = BABYLON.Scalar.Lerp(this.mesh.position.y, this.yOff, 0.1);
        this.mesh.rotation.z = -this.mesh.position.x * 0.02;
    }

    getPosition() {
        return this.mesh.position;
    }
}
