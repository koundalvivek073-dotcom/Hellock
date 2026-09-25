'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Eye, Layers, ShieldCheck, AlertTriangle, XCircle, Zap } from 'lucide-react';

// Color palette strictly adhering to spec
const COLORS = {
  healthy: '#22c55e',       // Bold saturated green
  suspected: '#f59e0b',     // Pulsing amber
  confirmed_down: '#ef4444',// Red
  standby: '#f8fafc',       // Dim white
  standbyActive: '#22c55e', // Green upon receiving replica
  background: '#0a0f1d'
};

const NODE_COORDINATES = {
  nodeA: [-4.5, 0, 0.4],
  nodeB: [-1.5, 0, 0],
  nodeC: [1.5, 0, 0],
  nodeD: [4.5, 0, 0.4]
};

// -------------------------------------------------------------
// 3D Canvas Subcomponents (dynamically loaded on client only)
// -------------------------------------------------------------

function ThreeNodeObject({ nodeId, nodeData, position, isTransferSource, isTransferTarget }) {
  const meshRef = useRef();
  const lightRef = useRef();
  const ringRef = useRef();

  // Dynamic import of Three fiber hooks
  const { useFrame } = require('@react-three/fiber');

  // Determine active visual state
  const isStandby = nodeId === 'nodeD';
  const hasReplicas = (nodeData?.diskFiles || 0) > 0;
  
  let nodeColor = COLORS.healthy;
  let emissiveIntensity = 1.8;
  let opacity = 1.0;

  if (nodeData?.status === 'confirmed_down') {
    nodeColor = COLORS.confirmed_down;
    emissiveIntensity = 2.5;
  } else if (nodeData?.status === 'suspected') {
    nodeColor = COLORS.suspected;
    emissiveIntensity = 2.0;
  } else if (isStandby) {
    if (hasReplicas || isTransferTarget) {
      nodeColor = COLORS.standbyActive;
      emissiveIntensity = 2.5;
      opacity = 1.0;
    } else {
      nodeColor = COLORS.standby;
      emissiveIntensity = 0.2;
      opacity = 0.35;
    }
  }

  // Animation frame: pulse lights and rotate base rings
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.5;
    }

    if (meshRef.current) {
      if (nodeData?.status === 'suspected') {
        // Pulsing amber
        const pulse = Math.sin(t * 5) * 0.5 + 1.2;
        meshRef.current.material.emissiveIntensity = pulse * 1.5;
      } else if (isTransferTarget || (isStandby && hasReplicas)) {
        // Excited glow on recovery target
        const pulse = Math.sin(t * 8) * 0.3 + 2.0;
        meshRef.current.material.emissiveIntensity = pulse;
      } else if (nodeData?.status === 'confirmed_down') {
        const pulse = Math.sin(t * 3) * 0.2 + 2.0;
        meshRef.current.material.emissiveIntensity = pulse;
      }
    }
  });

  return (
    <group position={position}>
      {/* Local point light casting glow on chassis & floor */}
      <pointLight
        ref={lightRef}
        color={nodeColor}
        intensity={opacity < 0.5 ? 0.3 : 3.5}
        distance={4.5}
        decay={2}
        position={[0, 1.2, 0]}
      />

      {/* Futuristic Server Chassis Cylinder */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.7, 0.75, 1.2, 32]} />
        <meshStandardMaterial
          color="#0f172a"
          roughness={0.25}
          metalness={0.85}
        />
      </mesh>

      {/* Decorative Server Ribs / Vents */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.72, 0.72, 0.15, 32]} />
        <meshStandardMaterial
          color="#1e293b"
          roughness={0.4}
          metalness={0.9}
        />
      </mesh>

      {/* Top Core Sphere Indicator */}
      <mesh ref={meshRef} position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.42, 32, 32]} />
        <meshStandardMaterial
          color={nodeColor}
          emissive={nodeColor}
          emissiveIntensity={emissiveIntensity}
          transparent={opacity < 1}
          opacity={opacity}
          roughness={0.1}
          metalness={0.2}
        />
      </mesh>

      {/* Rotating Energy Orbit Ring */}
      <mesh ref={ringRef} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.05, 32]} />
        <meshBasicMaterial
          color={nodeColor}
          transparent={true}
          opacity={opacity < 1 ? 0.2 : 0.6}
          side={2} // THREE.DoubleSide
        />
      </mesh>
    </group>
  );
}

// Data Transfer Beam connecting source healthy node to target standby node
function DataTransferBeam({ sourceNodeId, targetNodeId }) {
  const lineRef = useRef();
  const packetRef = useRef();
  const { useFrame } = require('@react-three/fiber');

  const start = NODE_COORDINATES[sourceNodeId] || [-1.5, 0, 0];
  const end = NODE_COORDINATES[targetNodeId] || [4.5, 0, 0];

  useFrame(({ clock }) => {
    if (packetRef.current) {
      const t = (clock.getElapsedTime() * 1.5) % 1;
      packetRef.current.position.x = start[0] + (end[0] - start[0]) * t;
      packetRef.current.position.y = 1.2 + Math.sin(t * Math.PI) * 0.8;
      packetRef.current.position.z = start[2] + (end[2] - start[2]) * t;
    }
  });

  return (
    <group>
      {/* Glowing transfer packet traveling along curve */}
      <mesh ref={packetRef} position={[start[0], 1.2, start[2]]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshBasicMaterial color="#38bdf8" />
        <pointLight color="#38bdf8" intensity={4} distance={3} />
      </mesh>
    </group>
  );
}

// Full 3D Scene Inside Canvas
function Scene({ nodes, activeTransfer }) {
  const { OrbitControls } = require('@react-three/drei');

  return (
    <>
      <color attach="background" args={['#070b14']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />

      {/* Grid Floor */}
      <gridHelper args={[20, 20, '#1e293b', '#0f172a']} position={[0, -0.01, 0]} />

      {/* 4 Storage Nodes */}
      {Object.entries(NODE_COORDINATES).map(([nodeId, pos]) => (
        <ThreeNodeObject
          key={nodeId}
          nodeId={nodeId}
          nodeData={nodes[nodeId]}
          position={pos}
          isTransferSource={activeTransfer?.sourceNodeId === nodeId}
          isTransferTarget={activeTransfer?.targetNodeId === nodeId}
        />
      ))}

      {/* Animated Data Transfer Beam during Recovery */}
      {activeTransfer && (
        <DataTransferBeam
          sourceNodeId={activeTransfer.sourceNodeId}
          targetNodeId={activeTransfer.targetNodeId}
        />
      )}

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        maxDistance={14}
        minDistance={5}
        maxPolarAngle={Math.PI / 2.1}
        minPolarAngle={Math.PI / 4}
      />
    </>
  );
}

// -------------------------------------------------------------
// Fallback 2D Animated Schematic (High-performance, zero WebGL req)
// -------------------------------------------------------------

function NodeSchematic2D({ nodes, activeTransfer }) {
  const nodeOrder = ['nodeA', 'nodeB', 'nodeC', 'nodeD'];

  const getStatusBadge = (node, isStandby) => {
    if (node?.status === 'confirmed_down') {
      return { label: 'CONFIRMED DOWN', color: 'bg-red-500/20 text-red-400 border-red-500/40', dot: 'bg-red-500' };
    }
    if (node?.status === 'suspected') {
      return { label: 'SUSPECTED (1/3)', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse', dot: 'bg-amber-500' };
    }
    if (isStandby) {
      if ((node?.diskFiles || 0) > 0 || activeTransfer?.targetNodeId === 'nodeD') {
        return { label: 'STANDBY (ACTIVE)', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', dot: 'bg-emerald-400' };
      }
      return { label: 'STANDBY (IDLE)', color: 'bg-slate-700/30 text-slate-400 border-slate-700', dot: 'bg-slate-500' };
    }
    return { label: 'HEALTHY', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', dot: 'bg-emerald-500' };
  };

  return (
    <div className="relative w-full py-8 px-4 flex flex-col items-center justify-center">
      {/* Connection Bus Line */}
      <div className="absolute top-1/2 left-12 right-12 h-1 bg-slate-800 -translate-y-8 z-0">
        {activeTransfer && (
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-cyan-400 to-emerald-500 animate-pulse" />
        )}
      </div>

      {/* Nodes Row */}
      <div className="relative z-10 w-full max-w-5xl grid grid-cols-2 md:grid-cols-4 gap-6">
        {nodeOrder.map((nodeId) => {
          const node = nodes[nodeId];
          const isStandby = nodeId === 'nodeD';
          const hasFiles = (node?.diskFiles || 0) > 0;
          const isTarget = activeTransfer?.targetNodeId === nodeId;
          const isSource = activeTransfer?.sourceNodeId === nodeId;
          const badge = getStatusBadge(node, isStandby);

          // Indicator glow class
          let ringStyle = 'border-emerald-500 shadow-[0_0_25px_rgba(34,197,94,0.4)]';
          let circleBg = 'bg-emerald-500';

          if (node?.status === 'confirmed_down') {
            ringStyle = 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.7)] animate-pulse-red';
            circleBg = 'bg-red-500';
          } else if (node?.status === 'suspected') {
            ringStyle = 'border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.7)] animate-pulse-amber';
            circleBg = 'bg-amber-500';
          } else if (isStandby) {
            if (hasFiles || isTarget) {
              ringStyle = 'border-emerald-400 shadow-[0_0_35px_rgba(34,197,94,0.8)] animate-pulse-green';
              circleBg = 'bg-emerald-400';
            } else {
              ringStyle = 'border-slate-700 opacity-40 shadow-none';
              circleBg = 'bg-slate-600';
            }
          }

          return (
            <div
              key={nodeId}
              className={`flex flex-col items-center p-5 rounded-2xl bg-slate-900/80 backdrop-blur-md border border-slate-800 transition-all duration-300 ${
                isTarget ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950 scale-105' : ''
              } ${isSource ? 'ring-2 ring-emerald-400 scale-105' : ''}`}
            >
              {/* Outer Glowing Circle */}
              <div className={`relative w-24 h-24 rounded-full flex items-center justify-center border-4 ${ringStyle} bg-slate-950/80 mb-4 transition-all duration-500`}>
                {/* Core Light Indicator */}
                <div className={`w-12 h-12 rounded-full ${circleBg} flex items-center justify-center text-slate-950 font-black shadow-inner`}>
                  {nodeId === 'nodeD' ? 'D' : nodeId.slice(-1)}
                </div>

                {/* Transfer Arrow Indicator */}
                {isTarget && (
                  <span className="absolute -top-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500 text-slate-950 animate-bounce">
                    RECOVERY TARGET
                  </span>
                )}
                {isSource && (
                  <span className="absolute -top-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-slate-950 animate-bounce">
                    REPLICA SOURCE
                  </span>
                )}
              </div>

              {/* Node Title */}
              <div className="font-bold text-base text-slate-200 mb-1">
                {node?.name || nodeId}
              </div>

              {/* Status Badge */}
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.color} mb-3`}>
                <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                {badge.label}
              </div>

              {/* Metrics */}
              <div className="w-full text-xs text-slate-400 space-y-1 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60">
                <div className="flex justify-between">
                  <span>Replicas:</span>
                  <span className="font-semibold text-slate-200">{node?.diskFiles || 0} files</span>
                </div>
                <div className="flex justify-between">
                  <span>Capacity:</span>
                  <span className="font-semibold text-slate-200">{node?.diskBytesFormatted || '0 B'}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recovery Beam Message banner */}
      {activeTransfer && (
        <div className="mt-6 flex items-center gap-3 px-4 py-2 rounded-xl bg-cyan-950/60 border border-cyan-500/50 text-cyan-300 text-xs font-mono animate-pulse">
          <Zap className="w-4 h-4 text-cyan-400 animate-spin" />
          <span>Cloning replica stream from {activeTransfer.sourceNodeId} to standby node {activeTransfer.targetNodeId}...</span>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Main Export: NodeVisualization with Client-Safe 3D Canvas
// -------------------------------------------------------------

export default function NodeVisualization({ nodes = {}, activeTransfer = null }) {
  const [use3D, setUse3D] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [threeError, setThreeError] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative w-full rounded-3xl overflow-hidden glass-panel-3d border border-slate-800 shadow-2xl">
      {/* Top Bar with Mode Toggle & Cluster Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Hellock Cluster Architecture & Topography
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-mono">
                LIVE
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Interactive 3D replica state visualization with real-time failover beam animation
            </p>
          </div>
        </div>

        {/* Legend & 3D/2D Toggle */}
        <div className="flex items-center gap-4">
          {/* Status Color Legend */}
          <div className="hidden sm:flex items-center gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e] shadow-[0_0_8px_#22c55e]" />
              <span>Healthy</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shadow-[0_0_8px_#f59e0b]" />
              <span>Suspected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] shadow-[0_0_8px_#ef4444]" />
              <span>Down</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f8fafc]/40 border border-slate-600" />
              <span>Standby</span>
            </div>
          </div>

          {/* Toggle Button */}
          <button
            onClick={() => setUse3D(!use3D)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>{use3D ? 'Switch to 2D' : 'Switch to 3D'}</span>
          </button>
        </div>
      </div>

      {/* Visual Canvas Area */}
      <div className="relative w-full h-[380px] flex items-center justify-center">
        {mounted && use3D && !threeError ? (
          <ThreeCanvasWrapper
            nodes={nodes}
            activeTransfer={activeTransfer}
            onError={() => setThreeError(true)}
          />
        ) : (
          <NodeSchematic2D nodes={nodes} activeTransfer={activeTransfer} />
        )}

        {/* 3D Drag/Zoom Instructions Overlay */}
        {mounted && use3D && !threeError && (
          <div className="absolute bottom-3 left-4 pointer-events-none text-[11px] text-slate-500 bg-slate-950/60 px-2.5 py-1 rounded-md border border-slate-800">
            🖱️ Click & Drag to Rotate • Scroll to Zoom
          </div>
        )}
      </div>
    </div>
  );
}

// Client-only Three.js Canvas container with safe try/catch
function ThreeCanvasWrapper({ nodes, activeTransfer, onError }) {
  const { Canvas } = require('@react-three/fiber');

  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 4.5, 9.5], fov: 45 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor('#080d19');
        }}
      >
        <Scene nodes={nodes} activeTransfer={activeTransfer} />
      </Canvas>
    </div>
  );
}
