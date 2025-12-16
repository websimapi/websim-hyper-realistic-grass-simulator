import * as THREE from 'three';

export class AvatarSystem {
    constructor(scene) {
        this.scene = scene;
        this.avatars = {}; // map clientId -> Object3D
    }

    createAvatar(id) {
        const group = new THREE.Group();
        
        // Simple Body
        const mat = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff });
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.2), mat);
        torso.position.y = 1.0;
        torso.name = 'torso';
        
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), mat);
        head.position.y = 1.5;
        head.name = 'head';
        
        // Hands
        const handGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const lHand = new THREE.Mesh(handGeo, mat);
        const rHand = new THREE.Mesh(handGeo, mat);
        lHand.name = 'handL';
        rHand.name = 'handR';
        lHand.visible = false; 
        rHand.visible = false;
        
        group.add(torso, head, lHand, rHand);
        
        this.scene.add(group);
        this.avatars[id] = { group, torso, head, lHand, rHand };
        return this.avatars[id];
    }

    removeAvatar(id) {
        if (this.avatars[id]) {
            this.scene.remove(this.avatars[id].group);
            delete this.avatars[id];
        }
    }

    updatePeers(peerList) {
        const activeIds = new Set();
        
        peerList.forEach(peer => {
            activeIds.add(peer.id);
            let avatar = this.avatars[peer.id];
            if (!avatar) {
                avatar = this.createAvatar(peer.id);
            }
            
            const g = avatar.group;
            
            // Interpolate position for smoothness (simple lerp)
            if (peer.position) {
                g.position.lerp(new THREE.Vector3(peer.position.x, peer.position.y, peer.position.z), 0.1);
            }
            if (peer.rotation) {
                g.rotation.y = peer.rotation.y;
            }

            // Bending animation
            if (peer.isBending) {
                avatar.torso.rotation.x = THREE.MathUtils.lerp(avatar.torso.rotation.x, Math.PI / 4, 0.1);
                avatar.head.rotation.x = THREE.MathUtils.lerp(avatar.head.rotation.x, -Math.PI / 4, 0.1);
                // Lower torso slightly
                avatar.torso.position.y = THREE.MathUtils.lerp(avatar.torso.position.y, 0.8, 0.1);
            } else {
                avatar.torso.rotation.x = THREE.MathUtils.lerp(avatar.torso.rotation.x, 0, 0.1);
                avatar.head.rotation.x = THREE.MathUtils.lerp(avatar.head.rotation.x, 0, 0.1);
                avatar.torso.position.y = THREE.MathUtils.lerp(avatar.torso.position.y, 1.0, 0.1);
            }
            
            // VR Hands
            if (peer.hands) {
                if (peer.hands.left && peer.hands.left.active) {
                    avatar.lHand.visible = true;
                    avatar.lHand.position.set(peer.hands.left.position.x, peer.hands.left.position.y, peer.hands.left.position.z);
                    g.worldToLocal(avatar.lHand.position); // Convert world pos back to local relative to group if group moved? 
                    // Wait, group is at player pos. Hands are usually absolute world pos in VR.
                    // Better approach: Set hands in world space
                    avatar.lHand.position.copy(peer.hands.left.position);
                    avatar.lHand.rotation.setFromQuaternion(new THREE.Quaternion().fromArray(peer.hands.left.quaternion || [0,0,0,1]));
                    // Detach hands from group logic effectively by reverting group transform or just put them in scene separately. 
                    // For simplicity, we keep them in group but apply inverse group matrix? 
                    // Actually, let's just use the group for the body and override hands world pos
                } else {
                    avatar.lHand.visible = false;
                }
                
                if (peer.hands.right && peer.hands.right.active) {
                    avatar.rHand.visible = true;
                    avatar.rHand.position.copy(peer.hands.right.position);
                } else {
                    avatar.rHand.visible = false;
                }
            }
        });

        // Cleanup disconnected
        for (const id in this.avatars) {
            if (!activeIds.has(id)) {
                this.removeAvatar(id);
            }
        }
    }
}

