/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { socket } from '../services/socket';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Environment, Text, OrbitControls, Stars, Float } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ChromaticAberration, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import { Player } from '../types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const TRACK_WIDTH = 1200;
const TRACK_HEIGHT = 850;

// Car physics constants
const ACCELERATION = 0.06;
const MAX_SPEED = 2.4;
const NITRO_SPEED = 4.125;
const NITRO_ACCEL = 0.12;
const FRICTION = 0.97;
const TURN_SPEED = 0.035;
const DRIFT_FACTOR = 0.94;

const THEME_CONFIGS = {
  night_city: {
    bg: '#050505',
    trackColor: '#111',
    neonColor: '#ff00ff',
    fogColor: '#050505',
    ambientIntensity: 0.2,
    bloomIntensity: 1.5,
    starColor: '#ff00ff'
  },
  desert_outpost: {
    bg: '#1a0d00',
    trackColor: '#2a1a0a',
    neonColor: '#ffaa00',
    fogColor: '#1a0d00',
    ambientIntensity: 0.4,
    bloomIntensity: 0.4,
    starColor: '#ffaa00'
  },
  ice_glacier: {
    bg: '#00081a',
    trackColor: '#0a1a2a',
    neonColor: '#00ffff',
    fogColor: '#00081a',
    ambientIntensity: 0.3,
    bloomIntensity: 0.8,
    starColor: '#00ffff'
  }
};

const CAR_CONFIGS = {
  sport: { accel: 0.07, maxSpeed: 2.6, turn: 0.032, grip: 0.95 },
  truck: { accel: 0.05, maxSpeed: 2.1, turn: 0.038, grip: 1.0 },
  classic: { accel: 0.06, maxSpeed: 2.3, turn: 0.04, grip: 0.92 }
};

// Track Geometry
const TRACK_RADIUS = 50; // Slightly narrower for more technical turns
const TRACK_SEGMENTS = [
    { start: {x: 150, y: 500}, end: {x: 450, y: 500}, angle: 0 },
    { start: {x: 450, y: 500}, end: {x: 450, y: 300}, angle: -Math.PI/2 },
    { start: {x: 450, y: 300}, end: {x: 300, y: 300}, angle: Math.PI },
    { start: {x: 300, y: 300}, end: {x: 300, y: 100}, angle: -Math.PI/2 },
    { start: {x: 300, y: 100}, end: {x: 750, y: 100}, angle: 0 },
    { start: {x: 750, y: 100}, end: {x: 750, y: 400}, angle: Math.PI/2 },
    { start: {x: 750, y: 400}, end: {x: 600, y: 400}, angle: Math.PI },
    { start: {x: 600, y: 400}, end: {x: 600, y: 600}, angle: Math.PI/2 },
    { start: {x: 600, y: 600}, end: {x: 950, y: 600}, angle: 0 },
    { start: {x: 950, y: 600}, end: {x: 950, y: 150}, angle: -Math.PI/2 },
    { start: {x: 950, y: 150}, end: {x: 1100, y: 150}, angle: 0 },
    { start: {x: 1100, y: 150}, end: {x: 1100, y: 750}, angle: Math.PI/2 },
    { start: {x: 1100, y: 750}, end: {x: 150, y: 750}, angle: Math.PI },
    { start: {x: 150, y: 750}, end: {x: 150, y: 500}, angle: -Math.PI/2 }
];

// Math helpers for collision
function getClosestPointOnSegment(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
  if (l2 === 0) return v;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
}

function distToSegmentSquared(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
  if (l2 === 0) return (p.x - v.x)**2 + (p.y - v.y)**2;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (p.x - (v.x + t * (w.x - v.x)))**2 + (p.y - (v.y + t * (w.y - v.y)))**2;
}

function distToSegment(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  return Math.sqrt(distToSegmentSquared(p, v, w));
}

const isPointOnTrackMath = (x: number, y: number, buffer: number = 0): boolean => {
  const p = {x, y};
  let minDist = Infinity;
  
  for (const seg of TRACK_SEGMENTS) {
    const d = distToSegment(p, seg.start, seg.end);
    if (d < minDist) minDist = d;
  }

  return minDist <= (TRACK_RADIUS + buffer);
};

// 3D Components
const CarModel = ({ color, isLocal, drifting, type = 'sport' }: { color: string, isLocal?: boolean, drifting?: boolean, type?: string }) => {
  return (
    <group scale={[2.2, 2.2, 2.2]}>
      {/* Chassis */}
      {type === 'sport' && (
        <>
            <mesh position={[0, 0.4, 0]} castShadow>
                <boxGeometry args={[2.2, 0.6, 4.5]} />
                <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0.8, -0.4]} castShadow>
                <boxGeometry args={[1.8, 0.5, 2]} />
                <meshStandardMaterial color="#111" metalness={0.9} />
            </mesh>
            <mesh position={[0, 1.1, 1.8]} rotation={[-0.4, 0, 0]}>
                <boxGeometry args={[2.2, 0.1, 0.8]} />
                <meshStandardMaterial color={color} />
            </mesh>
        </>
      )}

      {type === 'truck' && (
        <>
            <mesh position={[0, 0.8, 0]} castShadow>
                <boxGeometry args={[2.5, 1.2, 4.8]} />
                <meshStandardMaterial color={color} metalness={0.4} roughness={0.6} />
            </mesh>
            <mesh position={[0, 1.8, 0.8]} castShadow>
                <boxGeometry args={[2.2, 0.8, 2]} />
                <meshStandardMaterial color="#222" />
            </mesh>
            <mesh position={[0, 1.2, -1.8]}>
                <boxGeometry args={[2.5, 0.6, 1]} />
                <meshStandardMaterial color={color} />
            </mesh>
        </>
      )}

      {type === 'classic' && (
        <>
            <mesh position={[0, 0.5, 0]} castShadow>
                <boxGeometry args={[2, 0.8, 4.2]} />
                <meshStandardMaterial color={color} metalness={0.5} roughness={0.5} />
            </mesh>
            <mesh position={[0, 1.2, 0]} castShadow>
                <sphereGeometry args={[1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#333" transparent opacity={0.8} />
            </mesh>
            <mesh position={[0, 0.4, 2.2]}>
                <cylinderGeometry args={[1, 1, 0.4, 32]} rotation={[Math.PI / 2, 0, 0]} />
                <meshStandardMaterial color={color} />
            </mesh>
        </>
      )}

      {/* Common Wheels */}
      {[
        [1.2, 0.3, 1.4], [-1.2, 0.3, 1.4], [1.2, 0.3, -1.4], [-1.2, 0.3, -1.4]
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[type === 'truck' ? 0.6 : 0.4, type === 'truck' ? 0.6 : 0.4, 0.5, 16]} />
          <meshStandardMaterial color="#111" roughness={0.8} />
        </mesh>
      ))}

      {/* Headlights */}
      <group position={[0, 0.5, 2.2]}>
          <mesh position={[0.7, 0, 0]}>
            <sphereGeometry args={[0.2, 8, 8]} />
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={4} />
          </mesh>
          <mesh position={[-0.7, 0, 0]}>
            <sphereGeometry args={[0.2, 8, 8]} />
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={4} />
          </mesh>
      </group>

      {drifting && (
        <group position={[0, 0, -2]}>
            <mesh position={[1, 0, 0]}>
                <sphereGeometry args={[0.4, 8, 8]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.3} />
            </mesh>
            <mesh position={[-1, 0, 0]}>
                <sphereGeometry args={[0.4, 8, 8]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.3} />
            </mesh>
        </group>
      )}

      {/* Nitro Flame */}
      {isLocal && drifting && (
        <group position={[0, 0.4, -2.5]}>
             <mesh>
                 <coneGeometry args={[0.8, 2.5, 8]} rotation={[Math.PI/2, 0, 0]} />
                 <meshBasicMaterial color="#00ffff" transparent opacity={0.6} />
             </mesh>
             <pointLight intensity={20} distance={10} color="#00ffff" />
        </group>
      )}

      {isLocal && (
        <pointLight position={[0, 5, 2]} intensity={20} distance={50} color={color} />
      )}
    </group>
  );
};

const Tree = ({ position, scale = 1 }: { position: [number, number, number], scale?: number }) => {
  return (
    <group position={position} scale={scale}>
      {/* Trunk */}
      <mesh position={[0, 3, 0]} castShadow>
        <cylinderGeometry args={[0.6, 0.8, 6, 8]} />
        <meshStandardMaterial color="#4d2926" />
      </mesh>
      {/* Leaves */}
      <mesh position={[0, 9, 0]} castShadow>
        <coneGeometry args={[4, 10, 8]} />
        <meshStandardMaterial color="#2d5a27" />
      </mesh>
      <mesh position={[0, 13, 0]} castShadow>
        <coneGeometry args={[3, 7, 8]} />
        <meshStandardMaterial color="#3a7532" />
      </mesh>
    </group>
  );
};

const Rock = ({ position, scale = 1 }: { position: [number, number, number], scale?: number }) => {
  return (
    <mesh position={position} scale={scale} castShadow receiveShadow>
      <dodecahedronGeometry args={[1.5, 0]} />
      <meshStandardMaterial color="#666" roughness={0.9} />
    </mesh>
  );
};

const Building = ({ position, scale = [1, 1, 1], color = "#222" }: { position: [number, number, number], scale?: [number, number, number], color?: string }) => {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[10 * scale[0], 20 * scale[1], 10 * scale[2]]} />
        <meshStandardMaterial color="#111" metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Windows/Neon strips */}
      <mesh position={[0, 0, 5.01 * scale[2]]}>
          <planeGeometry args={[8 * scale[0], 18 * scale[1]]} />
          <meshStandardMaterial emissive={color} emissiveIntensity={4} color={color} transparent opacity={0.4} />
      </mesh>
      {/* Top Neon Crown */}
      <mesh position={[0, 10 * scale[1], 0]}>
          <boxGeometry args={[10.5 * scale[0], 0.5, 10.5 * scale[2]]} />
          <meshStandardMaterial emissive={color} emissiveIntensity={8} color={color} />
      </mesh>
    </group>
  );
};

const Billboard = ({ position, rotation = [0, 0, 0], color = "#0ff" }: { position: [number, number, number], rotation?: [number, number, number], color?: string }) => {
    return (
        <group position={position} rotation={rotation}>
            <mesh position={[0, 15, 0]}>
                <boxGeometry args={[12, 8, 1]} />
                <meshStandardMaterial color="#111" />
            </mesh>
            <mesh position={[0, 15, 0.51]}>
                <planeGeometry args={[11, 7]} />
                <meshStandardMaterial emissive={color} emissiveIntensity={5} color={color} />
            </mesh>
            <mesh position={[0, 7.5, 0]}>
                <boxGeometry args={[1, 15, 1]} />
                <meshStandardMaterial color="#333" />
            </mesh>
        </group>
    );
};

const TrackMesh = ({ theme }: { theme: keyof typeof THEME_CONFIGS }) => {
  const config = THEME_CONFIGS[theme];
  const segments = useMemo(() => {
    return TRACK_SEGMENTS.map((seg, i) => {
      const dx = seg.end.x - seg.start.x;
      const dy = seg.end.y - seg.start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const centerX = (seg.start.x + seg.end.x) / 2;
      const centerY = (seg.start.y + seg.end.y) / 2;
      return { length, angle, centerX, centerY, id: i };
    });
  }, []);

  const corners = useMemo(() => {
    return TRACK_SEGMENTS.map((seg) => seg.start);
  }, []);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} scale={[1, -1, 1]}>
      {/* Sub-floor */}
      <mesh position={[TRACK_WIDTH/2, TRACK_HEIGHT/2, -0.2]} receiveShadow>
        <planeGeometry args={[5000, 5000]} />
        <meshStandardMaterial color={config.bg} roughness={1} />
      </mesh>
      
      {/* Track Segments */}
      {segments.map((seg) => (
        <mesh key={seg.id} position={[seg.centerX, seg.centerY, 0.1]} rotation={[0, 0, seg.angle]} receiveShadow>
          <planeGeometry args={[seg.length, TRACK_RADIUS * 2]} />
          <meshStandardMaterial color={config.trackColor} roughness={0.8} />
        </mesh>
      ))}

      {/* Track Borders (Neon) */}
      {segments.map((seg) => (
        <group key={`border-${seg.id}`} position={[seg.centerX, seg.centerY, 0.15]} rotation={[0, 0, seg.angle]}>
            <mesh position={[0, TRACK_RADIUS + 2, 0]}>
                <boxGeometry args={[seg.length, 2, 0.5]} />
                <meshStandardMaterial color={config.neonColor} emissive={config.neonColor} emissiveIntensity={3} />
            </mesh>
            <mesh position={[0, -(TRACK_RADIUS + 2), 0]}>
                <boxGeometry args={[seg.length, 2, 0.5]} />
                <meshStandardMaterial color={config.neonColor} emissive={config.neonColor} emissiveIntensity={3} />
            </mesh>
        </group>
      ))}

      {/* Smooth Corners */}
      {corners.map((pos, i) => (
        <mesh key={i} position={[pos.x, pos.y, 0.1]} receiveShadow>
          <circleGeometry args={[TRACK_RADIUS, 32]} />
          <meshStandardMaterial color="#333" roughness={0.8} />
        </mesh>
      ))}
      
      {/* Start Line */}
      <mesh position={[625, 750, 0.11]} rotation={[0, 0, 0]}>
        <planeGeometry args={[10, TRACK_RADIUS * 2]} />
        <meshStandardMaterial color="white" />
      </mesh>
    </group>
  );
};

const GameScene = ({ 
  localPlayerRef, 
  players, 
  myId,
  theme,
  isOffTrack,
  isSpectator,
  followingId
}: { 
  localPlayerRef: React.MutableRefObject<any>, 
  players: Record<string, Player>, 
  myId: string | null,
  theme: keyof typeof THEME_CONFIGS,
  isOffTrack: boolean,
  isSpectator?: boolean,
  followingId?: string | null
}) => {
  const { camera } = useThree();
  const carRef = useRef<THREE.Group>(null);
  const config = THEME_CONFIGS[theme];
  const shakeRef = useRef(0);
  const prevOffTrack = useRef(false);

  const decorations = useMemo(() => {
    const items: { type: 'tree' | 'rock' | 'building' | 'billboard', pos: [number, number, number], scale: number | [number, number, number], color?: string, rot?: [number, number, number] }[] = [];
    const count = theme === 'night_city' ? 150 : 350; 
    const seed = 42;
    const rng = (s: number) => {
        const x = Math.sin(s) * 10000;
        return x - Math.floor(x);
    };
    let s = seed;

    for (let i = 0; i < count; i++) {
      const x = rng(s++) * 2400 - 800; 
      const z = rng(s++) * 2200 - 800;
      
      if (!isPointOnTrackMath(x, z, 40)) {
        if (theme === 'night_city') {
            const chance = rng(s++);
            if (chance > 0.8) {
                items.push({ type: 'billboard', pos: [x, 0, z], scale: 1, color: '#00ffff', rot: [0, rng(s++) * Math.PI, 0] });
            } else {
                const scale: [number, number, number] = [1 + rng(s++) * 2, 2 + rng(s++) * 7, 1 + rng(s++) * 2];
                const colors = ['#ff00ff', '#00ffff', '#ffff00', '#ff0000', '#00ff00'];
                items.push({ type: 'building', pos: [x, 10 * scale[1], z], scale, color: colors[Math.floor(rng(s++) * colors.length)] });
            }
        } else if (theme === 'desert_outpost') {
            const type = rng(s++) > 0.8 ? 'tree' : 'rock';
            const scale = type === 'tree' ? 1.5 + rng(s++) * 2 : 5 + rng(s++) * 10;
            items.push({ type, pos: [x, 0, z], scale });
        } else {
            const type = rng(s++) > 0.4 ? 'tree' : 'rock';
            const scale = type === 'tree' ? 2.5 + rng(s++) * 3.5 : 3 + rng(s++) * 5;
            items.push({ type, pos: [x, 0, z], scale });
        }
      }
    }
    return items;
  }, [theme]);
  
  useFrame((state, delta) => {
    const isMobile = state.viewport.width < 10; // Simple check based on viewport width in R3F units or just use standard JS check
    const mobileFactor = window.innerWidth < 768 ? 1.5 : 1;

    if (isSpectator) {
        const target = players[followingId || ''];
        if (target) {
            const dist = 40 * mobileFactor;
            const height = 20 * mobileFactor;
            const angle = target.angle;
            const targetCamX = target.x - Math.cos(angle) * dist;
            const targetCamZ = target.y - Math.sin(angle) * dist;
            camera.position.lerp(new THREE.Vector3(targetCamX, height, targetCamZ), 0.1);
            camera.lookAt(target.x, 0, target.y);
        } else {
            // Default aerial view if no target
            camera.position.lerp(new THREE.Vector3(600, 300, 800), 0.05);
            camera.lookAt(600, 0, 750);
        }
        return;
    }

    if (localPlayerRef.current && carRef.current) {
      const p = localPlayerRef.current;
      
      // Map 2D (x, y) to 3D (x, 0, z)
      carRef.current.position.set(p.x, 0, p.y);
      carRef.current.rotation.y = -p.angle + Math.PI/2; 

      // Trigger shake on collision (entering off-track)
      if (isOffTrack && !prevOffTrack.current) {
        shakeRef.current = Math.min(1.5, shakeRef.current + 1.0);
      }
      prevOffTrack.current = isOffTrack;

      // Decay shake
      shakeRef.current *= 0.9;
      if (shakeRef.current < 0.01) shakeRef.current = 0;

      // Camera Follow
      const dist = 40 * mobileFactor;
      const height = 20 * mobileFactor;
      const angle = p.angle;
      
      const targetCamX = p.x - Math.cos(angle) * dist;
      const targetCamZ = p.y - Math.sin(angle) * dist;
      
      // Smooth camera
      camera.position.lerp(new THREE.Vector3(targetCamX, height, targetCamZ), 0.1);
      camera.lookAt(p.x, 0, p.y);

      // Apply shake offset
      if (shakeRef.current > 0) {
        camera.position.x += (Math.random() - 0.5) * shakeRef.current;
        camera.position.y += (Math.random() - 0.5) * shakeRef.current;
        camera.position.z += (Math.random() - 0.5) * shakeRef.current;
      }
    }
  });

  return (
    <>
      <color attach="background" args={[config.bg]} />
      <fog attach="fog" args={[config.fogColor, 200, 1500]} />
      <Stars radius={300} depth={60} count={20000} factor={7} saturation={0} fade speed={1} />
      
      <ambientLight intensity={config.ambientIntensity} />
      <directionalLight 
        position={[600, 500, 425]} 
        intensity={theme === 'night_city' ? 0.3 : 1.2} 
        castShadow 
        shadow-mapSize={[2048, 2048]}
      />
      
      <TrackMesh theme={theme} />
      
      {/* Decorative Elements */}
      {decorations.map((item, i) => {
        if (item.type === 'tree') return <Tree key={i} position={item.pos} scale={item.scale as number} />;
        if (item.type === 'rock') return <Rock key={i} position={item.pos} scale={item.scale as number} />;
        if (item.type === 'building') return <Building key={i} position={item.pos} scale={item.scale as [number, number, number]} color={item.color} />;
        if (item.type === 'billboard') return <Billboard key={i} position={item.pos} rotation={item.rot} color={item.color} />;
        return null;
      })}

      <EffectComposer disableNormalPass>
        <Bloom 
            intensity={config.bloomIntensity} 
            luminanceThreshold={0.2} 
            luminanceSmoothing={0.9} 
            mipmapBlur 
        />
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
        <ChromaticAberration offset={new THREE.Vector2(0.001, 0.001)} />
        <Noise opacity={0.02} />
      </EffectComposer>
      
      {/* Local Player */}
      {!isSpectator && (
        <group ref={carRef}>
          <CarModel 
              color={players[myId || '']?.color || 'red'} 
              type={players[myId || '']?.carType}
              isLocal 
              drifting={localPlayerRef.current?.drifting} 
          />
        </group>
      )}
      
      {/* Remote Players */}
      {Object.values(players).map(p => {
        if (p.id === myId) return null;
        return (
          <group key={p.id} position={[p.x, 0, p.y]} rotation={[0, -p.angle + Math.PI/2, 0]}>
            <CarModel color={p.color} type={p.carType} drifting={p.drifting} />
            <Text position={[0, 6, 0]} fontSize={3} color="white" anchorX="center" anchorY="middle" font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYMZhrib2fV6f-8pXv.woff">
              {p.name}
            </Text>
          </group>
        );
      })}
    </>
  );
};

export default function GameCanvas({ initialPlayers, theme = 'night_city', isSpectator = false }: { initialPlayers?: Record<string, Player>, theme?: keyof typeof THEME_CONFIGS, isSpectator?: boolean }) {
  // Sanitize initial players to handle Infinity/null issue
  const sanitizedInitial = useMemo(() => {
      if (!initialPlayers) return {};
      return Object.entries(initialPlayers).reduce((acc, [id, p]) => {
        acc[id] = { ...p, bestLapTime: p.bestLapTime || Infinity };
        return acc;
      }, {} as Record<string, Player>);
  }, [initialPlayers]);

  const [players, setPlayers] = useState<Record<string, Player>>(sanitizedInitial);
  const [myId, setMyId] = useState<string | null>(socket.id || null);
  const [followingId, setFollowingId] = useState<string | null>(null);
  const [laps, setLaps] = useState(0);
  const [lastLapTime, setLastLapTime] = useState<number | null>(null);
  const [currentLapStart, setCurrentLapStart] = useState<number>(Date.now());
  const [nitro, setNitro] = useState(100);
  const [wrongWay, setWrongWay] = useState(false);
  const [offTrack, setOffTrack] = useState(false);
  const timerRef = useRef<HTMLDivElement>(null);
  
  const config = THEME_CONFIGS[theme];
  
  // HUD Helper
  const formatTime = (ms: number) => {
      if (ms === Infinity || !ms) return "--:--";
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const rs = s % 60;
      const msPart = Math.floor((ms % 1000) / 10);
      return `${m}:${rs.toString().padStart(2, '0')}.${msPart.toString().padStart(2, '0')}`;
  };
  
  // Local state for smooth physics
  const localPlayer = useRef<{
    x: number;
    y: number;
    angle: number;
    speed: number;
    keys: Record<string, boolean>;
    checkpoint: number; // 0: Start, 1: Top, 2: Bottom
    nitro: number;
    drifting: boolean;
    wrongWayTimer: number | null;
    lapCount: number;
  }>({
    x: 650,
    y: 750,
    angle: Math.PI,
    speed: 0,
    keys: {},
    checkpoint: 3, // Start in sector 3 (before finish line)
    nitro: 100,
    drifting: false,
    wrongWayTimer: null,
    lapCount: 0,
  });

  // Initialize local player position from props if available
  useEffect(() => {
      if (myId && players[myId]) {
          const p = players[myId];
          localPlayer.current.x = p.x;
          localPlayer.current.y = p.y;
          localPlayer.current.angle = p.angle;
          // Don't reset laps here as game might be in progress? 
          // Actually for new game start, laps are 0.
      }
  }, [myId]); // Run once when ID is confirmed

  // Particle System
  const [particles, setParticles] = useState<{id: number, x: number, y: number, life: number, color?: string}[]>([]);
  const particleIdCounter = useRef(0);

  useEffect(() => {
    // Socket event listeners
    socket.on('connect', () => {
      setMyId(socket.id || null);
    });

    // 'currentPlayers' and 'newPlayer' are handled in Lobby now.
    // We only need game-specific updates here.
    
    socket.on('playerJoinedRoom', (player: unknown) => {
      const p = player as Player;
      setPlayers((prev) => ({ ...prev, [p.id]: { ...p, bestLapTime: p.bestLapTime || Infinity } }));
    });

    socket.on('playerMoved', (player: unknown) => {
      const p = player as Player;
      setPlayers((prev) => {
        // Don't update local player from server to avoid jitter
        if (p.id === socket.id) return prev;
        return { ...prev, [p.id]: { ...p, bestLapTime: p.bestLapTime || Infinity } };
      });
    });
    
    socket.on('lapUpdate', (data: {id: string, laps: number, bestLapTime: number}) => {
        setPlayers(prev => {
            if (!prev[data.id]) return prev;
            
            // If server sends null/0 (from Infinity), treat as Infinity
            const serverBest = data.bestLapTime || Infinity;
            
            // If this is local player, only update if server time is BETTER or EQUAL to local time
            // This prevents overwriting optimistic update with stale server data
            if (data.id === socket.id) {
                 const currentBest = prev[data.id].bestLapTime || Infinity;
                 if (serverBest > currentBest && currentBest !== Infinity) {
                     // Server sent worse time than we have locally? Ignore it.
                     return prev;
                 }
            }

            return {
                ...prev,
                [data.id]: {
                    ...prev[data.id],
                    laps: data.laps,
                    bestLapTime: serverBest
                }
            };
        });
    });

    socket.on('playerDisconnected', (id: string) => {
      setPlayers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    return () => {
      socket.off('connect');
      socket.off('playerJoinedRoom');
      socket.off('playerMoved');
      socket.off('playerDisconnected');
      socket.off('lapUpdate');
    };
  }, []);

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      localPlayer.current.keys[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      localPlayer.current.keys[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (isSpectator && !followingId) {
        const playerIds = Object.keys(players);
        if (playerIds.length > 0) {
            setFollowingId(playerIds[0]);
        }
    }
  }, [isSpectator, players, followingId]);

  // Physics Loop (runs independently of 3D render loop)
  useEffect(() => {
    if (isSpectator) return;
    
    let animationFrameId: number;

    const updatePhysics = () => {
      const p = localPlayer.current;
      const playerConfig = CAR_CONFIGS[(players[socket.id || '']?.carType || 'sport') as keyof typeof CAR_CONFIGS];
      
      const oldX = p.x;
      const oldY = p.y;
      
      const curAccel = playerConfig.accel;
      const curMaxSpeed = playerConfig.maxSpeed;
      const curTurnSpeed = playerConfig.turn;

      // Acceleration
      if (p.keys['ArrowUp'] || p.keys['KeyW'] || p.keys['TouchGas']) {
        p.speed += curAccel;
      } else if (p.keys['ArrowDown'] || p.keys['KeyS'] || p.keys['TouchBrake']) {
        p.speed -= curAccel;
      } else {
        p.speed *= FRICTION;
      }

      // Nitro
      if ((p.keys['ShiftLeft'] || p.keys['ShiftRight'] || p.keys['TouchNitro']) && p.nitro > 0) {
          p.speed += NITRO_ACCEL;
          p.nitro = Math.max(0, p.nitro - 1);
          // Nitro particles
          if (Math.random() > 0.4) {
              setParticles(prev => [
                  ...prev, 
                  {
                      id: particleIdCounter.current++, 
                      x: p.x + (Math.random() - 0.5) * 3, 
                      y: p.y + (Math.random() - 0.5) * 3, 
                      life: 0.8,
                      color: '#00ffff'
                  }
              ].slice(-60));
          }
      } else {
          p.nitro = Math.min(100, p.nitro + 0.2);
      }
      setNitro(p.nitro);

      // Drifting Logic
      const isTurning = p.keys['ArrowLeft'] || p.keys['KeyA'] || p.keys['ArrowRight'] || p.keys['KeyD'] || p.keys['TouchLeft'] || p.keys['TouchRight'];
      const wantsDrift = p.keys['Space'];
      
      if (wantsDrift && isTurning && Math.abs(p.speed) > 1.5) {
          p.drifting = true;
      } else {
          p.drifting = false;
      }

      // Max Speed Cap
      const isNitroActive = (p.keys['ShiftLeft'] || p.keys['ShiftRight'] || p.keys['TouchNitro']) && p.nitro > 0;
      const limitSpeed = isNitroActive ? NITRO_SPEED : curMaxSpeed;
      
      if (p.speed > limitSpeed) {
          if (isNitroActive) {
              p.speed = limitSpeed;
          } else {
              p.speed = Math.max(limitSpeed, p.speed * 0.98);
          }
      }
      if (p.speed < -curMaxSpeed / 2) p.speed = -curMaxSpeed / 2;

      // Turning
      if (Math.abs(p.speed) > 0.1) {
        let turn = curTurnSpeed * (p.speed / curMaxSpeed);
        
        if (p.drifting) {
            turn *= 1.8; 
            p.speed *= 0.97;
            
            if (Math.random() > 0.3) {
                setParticles(prev => [
                    ...prev, 
                    {
                        id: particleIdCounter.current++, 
                        x: p.x + (Math.random() - 0.5) * 2, 
                        y: p.y + (Math.random() - 0.5) * 2, 
                        life: 1.2,
                        color: '#ffffff'
                    }
                ].slice(-60));
            }
        }

        if (p.keys['ArrowLeft'] || p.keys['KeyA'] || p.keys['TouchLeft']) {
          p.angle -= turn;
        }
        if (p.keys['ArrowRight'] || p.keys['KeyD'] || p.keys['TouchRight']) {
          p.angle += turn;
        }
      }

      // Movement
      // If drifting, momentum carries slightly sideways? 
      // For simplicity in this 2D-to-3D mapping, we just update position based on angle.
      // A true drift would vector add velocity + slip. 
      // Here we just let the "sharper turn" simulate the oversteer feel visually.
      p.x += Math.cos(p.angle) * p.speed;
      p.y += Math.sin(p.angle) * p.speed;

      // Update Particles
      setParticles(prev => prev.map(pt => ({...pt, life: pt.life - 0.05})).filter(pt => pt.life > 0));

      // Find closest segment for target angle and collision
      let closestPt = {x: p.x, y: p.y};
      let minD2 = Infinity;
      let targetAngle = 0;
      
      TRACK_SEGMENTS.forEach(seg => {
          const pt = getClosestPointOnSegment({x: p.x, y: p.y}, seg.start, seg.end);
          const d2 = (pt.x - p.x)**2 + (pt.y - p.y)**2;
          if (d2 < minD2) {
              minD2 = d2;
              closestPt = pt;
              targetAngle = seg.angle;
          }
      });

      // Track Collision (Off-track logic)
      const isOff = Math.sqrt(minD2) > TRACK_RADIUS;
      setOffTrack(isOff);
      
      if (isOff) {
        // Off-track: Apply heavy friction/slowdown instead of hard wall
        p.speed *= 0.85; // More aggressive slow down
        
        // Cap max speed on grass
        if (p.speed > 1.2) p.speed = 1.2;
        if (p.speed < -0.75) p.speed = -0.75;

        p.drifting = false; // Harder to drift on grass
        
        // Spark particles on collision
        if (Math.random() > 0.3) {
            setParticles(prev => [
                ...prev, 
                {
                    id: particleIdCounter.current++, 
                    x: p.x + (Math.random() - 0.5) * 4, 
                    y: p.y + (Math.random() - 0.5) * 4, 
                    life: 0.6,
                    color: '#ffaa00'
                }
            ].slice(-60));
        }
      }

      // Sector/Lap Logic
      // Check distance to specific segments to act as checkpoints
      let currentSector = -1;
      const d0 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[0].start, TRACK_SEGMENTS[0].end);
      const d1 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[4].start, TRACK_SEGMENTS[4].end);
      const d2 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[8].start, TRACK_SEGMENTS[8].end);
      const d3 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[11].start, TRACK_SEGMENTS[11].end);

      if (d0 < TRACK_RADIUS * 1.5) currentSector = 0;
      else if (d1 < TRACK_RADIUS * 1.5) currentSector = 1;
      else if (d2 < TRACK_RADIUS * 1.5) currentSector = 2;
      else if (d3 < TRACK_RADIUS * 1.5) currentSector = 3;
      
      // Checkpoint progression
      if (currentSector !== -1) {
          const nextCheckpoint = (p.checkpoint + 1) % 4;
          if (currentSector === nextCheckpoint) {
              p.checkpoint = currentSector;
          }
      }

      // Lap Finish Check (Crossing x=625 on segment 12)
      const onFinishStraight = p.y > 700 && p.y < 800;
      if (p.checkpoint === 3 && onFinishStraight && oldX >= 625 && p.x < 625) {
          const now = Date.now();
          const lapTime = now - currentLapStart;
          
          // Always reset timer for the next lap
          setCurrentLapStart(now);
          
          // Increment internal lap count
          p.lapCount = (p.lapCount || 0) + 1;
          setLaps(p.lapCount);
          
          // Only record best time if this wasn't the start-line crossing (Lap 1 start)
          if (p.lapCount > 1) {
              setLastLapTime(lapTime);
              
              // Optimistically update local player's best lap time
              setPlayers(prev => {
                  if (!myId || !prev[myId]) return prev;
                  const currentBest = prev[myId].bestLapTime;
                  if (!currentBest || lapTime < currentBest) {
                      return {
                          ...prev,
                          [myId]: {
                              ...prev[myId],
                              bestLapTime: lapTime
                          }
                      };
                  }
                  return prev;
              });

              // Send to server
              socket.emit('lapFinished', lapTime);
          }
          
          // Reset checkpoint for next lap
          p.checkpoint = -1; // Wait for sector 0
      }

      // Wrong Way Detection (Angle based)
      // Use targetAngle from the closest segment (calculated above in collision logic)
      
      // Normalize player angle to -PI to PI
      let pAngle = p.angle % (Math.PI * 2);
      if (pAngle > Math.PI) pAngle -= Math.PI * 2;
      if (pAngle < -Math.PI) pAngle += Math.PI * 2;
      
      // Calculate difference
      let diff = Math.abs(pAngle - targetAngle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      
      // If angle difference is > 115 degrees (approx 2.0 rad), show warning
      // Only if moving forward (speed > 0.5)
      // Removed isOnTrack check to ensure it triggers even if slightly off-line
      const isWrongWayConditionMet = diff > 2.0 && p.speed > 0.5;
      
      if (isWrongWayConditionMet) {
          if (p.wrongWayTimer === null) {
              p.wrongWayTimer = Date.now();
          } else if (Date.now() - p.wrongWayTimer > 100) {
              setWrongWay(true);
          }
      } else {
          // Reset timer if we are facing correct way OR moving slow
          p.wrongWayTimer = null;
          setWrongWay(false);
      }


      // Send update
      if (socket.connected) {
        socket.emit('playerMovement', {
          x: p.x,
          y: p.y,
          angle: p.angle,
          speed: p.speed,
          nitro: p.nitro,
          drifting: p.drifting
        });
      }

      // Update Timer DOM
      if (timerRef.current) {
          timerRef.current.innerText = formatTime(Date.now() - currentLapStart);
      }

      animationFrameId = requestAnimationFrame(updatePhysics);
    };

    updatePhysics();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [currentLapStart]);

  // Mobile Touch Helpers
  const handleTouch = (key: string, pressed: boolean) => {
    localPlayer.current.keys[key] = pressed;
  };

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden" style={{ backgroundColor: config.bg }}>
      <Canvas shadows antialias={false} dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[0, 60, 60]} fov={55} far={2000} />
        <GameScene 
            localPlayerRef={localPlayer} 
            players={players} 
            myId={myId} 
            theme={theme} 
            isOffTrack={offTrack} 
            isSpectator={isSpectator}
            followingId={followingId}
        />
        
        {/* Particles */}
        {particles.map(pt => (
            <mesh key={pt.id} position={[pt.x, 2, pt.y]} rotation={[-Math.PI/2, 0, 0]}>
                <planeGeometry args={[1.5 * pt.life, 1.5 * pt.life]} />
                <meshBasicMaterial color={pt.color || "#888"} transparent opacity={0.4 * pt.life} />
            </mesh>
        ))}

        <OrbitControls enabled={false} />
      </Canvas>
      
      {/* HUD Overlay */}
      {/* Top Left: Leaderboard */}
      <div className="hidden lg:flex absolute top-6 left-6 flex flex-col gap-3 pointer-events-none">
          <div className="bg-black/50 text-white p-5 rounded-xl border border-white/10 backdrop-blur-md w-56">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-bold">Leaderboard</div>
              <div className="space-y-2">
                  {Object.values(players)
                    .map(p => p as Player)
                    .sort((a, b) => (a.bestLapTime || Infinity) - (b.bestLapTime || Infinity))
                    .slice(0, 5)
                    .map((p, i) => (
                      <div key={p.id} className="flex justify-between text-sm">
                          <span className={`${p.id === socket.id ? 'text-yellow-400 font-bold' : 'text-slate-300'} truncate max-w-[120px]`}>
                              {i+1}. {p.name}
                          </span>
                          <span className="font-mono text-slate-400">
                              {p.bestLapTime !== Infinity ? formatTime(p.bestLapTime) : '-'}
                          </span>
                      </div>
                  ))}
              </div>
          </div>
      </div>

      {/* Top Center: Lap Timer */}
      {!isSpectator && (
          <div className="hidden lg:flex absolute top-6 left-1/2 -translate-x-1/2 pointer-events-none">
              <div className="bg-black/50 text-white px-8 py-4 rounded-full border border-white/10 backdrop-blur-md flex items-center gap-8">
                  <div className="text-center">
                      <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Current</div>
                      <div ref={timerRef} className="text-3xl font-mono font-bold text-yellow-400 leading-none">
                          {formatTime(Date.now() - currentLapStart)}
                      </div>
                  </div>
                  <div className="w-px h-12 bg-white/20"></div>
                  <div className="text-center">
                      <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Best</div>
                      <div className="text-2xl font-mono text-slate-300 leading-none">
                          {players[socket.id || '']?.bestLapTime !== Infinity ? formatTime(players[socket.id || '']?.bestLapTime || 0) : '--:--'}
                      </div>
                  </div>
                  <div className="w-px h-12 bg-white/20"></div>
                   <div className="text-center">
                      <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Lap</div>
                      <div className="text-2xl font-mono text-slate-300 leading-none">
                          {laps}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Spectator UI */}
      {isSpectator && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4">
              <div className="bg-orange-600 text-white px-6 py-2 rounded-full font-black italic tracking-widest text-sm shadow-xl">
                  SPECTATOR MODE
              </div>
              <div className="flex items-center gap-4 bg-black/50 backdrop-blur-md p-2 rounded-2xl border border-white/10 text-white">
                  <button 
                    onClick={() => {
                        const ids = Object.keys(players);
                        const idx = ids.indexOf(followingId || '');
                        const nextIdx = (idx - 1 + ids.length) % ids.length;
                        setFollowingId(ids[nextIdx]);
                    }}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                  >
                      <ChevronLeft size={20} />
                  </button>
                  <div className="px-4 text-center min-w-[150px]">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Watching</div>
                      <div className="font-black italic truncate">{players[followingId || '']?.name || 'N/A'}</div>
                  </div>
                  <button 
                    onClick={() => {
                        const ids = Object.keys(players);
                        const idx = ids.indexOf(followingId || '');
                        const nextIdx = (idx + 1) % ids.length;
                        setFollowingId(ids[nextIdx]);
                    }}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                  >
                      <ChevronRight size={20} />
                  </button>
              </div>
          </div>
      )}

      {/* Bottom Center: Nitro Bar */}
      {!isSpectator && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 pointer-events-none w-80">
              <div className="flex justify-between text-xs text-slate-400 uppercase tracking-wider font-bold mb-2">
                  <span>Nitro</span>
                  <span>{Math.round(nitro)}%</span>
              </div>
              <div className="w-full h-4 bg-slate-800/50 rounded-full overflow-hidden border border-white/20 backdrop-blur-md">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-600 via-blue-400 to-cyan-300 shadow-[0_0_15px_rgba(59,130,246,0.6)]"
                    style={{ width: `${nitro}%` }}
                  />
              </div>
          </div>
      )}

      {/* Wrong Way Warning */}
      {wrongWay && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="bg-red-600/90 text-white px-12 py-8 rounded-2xl border-8 border-white shadow-2xl animate-pulse">
                <div className="text-6xl font-black italic uppercase tracking-widest">WRONG WAY</div>
            </div>
        </div>
      )}

      {/* Mobile Controls */}
      {!isSpectator && (
          <div className="lg:hidden absolute inset-0 pointer-events-none select-none z-50 touch-none">
               {/* Top Right: Reset Button moved to bottom for better visibility */}
              <div className="absolute top-6 right-6 pointer-events-auto lg:top-20">
                  <button 
                    onClick={() => {
                        localPlayer.current.x = 650;
                        localPlayer.current.y = 750;
                        localPlayer.current.angle = Math.PI;
                        localPlayer.current.speed = 0;
                    }}
                    className="bg-black/20 hover:bg-black/40 backdrop-blur-md border border-white/5 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest text-slate-400 active:scale-95 transition-all"
                  >
                      Reset
                  </button>
              </div>

              {/* Bottom Layout */}
              <div className="absolute bottom-8 left-0 right-0 px-6 flex justify-between items-end">
                  {/* Left: Steering */}
                  <div className="flex flex-col gap-4 items-start">
                      <button 
                        onMouseDown={(e) => { e.preventDefault(); handleTouch('Space', true); }} 
                        onMouseUp={(e) => { e.preventDefault(); handleTouch('Space', false); }}
                        onTouchStart={(e) => { e.preventDefault(); handleTouch('Space', true); }} 
                        onTouchEnd={(e) => { e.preventDefault(); handleTouch('Space', false); }}
                        onContextMenu={(e) => e.preventDefault()}
                        className="w-14 h-14 bg-yellow-500/10 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-yellow-500/10 active:scale-90 transition-transform pointer-events-auto shadow-lg touch-none"
                      >
                          <span className="text-[8px] font-black italic text-yellow-400/60">DRIFT</span>
                      </button>
                      <div className="flex gap-2 pointer-events-auto">
                          <button 
                            onMouseDown={(e) => { e.preventDefault(); handleTouch('TouchLeft', true); }} 
                            onMouseUp={(e) => { e.preventDefault(); handleTouch('TouchLeft', false); }}
                            onTouchStart={(e) => { e.preventDefault(); handleTouch('TouchLeft', true); }} 
                            onTouchEnd={(e) => { e.preventDefault(); handleTouch('TouchLeft', false); }}
                            onContextMenu={(e) => e.preventDefault()}
                            className="w-20 h-20 bg-white/5 backdrop-blur-2xl rounded-[1.5rem] flex items-center justify-center border border-white/5 active:bg-white/10 transition-all touch-none"
                          >
                              <ChevronLeft className="w-10 h-10 opacity-50" />
                          </button>
                          <button 
                            onMouseDown={(e) => { e.preventDefault(); handleTouch('TouchRight', true); }} 
                            onMouseUp={(e) => { e.preventDefault(); handleTouch('TouchRight', false); }}
                            onTouchStart={(e) => { e.preventDefault(); handleTouch('TouchRight', true); }} 
                            onTouchEnd={(e) => { e.preventDefault(); handleTouch('TouchRight', false); }}
                            onContextMenu={(e) => e.preventDefault()}
                            className="w-20 h-20 bg-white/5 backdrop-blur-2xl rounded-[1.5rem] flex items-center justify-center border border-white/5 active:bg-white/10 transition-all touch-none"
                          >
                              <ChevronRight className="w-10 h-10 opacity-50" />
                          </button>
                      </div>
                  </div>

                  {/* Right: Pedals */}
                  <div className="flex flex-col gap-4 items-end">
                        <button 
                            onMouseDown={(e) => { e.preventDefault(); handleTouch('TouchNitro', true); }} 
                            onMouseUp={(e) => { e.preventDefault(); handleTouch('TouchNitro', false); }}
                            onTouchStart={(e) => { e.preventDefault(); handleTouch('TouchNitro', true); }} 
                            onTouchEnd={(e) => { e.preventDefault(); handleTouch('TouchNitro', false); }}
                            onContextMenu={(e) => e.preventDefault()}
                            className="w-14 h-14 bg-blue-600/20 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-blue-400/10 active:scale-90 transition-transform pointer-events-auto touch-none shadow-lg shadow-blue-500/10"
                        >
                            <span className="text-[8px] font-black italic text-cyan-400/60">NITRO</span>
                        </button>
                        <div className="flex gap-4 pointer-events-auto items-end">
                            <button 
                                onMouseDown={(e) => { e.preventDefault(); handleTouch('TouchBrake', true); }} 
                                onMouseUp={(e) => { e.preventDefault(); handleTouch('TouchBrake', false); }}
                                onTouchStart={(e) => { e.preventDefault(); handleTouch('TouchBrake', true); }} 
                                onTouchEnd={(e) => { e.preventDefault(); handleTouch('TouchBrake', false); }}
                                onContextMenu={(e) => e.preventDefault()}
                                className="w-16 h-20 bg-red-600/10 backdrop-blur-2xl rounded-xl flex flex-col items-center justify-center border border-red-500/10 active:bg-red-600/20 transition-all touch-none"
                            >
                                <span className="text-[7px] font-black tracking-widest text-red-400/40 uppercase mb-1">Brake</span>
                                <div className="w-8 h-0.5 bg-red-500/20 rounded-full" />
                            </button>
                            <button 
                                onMouseDown={(e) => { e.preventDefault(); handleTouch('TouchGas', true); }} 
                                onMouseUp={(e) => { e.preventDefault(); handleTouch('TouchGas', false); }}
                                onTouchStart={(e) => { e.preventDefault(); handleTouch('TouchGas', true); }} 
                                onTouchEnd={(e) => { e.preventDefault(); handleTouch('TouchGas', false); }}
                                onContextMenu={(e) => e.preventDefault()}
                                className="w-20 h-32 bg-white/10 text-white rounded-2xl flex flex-col items-center justify-center border border-white/20 active:bg-white/30 transition-all touch-none"
                            >
                                <span className="text-xl font-black italic tracking-tighter opacity-70">GAS</span>
                                <div className="w-0.5 h-10 bg-white/10 rounded-full mt-2" />
                            </button>
                        </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
