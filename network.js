import { Room } from "https://esm.sh/websim-socket";

export class NetworkManager {
    constructor() {
        this.room = new window.WebsimSocket();
        this.peers = {};
        this.connected = false;
        this.localState = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            headPosition: { x: 0, y: 1.6, z: 0 },
            hands: {
                left: { matrix: null, active: false },
                right: { matrix: null, active: false }
            },
            isVR: false,
            isBending: false,
            animationState: 'idle'
        };
    }

    async init() {
        await this.room.initialize();
        this.connected = true;
        
        this.room.subscribePresence((presence) => {
            // Presence updated automatically
        });
        
        console.log("Multiplayer initialized. Client ID:", this.room.clientId);
    }

    updateLocalPlayer(state) {
        if (!this.connected) return;
        
        // Merge state
        this.localState = { ...this.localState, ...state };
        
        // Broadcast
        this.room.updatePresence(this.localState);
    }

    getPeers() {
        if (!this.connected) return [];
        
        const peerList = [];
        for (const clientId in this.room.peers) {
            if (clientId === this.room.clientId) continue;
            
            const presence = this.room.presence[clientId];
            if (presence) {
                peerList.push({
                    id: clientId,
                    username: this.room.peers[clientId].username,
                    ...presence
                });
            }
        }
        return peerList;
    }
    
    // Get a flat list of interaction points (vec3) for the grass shader
    // Returns [x,y,z, x,y,z, ...]
    getInteractionPoints() {
        const points = [];
        
        // Add self
        if (this.localState.hands.left.active) {
            const p = this.localState.hands.left.position; // assuming position is stored
            if(p) points.push(p);
        }
        if (this.localState.hands.right.active) {
            const p = this.localState.hands.right.position;
            if(p) points.push(p);
        }
        // Add feet/body for local player
        points.push({ x: this.localState.position.x, y: 0, z: this.localState.position.z });

        // Add peers
        const peers = this.getPeers();
        peers.forEach(p => {
            // Feet
            if (p.position) {
                points.push({ x: p.position.x, y: 0, z: p.position.z });
            }
            // Hands (if VR)
            if (p.hands) {
                if (p.hands.left?.active && p.hands.left.position) points.push(p.hands.left.position);
                if (p.hands.right?.active && p.hands.right.position) points.push(p.hands.right.position);
            }
        });

        return points;
    }
}

