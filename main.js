import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { GrassSystem } from './grass.js';
import { NetworkManager } from './network.js';
import { AvatarSystem } from './avatar.js';

class App {
    constructor() {
        this.container = document.createElement('div');
        document.body.appendChild(this.container);

        this.clock = new THREE.Clock();

        this.initScene();
        this.initCamera();
        this.initRenderer();
        this.initLights();
        this.initVR();
        this.initControls(); // Desktop controls
        
        this.grass = new GrassSystem(this.scene);
        this.network = new NetworkManager();
        this.avatars = new AvatarSystem(this.scene);
        
        this.network.init();

        this.setupInputs();

        window.addEventListener('resize', this.onWindowResize.bind(this));
        
        this.renderer.setAnimationLoop(this.render.bind(this));
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 10, 50);

        // Ground plane
        const groundGeo = new THREE.PlaneGeometry(200, 200);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a4010, roughness: 1 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    initCamera() {
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
        this.cameraGroup = new THREE.Group(); // Rig for VR/Desktop offset
        this.cameraGroup.add(this.camera);
        this.scene.add(this.cameraGroup);
        
        // Start position
        this.cameraGroup.position.set(0, 0, 2);
        this.camera.position.set(0, 1.6, 0); // Stand height
    }

    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.xr.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        document.getElementById('ui-layer').appendChild(VRButton.createButton(this.renderer));
    }

    initLights() {
        const ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.camera.top = 20;
        dirLight.shadow.camera.bottom = -20;
        dirLight.shadow.camera.left = -20;
        dirLight.shadow.camera.right = 20;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);
    }

    initVR() {
        // Controllers
        this.controllers = [];
        const controllerModelFactory = new XRControllerModelFactory();
        const handModelFactory = new XRHandModelFactory();

        for (let i = 0; i < 2; i++) {
            const controller = this.renderer.xr.getController(i);
            this.cameraGroup.add(controller);
            this.controllers.push(controller);

            const controllerGrip = this.renderer.xr.getControllerGrip(i);
            controllerGrip.add(controllerModelFactory.createControllerModel(controllerGrip));
            this.cameraGroup.add(controllerGrip);

            // Hand Tracking
            const hand = this.renderer.xr.getHand(i);
            hand.add(handModelFactory.createHandModel(hand));
            this.cameraGroup.add(hand);
            
            // Store reference for tracking
            controller.userData.hand = hand;
        }
    }

    initControls() {
        // Simple Desktop WASD
        this.inputState = {
            forward: false, backward: false, left: false, right: false,
            sprint: false, crouch: false,
            mouseX: 0, mouseY: 0
        };
        this.velocity = new THREE.Vector3();
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        
        document.addEventListener('keydown', (e) => this.onKey(e, true));
        document.addEventListener('keyup', (e) => this.onKey(e, false));
        document.addEventListener('click', () => {
            if(!this.renderer.xr.isPresenting) document.body.requestPointerLock();
        });
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    }
    
    setupInputs() {
        this.onKey = (e, down) => {
            switch(e.code) {
                case 'KeyW': this.inputState.forward = down; break;
                case 'KeyS': this.inputState.backward = down; break;
                case 'KeyA': this.inputState.left = down; break;
                case 'KeyD': this.inputState.right = down; break;
                case 'ShiftLeft': this.inputState.sprint = down; break;
                case 'KeyC': this.inputState.crouch = down; break;
            }
        };
        
        this.onMouseMove = (e) => {
            if(document.pointerLockElement === document.body) {
                this.euler.setFromQuaternion(this.camera.quaternion);
                this.euler.y -= e.movementX * 0.002;
                this.euler.x -= e.movementY * 0.002;
                this.euler.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.euler.x));
                this.camera.quaternion.setFromEuler(this.euler);
            }
        };
    }

    updateDesktopMovement(dt) {
        if(this.renderer.xr.isPresenting) return; // VR handles its own movement (or teleport, but we'll stick to roomscale)

        const speed = this.inputState.sprint ? 10 : 3;
        const direction = new THREE.Vector3();

        if(this.inputState.forward) direction.z -= 1;
        if(this.inputState.backward) direction.z += 1;
        if(this.inputState.left) direction.x -= 1;
        if(this.inputState.right) direction.x += 1;

        direction.applyEuler(new THREE.Euler(0, this.camera.rotation.y, 0));
        direction.normalize().multiplyScalar(speed * dt);

        this.cameraGroup.position.add(direction);

        // Crouch/Bend Logic
        const targetHeight = this.inputState.crouch ? 0.6 : 1.6;
        this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetHeight, dt * 5);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        const dt = this.clock.getDelta();
        const time = this.clock.getElapsedTime();

        this.updateDesktopMovement(dt);

        // Gather local state for network
        const localData = {
            position: { x: this.cameraGroup.position.x, y: this.cameraGroup.position.y, z: this.cameraGroup.position.z },
            rotation: { x: this.camera.rotation.x, y: this.camera.rotation.y, z: this.camera.rotation.z },
            isBending: this.inputState.crouch || (this.renderer.xr.isPresenting && this.camera.position.y < 1.0),
            hands: { left: { active: false }, right: { active: false } }
        };

        // Update Hand tracking data
        if(this.renderer.xr.isPresenting) {
            for(let i=0; i<2; i++) {
                const controller = this.controllers[i];
                if(controller) {
                    const handSide = i === 0 ? 'left' : 'right';
                    const pos = new THREE.Vector3();
                    const quat = new THREE.Quaternion();
                    controller.getWorldPosition(pos);
                    controller.getWorldQuaternion(quat);
                    
                    localData.hands[handSide] = {
                        active: true,
                        position: { x: pos.x, y: pos.y, z: pos.z },
                        quaternion: quat.toArray()
                    };
                }
            }
        }

        // Sync network
        this.network.updateLocalPlayer(localData);
        this.avatars.updatePeers(this.network.getPeers());

        // Update Grass
        const interactors = this.network.getInteractionPoints();
        this.grass.update(time, interactors);
        
        // Loop terrain to fake infinite
        // Snapping ground to camera (optional optimization, omitted for simplicity of multi-user sync)

        this.renderer.render(this.scene, this.camera);
    }
}

new App();

