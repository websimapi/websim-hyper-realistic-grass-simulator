import * as THREE from 'three';

const VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vWorldPosition;
varying float vHeight;

uniform float uTime;
uniform vec3 uInteractors[16];
uniform int uInteractorCount;

// Simplex noise function
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

void main() {
    vUv = uv;
    
    // Instance matrix transform
    vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
    
    // Wind Effect
    float windStrength = 0.5; // Base wind
    float noise = snoise(worldPosition.xz * 0.1 + uTime * 0.5);
    float angle = noise * 0.5; 
    
    // Interaction Bending
    vec3 bendOffset = vec3(0.0);
    float interactStrength = 0.0;
    
    for(int i = 0; i < 16; i++) {
        if(i >= uInteractorCount) break;
        vec3 interactor = uInteractors[i];
        float dist = distance(worldPosition.xz, interactor.xz);
        float radius = 1.0;
        float falloff = 1.0 - smoothstep(0.0, radius, dist);
        
        if(falloff > 0.0) {
            vec2 dir = normalize(worldPosition.xz - interactor.xz);
            // Height check - only bend if interactor is low enough
            float heightFactor = 1.0 - smoothstep(0.0, 1.5, interactor.y); 
            bendOffset.xz += dir * falloff * 2.0 * heightFactor;
            bendOffset.y -= falloff * 1.5 * heightFactor;
            interactStrength += falloff * heightFactor;
        }
    }

    // Apply bending only to top vertices
    float t = uv.y; // 0 at bottom, 1 at top
    
    // Combine wind and interaction
    // Wind rotation approximation
    float windX = sin(angle) * t * windStrength;
    float windZ = cos(angle) * t * windStrength;
    
    vec3 finalPos = position;
    finalPos.x += windX + bendOffset.x * t;
    finalPos.z += windZ + bendOffset.z * t;
    finalPos.y += bendOffset.y * t * 0.5; // Squish down slightly
    
    worldPosition = instanceMatrix * vec4(finalPos, 1.0);
    
    vWorldPosition = worldPosition.xyz;
    vHeight = t;
    
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const FRAGMENT_SHADER = `
varying vec2 vUv;
varying vec3 vWorldPosition;
varying float vHeight;

void main() {
    // Base colors
    vec3 bottomColor = vec3(0.05, 0.2, 0.0);
    vec3 topColor = vec3(0.2, 0.6, 0.1);
    
    vec3 color = mix(bottomColor, topColor, vHeight);
    
    // Fake lighting
    vec3 sunDir = normalize(vec3(0.5, 1.0, 0.3));
    float diff = max(dot(vec3(0.0, 1.0, 0.0), sunDir), 0.0);
    
    // Specular shine on blades
    float spec = pow(vHeight, 4.0) * 0.2;
    
    color += spec;
    
    // Simple Shadow darkening (fake AO based on height)
    color *= mix(0.2, 1.0, vHeight);
    
    gl_FragColor = vec4(color, 1.0);
}
`;

export class GrassSystem {
    constructor(scene, count = 50000, size = 100) {
        this.scene = scene;
        this.count = count;
        this.size = size;
        this.interactors = [];
        for(let i=0; i<16*3; i++) this.interactors.push(0); // Flattened array
        
        this.init();
    }

    init() {
        // Create grass blade geometry
        const geometry = new THREE.PlaneGeometry(0.1, 1, 1, 4);
        geometry.translate(0, 0.5, 0); // Pivot at bottom
        
        this.material = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0 },
                uInteractors: { value: [] },
                uInteractorCount: { value: 0 }
            },
            side: THREE.DoubleSide,
            vertexColors: false
        });

        this.mesh = new THREE.InstancedMesh(geometry, this.material, this.count);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        const dummy = new THREE.Object3D();
        const rng = () => Math.random();

        for (let i = 0; i < this.count; i++) {
            dummy.position.set(
                (rng() - 0.5) * this.size,
                0,
                (rng() - 0.5) * this.size
            );
            
            dummy.rotation.y = rng() * Math.PI * 2;
            
            // Random scale
            const s = 0.5 + rng() * 1.5;
            dummy.scale.set(s, s * (0.8 + rng() * 0.4), s);
            
            dummy.updateMatrix();
            this.mesh.setMatrixAt(i, dummy.matrix);
        }

        this.scene.add(this.mesh);
    }

    update(time, interactorPoints) {
        this.material.uniforms.uTime.value = time;
        
        // Update interactors uniform
        // ThreeJS uniforms for arrays of vec3 need to be Vector3 objects or flat arrays depending on version/shader
        // Easiest is to pass array of Vector3s
        
        const vec3List = [];
        const max = Math.min(interactorPoints.length, 16);
        
        for(let i=0; i<max; i++) {
            const p = interactorPoints[i];
            vec3List.push(new THREE.Vector3(p.x, p.y, p.z));
        }
        
        this.material.uniforms.uInteractors.value = vec3List;
        this.material.uniforms.uInteractorCount.value = vec3List.length;
    }
}

